# Anjaan Musafir Books — Basic Version Candidate Audit (Hindi)

## इस package का उद्देश्य
यह बाद में upload किए गए Candidate v22 frontend और backend source पर आधारित अलग Basic Version candidate है। Current Version केवल तुलना/reference है। कोई production deployment नहीं किया गया।

## Local checks (2026-10-11)
- Frontend pytest: 43 passed.
- Backend pytest: 161 passed.
- Frontend root JavaScript और backend `src/*.js`, `website/*.js` syntax checks: passed.
- SQLite in-memory smoke test: `db/schema.sql` और migrations `001`–`018` लागू हुईं।
- ZIP integrity: final packaging के बाद फिर से verify की जाएगी।

## महत्त्वपूर्ण सीमाएँ
ये local source checks हैं। इनसे Cloudflare D1/R2 runtime, Cashfree Sandbox, webhook signature/duplicate delivery, Brevo inbox, Android browser, actual private PDF access, role permission matrix या purchase-to-download end-to-end प्रमाणित नहीं होते।

सभी website features के लिए universal ON/OFF + schedule system अभी पूर्ण acceptance-tested नहीं है। मौजूद maintenance/safe-mode controls को universal feature manager न समझें। इस feature को complete मानने से पहले implementation और staging acceptance tests बाकी हैं।

## Staging से पहले
1. `new-version-config.js` में `API_BASE` और `CHECKOUT_WORKER_URL` खाली हैं—इन्हें केवल अलग staging Worker HTTPS URL से भरें।
2. `wrangler.jsonc` के D1/R2 placeholders को अलग staging resources से ही बदलें।
3. Cashfree Sandbox और optional email secrets केवल staging Worker secrets में रखें।
4. Migrations 001–018 को केवल अलग staging D1 पर, क्रम में, baseline compatibility जाँचने के बाद चलाएँ।
5. Role allow/deny matrix, legacy `ADMIN_KEY` break-glass behavior, pricing/coupons, duplicate webhook, zero-amount order, token expiry/download limits, My Order, PDF privacy, email delivery और mobile checkout जाँचें।
6. Representative Current Version products/orders/coupons/download compatibility जाँचें।

## Upload safety
- Frontend repo: `official`, branch: `basic-version`, repository root में ZIP के `official-main/` के अंदर की files।
- Backend repo: `anjaan-musafir-delivery`, branch: `basic-version`, repository root में ZIP के `anjaan-musafir-delivery-main/` के अंदर की files।
- यदि branch मौजूद नहीं है तो पहले `main` से नई branch बनाएं; live Pages/Worker settings न बदलें।
- कोई भी migration production D1 पर न चलाएँ। ZIP upload करना deployment नहीं है।
