/**
 * **أحداثُ الأمان خارجَ القاعدة** (D-317) — ما يقع على الحساب يصل صاحبَه، لا سجلَّ التدقيق وحده.
 *
 * ## ما كان
 *
 * دخولٌ جديد، أو عاملٌ ثانٍ أُضيف أو أُزيل، أو رمزُ استردادٍ استُعمل، أو «أخرِج الأجهزة الأخرى» — كلُّها صفٌّ في
 * `audit_log` **في القاعدة نفسِها التي يقرؤها من سرق الجلسة**. فمن دخل بجلسةٍ مسروقةٍ وأضاف مفتاحَه لم يعلم بذلك
 * أحدٌ حتّى يفتح المالكُ سجلَّ الأمان ويقرأه بعينه.
 *
 * ## ما صار — أربعُ طرقٍ لكلّ حدث، وكلُّها «بأحسن جهد»
 *
 * ١ · **بريدٌ قصيرٌ إلى صاحب الحساب** عبر ربط `EMAIL` نفسِه: ما وقع ومتى ومن أيّ جهاز، وما يفعل إن لم يكن هو.
 * ٢ · **إشعارٌ في اللوحة** يُشتقّ من صفّ `security.notice` في التدقيق (`notices.ts`) — لصاحبه وحده.
 * ٣ · **صفٌّ في قناة التنبيهات** (`alert_outbox`، النوعُ `security`) تُرسله دورةُ التنبيهات إلى webhook المالك.
 * ٤ · **صفٌّ في سجلّ التدقيق** يحمل بريدَ صاحبه صراحةً (لا يُستنتَج من الطلب: الدخولُ يقع قبل أن يُعرَف الفاعل).
 *
 * **ولا تُسقط الفعل**: عطلٌ في البريد أو القاعدة يُسجَّل في `console` ويمضي — الإشعارُ زيادةُ أمانٍ لا شرطُ عمل.
 * **ولا سرَّ في أيّ منها** (CLAUDE.md): لا رمزَ ولا مفتاحَ ولا معرّفَ جلسة — بصمتُها وحدها في التدقيق.
 */
import type { Env } from '../../env'
import { record } from '../audit'
import { sendText } from '../mail/send'
import { OWNER_ORG } from '../tenancy'
import { fingerprint } from './digest'
import { isOwnerEmail } from '../ownerEmail'
import { trustedDevice } from './device'

export type SecurityEventKind = 'session.new' | 'factor.add' | 'factor.remove' | 'recovery.used' | 'sessions.revoke_all'

/** ما يُقال في كلّ حدث — جملةٌ واحدةٌ تامّة، ومنها عنوانُ البريد. */
export const SECURITY_EVENT_TEXT: Readonly<Record<SecurityEventKind, string>> = {
  'session.new': 'دخولٌ جديد إلى حسابك',
  'factor.add': 'أُضيف عاملٌ ثانٍ إلى حسابك',
  'factor.remove': 'أُزيل عاملٌ ثانٍ من حسابك',
  'recovery.used': 'استُعمل رمزُ استرداد للدخول إلى حسابك',
  'sessions.revoke_all': 'أُخرجت كلُّ الأجهزة الأخرى من حسابك',
}

/** متصفّحٌ يُختصر إلى ما يُميّزه — الترويسةُ كاملةً سطرٌ لا يُقرأ في بريد. واسمُ مفتاحٍ لم يُسمَّ. */
export function deviceName(ua: string | null): string {
  if (ua === null || ua === '') return 'جهاز غير معروف'
  const os = /iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : ''
  const browser = /Edg\//i.test(ua) ? 'Edge' : /Firefox\//i.test(ua) ? 'Firefox' : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : ''
  const parts = [browser, os].filter((x) => x !== '')
  return parts.length === 0 ? 'جهاز غير معروف' : parts.join(' · ')
}

