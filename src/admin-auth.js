/* New Version admin authentication foundation.
 * Requires db/migration/002_new_version_admin_foundation.sql.
 * Session bearer tokens are returned only to a successful login/bootstrap caller;
 * only SHA-256 token hashes are persisted in D1.
 */
const ROLES = new Set([
  "FOUNDER", "ADMINISTRATOR", "OPERATIONS_MANAGER", "PRODUCT_MANAGER",
  "MARKETING_MANAGER", "CUSTOMER_SUPPORT", "CONTENT_EDITOR", "ANALYST",
  "TECHNICAL_SUPPORT"
]);
const SESSION_HOURS = 8;
const PBKDF2_ITERATIONS = 210000;
const encoder = new TextEncoder();

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}
function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(value) {
  const s = atob(value);
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
function randomBytes(length = 32) {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password, saltBytes = randomBytes(16)) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64(saltBytes)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterationsText, saltText, expectedText] = String(stored).split("$");
    if (algorithm !== "pbkdf2-sha256") return false;
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const salt = unb64(saltText);
    const expected = unb64(expectedText);
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8));
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}
function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}
function safeUser(row) {
  return { user_id: row.user_id, email: row.email, display_name: row.display_name, role: row.role, status: row.status, must_reset_password: !!row.must_reset_password, created_at: row.created_at, updated_at: row.updated_at, last_login_at: row.last_login_at };
}
function bearer(request) {
  const value = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(value);
  return match ? match[1] : "";
}
async function audit(db, actor, action, targetType, targetId, outcome, requestId, metadata = {}) {
  await db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, outcome, request_id, metadata_json)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(actor?.user_id || null, actor?.role || null, action, targetType || null, targetId || null, outcome, requestId || null, JSON.stringify(metadata).slice(0, 2000)).run();
}
async function securityEvent(db, userId, type, outcome, detailCode, requestId) {
  await db.prepare(`INSERT INTO admin_security_events (user_id, event_type, outcome, detail_code, request_id) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(userId || null, type, outcome, detailCode, requestId || null).run();
}
async function getSession(request, env) {
  const token = bearer(request);
  if (!token) return { error: json({ error: "Authentication required." }, 401) };
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT s.session_id, s.user_id, s.expires_at, s.revoked_at, u.email, u.display_name, u.role, u.status, u.must_reset_password
    FROM admin_sessions s JOIN admin_users u ON u.user_id=s.user_id WHERE s.token_hash=?1 LIMIT 1`).bind(tokenHash).first();
  if (!row || row.revoked_at || row.status !== "ACTIVE" || Date.parse(row.expires_at) <= Date.now()) {
    if (row?.session_id && !row.revoked_at) await env.DB.prepare("UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(row.session_id).run();
    return { error: json({ error: "Session is invalid or expired. Please log in again." }, 401) };
  }
  await env.DB.prepare("UPDATE admin_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(row.session_id).run();
  return { token, tokenHash, session: row, user: safeUser(row) };
}
async function hasPermission(db, role, permission) {
  if (role === "FOUNDER") return true;
  const row = await db.prepare("SELECT allowed FROM admin_role_permissions WHERE role=?1 AND permission_key=?2").bind(role, permission).first();
  if (row) return Number(row.allowed) === 1;
  const wildcard = await db.prepare("SELECT allowed FROM admin_role_permissions WHERE role=?1 AND permission_key='*'").bind(role).first();
  return !!wildcard && Number(wildcard.allowed) === 1;
}
async function createSession(db, user, requestId) {
  const token = b64(randomBytes(32)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const tokenHash = await sha256Hex(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)").bind(sessionId, user.user_id, tokenHash, expiresAt).run();
  await db.prepare("UPDATE admin_users SET last_login_at=CURRENT_TIMESTAMP, failed_login_count=0, locked_until=NULL WHERE user_id=?1").bind(user.user_id).run();
  await securityEvent(db, user.user_id, "LOGIN", "SUCCESS", "LOGIN_SUCCESS", requestId);
  await audit(db, user, "auth.login", "admin_user", user.user_id, "SUCCESS", requestId);
  return { token, expires_at: expiresAt };
}
async function parseBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 12000) return null;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return null;
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body;
  } catch { return null; }
}
async function bootstrap(request, env, requestId) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (!env.ADMIN_BOOTSTRAP_SECRET || env.ADMIN_BOOTSTRAP_SECRET.length < 32) return json({ error: "Founder bootstrap is not configured. Set ADMIN_BOOTSTRAP_SECRET as a Cloudflare secret." }, 503);
  const supplied = request.headers.get("X-Bootstrap-Secret") || "";
  if (supplied.length !== env.ADMIN_BOOTSTRAP_SECRET.length || !(await constantTimeString(supplied, env.ADMIN_BOOTSTRAP_SECRET))) {
    await securityEvent(env.DB, null, "FOUNDER_BOOTSTRAP", "DENIED", "INVALID_BOOTSTRAP_SECRET", requestId);
    return json({ error: "Bootstrap authorization failed." }, 403);
  }
  const body = await parseBody(request);
  if (!body || !validEmail(body.email) || !validPassword(body.password) || typeof body.display_name !== "string" || body.display_name.trim().length < 2 || body.display_name.trim().length > 100) {
    return json({ error: "Provide a valid email, display name, and password (12+ characters with uppercase, lowercase and a number)." }, 400);
  }
  const existing = await env.DB.prepare("SELECT user_id FROM admin_users WHERE role='FOUNDER' LIMIT 1").first();
  if (existing) {
    await securityEvent(env.DB, null, "FOUNDER_BOOTSTRAP", "DENIED", "FOUNDER_ALREADY_EXISTS", requestId);
    return json({ error: "Founder bootstrap has already been completed." }, 409);
  }
  const user = { user_id: crypto.randomUUID(), email: body.email.trim().toLowerCase(), display_name: body.display_name.trim(), role: "FOUNDER" };
  try {
    const hash = await passwordHash(body.password);
    await env.DB.prepare(`INSERT INTO admin_users (user_id, email, display_name, password_hash, role, status, password_changed_at)
      VALUES (?1, ?2, ?3, ?4, 'FOUNDER', 'ACTIVE', CURRENT_TIMESTAMP)`).bind(user.user_id, user.email, user.display_name, hash).run();
    await env.DB.prepare("INSERT OR IGNORE INTO admin_role_permissions (role, permission_key, allowed) VALUES ('FOUNDER', '*', 1)").run();
    await audit(env.DB, user, "auth.founder_bootstrap", "admin_user", user.user_id, "SUCCESS", requestId);
    const session = await createSession(env.DB, user, requestId);
    return json({ ok: true, user: safeUser({ ...user, status: "ACTIVE", must_reset_password: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_login_at: new Date().toISOString() }), session_token: session.token, expires_at: session.expires_at }, 201);
  } catch (error) {
    // Unique constraints close concurrent bootstrap races. Never return SQL details.
    return json({ error: "Founder bootstrap could not be completed. Check whether a Founder already exists and review server diagnostics." }, 409);
  }
}
async function constantTimeString(a, b) {
  const ah = await sha256Hex(a), bh = await sha256Hex(b);
  let diff = 0;
  for (let i = 0; i < ah.length; i++) diff |= ah.charCodeAt(i) ^ bh.charCodeAt(i);
  return diff === 0;
}
async function login(request, env, requestId) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  const body = await parseBody(request);
  if (!body || !validEmail(body.email) || typeof body.password !== "string" || body.password.length > 128) return json({ error: "Enter a valid email and password." }, 400);
  const email = body.email.trim().toLowerCase();
  const user = await env.DB.prepare("SELECT * FROM admin_users WHERE email=?1 LIMIT 1").bind(email).first();
  if (!user) {
    await securityEvent(env.DB, null, "LOGIN", "DENIED", "INVALID_CREDENTIALS", requestId);
    return json({ error: "Email or password is incorrect." }, 401);
  }
  if (user.status !== "ACTIVE" || (user.locked_until && Date.parse(user.locked_until) > Date.now())) return json({ error: "This account is unavailable. Contact the Founder or try again later." }, 423);
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    const count = Number(user.failed_login_count || 0) + 1;
    const lockedUntil = count >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await env.DB.prepare("UPDATE admin_users SET failed_login_count=?2, locked_until=?3, updated_at=CURRENT_TIMESTAMP WHERE user_id=?1").bind(user.user_id, count, lockedUntil).run();
    await securityEvent(env.DB, user.user_id, "LOGIN", "DENIED", "INVALID_CREDENTIALS", requestId);
    await audit(env.DB, safeUser(user), "auth.login", "admin_user", user.user_id, "DENIED", requestId);
    return json({ error: count >= 5 ? "Too many failed attempts. Account temporarily locked for 15 minutes." : "Email or password is incorrect." }, 401);
  }
  if (user.role !== "FOUNDER" && !ROLES.has(user.role)) return json({ error: "Account role is invalid. Contact the Founder." }, 403);
  const session = await createSession(env.DB, user, requestId);
  return json({ ok: true, user: safeUser(user), session_token: session.token, expires_at: session.expires_at });
}
async function manageStaff(request, env, auth, requestId, path) {
  if (auth.user.role !== "FOUNDER") return json({ error: "Only the Founder can manage staff accounts and permissions." }, 403);
  if (path === "/api/v2/admin/staff" && request.method === "GET") {
    const rows = (await env.DB.prepare("SELECT user_id,email,display_name,role,status,must_reset_password,created_at,updated_at,last_login_at FROM admin_users ORDER BY created_at DESC LIMIT 200").all()).results || [];
    return json({ items: rows });
  }
  if (path === "/api/v2/admin/staff" && request.method === "POST") {
    const body = await parseBody(request);
    if (!body || !validEmail(body.email) || !validPassword(body.password) || typeof body.display_name !== "string" || body.display_name.trim().length < 2 || body.display_name.trim().length > 100 || !ROLES.has(body.role) || body.role === "FOUNDER") return json({ error: "Provide valid staff details, a non-Founder role and a strong password." }, 400);
    const userId = crypto.randomUUID();
    try {
      const hash = await passwordHash(body.password);
      await env.DB.prepare("INSERT INTO admin_users (user_id,email,display_name,password_hash,role,status,must_reset_password,password_changed_at) VALUES (?1,?2,?3,?4,?5,'ACTIVE',1,CURRENT_TIMESTAMP)").bind(userId, body.email.trim().toLowerCase(), body.display_name.trim(), hash, body.role).run();
      await audit(env.DB, auth.user, "staff.create", "admin_user", userId, "SUCCESS", requestId, { role: body.role });
      return json({ ok: true, user: { user_id: userId, email: body.email.trim().toLowerCase(), display_name: body.display_name.trim(), role: body.role, status: "ACTIVE", must_reset_password: true } }, 201);
    } catch { return json({ error: "Staff account could not be created. The email may already be in use." }, 409); }
  }
  const match = /^\/api\/v2\/admin\/staff\/([0-9a-f-]{36})\/(disable|enable)$/.exec(path);
  if (match && request.method === "POST") {
    if (match[1] === auth.user.user_id) return json({ error: "You cannot disable your own account." }, 400);
    const status = match[2] === "disable" ? "DISABLED" : "ACTIVE";
    const result = await env.DB.prepare("UPDATE admin_users SET status=?2, updated_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND role!='FOUNDER'").bind(match[1], status).run();
    if (!result.meta?.changes) return json({ error: "Staff account not found." }, 404);
    if (status === "DISABLED") await env.DB.prepare("UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND revoked_at IS NULL").bind(match[1]).run();
    await audit(env.DB, auth.user, `staff.${status.toLowerCase()}`, "admin_user", match[1], "SUCCESS", requestId);
    return json({ ok: true, user_id: match[1], status });
  }
  if (path === "/api/v2/admin/role-permissions" && request.method === "GET") {
    const rows = (await env.DB.prepare("SELECT role,permission_key,allowed,updated_at FROM admin_role_permissions ORDER BY role,permission_key").all()).results || [];
    return json({ items: rows });
  }
  if (path === "/api/v2/admin/role-permissions" && request.method === "POST") {
    const body = await parseBody(request);
    if (!body || !ROLES.has(body.role) || body.role === "FOUNDER" || typeof body.permission_key !== "string" || !/^[a-z][a-z0-9_.-]{1,79}$/.test(body.permission_key) || ![0,1,true,false].includes(body.allowed)) return json({ error: "Invalid role permission payload." }, 400);
    await env.DB.prepare("INSERT INTO admin_role_permissions (role,permission_key,allowed,updated_at) VALUES (?1,?2,?3,CURRENT_TIMESTAMP) ON CONFLICT(role,permission_key) DO UPDATE SET allowed=excluded.allowed,updated_at=CURRENT_TIMESTAMP").bind(body.role, body.permission_key, body.allowed === true || body.allowed === 1 ? 1 : 0).run();
    await audit(env.DB, auth.user, "role_permission.update", "role_permission", `${body.role}:${body.permission_key}`, "SUCCESS", requestId, { allowed: !!body.allowed });
    return json({ ok: true, role: body.role, permission_key: body.permission_key, allowed: !!body.allowed });
  }
  return json({ error: "Not found." }, 404);
}
export async function handleAdminAuth(request, env, url) {
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  const path = url.pathname;
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  try {
    if (path === "/api/v2/admin/bootstrap") return await bootstrap(request, env, requestId);
    if (path === "/api/v2/admin/login") return await login(request, env, requestId);
    if (path === "/api/v2/admin/logout") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
      const auth = await getSession(request, env);
      if (auth.error) return auth.error;
      await env.DB.prepare("UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(auth.session.session_id).run();
      await securityEvent(env.DB, auth.user.user_id, "LOGOUT", "SUCCESS", "LOGOUT_SUCCESS", requestId);
      await audit(env.DB, auth.user, "auth.logout", "admin_session", auth.session.session_id, "SUCCESS", requestId);
      return json({ ok: true });
    }
    const auth = await getSession(request, env);
    if (auth.error) return auth.error;
    if (path === "/api/v2/admin/me" && request.method === "GET") return json({ ok: true, user: auth.user, expires_at: auth.session.expires_at });
    if (path.startsWith("/api/v2/admin/staff") || path === "/api/v2/admin/role-permissions") return await manageStaff(request, env, auth, requestId, path);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    // Diagnostic details stay in platform logs; never return stack/SQL/secrets to the caller.
    console.error("admin_auth_internal_error", { requestId, path, message: String(error?.message || "unknown").slice(0, 180) });
    return json({ error: "A server error occurred. Reference: " + requestId }, 500);
  }
}
export async function requireAdminPermission(request, env, permission) {
  const auth = await getSession(request, env);
  if (auth.error) return { ok: false, response: auth.error };
  const allowed = await hasPermission(env.DB, auth.user.role, permission);
  if (!allowed) {
    const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
    await securityEvent(env.DB, auth.user.user_id, "PERMISSION_CHECK", "DENIED", "PERMISSION_DENIED", requestId);
    await audit(env.DB, auth.user, "permission.denied", "permission", permission, "DENIED", requestId);
    return { ok: false, response: json({ error: "You do not have permission to perform this action." }, 403) };
  }
  return { ok: true, user: auth.user, session: auth.session };
}
