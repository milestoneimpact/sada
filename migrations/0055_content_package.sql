-- «حزمةُ المحتوى» من GitHub (D-366) — **مستودعُ المالك هو المصدر، وصدى تنفّذ**.
--
-- مصدرٌ واحدٌ لكلّ منظّمة: المستودعُ والفرعُ والمجلّد. وكلُّ ملفٍّ تحت المجلّد صفٌّ في `package_files` ببصمة git (blob sha) ودوره،
-- فالملفُّ الذي لم تتغيّر بصمتُه لا يُنزَّل ثانيةً. والوسائطُ (مقطعٌ وغلاف) في `package_media` بنسختها وصوتها، **والأحدثُ بالصوت هو
-- المعتمد** (`is_current`)، والقديمُ يبقى صفًّا بما استبدله ولا يُحذف.
-- **ولا رمزَ هنا خامًا**: رمزُ القراءة سرُّ Worker أوّلًا، و`token_enc` لما بعد تعدّد المنظّمات مشفّرًا بـ TOKEN_ENC_KEY (D-005)،
-- وسرُّ الويب هوك مشفّرٌ كذلك ويُعرض للمالكة مرّةً واحدة.
--
-- **إضافيٌّ خالص**: ثلاثةُ جداول جديدة ولا عمودَ يتغيّر في جدولٍ قائم.
CREATE TABLE package_sources (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL UNIQUE,
  provider           TEXT NOT NULL DEFAULT 'github' CHECK (provider = 'github'),
  owner              TEXT NOT NULL,
  repo               TEXT NOT NULL,
  branch             TEXT NOT NULL,
  root_path          TEXT NOT NULL DEFAULT '',
  token_enc          TEXT,
  token_iv           TEXT,
  webhook_secret_enc TEXT,
  webhook_secret_iv  TEXT,
  last_commit_sha    TEXT,
  last_tree_sha      TEXT,
  -- ‏ETag آخر قراءةٍ للفرع: الفحصُ الساعيّ يرسله في If-None-Match، و304 لا يكلّف شيئًا
  last_etag          TEXT,
  last_checked_at    TEXT,
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'ok', 'partial', 'failed')),
  error_reason       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE package_files (
  org_id      TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  -- ‏المسارُ تحت المجلّد («04-media/06-impact-chain/06-impact-chain-v2-dark-sound-1080x1080.mp4»)
  path        TEXT NOT NULL,
  blob_sha    TEXT NOT NULL,
  size        INTEGER NOT NULL DEFAULT 0,
  role        TEXT NOT NULL CHECK (role IN ('media', 'cover', 'plan', 'copy', 'script', 'ignored')),
  item_no     TEXT,
  variant     TEXT CHECK (variant IS NULL OR variant IN ('dark', 'light')),
  version     INTEGER,
  has_sound   INTEGER NOT NULL DEFAULT 0 CHECK (has_sound IN (0, 1)),
  -- ‏فارغٌ حتى تُنقل البايتاتُ إلى R2 — ومفتاحُه من المحتوى: pkg/<org>/<blob_sha>.<ext>
  r2_key      TEXT,
  -- ‏آخرُ دفعةٍ رأت الملفّ: ما لم تره الأخيرةُ خرج من الحزمة
  seen_commit TEXT NOT NULL,
  PRIMARY KEY (org_id, path)
);
CREATE INDEX idx_package_files_role ON package_files (org_id, role);

CREATE TABLE package_media (
  org_id         TEXT NOT NULL,
  blob_sha       TEXT NOT NULL,
  item_no        TEXT,
  variant        TEXT CHECK (variant IS NULL OR variant IN ('dark', 'light')),
  kind           TEXT NOT NULL CHECK (kind IN ('video', 'image')),
  path           TEXT NOT NULL,
  mime           TEXT NOT NULL,
  bytes          INTEGER NOT NULL DEFAULT 0,
  r2_key         TEXT,
  version        INTEGER NOT NULL DEFAULT 0,
  has_sound      INTEGER NOT NULL DEFAULT 0 CHECK (has_sound IN (0, 1)),
  -- ‏غلافُ المقطع المعتمد من اللون نفسِه (أعلى نسخةٍ له، ولو أقدمَ من المقطع)
  cover_blob_sha TEXT,
  is_current     INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  -- ‏بصمةُ ما حلّ محلّه — والقديمُ يبقى في السجلّ ولا يظهر في الاختيار
  superseded_by  TEXT,
  PRIMARY KEY (org_id, blob_sha)
);
CREATE INDEX idx_package_media_item ON package_media (org_id, item_no, variant);
