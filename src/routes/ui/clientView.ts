/**
 * شاشةُ العميل (D-257 · AGENCY-PLAN) — **رحلتُه في سبع محطّات، وكلُّ محطّةٍ تقول حالَها وزرَّها**.
 *
 * العميلُ ← الموجز ← القنوات ← الخطّة ← المحتوى ← الكلفة ← التحليل. والموجزُ يُكتب هنا، والباقي يدلّ على موضعه:
 * شاشةٌ واحدةٌ تمشي العميلَ من «ماذا تريد؟» إلى «ما الذي نجح؟» بلا بحثٍ في الأقسام.
 */
import { escapeHtml } from './escape'
import { html, raw } from './html'
import { pageHead } from './parts'
import { field } from './components/field'
import { card } from './components/card'
import { button } from './components/button'
import { notice, toastRegion } from './components/toast'
import { money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { BRIEF_CHANNELS, BRIEF_MAX, isEmptyBrief, type Brief } from '../../lib/brief'
import { estimateLine, estimatePlan, type Estimate } from '../../lib/estimate'
import { approveAllForm } from './sections/plan'
import { SPAN_LABEL } from '../../lib/plan/prompt'
import type { StoredPlan } from '../../lib/plan/job'
import { planBoard } from './planBoard'

export interface ClientData {
  readonly orgName: string
  readonly brief: Brief
  /** الحساباتُ النشطة لكلّ منصّة. */
  readonly linked: Readonly<Record<string, number>>
  readonly plan: StoredPlan | null
  readonly autoImage: boolean
  readonly estimate: Estimate
  readonly spentMonth: number
  readonly measured: number
  readonly saved?: boolean
  /** أسماءُ مصادر البنود — تُقرأ على البطاقة بدل معرّفاتها (D-259). */
  readonly names?: Readonly<Record<string, string>>
  /** مسوّداتُ العميل التي تنتظر قراره — تقول أين هو من الرحلة بعد «ابدأ» (D-260). */
  readonly waiting?: number
  /** مسوّداتُ الخطّة المعتمَدة التي لم تُجدوَل (D-261). */
  readonly ready?: number
  /** مسوّداتُ الخطّة المكتوبة كلُّها — صفرٌ بعد «ابدأ» يعني أنّها تُكتب الآن. */
  readonly written?: number
  /** مسوّداتُ هذه الخطّة التي تنتظر القرار — لـ«اعتمد الخطّة كاملةً» (D-282). */
  readonly pending?: number
  /** مصادرُ العميل لـ«أضف بندًا» (D-264). */
  readonly sources?: readonly { readonly id: string; readonly name: string }[]
  readonly flash?: { readonly kind: 'ok' | 'warn' | 'bad'; readonly text: string } | null
  /**
   * حدودُ هذا العميل (D-295): العامُّ من منظّمة المالك، وما كتبه العميلُ لنفسه فوقه في السقوف الأربعة.
   * ولمنظّمة المالك نفسِها البطاقةُ تحيل إلى «الإنفاق والحدود»: هي العامّ.
   */
  /** خيارا العميل للوكالة (D-412) — وغيابُهما لا يرسم البطاقة. */
  readonly options?: { readonly approvalRequired: boolean; readonly reportMail: boolean }
  readonly limits?: {
    readonly ownerOrg: boolean
    readonly global: { readonly spend: number; readonly image: number; readonly video: number; readonly analysis: number }
    readonly mine: { readonly spend?: number; readonly image?: number; readonly video?: number; readonly analysis?: number }
    readonly spentToday: number
  }
}

type State = 'done' | 'todo' | 'idle'
const MARK: Readonly<Record<State, string>> = { done: '●', todo: '○', idle: '·' }
const TITLES = ['العميل', 'الموجز', 'القنوات', 'الخطّة', 'المحتوى', 'الكلفة', 'التحليل']

/**
 * **المحطّةُ بلاطةٌ تُقرأ في خمس ثوانٍ** (مراجعة D-259): الرقمُ والاسمُ وعلامةُ الحال، ثمّ كلمةُ الحال كبيرة، ثمّ سطرٌ يشرحها،
 * والزرُّ تحته مباشرة. كانت قائمةً عموديّةً أطولَ من شاشة، والزرُّ بعيدٌ عن سطره.
 */
const WORD: Readonly<Record<State, string>> = { done: 'جاهز', todo: 'ناقص', idle: 'اختياريّ' }

function station(n: number, title: string, state: State, body: string, action: string): string {
  return `<div class="card tile" data-state="${state}">
    <div class="kv-k"><span aria-hidden="true">${MARK[state]}</span> ${n} · ${escapeHtml(title)}</div>
    <div class="kv-v">${WORD[state]}</div>
    <div class="note">${body}</div>
    <div class="row gap-2 mt-3">${action}</div>
  </div>`
}

const link = (href: string, label: string, primary = false): string =>
  `<a class="${primary ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`

function briefForm(b: Brief): string {
  const text = (id: string, name: string, label: string, value: string, hint: string): string =>
    field({ id, label, hint, control: `<textarea name="${name}" rows="2" maxlength="${BRIEF_MAX}" dir="auto">${escapeHtml(value)}</textarea>` })
  const boxes = BRIEF_CHANNELS.map((p) => `<label class="vpf"><input type="checkbox" name="channel" value="${p}"${
    b.channels.includes(p) ? ' checked' : ''}><span class="vpf-b"><b>${escapeHtml(platformLabel(p))}</b></span></label>`).join('')
  return `<form method="POST" action="/panel/client/brief" class="stack">
    ${text('br-goal', 'goal', 'ماذا يريد العميل؟', b.goal, 'مثل: أن يُعرف خبيرًا في الحوكمة لدى مجالس الإدارة')}
    ${text('br-aud', 'audience', 'لمن؟', b.audience, 'مثل: أعضاء مجالس الإدارة ومديرو المشاريع في الخليج')}
    ${text('br-tone', 'tone', 'بأيّ نبرة؟', b.tone, 'مثل: هادئة واثقة، بلا مبالغة ولا عامّيّة')}
    ${text('br-avoid', 'avoid', 'ما لا يُقال', b.avoid, 'مثل: لا أسماء عملاء، ولا أسعار')}
    <fieldset class="field"><legend>على أيّ قنوات؟</legend><div class="row gap-2">${boxes}</div></fieldset>
    ${field({ id: 'br-week', label: 'كم منشورًا في الأسبوع لكلّ قناة؟',
      control: `<input type="number" name="per_week" min="0" max="28" step="1" value="${b.perWeek}">` })}
    <div class="row"><button class="btn btn-primary" type="submit">احفظ الموجز</button></div>
  </form>`
}

/**
 * **«ابدأ الخطّة»** (D-258): يكتب البنودَ كلَّها في الخلفيّة. والتأكيدُ يقول العددَ والتقديرَ قبل أن يقع،
 * ويقول إنّ شيئًا لا يُنشر قبل الاعتماد.
 */
function startForm(d: ClientData): string {
  if (d.plan === null) return ''
  // ‏التقديرُ قبل «ابدأ» (D-282): بندٌ لكلّ مسوّدة، وصورةٌ لكلّ بندٍ غيرِ مقطع إن اختارها المالكُ في الخطّة (أو الإعدادُ العامّ لخطّةٍ قبلها)
  const seen = new Set<string>()
  const items = d.plan.plan.items.filter((i) => { const k = `${i.sourceId}:${i.platform}`; if (seen.has(k)) return false; seen.add(k); return true })
  const autoImage = d.plan.choices.channels.length === 0 ? d.autoImage : d.plan.choices.autoImage
  const line = estimateLine(estimatePlan({ items, autoImage, perDraft: d.estimate.perDraft, perImage: d.estimate.perImage }))
  return `<form class="inline" method="POST" action="/panel/plan/start" data-busy="جار البدء…"
      data-confirm="${escapeHtml(`ابدأ الخطّة؟ ${line}، ولا يُنشر منها شيءٌ قبل اعتمادك.`)}">
      <input type="hidden" name="id" value="${escapeHtml(d.plan.id)}">
      <button class="btn btn-primary btn-sm" type="submit">ابدأ الخطّة</button></form>`
}

/**
 * **الرحلةُ في ستّ خطوات** (D-260) — كما قالها المالك: قسّم، واختر، وولّد في دقائق، وعدّل وانقل واحذف، واعتمد، ثمّ شكرًا.
 * شريطٌ واحدٌ فوق المحطّات: ما مضى بعلامته، والخطوةُ الحاليّة بارزةٌ وتحتها سطرُها وزرُّها، وما بعدها خافت.
 */
const FLOW = ['قسّم', 'اختر', 'ولّد', 'عدّل وانقل', 'اعتمد', 'شكرًا'] as const

/** «جدول المعتمَد» (D-261): زرٌّ واحد، والتأكيدُ يقول العددَ وأنّ المسوّدةَ غيرَ المعتمَدة لا تُمسّ. */
function scheduleForm(d: ClientData): string {
  if (d.plan === null || (d.ready ?? 0) === 0) return ''
  return `<form class="inline" method="POST" action="/panel/plan/schedule" data-busy="جار الجدولة…"
      data-confirm="${escapeHtml(`جدول ${d.ready} على أرجح الأوقات؟ وما لم تعتمده لا يُجدوَل.`)}">
      <input type="hidden" name="id" value="${escapeHtml(d.plan.id)}">
      <button class="btn btn-primary btn-sm" type="submit">جدول المعتمَد</button></form>`
}

function flow(d: ClientData): string {
  // ‏ما ينتظر من هذه الخطّة (D-282) يحدّد الخطوة، لا كلُّ مسوّدات العميل — ومسوّدةٌ من غير الخطّة لا تُبقي الرحلةَ عند «اعتمد»
  const waiting = d.pending ?? d.waiting ?? 0
  const ready = d.ready ?? 0
  const now = d.plan === null ? 0 : d.plan.status === 'draft' ? 1 : (d.written ?? 0) === 0 ? 2 : waiting > 0 ? 3 : ready > 0 ? 4 : 5
  const say: readonly string[] = [
    `خطّط من أسبوعٍ إلى شهرين — يقسّم صدى المصادرَ والأفكارَ على الأيّام والقنوات. ${'<a href="/panel#sub-plan">خطّط</a>'}`,
    'لكلّ بند: <b>ولّد</b> أو <b>ارفع</b> أو <b>من الأصول</b>، واسحبه إلى يومه — ثمّ «ابدأ الخطّة».',
    '«ابدأ الخطّة» يكتب كلَّ شيءٍ في الخلفيّة خلال دقائق — وإن ضغطتها فأعد فتح الصفحة بعد قليل.',
    `${waiting} ${waiting === 1 ? 'مسوّدةٌ تنتظر' : 'مسوّداتٍ تنتظر'}: عدّل نصَّها أو انقل موعدها أو احذفها، ثمّ اعتمد. <a href="/panel#posts">افتحها</a> ${
      d.plan === null ? '' : approveAllForm(d.plan.id, d.pending ?? 0).value}`,
    `${ready} ${ready === 1 ? 'منشورٌ معتمَد' : 'منشوراتٍ معتمَدة'} — تُجدوَل كلٌّ في يوم بنده وأرجح ساعات منصّته. ${scheduleForm(d)}`,
    'شكرًا — الخطّةُ كُتبت واعتُمدت وجُدولت، وصدى ينشرها في مواعيدها ويقيسها. <a href="/panel#posts">المجدوَلة</a>',
  ]
  const steps = FLOW.map((t, i) => `<li data-state="${i < now ? 'done' : i === now ? 'now' : 'next'}"${i === now ? ' aria-current="step"' : ''}>
      <span class="flow-n" aria-hidden="true">${i < now ? '✓' : i + 1}</span>${escapeHtml(t)}</li>`).join('')
  return `<div class="card mb-4"><ol class="flow">${steps}</ol><p class="hint m-0 mt-3">${say[now]}</p></div>`
}

export function clientScreen(d: ClientData): string {
  const b = d.brief
  const chosen = b.channels
  const missing = chosen.filter((p) => (d.linked[p] ?? 0) === 0)
  const e = d.estimate
  const cost = e.posts === 0
    ? 'اختر القنوات والإيقاع في الموجز ليُقدَّر الشهر.'
    : `${e.posts} منشورًا${e.images > 0 ? ` و${e.images} صورة` : ''} في الشهر — ${e.usd === null
      ? '<b>ولا تقدير قبل أوّل مسوّدة</b>: يُقاس على ما أُنفق فعلًا لا على قائمة أسعار'
      : `نحو <b>${escapeHtml(money(e.usd))}</b>، والمنفَق هذا الشهر ${escapeHtml(money(d.spentMonth))}`}.`

  const states: State[] = []
  const at = (state: State): State => { states.push(state); return state }
  const stations = [
    station(1, 'العميل', at('done'), `<bdi>${escapeHtml(d.orgName)}</bdi>`, link('/panel/settings#orgs', 'بدّل العميل')),
    station(2, 'الموجز', at(isEmptyBrief(b) ? 'todo' : 'done'),
      isEmptyBrief(b) ? 'لم يُكتب بعد — والكتابةُ بلا موجزٍ بصوتٍ عامّ.' : escapeHtml(b.goal || b.tone || b.audience), link('#brief', isEmptyBrief(b) ? 'اكتبه' : 'عدّله', isEmptyBrief(b))),
    station(3, 'القنوات', at(chosen.length === 0 ? 'idle' : missing.length === 0 ? 'done' : 'todo'),
      chosen.length === 0 ? 'لم تُختر في الموجز.'
        : missing.length === 0 ? `${chosen.map((p) => escapeHtml(platformLabel(p as never))).join(' · ')} — كلُّها مربوطة.`
          : `بقي ربطُ ${missing.map((p) => escapeHtml(platformLabel(p as never))).join(' و')}.`,
      link('/panel/accounts', missing.length === 0 ? 'الحسابات' : 'اربط', missing.length > 0)),
    station(4, 'الخطّة', at(d.plan === null ? 'todo' : 'done'),
      d.plan === null ? 'لا خطّة بعد — من أسبوعٍ إلى شهرين.'
        : `${SPAN_LABEL[d.plan.span ?? 'week']} يبدأ ${escapeHtml(d.plan.week)}: ${d.plan.plan.items.length} بندًا، ${d.plan.status === 'approved' ? 'معتمَدة' : 'تنتظر اعتمادك'}.`,
      d.plan === null
        ? link('/panel#sub-plan', 'خطّط', true)
        : `${link('/panel#sub-plan', 'افتحها')}${startForm(d)}`),
    station(5, 'المحتوى', at(d.autoImage ? 'done' : 'idle'),
      d.autoImage ? 'كلُّ مسوّدةٍ تأتي بصورتها، أو اختر لبندٍ من الأصول.' : 'لكلّ بند: ولّد، أو ارفع، أو اختر من الأصول.',
      `${link('/panel/assets', 'الأصول')}${link('/panel/settings#auto-image', 'الصورة الآليّة')}`),
    station(6, 'الكلفة', at(e.posts === 0 ? 'idle' : 'done'), cost, link('/panel/settings#limits', 'السقوف')),
    station(7, 'التحليل', at(d.measured >= 8 ? 'done' : 'idle'),
      d.measured >= 8 ? `${d.measured} منشورًا قِيست: أرجحُ الأوقات وأفضلُ الأشكال جاهزة.` : `${d.measured} من 8 منشورات قِيست — ثمّ يُقال ما ينجح.`,
      `${link('/panel/insights', 'ما ينجح')}${link('/panel/client/report', 'تقرير الشهر')}`),
  ]
  const ready = states.filter((x) => x === 'done').length
  const next = TITLES[states.indexOf('todo')]

  return `${pageHead('العميل', 'رحلةُ العميل', 'من «ماذا تريد؟» إلى «ما الذي نجح؟» — <b>كلُّ محطّةٍ تقول حالَها وزرَّها</b>، ولا يُنشر شيءٌ قبل اعتمادك.')}
  ${d.flash === undefined || d.flash === null ? '' : toastRegion(notice({ tone: d.flash.kind, html: escapeHtml(d.flash.text), alert: d.flash.kind === 'bad' }))}
  ${d.saved === true ? toastRegion(notice({ tone: 'ok', g: '●', html: 'حُفظ الموجز — والخطّةُ والكتابةُ تقرآنه من الآن.' })) : ''}
  <p class="lede m-0 mb-4"><b>اكتمل ${ready} من 7</b>${next === undefined ? ' — العميلُ جاهز.' : ` — التالي: <b>${escapeHtml(next)}</b>.`}</p>
  ${flow(d)}
  <div class="grid tiles c4 mb-4">${stations.join("")}</div>
  ${d.plan === null ? '' : planBoard(d.plan, d.names ?? {}, d.sources ?? [])}
  <div class="card mt-4" id="brief"><h2>الموجز</h2>
    <p class="hint">يقرؤه مخطِّطُ الخطّة وكاتبُ المسوّدات، <b>وصفًا يُراعى</b>: القيودُ قبله أعلى منه، فلا رقمَ يُخترَع ولا رابط.</p>
    ${briefForm(b)}
  </div>
  ${d.options === undefined ? '' : optionsCard(d.options)}
  ${d.limits === undefined ? '' : limitsCard(d.limits)}`
}

/**
 * **خيارا هذا العميل** (D-412): كلاهما مطفأٌ حتّى يُفتح. الموافقةُ تُمسك الجدولةَ حتّى يقول العميلُ «موافق» في رابطه،
 * والتقريرُ يصل بريدَ المالك أوّلَ كلّ شهرٍ عن الشهر الذي انقضى — أرقامٌ وحدَها، بلا رمزٍ ولا رابط.
 */
function optionsCard(o: NonNullable<ClientData['options']>): string {
  const box = (id: string, name: string, on: boolean, label: string, hint: string): string =>
    field({ id, label, hint, control: '<input type="checkbox" name="' + name + '" value="1"' + (on ? ' checked' : '') + '>' })
  return '<div class="mt-4">' + card({ id: 'options', title: 'خيارا هذا العميل', body: html`<form method="POST" action="/panel/client/options" class="stack">
      ${raw(box('co-approval', 'approval_required', o.approvalRequired, 'لا يُنشر قبل موافقته', 'لا يُجدوَل منشورٌ حتّى يقول «موافق» في رابط الموافقة، ومنشورٌ نُقل موعدُه يُطلب له رأيٌ جديد.'))}
      ${raw(box('co-report', 'report_mail', o.reportMail, 'تقريرُ الشهر إلى البريد', 'أوّلَ كلّ شهرٍ يصل بريدَك تقريرُ الشهر الذي انقضى، فتحوّله إليه.'))}
      <div class="row gap-2">${raw(button({ label: 'احفظ الخيارين', variant: 'primary', type: 'submit' }))}</div>
    </form>`.value }) + '</div>'
}

/**
 * **حدودُ هذا العميل** (D-295): أربعةُ سقوفٍ يرثها من العامّ، ويكتب لنفسه ما يشاء منها. فراغٌ يعني «العامّ»،
 * والعامُّ يبقى فوق الكلّ. ولمنظّمة المالك لا نموذج: هي العامُّ نفسُه في «الإنفاق والحدود».
 */
function limitsCard(l: NonNullable<ClientData['limits']>): string {
  if (l.ownerOrg) {
    return html`<div class="card mt-4" id="limits"><h2>الحدود</h2>
      <p class="hint m-0">هذه منظّمةُ المالك، وحدودُها هي <b>العامّة</b> على الكلّ: ${money(l.global.spend)} في اليوم،
        و${l.global.image} صورة، و${l.global.video} مقطع، و${l.global.analysis} تحليلًا. تُعدَّل من
        <a href="/panel/settings#limits">الإنفاق والحدود</a>. وعميلٌ آخر يكتب لنفسه سقفًا دونها من صفحته.</p>
    </div>`.value
  }
  const num = (id: string, name: string, label: string, mine: number | undefined, global: string, attrs: string): string =>
    field({ id, label, hint: 'العامّ: ' + global + ' — واتركه فارغًا ليبقى العامّ',
      control: html`<input type="number" name="${name}" ${raw(attrs)} dir="ltr" placeholder="${global}" value="${mine === undefined ? '' : String(mine)}">`.value })
  return html`<div class="card mt-4" id="limits"><h2>حدودُ هذا العميل</h2>
    <p class="hint">السقفُ العامُّ يبقى فوق الكلّ، وهذه سقوفُ هذا العميل وحدَه ممّا أنفقه هو: بلوغُها يوقف الكتابةَ والصورَ له
      ولا يوقف غيرَه. <b>أنفق اليوم ${money(l.spentToday)}.</b></p>
    <form method="POST" action="/panel/client/limits" class="stack">
      <div class="grid c2 gap-2">
        ${raw(num('cl-spend', 'daily_spend_cap_usd', 'سقف الإنفاق في اليوم (دولار)', l.mine.spend, money(l.global.spend), 'min="0" max="100" step="0.5"'))}
        ${raw(num('cl-image', 'daily_image_cap', 'سقف الصور في اليوم', l.mine.image, String(l.global.image), 'min="0" max="50" step="1"'))}
        ${raw(num('cl-video', 'daily_video_cap', 'سقف المقاطع في اليوم', l.mine.video, String(l.global.video), 'min="0" max="20" step="1"'))}
        ${raw(num('cl-analysis', 'daily_analysis_cap', 'سقف التحليل في اليوم', l.mine.analysis, String(l.global.analysis), 'min="0" max="500" step="1"'))}
      </div>
      <div class="row gap-2"><button class="btn btn-primary" type="submit">احفظ الحدود</button></div>
    </form>
  </div>`.value
}
