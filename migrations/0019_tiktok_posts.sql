-- نشرُ TikTok — **والقيدُ يُوسَّع في ترحيل سائقه، كما وُعد** (D-092).
--
-- ## الوعدُ الذي كُتب في 0013
--
-- «`posts.platform` يبقى كما هو: لا سائقَ نشرٍ لهما بعد. ومسوّدةٌ تُكتب
-- لمنصّةٍ لا تنشر هي وعدٌ يُخلَف عند الجدولة — والقاعدةُ هي التي تمنعه،
-- لا الشيفرة (D-009). فيُترك القيدُ حارسا حتّى يُبنى السائقُ، **ويُوسَّع
-- في ترحيله هو**.»
--
-- وقد بُني سائقُ TikTok (`publish/tiktok.ts`)، فيُوسَّع القيدُ له وحدَه.
-- **و YouTube و Instagram يبقيان خارجَه** حتّى يُبنى سائقاهما — فالحارسُ
-- يُفتَح بقدر ما بُني لا بقدر ما يُنوى.
--
-- ## ولماذا يعمل TikTok اليوم بلا انتظار إجازة
--
-- لِـ Content Posting API بابان: `video.upload` **يوصل المقطعَ صندوقَ
-- التطبيق** فينشره المالكُ بيده — ويعمل يومَ يُربَط الحساب. و
-- `video.publish` ينشر مباشرةً **ويحتاج مراجعةَ محتوى تستغرق أسابيع**.
--
-- فالسائقُ يختار البابَ من النطاق الممنوح، ولا ينتظر الإجازةَ ليعمل.
--
-- ## و SQLite لا يبدّل قيدا
--
-- فيُعاد بناءُ الجدول. والصفوفُ تُنقل كما هي بعمودٍ عمود — **ولا صفَّ
-- يضيع، ولا قيدَ من قيود D-009 يسقط في الطريق**: الأربعةُ تُنسَخ حرفا.
PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES plans(id) ON DELETE SET NULL,
  account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  -- ثلاثٌ تنشر اليوم. والباقيتان تُربطان ولا تنشران — **والفرقُ في
  -- القيد لا في الواجهة وحدها**
  platform        TEXT NOT NULL CHECK (platform IN ('linkedin', 'x', 'tiktok')),
  source_id       TEXT REFERENCES sources(id) ON DELETE SET NULL,
  source_hash     TEXT,
  model           TEXT,
  cost_usd        REAL NOT NULL DEFAULT 0,
  thread_id       TEXT,
  thread_order    INTEGER,
  type            TEXT NOT NULL
                    CHECK (type IN ('text', 'image', 'document', 'thread')),
  text            TEXT NOT NULL,
  media_json      TEXT NOT NULL DEFAULT '[]',
  source_refs     TEXT NOT NULL DEFAULT '[]',
  rationale       TEXT,
  has_url         INTEGER NOT NULL DEFAULT 0 CHECK (has_url IN (0, 1)),
  scheduled_at    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'edited', 'rejected',
                                      'queued', 'published', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  approved_by     TEXT,
  approved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- **وعمودُ 0009 يُنقَل معه**: بناءٌ جديدٌ ينسى عمودا أُضيف لاحقا يمحوه
  dispatched_at   TEXT,
  -- D-009 وما لزم منه — الأربعةُ كما هي، لم يُمسّ منها حرف
  CHECK (status NOT IN ('queued', 'published') OR approved_at IS NOT NULL),
  CHECK (status NOT IN ('queued', 'published') OR account_id IS NOT NULL),
  CHECK (status NOT IN ('queued', 'published') OR scheduled_at IS NOT NULL),
  CHECK ((thread_id IS NULL) = (thread_order IS NULL))
);

INSERT INTO posts_new (
  id, plan_id, account_id, platform, source_id, source_hash, model, cost_usd,
  thread_id, thread_order, type, text, media_json, source_refs, rationale,
  has_url, scheduled_at, status, idempotency_key, approved_by, approved_at,
  created_at, dispatched_at
)
SELECT id, plan_id, account_id, platform, source_id, source_hash, model, cost_usd,
       thread_id, thread_order, type, text, media_json, source_refs, rationale,
       has_url, scheduled_at, status, idempotency_key, approved_by, approved_at,
       created_at, dispatched_at
  FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

-- والفهارسُ تُعاد كما هي **لا كما في 0001**: `DROP TABLE` يأخذها معه،
-- وبناءُ 0008 لم يُعِد `idx_posts_account` ولا `idx_posts_thread` — فهما
-- ساقطتان منذ ذلك الحين. **وإعادتُهما هنا تُغيِّر المخطّطَ خِلسةً** تحت
-- عنوانِ ترحيلٍ يقول إنّه يوسّع قيدا وحسب.
CREATE INDEX idx_posts_status ON posts (status, created_at DESC);
CREATE INDEX idx_posts_source ON posts (source_id, platform);
CREATE INDEX idx_posts_due    ON posts (status, scheduled_at);
