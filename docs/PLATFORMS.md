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
