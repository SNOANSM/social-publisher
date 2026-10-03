<div dir="rtl">

# ناشر — انشر على Instagram و YouTube من مكان واحد

تطبيق ويب شخصي (لك أنت بس): ترفع فيديو أو صورة، تكتب الكابشن، تختار المنصة (انستقرام / يوتيوب / الاثنين)، وتضغط **نشر**.

- تسجيل دخول بإيميل وكلمة مرور لحساب واحد فقط (`ALLOWED_EMAIL`). ما فيه تسجيل حسابات، وكلمة المرور محفوظة كهاش scrypt مو نص.
- كل الصفحات وكل الـ API تتحقق من الجلسة في كل طلب.
- توكنات انستقرام ويوتيوب محفوظة في السيرفر **مشفّرة (AES-256-GCM)** وما توصل للمتصفح أبداً، وتتجدد تلقائياً.
- رفع الملف من المتصفح على أجزاء (3 ميقا لكل جزء) إلى Netlify Blobs، والنشر يصير في **Background Function** (لين 15 دقيقة) والواجهة تتابع الحالة.
- إذا نجح على منصة وفشل على الثانية، يوضح لك بالعربي وش صار ويخليك تعيد المحاولة للمنصة اللي فشلت بس.
- **جدولة:** تختار يوم ووقت والمنشور ينزل لحاله (وظيفة مجدولة تشتغل كل ٥ دقايق)، وتقدر تلغيه أو تنشره الحين.
- **بوست متعدد لانستقرام:** لين ١٠ صور ببوست واحد، وتقدر ترتبها.
- **السجل:** تقويم شهري فيه صورة مصغرة لكل منشور، والمجدولة فوق.
- **تطبيق على الجوال (PWA):** تضيفه للشاشة الرئيسية ويفتح كتطبيق.
- **الخطة:** تكتب أفكارك وترتبها على أيام الأسبوع، ومن أي فكرة تبدأ المنشور مباشرة.
- **الإحصائيات:** آخر منشور، المشتركين، المشاهدات، مشاهدات كل فيديو، وأفضل وقت للنشر محسوب من قناتك.
- **أكثر من شخص:** صاحب الحساب يضيف أشخاص (إيميل + كلمة مرور) من الإعدادات، ويقدر يشيلهم بأي وقت.
- **نهار / ليل:** زر فوق، أو من الإعدادات (نهار / ليل / تلقائي).
- تصميم يدعم العربي (RTL) ويشتغل زين على الجوال.

---

## المحتويات

