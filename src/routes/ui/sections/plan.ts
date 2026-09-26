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
import { escapeHtml } from '../shell'
import { platformLabel } from '../../../lib/oauth/providers'
import { relativeTime } from '../../../lib/format'
import type { StoredPlan } from '../../../lib/plan/job'
import { status as chip } from '../parts'

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
}

function row(
  item: StoredPlan['plan']['items'][number],
  names: Readonly<Record<string, string>>,
): string {
  const name = names[item.sourceId] ?? '— مصدرٌ حُذف —'
  const gone = names[item.sourceId] === undefined
  return `<tr>
    <td data-label="متى"><b>${escapeHtml(dayName(item.day))}</b>
      <div class="mono">${escapeHtml(item.day)} · ${escapeHtml(item.time)} UTC</div></td>
    <td data-label="المنصّة"><span class="chip">${escapeHtml(platformLabel(item.platform))}</span></td>
    <td data-label="المصدر"><div class="nm">${escapeHtml(name)}</div>
      <div class="sub">${escapeHtml(item.angle)}</div>
      ${item.why === '' ? '' : `<div class="sub">— ${escapeHtml(item.why)}</div>`}</td>
    <td data-label="">${gone
      ? chip('idle', '○', 'لا مصدر')
      : `<form class="inline" method="POST" action="/panel/drafts/write" data-busy="جارٍ الكتابة…">
           <input type="hidden" name="id" value="${escapeHtml(item.sourceId)}">
           <input type="hidden" name="platform" value="${escapeHtml(item.platform)}">
           <button class="g sm" type="submit">اكتب منه</button></form>`}</td>
  </tr>`
}

export function planSection(input: PlanInput): string {
  const { plan, now } = input

  const generate = `<form class="inline" method="POST" action="/panel/plan/generate"
      data-busy="جارٍ التخطيط…"${plan === null ? '' : ' data-confirm="سيحلّ محلّ خطّة هذا الأسبوع. أتمضي؟"'}>
      <button class="${plan === null ? 'p' : 'g'} sm" type="submit"${
        input.ready && input.analyzed >= 2 ? '' : ' disabled'
      }>${plan === null ? 'خطّط الأسبوع' : 'أعد التخطيط'}</button></form>`

  const why =
    !input.ready
      ? '<p class="hint" style="margin:var(--s-2) 0 0">مزوّدُ مهمّة الخطّة غير جاهز — اضبط مفتاحه في «المزوّدون».</p>'
      : input.analyzed < 2
        /*
         * **ودعوةٌ إلى فعلٍ زرٌّ لا كلمةٌ في جملة** (D-108).
         *
         * قِيست ‏٥٥×‏١٥px عند ‏٤٣٠ — **دون هدف اللمس بثلاثة أضعاف**.
         * ولم يرَها مدقّقٌ قطُّ لأنّها لا تظهر إلّا حين تكون المصادرُ بلا
         * تحليل، **وعيّنةُ الرسم كانت نظاما يعمل**. فأظهرتها عيّنةُ
         * اليوم الأوّل.
         */
        ? `<p class="hint" style="margin:var(--s-2) 0 0">${input.analyzed} مصدرا محلَّلا — والخطّةُ تحتاج اثنين على الأقلّ.</p>
           <a class="btn g sm" href="#sources" style="margin-top:var(--s-2)">حلّل مصادرك</a>`
        : ''

  if (plan === null) {
    return `<div class="card">
      <div class="card-head"><h2>الخطّة الأسبوعيّة</h2><div class="grow"></div>${generate}</div>
      <div class="empty"><b>لا خطّةَ بعد</b>
        <p>نداءٌ واحدٌ يقرأ خلاصاتِ ما حُلِّل، ويقول ما يستحقّ النشر هذا الأسبوع
           وعلى أيّ منصّة وبأيّ ترتيب. <b>ويقترح ولا يكتب</b> — والكتابةُ زرٌّ لكلّ بند.</p></div>
      ${why}
    </div>`
  }

  const status =
    plan.status === 'approved'
      ? chip('ok', '●', 'معتمَدة')
      : chip('idle', '○', 'تنتظر قراءتك')

  return `<div class="card">
    <div class="card-head"><h2>الخطّة الأسبوعيّة</h2>
      <div class="grow"></div>${status}${generate}</div>

    <div class="lede-row" style="margin:0 0 var(--s-3)">
      <span class="chip mono">أسبوعُ ${escapeHtml(plan.week)}</span>
      <span class="chip mono">${escapeHtml(plan.model)}</span>
      <span class="ago">وُضعت منذ ${escapeHtml(relativeTime(plan.createdAt, now))}</span>
    </div>

    ${plan.plan.rationale === ''
      ? ''
      : `<p class="draft-why" style="margin-bottom:var(--s-4)">${escapeHtml(plan.plan.rationale)}</p>`}

    <div class="scroll"><table>
      <thead><tr><th>متى</th><th>المنصّة</th><th>المصدر والزاوية</th><th></th></tr></thead>
      <tbody>${plan.plan.items.map((i) => row(i, input.names)).join('')}</tbody>
    </table></div>

    <div class="lede-row" style="margin-top:var(--s-3)">
      <span class="lede-note"><b>الخطّةُ تقترح ولا تنفّذ.</b> كلُّ «اكتب منه» نداءٌ مدفوعٌ بضغطتك،
        والمسوّدةُ بعده تنتظر اعتمادَك كأيّ مسوّدة.</span>
      <span class="grow"></span>
      ${plan.status === 'draft'
        ? `<form class="inline" method="POST" action="/panel/plan/approve" data-busy="جارٍ…">
             <input type="hidden" name="id" value="${escapeHtml(plan.id)}">
             <button class="p sm" type="submit">اعتمد المنطق</button></form>`
        : ''}
    </div>
  </div>`
}
