-- رفعُ YouTube — **والقيدُ يُوسَّع في ترحيل سائقه** (D-096).
--
-- كما وُسّع لـ TikTok في 0019، ولنفس القاعدة المكتوبة في 0013: «يُترك
-- القيدُ حارسا حتّى يُبنى السائقُ، **ويُوسَّع في ترحيله هو**».
--
-- وقد بُني `publish/youtube.ts` على عقدٍ **مقروءٍ من وثيقة Google الآليّة
-- ومقيسٍ حيّا** (D-078 · D-096): نُودي المسارُ بلا إذنٍ فردّ ٤٠١، وبـ
-- `uploadType` مخترَعٍ ردّ ٤٠٠.
--
-- **و Instagram تبقى خارجَه** حتّى يُبنى سائقُها — فالحارسُ يُفتَح بقدر
-- ما بُني لا بقدر ما يُنوى.
--
-- ## وما يقع أوّلَ رفع
--
-- نطاقُ الرفع «حسّاسٌ» عند Google، ومشروعٌ لم يُجَز يبقى في `Testing`.
-- **و YouTube تقفل مرفوعاتِه على `private`** — فالمقطعُ يصل القناةَ
-- خاصّا وينشره المالكُ بيده، كصندوق TikTok.
--
-- ## و SQLite لا يبدّل قيدا
--
-- فيُعاد بناءُ الجدول، والصفوفُ تُنقل بعمودٍ عمود — **ولا صفَّ يضيع، ولا
-- قيدَ من قيود D-009 يسقط في الطريق**.
PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES plans(id) ON DELETE SET NULL,
  account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  -- أربعٌ تنشر اليوم. و Instagram تُربَط ولا تنشر — **والفرقُ في
  -- القيد لا في الواجهة وحدها**
  platform        TEXT NOT NULL
                    CHECK (platform IN ('linkedin', 'x', 'tiktok', 'youtube')),
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
  -- وعمودُ 0009 يُنقَل معه: بناءٌ جديدٌ ينسى عمودا أُضيف لاحقا يمحوه
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
