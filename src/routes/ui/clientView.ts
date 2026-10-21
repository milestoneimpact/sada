/**
 * شاشةُ العميل (D-257 · AGENCY-PLAN) — **رحلتُه في سبع محطّات، وكلُّ محطّةٍ تقول حالَها وزرَّها**.
 *
 * العميلُ ← الموجز ← القنوات ← الخطّة ← المحتوى ← الكلفة ← التحليل. والموجزُ يُكتب هنا، والباقي يدلّ على موضعه:
 * شاشةٌ واحدةٌ تمشي العميلَ من «ماذا تريد؟» إلى «ما الذي نجح؟» بلا بحثٍ في الأقسام.
 */
import { escapeHtml } from './escape'
import { pageHead } from './parts'
import { field } from './components/field'
import { notice, toastRegion } from './components/toast'
import { money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { BRIEF_CHANNELS, BRIEF_MAX, isEmptyBrief, type Brief } from '../../lib/brief'
import type { Estimate } from '../../lib/estimate'
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
  readonly flash?: { readonly kind: 'ok' | 'warn' | 'bad'; readonly text: string } | null
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
  const n = new Set(d.plan.plan.items.map((i) => `${i.sourceId}:${i.platform}`)).size
  const cost = d.estimate.perDraft === null ? 'بكلفة الكتابة المعتادة' : `بنحو ${money(n * d.estimate.perDraft)} للكتابة`
  return `<form class="inline" method="POST" action="/panel/plan/start" data-busy="جار البدء…"
      data-confirm="${escapeHtml(`ابدأ الخطّة؟ تُكتب ${n} مسوّدة ${cost}${d.autoImage ? ' مع صورها' : ''}، ولا يُنشر منها شيءٌ قبل اعتمادك.`)}">
      <input type="hidden" name="id" value="${escapeHtml(d.plan.id)}">
      <button class="btn btn-primary btn-sm" type="submit">ابدأ الخطّة</button></form>`
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
      d.plan === null ? 'لا خطّة بعد — أسبوعًا أو شهرًا.'
        : `${d.plan.span === 'month' ? 'شهرٌ' : 'أسبوعٌ'} يبدأ ${escapeHtml(d.plan.week)}: ${d.plan.plan.items.length} بندًا، ${d.plan.status === 'approved' ? 'معتمَدة' : 'تنتظر اعتمادك'}.`,
      d.plan === null
        ? link('/panel#sub-plan', 'خطّط', true)
        : `${link('/panel#sub-plan', 'افتحها')}${startForm(d)}`),
    station(5, 'المحتوى', at(d.autoImage ? 'done' : 'idle'),
      d.autoImage ? 'كلُّ مسوّدةٍ تأتي بصورتها.' : 'الصورةُ بزرّها على كلّ مسوّدة، أو ارفع صورك ومقاطعك.',
      link('/panel/settings#auto-image', 'الصورة الآليّة')),
    station(6, 'الكلفة', at(e.posts === 0 ? 'idle' : 'done'), cost, link('/panel/settings#limits', 'السقوف')),
    station(7, 'التحليل', at(d.measured >= 8 ? 'done' : 'idle'),
      d.measured >= 8 ? `${d.measured} منشورًا قِيست: أرجحُ الأوقات وأفضلُ الأشكال جاهزة.` : `${d.measured} من 8 منشورات قِيست — ثمّ يُقال ما ينجح.`,
      link('/panel/insights', 'ما ينجح')),
  ]
  const ready = states.filter((x) => x === 'done').length
  const next = TITLES[states.indexOf('todo')]

  return `${pageHead('العميل', 'رحلةُ العميل', 'من «ماذا تريد؟» إلى «ما الذي نجح؟» — <b>كلُّ محطّةٍ تقول حالَها وزرَّها</b>، ولا يُنشر شيءٌ قبل اعتمادك.')}
  ${d.flash === undefined || d.flash === null ? '' : toastRegion(notice({ tone: d.flash.kind, html: escapeHtml(d.flash.text), alert: d.flash.kind === 'bad' }))}
  ${d.saved === true ? toastRegion(notice({ tone: 'ok', g: '●', html: 'حُفظ الموجز — والخطّةُ والكتابةُ تقرآنه من الآن.' })) : ''}
  <p class="lede m-0 mb-4"><b>اكتمل ${ready} من 7</b>${next === undefined ? ' — العميلُ جاهز.' : ` — التالي: <b>${escapeHtml(next)}</b>.`}</p>
  <div class="grid tiles c4 mb-4">${stations.join("")}</div>
  ${d.plan === null ? '' : planBoard(d.plan, d.names ?? {})}
  <div class="card mt-4" id="brief"><h2>الموجز</h2>
    <p class="hint">يقرؤه مخطِّطُ الخطّة وكاتبُ المسوّدات، <b>وصفًا يُراعى</b>: القيودُ قبله أعلى منه، فلا رقمَ يُخترَع ولا رابط.</p>
    ${briefForm(b)}
  </div>`
}
