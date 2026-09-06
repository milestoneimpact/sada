-- تطبيقا LinkedIn و X — يُضبطان من اللوحة لا من لوحة Cloudflare.
--
-- كانت أسرارُ التطبيقين في بيئة Worker وحدها، فضبطُها يوجب فتحَ لوحة
-- Cloudflare والتنقّل فيها. وهذا حاجزٌ بلا مقابل: **الرمزُ الذي يُنشَر
-- به (`access_token`) محفوظٌ في هذه القاعدة مشفَّرا منذ D-005** — وهو
-- أخطرُ من سرّ التطبيق لا أدنى.
--
-- وسرُّ Worker يبقى الأقوى (D-030): ما هنا بديلٌ حين لا يكون هناك.
CREATE TABLE oauth_apps (
  platform    TEXT PRIMARY KEY CHECK (platform IN ('linkedin', 'x')),
  client_id   TEXT NOT NULL,
  -- AES-GCM، والمفتاحُ في أسرار Worker وحدها. ولا عمودَ للنصّ الخام
  secret_enc  TEXT NOT NULL,
  secret_iv   TEXT NOT NULL,
  -- «78k4…g18e» — أوّلُه وآخرُه، ليتعرّف المالك عليه بلا أن يُكشَف
  hint        TEXT NOT NULL,
  -- بصمةٌ تُقارَن: «هل هذا هو نفسه؟» يُجاب بلا فكّ تشفير
  fingerprint TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT NOT NULL
);
