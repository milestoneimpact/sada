/**
 * **«صحّح المنشور»** (D-391) — تصحيحُ منشورٍ نُشر، بما تسمح به كلُّ منصّة لا بما نتمنّاه.
 *
 * - **LinkedIn** يعدّل النصَّ في مكانه (`POST /rest/posts/{urn}` مع `X-RestLi-Method: PARTIAL_UPDATE` و`patch.$set.commentary`،
 *   ‏204 عند النجاح): تبقى التفاعلات، **والنصُّ السابقُ يُحفظ في `post_corrections.old_text`** — إصدارٌ لا حذف.
 * - **X** لا يعدّل تغريدةً من الواجهة (التعديلُ في تطبيقه لـPremium وحده)، فخياران:
 *   ١ · **ردٌّ تصحيحيّ** (الافتراضيّ): تغريدةٌ في `reply.in_reply_to_tweet_id` بالأصل، تُسجَّل منشورًا مرتبطًا (`corrects_post_id`).
 *   ٢ · **احذف وأعد النشر**: `DELETE /2/tweets/:id` ثمّ تغريدةٌ جديدة بمفتاحٍ جديد. وإن نجح الحذفُ وفشل النشر بقي التصحيحُ
 *       `deleted`، و«أعد المحاولة» (`retryReplacement`) ينشر البديلَ وحده **بلا حذفٍ ثانٍ**.
 *
 * ## ما لا يُتجاوز
 *
 * - **لا طلبَ بلا مفتاح** (D-004): مفتاحُ التصحيح يأتي من النموذج (يُولَّد حين يُرسَم)، **ويُحجز بصفٍّ فريدٍ قبل أيّ نداء**، فضغطتان
 *   بالنموذج نفسِه لا ترسلان طلبين. والمنشورُ الجديدُ (ردٌّ أو بديل) يُنشر بمفتاحه في `publish_attempts` كأيّ منشور.
 * - **الدفترُ قبل الطلب** (D-008): التعديلُ والحذفُ والنشرُ كلٌّ في `cost_ledger` قبل أن يُرسَل. وما لم يُؤكَّد سعرُه بصفرٍ موسوم.
 * - **لا رمزَ في سجلّ**: الأخطاءُ تحمل رمزَ المنصّة ورسالتَها المختصرة، لا الترويسات.
 * - **كلُّ استعلامٍ مقيّدٌ بـ`org_id`**.
 */
import { estimatePostCost, recordCost } from '../cost'
import { containsUrl } from '../idempotency'
import { loadTokens, markNeedsReauth, type Db } from '../tokens'
import { canPublish } from '../oauth/scopes'
import { isExpiring } from '../oauth/exchange'
import { LINKEDIN, X } from '../oauth/providers'
import { isLinkedInPage } from '../channels'
import { littleText } from './littleText'
import { publishX, PublishError } from './platforms'
import { isTimeout, withTimeout } from '../net/timeout'

export type CorrectionKind = 'edit' | 'reply' | 'replace'

/** سقفُ النصّ لكلّ منصّة — وما زاد يُردّ قبل أيّ نداء. */
export const TEXT_MAX: Readonly<Record<'linkedin' | 'x', number>> = { linkedin: 3000, x: 280 }

/** حدُّ المعدّل: تصحيحاتٌ في الساعة لكلّ منظّمة. */
export const CORRECT_PER_HOUR = 10

export type CorrectResult =
  | { readonly ok: true; readonly kind: CorrectionKind; readonly correctionId: string; readonly newPostId: string | null; readonly duplicate?: boolean }
  | { readonly ok: false; readonly reason: string; readonly correctionId?: string; readonly retry?: boolean }

