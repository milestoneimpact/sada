/**
 * نصُّ بريد الدعوة (D-442) — **من دعا، وإلى أيّ مساحة، وما الدور، وكم يبقى الرمز.**
 *
 * كانت الرسالةُ «دُعيت إلى صدى بدور كذا» بلا داعٍ ولا مساحة، والرابطُ وسط جملة
 * فيلتصق بها في بعض البرامج. والآن الرابطُ في سطرٍ وحده، والدورُ مشروحٌ بما
 * يستطيعه، وصلاحيةُ الرمز من `CODE_TTL_SECONDS` لا رقمٌ مكتوبٌ باليد.
 */
import { CODE_TTL_SECONDS } from '../security/loginCode'
import { ROLE_LABEL, type MemberRole } from '../team'

export interface InviteMail {
  readonly by: string
  readonly role: MemberRole
  /** أسماءُ المساحات، أو «*» لكلّها */
  readonly spaces: '*' | readonly string[]
  readonly base: string
}

export function inviteMail(i: InviteMail): { subject: string; text: string } {
  const role = ROLE_LABEL[i.role]
  const where = i.spaces === '*' ? 'كلّ المساحات' : i.spaces.length === 0 ? 'صدى' : i.spaces.map((s) => `«${s}»`).join('، ')
  const minutes = Math.round(CODE_TTL_SECONDS / 60)
  return {
    subject: `${i.by} يدعوك إلى ${i.spaces === '*' || i.spaces.length !== 1 ? 'صدى' : i.spaces[0]}`,
    text:
      `دعاك ${i.by} إلى ${where} في صدى بدور «${role.name}»: ${role.can}.\n\n` +
      'ادخل من هذا الرابط:\n' +
      `${i.base}/panel\n\n` +
      `واكتب بريدك هذا، فيصلك رمزٌ من ستّة أرقام صالحٌ ${minutes} دقائق.\n` +
      'والدعوةُ قائمةٌ حتّى يلغيها من دعاك؛ وإن انتهى الرمز فاطلب غيره من الصفحة نفسها.\n' +
      'لا كلمةَ مرورٍ تُحفظ، ولا يدخل أحدٌ بلا الرمز.',
  }
}
