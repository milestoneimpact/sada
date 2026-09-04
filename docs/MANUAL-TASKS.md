# المهامّ اليدوية — ما يقع على المالك

كلّ مهمّة بالعناصر الستّة. الحالة تُحدَّث هنا حين يقول المالك إنّها تمّت.

| # | المهمّة | الحالة |
|---|---|---|
| M-01 | إنشاء المستودع `sada` على GitHub | تمّت · 2026-09-03 |
| M-02 | تطبيق LinkedIn Developer + منتج Share on LinkedIn | مطلوبة قبل اليوم ٣ |
| M-03 | طلب LinkedIn Community Management API | مطلوبة في اليوم الأوّل (انتظار طويل) |
| M-04 | حساب X Developer + رصيد + تطبيق OAuth 2.0 | مطلوبة قبل اليوم ٤ |
| M-05 | Cloudflare: الخطّة المدفوعة + نطاقا صدى | جزئيّة — D1 وKV تمّتا |
| M-06 | Google Cloud: حساب خدمة لقراءة Drive | مطلوبة قبل الأسبوع ٢ |
| M-10 | سرّ النشر `CLOUDFLARE_API_TOKEN` في GitHub | **مطلوبة الآن** |

---

## M-01 · إنشاء المستودع `sada` على GitHub

> **تمّت في 2026-09-03.** أُنشئ المستودع خاصًّا تحت `mooryali95`، ومُنحت
> صلاحية GitHub لتطبيق Claude، ودُفعت الوثائق التأسيسية إليه. وقع الخطر
> المذكور في العنصر السادس جزئيًّا: انتهت جلسة التصميم قبل الدفع، فنُقلت
> الوثائق يدويًّا بملفّ مضغوط. لا فقد.

1. **ما هو**: مستودع خاصّ جديد باسم `sada` تحت حساب `mooryali95`.
2. **لماذا الآن**: تكامل GitHub في جلسة المساعد لا يملك صلاحية إنشاء مستودعات (رُفض بـ 403)، والوثائق التأسيسية جاهزة ولا مكان لها.
3. **الخطوات**:
   1. افتح `https://github.com/new`.
   2. **Repository name**: `sada`.
   3. **Description**: «صدى — مدير محتوى ذكي على Cloudflare».
   4. اختر **Private**.
   5. **لا** تُفعّل «Add a README» ولا `.gitignore` ولا license (الملفّات جاهزة).
   6. اضغط **Create repository**.
   7. ارجع إلى المساعد وقل «أنشأت المستودع»؛ سيربطه ويدفع الملفّات التأسيسية.
4. **ما يعني النجاح**: صفحة `github.com/mooryali95/sada` تفتح فارغةً وتعرض تعليمات «…or push an existing repository».
5. **ماذا لو فشل**: إن ظهر «name already exists» أرسل الاسم الظاهر؛ نختار `sada-content` أو نعيد استخدام الموجود.
6. **ما يقع إن تُرك**: الوثائق تبقى في ملفّ مضغوط في المحادثة وتضيع مع انتهاء الجلسة. تأجيل لا خطر، لكنّه يوقف كلّ ما بعده.

## M-02 · تطبيق LinkedIn Developer + Share on LinkedIn

1. **ما هو**: تطبيق في LinkedIn Developer Portal يمنح `w_member_social` للنشر على حسابك الشخصي.
2. **لماذا الآن**: اليوم ٣ من المرحلة ٠ يبني OAuth LinkedIn ويحتاج `Client ID` و`Client Secret`.
3. **الخطوات**:
   1. افتح `https://www.linkedin.com/developers/apps` واضغط **Create app**.
   2. **App name**: `Sada`. **LinkedIn Page**: يلزم ربط صفحة؛ إن لم تكن لك صفحة أنشئ صفحة باسم علامتك.
   3. ارفع شعاراً، ووافق على الشروط، **Create app**.
   4. تبويب **Products**: اضغط **Request access** على **Share on LinkedIn** و**Sign In with LinkedIn using OpenID Connect**. كلاهما يُمنَح فوراً.
   5. تبويب **Auth**: في **Authorized redirect URLs for your app** أضف:
      - `https://sada2.basserh.com/oauth/linkedin/callback`
      - `https://sada.basserh.com/oauth/linkedin/callback`
   6. انسخ **Client ID**. أمّا **Client Secret** فلا تنسخه إلى المحادثة؛ ستضعه بيدك في أسرار Worker (M-05).
4. **ما يعني النجاح**: في تبويب **Auth** تظهر النطاقات `openid`، `profile`، `w_member_social` تحت **OAuth 2.0 scopes**.
5. **ماذا لو فشل**: إن لم يظهر `w_member_social` فالمنتج لم يُضَف؛ أرسل لقطة تبويب Products.
6. **ما يقع إن تُرك**: لا نشر على LinkedIn إطلاقاً. تأجيل يوقف المرحلة ٠.

