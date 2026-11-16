/**
 * **«من حزمتك في GitHub»** (D-377) — الطريق الثالث إلى خطّة جديدة، والافتراضيُّ متى رُبطت الحزمة.
 *
 * يسار الشاشة نسخ الحزمة (الالتزام المختصر والرسالة والتاريخ والحال)، الأحدث أوّلًا، وكلُّ نسخة رابط يعرضها بلا سكربت.
 * والنسخة المختارة تصوّر كامل («هذا ما فهمته» موسّعًا): المدّة، وعدد كلّ منصّة، وكلُّ صفٍّ بنصّه الجاهز أو «تنقصه نصّ»،
 * ووسيطتُه (المقطع لصيغة الفيديو والغلاف لغيرها، باللون المختار)، وقواعد الإرشادات، وما يختلف عن خطّتك الحاليّة.
 * ثمّ زرٌّ أوّليٌّ واحد «ابنِ الخطّة من هذه النسخة» ومفتاح «تابع التحديث تلقائيًّا».
 */
import { counted, NOUNS } from '../../lib/format'
import type { RevisionPreview } from '../../lib/package/adopt'
import type { RevisionRow } from '../../lib/package/revision'
import { pageHead } from './parts'
import { card } from './components/card'
import { button } from './components/button'
import { statusBadge } from './components/badge'
import { field } from './components/field'
import { html, raw, type Html } from './html'
import { localWhen } from '../../lib/time/zone'
import { KIND_LABEL, revisionBadge, short } from './packageChangesView'

/** أزرار «طريقة الخطّة» الثلاثة — الشاشات الثلاث أخوات. */
export function planWays(at: 'build' | 'import' | 'package', hasPackage: boolean): Html {
  const one = (key: typeof at, href: string, label: string): Html =>
    raw(button({ label, href, size: 'sm', variant: key === at ? 'primary' : 'secondary', ...(key === at ? { attrs: 'aria-current="page"' } : {}) }))
  return html`<nav class="row gap-2 mb-4" aria-label="طريقة الخطّة">
      ${hasPackage ? one('package', '/panel/plan/package', 'من حزمتك في GitHub') : html``}
      ${one('build', hasPackage ? '/panel/plan/new?way=build' : '/panel/plan/new', 'ابنِ لي خطّة')}
      ${one('import', '/panel/plan/import', 'عندي خطّة')}</nav>`
}

const PLATFORM: Readonly<Record<string, string>> = { x: 'X', linkedin: 'LinkedIn' }
const VARIANT = { dark: 'داكن', light: 'فاتح' } as const

export interface PlanPackageData {
  readonly repo: string
  readonly revisions: readonly RevisionRow[]
  readonly preview: RevisionPreview | null
  readonly follow: boolean
  readonly canBuild: boolean
  readonly zone?: string | null
  readonly flash?: { readonly tone: 'ok' | 'warn' | 'bad'; readonly text: string } | null
}

function versions(d: PlanPackageData): string {
  const at = d.preview?.revision.id
  const body = d.revisions.length === 0
    ? html`<p class="m-0">لم تُقرأ نسخة بعد. افتح <a href="/panel/package">حزمة المحتوى</a> واضغط «زامن الآن».</p>`
    : html`<ul class="plain stack">${d.revisions.map((r) => html`<li>
        <a href="/panel/plan/package?rev=${r.id}"${r.id === at ? raw(' aria-current="true"') : ''}><bdi dir="ltr">${short(r.commit)}</bdi> · ${r.message === '' ? 'بلا رسالة' : r.message.slice(0, 80)}</a>
        <span class="hint"> · <bdi>${localWhen(r.createdAt, d.zone ?? null)}</bdi></span> ${raw(revisionBadge(r))}</li>`)}</ul>`
  return card({ title: 'نسخ الحزمة', level: 2, body: html`<p class="hint m-0">من <bdi dir="ltr">${d.repo}</bdi> — الأحدث أوّلًا. اختر أيَّ نسخة لتراها كاملة.</p>${body}`.value })
}

function facts(p: RevisionPreview): Html {
  return html`<dl class="pv-facts">
    <div><dt>النسخة</dt><dd><bdi dir="ltr">${short(p.revision.commit)}</bdi>${p.revision.message === '' ? '' : ' · ' + p.revision.message}</dd></div>
    <div><dt>المدّة</dt><dd dir="ltr">${p.period === null ? '—' : p.period.from + ' إلى ' + p.period.to}</dd></div>
    <div><dt>المنشورات</dt><dd>${counted(p.rows.length, NOUNS.post)}</dd></div>
    <div><dt>لكلّ منصّة</dt><dd>${Object.entries(p.perPlatform).map(([k, n]) => (PLATFORM[k] ?? k) + ' ' + String(n)).join(' · ')}</dd></div>
    <div><dt>نصٌّ جاهز</dt><dd>${p.missing === 0 ? 'لكلّ منشور' : counted(p.rows.length - p.missing, NOUNS.post) + '، وتنقص ' + counted(p.missing, NOUNS.post) + ' نصوصُها'}</dd></div>
  </dl>`
}

function mediaCell(r: RevisionPreview['rows'][number]): Html {
  const m = r.shown
  if (m.kind === 'none') return raw(statusBadge('warn', '!', 'بلا وسيطة'))
  return html`${m.kind === 'video' ? 'مقطع' : 'غلاف'} ${VARIANT[m.variant]}: <bdi dir="ltr">${m.name ?? ''}</bdi>${m.ready ? '' : raw(' ' + statusBadge('warn', '…', 'يُنقل'))}`
}

