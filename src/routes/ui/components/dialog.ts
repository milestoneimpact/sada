/**
 * الحوارُ والورقة السفليّة — **`<dialog>` أصليٌّ لا طبقةٌ مصنوعة** (خطّة التصميم 7.9 · D-189).
 *
 * `showModal()` يحبس التركيزَ ويجعل ما خلفه خاملًا (`inert`)، وEsc يغلقه، **والمتصفّحُ يفعل
 * ذلك كلَّه بلا سطرٍ منّا** — وطبقةٌ مصنوعةٌ تُعيد كتابتَه وتنسى بعضَه. والتركيزُ يعود إلى
 * الزرّ الذي فتحه (`KIT_SCRIPT`): وفاتحُه أيُّ زرٍّ بـ`data-dialog-open="<id>"` و`aria-haspopup="dialog"`
 * و`aria-controls="<id>"` — والزرُّ نفسُه من `button()` بسِماته، لا دالّةٌ ثانية.
 *
 * **والحوارُ لما لا رجعةَ فيه وحدَه** («انشر الآن»، «احذف المصدر»): الاعتمادُ والرفضُ
 * والجدولةُ لها «تراجَع» (5.9). وفيه فعلٌ أوّليٌّ واحدٌ و«إلغاء» ثانويّ.
 *
 *   dlg        عرضٌ أقصى ‏480px، ونصفُ قطر ‏١٢، و«--sh-3»، وحدٌّ «--line» على «--dialog» فوق «--scrim»
 *   dlg sheet  على الجوّال ورقةٌ بعرض الشاشة من أسفلها، بمقبض، ونصفُ قطر ‏١٦ في زاويتيها العلويّتين
 */
import { escapeHtml } from '../escape'

export interface DialogInput {
  readonly id: string
  readonly title: string
  /** جسدُ الحوار (وسمٌ جاهز). */
  readonly body: string
  /** صفُّ الأفعال (وسمٌ جاهز): فعلٌ أوّليٌّ واحدٌ ثمّ «إلغاء» — والإلغاءُ يُضاف هنا. */
  readonly actions?: string
  /** ورقةٌ سفليّةٌ على الجوّال (وحوارٌ على الحاسوب). */
  readonly sheet?: boolean
  /** نصُّ زرّ الإغلاق — «إلغاء» في الحوار و«أغلق» في الورقة. */
  readonly cancel?: string
}

export function dialog(input: DialogInput): string {
  const titleId = `${input.id}-t`
  const cancel = input.cancel ?? (input.sheet === true ? 'أغلق' : 'إلغاء')
  return `<dialog class="dlg${input.sheet === true ? ' sheet' : ''}" id="${escapeHtml(input.id)}" aria-labelledby="${titleId}">
  ${input.sheet === true ? '<span class="dlg-grip" aria-hidden="true"></span>' : ''}
  <h3 class="dlg-t" id="${titleId}">${escapeHtml(input.title)}</h3>
  <div class="dlg-body">${input.body}</div>
  <form class="dlg-foot" method="dialog">${input.actions ?? ''}<button class="btn btn-secondary" value="cancel">${escapeHtml(cancel)}</button></form>
</dialog>`
}