export interface CorrectDeps {
  readonly db: Db
  readonly encKey: string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

export interface Original {
  readonly id: string
  readonly org_id: string
  readonly account_id: string
  readonly platform: string
  readonly type: string
  readonly text: string
  readonly status: string
  readonly platform_deleted_at: string | null
  readonly external_id: string
  readonly account_kind: string
  readonly account_status: string
  readonly platform_post_id: string | null
}

/** الرسائلُ بالعربيّة لكلّ فشل — موضعٌ واحد تقرؤه الشاشةُ والاختبار. */
export const SAY = {
  notFound: 'لا منشور بهذا المعرّف.',
  notPublished: 'التصحيحُ للمنشور الذي نُشر وحده.',
  platform: 'التصحيحُ لـ LinkedIn وX وحدهما الآن.',
  thread: 'السلسلةُ لا تُصحَّح من هنا بعد: ردّ على تغريدتها بنفسك على X.',
  page: 'منشورُ صفحة LinkedIn لا يُعدَّل من صدى بعد (M-03).',
  noRemoteId: 'لا معرّفَ لهذا المنشور على المنصّة في سجلّ النشر، فلا يُعرف ما يُصحَّح.',
  deletedHere: 'حذفه صدى من X من قبل — لا يُصحَّح ثانيةً. البديلُ في بطاقته.',
  empty: 'اكتب النصّ المصحَّح.',
  same: 'النصُّ هو نفسُه — لم يتغيّر شيء.',
  tooLong: (max: number) => `النصّ أطول من ${String(max)} حرفًا.`,
  key: 'النموذجُ بلا مفتاح — أعد فتح صفحة التصحيح.',
  confirm: 'الحذفُ وإعادةُ النشر يحتاجان تأكيدك في الخطوة الثانية.',
  disconnected: 'الحساب مفصول — اربطه من «الحسابات» ثمّ صحّح.',
  token: 'انتهى إذنُ الحساب — أعد ربطه من «الحسابات» ثمّ صحّح. لم يُرسَل شيء.',
  tokenSoon: 'إذنُ الحساب يتجدّد الآن — أعد المحاولة بعد دقائق. لم يُرسَل شيء.',
  scope: 'إذنُ الحساب لا يشمل النشر — أعد ربطه من «الحسابات». لم يُرسَل شيء.',
  held: 'هذا التصحيحُ أُرسل من قبل بالنموذج نفسِه — لم يُرسَل ثانيةً.',
  ledger: 'لم يُكتب الدفتر فلم يُرسَل شيء — أعد المحاولة.',
} as const

/** رسالةُ فشل المنصّة بحالها. */
export function platformSay(platform: 'linkedin' | 'x', status: number, detail: string): string {
  const name = platform === 'linkedin' ? 'LinkedIn' : 'X'
  if (status === 401) return `ردّت ${name} 401: انتهى إذنُ الحساب — أعد ربطه من «الحسابات».`
  if (status === 404 || /deleted|not.?found|does not exist/i.test(detail)) return `المنشورُ محذوفٌ على ${name} (حُذف خارج صدى) — لا شيء يُصحَّح هناك.`
  if (status === 403) return `ردّت ${name} 403: لا إذنَ بهذا الفعل على هذا المنشور (${detail}).`
  if (status === 429) return `ردّت ${name} 429: طلباتٌ كثيرة — أعد المحاولة بعد قليل.`
  if (status >= 500 || status === 0) return `لم يُؤكَّد جوابُ ${name} (${detail}) — تحقّق على المنصّة قبل أن تعيد.`
  return `ردّت ${name} ${String(status)}: ${detail}`
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; detail?: unknown; title?: unknown; errors?: Array<{ message?: unknown }> }
    const first = Array.isArray(body.errors) ? body.errors[0]?.message : undefined
    const text = [body.detail, body.title, body.message, first].find((x): x is string => typeof x === 'string' && x !== '')
    return (text ?? 'unknown').slice(0, 160)
  } catch {
    return 'unparsable'
  }
}

