# إعداد المساعد على Cloudflare

> أُنشئ 2026-09-03. المصدر: إرشادات `developers.cloudflare.com/agent-setup`،
> استُخرجت عبر أداة وثائق Cloudflare داخل الموصّل — لأنّ النطاق نفسه محجوب
> من بيئة المساعد بسياسة المنظّمة (رفض `CONNECT` بـ 403).

## ١ · لماذا هذا الملفّ

المساعد يحتاج ثلاث طبقات ليعمل على Cloudflare، ولا تُغني واحدة عن أخرى:

| الطبقة | ما تفعله |
|---|---|
| **موصّل محدود** (`Cloudflare Developer Platform`) | D1 · KV · R2 · Hyperdrive · قراءة Workers |
| **خادم API الكامل** (`mcp.cloudflare.com`) | أكثر من ٢٥٠٠ نقطة نهاية: DNS · Queues · الأسرار · نشر Workers |
| **wrangler CLI** | التطوير المحلّي والنشر والترحيل |

## ٢ · ما هو مربوطٌ الآن

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

### ❌ لا يعمل — كلّ نطاقات Cloudflare محجوبة

```
developers.cloudflare.com          CONNECT → 403
mcp.cloudflare.com                 CONNECT → 403
docs.mcp.cloudflare.com            CONNECT → 403
observability.mcp.cloudflare.com   CONNECT → 403
```

الحجب **بسياسة المنظّمة على وسيط الخروج**، لا عطل عابر. فخوادم MCP الثلاثة
في `.mcp.json` **لا تعمل داخل جلسة المساعد السحابية** — وتعمل عندك محليًّا.

## ٣ · ما يقع عليك — بالعناصر الستّة

### M-08 · تفعيل خوادم Cloudflare MCP على جهازك

1. **ما هو**: ربط `claude` عندك بخادم Cloudflare API الكامل، وهو ما يفتح
   DNS وQueues والأسرار ونشر Workers للمساعد.
2. **لماذا الآن**: الموصّل الحالي لا يملك أدوات طوابير ولا نطاقات ولا نشر.
   وكلّها مطلوبة لاجتياز بوّابة المرحلة صفر.
3. **الخطوات**:
   1. افتح الطرفية في جذر المستودع.
   2. المستودع يحمل `.mcp.json` — سيسألك `claude` عند فتحه:
      **«Use MCP servers from this project?»** ← اختر **Yes**.
   3. إن لم يسأل، أضِفها يدويًّا:
      ```bash
      claude mcp add --transport http cloudflare-api  https://mcp.cloudflare.com/mcp
      claude mcp add --transport http cloudflare-docs https://docs.mcp.cloudflare.com/mcp
      ```
   4. عند أوّل استدعاء يفتح المتصفّح لتفويض OAuth — اقرأ الصلاحيات ثمّ وافق.
   5. تحقّق: `claude mcp list`
4. **ما يعني النجاح**: `claude mcp list` يعرض `cloudflare-api` بحالة
   `connected`، وسؤالٌ مثل «اعرض نطاقاتي في Cloudflare» يُجاب بقائمة حقيقية.
5. **ماذا لو فشل**: إن تعذّر النقل المباشر، استعمل الجسر:
   ```bash
   claude mcp add cloudflare-api -- npx -y mcp-remote https://mcp.cloudflare.com/mcp
   ```
   وإن فشلت المصادقة: `claude mcp remove cloudflare-api` ثمّ أعِد الإضافة.
6. **ما يقع إن تُرك**: المساعد يبقى قادرًا على D1 وKV وR2 وحدها. الطوابير
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
