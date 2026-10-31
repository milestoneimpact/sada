/**
 * قسمُ الخطّة الأسبوعيّة.
 *
 * ## بندٌ اقتراحٌ لا أمر
 *
 * كلُّ بندٍ يعرض زرَّ «اكتب منه» — **وهو الزرُّ نفسه الذي في قسم
 * المصادر**، لا طريقا ثانيا. فالكلفةُ تقع بضغطةٍ واحدةٍ يراها المالك،
 * ولا تنفّذ الخطّةُ نفسَها.
 *
 * ## والاعتمادُ إقرارٌ بالمنطق
 *
 * «اعتمد الخطّة» لا يكتب حرفا ولا يُنفق. هو علامةٌ تقول: قرأتُ منطقَ
 * الأسبوع ووافقتُ عليه. **وزرٌّ يوهم بأنّه ينفّذ أسوأ من غيابه.**
 */
import { stamp } from '../../../lib/time/zone'
import { escapeHtml } from '../escape'
import { platformLabel } from '../../../lib/oauth/providers'
import { relativeTime } from '../../../lib/format'
import type { StoredPlan } from '../../../lib/plan/job'
import { statusBadge } from '../components/badge'
import { emptyState } from '../components/empty'
import { stagesAttr } from '../components/stages'
import { html, raw, type Html } from '../html'
import { money } from '../../../lib/format'
import { CLIP_CHANNELS, PLAN_CHANNELS, PLAN_SPANS, SPAN_LABEL, weekStart, type PlanKind, type PlanPlatform } from '../../../lib/plan/prompt'

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** اسمُ اليوم من تاريخه — أقربُ إلى القراءة من `2026-09-14`. */
function dayName(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(at) ? day : (DAYS[new Date(at).getUTCDay()] ?? day)
}

export interface PlanInput {
  readonly plan: StoredPlan | null
  /** أسماءُ المصادر بمعرّفاتها — البندُ يحمل معرّفا، والمالك يقرأ اسما. */
  readonly names: Readonly<Record<string, string>>
  /** أمزوّدُ مهمّة `plan` جاهز؟ */
  readonly ready: boolean
  /** كم مصدرا محلَّلا — أقلُّ من اثنين لا يصنع أسبوعا. */
  readonly analyzed: number
  readonly now: Date
  /** ‏منطقةُ المالك (D-203): الموعدُ مخزَّنٌ بـ UTC ويُقرأ بها، و`null` «بتوقيت الرياض» */
  readonly zone?: string | null
  /** آخرُ ضغطةٍ على «خطّط الأسبوع» من سجلّ التدقيق — وسببُها إن فشلت (D-157) */
  readonly lastAttempt?: { readonly at: string; readonly detail: string | null } | null
  /** ما يحتاجه نموذجُ الخطّة (D-282): القنواتُ المربوطةُ وإيقاعُها، والمصادرُ المحلَّلة، وكلفةُ الصورة. */
  readonly form?: PlanFormInput
  /** مسوّداتُ هذه الخطّة التي تنتظر القرار — لزرّ «اعتمد الخطّة كاملةً». */
  readonly pending?: number
}

export interface PlanFormInput {
  /** القنواتُ المربوطةُ بحسابٍ نشط. */
  readonly linked: readonly string[]
  /** قنواتُ الموجز — المحدَّدةُ أوّلًا. */
  readonly chosen: readonly string[]
  readonly perWeek: number
  /** المصادرُ المحلَّلة التي يُختار منها. */
  readonly sources: readonly { readonly id: string; readonly name: string }[]
  /** وسيطُ كلفة الصورة من الدفتر، أو `null` قبل أوّل صورة. */
  readonly perImage: number | null
  readonly autoImage: boolean
}

const KIND_LABEL: Readonly<Record<PlanKind, string>> = { text: 'نصّ', image: 'صورة', video: 'مقطع' }

/** رقاقةُ نوع البند — ما يُنشر مع النصّ، وغيابُه في خطّةٍ قديمة نصّ. */
export function kindChip(kind: PlanKind | undefined): Html {
  return html`<span class="chip">${KIND_LABEL[kind ?? 'text']}</span>`
}