/** الأصلُ بحسابه ومعرّفه على المنصّة — من محاولته الناجحة. */
export async function readOriginal(db: Db, org: string, postId: string): Promise<Original | null> {
  return db
    .prepare(
      `SELECT p.id, p.org_id, p.account_id, p.platform, p.type, p.text, p.status, p.platform_deleted_at,
              a.external_id, a.kind AS account_kind, a.status AS account_status,
              (SELECT t.platform_post_id FROM publish_attempts t
                WHERE t.post_id = p.id AND t.org_id = p.org_id AND t.status = 'succeeded' AND t.platform_post_id IS NOT NULL
                ORDER BY t.at DESC LIMIT 1) AS platform_post_id
         FROM posts p JOIN accounts a ON a.id = p.account_id
        WHERE p.id = ? AND p.org_id = ?`,
    )
    .bind(postId, org)
    .first<Original>()
}

/** أيُصحَّح هذا الأصلُ أصلًا؟ — حكمٌ قبل النصّ والرمز، تقرؤه الشاشةُ لتخفي الزرّ. */
export function correctable(o: Original | null): { ok: true } | { ok: false; reason: string } {
  if (o === null) return { ok: false, reason: SAY.notFound }
  if (o.status !== 'published') return { ok: false, reason: SAY.notPublished }
  if (o.platform !== 'linkedin' && o.platform !== 'x') return { ok: false, reason: SAY.platform }
  if (o.platform === 'x' && o.type === 'thread') return { ok: false, reason: SAY.thread }
  if (isLinkedInPage({ platform: o.platform, kind: o.account_kind })) return { ok: false, reason: SAY.page }
  if (o.platform_deleted_at !== null) return { ok: false, reason: SAY.deletedHere }
  if (o.platform_post_id === null || o.platform_post_id === '') return { ok: false, reason: SAY.noRemoteId }
  return { ok: true }
}

export interface CorrectInput {
  readonly postId: string
  readonly kind: CorrectionKind
  readonly text: string
  /** مفتاحُ النموذج (D-004) — يُولَّد حين تُرسَم صفحةُ التصحيح. */
  readonly key: string
  /** «احذف وأعد النشر» يلزمه التأكيدُ الثاني. */
  readonly confirmed?: boolean
  readonly by: string | null
}

const KEY_RE = /^[0-9a-f-]{16,64}$/

/** النصُّ والمفتاحُ والتأكيد — قبل أيّ قراءةٍ للرمز. */
function validate(o: Original, input: CorrectInput): string | null {
  if (!KEY_RE.test(input.key)) return SAY.key
  const text = input.text.trim()
  if (text === '') return SAY.empty
  const max = TEXT_MAX[o.platform as 'linkedin' | 'x']
  if ([...text].length > max) return SAY.tooLong(max)
  if (input.kind !== 'reply' && text === o.text.trim()) return SAY.same
  if (o.platform === 'linkedin' && input.kind !== 'edit') return 'LinkedIn يُعدَّل في مكانه.'
  if (o.platform === 'x' && input.kind === 'edit') return 'X لا يعدّل تغريدةً من الواجهة: ردّ عليها أو احذفها وأعد نشرها.'
  if (input.kind === 'replace' && input.confirmed !== true) return SAY.confirm
  return null
}

/** الرمزُ صالحًا وبنطاق النشر، أو السببُ. */
async function tokenFor(deps: CorrectDeps, o: Original): Promise<{ token: string } | { reason: string }> {
  if (o.account_status === 'revoked') return { reason: SAY.disconnected }
  const tokens = await loadTokens(deps.db, deps.encKey, o.account_id, o.org_id)
  if (tokens === null) {
    await markNeedsReauth(deps.db, o.account_id, o.org_id)
    return { reason: SAY.token }
  }
  if (isExpiring(tokens.expiresAt, (deps.now ?? (() => new Date()))())) {
    if (tokens.refreshToken !== null) return { reason: SAY.tokenSoon }
    await markNeedsReauth(deps.db, o.account_id, o.org_id)
    return { reason: SAY.token }
  }
  if (!canPublish(o.platform as 'linkedin' | 'x', tokens.scopes)) return { reason: SAY.scope }
  return { token: tokens.accessToken }
}