function rowsTable(p: RevisionPreview): Html {
  return html`<div class="pv-scroll"><table class="pv-table">
    <thead><tr><th>اليوم</th><th>الوقت</th><th>المنصّة</th><th>المادّة</th><th>النصّ</th><th>الوسيطة</th></tr></thead>
    <tbody>${p.rows.map((r) => html`<tr><td dir="ltr">${r.date}</td><td dir="ltr">${r.time}</td><td>${PLATFORM[r.platform] ?? r.platform}</td>
      <td>${r.item} · ${r.format}</td>
      <td>${r.text === null ? html`${raw(statusBadge('warn', '✎', 'تنقصه نصّ'))} يُكتب من فكرته «${r.idea}» وفق الإرشادات` : r.text.replace(/\s+/g, ' ').slice(0, 220)}</td>
      <td>${mediaCell(r)}</td></tr>`)}</tbody></table></div>`
}

function differs(p: RevisionPreview): string {
  const by = new Map<string, number>()
  for (const c of p.changes) by.set(c.kind, (by.get(c.kind) ?? 0) + 1)
  const body = p.changes.length === 0
    ? html`<p class="m-0">${raw(statusBadge('ok', '✓', 'مطابقة لخطّتك الحاليّة'))} البناء منها لا يغيّر شيئًا.</p>`
    : html`<ul class="plain">${[...by].map(([k, n]) => html`<li>${KIND_LABEL[k as keyof typeof KIND_LABEL]}: ${String(n)}</li>`)}</ul>
      <p class="hint m-0">المسوّدات تُكتب وحدها. والمعتمد والمجدول ينتظر قرارك في «ما تغيّر في حزمتك»، والمنشور لا يتغيّر.</p>`
  return card({ title: 'ما يختلف عن خطّتك الحاليّة', level: 2, body: body.value })
}

function rulesCard(p: RevisionPreview): string {
  if (p.rules === null) return card({ title: 'الإرشادات', level: 2, body: html`<p class="m-0">لا ورقة إرشادات في هذه النسخة — يُكتب الناقص بقواعد كلّ منصّة في صدى.</p>`.value })
  return card({ title: 'قواعد الكتابة من ورقة الإرشادات', level: 2, body: html`<div class="pv-rules">${Object.entries(p.rules).map(([k, list]) => html`<section><h3 class="m-0">${k}</h3>
    <dl class="pv-facts">${list.map((r) => html`<div><dt>${r.item}</dt><dd>${r.value}</dd></div>`)}</dl></section>`)}</div>`.value })
}

function act(d: PlanPackageData, p: RevisionPreview): Html {
  if (!d.canBuild) return html`<p class="m-0">بناء الخطّة للمدير فأعلى.</p>`
  const follow = field({ id: 'pp-follow', label: 'تابع التحديث تلقائيًّا', hint: 'كلُّ دفع جديد يحدّث المسوّدات غير المعتمدة وحده. وبلا تحديد ينتظر كلُّ تغيير قرارك.',
    control: '<input type="checkbox" name="follow" value="1"' + (d.follow ? ' checked' : '') + '>' })
  // ‏نموذجان: المفتاح يُحفظ وحده بلا بناء، والبناء لا يغيّر المفتاح
  return html`${raw(card({ title: 'ابن', level: 2, body: html`<form method="POST" action="/panel/plan/package" class="stack">
    <input type="hidden" name="rev" value="${p.revision.id}">
    <p class="hint m-0">${p.missing === 0 ? '' : 'وما تنقصه نصوصُه (' + counted(p.missing, NOUNS.post) + ') تكتبه بعد البناء من «حزمة المحتوى» وترى عددَه قبل الكتابة. '}لا يُجدوَل شيء قبل أن تعتمد.</p>
    <div class="row">${raw(button({ label: 'ابنِ الخطّة من هذه النسخة', type: 'submit', variant: 'primary' }))}</div>
  </form>`.value }))}
  ${raw(card({ title: 'التحديث', level: 2, body: html`<form method="POST" action="/panel/plan/package" class="stack">
    <input type="hidden" name="do" value="follow">
    <input type="hidden" name="rev" value="${p.revision.id}">
    ${raw(follow)}
    <div class="row">${raw(button({ label: 'احفظ', type: 'submit', variant: 'secondary', size: 'sm' }))}</div>
  </form>`.value }))}`
}

export function planPackageScreen(d: PlanPackageData): string {
  const head = pageHead('المنشورات', 'خطّة جديدة', 'من حزمتك في GitHub: اختر نسخة، وانظر ما فهمته منها كاملًا، ثمّ ابن.')
  const flash = d.flash == null ? html`` : html`<p class="m-0">${raw(statusBadge(d.flash.tone, d.flash.tone === 'ok' ? '✓' : '!', d.flash.text))}</p>`
  const p = d.preview
  const view = p === null
    ? html``
    : html`${raw(card({ title: 'هذا ما فهمته', level: 2, body: facts(p).value }))}
      ${p.problems.length === 0 ? html`` : raw(card({ variant: 'alert', tone: 'warn', title: 'ما لم يُفهم', level: 2, body: html`<ul class="plain">${p.problems.map((x) => html`<li>${x}</li>`)}</ul>`.value }))}
      ${raw(differs(p))}${raw(card({ title: 'الصفوف', level: 2, body: rowsTable(p).value }))}${raw(rulesCard(p))}${act(d, p)}`
  return html`${raw(head)}${planWays('package', true)}<div class="stack">${flash}${raw(versions(d))}${view}</div>`.value
}
