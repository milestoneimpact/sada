# إعداد المساعد على Cloudflare

> أُنشئ 2026-09-03، ونُقّح 2026-09-04 بعد فتح النطاق.
> المصدر: `developers.cloudflare.com/agent-setup/prompt.md` — جُلب حرفيًّا
> ونُفِّذ. (في 2026-09-03 كان النطاق محجوبًا فاستُخرج مضمونه من أداة وثائق
> Cloudflare؛ وفي 2026-09-04 فُتح النطاق فجُلب الأصل ونُفِّذ كما هو.)

## ١ · لماذا هذا الملفّ

المساعد يحتاج ثلاث طبقات ليعمل على Cloudflare، ولا تُغني واحدة عن أخرى:

| الطبقة | ما تفعله |
|---|---|
| **موصّل محدود** (`Cloudflare Developer Platform`) | D1 · KV · R2 · Hyperdrive · قراءة Workers |
| **خادم API الكامل** (`mcp.cloudflare.com`) | أكثر من ٢٥٠٠ نقطة نهاية: DNS · Queues · الأسرار · نشر Workers |
| **wrangler CLI** | التطوير المحلّي والنشر والترحيل |

## ٢ · ما هو مربوطٌ الآن

### ✅ نُفِّذ 2026-09-04 — إضافة Cloudflare الرسمية

الأمران المنصوص عليهما في إرشادات Cloudflare لـ Claude Code، نُفِّذا كما هما:

```bash
claude plugin marketplace add cloudflare/skills
claude plugin install cloudflare@cloudflare
```

النتيجة — `cloudflare@cloudflare` v1.0.0 · نطاق المستخدم · مُفعَّلة:

| المكوّن | ما جاء |
|---|---|
| **خادم MCP** | `cloudflare` → `mcp.cloudflare.com/mcp` (API الكامل · Code Mode) |
| **١٢ مهارة** | `wrangler` · `workers-best-practices` · `durable-objects` · `agents-sdk` · `sandbox-*` · `cloudflare-one` · `web-perf` · `turnstile-spin` · `cloudflare-email-service` |
| **أمران** | `/cloudflare:build-agent` · `/cloudflare:build-mcp` |

الإرشادات تنصّ صراحةً: **لا تستعمل `npx skills` ولا `claude mcp add`** —
أمرا الإضافة يكفيان. ولذلك لا يذكر `.mcp.json` خادم `cloudflare`: تكراره
يعني خادمين بعنوان واحد واسمين مختلفين ودورتَي OAuth.

**يبقى عليك خطوة واحدة:** شغّل `/reload-plugins` داخل Claude لتفعيلها.

### ✅ يعمل — الموصّل المحدود

مربوط ومُصادَق على حساب المالك، ويمرّ عبر وسيط Anthropic لا عبر الخروج
المباشر — ولذلك يعمل رغم حجب النطاقات.

مُتحقَّقٌ منه عمليًّا في 2026-09-03:

| المورد | الحالة الفعلية |
|---|---|
| Workers | ١ — `supabase-keep-alive` (قراءة فقط) |
| D1 | ١ — `deom-day` · صفر جداول |
| KV | صفر مساحات |
| R2 | 🔴 **غير مُفعَّل** — `403 · code 10042` |

**ما يستطيعه المساعد بنفسه:** إنشاء D1 وتشغيل الترحيل عليها والتحقّق منه،
وإنشاء KV، وإنشاء R2 بعد تفعيله.

### ⚠️ حالة الشبكة — تغيّرت في 2026-09-04

| النطاق | 2026-09-03 | 2026-09-04 |
|---|---|---|
| `developers.cloudflare.com` | `403` | **`200`** ✅ |
| `mcp.cloudflare.com` | `403` | `403` ❌ |
| `docs.mcp.cloudflare.com` | `403` | `403` ❌ |

فُتح نطاق الوثائق فجُلبت الإرشادات ونُفِّذت. أمّا نطاقات **خوادم MCP** فما
تزال محجوبة على وسيط الخروج، ولذلك:

- الإضافة **مُركَّبة** ومهاراتها الاثنتا عشرة تعمل بلا شبكة.
- خادم `cloudflare` وخوادم `.mcp.json` **لا تتّصل من الجلسة السحابية** —
  وتعمل عندك محليًّا.
- الجلسة السحابية **غير تفاعلية** أصلًا، فلا يمكن تشغيل تدفّق OAuth فيها.

