# Combo Offer Backend — हिंदी सेटअप

1. `src/index.js` को पहले staging branch में लगाएँ; production source से diff review करें।
2. `db/migration/002_combo_offers.sql` केवल अलग staging D1 database पर एक बार चलाएँ।
3. Migration `orders.combo_id`, `combo_offers`, `combo_items` और `order_items` जोड़ती है। कोई existing table drop नहीं होती। Existing orders/products की rows सुरक्षित रहती हैं।
4. Production D1 पर चलाने से पहले current schema/version verify करें और production migration plan अलग से review करें।
5. Staging Worker में `CASHFREE_ENV=sandbox`, अलग D1 ID, अलग Worker URL, staging Frontend URL और अलग secrets रखें।
6. Combo coupons अभी supported नहीं हैं; existing single-book coupon flow unchanged है।
7. Test report में mocked end-to-end test coverage और real provider tests की limitations दर्ज हैं।