/**
 * **نموذجُ الخطّة** (D-282): المدى من أربعة، ويومُ البداية (الأحدُ القادم افتراضًا)، والقنواتُ المربوطةُ وإيقاعُ كلٍّ في الأسبوع،
 * والمصادرُ («الكلّ» افتراضًا)، وأفكارٌ سطرًا سطرًا، و«ولّد صورةً مع كلّ منشور» بكلفتها. والشاشةُ الكاملةُ بخطواتها
 * الأربع تأتي بعدها؛ هذا ما يلزم ليُختار كلُّ شيء من اللوحة.
 */
function planForm(input: PlanInput, f: PlanFormInput, replacing: boolean): Html {
  const off = input.ready && input.analyzed >= 2 ? false : true
  const spans = PLAN_SPANS.map((sp) => html`<label class="vpf"><input type="radio" name="span" value="${sp}"${sp === 'week' ? raw(' checked') : ''}><span class="vpf-b"><b>${SPAN_LABEL[sp]}</b></span></label>`)
  const channels = PLAN_CHANNELS.map((p: PlanPlatform) => {
    const linked = f.linked.includes(p)
    const checked = linked && (f.chosen.length === 0 ? !CLIP_CHANNELS.has(p) : f.chosen.includes(p))
    return html`<label class="vpf"><input type="checkbox" name="channel" value="${p}"${checked ? raw(' checked') : ''}${linked ? '' : raw(' disabled')}>
      <span class="vpf-b"><b>${platformLabel(p)}</b>${linked
        ? html`<span class="row gap-2"><input type="number" name="cadence_${p}" min="0" max="28" step="1" value="${f.perWeek}" dir="ltr" aria-label="${platformLabel(p)} في الأسبوع"> في الأسبوع</span>`
        : html`<span class="ago">غير مربوطة</span>`}${CLIP_CHANNELS.has(p) ? html`<span class="ago">كلُّ بند لها مقطع ترفعه</span>` : ''}</span></label>`
  })
  const sources = f.sources.slice(0, 60).map((x) => html`<label class="vpf"><input type="checkbox" name="source" value="${x.id}"><span class="vpf-b"><bdi>${x.name}</bdi></span></label>`)
  const imageCost = f.perImage === null ? html`ولا تقدير لكلفة الصورة قبل أوّل صورة تُقاس عليها` : html`ونحو ${money(f.perImage)} للصورة`
  return html`<form method="POST" action="/panel/plan/generate" class="stack mt-3" data-busy="جار التخطيط…"${replacing ? raw(' data-confirm="سيحلّ محلّ خطّتك لهذا المدى. أتمضي؟"') : ''}>
    <fieldset class="field"><legend>المدى</legend><div class="row gap-2">${spans}</div></fieldset>
    <div class="field"><label for="plan-start">يوم البداية</label>
      <p class="field-hint" id="plan-start-hint">الأحد القادم افتراضًا — وأسبوع العمل يبدأ الأحد.</p>
      <input type="date" id="plan-start" name="start" value="${weekStart(input.now)}" dir="ltr" aria-describedby="plan-start-hint"></div>
    <fieldset class="field"><legend>القنوات وإيقاعُها</legend>
      <p class="field-hint">ما رُبط بحساب وحده يُختار، والرقم كم منشورًا في الأسبوع لكلّ قناة.</p>
      <div class="row gap-2">${channels}</div></fieldset>
    <fieldset class="field"><legend>المصادر</legend>
      <p class="field-hint">بلا اختيار تُقرأ المصادر المحلَّلة كلُّها.</p>
      <div class="row gap-2"><label class="vpf"><input type="checkbox" name="source" value="all" checked><span class="vpf-b"><b>الكلّ</b></span></label>${sources}</div></fieldset>
    <div class="field"><label for="plan-ideas">أفكار بكلماتك</label>
      <p class="field-hint" id="plan-ideas-hint">سطر لكلّ فكرة، حتّى عشرين — تدخل الخطّة كما يدخل المصدر.</p>
      <textarea id="plan-ideas" name="ideas" rows="3" dir="auto" aria-describedby="plan-ideas-hint"></textarea></div>
    <input type="hidden" name="auto_image" value="0">
    <label class="vpf"><input type="checkbox" name="auto_image" value="1"${f.autoImage ? raw(' checked') : ''}><span class="vpf-b"><b>ولّد صورة مع كلّ منشور</b><span class="ago">${imageCost} — تُحسب في التقدير قبل «ابدأ»</span></span></label>
    <div class="row"><button class="btn ${replacing ? 'btn-secondary' : 'btn-primary'}" type="submit"${off ? raw(' disabled') : ''}>${replacing ? 'ابن خطّة جديدة' : 'ابن الخطّة'}</button></div>
  </form>`
}

