from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "src" / "index.js").read_text(encoding="utf-8")


def test_authorization_and_bootstrap_headers_are_allowed():
    assert '"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bootstrap-Secret, x-admin-key, X-Checkout-Attempt-ID"' in SOURCE


def test_admin_auth_responses_receive_cors_headers():
    assert 'const authResponse = await handleAdminAuth(request, env, url);' in SOURCE
    assert 'for (const [name, value] of Object.entries(CORS_HEADERS))' in SOURCE
    assert 'return new Response(authResponse.body' in SOURCE
    assert 'authHeaders.set("Cache-Control", "no-store");' in SOURCE


def test_cashfree_and_legacy_routes_are_still_present():
    assert 'url.pathname.startsWith("/api/v2/admin/")' in SOURCE
    assert 'url.pathname.startsWith(\n          "/api/admin/"' in SOURCE
    assert 'webhook/cashfree' in SOURCE.lower()
    assert 'handleCatalog' in SOURCE
