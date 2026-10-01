-- مقاطعُ المالك (D-180) — **يرفعها هو، وتُنشَر إلى ثلاث منصّاتٍ من نسخةٍ واحدة**.
--
-- كان كلُّ وسيطٍ في `media` مولَّدًا لمنشورٍ واحد، فكان `r2_key` فريدًا: كائنٌ
-- واحدٌ لصفٍّ واحد. ومقطعُ المالك يُرفَع مرّةً ويُنشَر على YouTube وTikTok
-- وInstagram — **ثلاثةُ صفوفٍ لكائنٍ واحد**. ونسخُ الكائن ثلاثًا في R2 يضاعف
-- التخزينَ والرفع، والقيدُ يمنع غيرَه. فيُرفع القيدُ عن `r2_key` وحدَه، ويبقى
-- `idempotency_key` فريدًا كما كان (D-004).
--
-- **ولا يُحذَف الكائنُ عند رفض صفّ**: لا شيءَ في الشيفرة يحذف كائنًا عند الرفض
-- (الحذفُ في `image/job.ts` تنظيفُ إدراجٍ فشل)، فمقطعٌ رُفض على منصّةٍ يبقى لغيرها.

-- ١ — سجلُّ الرفع: ما رُفع، وحالُه، ومعرّفُ الرفع المتعدّد في R2 ما دام جاريًا.
-- والأبعادُ والمدّةُ من متصفّح المالك (`<video>`): تُعرَض وتُفحَص بها حدودُ المنصّات،
-- والمنصّةُ تفحص بنفسها بعد ذلك. فلا يُبنى عليها قيدٌ في القاعدة.
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime LIKE 'video/%'),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'ready', 'failed')),
  multipart_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ready_at TEXT
);
CREATE INDEX idx_uploads_status ON uploads (status, created_at DESC);

-- ٢ — `media` بلا قيدٍ على `r2_key`، ومعها صلةُ الرفع ومدّتُه.
-- **والأعمدةُ كلُّها تُنقَل** (0011 و0017 و0028 و0029): بناءٌ ينسى عمودًا أُضيف لاحقًا يمحوه.
CREATE TABLE media_new (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'rejected')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  platform_media_id TEXT,
  note TEXT,
  headline TEXT,
  width INTEGER,
  height INTEGER,
  upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  duration_ms INTEGER
);

INSERT INTO media_new (
  id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status,
  idempotency_key, created_at, platform_media_id, note, headline, width, height
)
SELECT id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status,
       idempotency_key, created_at, platform_media_id, note, headline, width, height
  FROM media;

DROP TABLE media;
ALTER TABLE media_new RENAME TO media;

-- والفهرسُ يُعاد كما كان، **ومعه فهرسُ الرفع**: «ما المنشوراتُ من هذا المقطع؟»
CREATE INDEX idx_media_post ON media (post_id, created_at DESC);
CREATE INDEX idx_media_upload ON media (upload_id);