1. [المتطلبات](#1-المتطلبات)
2. [إعداد Google Cloud (YouTube)](#2-إعداد-google-cloud-youtube)
3. [إعداد Meta for Developers (Instagram)](#3-إعداد-meta-for-developers-instagram)
4. [متغيرات البيئة](#4-متغيرات-البيئة-env)
5. [النشر على Netlify](#5-النشر-على-netlify)
6. [التشغيل على جهازك](#6-التشغيل-على-جهازك)
7. [كيف يشتغل من الداخل](#7-كيف-يشتغل-من-الداخل)
8. [حدود وملاحظات مهمة](#8-حدود-وملاحظات-مهمة)
9. [تثبيته كتطبيق على الجوال](#9-تثبيته-كتطبيق-على-الجوال)
10. [حل المشاكل](#10-حل-المشاكل)

---

## 1. المتطلبات

- Node.js 22 أو أحدث.
- حساب Netlify باشتراك مدفوع (الـ Background Functions تحتاجه).
- حساب Google عنده قناة YouTube.
- حساب Instagram **Business أو Creator** مربوط بـ **صفحة فيسبوك**.
- مستودع GitHub (أو GitLab / Bitbucket) ترفع عليه المشروع.

---

## 2. إعداد Google Cloud (YouTube)

الـ OAuth Client هذا لربط قناة يوتيوب فقط (الدخول للموقع نفسه بإيميل وكلمة مرور).

### 2.1 إنشاء مشروع
1. ادخل [console.cloud.google.com](https://console.cloud.google.com).
2. من القائمة اللي فوق اختر **Select a project ← New Project**، سمّه مثلاً `nasher`، واضغط **Create**.

### 2.2 تفعيل YouTube Data API v3
1. من القائمة: **APIs & Services ← Library**.
2. ابحث عن **YouTube Data API v3** واضغط **Enable**.

### 2.3 شاشة الموافقة (OAuth consent screen)
1. من القائمة: **Google Auth Platform** (أو **APIs & Services ← OAuth consent screen**) واضغط **Get started**.
2. **App name**: `ناشر`، و **User support email**: إيميلك.
3. **Audience**: اختر **External**.
4. **Contact information**: إيميلك، ثم **Create**.
5. من **Data Access ← Add or remove scopes** أضف:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
   - (و `openid` و `email` و `profile` موجودة افتراضياً)
6. من **Audience ← Test users** أضف إيميلك.

> ⚠️ **مهم جداً — حالة النشر (Publishing status):**
> لو التطبيق بحالة **Testing**، جوجل يلغي الـ refresh token بعد **7 أيام**، ويصير لازم تعيد ربط يوتيوب كل أسبوع.
> الحل: من **Audience** اضغط **Publish app** وحوّله لـ **In production**. بيطلع لك وقت الربط تحذير "Google hasn't verified this app"، اضغط **Advanced ← Go to ناشر (unsafe)**. هذا عادي لأن التطبيق لك أنت بس.

### 2.4 إنشاء OAuth Client
1. من **Clients ← Create client** (أو **Credentials ← Create Credentials ← OAuth client ID**).
2. **Application type**: `Web application`.
3. **Authorized redirect URIs** — أضف الاثنين (بدّل `your-site` برابط موقعك):
   ```
   https://your-site.netlify.app/api/connect/youtube/callback
   http://localhost:8888/api/connect/youtube/callback
   ```
4. اضغط **Create** وانسخ:
   - **Client ID** ← `AUTH_GOOGLE_ID`
   - **Client secret** ← `AUTH_GOOGLE_SECRET`

### 2.5 ⚠️ تدقيق YouTube (Audit)
جوجل يخلي **أي فيديو يترفع عن طريق API من مشروع غير مدقق (unverified) خاص (Private) تلقائياً**، حتى لو اخترت "عام".
عشان تقدر تنشر عام أو غير مدرج من التطبيق، لازم تقدم على التدقيق:
- عبّ نموذج **YouTube API Services – Audit and Quota Extension Form** من [developers.google.com/youtube/v3/guides/quota_and_compliance_audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- اشرح إنه أداة شخصية تنشر على قناتك أنت فقط.

لين يتم التدقيق، الفيديو بينرفع **خاص** وتقدر تغيّره لعام من YouTube Studio بضغطة.

### 2.6 الحصة اليومية (Quota)
الحصة الافتراضية 10,000 وحدة يومياً، ورفع الفيديو (`videos.insert`) من أغلى العمليات. يعني عدد محدود من الرفعات باليوم. راجع جدول الحصص في Google Cloud ← **APIs & Services ← YouTube Data API v3 ← Quotas**، وتقدر تطلب زيادة من نفس نموذج التدقيق.

---

## 3. إعداد Meta for Developers (Instagram)

### 3.1 جهّز حساب انستقرام
1. في تطبيق انستقرام: **الإعدادات ← نوع الحساب والأدوات ← التبديل إلى حساب احترافي** واختر **Creator** أو **Business**.
2. اربطه بصفحة فيسبوك: من صفحة الفيسبوك ← **الإعدادات ← الحسابات المرتبطة ← Instagram** (أو من Meta Business Suite).
3. لازم تكون **مسؤول (Admin)** على صفحة الفيسبوك.

### 3.2 إنشاء التطبيق
1. ادخل [developers.facebook.com/apps](https://developers.facebook.com/apps) ← **Create App**.
2. اختر حالة الاستخدام **Other**، ونوع التطبيق **Business**.
3. سمّه `ناشر` واختر حساب Business Portfolio (أو بدون) ثم **Create app**.

### 3.3 إضافة Facebook Login for Business
1. من لوحة التطبيق ← **Add product** ← **Facebook Login for Business** ← **Set up**.
2. من **Facebook Login for Business ← Settings**:
   - **Valid OAuth Redirect URIs**:
     ```
     https://your-site.netlify.app/api/connect/instagram/callback
     ```
     (فيسبوك يقبل `localhost` تلقائياً في وضع التطوير.)
   - فعّل **Client OAuth login** و **Web OAuth login** و **Enforce HTTPS**.
3. من **Facebook Login for Business ← Configurations ← Create configuration**:
   - الاسم: `nasher-publish`
   - **Login variation**: General
   - **Access token type**: **User access token**
   - **Permissions** اختر:
     - `instagram_basic`
     - `instagram_content_publish`
     - `pages_show_list`
     - `pages_read_engagement`
     - `business_management`
   - احفظ، وانسخ **Configuration ID** ← `META_CONFIG_ID`.

> لو تطبيقك من النوع القديم (Facebook Login العادي) اترك `META_CONFIG_ID` فاضي، والتطبيق بيطلب الصلاحيات بالطريقة القديمة (`scope`).

### 3.4 إضافة Instagram API
من **Add product** أضف **Instagram** واختر **API setup with Facebook login** (ما يحتاج إعدادات إضافية).

### 3.5 بيانات التطبيق
من **App settings ← Basic**:
- **App ID** ← `META_APP_ID`
- **App secret** (اضغط Show) ← `META_APP_SECRET`

### 3.6 وضع التطبيق (Development / Live)
- خلّه في وضع **Development**. بما إنك **Admin** على التطبيق، كل الصلاحيات تشتغل لك بدون مراجعة من Meta (App Review).
- تأكد إن حساب الفيسبوك اللي بتربط فيه هو نفسه مسؤول التطبيق (**App roles ← Roles**).

### 3.7 الربط من الموقع
بعد ما تنشر الموقع: **الإعدادات ← ربط Instagram** ← سجّل دخول فيسبوك ← **اختر الصفحة وحساب الانستقرام** ← وافق على كل الصلاحيات.
لو عندك أكثر من صفحة، حط رقم الصفحة في `INSTAGRAM_PAGE_ID`.

---

## 4. متغيرات البيئة (.env)

انسخ `.env.example` إلى `.env` (محلياً)، وضيف نفس المتغيرات في Netlify.

| المتغير | إلزامي | وش هو |
|---|---|---|
| `APP_URL` | ✅ | رابط الموقع **بدون `/` في الآخر**، مثل `https://your-site.netlify.app`. محلياً: `http://localhost:8888`. يُستخدم لروابط الرجوع في OAuth ولتشغيل وظيفة النشر. |
| `AUTH_SECRET` | ✅ | مفتاح عشوائي لتشفير جلسة الدخول. ولّده بـ `npx auth secret` أو `openssl rand -base64 32`. |
| `AUTH_GOOGLE_ID` | ✅ | Client ID من Google Cloud (لربط يوتيوب). |
| `AUTH_GOOGLE_SECRET` | ✅ | Client secret من Google Cloud. |
| `ALLOWED_EMAIL` | ✅ | الإيميل الوحيد المسموح له بالدخول. لو فاضي، **ما أحد يقدر يدخل**. |
| `ADMIN_PASSWORD_HASH` | ✅ | هاش كلمة المرور. **لا تكتبه بيدك**: شغّل `npm run set-password` (يسألك عن الإيميل وكلمة المرور ويحفظهم في Netlify). للملف المحلي: `npm run set-password -- --local`. |
| `TOKEN_ENCRYPTION_KEY` | ✅ | مفتاح تشفير التوكنات (32 حرف أو أكثر): `openssl rand -base64 32`. **لا تغيّره** بعد الربط، وإلا لازم تعيد ربط الحسابات. |
| `META_APP_ID` | ✅ | App ID من Meta. |
| `META_APP_SECRET` | ✅ | App secret من Meta. |
| `META_CONFIG_ID` | اختياري | Configuration ID من Facebook Login for Business. |
| `META_GRAPH_VERSION` | اختياري | إصدار Graph API، الافتراضي `v25.0`. |
| `INSTAGRAM_PAGE_ID` | اختياري | رقم صفحة الفيسبوك المربوطة بانستقرام، لو عندك أكثر من صفحة. |

> 🔒 لا ترفع ملف `.env` على GitHub (موجود في `.gitignore`).

---

## 5. النشر على Netlify

### 5.1 ارفع الكود على GitHub
```bash
git add -A
```
```bash
git commit -m "ناشر"
```
```bash
git push
```

### 5.2 أنشئ المشروع في Netlify
1. ادخل [app.netlify.com](https://app.netlify.com) ← **Add new project ← Import an existing project**.
2. اختر GitHub والمستودع.
3. إعدادات البناء تنقرأ تلقائياً من `netlify.toml` (`npm run build`). لا تغيّر شي.
4. اضغط **Deploy**. أول نشر ممكن يفشل لأن المتغيرات ناقصة، عادي.

### 5.3 أضف متغيرات البيئة
1. من المشروع: **Project configuration ← Environment variables ← Add a variable ← Add a single variable** (أو **Import from a .env file** وتلصق محتوى ملفك).
2. أضف كل المتغيرات من الجدول فوق.
3. خلّ **Scopes** على **All scopes** (لازم تشمل **Functions** و **Runtime**).
4. علّم `AUTH_SECRET` و `AUTH_GOOGLE_SECRET` و `TOKEN_ENCRYPTION_KEY` و `META_APP_SECRET` كـ **Contains secret values**.
5. حط `APP_URL` = رابط موقعك النهائي (مثلاً `https://nasher-123.netlify.app` أو دومينك).

### 5.4 أعد النشر
**Deploys ← Trigger deploy ← Deploy project without cache**.

### 5.5 حدّث روابط الرجوع
تأكد إن رابط موقعك النهائي مضاف في:
- Google Cloud ← OAuth Client ← **Authorized redirect URIs**.
- Meta ← Facebook Login for Business ← **Valid OAuth Redirect URIs**.

لو غيّرت الدومين بعدين، حدّث `APP_URL` والروابط هذي وأعد النشر.

### 5.6 جرّب
1. شغّل `npm run set-password` عشان تحدد إيميل وكلمة مرور الدخول، وأعد النشر.
2. افتح الموقع ← سجّل دخول بالإيميل وكلمة المرور.
3. **الإعدادات ← ربط YouTube** و **ربط Instagram**.
4. **نشر** ← ارفع فيديو ← اكتب الكابشن ← **نشر**.

> النشر عن طريق الـ CLI بديل: `npm i -g netlify-cli` ثم `netlify login` ثم `netlify init` ثم `netlify deploy --prod`.

---

## 6. التشغيل على جهازك

```bash
npm install
```
```bash
cp .env.example .env
```
عبّ القيم في `.env` (وخل `APP_URL=http://localhost:8888`)، ثم:
```bash
npx netlify dev
```
افتح [http://localhost:8888](http://localhost:8888).

- لازم تشغّله بـ `netlify dev` (مو `npm run dev`) عشان Netlify Blobs والـ Functions تشتغل محلياً. البيانات المحلية تنحفظ في `.netlify/` وما تختلط ببيانات الموقع الحقيقي.
- **ملاحظة:** أداة Netlify المحلية (الإصدار 27) ما تقدر تحمّل `@netlify/blobs` داخل الـ Background Functions. عشان كذا، محلياً فقط، النشر يشتغل داخل سيرفر التطوير نفسه بدل الـ Background Function (شوف `src/lib/trigger.ts`). على Netlify الحقيقي يشتغل في الـ Background Function عادي.

---

## 7. كيف يشتغل من الداخل

```
المتصفح ──(أجزاء 3MB)──▶ /api/uploads/...           ──▶ Netlify Blobs (sp-media)
المتصفح ──────────────▶ /api/posts (إنشاء المنشور)  ──▶ Blobs (sp-data) + تشغيل:
                                                        publish-background (لكل منصة لحالها)
                                                          ├─ YouTube: رفع resumable (أجزاء 12MB)
                                                          └─ Instagram: صورة ◀ رابط مؤقت موقّع (ساعة)
                                                                         فيديو ◀ رفع resumable مباشر لـ Meta
المتصفح ──(كل 2.5 ثانية)──▶ /api/posts/:id   ◀── حالة كل منصة + نسبة التقدم + الروابط
```

| الملف | الوظيفة |
|---|---|
| `src/auth.ts` | Auth.js: دخول بإيميل وكلمة مرور لحساب واحد + حظر بعد المحاولات الغلط |
| `src/lib/session.ts` | التحقق من الجلسة في كل صفحة وكل API |
| `src/lib/crypto.ts` | تشفير التوكنات + توقيع الروابط المؤقتة |
| `src/lib/tokens.ts` | حفظ التوكنات مشفرة + التجديد التلقائي |
| `src/lib/uploads.ts` | تخزين الملف على أجزاء وقراءته كـ stream |
| `src/lib/youtube.ts` | الرفع ليوتيوب (videos.insert) |
| `src/lib/instagram.ts` | النشر لانستقرام (container ← media_publish) |
| `src/lib/publisher.ts` | تشغيل النشر لمنصة وحدة وحفظ الحالة |
| `netlify/functions/publish-background.mts` | Background Function (لين 15 دقيقة) |
| `netlify/functions/maintenance.mts` | وظيفة يومية: تجديد التوكنات + حذف الملفات القديمة (ما عدا المجدولة) |
| `netlify/functions/scheduler.mts` | كل ٥ دقايق: ينشر المنشورات المجدولة اللي جا وقتها |
| `src/components/HistoryView.tsx` | السجل والتقويم |
| `src/components/Composer.tsx` | صفحة النشر |

### الأمان
- **الدخول:** إيميل + كلمة مرور. كلمة المرور محفوظة كهاش scrypt في `ADMIN_PASSWORD_HASH`، وبعد 5 محاولات غلط من نفس الجهاز ينحظر ربع ساعة. الإيميل يتطابق مع `ALLOWED_EMAIL` في **كل طلب** (لو غيّرته، الجلسات القديمة تنقفل فوراً). الجلسة JWT مشفّرة لمدة 7 أيام.
- **الحماية:** كل صفحة وكل API يتحقق بنفسه من الجلسة، وما يعتمد على middleware. الاستثناءات الوحيدة:
  - `/api/auth/*` (تسجيل الدخول نفسه).
  - `/api/media/<token>/...`: رابط الصورة اللي يحمّلها انستقرام. محمي بتوقيع HMAC ينتهي بعد ساعة.
  - `/.netlify/functions/publish-background`: يرفض أي طلب بدون السر الداخلي (مشتق من `AUTH_SECRET`).
- **التوكنات:** مشفّرة AES-256-GCM في Blobs، والمتصفح يستلم بس اسم الحساب وحالة الربط.
- **ربط الحسابات:** محمي ضد CSRF بـ `state` عشوائي في كوكي httpOnly.
- **منع النشر المكرر:** كل محاولة لها `attemptId`. لو Netlify أعاد تشغيل الوظيفة بعد ما انقطعت، ما تنشر مرة ثانية، تتسجل كفاشلة وتعيد المحاولة أنت بنفسك.

### التجديد التلقائي للتوكنات
- **YouTube:** الـ access token يتجدد قبل كل نشر (لو باقي له أقل من 20 دقيقة)، وكل يوم من وظيفة الصيانة.
- **Instagram:** نستخدم **Page access token** مأخوذ من توكن مستخدم طويل المدة (60 يوم). وظيفة الصيانة اليومية تجدده قبل ما يبقى له 20 يوم. صفحة الإعدادات تعرض كم يوم باقي، وتنبهك لو احتاج إعادة ربط.

### حذف الملفات
- الملف ينحذف من Blobs **أول ما ينجح النشر على كل المنصات المختارة**.
- لو فشلت منصة، الملف يبقى عشان تقدر تعيد المحاولة، وينحذف تلقائياً بعد **3 أيام**.

---

## 8. حدود وملاحظات مهمة

| | الحد |
|---|---|
| حجم الملف | 1 جيجا كحد أقصى للرفع |
| فيديو انستقرام (Reel) | 300 ميقا، من 3 ثواني إلى 15 دقيقة، MP4/MOV (H.264 + AAC) |
| صورة انستقرام | JPEG فقط، 8 ميقا (التطبيق يحوّل PNG/WebP إلى JPEG تلقائياً)، النسبة بين 4:5 و 1.91:1 |
| كابشن انستقرام | 2200 حرف، 30 هاشتاق |
| حد النشر في انستقرام | 100 منشور كل 24 ساعة |
| عنوان يوتيوب | 100 حرف، بدون `<` أو `>` |
| وصف يوتيوب | 5000 بايت (الحرف العربي = 2 بايت) |
| التاقات | مجموعها 500 حرف |
| Shorts | فيديو عمودي (أو مربع) مدته 3 دقائق أو أقل. التطبيق يضيف `#Shorts` للعنوان |
| مدة النشر | 15 دقيقة لكل منصة (حد Background Functions) |

- **ليش الفيديو ما يروح لانستقرام عن طريق رابط؟** الـ Netlify Functions ما تقدر ترجع رد أكبر من 20 ميقا، فالرابط العام ما يشتغل لأغلب الفيديوهات. عشان كذا الفيديو ينرفع لـ Meta مباشرة بطريقة **Resumable Upload**. الصور (أقل من 8 ميقا) تروح عن طريق الرابط المؤقت الموقّع.
- يوتيوب ينشر الفيديو **خاص** لين يتم التدقيق (شوف 2.5).

---

## 9. تثبيته كتطبيق على الجوال

- **آيفون (Safari):** افتح الموقع ← زر المشاركة (المربع اللي فيه سهم) ← **إضافة إلى الشاشة الرئيسية**.
- **أندرويد (Chrome):** افتح الموقع ← القائمة (⋮) ← **تثبيت التطبيق** أو **إضافة إلى الشاشة الرئيسية**.

يفتح بدون شريط المتصفح، ويظهر بأيقونة «ن».

## 10. حل المشاكل

| المشكلة | الحل |
|---|---|
| "الإيميل أو كلمة المرور غير صحيحة" | أعد تشغيل `npm run set-password` ثم أعد النشر. |
| "محاولات كثيرة غلط" | انتظر ربع ساعة. |
| `redirect_uri_mismatch` من Google | الرابط في Google Cloud لازم يطابق `APP_URL` + المسار بالضبط (https، بدون / زيادة). |
| "Google ما رجّع refresh token" | احذف صلاحية التطبيق من [myaccount.google.com/permissions](https://myaccount.google.com/permissions) وأعد الربط. |
| يوتيوب يطلب إعادة ربط كل أسبوع | التطبيق في Google بحالة Testing. حوّله لـ In production (شوف 2.3). |
| الفيديو ينزل خاص في يوتيوب | المشروع ما انعمل له تدقيق (شوف 2.5). |
| "ما لقيت صفحة فيسبوك مربوطة..." | تأكد إن الانستقرام Business/Creator ومربوط بصفحة، واخترت الصفحة أثناء تسجيل دخول فيسبوك. |
| "صلاحيات انستقرام ناقصة" | أعد الربط ووافق على كل الصلاحيات. تأكد إن الـ Configuration فيها الخمس صلاحيات. |
| "تعذّر تشغيل عملية النشر في الخلفية" | تأكد إن `APP_URL` صحيح، وإن اشتراك Netlify يدعم Background Functions. |
| تبي تشوف السجلات | Netlify ← **Logs ← Functions ← publish-background**. وفي واجهة التطبيق اضغط "التفاصيل التقنية" تحت أي خطأ. |

</div>