/**
 * **سبب آخر فشل يُقرأ في مكانه** (D-157). كان الفلاش يقوله مرّة ثمّ يزول،
 * وسجلُّ التدقيق يحفظ «failed» بلا سبب، فيعود المالك إلى الزرّ ولا يعرف
 * لماذا لم تُكتب خطّة. السطر يبقى حتّى تنجح محاولة أحدث منه.
 */
function lastAttemptLine(input: PlanInput): string {
  const a = input.lastAttempt
  if (a === null || a === undefined || a.detail === null || a.detail === 'planned') return ''
  if (input.plan !== null && input.plan.createdAt >= a.at) return ''
  const [kind, ...rest] = a.detail.split(': ')
  const reason = rest.join(': ')
  const cls = kind === 'failed' ? 'bad' : 'warn'
  const glyph = kind === 'failed' ? '✕' : '!'
  const what = kind === 'failed' ? 'فشلت' : kind === 'blocked' ? 'أُوقفت' : 'لم تكف المادّة'
  return `<div class="lede-row mt-3">
      ${statusBadge(cls, glyph, `آخر محاولة ${what} ${escapeHtml(relativeTime(a.at, input.now))}`)}
      <span class="lede-note">${reason === '' ? 'بلا سبب مسجَّل — أعد المحاولة وسيُكتب السبب.' : escapeHtml(reason)}</span>
    </div>`
}

function row(
  item: StoredPlan['plan']['items'][number],
  names: Readonly<Record<string, string>>,
  zone: string | null,
): string {
  const name = names[item.sourceId] ?? '— مصدر حُذف —'
  const gone = names[item.sourceId] === undefined
  return `<tr>
    <td data-label="متى"><b>${escapeHtml(dayName(item.day))}</b>
      <div class="mono">${escapeHtml(stamp(`${item.day} ${item.time}`, zone))}</div></td>
    <td data-label="المنصّة"><span class="chip">${escapeHtml(platformLabel(item.platform))}</span> ${kindChip(item.kind).value}</td>
    <td data-label="المصدر"><div class="nm">${escapeHtml(name)}</div>
      <div class="sub">${escapeHtml(item.angle)}</div>
      ${item.why === '' ? '' : `<div class="sub">— ${escapeHtml(item.why)}</div>`}</td>
    <td data-label="">${gone
      ? statusBadge('idle', '○', 'لا مصدر')
      : `<form class="inline" method="POST" action="/panel/drafts/write" data-busy="جار الكتابة…" ${stagesAttr('write')}>
           <input type="hidden" name="id" value="${escapeHtml(item.sourceId)}">
           <input type="hidden" name="platform" value="${escapeHtml(item.platform)}">
           <button class="btn btn-secondary btn-sm" type="submit">اكتب منه</button></form>`}</td>
  </tr>`
}

