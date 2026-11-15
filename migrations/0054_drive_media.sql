-- وسائطُ المالك من مجلّد Drive (D-363) — **صورُه ومقاطعُه التي يصنعها بنفسه، تدخل المكتبة وتستعملها الخطّة**.
--
-- المجلّدُ (افتراضُه «04-media») تحت مجلّد المصادر نفسِه، ومجلّداتُه الفرعيّةُ مقروءة («01-…» لكلّ مادّة). وكلُّ ملفٍّ صورةٍ أو مقطعٍ صفٌّ هنا
-- بمعرّف Drive وبصمته (md5) ونوعه وحجمه ومساره، والوسومُ تُشتقّ من المسار: رقمُ المادّة، والداكنُ أو الفاتح، والنوع.
-- **ولا نداءَ مدفوعًا**: السردُ والتنزيلُ من Drive بحساب الخدمة نفسِه. والبايتاتُ تُنزَّل إلى R2 تحت `library/<org>/drive/` بسقفٍ لكلّ
-- مزامنة، و`r2_key` فارغٌ حتى تُنزَّل. **وما غاب من Drive يُعلَّم ولا يُحذف**: منشورٌ رُبط به يبقى أثرُه.
--
-- **إضافيٌّ خالص**: جدولان جديدان ولا عمودَ يتغيّر في جدولٍ قائم.
CREATE TABLE drive_media (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL DEFAULT 'org_owner',
  drive_file_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  mime          TEXT NOT NULL CHECK (mime LIKE 'image/%' OR mime LIKE 'video/%'),
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  md5           TEXT NOT NULL DEFAULT '',
  bytes         INTEGER NOT NULL DEFAULT 0,
  -- المسارُ تحت المجلّد («01-افتتاح/داكن»)، ومنه الوسوم
  path          TEXT NOT NULL DEFAULT '',
  item_no       TEXT,
  variant       TEXT CHECK (variant IS NULL OR variant IN ('dark', 'light')),
  r2_key        TEXT,
  -- بصمةُ ما في R2: تختلف عن `md5` حين يتغيّر الملفّ في Drive فيُنزَّل من جديد
  r2_md5        TEXT,
  missing       INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1)),
  UNIQUE (org_id, drive_file_id)
);
CREATE INDEX idx_drive_media_item ON drive_media (org_id, item_no);

-- اسمُ المجلّد لكلّ منظّمة — ومن لا صفَّ له فمجلّدُه «04-media».
CREATE TABLE drive_media_folder (
  org_id     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
