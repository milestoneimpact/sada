/**
 * خطّتُك من ملفّ (D-181) — **البطاقةُ في المنشورات، والمعاينةُ صفحةٌ وحدها**.
 *
 * المعاينةُ جدولٌ بكلّ صفٍّ كما قرأه صدى: موعدُه بتوقيت المالك، ومنصّتُه وحسابُه،
 * ونصُّه، ومقطعُه، **ومشكلاتُه كلُّها بجانبه**. والزرُّ الواحدُ يقول كم سيُجدوَل —
 * فلا يضغط المالكُ «اعتمد» على عددٍ لم يره.
 */
import { escapeHtml } from './escape'
import { MAX_PLAN_ROWS, type PlanRead, type PlanRow } from '../../lib/plan/import'
import { counted, NOUNS } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { PRIVATE_ONLY, PRIVATE_REACH, TIKTOK_NO_SCOPE, tiktokNeedsScope, type Reach } from '../../lib/media/uploads'
import { momentLabel } from '../../lib/time/local'
import { statusBadge } from './components/badge'

/** بطاقةُ الاستيراد في لوح المنشورات. */
export function planImportCard(): string {
  return `<div class="card mt-3" id="plan-import">
    <div class="card-head"><h2>خطّتُك من ملفّ</h2><div class="grow"></div>
      <a class="tap" href="/panel/plan-import/template.csv" download>نزّل النموذج</a></div>
    <p class="hint">املأ جدولًا بأعمدة <b>التاريخ والوقت والمنصّة والنصّ</b> (والمقطعُ باسمه في «فيديوهاتك»)،
      واحفظه CSV من Excel أو Google Sheets، ثمّ ارفعه هنا. <b>يُعرض عليك صفًّا صفًّا بمشكلاته، ولا يُجدوَل
      شيءٌ قبل أن تعتمده</b> — وحتّى ${MAX_PLAN_ROWS} صفّ في الملفّ.</p>
    <form class="row" method="POST" action="/panel/plan-import" enctype="multipart/form-data" data-busy="جارٍ القراءة…">
      ${/* ‏ويُقرأ الملفُّ فورَ اختياره (سكربت اللوحة، 7.6) واسمُه في اللصيقة؛ والزرُّ لمن لا سكربتَ عنده */ ''}<label class="btn btn-primary vpick"><span data-plan-name>اختر ملفّ الخطّة (CSV)</span>
        <input type="file" name="file" class="vfile" accept=".csv,text/csv" required data-plan-file></label>
      <noscript><button class="btn btn-secondary" type="submit">اقرأ الخطّة</button></noscript>
    </form>
  </div>`
}

/**
 * الموعدُ كما فهمه صدى بالعربيّة («الجمعة 9 أكتوبر 09:30») — فيرى المالكُ أنّ «10/9/2026»
 * قُرئت أكتوبرَ لا سبتمبر قبل أن يعتمد (ر-5). وما لم يُفهم يُعرض كما كُتب، والمشكلةُ بجانبه.
 */
function when(r: PlanRow, now: Date): string {
  if (r.understoodUtc !== null && r.zone !== '') {
    return escapeHtml(momentLabel(new Date(`${r.understoodUtc}:00Z`), r.zone, now))
  }
  return r.date === '' && r.time === '' ? '—' : `<bdi dir="ltr">${escapeHtml(`${r.date} ${r.time}`.trim())}</bdi>`
}

/**
 * صفٌّ في المعاينة — **ولكلّ خليّةٍ لصيقتُها** (`data-label`): الجدولُ على الهاتف بطاقاتٌ
 * تكتب اللصيقةَ فوق كلّ خليّة (7.5)، وكانت بطاقاتٍ من «3» و«2026-10-07 12:00» و«Asia/Riyadh»
 * بلا اسمٍ لشيء. والخليّةُ الأولى الموعدُ ورقمُ سطره تحته: هي رأسُ البطاقة.
 */
