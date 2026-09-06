-- طبقةُ الكتابة — والمسوّدةُ تسبق الحساب.
--
-- كان `account_id` في `posts` من نوع NOT NULL، فلا تُكتب مسوّدةٌ قبل ربط
-- حسابٍ في LinkedIn أو X. **وهذا خطأُ ترتيب**: المسوّدةُ تستهدف منصّةً،
-- والحسابُ يُبَتّ عند الاعتماد لا عند الكتابة. ولولا هذا لما رأى المالك
-- حرفا ممّا يكتبه النظام حتّى تنتهي مهامٌّ خارجيّة مدّتُها أسابيع.
--
-- ولا يُمسّ قيدُ D-009: `status NOT IN ('queued','published') OR
-- approved_at IS NOT NULL` يبقى كما هو — **والقاعدةُ هي التي تمنع النشر
-- بلا اعتماد، لا الشيفرة.** ويُضاف إليه قيدٌ ثانٍ: لا طابورَ بلا حساب.

-- SQLite لا يبدّل قيدا ولا يرفع NOT NULL، فيُعاد بناء الجدول.
CREATE TABLE posts_new (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES plans(id) ON DELETE SET NULL,
  -- **يقبل الفراغ الآن**: تُكتب المسوّدة قبل الربط
  account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  -- المنصّةُ المستهدَفة — تُعرف قبل الحساب، ولكلٍّ صياغتُها
  platform        TEXT NOT NULL CHECK (platform IN ('linkedin', 'x')),
  -- المصدرُ الذي جاءت منه، وبصمةُ نسخته: مصدرٌ لم يتغيّر لا يُسوَّد ثانية
  source_id       TEXT REFERENCES sources(id) ON DELETE SET NULL,
  source_hash     TEXT,
  -- مَن كتبها وبكم — على الصفّ، فلا يُبحث عنه في دفترٍ آخر
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
  -- **يقبل الفراغ**: المسوّدةُ لا موعدَ لها حتّى تُعتمد وتُجدوَل
  scheduled_at    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'edited', 'rejected',
                                      'queued', 'published', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  approved_by     TEXT,
  approved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- D-009: لا نشر بلا اعتماد بشريّ — القيدُ الأصل، لم يُمسّ
  CHECK (status NOT IN ('queued', 'published') OR approved_at IS NOT NULL),
  -- وقيدٌ يلزم من فتحِ `account_id`: لا طابورَ إلى حسابٍ لا وجود له
  CHECK (status NOT IN ('queued', 'published') OR account_id IS NOT NULL),
  -- ولا جدولةَ بلا موعد
  CHECK (status NOT IN ('queued', 'published') OR scheduled_at IS NOT NULL),
  CHECK ((thread_id IS NULL) = (thread_order IS NULL))
);

-- الصفوفُ القائمة تُنقل بمنصّتها من حسابها — ولا صفَّ يضيع
INSERT INTO posts_new (
  id, plan_id, account_id, platform, thread_id, thread_order, type, text,
  media_json, source_refs, rationale, has_url, scheduled_at, status,
  idempotency_key, approved_by, approved_at, created_at
)
SELECT p.id, p.plan_id, p.account_id, a.platform, p.thread_id, p.thread_order,
       p.type, p.text, p.media_json, p.source_refs, p.rationale, p.has_url,
       p.scheduled_at, p.status, p.idempotency_key, p.approved_by, p.approved_at,
       p.created_at
  FROM posts p JOIN accounts a ON a.id = p.account_id;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

-- الاستعلامُ الغالب في اللوحة: المسوّدات أوّلا، والأحدثُ أوّلا
CREATE INDEX idx_posts_status ON posts (status, created_at DESC);
-- وفحصُ «أسُوّدت بنسخته؟» قبل كلّ نداءٍ مدفوع
CREATE INDEX idx_posts_source ON posts (source_id, platform);
