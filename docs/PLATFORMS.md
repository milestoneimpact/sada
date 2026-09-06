# حقائق المنصّات — متحقَّق منها

> تاريخ التحقّق: 2026-09-02. الأسعار والصلاحيات تتغيّر؛ هذا الملفّ يُحدَّث عند
> كلّ تغيير مع تاريخه. موقعا `developer.x.com` و`learn.microsoft.com` كانا
> محجوبين من بيئة التحقّق، فاعتُمد على أدلّة 2026 المستقلّة الناقلة عن الوثائق
> الرسمية. ما لم يُؤكَّد مكتوبٌ صراحةً «غير مؤكَّد».

## LinkedIn

| البند | الحقيقة | المصدر |
|---|---|---|
| النشر على الحساب الشخصي | منتج `Share on LinkedIn` ذاتيّ الخدمة يمنح `w_member_social` بلا مراجعة | Blotato posting guide · Zernio |
| النطاقات للحساب الشخصي | `openid profile w_member_social` مع `Sign In with LinkedIn using OpenID Connect` | Blotato |
| أنواع المنشورات | نصّ، صورة، فيديو، مستند، متعدّد الصور، استطلاع، مقال | Microsoft Learn (Posts API) |
| النشر على صفحة شركة | يتطلّب `Community Management API` و`w_organization_social` | Microsoft Learn |
| شروط طلب الوصول | بريد عمل موثَّق، اسم قانوني، عنوان مسجَّل، موقع، سياسة خصوصية، وتصديق Super Admin للصفحة | singhamandeep.com · connectsafely |
| Development Tier | 500 طلب للتطبيق يوميّاً، 100 للعضو | Microsoft Learn migration guide |
| الترقية إلى Standard | تسجيل شاشة يُظهر OAuth كاملاً والنشر؛ المهلة 12 شهراً وإلا يُسحَب الوصول | singhamandeep.com |
| الرسوم | لا رسوم لكلّ منشور؛ الحدود بالطلبات | Blotato pricing |
| الترويسة الإلزامية | `LinkedIn-Version: YYYYMM` في كلّ طلب مُصدَّر | Blotato |
| الرموز | `access_token` 60 يوماً؛ `refresh_token` 365 يوماً للتطبيقات المخوَّلة | وثائق OAuth (غير مؤكَّد للتاريخ الحالي) |

## X

| البند | الحقيقة | المصدر |
|---|---|---|
| نموذج التسعير | دفع بالاستخدام عبر رصيد مسبق؛ لا اشتراك ولا حدّ أدنى | docs.x.com pricing · opentweet |
| إنشاء منشور (نصّ أو وسائط) | 0.015 دولار للطلب | docs.x.com · Blotato |
| إنشاء منشور يحوي رابطاً | 0.200 دولار للطلب | docs.x.com · Blotato |
| قراءة مورد مملوك | 0.001 دولار للمورد | opentweet |
| قراءة منشور طرف ثالث | نحو 0.005 دولار | Blotato |
| رفع الوسائط | **غير مؤكَّد** — يُقرأ من Developer Console | — |
| المطوّرون الجدد | لا Basic ولا Pro؛ قسيمة اختبار صغيرة لمرّة واحدة | opentweet |
| آخر تغيير سعري | 20 أبريل 2026، أُعلن في منتدى المطوّرين لا في بيان | Blotato |
| OAuth | 2.0 مع PKCE؛ النطاقات `tweet.read tweet.write users.read offline.access` | وثائق X (غير مؤكَّد للتاريخ الحالي) |

## نتائج تصميمية مباشرة

1. الثريد يُحاسَب بعدد منشوراته لا كوحدة.
2. الرابط في X يكلّف 13 ضعف المنشور العاديّ؛ لذلك `has_url` يُحسَب بالشيفرة ويُعرَض قبل الاعتماد.
3. التكلفة تُقرأ من كلّ استجابة وتُسجَّل في `cost_ledger`، ولا تُفترَض من هذا الملفّ.
4. طلب `Community Management API` يُقدَّم في اليوم الأوّل، ولا يُبنى عليه شيء قبل اعتماده.

## ما بُنيت عليه الشيفرة — ويُصحَّح عند أوّل دورة حقيقية

أُضيف 2026-09-03. القيم في `src/lib/oauth/providers.ts`، موضعٌ واحد لا أكثر:

| المنصّة | النهاية | القيمة المفترَضة | حالتها |
|---|---|---|---|
| LinkedIn | authorize | `https://www.linkedin.com/oauth/v2/authorization` | مستقرّة منذ سنين |
| LinkedIn | token | `https://www.linkedin.com/oauth/v2/accessToken` | مستقرّة |
| LinkedIn | الهوية | `https://api.linkedin.com/v2/userinfo` | OIDC، يعيد `sub` |
| LinkedIn | الترويسة | `LinkedIn-Version: 202606` | تُرفَع يدوياً بعد قراءة ملاحظات التغيير |
| X | authorize | `https://x.com/i/oauth2/authorize` | **غير مؤكَّدة** |
| X | token | `https://api.x.com/2/oauth2/token` | **غير مؤكَّدة** |
| X | الهوية | `https://api.x.com/2/users/me` | **غير مؤكَّدة** |

