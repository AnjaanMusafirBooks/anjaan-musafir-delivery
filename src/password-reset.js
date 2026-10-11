/* Secure New Version admin account recovery. Does not reveal whether an email
 * exists; raw reset tokens are emailed once and only their SHA-256 hashes persist. */
import { hashPasswordForReset } from "./admin-auth.js";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const enc = new TextEncoder();
const normEmail = v => String(v ?? "").trim().toLowerCase().slice(0, 254);
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(v));
async function sha256(value) {
  const out = await crypto.subtle.digest("SHA-256", enc.encode(String(value)));
  return [...new Uint8Array(out)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function audit(db, user, action, outcome, targetId = null) {
  try { await db.prepare(`INSERT INTO admin_audit_log(actor_user_id,actor_role,action,target_type,target_id,outcome,metadata_json)
    VALUES (?1,?2,?3,'admin_user',?4,?5,'{}')`).bind(user?.user_id || null, user?.role || null, action, targetId, outcome).run(); } catch {}
}
async function recordRequest(db, emailHash, outcome) {
  try { await db.prepare("INSERT INTO nv_password_reset_requests(email_hash,outcome) VALUES (?1,?2)").bind(emailHash, outcome).run(); } catch {}
}
async function sendResetEmail(env, user, token) {
  if (!env.BREVO_API_KEY || !env.FRONTEND_URL || !/^https:\/\//i.test(env.FRONTEND_URL)) return { ok: false, code: "RESET_EMAIL_NOT_CONFIGURED" };
  const base = env.FRONTEND_URL.replace(/\/+$/, "");
  const link = `${base}/reset-password.html#token=${encodeURIComponent(token)}`;
  const senderEmail = env.BREVO_SENDER || "officialsuperswagg@gmail.com";
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        sender: { name: "Anjaan Musafir Books", email: senderEmail },
        to: [{ email: user.email, name: user.display_name }],
        subject: "Reset your Anjaan Musafir Books admin password",
        htmlContent: `<p>Hello ${String(user.display_name).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))},</p><p>A password reset was requested for your admin account.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes and can be used once. If you did not request this, ignore this email.</p>`
      })
    });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) return { ok: false, code: `BREVO_HTTP_${response.status}` };
    return { ok: true, messageId: typeof data.messageId === "string" ? data.messageId.slice(0, 200) : null, status: response.status };
  } catch { return { ok: false, code: "BREVO_REQUEST_ERROR" }; }
}
async function requestReset(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body; try { body = await request.json(); } catch { body = {}; }
  const email = normEmail(body?.email);
  if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  const emailHash = await sha256(email);
  const generic = { ok: true, message: "If an active account matches this email and email delivery is configured, a reset link will arrive shortly." };
  try {
    const recent = await env.DB.prepare(`SELECT COUNT(*) AS total FROM nv_password_reset_requests
      WHERE email_hash=?1 AND created_at >= datetime('now','-1 hour')`).bind(emailHash).first();
    if (Number(recent?.total || 0) >= 5) {
      await recordRequest(env.DB, emailHash, "SKIPPED");
      return json(generic, 202);
    }
    await recordRequest(env.DB, emailHash, "REQUESTED");
    const user = await env.DB.prepare(`SELECT user_id,email,display_name,role,status FROM admin_users WHERE email=?1 LIMIT 1`).bind(email).first();
    if (!user || user.status !== "ACTIVE") return json(generic, 202);
    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await env.DB.prepare(`UPDATE nv_password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND used_at IS NULL`).bind(user.user_id).run();
    await env.DB.prepare(`INSERT INTO nv_password_reset_tokens(token_id,user_id,token_hash,expires_at) VALUES (?1,?2,?3,?4)`)
      .bind(crypto.randomUUID(), user.user_id, tokenHash, expiresAt).run();
    const result = await sendResetEmail(env, user, token);
    await recordRequest(env.DB, emailHash, result.ok ? "SENT" : "FAILED");
    try { await env.DB.prepare(`INSERT INTO nv_email_events(order_id,recipient_email,event_type,provider,status,http_status,provider_message_id,error_code)
      VALUES (NULL,?1,'ADMIN_PASSWORD_RESET','BREVO',?2,?3,?4,?5)`)
      .bind(user.email, result.ok ? "ACCEPTED" : "FAILED", result.status || null, result.messageId || null, result.code || null).run(); } catch {}
    await audit(env.DB, user, "auth.password_reset_request", result.ok ? "SUCCESS" : "FAILURE", user.user_id);
    return json(generic, 202);
  } catch {
    await recordRequest(env.DB, emailHash, "FAILED");
    return json(generic, 202);
  }
}
async function confirmReset(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body; try { body = await request.json(); } catch { return json({ error: "Invalid reset request." }, 400); }
  const token = String(body?.token ?? "").trim();
  const password = body?.password;
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Reset link is invalid or expired. Request a new one." }, 400);
  if (typeof password !== "string" || password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return json({ error: "Use at least 12 characters with uppercase, lowercase and a number." }, 400);
  }
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT t.token_id,t.user_id,t.expires_at,t.used_at,u.email,u.status,u.role
    FROM nv_password_reset_tokens t JOIN admin_users u ON u.user_id=t.user_id
    WHERE t.token_hash=?1 LIMIT 1`).bind(tokenHash).first();
  if (!row || row.used_at || row.status !== "ACTIVE" || Date.parse(row.expires_at) <= Date.now()) {
    return json({ error: "Reset link is invalid or expired. Request a new one." }, 400);
  }
  let passwordHash;
  try { passwordHash = await hashPasswordForReset(password); } catch { return json({ error: "Password does not meet the required policy." }, 400); }
  const claim = await env.DB.prepare(`UPDATE nv_password_reset_tokens SET used_at=CURRENT_TIMESTAMP
    WHERE token_id=?1 AND used_at IS NULL AND julianday(expires_at) > julianday('now')`).bind(row.token_id).run();
  if (Number(claim?.meta?.changes || 0) !== 1) return json({ error: "Reset link is invalid or already used. Request a new one." }, 400);
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE admin_users SET password_hash=?2,must_reset_password=0,failed_login_count=0,
        locked_until=NULL,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND status='ACTIVE'`).bind(row.user_id, passwordHash),
      env.DB.prepare(`UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND revoked_at IS NULL`).bind(row.user_id),
    ]);
    await recordRequest(env.DB, await sha256(row.email), "COMPLETED");
    await audit(env.DB, { user_id: row.user_id, role: row.role }, "auth.password_reset_complete", "SUCCESS", row.user_id);
    return json({ ok: true, message: "Password changed. Please sign in with your new password." });
  } catch {
    return json({ error: "Password could not be changed. Request a new reset link." }, 503);
  }
}
export async function handlePasswordReset(request, env, url) {
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  if (url.pathname === "/api/v2/admin/password-reset/request") return requestReset(request, env);
  if (url.pathname === "/api/v2/admin/password-reset/confirm") return confirmReset(request, env);
  return json({ error: "Not found." }, 404);
}
