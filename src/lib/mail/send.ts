/**
 * إرسالُ رمز الدخول عبر Cloudflare Email Routing (D-245).
 *
 * والربطُ `EMAIL` مقيَّدٌ في `wrangler.toml` بعنوان المالك وحده، فلا يصل
 * البريدُ غيرَه ولو نُودي بعنوانٍ آخر. وفي الاختبار يُحقَن ربطٌ صوريّ، و
 * `cloudflare:email` يُستبدَل بمثيله في `vitest.config.ts`.
 */
import type { EmailMessage } from 'cloudflare:email'
import { buildTextMail } from './mime'

export const MAIL_FROM = 'noreply@basserh.com'

export interface MailBinding {
  send(message: EmailMessage): Promise<unknown>
}

export type MailResult = { readonly sent: true } | { readonly sent: false; readonly reason: string }

export async function sendText(
  binding: MailBinding | undefined,
  to: string,
  subject: string,
  text: string,
): Promise<MailResult> {
  if (binding === undefined) return { sent: false, reason: 'لا ربط EMAIL على هذه البيئة' }
  const raw = buildTextMail({ from: MAIL_FROM, to, subject, text })
  try {
    // ‏استيرادٌ عند الإرسال لا في رأس الوحدة: نصوصُ الرسم (`scripts/`) تحمّل اللوحةَ في Node
    // ‏ولا وحدةَ `cloudflare:email` هناك. وفي Worker تُحلّ كما تُحلّ في الاستيراد الثابت
    const { EmailMessage: Message } = await import('cloudflare:email')
    await binding.send(new Message(MAIL_FROM, to, raw))
    return { sent: true }
  } catch (error) {
    // ‏والسببُ وحدَه يُسجَّل: الرسالةُ تحمل الرمز، فلا تُطبَع
    return { sent: false, reason: error instanceof Error ? error.message.slice(0, 200) : 'تعذّر الإرسال' }
  }
}