مصادقة نهاية الرمز تختلف: LinkedIn يقبل `client_secret` في الجسم، وX يوجب
ترويسة `Basic`. وكلاهما يمرّ بـ PKCE في صدى — X لأنّه يوجبه، وLinkedIn لأنّ
المسار واحد ولا يتشعّب بحالتين.

الثلاثة الموسومة «غير مؤكَّدة» تُثبتها أوّل دورة OAuth حقيقية، والمهمّة
`M-04` تطلب التحقّق منها قبلها.

## ما قِيس من نهاية رمز LinkedIn — حرفا

أُضيف 2026-09-06 بعد قياسٍ حيّ على تطبيق المالك.

| ما أُرسل | ما عاد |
|---|---|
| `client_credentials` + سرٌّ خاطئ | `invalid_client` · «Client authentication failed» |
| `client_credentials` + معرّفٌ مجهول | `invalid_client_id` · «The passed in client_id is invalid …» |
| `client_credentials` + **تطبيقٌ بلا منحة رموز التطبيقات** | `access_denied` · «This application is not allowed to create application tokens» |
| `authorization_code` + رمزٌ باطل | `invalid_request` · «Unable to retrieve access token: authorization code not found» |

**وثلاثةُ أحكامٍ تُستخرَج من هذا الجدول:**

1. **الرمزُ يُفحَص قبل السرّ** في منحة `authorization_code` — فجوابُ الرمز
   الباطل يعود **سواءٌ صحَّ السرُّ أم لم يصحّ**، ولا يميّز.
2. **`access_denied` خطأُ منتَجٍ لا خطأُ توثيق** — يعود بالنصّ نفسِه لأيّ
   سرّ. **وقراءتُه جوازا كذبٌ صريح** (D-076).
3. فحصُ الزوج بمنحة `client_credentials` **لا يحكم لتطبيقٍ بلا هذا
   المنتَج**. والبرهانُ الوحيد نجاحُ الربط.

## عقدُ رفع YouTube — مقروءٌ من وثيقة Google لا من الذاكرة

أُضيف 2026-09-06. المصدرُ **آليّ**: `discovery/v1/apis/youtube/v3/rest`
— وهي الوثيقةُ التي تولّد منها Google عملاءَها، فلا تشيخ عن الواجهة.

| القيمة | ما قرأتُه | كيف تُعاد قراءتُه |
|---|---|---|
| المسار | `youtube/v3/videos` · `POST` | `resources.videos.methods.insert.path` |
| الرفعُ المستأنَف | `/resumable/upload/youtube/v3/videos` | `…insert.mediaUpload.protocols.resumable` |
| الرفعُ البسيط | `/upload/youtube/v3/videos` | `…protocols.simple` |
| المعامل الإلزاميّ | `part` | `…parameterOrder` |
| النطاق | `…/auth/youtube.upload` | `…insert.scopes` |
| السقف | ‏٢٥٦ غيغابايت | `…mediaUpload.maxSize` |
| المقبول | `video/*` · `application/octet-stream` | `…mediaUpload.accept` |

**وما في `providers.ts` صحيحٌ ومقيس:**

    https://www.googleapis.com/upload/youtube/v3/videos
      ?uploadType=resumable&part=snippet,status

نُودي بلا إذنٍ فردّ **401** (فالمسار موجود)، وبـ`uploadType` مخترَعٍ ردّ
**400** — **فالمعاملُ يُفحَص فعلا**، وليس مُهمَلا يُظنّ مقبولا.

**والنطاقُ الذي نطلبه هو الذي يوجبه الرفع** — طُوبق حرفا.

## و TikTok لا يُقاس من هنا

`open.tiktokapis.com` و `developers.tiktok.com` **محجوبان** (اتّصالٌ لا
يقوم أصلا، لا رفضٌ ولا مهلة). فما في `providers.ts` من نهاياتها **مكتوبٌ
بلا قياس**، ويبقى موسوما كذلك.

**ولا يُبنى لها سائقُ نشرٍ من الذاكرة**: ليلةُ D-071 حتّى D-077 كلُّها
درسٌ واحد — **قيمةٌ تُكتب بلا مصدرٍ تكذب، وثمنُها يقع بعد شهور**.

## المصادر

- https://docs.x.com/x-api/getting-started/pricing
- https://opentweet.io/how-to/x-api-pay-per-use-explained
- https://www.blotato.com/blog/twitter-api-pricing
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-06
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide?view=li-lms-2026-06
- https://singhamandeep.com/linkedin-community-management-api-access/
- https://www.blotato.com/blog/linkedin-posting-api
- https://www.blotato.com/blog/linkedin-api-pricing
- https://postproxy.dev/blog/linkedin-api-automate-company-page-publishing/
