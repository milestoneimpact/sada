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
import { itemStamp } from '../../../lib/time/zone'
import { escapeHtml } from '../escape'
import { platformLabel } from '../../../lib/oauth/providers'
import { relativeTime } from '../../../lib/format'
import type { StoredPlan } from '../../../lib/plan/job'
import { statusBadge } from '../components/badge'
import { emptyState } from '../components/empty'
import { stagesAttr } from '../components/stages'
import { button } from '../components/button'
import { maySpend, SPEND_LOCKED } from '../../../lib/access'
import { html, raw, type Html } from '../html'
import type { PlanKind } from '../../../lib/plan/prompt'

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

const KIND_LABEL: Readonly<Record<PlanKind, string>> = { text: 'نصّ', image: 'صورة', video: 'مقطع', thread: 'سلسلة' }

/** رقاقةُ نوع البند — ما يُنشر مع النصّ، وغيابُه في خطّةٍ قديمة نصّ. */
export function kindChip(kind: PlanKind | undefined): Html {
  return html`<span class="chip">${KIND_LABEL[kind ?? 'text']}</span>`
}

/**
 * **«خطّة جديدة» زرٌّ إلى شاشتها** (D-283). كان النموذجُ كلُّه هنا (D-282): ستّةُ قراراتٍ في قسمٍ واحد، وخمسُ منصّاتٍ
 * ثلاثٌ منها معطّلة. فصار خطواتٍ في `/panel/plan/new`، وهنا الطريقُ إليها وحدَه.
 */
