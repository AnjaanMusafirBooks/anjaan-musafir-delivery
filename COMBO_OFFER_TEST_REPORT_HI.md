# Combo Offer — परीक्षण रिपोर्ट (12 अक्टूबर 2026)

## किए गए परीक्षण

### JavaScript syntax
- `app.js` — PASS
- `combo.js` — PASS
- `combo-config.js` — PASS
- `books.js` — PASS (unchanged reference syntax check)
- `admin.html` का inline JavaScript — PASS
- `my-order.html` का inline JavaScript — PASS
- Worker `src/index.js` — PASS

#### Admin price calculation — 4 checks PASS
- MRP/current price/normal discount/extra discount/total savings गणना।
- Combo Price वर्तमान कीमत से कम होने पर अतिरिक्त छूट।
- Combo Price वर्तमान कीमत के बराबर होने पर अतिरिक्त छूट नहीं।
- Combo Price अधिक होने या कोई किताब न चुने होने पर गलत छूट/बचत का दावा नहीं।

## D1 migration
- Original `db/schema.sql` के आधार पर test SQLite database बनाया गया।
- पहले से मौजूद product और paid order insert करके `002_combo_offers.sql` चलाया।
- Existing order status/price/product row सुरक्षित रहे और combo tables/column जुड़ गए — PASS.

### Mocked Worker integration — 22 checks PASS
1. खाली combo catalog.
2. Admin key के बिना combo API reject.
3. खाली combo reject.
4. Multi-book combo atomic save.
5. MRP/current price/extra discount गणना.
6. Browser द्वारा भेजी नकली combo price ignore; server price इस्तेमाल.
7. Payment status SUCCESS पर ठीक उतनी किताबों के download links जितनी combo में हैं.
8. Email payload में सभी किताबों के download links.
9. दोबारा payment-status call पर duplicate delivery email नहीं.
10. Authorized combo PDF download.
11. Combo में न शामिल किताब का download reject.
12. हर किताब की download limit लागू.
13. My Order से सभी combo books फिर से मिलती हैं.
14. Product offer price बदलने पर combo summary update.
15. Inactive product को नए combo में जोड़ना reject.
16. Pending payment पर download link नहीं मिलता.
17. Invalid Cashfree webhook signature reject.
18. Valid webhook payment confirm करता है; duplicate webhook email दोबारा नहीं भेजता.
19. Inactive combo storefront से हटता है और checkout reject होता है.
20. Existing single-book checkout का smoke test.
21. Existing single-book percentage coupon regression.
22. Existing 100% coupon free-order flow: Cashfree bypass और token/download URL.

## टेस्ट की सीमा — ईमानदार स्थिति

ये local tests Node.js + in-memory SQLite और mocked Cashfree/Brevo/PDF storage के साथ चलाए गए। कुल 26 checks पास हुए (22 Worker integration + 4 Admin calculation), साथ में syntax और migration-preservation checks भी पास हुए। यह वास्तविक Cashfree sandbox/production, Cloudflare D1/Workers runtime, वास्तविक GitHub Pages browser session, असली PDF storage या live email का प्रमाण नहीं है। Production deploy नहीं किया गया है।

## Live से पहले अनिवार्य staging checks

- वास्तविक staging Worker + अलग staging D1 + Cashfree sandbox.
- Single-book purchase regression और coupon regression.
- Combo में हर PDF, गलत book_id, expiry और download limits.
- Payment failure/pending/success और webhook signature.
- Mobile UI, admin edit/disable/reload, email links और My Order.
- Production code diff, migration review और user approval.
