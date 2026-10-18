-- WhatsApp Community content record for the existing site_content manager.
-- Apply this migration ONCE to the existing D1 database.
-- The feature starts disabled so no placeholder invite link can be shown publicly.
INSERT OR IGNORE INTO site_content (content_key, title, body, enabled)
VALUES (
  'whatsapp_community',
  '🔥 सबसे खास डील्स… सबसे पहले आपके लिए! 👀',
  'invite_url=PASTE_YOUR_WHATSAPP_COMMUNITY_INVITE_LINK_HERE
description=नए लॉन्चिंग ऑफर्स, Exclusive Coupons और Secret Deals की जानकारी सबसे पहले पाएँ।
join_label=अभी जॉइन करें
details_label=🤫 अंदर क्या मिलेगा?
details_title=कम्युनिटी में क्या मिलेगा?
benefits=नए प्रोडक्ट लॉन्चिंग ऑफर्स|Exclusive Coupons और Discounts|Limited-time Deals|Surprise Benefits
disclaimer=Offers और coupons उपलब्धता एवं लागू शर्तों के अधीन हैं।',
  0
);