function rowHtml(r: PlanRow, now: Date, reachNow: Reach): string {
  const ok = r.problems.length === 0
  // ‏المنطقةُ تُقال إن كتبها الملفّ وحده؛ وما سواها «بتوقيتك» مرّةً فوق الجدول
  const zone = r.zoneCell === '' ? '' : `<span class="ago">بتوقيت <bdi dir="ltr">${escapeHtml(r.zone || r.zoneCell)}</bdi></span>`
  // ‏ويسكت حين قلب المالكُ النشرَ علنيًّا بعد الإجازة (D-190)
  // ‏وTikTok المقلوبُ بلا `video.publish` صندوقٌ بحكم الناشر — يُقال بسببه (مراجعة D-190)
  const reach = ok && (r.platform === 'youtube' || r.platform === 'tiktok') && !reachNow[r.platform]
    ? r.platform === 'tiktok' && tiktokNeedsScope(reachNow) ? TIKTOK_NO_SCOPE : PRIVATE_REACH[r.platform]
    : null
  return `<tr${ok ? '' : ' class="bad"'}>
    <td data-label="الموعد">${when(r, now)}${zone}<span class="ago">السطر ${r.line}</span></td>
    <td data-label="المنصّة">${escapeHtml(r.platform === null ? r.platformRaw || '—' : platformLabel(r.platform))}${
      r.accountName === null ? '' : `<span class="ago"><bdi>${escapeHtml(r.accountName)}</bdi></span>`}</td>
    <td class="pi-text" data-label="النصّ">${escapeHtml(r.text.length > 140 ? `${r.text.slice(0, 139)}…` : r.text)}</td>
    <td data-label="المقطع">${r.video === '' ? '—' : `<bdi>${escapeHtml(r.video)}</bdi>`}</td>
    <td data-label="الحال">${ok
      ? `${statusBadge('ok', '●', 'جاهز')}${reach === null ? '' : `<span class="ago">${escapeHtml(reach)}</span>`}`
      : `<ul class="pi-why">${r.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`}</td>
  </tr>`
}

/**
 * سطورُ ما عُرض جاهزًا — تُحمَل في نموذج «اعتمد» (D-182): **ما لم يُعرَض جاهزًا لا يُجدوَل**،
 * ولو صلح بين المعاينة والضغطة (حسابٌ رُبط في نافذةٍ أخرى)؛ فالزرُّ وعدَ بعددٍ رآه المالك.
 */
export function readyLines(read: PlanRead): number[] {
  return read.rows.filter((r) => r.problems.length === 0).map((r) => r.line)
}

/**
 * معاينةٌ انتهت مهلتُها (ساعتان في KV) — صفحةٌ بقالب اللوحة وزرٌّ أوّليٌّ إلى الرفع (7.11).
 * كانت نصًّا خامًّا بلا رافدةٍ ولا مخرج لمن ترك المعاينةَ مفتوحةً في هاتفه ثمّ حدّثها.
 */
export function planImportExpired(): string {
  return `<header class="page-head"><div class="eyebrow"><span class="ln"></span>خطّتُك من ملفّ</div>
      <h1>انتهت مهلةُ هذه المعاينة</h1>
      <p class="lede">تبقى المعاينةُ ساعتين، ثمّ تُمحى ولا يُجدوَل منها شيء. ارفع الملفَّ من جديد لتراه بحاله الآن.</p></header>
    <div class="card"><a class="btn btn-primary" href="/panel#plan-import">ارفع الملفّ من جديد</a></div>`
}

/** صفحةُ المعاينة — والزرُّ يُرسم حين يكون في الملفّ صفٌّ واحدٌ سليمٌ على الأقلّ. */
export function planImportScreen(
  id: string, read: PlanRead, now: Date = new Date(), reach: Reach = PRIVATE_ONLY, fallback = false,
): string {
  const ready = read.rows.filter((r) => r.problems.length === 0).length
  const blocked = read.rows.length - ready
  return `<header class="page-head"><div class="eyebrow"><span class="ln"></span>خطّتُك من ملفّ</div>
      <h1>معاينةُ الخطّة</h1>
      <p class="lede">${read.fileProblems.length > 0
        ? 'لم يُقرأ الملفّ.'
        : `في الملفّ ${escapeHtml(counted(read.rows.length, NOUNS.row))}: <b>${ready === 0
          ? 'لا منشورَ جاهزٌ للجدولة'
          : `جاهزٌ للجدولة ${escapeHtml(counted(ready, NOUNS.post))}`}</b>${
          blocked === 0 ? '' : `، ويحتاج ${escapeHtml(counted(blocked, NOUNS.row))} إصلاحًا في الملفّ ثمّ يُرفع من جديد`}.`}</p></header>
    ${read.fileProblems.length > 0
      ? `<div class="card"><ul class="pi-why">${read.fileProblems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
          <a class="btn btn-secondary" href="/panel#plan-import">ارجع وارفع ملفًّا آخر</a></div>`
      : `<div class="card">
        <p class="hint">المواعيدُ ${fallback ? 'بتوقيت الرياض' : 'بتوقيتك'} كما فهمها صدى — راجعها قبل أن تعتمد.</p>
        <div class="scroll"><table class="pi">
          <thead><tr><th>الموعد</th><th>المنصّة</th><th>النصّ</th><th>المقطع</th><th>الحال</th></tr></thead>
          <tbody>${read.rows.map((r) => rowHtml(r, now, reach)).join('')}</tbody></table></div>
        <p class="ago">الصفوفُ ذاتُ المشكلات لا تُجدوَل، ويبقى الملفُّ عندك لتصلحه.</p>
        ${/* ‏وصفُّ الأفعال يلاصق أسفلَ الشاشة (القالب T4): مئتا صفٍّ لا تُبعد «اعتمد» عن الإبهام */ ''}<div class="row pi-bar">
          ${ready === 0
            ? '<span class="ago">لا صفَّ جاهزًا — أصلح الملفَّ وارفعه من جديد.</span>'
            : `<form class="inline" method="POST" action="/panel/plan-import/${escapeHtml(id)}/approve"
                 data-busy="جارٍ الجدولة…" data-confirm="${escapeHtml(ready === 1
                   ? 'يُعتمَد منشورٌ واحد ويُجدوَل في موعده. أتابع؟'
                   : `يُعتمَد ${counted(ready, NOUNS.post)} ويُجدوَل كلٌّ في موعده. أتابع؟`)}">
                 <input type="hidden" name="lines" value="${escapeHtml(readyLines(read).join(','))}">
                 <button class="btn btn-primary" type="submit">اعتمد وجدوِل ${escapeHtml(counted(ready, NOUNS.post, 'acc'))}</button></form>`}
          <a class="btn btn-secondary" href="/panel#plan-import">إلغاء</a>
        </div>
      </div>`}`
}
