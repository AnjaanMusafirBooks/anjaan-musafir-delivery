/*
 * Anjaan Musafir Books — New Version Batch 05
 * Shared security helpers for My Order + digital delivery.
 *
 * Candidate-only module. This file is NOT wired into src/index.js automatically.
 * Review the current Worker routes/schema before integration.
 */

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isSafeOrderId(value) {
  const id = String(value ?? "").trim();
  return id.length >= 6 &&
    id.length <= 100 &&
    /^[A-Za-z0-9_-]+$/.test(id);
}

export function isFutureTimestamp(value, nowMs = Date.now()) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

export function isDownloadLimitAvailable(downloadCount, downloadLimit) {
  const count = Number(downloadCount);
  const limit = Number(downloadLimit);
  return Number.isInteger(count) &&
    Number.isInteger(limit) &&
    count >= 0 &&
    limit > 0 &&
    count < limit;
}

/**
 * Generate a cryptographically random download token in a Worker runtime.
 * Store only the SHA-256 hash of this token in D1, never the raw token.
 */
export function createDownloadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Compare fixed-format secret strings without returning early on a character
 * mismatch. Callers must still validate the input format and length first.
 */
export function constantTimeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}