## ٣ · ما يقع عليك — بالعناصر الستّة

### M-08 · تفعيل الإضافة وتفويضها على جهازك

1. **ما هو**: تشغيل `/reload-plugins` لتفعيل إضافة Cloudflare المُركَّبة،
   ثمّ تفويض خادم `cloudflare` بـ OAuth عند أوّل استعمال.
2. **لماذا الآن**: الإضافة رُكِّبت فعلًا (`cloudflare@cloudflare` v1.0.0)،
   لكنّ مهاراتها لا تُحمَّل قبل إعادة التحميل، وخادمها لا يعمل قبل التفويض.
   وهو ما يفتح DNS وQueues والأسرار ونشر Workers — وكلّها مطلوبة لاجتياز
   بوّابة المرحلة صفر ولا يوفّرها الموصّل المحدود.
3. **الخطوات**:
   1. من جهازك: `git pull` في جذر المستودع.
   2. افتح `claude` ثمّ شغّل: `/reload-plugins`
   3. المستودع يحمل `.mcp.json` — سيسأل: **«Use MCP servers from this
      project?»** ← اختر **Yes**.
   4. اطلب شيئًا يمسّ Cloudflare — «اعرض نطاقاتي» مثلًا. يفتح المتصفّح
      لتفويض OAuth: **اقرأ الصلاحيات ثمّ وافق**.
   5. تحقّق: `claude plugin list` و`claude mcp list`.
4. **ما يعني النجاح**: `claude plugin list` يعرض `cloudflare@cloudflare`
   بحالة `enabled`، و`claude mcp list` يعرض `cloudflare` بحالة
   `connected`، وسؤالٌ عن نطاقاتك يُجاب بقائمة حقيقية لا باعتذار.
5. **ماذا لو فشل**:
   - لم تظهر المهارات بعد `/reload-plugins` → أغلق `claude` وافتحه.
   - فشلت المصادقة → `claude plugin uninstall cloudflare@cloudflare` ثمّ
     أعِد الأمرين في §٢.
   - **لا تستعمل `npx skills` ولا `claude mcp add` لخادم `cloudflare`** —
     الإرشادات الرسمية تمنعهما صراحةً، وأمرا الإضافة يغنيان عنهما.
6. **ما يقع إن تُرك**: المساعد يبقى على D1 وKV وR2 وحدها. الطوابير
   والنطاقات والنشر تبقى يدوية عليك في كلّ مرّة. **تأجيل، لا خطر.**

### M-09 · تفعيل R2

1. **ما هو**: تفعيل R2 Object Storage على الحساب.
2. **لماذا الآن**: `MEDIA` مربوط في `wrangler.toml`، والصور في المرحلة ٢.
3. **الخطوات**: `dash.cloudflare.com` ← **R2 Object Storage** ← **Enable R2**
   ← أدخل بيانات الدفع.
4. **ما يعني النجاح**: تظهر صفحة R2 وفيها زرّ `Create bucket`. وبعدها ينجح
   `r2_buckets_list` عند المساعد بدل `403`.
5. **ماذا لو فشل**: أرسل نصّ الخطأ من صفحة الفوترة.
6. **ما يقع إن تُرك**: المرحلة ٠ تعمل بلا R2. المرحلة ٢ لا تبدأ.

## ٤ · ما لا يُفعَل — خطّ لا يُتجاوز

**رمز Cloudflare API لا يُلصَق في محادثة ولا يُكتَب في ملفّ في المستودع.**

للنشر الآليّ، الطريق الوحيد المقبول:

```
أنت → Cloudflare Dashboard → إنشاء رمز بصلاحية "Edit Cloudflare Workers"
أنت → GitHub → Settings → Secrets → CLOUDFLARE_API_TOKEN
CI  → يقرأه من أسرار GitHub وينشر
```

الرمز لا يمرّ بالمساعد، ولا يظهر في سجلّ، ولا يُخزَّن في المستودع.

## ٥ · مرجع سريع

| الأمر | ما يفعله |
|---|---|
| `claude mcp list` | يعرض الخوادم وحالتها |
| `claude mcp remove <name>` | يحذف خادمًا |
| `npx wrangler login` | يصادق wrangler على الحساب |
| `npx wrangler deploy --env staging` | ينشر |
| `npm run migrate:staging` | يطبّق الترحيلات |
