/* Candidate-only encrypted backup/export and merge restore.
 * Restore is deliberately disabled unless APP_ENV is exactly 'staging'. */
import { requireAdminPermission, getAdminSession } from "./admin-auth.js";
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});
const TABLES = [
  "products", "offers", "coupons", "coupon_reservations", "orders", "order_discounts", "downloads", "site_content",
  "admin_users", "admin_role_permissions", "admin_audit_log", "admin_security_events",
  "nv_products", "nv_product_file_history", "nv_product_price_history", "nv_coupons", "nv_orders", "nv_order_lookup_attempts",
  "nv_download_tokens", "nv_email_events", "nv_purchase_requests", "nv_password_reset_requests", "nv_system_settings", "nv_checkout_events"
];
const MAX_ROWS_PER_TABLE = 5000;
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const enc = new TextEncoder();
const dec = new TextDecoder();
function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function unb64(value) { const s = atob(value); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function aesKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("BACKUP_ENCRYPTION_KEY must be configured as a high-entropy secret of at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function tableExists(db, table) {
  return !!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1").bind(table).first());
}
async function tableInfo(db, table) {
  return (await db.prepare(`PRAGMA table_info(${table})`).all()).results || [];
}
async function audit(db, user, action, outcome, metadata = {}) {
  try { await db.prepare(`INSERT INTO admin_audit_log(actor_user_id,actor_role,action,target_type,target_id,outcome,metadata_json)
    VALUES (?1,?2,?3,'database_backup',NULL,?4,?5)`)
    .bind(user?.user_id || null, user?.role || null, action, outcome, JSON.stringify(metadata).slice(0, 1500)).run(); } catch {}
}
async function settingValue(db, key, fallback = "") {
  const row = await db.prepare("SELECT setting_value FROM nv_system_settings WHERE setting_key=?1 LIMIT 1").bind(key).first();
  return row?.setting_value ?? fallback;
}
async function setSetting(db, key, value, user) {
  await db.prepare(`INSERT INTO nv_system_settings(setting_key,setting_value,updated_by,updated_at)
    VALUES (?1,?2,?3,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET
    setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(key, String(value), user?.user_id || null).run();
}
function isMaintenanceControlPath(path) {
  return ["/api/v2/admin/maintenance/owner-control/lock", "/api/v2/admin/maintenance/owner-control/unlock", "/api/v2/admin/maintenance/mode"].includes(path);
}
export async function checkMaintenanceGate(request, env, url) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  if (!url.pathname.startsWith("/api/v2/admin/") && !url.pathname.startsWith("/api/v2/admin/purchase-requests")) return null;
  if (["/api/v2/admin/login", "/api/v2/admin/bootstrap", "/api/v2/admin/logout", "/api/v2/admin/password-reset/request", "/api/v2/admin/password-reset/confirm"].includes(url.pathname)) return null;
  if (isMaintenanceControlPath(url.pathname)) return null;
  const auth = await getAdminSession(request, env);
  if (auth.error) return null; // The endpoint's own auth handler will return the proper auth error.
  try {
    if (!(await tableExists(env.DB, "nv_system_settings"))) return json({ error: "Maintenance settings migration is missing. Write action was blocked for safety." }, 503);
    const lockedValue = await settingValue(env.DB, "owner_control_locked", "MISSING");
    const safeModeValue = await settingValue(env.DB, "maintenance_mode", "MISSING");
    if (!["0", "1"].includes(lockedValue) || !["0", "1"].includes(safeModeValue)) return json({ error: "Maintenance settings are incomplete. Write action was blocked for safety." }, 503);
    const locked = lockedValue === "1", safeMode = safeModeValue === "1";
    if (locked) return json({ error: "Owner Control Lock is enabled. Only the Founder can unlock it." }, 423);
    if (safeMode) return json({ error: "Maintenance/Safe Mode is enabled. Write actions are temporarily paused." }, 423);
  } catch { return json({ error: "Maintenance state could not be verified. Write action was blocked for safety." }, 503); }
  return null;
}

async function encryptPayload(env, payload) {
  const key = await aesKey(env.BACKUP_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload)));
  return { format: "nm-encrypted-backup-v1", algorithm: "AES-256-GCM", iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) };
}
async function decryptPayload(env, envelope) {
  if (!envelope || envelope.format !== "nm-encrypted-backup-v1" || envelope.algorithm !== "AES-256-GCM" || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") throw new Error("Unsupported or malformed backup envelope.");
  const iv = unb64(envelope.iv), ciphertext = unb64(envelope.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_BACKUP_BYTES) throw new Error("Backup envelope size or IV is invalid.");
  const key = await aesKey(env.BACKUP_ENCRYPTION_KEY);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const payload = JSON.parse(dec.decode(plaintext));
  if (payload?.format !== "nm-backup-payload-v1" || !payload.tables || typeof payload.tables !== "object") throw new Error("Backup payload is not supported.");
  return payload;
}
async function exportBackup(request, env) {
  const auth = await requireAdminPermission(request, env, "backup.export");
  if (!auth.ok) return auth.response;
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  try {
    const tables = {};
    const counts = {};
    for (const table of TABLES) {
      if (!(await tableExists(env.DB, table))) continue;
      const rows = await env.DB.prepare(`SELECT * FROM ${table} LIMIT ${MAX_ROWS_PER_TABLE + 1}`).all();
      if ((rows.results || []).length > MAX_ROWS_PER_TABLE) return json({ error: `Backup stopped: ${table} exceeds the ${MAX_ROWS_PER_TABLE}-row safety cap. Use a controlled database export procedure.` }, 413);
      tables[table] = rows.results || [];
      counts[table] = tables[table].length;
    }
    const payload = { format: "nm-backup-payload-v1", schema_version: 1, created_at: new Date().toISOString(), source_env: String(env.APP_ENV || "unspecified"), tables, counts,
      note: "Database records and file keys only. R2 PDF objects themselves are not included; back up the private R2 bucket separately." };
    const envelope = await encryptPayload(env, payload);
    const body = JSON.stringify(envelope);
    if (enc.encode(body).length > MAX_BACKUP_BYTES) return json({ error: "Encrypted backup exceeds the 8 MB response limit. Use a controlled larger export process." }, 413);
    await setSetting(env.DB, "last_encrypted_backup_at", new Date().toISOString(), auth.user);
    await setSetting(env.DB, "last_encrypted_backup_by", String(auth.user?.user_id || "unknown"), auth.user);
    await audit(env.DB, auth.user, "backup.export", "SUCCESS", { table_count: Object.keys(tables).length, row_count: Object.values(counts).reduce((a, b) => a + b, 0) });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="anjaan-musafir-encrypted-backup-${new Date().toISOString().slice(0,10)}.json"`, "Cache-Control": "no-store", "X-Backup-Encrypted": "AES-256-GCM" } });
  } catch (error) {
    await audit(env.DB, auth.user, "backup.export", "FAILURE");
    const message = String(error?.message || "");
    return json({ error: message.includes("BACKUP_ENCRYPTION_KEY") ? message : "Encrypted backup could not be created. Check configuration and database availability." }, 503);
  }
}
async function restoreBackup(request, env) {
  const auth = await requireAdminPermission(request, env, "backup.restore");
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (env.APP_ENV !== "staging") return json({ error: "Restore is disabled unless APP_ENV is exactly 'staging'." }, 403);
  let body; try { body = await request.json(); } catch { return json({ error: "Invalid restore request." }, 400); }
  if (body?.confirmation !== "RESTORE STAGING DATABASE") return json({ error: "Exact confirmation phrase is required." }, 400);
  let payload;
  try { payload = await decryptPayload(env, body.envelope); }
  catch (error) { const message = String(error?.message || ""); return json({ error: message.includes("BACKUP_ENCRYPTION_KEY") ? message : "Backup could not be decrypted or failed validation." }, 400); }
  const unknownTables = Object.keys(payload.tables).filter(t => !TABLES.includes(t));
  if (unknownTables.length) return json({ error: "Backup contains unsupported tables; no restore was started." }, 400);
  const report = { merged: {}, skipped: {} };
  const schemaCache = {};
  // Preflight every included table/row before the first write so a malformed or
  // incompatible backup cannot cause a preventable partial merge.
  try {
    for (const table of TABLES) {
      const rows = payload.tables[table];
      if (rows === undefined) continue;
      if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_TABLE) return json({ error: `Backup row structure or size is invalid for ${table}; no restore was started.` }, 400);
      if (!(await tableExists(env.DB, table))) { report.skipped[table] = "table_missing"; continue; }
      const info = await tableInfo(env.DB, table);
      const columns = info.map(c => c.name);
      const pk = info.filter(c => Number(c.pk) > 0).sort((a,b) => Number(a.pk)-Number(b.pk)).map(c => c.name);
      if (!columns.length || !pk.length) { report.skipped[table] = "no_schema_or_primary_key"; continue; }
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(k => !columns.includes(k))) return json({ error: `Backup schema mismatch in ${table}; no restore was started.` }, 400);
        const keys = columns.filter(k => Object.prototype.hasOwnProperty.call(row, k));
        if (!keys.length || pk.some(k => !keys.includes(k))) return json({ error: `Backup primary key missing in ${table}; no restore was started.` }, 400);
      }
      schemaCache[table] = { columns, pk };
    }
  } catch {
    return json({ error: "Backup schema preflight failed; no restore was started." }, 400);
  }
  try {
    for (const table of TABLES) {
      const rows = payload.tables[table];
      if (rows === undefined || !schemaCache[table]) continue;
      const { columns, pk } = schemaCache[table];
      const stmts = [];
      for (const row of rows) {
        const keys = columns.filter(k => Object.prototype.hasOwnProperty.call(row, k));
        const placeholders = keys.map((_, i) => `?${i + 1}`).join(",");
        const updates = keys.filter(k => !pk.includes(k));
        const conflict = updates.length ? `DO UPDATE SET ${updates.map(k => `${k}=excluded.${k}`).join(",")}` : "DO NOTHING";
        stmts.push(env.DB.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders}) ON CONFLICT(${pk.join(",")}) ${conflict}`).bind(...keys.map(k => row[k] ?? null)));
      }
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
      report.merged[table] = rows.length;
    }
    // Never restore sessions or reset tokens. Invalidate any sessions/tokens already present in the target.
    if (await tableExists(env.DB, "admin_sessions")) await env.DB.prepare("UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE revoked_at IS NULL").run();
    if (await tableExists(env.DB, "nv_password_reset_tokens")) await env.DB.prepare("UPDATE nv_password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE used_at IS NULL").run();
    await audit(env.DB, auth.user, "backup.restore.merge", "SUCCESS", { source_env: String(payload.source_env || "unknown"), merged_tables: Object.keys(report.merged).length });
    return json({ ok: true, mode: "MERGE_ONLY", source_created_at: payload.created_at || null, report,
      warning: "Restore merges rows and does not delete target-only records. Sessions/reset tokens are not imported and target sessions are revoked. R2 PDF objects themselves must be backed up separately." });
  } catch (error) {
    await audit(env.DB, auth.user, "backup.restore.merge", "FAILURE", { merged_tables: Object.keys(report.merged).length });
    return json({ error: "Restore stopped after a partial merge. Do not use the environment until the report is reviewed; restore is not atomic across batches.", report }, 503);
  }
}
export async function handleAdminMaintenance(request, env, url) {
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  const path = url.pathname;
  if (path === "/api/v2/admin/maintenance/state" && request.method === "GET") {
    const auth = await requireAdminPermission(request, env, "maintenance.read");
    if (!auth.ok) return auth.response;
    if (!(await tableExists(env.DB, "nv_system_settings"))) return json({ configured: false, error: "Migration 012 is not installed." }, 503);
    const [locked, safeMode, retention] = await Promise.all([
      settingValue(env.DB, "owner_control_locked", "0"),
      settingValue(env.DB, "maintenance_mode", "0"),
      settingValue(env.DB, "technical_log_retention_days", "90")
    ]);
    return json({ configured: true, owner_control_locked: locked === "1", maintenance_mode: safeMode === "1", technical_log_retention_days: retention === "0" ? "ALWAYS" : Number(retention), restore_allowed: env.APP_ENV === "staging" });
  }
  if (["/api/v2/admin/maintenance/owner-control/lock", "/api/v2/admin/maintenance/owner-control/unlock", "/api/v2/admin/maintenance/mode"].includes(path)) {
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const auth = await requireAdminPermission(request, env, "maintenance.control");
    if (!auth.ok) return auth.response;
    let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    if (!(await tableExists(env.DB, "nv_system_settings"))) return json({ error: "Migration 012 is not installed." }, 503);
    if (path.endsWith("/owner-control/lock")) {
      if (body?.confirmation !== "LOCK OWNER CONTROL") return json({ error: "Exact confirmation phrase is required." }, 400);
      await setSetting(env.DB, "owner_control_locked", "1", auth.user);
      await audit(env.DB, auth.user, "maintenance.owner_lock", "SUCCESS");
      return json({ ok: true, owner_control_locked: true, message: "Owner Control Lock enabled. Use the dedicated Founder unlock action to resume writes." });
    }
    if (path.endsWith("/owner-control/unlock")) {
      if (body?.confirmation !== "UNLOCK OWNER CONTROL") return json({ error: "Exact confirmation phrase is required." }, 400);
      await setSetting(env.DB, "owner_control_locked", "0", auth.user);
      await audit(env.DB, auth.user, "maintenance.owner_unlock", "SUCCESS");
      return json({ ok: true, owner_control_locked: false });
    }
    if (body?.confirmation !== "UPDATE MAINTENANCE MODE" || typeof body?.enabled !== "boolean") return json({ error: "Provide enabled true/false and exact confirmation phrase." }, 400);
    await setSetting(env.DB, "maintenance_mode", body.enabled ? "1" : "0", auth.user);
    await audit(env.DB, auth.user, body.enabled ? "maintenance.safe_mode_enable" : "maintenance.safe_mode_disable", "SUCCESS", { enabled: body.enabled });
    return json({ ok: true, maintenance_mode: body.enabled });
  }
  if (path === "/api/v2/admin/maintenance/retention" && request.method === "POST") {
    const auth = await requireAdminPermission(request, env, "maintenance.control");
    if (!auth.ok) return auth.response;
    let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const days = body?.days === "ALWAYS" ? 0 : Number(body?.days);
    if (![0,7,30,60,90,180,365].includes(days)) return json({ error: "Retention must be ALWAYS or one of 7, 30, 60, 90, 180, 365 days." }, 400);
    await setSetting(env.DB, "technical_log_retention_days", String(days), auth.user);
    await audit(env.DB, auth.user, "maintenance.retention_update", "SUCCESS", { days: days === 0 ? "ALWAYS" : days });
    return json({ ok: true, technical_log_retention_days: days === 0 ? "ALWAYS" : days });
  }
  if (path === "/api/v2/admin/maintenance/retention/apply" && request.method === "POST") {
    const auth = await requireAdminPermission(request, env, "maintenance.control");
    if (!auth.ok) return auth.response;
    let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    if (body?.confirmation !== "DELETE EXPIRED TECHNICAL LOGS") return json({ error: "Exact confirmation phrase is required." }, 400);
    const backupAt = await settingValue(env.DB, "last_encrypted_backup_at", "");
    const backupAgeMs = Date.now() - Date.parse(backupAt);
    if (!backupAt || !Number.isFinite(backupAgeMs) || backupAgeMs < 0 || backupAgeMs > 30 * 60 * 1000) {
      return json({ error: "Destructive cleanup is blocked: create a fresh encrypted database backup first. A successful backup export from the last 30 minutes is required." }, 409);
    }
    const days = Number(await settingValue(env.DB, "technical_log_retention_days", "90"));
    if (!Number.isFinite(days) || days === 0) return json({ ok: true, deleted: {}, message: "Retention is set to ALWAYS; no logs were deleted." });
    const modifier = `-${days} days`, deleted = {};
    for (const table of ["admin_audit_log", "admin_security_events", "nv_email_events", "nv_password_reset_requests"]) {
      if (!(await tableExists(env.DB, table))) continue;
      const result = await env.DB.prepare(`DELETE FROM ${table} WHERE created_at < datetime('now', ?1)`).bind(modifier).run();
      deleted[table] = Number(result?.meta?.changes || 0);
    }
    if (await tableExists(env.DB, "nv_password_reset_tokens")) {
      const result = await env.DB.prepare("DELETE FROM nv_password_reset_tokens WHERE julianday(expires_at) < julianday('now') OR used_at IS NOT NULL").run();
      deleted.nv_password_reset_tokens = Number(result?.meta?.changes || 0);
    }
    await audit(env.DB, auth.user, "maintenance.retention_apply", "SUCCESS", { days, deleted });
    return json({ ok: true, retention_days: days, deleted, warning: "Orders, products, coupons, purchase requests and download records were not deleted. Review applicable legal/accounting retention requirements before enabling cleanup." });
  }
  if (path === "/api/v2/admin/maintenance/backup/export") return exportBackup(request, env);
  if (path === "/api/v2/admin/maintenance/backup/restore") return restoreBackup(request, env);
  return json({ error: "Not found." }, 404);
}