## M-03 · طلب LinkedIn Community Management API

> **إضافة 2026-09-03 · عقبتان تُحلّان قبل التقديم لا بعده.** أكثر سببَي رفضٍ
> بحسب المصادر في `docs/PLATFORMS.md`:
>
> ١. **بريد العمل.** النموذج يرفض `gmail.com` وأمثاله. يلزم بريد على نطاق
>    الكيان — `‎@basserh.com` مثلاً — قبل فتح النموذج.
> ٢. **سياسة الخصوصية.** يُطلب **رابط منشور يفتح فعلاً**، لا وعدٌ بنشره.
>    صفحة واحدة على النطاق تكفي.
>
> ولا يُقدَّم الطلب ناقصَهما ثمّ يُعاد: إعادة التقديم بعد الرفض أبطأ من
> التقديم مكتملاً.

1. **ما هو**: طلب وصول لصفحة الشركة (`w_organization_social` و`r_organization_social`).
2. **لماذا الآن**: أطول انتظار في المشروع، ولا يُبنى عليه شيء قبل اعتماده (D-010).
3. **الخطوات**:
   1. في التطبيق نفسه، تبويب **Products** ← **Community Management API** ← **Request access**.
   2. املأ النموذج: بريد عمل (لا Gmail)، الاسم القانوني للكيان، العنوان المسجَّل، الموقع، رابط سياسة خصوصية منشورة.
   3. اطلب من Super Admin للصفحة (أنت غالباً) تصديق التطبيق حين يصل الإشعار.
   4. سجّل تاريخ التقديم هنا.
4. **ما يعني النجاح**: بريد اعتماد، ويظهر المنتج في Products بحالة **Approved (Development Tier)**.
5. **ماذا لو فشل**: أرسل نصّ الرفض؛ أكثر الأسباب بريد شخصي أو غياب سياسة خصوصية.
6. **ما يقع إن تُرك**: لا صفحة شركة أبداً. الحساب الشخصي يعمل، لكن نصف الهدف يسقط. تأجيل، وطول الانتظار يجعله أشبه بخطر.

## M-04 · حساب X Developer + رصيد + تطبيق OAuth 2.0

1. **ما هو**: حساب مطوّر في X بنموذج الدفع بالاستخدام، ورصيد مسبق، وتطبيق بـ OAuth 2.0.
2. **لماذا الآن**: اليوم ٤ يبني OAuth X ويحتاج `Client ID` و`Client Secret`، والنشر الأوّل يحتاج رصيداً.
3. **الخطوات**:
   1. افتح `https://developer.x.com` وسجّل الدخول بحساب X الذي ستنشر منه.
   2. أكمل التسجيل بنموذج **Pay-per-use**.
   3. في **Developer Console** ← **Billing** ← اشترِ رصيداً بقيمة 10 دولارات (يكفي شهوراً).
   4. أنشئ **Project** ثمّ **App** باسم `Sada`.
   5. **User authentication settings** ← **Set up**: **App permissions**: Read and write. **Type of App**: Web App. **Callback URI**:
      - `https://sada2.basserh.com/oauth/x/callback`
      - `https://sada.basserh.com/oauth/x/callback`
      **Website URL**: `https://sada.basserh.com`.
   6. انسخ **OAuth 2.0 Client ID**. **Client Secret** لا يُنسَخ إلى المحادثة.
   7. اقرأ من **Pricing** في Console سعر رفع الوسائط وسجّله في `docs/PLATFORMS.md` (غير مؤكَّد حالياً).
   8. **أُضيف 2026-09-03**: تحقّق من عنوانَي OAuth في وثائق X وقارنهما بما في `src/lib/oauth/providers.ts`:
      - `authorizeUrl` المفترَض: `https://x.com/i/oauth2/authorize`
      - `tokenUrl` المفترَض: `https://api.x.com/2/oauth2/token`
      كُتبا على أساس انتقال X من `twitter.com`، ولم يُؤكَّدا من الوثائق الرسمية لأنّ `developer.x.com` كان محجوباً وقت التحقّق. وهما في ملفّ واحد، فالتصحيح سطران.
4. **ما يعني النجاح**: رصيد ظاهر في Billing، وتطبيق بحالة OAuth 2.0 مفعَّل.
5. **ماذا لو فشل**: إن رُفض التسجيل أرسل نصّ الرسالة؛ إن لم يظهر Pay-per-use فالحساب على نموذج قديم ونناقشه.
6. **ما يقع إن تُرك**: لا نشر على X. تأجيل يوقف اليوم ٤.