function newPlanLink(replacing: boolean): string {
  return html`<a class="btn ${replacing ? 'btn-secondary' : 'btn-primary'} btn-sm" href="/panel/plan/new">خطّة جديدة</a>`.value
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
      <div class="mono">${escapeHtml(itemStamp(item.day, item.time, zone))}</div></td>
    <td data-label="المنصّة"><span class="chip">${escapeHtml(platformLabel(item.platform))}</span> ${kindChip(item.kind).value}</td>
    <td data-label="المصدر"><div class="nm">${escapeHtml(name)}</div>
      <div class="sub">${escapeHtml(item.angle)}</div>
      ${item.why === '' ? '' : `<div class="sub">— ${escapeHtml(item.why)}</div>`}</td>
    <td data-label="">${gone
      ? statusBadge('idle', '○', 'لا مصدر')
      : `<form class="inline" method="POST" action="/panel/drafts/write" data-busy="جار الكتابة…" ${stagesAttr('write')}>
           <input type="hidden" name="id" value="${escapeHtml(item.sourceId)}">
           <input type="hidden" name="platform" value="${escapeHtml(item.platform)}">
           ${/* ‏والمحرّرُ لا يبدأ كتابةً مدفوعة (D-318): الزرُّ معطَّلٌ وسببُه تحته */ ''}${maySpend()
             ? '<button class="btn btn-secondary btn-sm" type="submit">اكتب منه</button>'
             : button({
               label: 'اكتب منه', variant: 'secondary', size: 'sm', type: 'submit',
               disabled: { id: ('pw-' + item.day + '-' + item.platform + '-' + item.time).replace(/[^A-Za-z0-9_-]/g, ''), reason: SPEND_LOCKED },
             })}</form>`}</td>
  </tr>`
}

export function planSection(input: PlanInput): string {
  const { plan, now } = input

  // ‏أسبوع أو شهر (D-256): زرّان في نموذج واحد، والزرُّ يحمل المدى. والمحرّرُ لا يولّد خطّة (D-318): سببٌ مكتوبٌ بدل الزرّين
  // ‏والمعطَّلُ يصف نفسَه بسببه المكتوب تحته (D-325): كان «disabled» وحدَه والسببُ سطرٌ لا يربطه شيء
  const off = input.ready && input.analyzed >= 2 ? '' : ' disabled aria-describedby="pl-why"'
  const generate = input.form !== undefined ? '' : !maySpend()
    ? '<p class="note m-0" data-spend-locked>' + escapeHtml(SPEND_LOCKED) + '</p>'
    : `<form class="inline" method="POST" action="/panel/plan/generate"
      data-busy="جار التخطيط…"${plan === null ? '' : ' data-confirm="سيحلّ محلّ خطّتك لهذا المدى. أتمضي؟"'}>
      <button class="btn ${plan === null ? 'btn-primary' : 'btn-secondary'} btn-sm" type="submit" name="span" value="week"${off}>${
        plan === null ? 'خطّط الأسبوع' : 'أعد تخطيط الأسبوع'}</button>
      <button class="btn btn-secondary btn-sm" type="submit" name="span" value="month"${off}>خطّط الشهر</button></form>`

  const why =
    !input.ready
      /*
       * ‏(مراجعة D-325) وكان السببُ «اضبط مفتاحه في «المزوّدون»» — كلمةٌ يمنعها المعجم (GLOSSARY §١) واسمُ قسمٍ لم يعد موجودًا،
       * ‏يُقرأ تحت «لا خطّة بعد»، وسببًا للزرّين المعطَّلين حيث يُرسمان. فالسببُ باسم القسم كما يُرى، وبابُه زرٌّ إليه من أيّ لوح
       */
      ? '<p class="hint m-0 mt-2" id="pl-why">خدمة الكتابة لمهمّة الخطّة غير جاهزة — اضبط مفتاحها في «خدمات الكتابة والصور» من الإعدادات.</p>' +
        html`<div class="mt-2">${raw(button({ label: 'افتح خدمات الكتابة والصور', size: 'sm', href: '/panel/settings#providers' }))}</div>`.value
      : input.analyzed < 2
        /*
         * **ودعوة إلى فعل زرٌّ لا كلمة في جملة** (D-108).
         *
         * قِيست ‏٥٥×‏١٥px عند ‏٤٣٠ — **دون هدف اللمس بثلاثة أضعاف**.
         * ولم يرَها مدقّق قطُّ لأنّها لا تظهر إلّا حين تكون المصادر بلا
         * تحليل، **وعيّنة الرسم كانت نظاما يعمل**. فأظهرتها عيّنة
         * اليوم الأوّل.
         */
        ? `<p class="hint m-0 mt-2" id="pl-why">${input.analyzed === 0 ? 'لا مصدر محلَّل بعد' : 'مصدر واحد محلَّل'} — والخطّة تحتاج اثنين على الأقلّ.</p>
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
      ${input.form === undefined ? '' : html`<div class="row mt-3">${raw(newPlanLink(false))}</div>`.value}
      ${lastAttemptLine(input)}
    </div>`
  }

  const status =
    plan.status === 'approved'
      ? statusBadge('ok', '●', 'معتمَدة')
      : statusBadge('idle', '○', 'تنتظر قراءتك')

  return `<div class="card">
    <div class="card-head"><h2>الخطّة الأسبوعيّة</h2>
      <div class="grow"></div>${status}${generate}${input.form === undefined ? '' : newPlanLink(true)}</div>
    ${off === '' || generate === '' || !generate.includes('<button') ? '' : why}

    <div class="lede-row m-0 mb-3">
      <span class="chip mono">أسبوع ${escapeHtml(plan.week)}</span>
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
      ${/* ‏زرٌّ أوّليٌّ واحد في البطاقة (D-311 · خطّة التصميم 7.1): ما دامت الخطّةُ مسوّدةً فـ«اعتمد المنطق» أوّلًا وهذا ثانويّ */''}${approveAllForm(plan.id, input.pending ?? 0, plan.status !== 'draft').value}
    </div>
  </div>`
}

/**
 * **«اعتمد الخطّة كاملةً»** (D-282 · D-327): كلُّ مسوّدةٍ من الخطّة تنتظر القرار تُعتمَد بضغطة وتُجدوَل في موعد بندها،
 * والتأكيدُ يقول العددَ وأنّها تُنشر بعدها وحدَها. ولا زرَّ حين لا شيءَ ينتظر.
 */
export function approveAllForm(planId: string, pending: number, primary = true): Html {
  if (pending === 0) return html``
  return html`<form class="inline" method="POST" action="/panel/plan/approve-all" data-busy="جار الاعتماد…"
      data-confirm="${html`اعتمد ${pending} ${pending === 1 ? 'مسوّدة' : 'مسوّدات'} من الخطّة كما كُتبت؟ تُجدوَل في مواعيد بنودها وتُنشر وحدَها.`}">
      <input type="hidden" name="id" value="${planId}">
      <button class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm" type="submit">اعتمد الخطّة كاملة</button></form>`
}
