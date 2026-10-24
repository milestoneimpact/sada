-- فريقُ صدى (D-272) — **من يدخل غيرُ المالك، وبأيّ دور، وعلى أيّ شركة**.
--
-- كان الدخولُ للمالك وحدَه (D-245): `canReceiveCode` تقبل بريدًا واحدًا ثابتًا في الشيفرة. والمالكُ يدير شركاتٍ عدّة (D-225)،
-- ويريد محرّرًا لشركةٍ وناشرًا لأخرى وقارئًا يرى ولا يمسّ. فهذا الجدولُ يقول **من دُعي**، والدورُ يُفحَص في كلّ طلبٍ على الخادم
-- (`routes/access.ts`) لا في الواجهة وحدها.
--
-- **والمالكُ ليس صفًّا هنا**: بريدُه في الشيفرة (D-245)، فلا يُلغى ولا يُنزَّل دورُه من لوحةٍ قد تُسرق جلستُها.
CREATE TABLE members (
  email       TEXT PRIMARY KEY CHECK (email = lower(trim(email)) AND email LIKE '%_@_%'),
  role        TEXT NOT NULL CHECK (role IN ('admin', 'publisher', 'editor', 'viewer')),
  -- '*' لكلّ الشركات، أو معرّفاتُ الشركات مفصولةً بفاصلة
  orgs        TEXT NOT NULL DEFAULT '*',
  invited_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  -- الإلغاءُ علامةٌ لا حذف: سجلُّ التدقيق يذكره، فيبقى من كان
  revoked_at  TEXT
);
CREATE INDEX idx_members_active ON members (revoked_at, email);

-- ‏ومن فعل في سجلّ التدقيق (D-272): `actor` يقول **كيف** (جلسةٌ أم رمز)، و`by_email` يقول **من**. والقديمُ `NULL` = المالك.
ALTER TABLE audit_log ADD COLUMN by_email TEXT;
