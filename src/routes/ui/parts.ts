/**
 * عناصرُ مشتركة بين الأقسام.
 *
 * وُضعت هنا لا في `panelView` لأنّ قسم المزوّدين يستعملها أيضا —
 * واستيرادُها منه يصنع دائرةً بين ملفّين. والدائرةُ تعمل في الأنواع
 * وتنكسر في التشغيل حين يتبدّل ترتيبُ الحزم.
 */
import { escapeHtml } from './shell'
import type { Onboarding } from '../../lib/onboard'

export function pct(used: number, cap: number): number {
  if (cap <= 0) return 100
  return Math.min(100, Math.round((used / cap) * 100))
}

/**
 * مقياسُ مقدار: هيئةٌ واحدة تتدرّج بالطول لا بالهيئة.
 * والبلوغ حالةٌ لا مقدار — فيقفز إلى الأحمر **ومعه نصّ**، لأنّ الحالة
 * لا تقع على اللون وحده.
 */
export function bar(used: number, cap: number, label = 'بلغ السقف'): string {
  const p = pct(used, cap)
  const full = p >= 100
  return `<div class="bar"><i class="${full ? 'f' : ''}" style="width:${p}%"></i></div>` +
    (full
      ? `<div class="cap${label === 'بلغ السقف' ? '' : ' done'}"><span aria-hidden="true">■</span>${escapeHtml(label)}</div>`
      : '')
}


/**
 * لوحُ اليوم الأوّل (D-108) — **ويختفي من تلقاء نفسه**.
 *
 * ولا يُعرَض إلّا حين ينقص شيء. **ومعالجٌ يبقى بعد أن يُستغنى عنه
 * يُقرأ عطلا**: من أتمّ الخمسَ ثمّ رآه كلَّ صباحٍ ظنّ أنّ شيئا لم يُحفَظ.
 *
 * **وواحدةٌ تُطلَب لا خمس**: أوّلُ ما لم يتمّ يحمل الزرَّ، والباقياتُ
 * تُعرَض حالا لا دعوة. **وخمسةُ أزرارٍ في شاشةٍ أوّلَ مرّةٍ تُقرأ عبئا.**
 */
export function firstDay(o: Onboarding): string {
  if (o.hidden) return ''
  const rows = o.steps
    .map((s) => {
      /*
       * **ولا علامةَ صحٍّ على ما لم يُتحقَّق منه** (D-061): الدائرةُ
       * الفارغةُ ليست «فشلا» — هي «لم يقع»، وفرقُهما في اللون والنصّ.
       */
      const mark = s.done
        ? '<span class="fd-m done" aria-label="تمّت">✓</span>'
        : '<span class="fd-m" aria-hidden="true"></span>'
      const call = s === o.next
        ? `<a class="btn p sm" href="${escapeHtml(s.go)}">ابدأ</a>`
        : ''
      return `<li class="fd-s${s.done ? ' done' : ''}${s === o.next ? ' now' : ''}">
        ${mark}
        <div class="fd-b"><b>${escapeHtml(s.title)}</b>
          <p>${escapeHtml(s.done ? s.proof : s.why)}</p>
          ${s.done || s === o.next ? '' : `<span class="ago">${escapeHtml(s.proof)}</span>`}
        </div>${call}
      </li>`
    })
    .join('')

  return `<div class="card fd">
    <div class="fd-h">
      <div><div class="eyebrow"><span class="ln"></span>اليومُ الأوّل</div>
        <h2>${o.done} من ${o.steps.length}</h2></div>
      <span class="grow"></span>
      ${bar(o.done, o.steps.length, 'تمّت')}
    </div>
    <p class="hint"><b>وحالُ كلِّ خطوةٍ مشتقٌّ من القاعدة</b> — لا علمَ
      يُخزَّن ولا صحٌّ على ما لم يُتحقَّق منه. <b>ويختفي هذا اللوحُ وحدَه
      حين تتمّ الخمس.</b></p>
    <ol class="fd-l">${rows}</ol>
  </div>`
}