export interface SecurityEvent {
  readonly kind: SecurityEventKind
  /** صاحبُ الحساب — إليه البريد، وله الإشعار. */
  readonly email: string
  /** تفصيلٌ قصيرٌ بلا سرّ: اسمُ المفتاح، أو «رمز التطبيق»، أو كم بقي من الرموز. */
  readonly detail?: string
  /** معرّفُ الجلسة التي وقع فيها الحدث — **تُكتب بصمتُه لا هو**، فلا يُرى إشعارُ جلسةٍ في الجلسة نفسِها. */
  readonly sessionId?: string
}

/** يرسل الحدث إلى طرقه الأربع. لا يرمي أبدًا. */
export async function securityEvent(env: Env, request: Request | undefined, e: SecurityEvent, now = new Date()): Promise<void> {
  const what = SECURITY_EVENT_TEXT[e.kind]
  const ip = request?.headers.get('CF-Connecting-IP') ?? null
  const from = `${deviceName(request?.headers.get('User-Agent') ?? null)}${ip === null ? '' : ` · ${ip}`}`
  const when = `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  const detail = e.detail === undefined || e.detail === '' ? '' : ` (${e.detail.slice(0, 60)})`
  const handle = e.sessionId === undefined ? null : await fingerprint(e.sessionId).catch(() => null)

  // ‏٤ · التدقيق — وبريدُ صاحبه صراحةً: الدخولُ يقع قبل أن يُعرَف الفاعلُ من الطلب
  await record(env.DB, { actor: 'panel', action: 'security.notice', target: handle, detail: `${e.kind}${detail}`, by: e.email }, request)

  // ‏٣ · قناةُ التنبيهات — يرسلها `alertTick` كما يرسل الثلاثة
  try {
    await env.DB
      .prepare(`INSERT INTO alert_outbox (ref, kind, body, org_id) VALUES (?, 'security', ?, ?) ON CONFLICT(ref) DO NOTHING`)
      .bind(`security:${crypto.randomUUID()}`, `صدى — ${what}${detail}: ${e.email} · ${from} · ${when}.`, OWNER_ORG)
      .run()
  } catch (error) {
    console.warn({ job: 'security.event', step: 'outbox', failed: String(error) })
  }

  // ‏١ · البريد — إلى صاحب الحساب وحده. **ودخولٌ من جهازٍ دخل منه صاحبُه من قبل لا يُبرَد له** (D-385، طلبُ المالك):
  // ‏الكعكةُ الموقَّعة لبريده (`trustedDevice`) تقول إنّه جهازُه، فالبريدُ ضجيجٌ يعلّمه تجاهلَ ما يهمّ. ويبقى التدقيقُ
  // ‏والقناةُ وإشعارُ اللوحة؛ والجهازُ الجديد يُبرَد له كما كان
  if (e.kind === 'session.new' && request !== undefined && (await trustedDevice(request, env.ADMIN_TOKEN, e.email).catch(() => null)) !== null) return
  // ‏١ · البريد — إلى صاحب الحساب وحده، ولا يحمل رمزًا ولا رابطًا يفتح شيئًا بلا دخول
  const body = [
    `${what}${detail}.`,
    '',
    `متى: ${when}`,
    `من: ${from}`,
    '',
    'إن كنت أنت فلا شيءَ عليك.',
    ...(isOwnerEmail(e.email)
      ? ['وإن لم تكن أنت: ادخل إلى صدى، ثمّ الإعدادات ← الدخول والأجهزة ← «أخرِج الأجهزة الأخرى»،',
         'وأزل كلَّ مفتاحِ مرورٍ لا تعرفه.', '', `${env.PUBLIC_BASE_URL}/panel/settings#security`]
      : ['وإن لم تكن أنت: ادخل إلى صدى وافتح «أمان حسابك» وأزل كلَّ مفتاحٍ لا تعرفه، وأخبر مالكَ صدى ليُلغي دخولك مؤقّتًا.',
         '', `${env.PUBLIC_BASE_URL}/panel/enrol`]),
  ].join('\n')
  const sent = await sendText(env.EMAIL, e.email, `صدى — ${what}`, body).catch(() => ({ sent: false as const, reason: 'throw' }))
  if (!sent.sent) console.warn({ job: 'security.event', step: 'mail', kind: e.kind, failed: sent.reason })
}
