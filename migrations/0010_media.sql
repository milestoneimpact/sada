-- الصور — والبايتاتُ في R2 لا في القاعدة.
--
-- D1 قاعدةُ صفوفٍ لا مخزنُ ملفّات، وصورةٌ بمئات الكيلوبايتات في عمودٍ
-- تجعل كلَّ استعلامٍ يجرّها. فالبايتاتُ في R2، وهنا **ما يوصف بها**:
-- مفتاحُها، ووصفُ توليدها، ومَن ولّدها، وبكم.
--
-- و `media_json` في `posts` يبقى كما هو ولا يُمسّ: كُتب لوسائطَ تُرفَع
-- يدا، وهذا جدولٌ لما يُولَّد. وخلطُهما يجعل عمودا واحدا يعني شيئين.
CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  -- الصورةُ تخصّ منشورا: يُحذف فتُحذف معه، فلا بايتاتٌ لا يشير إليها أحد
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  -- مفتاحُ الكائن في R2 — فريدٌ فلا يدهس رفعٌ رفعا
  r2_key      TEXT NOT NULL UNIQUE,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  -- الوصفُ الذي وُلّدت به: صورةٌ لا يُعرف وصفُها لا تُعاد ولا تُحسَّن
  prompt      TEXT NOT NULL,
  model       TEXT NOT NULL,
  cost_usd    REAL NOT NULL DEFAULT 0,
  -- المالك يقبلها أو يرفضها كما يفعل بالنصّ. والمرفوضةُ تبقى بكلفتها
  status      TEXT NOT NULL DEFAULT 'ready'
                CHECK (status IN ('ready', 'rejected')),
  -- D-004: نداءٌ مدفوع لا يتكرّر بنقرةٍ عصبيّة
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_media_post ON media (post_id, created_at DESC);
