/**
 * عنوانُ قناة التنبيهات — **سرٌّ حاملٌ لا عنوانٌ عامّ** (D-318).
 *
 * ## ما كان
 *
 * كتب D-109 أنّ العنوانَ «ليس سرًّا: عنوانٌ يقبل رسالة، لا مفتاحٌ يفتح حسابًا». لكنّ عنوانَ Slack وDiscord وTelegram
 * **يحمل رمزَه في مساره**: من قرأه كتب في قناة المالك باسم صدى، وأرسل إليها ما شاء. وكان يُخزَّن مقروءًا في `settings`،
 * ويُرسَم كاملًا في حقلٍ يراه المديرُ في «الإنفاق والحدود»، ويُكتب كاملًا في سجلّ النشاط وفي الإشعار بعد الحفظ.
 *
 * ## ما صار
 *
 * - **يُخزَّن مشفَّرًا** بـ AES-GCM كالأذونات (D-005)، بمفتاحٍ مشتقٍّ لنطاقه وموسومٍ بمعرّفه (`sealScoped`)، وفي الصفّ
 *   نفسِه قناعُه — فالقناعُ يُقرأ بلا مفتاح، والعنوانُ لا يُقرأ إلّا به.
 * - **ويُعرَض مقنَّعًا**: البروتوكولُ والمضيفُ وآخرُ أربعة محارف — يكفي المالكَ ليعرف أيَّ قناةٍ ضبط، ولا يكفي أحدًا
 *   ليكتب فيها. **وللمالك وحدَه** يُرسَم الحقلُ والقناع.
 * - **والقديمُ المقروءُ يُقرأ مرّةً**: أوّلُ قراءةٍ بالمفتاح (دورةُ التنبيهات) تشفّره في مكانه، والحفظُ التالي يشفّر كذلك.
 */
import { CryptoError, openScoped, sealedWithCurrent, sealScoped, type LegacyKey } from '../crypto'
import { checkProviderUrl } from '../ai/urlGuard'
import type { Db } from '../tokens'
import { OWNER_ORG } from '../tenancy'

const KEY = 'alert_webhook'
const PREFIX = 'sealed:'
/** نطاقُ مفتاحه المشتقّ (D-318). */
export const WEBHOOK_SCOPE = `settings:${OWNER_ORG}`
const CONTEXT = `settings:${KEY}:${OWNER_ORG}`

/** لا صيغةَ قديمةً مشفَّرة: القديمُ مقروءٌ ويُعالَج قبل الفكّ. */
const NO_LEGACY: LegacyKey = () => Promise.reject(new CryptoError('لا صيغةَ قديمةً مشفَّرة لقناة التنبيهات'))

interface SealedHook {
  readonly v: 1
  readonly hint: string
  readonly iv: string
  readonly ct: string
}

/** القناعُ: `https://hooks.slack.com/…abcd` — والنصُّ الذي ليس عنوانًا آخرُ أربعة محارف وحدَها. */
export function maskWebhook(url: string): string {
  const value = url.trim()
  if (value === '') return ''
  const tail = value.slice(-4)
  try {
    const parsed = new URL(value)
    return `${parsed.protocol}//${parsed.host}/…${tail}`
  } catch {
    return `…${tail}`
  }
}

function parseSealed(stored: string): SealedHook | null {
  if (!stored.startsWith(PREFIX)) return null
  try {
    const value = JSON.parse(stored.slice(PREFIX.length)) as Partial<SealedHook>
    if (value.v !== 1 || typeof value.hint !== 'string' || typeof value.iv !== 'string' || typeof value.ct !== 'string') return null
    return value as SealedHook
  } catch {
    return null
  }
}

/** قناعُ ما في الصفّ — بلا مفتاح: المشفَّرُ يحمل قناعَه، والقديمُ المقروءُ يُقنَّع هنا. وفارغٌ لا قناة. */
export function webhookHint(stored: string): string {
  if (stored === '') return ''
  if (stored.startsWith(PREFIX)) return parseSealed(stored)?.hint ?? ''
  return maskWebhook(stored)
}

async function seal(encKey: string, url: string): Promise<string> {
  const sealed = await sealScoped(encKey, WEBHOOK_SCOPE, url, CONTEXT)
  const body: SealedHook = { v: 1, hint: maskWebhook(url), iv: sealed.iv, ct: sealed.ciphertext }
  return PREFIX + JSON.stringify(body)
}

async function storedValue(db: Db): Promise<string> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ? AND org_id = ?')
    .bind(KEY, OWNER_ORG)
    .first<{ value: string }>()
  return row?.value ?? ''
}

async function write(db: Db, value: string, by: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_by, updated_at, org_id)
       VALUES (?, ?, ?, datetime('now'), ?)
       ON CONFLICT(org_id, key) DO UPDATE SET
         value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(KEY, value, by, OWNER_ORG)
    .run()
}

