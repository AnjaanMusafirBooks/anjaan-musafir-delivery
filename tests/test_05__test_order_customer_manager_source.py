from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = (ROOT / "src" / "order-customer-manager.js").read_text()
INDEX = (ROOT / "src" / "index.js").read_text()


def test_orders_are_read_only_and_permission_protected():
    assert '"orders.read"' in MODULE
    assert 'FROM orders' in MODULE
    assert 'request.method !== "GET"' in MODULE
    assert 'UPDATE orders' not in MODULE
    assert 'DELETE FROM orders' not in MODULE


def test_customers_api_uses_permission_and_existing_orders_schema():
    assert '"customers.read"' in MODULE
    assert 'GROUP BY LOWER(customer_email)' in MODULE
    for field in ("customer_email", "customer_phone", "customer_name", "payment_status", "final_price"):
        assert field in MODULE


def test_routes_and_cors_are_connected():
    assert 'import { handleAdminOrderCustomer } from "./order-customer-manager.js";' in INDEX
    assert 'handleAdminOrderCustomer(request, env, url)' in INDEX
    assert 'url.pathname.startsWith("/api/v2/admin/orders")' in INDEX
    assert 'url.pathname.startsWith("/api/v2/admin/customers")' in INDEX
    assert 'Access-Control-Allow-Headers": "Content-Type, Authorization' in INDEX
