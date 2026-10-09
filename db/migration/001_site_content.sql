-- Anjaan Musafir Books: dynamic public content and policy editor
-- Run this ONCE against the EXISTING D1 database. It does not alter or delete orders/products.
CREATE TABLE IF NOT EXISTS site_content (
  content_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  draft_title TEXT,
  draft_body TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('terms','Terms & Conditions','संक्षेप में: यहाँ की सभी किताबें digital eBooks (PDF) हैं। भुगतान Cashfree Payments के ज़रिए होता है। खरीदी हुई eBook आप अपने निजी पढ़ने के लिए इस्तेमाल कर सकते हैं, आगे बाँटने या बेचने के लिए नहीं।

इस वेबसाइट का उपयोग करने या यहाँ से eBook खरीदने से पहले कृपया ये Terms & Conditions पढ़ लें।

## स्वीकृति

इस वेबसाइट का उपयोग करने या कोई eBook खरीदने का मतलब है कि आपने इन Terms & Conditions को पढ़ा और समझा है।

## डिजिटल उत्पाद

Anjaan Musafir Books की सभी किताबें digital eBooks हैं, जो PDF format में उपलब्ध कराई जाती हैं। ये physical books नहीं हैं, और कोई चीज़ घर पर भेजी नहीं जाती।

## कीमत और उपलब्धता

हर eBook की कीमत और छूट उसके पेज पर दिखाई जाती है। भुगतान के समय वही कीमत लागू होगी जो checkout पर दिख रही हो। कीमतें और छूट समय-समय पर बदली जा सकती हैं।

जिन किताबों पर “जल्द उपलब्ध” लिखा है, वे अभी खरीदी नहीं जा सकतीं।

## भुगतान

भुगतान हमारी वेबसाइट से शुरू होता है और payment gateway Cashfree Payments के सुरक्षित checkout के माध्यम से process होता है। Cashfree की अपनी शर्तें और privacy policy भी इस लेन-देन पर लागू होंगी।

## eBook की delivery

भुगतान की पुष्टि होने के बाद eBook का download link सीधे हमारी वेबसाइट पर दिया जाता है। यह link सीमित समय और सीमित बार download के लिए मान्य होता है। अगर भुगतान हो गया लेकिन eBook नहीं मिली, तो नीचे दिए गए email पर हमें लिखिए।

## व्यक्तिगत उपयोग

eBook खरीदने के बाद आप उसे अपने निजी पढ़ने और personal development के लिए इस्तेमाल कर सकते हैं।

## कॉपीराइट और सामग्री

किताबों की लिखित सामग्री, cover, design और अन्य original सामग्री Anjaan Musafir Books और लेखक की है। बिना अनुमति इसे copy, reproduce, resell, redistribute, upload या commercial रूप से इस्तेमाल करना मना है।

## Refund

Digital eBook होने के कारण सफल delivery या download के बाद refund उपलब्ध नहीं होता। भुगतान हो जाने पर भी eBook न मिलने जैसी स्थिति में हम मदद करेंगे। पूरी जानकारी Refund Policy में है।

## सामग्री के बारे में सूचना

हमारी किताबें self-help, personal development, आदतों और करियर जैसे विषयों पर सामान्य मार्गदर्शन देती हैं। व्यक्तिगत अनुभव और नतीजे अलग-अलग हो सकते हैं। नौकरी, आय या किसी खास परिणाम की कोई गारंटी नहीं दी जाती।

ये किताबें किसी mental-health condition के diagnosis, इलाज या डॉक्टर की सलाह का विकल्प नहीं हैं। अगर आप गंभीर तनाव या परेशानी में हैं, तो किसी योग्य विशेषज्ञ से बात करें।

## वेबसाइट और Terms में बदलाव

वेबसाइट की सामग्री, कीमत, उपलब्धता या इन Terms & Conditions में समय-समय पर बदलाव किया जा सकता है। नया version इसी पेज पर प्रकाशित होगा।

## संपर्क

किसी सवाल, भुगतान या delivery की समस्या के लिए लिखिए: officialsuperswagg@gmail.com',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('privacy','Privacy Policy','संक्षेप में: हम सिर्फ़ उतनी जानकारी इस्तेमाल करते हैं जितनी आपका order पूरा करने और आपकी मदद करने के लिए ज़रूरी है। भुगतान Cashfree Payments के सुरक्षित checkout के ज़रिए होता है, इसलिए आपके card, UPI या bank की जानकारी हम स्वयं store नहीं करते।

यह Privacy Policy बताती है कि Anjaan Musafir Books की वेबसाइट का उपयोग करते समय, या हमारी eBooks खरीदते समय, आपकी जानकारी कैसे संभाली जा सकती है।

## हम कौन हैं

Anjaan Musafir Books Hindi eBooks का एक स्वतंत्र प्रकाशन मंच है, जिसका संचालन लेखक Nitendra Sahu करते हैं। इस policy में “हम” का मतलब Anjaan Musafir Books है।

Contact Email: officialsuperswagg@gmail.com

## कौन-सी जानकारी ली जा सकती है

जब आप eBook खरीदते हैं या हमें लिखते हैं, तब यह जानकारी हमारे सामने आ सकती है:

- नाम
- Email address
- Order और transaction से जुड़ी ज़रूरी जानकारी, जैसे किताब का नाम, तारीख़ और order ID
- आपका भेजा हुआ संदेश या support request

हम ज़रूरत से ज़्यादा व्यक्तिगत जानकारी माँगने का उद्देश्य नहीं रखते।

## भुगतान

हमारी eBooks का भुगतान payment gateway Cashfree Payments के माध्यम से process होता है। भुगतान के समय आप Cashfree के page पर UPI, card या net banking जैसा तरीका चुनते हैं। आपके card, UPI या bank की जानकारी Cashfree और संबंधित payment partners process करते हैं। हम उसे स्वयं store नहीं करते।

Cashfree Payments अपनी privacy policy और terms के अनुसार भुगतान की जानकारी संभालता है। खरीदने से पहले उन्हें पढ़ लेना अच्छा रहेगा।

## eBook की delivery

भुगतान की पुष्टि होने पर eBook का download link हमारी वेबसाइट पर दिया जाता है। इसके लिए आपका नाम, email और mobile number order रिकॉर्ड में सुरक्षित रखा जाता है।

## जानकारी का उपयोग

आपकी जानकारी का उपयोग मुख्य रूप से इन कामों के लिए होता है:

- Order process करना और eBook की delivery
- Customer support देना
- भुगतान या access की समस्या हल करना
- वेबसाइट और सेवा को बेहतर बनाना

हम आपकी व्यक्तिगत जानकारी बेचते नहीं हैं।

## Cookies, fonts और hosting

इस वेबसाइट पर हम अपनी ओर से कोई tracking या advertising cookie इस्तेमाल नहीं करते। वेबसाइट के fonts Google Fonts से load होते हैं, इसलिए पेज खुलते समय आपका browser Google के servers से जुड़ता है।

वेबसाइट GitHub Pages पर hosted है, और hosting provider सामान्य technical logs, जैसे IP address, रख सकता है। भविष्य में हम analytics जैसी कोई सेवा जोड़ेंगे तो यह policy अपडेट की जाएगी।

## Third-party services और links

इस वेबसाइट के काम में ये सेवाएँ शामिल हैं:

- Cloudflare: वेबसाइट का backend, order रिकॉर्ड और eBook delivery
- Cashfree Payments: भुगतान process करना
- GitHub Pages: वेबसाइट hosting
- Google Fonts: fonts
- Instagram: हमारे social page का link

ये सेवाएँ अपनी privacy policies के अनुसार जानकारी process करती हैं और अपने cookies इस्तेमाल कर सकती हैं। उनकी practices हमारे नियंत्रण में नहीं हैं।

## आपके विकल्प

आप हमसे पूछ सकते हैं कि आपकी कौन-सी जानकारी हमारे पास है, और उसमें सुधार या उसे हटाने का अनुरोध कर सकते हैं। हम उचित अनुरोध पूरा करने की कोशिश करेंगे। जो जानकारी Cashfree या किसी दूसरी सेवा के पास है, उस पर उस सेवा की policy लागू होगी।

## जानकारी की सुरक्षा

हम आपकी जानकारी की सुरक्षा के लिए उचित सावधानी रखने की कोशिश करते हैं। फिर भी, Internet पर कोई भी transmission या storage तरीका पूरी तरह सुरक्षित होने की गारंटी नहीं दी जा सकती।

## बच्चों की privacy

यह वेबसाइट जानबूझकर बच्चों से व्यक्तिगत जानकारी इकट्ठा करने के लिए नहीं बनी है। अगर आपको लगे कि किसी बच्चे की जानकारी अनजाने में साझा हो गई है, तो हमें लिखें।

## Policy में बदलाव

ज़रूरत पड़ने पर हम इस Privacy Policy को बदल सकते हैं। बदलाव के बाद नया version इसी पेज पर ऊपर दी गई तारीख़ के साथ प्रकाशित किया जाएगा।

## संपर्क

Privacy या अपनी जानकारी से जुड़े किसी सवाल के लिए लिखिए: officialsuperswagg@gmail.com',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('refund','Refund Policy','संक्षेप में: eBook digital product है, इसलिए सफल delivery या download के बाद refund नहीं होता। लेकिन भुगतान हो गया और eBook नहीं मिली, या एक ही खरीद के दो भुगतान हो गए, तो हमें लिखिए। हम जाँच करके मदद करेंगे।

यह Refund Policy Anjaan Musafir Books की सभी eBooks की खरीद पर लागू होती है।

## Digital product

हमारी सभी किताबें digital eBooks हैं, जो PDF format में दी जाती हैं। इनमें physical सामान या shipping नहीं है।

## सफल delivery या download के बाद

Digital eBook होने के कारण सफल delivery या download के बाद सामान्य परिस्थितियों में refund, return या cancellation संभव नहीं है।

## भुगतान सफल, लेकिन eBook नहीं मिली

अगर भुगतान हो गया लेकिन आपको eBook का access नहीं मिला, तो हमें लिखिए। हम उपलब्ध payment और delivery details के आधार पर समस्या की जाँच करेंगे।

## Duplicate payment

अगर एक ही खरीद के लिए गलती से एक से ज़्यादा बार भुगतान हो गया है, तो transaction details के साथ हमसे संपर्क करें, ताकि हम मामले की जाँच कर सकें।

## File खुलने में समस्या

अगर eBook की file download तो हुई लेकिन खुल नहीं रही, तो पहले उसे किसी PDF reader में खोलकर देखें। फिर भी समस्या रहे तो हमें लिखिए। हम सही file या मदद उपलब्ध कराने की कोशिश करेंगे।

## मदद माँगते समय क्या भेजें

- किताब का नाम
- भुगतान में इस्तेमाल किया गया email
- Order या transaction ID, या भुगतान का screenshot
- समस्या का छोटा-सा विवरण

Email: officialsuperswagg@gmail.com

## अगर refund मंज़ूर हो

किसी मामले में refund मंज़ूर होने पर रकम उसी payment method में लौटाई जाएगी। पैसे पहुँचने में कितना समय लगेगा, यह Cashfree और आपके बैंक पर निर्भर करेगा।

## Policy में बदलाव

यह Refund Policy भविष्य में अपडेट हो सकती है। नया version इस पेज पर प्रकाशित होने के बाद लागू होगा।',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('about','About Us','Anjaan Musafir Books सरल हिंदी में सोच, आदतों और आत्म-विकास की eBooks बनाता है — ताकि हर इंसान आसानी से अपने लक्ष्य की ओर बढ़ सके।',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('vision','Our Vision','हर पाठक तक ऐसी किताबें पहुँचाना जो सस्ती हों, समझने में आसान हों और असल ज़िंदगी में काम आएँ।',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('contact','Contact Us','Book, payment या eBook access से जुड़ी मदद के लिए हमें email करें: officialsuperswagg@gmail.com',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('announcement','Announcement Bar','',0);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('footer_tagline','Footer Tagline','हर सफ़र बाहर जाने का नहीं होता।',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('footer_note','Footer Note','Presented by DigiTech Move',1);
INSERT OR IGNORE INTO site_content (content_key,title,body,enabled) VALUES ('contact_email','Contact Email','officialsuperswagg@gmail.com',1);

CREATE INDEX IF NOT EXISTS idx_site_content_enabled ON site_content(enabled);
