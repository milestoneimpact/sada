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
import { status } from './parts'

/** بطاقةُ الاستيراد في لوح المنشورات. */
export function planImportCard(): string {
  return `<div class="card" id="plan-import" style="margin-top:var(--s-3)">
    <div class="card-head"><h2>خطّتُك من ملفّ</h2><div class="grow"></div>
      <a class="tap" href="/panel/plan-import/template.csv" download>نزّل النموذج</a></div>
    <p class="hint">املأ جدولًا بأعمدة <b>التاريخ والوقت والمنصّة والنصّ</b> (والمقطعُ باسمه في «فيديوهاتك»)،
      واحفظه CSV من Excel أو Google Sheets، ثمّ ارفعه هنا. <b>يُعرض عليك صفًّا صفًّا بمشكلاته، ولا يُجدوَل
      شيءٌ قبل أن تعتمده</b> — وحتّى ${MAX_PLAN_ROWS} صفّ في الملفّ.</p>
    <form class="row" method="POST" action="/panel/plan-import" enctype="multipart/form-data" data-busy="جارٍ القراءة…">
      <label class="btn g vpick">اختر ملفّ الخطّة (CSV)
        <input type="file" name="file" class="vfile" accept=".csv,text/csv" required></label>
      <button class="p" type="submit">اقرأ الخطّة</button>
    </form>
  </div>`
}

function when(r: PlanRow): string {
  return r.date === '' && r.time === '' ? '—' : `${r.date} ${r.time}`
}

function rowHtml(r: PlanRow): string {
  const ok = r.problems.length === 0
  return `<tr${ok ? '' : ' class="bad"'}>
    <td class="num">${r.line}</td>
    <td><bdi dir="ltr">${escapeHtml(when(r))}</bdi><span class="ago">${escapeHtml(r.zone)}</span></td>
    <td>${escapeHtml(r.platformRaw)}${r.accountName === null ? '' : `<span class="ago"><bdi>${escapeHtml(r.accountName)}</bdi></span>`}</td>
    <td class="pi-text">${escapeHtml(r.text.length > 140 ? `${r.text.slice(0, 139)}…` : r.text)}</td>
    <td>${r.video === '' ? '—' : `<bdi>${escapeHtml(r.video)}</bdi>`}</td>
    <td>${ok
      ? status('ok', '●', 'جاهز')
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

/** صفحةُ المعاينة — والزرُّ يُرسم حين يكون في الملفّ صفٌّ واحدٌ سليمٌ على الأقلّ. */
export function planImportScreen(id: string, read: PlanRead): string {
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
          <a class="btn g" href="/panel#plan-import">ارجع وارفع ملفًّا آخر</a></div>`
      : `<div class="card">
        <div class="scroll"><table class="pi">
          <thead><tr><th>السطر</th><th>الموعد</th><th>المنصّة</th><th>النصّ</th><th>المقطع</th><th>الحال</th></tr></thead>
          <tbody>${read.rows.map(rowHtml).join('')}</tbody></table></div>
        <div class="row" style="margin-top:var(--s-4)">
          ${ready === 0
            ? '<span class="ago">لا صفَّ جاهزًا — أصلح الملفَّ وارفعه من جديد.</span>'
            : `<form class="inline" method="POST" action="/panel/plan-import/${escapeHtml(id)}/approve"
                 data-busy="جارٍ الجدولة…" data-confirm="${escapeHtml(ready === 1
                   ? 'يُعتمَد منشورٌ واحد ويُجدوَل في موعده. أتابع؟'
                   : `يُعتمَد ${counted(ready, NOUNS.post)} ويُجدوَل كلٌّ في موعده. أتابع؟`)}">
                 <input type="hidden" name="lines" value="${escapeHtml(readyLines(read).join(','))}">
                 <button class="p" type="submit">اعتمد وجدوِل ${escapeHtml(counted(ready, NOUNS.post, 'acc'))}</button></form>`}
          <a class="btn g" href="/panel#plan-import">إلغاء</a>
          <span class="grow"></span>
          <span class="ago">الصفوفُ ذاتُ المشكلات لا تُجدوَل، ويبقى الملفُّ عندك لتصلحه.</span>
        </div>
      </div>`}`
}