/**
 * العنوانُ كاملًا لدورة التنبيهات وحدَها — أو فراغٌ إن لم يُضبَط أو لم يُفكّ (مفتاحٌ بُدّل): **قناةٌ لا تعمل خيرٌ من نداءٍ
 * إلى مجهول**. والقديمُ المقروءُ يُشفَّر هنا في مكانه، بشرط أن يكون ما يزال هو هو (لا يدهس حفظًا وقع بينهما).
 */
export async function readWebhookUrl(db: Db, encKey: string): Promise<string> {
  const stored = await storedValue(db)
  if (stored === '') return ''
  const sealed = parseSealed(stored)
  if (sealed !== null) {
    try {
      return await openScoped(encKey, WEBHOOK_SCOPE, { ciphertext: sealed.ct, iv: sealed.iv }, CONTEXT, NO_LEGACY)
    } catch {
      return ''
    }
  }
  if (stored.startsWith(PREFIX)) return ''
  /*
   * ‏**يُشفَّر قبل أن يُحكَم عليه**: عنوانٌ حُفظ قبل أن يُشدَّد الحارس (‏100.64/10 مثلًا) لا يُنادى، لكنّ سرَّه لا يبقى مقروءًا في
   * ‏القاعدة لأجل ذلك. والإرسالُ يعيد الحكمَ نفسَه (`sendAlerts` · `checkProviderUrl`)، فالمشفَّرُ المردودُ لا يصير نداءً.
   */
  try {
    await db
      .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ? AND org_id = ? AND value = ?")
      .bind(await seal(encKey, stored), KEY, OWNER_ORG, stored)
      .run()
  } catch (error) {
    console.warn({ job: 'alert-webhook', failed: 'reseal', error: String(error).replace(/https?:\/\/\S+/gi, '«عنوان مُزال»') })
  }
  return checkProviderUrl(stored).ok ? stored : ''
}

export type SaveOutcome =
  | { readonly kind: 'set'; readonly hint: string }
  | { readonly kind: 'cleared' }
  /** عنوانٌ مردود (داخليٌّ أو بلا https): **لا يُمسّ ما كان** — والسببُ يُقال للمالك. */
  | { readonly kind: 'refused'; readonly reason: string }

/**
 * يحفظ العنوانَ مشفَّرًا — **ويُحرَس عند الحفظ لا عند الإرسال وحدَه** (D-109) بحارس المزوّدين نفسِه. والفراغُ يُزيل القناة.
 */
export async function saveWebhook(db: Db, encKey: string, raw: string, by: string): Promise<SaveOutcome> {
  const trimmed = raw.trim()
  if (trimmed === '') {
    await write(db, '', by)
    return { kind: 'cleared' }
  }
  const verdict = checkProviderUrl(trimmed)
  if (!verdict.ok) return { kind: 'refused', reason: verdict.reason }
  await write(db, await seal(encKey, verdict.url), by)
  return { kind: 'set', hint: maskWebhook(verdict.url) }
}

/**
 * **دورةُ التدوير** (D-318): أعلى العنوانُ على المفتاح الحاليّ؟ وإن لم يكن (مشفَّرٌ بالسابق، أو قديمٌ مقروء) يُعاد تشفيرُه
 * بالحاليّ في مكانه — بشرط أن يكون الصفُّ ما يزال هو هو. ويعيد ما بقي: صفرٌ أو واحد، و`failed` لما لم يُفكّ.
 */
export async function rotateWebhook(db: Db, encKey: string, apply: boolean): Promise<{ pending: number; rotated: number; failed: number }> {
  const stored = await storedValue(db)
  if (stored === '') return { pending: 0, rotated: 0, failed: 0 }
  const sealed = parseSealed(stored)
  if (sealed !== null && (await sealedWithCurrent(encKey, sealed.ct))) return { pending: 0, rotated: 0, failed: 0 }
  if (!apply) return { pending: 1, rotated: 0, failed: 0 }
  const url = await readWebhookUrl(db, encKey)
  // ‏القديمُ المقروءُ شُفِّر في `readWebhookUrl` نفسِها (ولو ردّه الحارس)؛ والمشفَّرُ بالسابق يُعاد هنا
  const now = await storedValue(db)
  const after = parseSealed(now)
  if (after !== null && (await sealedWithCurrent(encKey, after.ct))) return { pending: 0, rotated: 1, failed: 0 }
  if (url === '') return { pending: 1, rotated: 0, failed: 1 }
  await db
    .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ? AND org_id = ? AND value = ?")
    .bind(await seal(encKey, url), KEY, OWNER_ORG, now)
    .run()
  return { pending: 0, rotated: 1, failed: 0 }
}
