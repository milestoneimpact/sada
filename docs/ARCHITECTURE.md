# معمارية صدى

> Cloudflare-native. لا Postiz ولا n8n في الأساس (D-002).

## ١. المكوّنات

| المكوّن | الخدمة | الدور |
|---|---|---|
| `sada-api` | Worker (Hono) | OAuth callbacks، واجهة لوحة الاعتماد، عقود الخطّة والمنشور |
| `sada-web` | Pages | لوحة الاعتماد (تبدأ صفحةً واحدة) |
| `sada-publish` | Queue + consumer Worker | النشر الفعليّ، إعادة المحاولة بمفتاح، سجلّ التكلفة |
| `sada-generate` | Queue + consumer Worker | توليد النصّ والصور خارج دورة الطلب |
| Cron Triggers | Worker | يوميّاً: مسح Drive وسحب المقاييس · كلّ ساعة: دفع المستحقّ |
| D1 | قاعدة | كلّ الحالة |
| R2 | تخزين | الصور والمستندات والوسائط |
| KV | مفاتيح | عدّادات الحدّ، `dedupe` قصير العمر |
| Secrets | Worker secrets | `TOKEN_ENC_KEY` · `LINKEDIN_CLIENT_SECRET` · `X_CLIENT_SECRET` · `ANTHROPIC_API_KEY` · `GEMINI_API_KEY` · `GOOGLE_SA_JSON` |

الخدمات الخارجية: Google Drive API · Anthropic API · Gemini API · LinkedIn API · X API.

## ٢. تدفّق البيانات

    Google Drive
        │  (Cron يوميّ · حساب خدمة)
        ▼
    sources / content_items          ← ما تغيّر فقط، بـ hash للملفّ
        │
        ▼
    Claude: خطّة أسبوعية JSON        ← plans
        │
        ▼
    Claude: مسوّدات النصّ            ← posts (status = draft)
    Gemini: صور                      ← R2 + media
        │
        ▼
    لوحة الاعتماد (إنسان)            ← posts (status = approved | rejected | edited)
        │
        ▼
    Cron كلّ ساعة: المستحقّ → Queue  ← posts (status = queued)
        │
        ▼
    Publisher Worker                 ← publish_attempts (idempotency_key فريد)
        │                               cost_ledger (كلّ طلب مدفوع)
        ├──► LinkedIn API
        └──► X API
        │
        ▼
    Cron يوميّ: مقاييس 24h / 72h     ← metrics
        │
        ▼
    Claude: تقرير أسبوعي + توصية ترويج ← promotion_suggestions (توصية فقط)

## ٣. نموذج البيانات (D1)

| الجدول | الأعمدة الأساسية | ملاحظة |
|---|---|---|
| `accounts` | `id` · `platform` · `kind` (member/org) · `external_id` · `display_name` · `status` | حساب مربوط |
| `tokens` | `account_id` · `access_enc` · `refresh_enc` · `iv` · `expires_at` · `refresh_expires_at` · `scopes` | مشفّر AES-GCM (D-005) |
| `sources` | `id` · `drive_file_id` · `name` · `mime` · `content_hash` · `last_seen_at` | ملفّ في Drive |
| `content_items` | `id` · `source_id` · `summary` · `themes_json` · `worth_score` · `extracted_at` | ما فهمه Claude |
| `plans` | `id` · `week_start` · `plan_json` · `model` · `status` | خطّة أسبوعية |
| `posts` | `id` · `plan_id` · `account_id` · `type` · `text` · `media_json` · `has_url` · `scheduled_at` · `status` · `idempotency_key` · `approved_by` · `approved_at` | العقد أدناه |
| `publish_attempts` | `id` · `post_id` · `idempotency_key` · `attempt_no` · `request_json` · `response_json` · `platform_post_id` · `status` · `at` | كلّ محاولة، ناجحةً أو فاشلة |
| `metrics` | `post_id` · `window` (24h/72h/7d) · `impressions` · `reactions` · `comments` · `shares` · `clicks` · `pulled_at` | |
| `promotion_suggestions` | `post_id` · `suggested_budget` · `reason` · `human_decision` · `decided_at` | يقيس التطابق (D-006) |
| `cost_ledger` | `id` · `provider` · `operation` · `units` · `unit_cost` · `total` · `ref_id` · `at` | X · Claude · Gemini (D-008) |
| `media_claims` | `idempotency_key` · `post_id` · `kind` · `claimed_at` | **حجزٌ يسبق الإنفاق** — القيدُ الفريدُ على `media` يقع بعد الدفع (D-068) |
| `heartbeats` | `job` · `at` · `outcome` · `detail` | صفٌّ لكلّ دورةٍ يُستبدَل — «هل دارت ومتى» (D-158) |
| `auth_attempts` | `bucket` · `n` · `window_start` | حجزُ محاولات الدخول والتحدّيات قبل فحصها — عدٌّ ذرّيٌّ لكلّ عنوانٍ وللجميع في ربع ساعة (D-161) |

## ٤. عقد المنشور (ما يُخرجه Claude وتقرأه اللوحة والناشر)

```json
{
  "platform": "linkedin",
  "account": "linkedin:member:omar",
  "type": "image",
  "text": "…",
  "media": [{ "r2_key": "img/2026/09/abc.png", "alt": "…" }],
  "has_url": false,
  "scheduled_at": "2026-09-08T09:00:00+03:00",
  "source_refs": ["content_items:17"],
  "rationale": "لماذا هذا الآن، بجملتين"
}
```

قواعد العقد:

- `has_url` يُحسَب بالشيفرة لا بالنموذج، ويُعرَض في اللوحة مع تكلفته على X.
- `source_refs` إلزاميّ: لا منشور بلا مصدر يُرجَع إليه.
- `idempotency_key` **يُشتقُّ من المحتوى لا من المعرّف** — فيُحسَب قبل أن يوجد الصفّ:
  `draft:{source}:{platform}:{hash}` للمسوّدة، و `image:{post}:{hash8(text)}` للصورة.
  والقاعدةُ هي التي تفصل بين طلبين متزامنين (`UNIQUE`) لا الشيفرة.
- الثريد على X = عدّة `posts` مربوطة بـ `thread_id` وترتيب، كلّ واحد طلبٌ يُحاسَب.

## ٥. دورة حياة الرموز

| المنصّة | `access_token` | `refresh_token` | ما نفعله |
|---|---|---|---|
| LinkedIn | 60 يوماً | 365 يوماً (إن كان التطبيق مخوَّلاً بالتحديث المبرمج) | تنبيه قبل 7 أيام، مسار إعادة ربط بلا فقدان الجدولة |
| X (OAuth 2.0 PKCE) | ساعتان | طويل الأمد مع `offline.access` | تحديث تلقائيّ قبل كلّ نشر، وتنبيه عند فشل التحديث |

## ٦. البيئتان

| | staging | الإنتاج |
|---|---|---|
| النطاق | `sada2.basserh.com` | `sada.basserh.com` |
| Callback LinkedIn | `https://sada2.basserh.com/oauth/linkedin/callback` | `https://sada.basserh.com/oauth/linkedin/callback` |
| Callback X | `https://sada2.basserh.com/oauth/x/callback` | `https://sada.basserh.com/oauth/x/callback` |
| D1 / R2 / Queue | لاحقة `-staging` | بلا لاحقة |

## ٧. ما لا يعمل داخل Workers (فيُؤجَّل)

- Remotion يحتاج Chromium. الخيارات حين يحين وقته: Cloudflare Containers، أو
  Remotion Lambda على AWS، أو خدمة تصيير خارجية. لا يُبنى قبل المرحلة ٤.