## M-05 · Cloudflare: الخطّة المدفوعة ونطاقا صدى والأسرار

> **تحديث 2026-09-04 — ما أنجزه المساعد بنفسه، فلا تُعِده:**
>
> | المورد | الحالة |
> |---|---|
> | D1 `sada-staging` | ✅ أُنشئت في `WEUR` · `422cdc81-6485-45cb-9b2e-995b110756a0` |
> | الترحيل `0001_init` | ✅ طُبّق · ١٠ جداول و٨ فهارس · تُحقّق منه بالعدّ |
> | KV `sada-kv-staging` | ✅ أُنشئت · `7c4ec65867924a869da8c13146745d2a` |
> | `wrangler.toml` | ✅ المُعرّفات الحقيقية بدل `PLACEHOLDER` (staging وحدها) |
>
> وأُثبت أنّ القيود نافذة على D1 لا على SQLite المحلّي وحده: محاولة إدخال
> منشور بحالة `queued` بلا `approved_at` رُفضت بـ
> `CHECK constraint failed` (D-009)، وتراجعت الدفعة كاملةً فلم يبقَ أثر.
>
> **الباقي عليك في هذه المهمّة:** الخطّة المدفوعة، والطوابير، وR2،
> والأسرار، والنطاقان. وأمر إنشاء D1 وKV في القائمة أدناه صار **منفَّذاً**
> — لا تُعِد تشغيله فيُنشئ موردين مكرَّرين.

1. **ما هو**: تفعيل **Workers Paid** (Queues تتطلّبه)، وإضافة `sada` و`sada2` كسجلّات على `basserh.com`، ووضع الأسرار.
2. **لماذا الآن**: اليوم ١ ينشئ Queue وD1 وR2 على staging.
3. **الخطوات**:
   1. Dashboard ← **Workers & Pages** ← **Plans** ← **Workers Paid** (5 دولارات شهرياً).
   2. ~~**DNS**: سجلّان `CNAME` مؤقّتان لـ `sada` و`sada2`.~~ **صُحِّح 2026-09-03 — لا تُنشئ سجلّات DNS بيدك.** عند إضافة **Custom Domain** إلى الـ Worker تُنشئ Cloudflare السجلّ وتُصدر الشهادة بنفسها؛ ووجود سجلّ سابق بالاسم نفسه يُفشل الإضافة بـ `record already exists`. والشرط المسبق أن يكون `basserh.com` مُداراً في حساب Cloudflare نفسه.
   3. بعد نشر Worker staging، **Settings** ← **Variables and Secrets** ← أضف: `TOKEN_ENC_KEY` (32 بايت عشوائية بترميز base64)، `LINKEDIN_CLIENT_SECRET`، `X_CLIENT_SECRET`، `ANTHROPIC_API_KEY`، `GEMINI_API_KEY`.
4. **ما يعني النجاح**: صفحة Plans تعرض Workers Paid، والأسرار تظهر بأسمائها بلا قيم.
5. **ماذا لو فشل**: أرسل اسم الخطأ من صفحة Billing.
6. **ما يقع إن تُرك**: بلا Paid لا Queue، وبلا Queue لا نشر مجدول. خطر على المرحلة ١.

### إضافة 2026-09-03 · الأوامر بأسمائها الفعلية

بعد أن كُتب `wrangler.toml`، صارت أسماء الموارد مثبَّتة ولا تُخمَّن. نفّذ من
جذر المستودع بالترتيب، بعد `npx wrangler login`:

```bash
# ✅ نُفِّذا — لا تُعِدهما
# npx wrangler d1 create sada-staging
# npx wrangler kv namespace create KV --env staging

# ⬜ الباقي عليك:
npx wrangler r2 bucket create sada-media-staging      # بعد تفعيل R2 (M-09)
npx wrangler queues create sada-publish-staging       # بعد Workers Paid
npx wrangler queues create sada-generate-staging
npx wrangler queues create sada-publish-dlq-staging
```

> `sada-publish-dlq-staging` طابور الرسائل الميتة: ما فشل ثلاث مرّات يُنقَل
> إليه بدل أن يدور في الطابور إلى الأبد. وكلّ دورة على X تُحاسَب، فالدوران
> بلا حدّ إنفاقٌ بلا نتيجة.

يطبع الأمران الأوّل والثالث مُعرّفين. انسخهما إلى `wrangler.toml` مكان
`PLACEHOLDER_D1_STAGING_ID` و`PLACEHOLDER_KV_STAGING_ID`. المُعرّفات ليست
أسراراً وتُدفَع في المستودع؛ الأسرار وحدها تدخل بالأمر التالي:

