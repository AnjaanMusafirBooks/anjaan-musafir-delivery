# Anjaan Musafir Books — Basic Version handoff (Hindi)

## बहुत जरूरी सुरक्षा
- ये ZIP केवल Basic Version candidate/testing के लिए हैं। कोई deployment नहीं किया गया है।
- Production `main`, live Worker `anjaan-musafir-delivery`, production D1, production R2 और production secrets को न बदलें।
- Frontend repository: `official`; backend repository: `anjaan-musafir-delivery`।
- Candidate branch: `basic-version` (यदि आपके GitHub में यह branch मौजूद है)।
- Frontend config में `API_BASE` और `CHECKOUT_WORKER_URL` जानबूझकर blank हैं। इन्हें production URL से न भरें।
- Backend `wrangler.jsonc` में staging placeholders हैं। Production D1/R2 IDs डालना मना है।

## ZIP 1 — Frontend
File: `official-main-Basic-Version.zip`
ZIP के अंदर root folder: `official-main/`। इसके अंदर `index.html`, `style.css`, `app.js`, `books.js`, `admin-dashboard.html`, `admin-dashboard.js`, `admin-dashboard.css`, `team-login.html`, `my-order.html` आदि हैं।

### कहाँ रखना है
1. GitHub खोलें → repository `official`।
2. branch selector से `basic-version` चुनें। `main` न चुनें।
3. ZIP को सीधे repository में upload न करें। पहले फोन/कंप्यूटर में ZIP extract करें।
4. Extract किए `official-main/` के **अंदर की files** को repository root के समान paths पर upload/replace करें। `official-main/` नाम का extra nested folder repository के अंदर न बनाएं।
5. किसी existing file को replace करने से पहले उसका नाम और path मिलाएँ। नई files को उसी relative path पर add करें।
6. `new-version-config.js` में केवल isolated staging Worker URL तब भरें जब staging Worker तैयार हो। अभी blank रखना सुरक्षित है।
7. GitHub Pages की production publishing settings न बदलें। अलग preview/staging से test करें।

## ZIP 2 — Backend
File: `anjaan-musafir-delivery-main-Basic-Version.zip`
ZIP के अंदर root folder: `anjaan-musafir-delivery-main/`। इसके अंदर `src/`, `db/`, `public/`, `website/`, `tests/`, `wrangler.jsonc` आदि हैं।

### कहाँ रखना है
1. GitHub repository `anjaan-musafir-delivery` खोलें।
2. `basic-version` branch चुनें; `main` पर upload/commit न करें।
3. ZIP extract करें। Extract किए `anjaan-musafir-delivery-main/` के **अंदर की files/folders** को repository root के समान paths पर upload/replace करें। Extra nested folder न बनाएं।
4. `wrangler.jsonc` में केवल अलग staging D1 database ID/name और private staging R2 bucket के values भरें। Live IDs का उपयोग न करें।
5. Cloudflare में अलग staging Worker `anjaan-musafir-delivery-staging` रखें; Cashfree sandbox secrets केवल staging Worker में सेट हों। Secrets source code, frontend या screenshots में न डालें।
6. Migrations केवल staging D1 पर numeric order में चलाएँ। Production D1 पर कोई migration न चलाएँ।

## कौन-सी चीजें पहले test करनी हैं
- Admin login, roles/permissions और unauthorized access deny।
- Existing product IDs, prices, old orders/coupons और download compatibility।
- Product create/edit/archive, cover upload और private PDF upload/download।
- Coupon limits, 100% coupon/₹0 path, offer schedule और abandoned reservation reconciliation।
- Cashfree sandbox create order → payment → verified webhook → paid status → private download।
- Duplicate/failed/pending webhook; payment amount mismatch must not deliver PDF।
- My Order, email retry/delivery, reports/date filters/CSV, Android browser.
- Payment checkout must remain independent of optional analytics/marketing features.

## Status / ईमानदार सीमा
Candidate के local checks: Frontend 43 tests और Backend 161 tests पास; JS syntax checks और SQLite schema + migrations 001–018 smoke test पास। ZIP integrity भी जाँची गई।

ये checks live Cloudflare D1/R2, Cashfree sandbox, webhook delivery, email inbox, browser/mobile या full purchase-to-download flow को prove नहीं करते। इस package में हर प्रस्तावित feature के लिए पूरा universal ON/OFF + scheduler UI/backend अभी acceptance-tested नहीं है; इसे staging में implement/verify किए बिना complete/100% न मानें। पहले स्थानीय tests और staging integration पूरा करें।

## Rollback
Candidate branch में ही काम करें। यदि staging में समस्या हो, candidate changes revert करें। Production branch/Worker/D1 में copy/paste न करें।
