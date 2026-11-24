-- «صحّح المنشور» (D-391): تصحيحُ منشورٍ نُشر — تعديلٌ في مكانه على LinkedIn، وردٌّ تصحيحيّ أو «احذف وأعد النشر» على X.
--
-- ## ما يُضاف (إضافيٌّ خالص: لا يتغيّر عمودٌ قائمٌ ولا قيمتُه)
--
-- - `posts.corrects_post_id`: المنشورُ البديلُ أو الردُّ التصحيحيّ يشير إلى أصله. والفارغُ منشورٌ عاديّ.
-- - `posts.correction_kind`: `reply` ردٌّ تحت الأصل، و`replace` بديلٌ بعد حذف الأصل.
-- - `posts.corrected_at`: الأصلُ صُحّح (عُدّل نصُّه، أو رُدّ عليه، أو حُذف وأُعيد).
-- - `posts.platform_deleted_at`: حذفُه صدى من المنصّة (خيارُ «احذف وأعد النشر») — فلا يُحذف ثانيةً.
-- - `post_corrections`: سجلُّ كلّ تصحيحٍ بحاله ومفتاحه (D-004)، **والنصُّ السابقُ محفوظٌ فيه** (إصدارٌ لا حذف).
--   والمفتاحُ فريدٌ في المنظّمة: ضغطتان بالنموذج نفسِه لا تُرسلان طلبين.

ALTER TABLE posts ADD COLUMN corrects_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN correction_kind TEXT CHECK (correction_kind IS NULL OR correction_kind IN ('reply', 'replace'));
ALTER TABLE posts ADD COLUMN corrected_at TEXT;
ALTER TABLE posts ADD COLUMN platform_deleted_at TEXT;

CREATE TABLE post_corrections (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL,
  post_id          TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('edit', 'reply', 'replace')),
  -- sent: أُرسل ولم يُعرَف جوابُه · deleted: حُذف الأصلُ ولم يُنشر البديلُ بعد · succeeded · failed
  status           TEXT NOT NULL CHECK (status IN ('sent', 'deleted', 'succeeded', 'failed')),
  idempotency_key  TEXT NOT NULL,
  old_text         TEXT NOT NULL,
  new_text         TEXT NOT NULL,
  new_post_id      TEXT REFERENCES posts(id) ON DELETE SET NULL,
  error            TEXT,
  by_email         TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, idempotency_key)
);
CREATE INDEX post_corrections_post ON post_corrections (org_id, post_id, created_at);
