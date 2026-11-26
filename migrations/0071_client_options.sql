-- خيارا العميل للوكالة (D-412): موافقتُه قبل النشر، وتقريرُ الشهر إلى البريد آليًّا.
--
-- ## ما يُضاف (إضافيٌّ خالص)
--
-- `client_options`: صفٌّ لكلّ منظّمة، **وغيابُه يعني الخيارين مطفأين** — فلا يتغيّر سلوكُ عميلٍ لم يُفتح له خيار.
-- - `approval_required`: لا يُجدوَل منشورٌ لهذا العميل حتّى يوافق عليه برابط الموافقة (D-353، `review_verdicts`).
-- - `report_mail`: يُرسَل تقريرُ الشهر الماضي آليًّا بمسار البريد القائم (D-268) في المسح اليوميّ.
-- - `report_mailed_month`: آخرُ شهرٍ أُرسل تقريرُه (`YYYY-MM`) — به لا يُرسَل الشهرُ مرّتين.
--
-- يُطبَّق قبل نشر الشيفرة: `schedulePost` والمسحُ اليوميّ يقرآن الجدول.

CREATE TABLE client_options (
  org_id               TEXT PRIMARY KEY,
  approval_required    INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0, 1)),
  report_mail          INTEGER NOT NULL DEFAULT 0 CHECK (report_mail IN (0, 1)),
  report_mailed_month  TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
