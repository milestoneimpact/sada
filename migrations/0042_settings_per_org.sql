-- سقوفُ إنفاقٍ لكلّ عميل (D-295) — البندُ ١٦ من خارطة الطريق الثانية، والأفقُ ٢ · ٦ من الثالثة.
--
-- ## ما كان
--
-- `settings.key` مفتاحٌ أوحد: صفٌّ واحدٌ لكلّ إعدادٍ في القاعدة كلِّها، و`org_id` (0031) عمودٌ يقول
-- «منظّمةُ المالك» دائمًا. فسقفُ الإنفاق اليوميّ عامٌّ على العملاء جميعًا، ولا سبيلَ إلى سقفٍ لعميلٍ بعينه
-- بلا كسر المفتاح.
--
-- ## ما صار
--
-- المفتاحُ `(org_id, key)`: الصفُّ العامُّ يبقى في منظّمة المالك كما كان، وصفٌّ لمنظّمةٍ أخرى **يغلبه لها وحدَها**
-- في مفاتيح السقوف الأربعة (الإنفاق والصور والمقاطع والتحليل) لا غير — فالإيقافُ والمزوّدون والإدراجُ الآليّ
-- عامّةٌ بطبعها (D-277). **والسقفُ العامُّ يبقى فوق الكلّ**: سقفُ عميلٍ يوقفه هو، وسقفُ المالك يوقف المجموع.
-- وعميلٌ بلا صفٍّ يرث العامّ. إعادةُ بناءٍ كاملة: SQLite لا يغيّر مفتاحًا أوّليًّا في مكانه.
CREATE TABLE settings_new (
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  org_id     TEXT NOT NULL DEFAULT 'org_owner',
  PRIMARY KEY (org_id, key)
);
INSERT INTO settings_new (key, value, updated_at, updated_by, org_id)
  SELECT key, value, updated_at, updated_by, org_id FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