async function setCorrection(db: Db, id: string, org: string, status: string, fields: { error?: string | null; newPostId?: string | null } = {}): Promise<void> {
  await db
    .prepare(`UPDATE post_corrections SET status = ?, error = ?, new_post_id = coalesce(?, new_post_id), updated_at = datetime('now') WHERE id = ? AND org_id = ?`)
    .bind(status, fields.error ?? null, fields.newPostId ?? null, id, org)
    .run()
}

/** يحجز المفتاح بصفٍّ فريد — وما سبق إليه يُعاد كما هو، بلا نداء. */
async function reserve(db: Db, o: Original, input: CorrectInput, text: string): Promise<{ id: string } | { existing: { id: string; status: string; new_post_id: string | null; error: string | null } }> {
  const id = crypto.randomUUID()
  try {
    await db
      .prepare(`INSERT INTO post_corrections (id, org_id, post_id, kind, status, idempotency_key, old_text, new_text, by_email) VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, ?)`)
      .bind(id, o.org_id, o.id, input.kind, input.key, o.text, text, input.by)
      .run()
    return { id }
  } catch (error) {
    if (!/UNIQUE/i.test(String(error))) throw error
    const row = await db
      .prepare(`SELECT id, status, new_post_id, error FROM post_corrections WHERE org_id = ? AND idempotency_key = ?`)
      .bind(o.org_id, input.key)
      .first<{ id: string; status: string; new_post_id: string | null; error: string | null }>()
    if (row === null) throw error
    return { existing: row }
  }
}

/** يصحّح منشورًا نُشر. لا يرمي على فشل المنصّة: يعيد سببه بالعربيّة. */
export async function correctPost(deps: CorrectDeps, org: string, input: CorrectInput): Promise<CorrectResult> {
  const o = await readOriginal(deps.db, org, input.postId)
  const can = correctable(o)
  if (!can.ok) return { ok: false, reason: can.reason }
  const original = o!
  const bad = validate(original, input)
  if (bad !== null) return { ok: false, reason: bad }
  const text = input.text.trim()

  const held = await reserve(deps.db, original, input, text)
  if ('existing' in held) {
    const e = held.existing
    if (e.status === 'succeeded') return { ok: true, kind: input.kind, correctionId: e.id, newPostId: e.new_post_id, duplicate: true }
    return { ok: false, reason: SAY.held + (e.error === null ? '' : ' ' + e.error), correctionId: e.id, retry: e.status === 'deleted' }
  }
  const cid = held.id

  const tok = await tokenFor(deps, original)
  if ('reason' in tok) {
    await setCorrection(deps.db, cid, org, 'failed', { error: tok.reason })
    return { ok: false, reason: tok.reason, correctionId: cid }
  }
  const fetchImpl = withTimeout(deps.fetchImpl ?? fetch, 60_000)

  if (input.kind === 'edit') return editLinkedIn(deps, fetchImpl, original, tok.token, cid, text)
  if (input.kind === 'reply') {
    const r = await publishLinked(deps, fetchImpl, original, tok.token, cid, text, 'reply', input.by)
    return r
  }
  // ‏«احذف وأعد النشر»: الحذفُ أوّلًا، في الدفتر قبل إرساله
  try {
    await recordCost(deps.db, { provider: 'x', operation: 'delete_post:price_unverified', units: 1, unitCost: 0, refId: original.id, org })
  } catch {
    await setCorrection(deps.db, cid, org, 'failed', { error: SAY.ledger })
    return { ok: false, reason: SAY.ledger, correctionId: cid }
  }
  let res: Response
  try {
    res = await fetchImpl(`${X.postUrl}/${encodeURIComponent(original.platform_post_id!)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok.token}` },
    })
  } catch (error) {
    const why = platformSay('x', 0, isTimeout(error) ? 'timeout' : 'network')
    await setCorrection(deps.db, cid, org, 'failed', { error: why })
    return { ok: false, reason: why, correctionId: cid }
  }
  // ‏‏404: حُذف خارج صدى — لا شيء يُحذف، والبديلُ يُنشر كما طُلب
  const goneAlready = res.status === 404
  if (!res.ok && !goneAlready) {
    const why = platformSay('x', res.status, await detailOf(res))
    await setCorrection(deps.db, cid, org, 'failed', { error: why })
    return { ok: false, reason: why, correctionId: cid }
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { data?: { deleted?: unknown } }
    if (body.data?.deleted !== true) {
      const why = 'ردّت X بلا «deleted: true» — لم يُحذف الأصل، ولم يُنشر البديل.'
      await setCorrection(deps.db, cid, org, 'failed', { error: why })
      return { ok: false, reason: why, correctionId: cid }
    }
  }
  await deps.db.prepare(`UPDATE posts SET platform_deleted_at = datetime('now'), corrected_at = datetime('now') WHERE id = ? AND org_id = ?`).bind(original.id, org).run()
  await setCorrection(deps.db, cid, org, 'deleted')
  return publishLinked(deps, fetchImpl, original, tok.token, cid, text, 'replace', input.by)
}

