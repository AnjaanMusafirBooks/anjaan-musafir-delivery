BACKEND ZIP — Anjaan Musafir Books Combo Offer

1) पहले COMBO_OFFER_MIGRATION_README_HI.md और COMBO_OFFER_TEST_REPORT_HI.md पढ़ें।
2) src/index.js को पहले staging branch में लगाएं और current Worker से diff review करें।
3) db/migration/002_combo_offers.sql को अलग staging D1 पर केवल एक बार चलाएं। Production D1 पर अभी न चलाएं।
4) wrangler.staging.example.jsonc में सभी REPLACE_WITH placeholders बदलें; फिर इसे wrangler.staging.jsonc नाम दें। इसे सीधे deploy न करें।
5) Cashfree sandbox credentials और अलग ADMIN_KEY को Wrangler secrets के रूप में सेट करें; GitHub में secrets न रखें।
6) Local mock integration में 26 checks PASS हुए। Real Cloudflare/Cashfree/R2/email test और production deployment नहीं हुए।