```bash
openssl rand -base64 32                              # القيمة لا تُلصَق في محادثة
npx wrangler secret put TOKEN_ENC_KEY        --env staging
npx wrangler secret put LINKEDIN_CLIENT_ID   --env staging
npx wrangler secret put LINKEDIN_CLIENT_SECRET --env staging
npx wrangler secret put X_CLIENT_ID          --env staging
npx wrangler secret put X_CLIENT_SECRET      --env staging
```

الترحيل **طُبّق فعلاً** على `sada-staging` في 2026-09-04. الأمر أدناه يبقى
للإنتاج ولأي ترحيل لاحق:

```bash
npm run migrate:staging     # لا يلزم الآن — 0001 مطبَّق
npm run migrate:production  # بعد إنشاء قاعدة الإنتاج
```

**ما يعني النجاح** — أمران يُجابان:

```bash
npx wrangler d1 execute sada-staging --env staging --remote \
  --command "SELECT count(*) AS n FROM sqlite_master WHERE type='table'"
# المتوقَّع: n = 11  (عشرة جداول + جدول ترحيلات wrangler)

curl -s https://sada2.basserh.com/ready
# المتوقَّع: {"ready":true,"missing_secrets":[],"database":"ok"}
```

`/ready` يردّ 503 ويسمّي الناقص ما دام سرٌّ غائباً — فلا يبدو النظام جاهزاً
وهو ليس كذلك. وهو المرجع، لا الظنّ.

## M-10 · سرّ النشر في GitHub

1. **ما هو**: رمز Cloudflare API يُوضَع في **أسرار GitHub** — لا هنا ولا في
   المستودع — فينشر `deploy.yml` تلقائيًّا عند كلّ دمج في `main`.
2. **لماذا الآن**: لا أملك أداة نشر، ونطاق `mcp.cloudflare.com` محجوب من
   بيئتي. وهذا المسار ينشر بلا أن يمرّ الرمز بي إطلاقاً.
3. **الخطوات**:
   1. `dash.cloudflare.com` ← أيقونة الحساب ← **API Tokens** ← **Create Token**
   2. اختر قالب **Edit Cloudflare Workers**
   3. في **Account Resources** اختر حسابك، وفي **Zone Resources** اختر
      `basserh.com`
   4. **Continue** ← **Create Token** ← انسخ القيمة **مرّة واحدة**
   5. `github.com/mooryali95/sada/settings/secrets/actions` ←
      **New repository secret**
      - **Name**: `CLOUDFLARE_API_TOKEN` · **Secret**: الصِق القيمة
   6. أضف سرّاً ثانياً: `CLOUDFLARE_ACCOUNT_ID` (من الشريط الجانبي في
      Cloudflare ← **Account ID**)
4. **ما يعني النجاح**: بعد أوّل دمج في `main`، تبويب **Actions** يعرض
   `deploy` أخضر، وينتهي بخطوة «التحقّق من الجاهزية» تطبع جواب `/ready`.
5. **ماذا لو فشل**:
   - `CLOUDFLARE_API_TOKEN غير مضبوط` → السرّ لم يُحفظ باسمه بالضبط.
   - فشل الترحيل → قاعدة الإنتاج لم تُنشأ بعد؛ الأمر يخصّ `staging` وحدها.
   - `/ready` ردّ 503 → **ليس عطلاً**: يسمّي السرّ الناقص. اضبطه بـ
     `wrangler secret put`.
6. **ما يقع إن تُرك**: كلّ نشر يبقى يدويًّا منك في كلّ مرّة، ويبقى النظام
   بلا نشر أصلاً ما دمتَ لم تنشره يدوياً. **يوقف بوّابة المرحلة ٠.**

## M-06 · Google Cloud: حساب خدمة لقراءة Drive

1. **ما هو**: حساب خدمة بصلاحية قراءة على مجلّد واحد في Drive.
2. **لماذا الآن**: الأسبوع ٢ يبدأ قراءة المصادر.
3. **الخطوات**:
   1. `https://console.cloud.google.com` ← مشروع جديد `sada`.
   2. **APIs & Services** ← **Enable** ← **Google Drive API**.
   3. **IAM & Admin** ← **Service Accounts** ← **Create** باسم `sada-reader` ← **Keys** ← **Add key** ← JSON.
   4. في Drive: شارك مجلّد المصادر مع بريد حساب الخدمة بصلاحية **Viewer**.
   5. ضع محتوى JSON في سرّ Worker `GOOGLE_SA_JSON`. لا يُلصَق في المحادثة.
4. **ما يعني النجاح**: مجلّد المصادر يظهر فيه حساب الخدمة ضمن المشاركين.
5. **ماذا لو فشل**: أرسل اسم الخطأ من Console.
6. **ما يقع إن تُرك**: طبقة الفهم لا تعمل؛ يبقى النشر اليدوي فقط. تأجيل.