/** LinkedIn: تعديلُ النصّ في مكانه، والسابقُ محفوظٌ في صفّ التصحيح. */
async function editLinkedIn(deps: CorrectDeps, fetchImpl: typeof fetch, o: Original, token: string, cid: string, text: string): Promise<CorrectResult> {
  try {
    await recordCost(deps.db, { provider: 'linkedin', operation: 'edit_post', units: 1, unitCost: 0, refId: o.id, org: o.org_id })
  } catch {
    await setCorrection(deps.db, cid, o.org_id, 'failed', { error: SAY.ledger })
    return { ok: false, reason: SAY.ledger, correctionId: cid }
  }
  let res: Response
  try {
    res = await fetchImpl(`${LINKEDIN.postUrl}/${encodeURIComponent(o.platform_post_id!)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'X-RestLi-Method': 'PARTIAL_UPDATE',
        ...LINKEDIN.extraHeaders,
      },
      body: JSON.stringify({ patch: { $set: { commentary: littleText(text) } } }),
    })
  } catch (error) {
    const why = platformSay('linkedin', 0, isTimeout(error) ? 'timeout' : 'network')
    await setCorrection(deps.db, cid, o.org_id, 'failed', { error: why })
    return { ok: false, reason: why, correctionId: cid }
  }
  if (!res.ok) {
    const why = platformSay('linkedin', res.status, await detailOf(res))
    await setCorrection(deps.db, cid, o.org_id, 'failed', { error: why })
    return { ok: false, reason: why, correctionId: cid }
  }
  await deps.db
    .prepare(`UPDATE posts SET text = ?, rev = rev + 1, corrected_at = datetime('now') WHERE id = ? AND org_id = ?`)
    .bind(text, o.id, o.org_id)
    .run()
  await setCorrection(deps.db, cid, o.org_id, 'succeeded')
  return { ok: true, kind: 'edit', correctionId: cid, newPostId: null }
}

/**
 * X: المنشورُ المرتبط (ردٌّ أو بديل) يُكتب صفًّا بمفتاحه الجديد، ومحاولتُه `sent` قبل الإرسال، وكلفتُه في الدفتر قبله.
 * ‏ويُستأنف بـ`newPostId` في إعادة المحاولة فلا يُكتب صفٌّ ثانٍ.
 */
async function publishLinked(
  deps: CorrectDeps, fetchImpl: typeof fetch, o: Original, token: string, cid: string, text: string,
  kind: 'reply' | 'replace', by: string | null, existingPostId: string | null = null,
): Promise<CorrectResult> {
  const db = deps.db
  const org = o.org_id
  const failState = kind === 'replace' ? 'deleted' : 'failed'
  let postId = existingPostId
  let key: string
  if (postId === null) {
    postId = crypto.randomUUID()
    key = `correct:${kind}:${crypto.randomUUID()}`
    const nowIso = (deps.now ?? (() => new Date()))().toISOString().replace('T', ' ').slice(0, 19)
    await db
      .prepare(
        `INSERT INTO posts (id, org_id, account_id, platform, type, text, has_url, scheduled_at, status, idempotency_key, approved_by, approved_at, corrects_post_id, correction_kind)
         VALUES (?, ?, ?, 'x', 'text', ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
      )
      .bind(postId, org, o.account_id, text, containsUrl(text) ? 1 : 0, nowIso, key, by ?? 'panel', nowIso, o.id, kind)
      .run()
    await setCorrection(db, cid, org, kind === 'replace' ? 'deleted' : 'sent', { newPostId: postId })
  } else {
    const row = await db.prepare(`SELECT idempotency_key FROM posts WHERE id = ? AND org_id = ?`).bind(postId, org).first<{ idempotency_key: string }>()
    if (row === null) return { ok: false, reason: SAY.notFound, correctionId: cid }
    key = row.idempotency_key
    const done = await db
      .prepare(`SELECT status FROM publish_attempts WHERE idempotency_key = ? AND org_id = ? AND status IN ('sent', 'succeeded') LIMIT 1`)
      .bind(key, org)
      .first<{ status: string }>()
    if (done?.status === 'succeeded') {
      await finishLinked(db, o, cid, postId)
      return { ok: true, kind, correctionId: cid, newPostId: postId, duplicate: true }
    }
    if (done?.status === 'sent') {
      return { ok: false, reason: 'محاولةٌ سابقةٌ للبديل أُرسلت ولم يُعرَف جوابُها — تحقّق على X قبل أن تعيد.', correctionId: cid, retry: false }
    }
  }
  if (!key.startsWith('correct:')) return { ok: false, reason: SAY.key, correctionId: cid }

  const n = await db.prepare(`SELECT coalesce(max(attempt_no), 0) AS n FROM publish_attempts WHERE post_id = ? AND org_id = ?`).bind(postId, org).first<{ n: number }>()
  const attemptId = crypto.randomUUID()
  const hasUrl = containsUrl(text)
  await db
    .prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, org_id) VALUES (?, ?, ?, ?, ?, 'sent', ?)`)
    .bind(attemptId, postId, key, (n?.n ?? 0) + 1, JSON.stringify({ platform: 'x', correction: kind, has_url: hasUrl, length: text.length }), org)
    .run()
  try {
    await recordCost(db, {
      provider: 'x', operation: kind === 'reply' ? 'correction_reply' : 'correction_replace',
      units: 1, unitCost: estimatePostCost('x', hasUrl), refId: postId, org,
    })
  } catch {
    await db.prepare(`UPDATE publish_attempts SET status = 'failed', response_json = ? WHERE id = ? AND org_id = ? AND status = 'sent'`)
      .bind(JSON.stringify({ error: 'pre_send', pre_send: true }), attemptId, org).run()
    await setCorrection(db, cid, org, failState, { error: SAY.ledger })
    return { ok: false, reason: SAY.ledger, correctionId: cid, retry: kind === 'replace' }
  }
  try {
    const out = await publishX(token, text, fetchImpl, null, kind === 'reply' ? o.platform_post_id : null)
    await db.prepare(`UPDATE publish_attempts SET status = 'succeeded', platform_post_id = ?, response_json = ? WHERE id = ? AND org_id = ?`)
      .bind(out.platformPostId, JSON.stringify(out.response), attemptId, org).run()
    await finishLinked(db, o, cid, postId)
    return { ok: true, kind, correctionId: cid, newPostId: postId }
  } catch (error) {
    const status = error instanceof PublishError ? error.status : 0
    const detail = error instanceof Error ? error.message : String(error)
    const unconfirmed = !(error instanceof PublishError) || status >= 500
    const why = (kind === 'replace' ? 'حُذف الأصلُ ولم يُنشر البديل: ' : '') + platformSay('x', status, isTimeout(error) ? 'timeout' : detail.slice(0, 160))
    // ‏ما لم يُعرَف جوابُه يبقى `sent`: لا يُعاد حتّى يتحقّق المالك (D-269)
    if (!unconfirmed) {
      await db.prepare(`UPDATE publish_attempts SET status = 'failed', response_json = ? WHERE id = ? AND org_id = ?`)
        .bind(JSON.stringify({ error: detail.slice(0, 200), status }), attemptId, org).run()
    }
    await db.prepare(`UPDATE posts SET status = 'failed' WHERE id = ? AND org_id = ? AND status <> 'published'`).bind(postId, org).run()
    await setCorrection(db, cid, org, failState, { error: why })
    return { ok: false, reason: why, correctionId: cid, retry: kind === 'replace' && !unconfirmed }
  }
}

async function finishLinked(db: Db, o: Original, cid: string, postId: string): Promise<void> {
  await db.prepare(`UPDATE posts SET status = 'published' WHERE id = ? AND org_id = ?`).bind(postId, o.org_id).run()
  await db.prepare(`UPDATE posts SET corrected_at = datetime('now') WHERE id = ? AND org_id = ?`).bind(o.id, o.org_id).run()
  await setCorrection(db, cid, o.org_id, 'succeeded', { newPostId: postId })
}

/** «أعد المحاولة» بعد حذفٍ نجح ونشرٍ فشل: ينشر البديلَ وحده، **ولا يحذف ثانيةً**. */
export async function retryReplacement(deps: CorrectDeps, org: string, correctionId: string): Promise<CorrectResult> {
  const c = await deps.db
    .prepare(`SELECT id, post_id, kind, status, new_text, new_post_id, by_email FROM post_corrections WHERE id = ? AND org_id = ?`)
    .bind(correctionId, org)
    .first<{ id: string; post_id: string; kind: string; status: string; new_text: string; new_post_id: string | null; by_email: string | null }>()
  if (c === null) return { ok: false, reason: 'لا تصحيح بهذا المعرّف.' }
  if (c.kind !== 'replace' || c.status !== 'deleted') return { ok: false, reason: 'لا شيء يُعاد: هذا التصحيحُ ليس بديلًا ينتظر النشر.' }
  const o = await readOriginal(deps.db, org, c.post_id)
  if (o === null || o.platform_deleted_at === null) return { ok: false, reason: SAY.notFound }
  const tok = await tokenFor(deps, o)
  if ('reason' in tok) return { ok: false, reason: tok.reason, correctionId: c.id, retry: true }
  return publishLinked(deps, withTimeout(deps.fetchImpl ?? fetch, 60_000), o, tok.token, c.id, c.new_text, 'replace', c.by_email, c.new_post_id)
}

export interface CorrectionRow {
  readonly id: string
  readonly kind: CorrectionKind
  readonly status: string
  readonly old_text: string
  readonly new_text: string
  readonly new_post_id: string | null
  readonly error: string | null
  readonly created_at: string
}

/** تصحيحاتُ منشورٍ الأحدثُ أوّلًا — وفيها نصوصُه السابقة. */
export async function correctionsOf(db: Db, org: string, postId: string): Promise<CorrectionRow[]> {
  return db
    .prepare(`SELECT id, kind, status, old_text, new_text, new_post_id, error, created_at FROM post_corrections WHERE org_id = ? AND post_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20`)
    .bind(org, postId)
    .all<CorrectionRow>()
    .then((r) => r.results)
    .catch(() => [])
}