export function planSection(input: PlanInput): string {
  const { plan, now } = input

  // ‏أسبوع أو شهر (D-256): زرّان في نموذج واحد، والزرُّ يحمل المدى
  const off = input.ready && input.analyzed >= 2 ? '' : ' disabled'
  const generate = input.form !== undefined ? '' : `<form class="inline" method="POST" action="/panel/plan/generate"
      data-busy="جار التخطيط…"${plan === null ? '' : ' data-confirm="سيحلّ محلّ خطّتك لهذا المدى. أتمضي؟"'}>
      <button class="btn ${plan === null ? 'btn-primary' : 'btn-secondary'} btn-sm" type="submit" name="span" value="week"${off}>${
        plan === null ? 'خطّط الأسبوع' : 'أعد تخطيط الأسبوع'}</button>
      <button class="btn btn-secondary btn-sm" type="submit" name="span" value="month"${off}>خطّط الشهر</button></form>`

  const why =
    !input.ready
      ? '<p class="hint m-0 mt-2">مزوّد مهمّة الخطّة غير جاهز — اضبط مفتاحه في «المزوّدون».</p>'
      : input.analyzed < 2
        /*
         * **ودعوة إلى فعل زرٌّ لا كلمة في جملة** (D-108).
         *
         * قِيست ‏٥٥×‏١٥px عند ‏٤٣٠ — **دون هدف اللمس بثلاثة أضعاف**.
         * ولم يرَها مدقّق قطُّ لأنّها لا تظهر إلّا حين تكون المصادر بلا
         * تحليل، **وعيّنة الرسم كانت نظاما يعمل**. فأظهرتها عيّنة
         * اليوم الأوّل.
         */
        ? `<p class="hint m-0 mt-2">${input.analyzed === 0 ? 'لا مصدر محلَّل بعد' : 'مصدر واحد محلَّل'} — والخطّة تحتاج اثنين على الأقلّ.</p>
           <a class="btn btn-secondary btn-sm mt-2" href="#sources">حلّل مصادرك</a>`
        : ''

  if (plan === null) {
    return `<div class="card">
      <div class="card-head"><h2>الخطّة الأسبوعيّة</h2><div class="grow"></div>${generate}</div>
      ${emptyState({
        echo: true,
        title: 'لا خطّة بعد',
        html: `نداء واحد يقرأ خلاصات ما حُلِّل، ويقول ما يستحقّ النشر هذا الأسبوع
           وعلى أيّ منصّة وبأيّ ترتيب. <b>ويقترح ولا يكتب</b> — والكتابة زرّ لكلّ بند.`,
      })}
      ${why}
      ${input.form === undefined ? '' : planForm(input, input.form, false).value}
      ${lastAttemptLine(input)}
    </div>`
  }

  const status =
    plan.status === 'approved'
      ? statusBadge('ok', '●', 'معتمَدة')
      : statusBadge('idle', '○', 'تنتظر قراءتك')

  return `<div class="card">
    <div class="card-head"><h2>الخطّة الأسبوعيّة</h2>
      <div class="grow"></div>${status}${generate}</div>

    <div class="lede-row m-0 mb-3">
      <span class="chip mono">أسبوع ${escapeHtml(plan.week)}</span>
      <span class="chip mono">${escapeHtml(plan.model)}</span>
      <span class="ago">وُضعت ${escapeHtml(relativeTime(plan.createdAt, now))}</span>
    </div>

    ${plan.plan.rationale === ''
      ? ''
      : `<p class="draft-why mb-4">${escapeHtml(plan.plan.rationale)}</p>`}

    <div class="scroll"><table>
      <thead><tr><th>متى</th><th>المنصّة</th><th>المصدر والزاوية</th><th><span class="vh">الإجراء</span></th></tr></thead>
      <tbody>${plan.plan.items.map((i) => row(i, input.names, input.zone ?? null)).join('')}</tbody>
    </table></div>

    ${lastAttemptLine(input)}
    <div class="lede-row mt-3">
      <span class="lede-note"><b>الخطّة تقترح ولا تنفّذ.</b> كلّ «اكتب منه» نداء مدفوع بضغطتك،
        والمسوّدة بعده تنتظر اعتمادَك كأيّ مسوّدة.</span>
      <span class="grow"></span>
      ${plan.status === 'draft'
        ? `<form class="inline" method="POST" action="/panel/plan/approve" data-busy="جار…">
             <input type="hidden" name="id" value="${escapeHtml(plan.id)}">
             <button class="btn btn-primary btn-sm" type="submit">اعتمد المنطق</button></form>`
        : ''}
      ${approveAllForm(plan.id, input.pending ?? 0).value}
    </div>
    ${input.form === undefined ? '' : html`<details class="pb-more mt-3"><summary>خطّة جديدة</summary>${planForm(input, input.form, true)}</details>`.value}
  </div>`
}

/**
 * **«اعتمد الخطّة كاملةً»** (D-282): كلُّ مسوّدةٍ من الخطّة تنتظر القرار تُعتمَد بضغطة، والتأكيدُ يقول العددَ وأنّ شيئًا
 * لا يُنشر قبل الجدولة. ولا زرَّ حين لا شيءَ ينتظر.
 */
export function approveAllForm(planId: string, pending: number): Html {
  if (pending === 0) return html``
  return html`<form class="inline" method="POST" action="/panel/plan/approve-all" data-busy="جار الاعتماد…"
      data-confirm="${html`اعتمد ${pending} ${pending === 1 ? 'مسوّدة' : 'مسوّدات'} من الخطّة كما كُتبت؟ ولا يُنشر منها شيء حتّى تجدولها.`}">
      <input type="hidden" name="id" value="${planId}">
      <button class="btn btn-primary btn-sm" type="submit">اعتمد الخطّة كاملة</button></form>`
}
