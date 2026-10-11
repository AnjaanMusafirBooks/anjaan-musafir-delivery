import pathlib, re, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
class CouponManagerSourceTests(unittest.TestCase):
    def test_worker_import_and_route(self):
        s=(ROOT/'src/index.js').read_text()
        self.assertIn('from "./coupon-manager.js"', s)
        self.assertIn('/api/v2/admin/coupons', s)
        self.assertIn('handleCouponManager(request, env, url)', s)
    def test_permission_checks(self):
        s=(ROOT/'src/coupon-manager.js').read_text()
        self.assertIn('"coupons.read"', s); self.assertIn('"coupons.write"', s)
        self.assertIn('requireAdminPermission', s)
    def test_uses_existing_coupon_table(self):
        s=(ROOT/'src/coupon-manager.js').read_text()
        self.assertIn('FROM coupons', s); self.assertIn('INSERT INTO coupons', s); self.assertIn('UPDATE coupons SET', s)
    def test_validation(self):
        s=(ROOT/'src/coupon-manager.js').read_text()
        self.assertIn('discount_value > 100', s)
        self.assertIn('expires_at must be later than starts_at', s)
        self.assertIn('max_uses', s)
    def test_checkout_legacy_logic_preserved(self):
        s=(ROOT/'src/index.js').read_text()
        self.assertIn('async function handleCreateOrder', s)
        self.assertIn('100% coupon', s)
        self.assertIn('cashfree', s.lower())
if __name__=='__main__': unittest.main()
