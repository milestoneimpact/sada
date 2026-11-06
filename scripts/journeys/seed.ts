/**
 * بذرةُ النسخة المحلّيّة — **على شكل staging الحقيقيّ** لا على شكلٍ متخيَّل.
 *
 * ما في staging (قُرئ قراءةً فقط): مصدران في Drive يحملان الاسمَ نفسَه
 * «الإطار_الأول_Milestone» — مستندٌ وعرضُ شرائح — حُلّل أحدُهما؛ وثلاثةُ
 * حساباتٍ نشطة (LinkedIn «عمر» وX وYouTube)؛ ومنشورُ YouTube معدَّلٌ معتمَد
 * بمقطعٍ رفعه المالك، ومنشورُ X منشور، ومنشورُ LinkedIn مرفوض؛ ومقطعٌ جاهز.
 *
 * وما أُضيف لتُقاس رحلاتٌ لا مادّةَ لها في staging (ويُقال في التقرير):
 * مسوّدةٌ تنتظر القرار (ر-0)، ومنشورٌ فشل (ر-8)، ومنشورٌ مجدولٌ بعد أكثر من
 * يومين (ر-9)، وصفوفُ إنفاقٍ هذا الشهر (ر-10).
 *
 * **والرموزُ مشفَّرةٌ بالدالّة الحقيقيّة** (`saveTokens` · `saveApp`) بمفتاحٍ
 * يُولَّد محلّيًّا — وقيمُها نصوصٌ مزيَّفة لا تفتح شيئًا.
 */
import { saveTokens, upsertAccount, type Db } from '../../src/lib/tokens'
import { saveApp } from '../../src/lib/oauth/apps'
import { recordCost } from '../../src/lib/cost'
import { runWeekly } from '../../src/lib/report/job'
import { weekBounds } from '../../src/lib/report/weekly'
import { addPasskey } from '../../src/lib/security/factors'
import { OWNER_EMAIL } from '../../src/lib/ownerEmail'

/**
 * **مفتاحُ مرور المالك** (D-317) — العاملُ الثاني إلزاميٌّ للمالك، فالبذرةُ تحمله كما تحمله staging بعد المهمّة M-.
 *
 * زوجُ مفاتيح P-256 يُولَّد مرّةً للعمليّة: العامُّ يُحفظ بالدالّة التي يحفظ بها مسارُ التسجيل (`addPasskey`)، والخاصُّ
 * يُسلَّم إلى متوثِّق Chromium الافتراضيّ (`WebAuthn.addCredential`) فيوقّع المتصفّحُ كما يوقّع هاتفُ المالك. ولا رايةَ
 * في شيفرة الإنتاج تتخطّى العامل.
 */
export interface OwnerPasskey {
  /** معرّفُ الاعتماد بـ base64url كما يحفظه صدى، وبـ base64 كما يطلبه CDP. */
  readonly credentialId: string
  readonly credentialIdB64: string
  /** المفتاحُ الخاصّ PKCS#8 بـ base64 — لـ CDP وحده، لا يُكتب في قاعدة ولا ملفّ. */
  readonly privateKeyB64: string
  readonly publicKey: string
}

let ownerKey: Promise<OwnerPasskey> | null = null

export function ownerPasskey(): Promise<OwnerPasskey> {
  ownerKey ??= (async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const raw = crypto.getRandomValues(new Uint8Array(16))
    const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
    const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')
    return {
      credentialId: b64u(raw),
      credentialIdB64: b64(raw),
      privateKeyB64: b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))),
      publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))),
    }
  })()
  return ownerKey
}

/** شكلُ `datetime('now')` في SQLite — والمقارنةُ في الشيفرة نصّيّة. */
export function sqlTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

export const SOURCE_NAME = 'الإطار_الأول_Milestone'

export interface Seeded {
  readonly sources: { readonly doc: string; readonly slides: string }
  readonly accounts: { readonly linkedin: string; readonly x: string; readonly youtube: string }
  readonly posts: {
    /** ر-0: مسوّدة LinkedIn تنتظر القرار. */
    readonly draft: string
    readonly youtubeEdited: string
    readonly xPublished: string
    readonly linkedinRejected: string
    /** ر-8 */
    readonly failed: string
    /** ر-9 */
    readonly queued: string
  }
  readonly uploadId: string
  readonly uploadKey: string
}

async function run(db: Db, sql: string, ...values: unknown[]): Promise<void> {
  await db.prepare(sql).bind(...values).run()
}

/** يزرع القاعدة. `video` بايتاتُ المقطع الجاهز، تُكتب في R2 بمفتاحه. */
export async function seed(
  db: Db,
  encKey: string,
  bucket: { put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> },
  video: { bytes: Uint8Array; mime: string; width: number; height: number; durationMs: number },
  now: Date = new Date(),
): Promise<Seeded> {
  const at = (offsetMs: number) => sqlTime(new Date(now.getTime() + offsetMs))

  // ── تطبيقاتُ OAuth في الخزانة (كما سدّها المالك من اللوحة) ─────────────
  await saveApp(db, encKey, 'linkedin', '86local0linkedin', 'local-fake-linkedin-secret-0000', 'seed')
  await saveApp(db, encKey, 'x', 'bG9jYWwteC1jbGllbnQ', 'local-fake-x-secret-000000000000', 'seed')
  await saveApp(db, encKey, 'youtube', '000000-local.apps.googleusercontent.com', 'GOCSPX-local-fake-secret', 'seed')

  // ── الحسابات ──────────────────────────────────────────────────────────
  const linkedin = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'li-local-omar', displayName: 'عمر' })
  const x = await upsertAccount(db, 'org_owner', { platform: 'x', kind: 'member', externalId: '1700000000000000000', displayName: 'omar_sada' })
  // ‏والقناةُ `org` كما يحفظها الربطُ الحقيقيّ (`identity.ts`) — بذرةٌ بـ`member` أخفت إسقاطَها من الجدولة
  const youtube = await upsertAccount(db, 'org_owner', { platform: 'youtube', kind: 'org', externalId: 'UClocal0omar', displayName: 'عمر — القناة' })
  const tokens = {
    [linkedin]: { scopes: 'openid profile w_member_social', life: 55 * DAY, refresh: null },
    [x]: { scopes: 'tweet.read tweet.write users.read offline.access media.write', life: 2 * HOUR, refresh: 'local-fake-x-refresh' },
    [youtube]: {
      scopes: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      life: HOUR,
      refresh: 'local-fake-google-refresh',
    },
  } as const
  for (const [id, t] of Object.entries(tokens)) {
    await saveTokens(db, encKey, id, {
      accessToken: `local-fake-access-${id}`,
      refreshToken: t.refresh,
      expiresAt: new Date(now.getTime() + t.life).toISOString(),
      refreshExpiresAt: t.refresh === null ? null : new Date(now.getTime() + 300 * DAY).toISOString(),
      scopes: t.scopes,
    } as Parameters<typeof saveTokens>[3])
  }

  // ── المصدران: الاسمُ نفسُه، والنوعان مختلفان، والمحلَّلُ واحد ─────────
  const doc = crypto.randomUUID()
  const slides = crypto.randomUUID()
  const docHash = 'md5:4f1c2a9e7b3d5f60a1b2c3d4e5f60718'
  await run(db,
    `INSERT INTO sources (id, drive_file_id, name, mime, content_hash, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`,
    doc, '1Lc4l-DocMilestoneFramework0001', SOURCE_NAME, 'application/vnd.google-apps.document', docHash, at(-2 * DAY))
  await run(db,
    `INSERT INTO sources (id, drive_file_id, name, mime, content_hash, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`,
    slides, '1Lc4l-SlidesMilestoneFramework01', SOURCE_NAME, 'application/vnd.google-apps.presentation',
    'md5:9a8b7c6d5e4f30211203f4e5d6c7b8a9', at(-2 * DAY))
  await run(db,
    `INSERT INTO content_items (id, source_id, summary, themes_json, worth_score, extracted_at) VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), doc,
    'يعرض المستند إطارًا لتعريف المعالم في المشاريع: كلّ معلَم يُعرَّف قبل التنفيذ بمخرَج يُقاس، ' +
      'ومالك لقرار القبول، وأثر معلوم للتأخّر. ويقترح مراجعةً أسبوعيّةً قصيرة تبني على هذا التعريف بدل النقاش المفتوح.',
    JSON.stringify({
      hash: docHash,
      themes: ['تعريف المعلَم قبل التنفيذ', 'ملكيّة قرار القبول', 'أثر التأخّر'],
      audience: 'مديرو المشاريع وقادة الفرق',
      angles: ['ثلاثة أسئلة قبل كلّ معلَم', 'من الاجتماع الطويل إلى المراجعة القصيرة'],
      reason: 'فكرة عمليّة قابلة للتطبيق، بلغة يفهمها جمهور LinkedIn المهنيّ',
    }),
    0.82, at(-2 * DAY + HOUR))

  // ── المقطعُ الجاهز (رفعه المالك) ─────────────────────────────────────
  const uploadId = crypto.randomUUID()
  const ext = video.mime === 'video/webm' ? 'webm' : 'mp4'
  const uploadKey = `upload/${uploadId}.${ext}`
  await bucket.put(uploadKey, video.bytes, { httpMetadata: { contentType: video.mime } })
  await run(db,
    `INSERT INTO uploads (id, r2_key, name, mime, bytes, width, height, duration_ms, status, created_at, ready_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
    uploadId, uploadKey, `الإطار_الأول.${ext}`, video.mime, video.bytes.length, video.width, video.height, video.durationMs,
    at(-1 * DAY), at(-1 * DAY + 60_000))

  // ── المنشورات ─────────────────────────────────────────────────────────
  const post = async (fields: {
    platform: string; text: string; status: string; key: string
    account?: string | null; scheduled?: string | null; approved?: string | null; source?: string | null
    original?: string | null; model?: string; cost?: number; created?: string; dispatched?: string | null
  }): Promise<string> => {
    const id = crypto.randomUUID()
    await run(db,
      `INSERT INTO posts (id, platform, account_id, source_id, source_hash, model, cost_usd, type, text, source_refs,
                          rationale, status, idempotency_key, approved_by, approved_at, scheduled_at, created_at,
                          dispatched_at, original_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'text', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, fields.platform, fields.account ?? null, fields.source ?? null, fields.source === doc ? docHash : null,
      fields.model ?? 'claude-opus-5', fields.cost ?? 0, fields.text,
      JSON.stringify(fields.source === undefined || fields.source === null ? [] : [fields.source]),
      fields.source === undefined || fields.source === null ? null : 'مبنيّ على فكرة المصدر المركزيّة.',
      fields.status, fields.key, fields.approved === undefined || fields.approved === null ? null : 'panel',
      fields.approved ?? null, fields.scheduled ?? null, fields.created ?? at(-DAY), fields.dispatched ?? null,
      fields.original ?? null)
    return id
  }

  // ر-0: مسوّدةٌ من نسخةٍ سابقةٍ للمصدر — مفتاحُها غيرُ مفتاح ما يُكتب في ر-2
  const draft = await post({
    platform: 'linkedin', status: 'draft', source: doc, key: `draft:${doc}:linkedin:md5:prev-version`, cost: 0.0612,
    created: at(-5 * HOUR),
    text: 'كلّ مشروع يتعثّر يبدأ تعثّرُه قبل التنفيذ: حين لا يتّفق الفريق على معنى «تمّ».\n\n' +
      'نعرّف كلّ معلَم اليوم بثلاثة: مخرَج يُرى ويُقاس، ومالك لقرار القبول، وأثر معلوم إن تأخّر.\n\n' +
      'والنتيجة: مراجعة أسبوعيّة في عشر دقائق بدل ساعة.\n\nما الذي يعنيه «تمّ» في فريقك؟\n\n#إدارة_المشاريع #الحوكمة',
  })

  // من staging: YouTube معدَّلٌ معتمَد بمقطع المالك
  const caption = 'الإطار الأوّل في دقيقة: كيف نعرّف المعلَم قبل أن يبدأ العمل. #إدارة_المشاريع'
  const youtubeEdited = await post({
    platform: 'youtube', status: 'edited', key: `upload:${uploadId}:youtube`, model: 'owner', approved: at(-20 * HOUR),
    text: caption, original: 'الإطار الأوّل في دقيقة.', created: at(-23 * HOUR),
  })
  await run(db,
    `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key,
                        width, height, upload_id, duration_ms)
     VALUES (?, ?, ?, ?, ?, '', 'upload', 0, 'ready', ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), youtubeEdited, uploadKey, video.mime, video.bytes.length, `upload:${uploadId}:${youtubeEdited}`,
    video.width, video.height, uploadId, video.durationMs)

  // من staging: X منشور (بمحاولةٍ ناجحةٍ وكلفتها) — **في وسط الأسبوع التامّ الأخير** أيًّا كان
  // ‏يومُ التشغيل، فيدخل تقريرَ الاثنين كما يدخله في staging
  const sent = weekBounds(now).from.getTime() + 3 * DAY + 10 * HOUR - now.getTime()
  const xPublished = await post({
    platform: 'x', status: 'published', account: x, source: doc, key: `draft:${doc}:x:${docHash}`, cost: 0.0231,
    approved: at(sent - DAY), scheduled: at(sent), dispatched: at(sent), created: at(sent - DAY - HOUR),
    text: 'المعلَم ليس تاريخًا في الجدول، بل اتّفاق على معنى «تمّ». ثلاثة أسئلة قبل التنفيذ توفّر ساعةً كلّ أسبوع. #إدارة_المشاريع',
  })
  await run(db,
    `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, platform_post_id, status, at)
     VALUES (?, ?, ?, 1, ?, ?, ?, 'succeeded', ?)`,
    crypto.randomUUID(), xPublished, `draft:${doc}:x:${docHash}`, '{"text_len":118}', '{"data":{"id":"1840000000000000001"}}',
    '1840000000000000001', at(sent + 4000))
  const xCost = await recordCost(db, { provider: 'x', operation: 'post', units: 1, unitCost: 0.015, refId: xPublished })
  await run(db, 'UPDATE cost_ledger SET at = ? WHERE id = ?', at(sent + 4000), xCost)
  // ‏وأثرُه بعد 24س و72س — كما تسحبه دورةُ المقاييس
  for (const [window, impressions, reactions, comments, shares, clicks] of [
    ['24h', 1240, 31, 3, 5, 14], ['72h', 1975, 44, 6, 8, 23],
  ] as const) {
    await run(db,
      `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares, clicks, pulled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      xPublished, window, impressions, reactions, comments, shares, clicks, at(sent + (window === '24h' ? DAY : 3 * DAY)))
  }

  // من staging: LinkedIn مرفوض
  const linkedinRejected = await post({
    platform: 'linkedin', status: 'rejected', source: slides, key: `draft:${slides}:linkedin:md5:old`, cost: 0.0587,
    created: at(-4 * DAY),
    text: 'في عالم يتسارع، أصبح من الضروريّ أن نعيد التفكير في طريقة إدارتنا للمشاريع. تجدر الإشارة إلى أنّ المعالم مهمّة جدًّا…',
  })

  // ر-8: منشورٌ فشل (أخطأت LinkedIn بـ 500 ثلاثَ مرّات — والحسابُ سليم كما في staging)
  const failed = await post({
    platform: 'linkedin', status: 'failed', account: linkedin, source: doc, key: `draft:${doc}:linkedin:md5:failed-one`,
    approved: at(-30 * HOUR), scheduled: at(-26 * HOUR), dispatched: at(-26 * HOUR), cost: 0.0598, created: at(-31 * HOUR),
    text: 'ثلاثة أسئلة قبل كلّ معلَم: ما المخرَج الذي يُقاس؟ ومن يملك قرار القبول؟ وما الذي يتوقّف إن تأخّر؟\n\n' +
      'حين أجبنا عنها كتابةً، صار الاجتماع الأسبوعيّ عشر دقائق.\n\n#إدارة_المشاريع #القيادة',
  })
  for (const n of [1, 2, 3]) {
    await run(db,
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, at)
       VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`,
      crypto.randomUUID(), failed, `draft:${doc}:linkedin:md5:failed-one`, n, '{"text_len":160}',
      '{"status":500,"message":"Internal Server Error","serviceErrorCode":0}',
      at(-26 * HOUR + n * 60_000))
  }

  // ر-9: منشورٌ مجدولٌ بعد ثلاثة أيّام
  const queued = await post({
    platform: 'x', status: 'queued', account: x, source: doc, key: `draft:${doc}:x:md5:queued-one`, cost: 0.0204,
    approved: at(-2 * HOUR), scheduled: at(3 * DAY + 4 * HOUR), created: at(-3 * HOUR),
    text: 'حين نتّفق على معنى «تمّ» قبل التنفيذ، يصير الاجتماع الأسبوعيّ عشر دقائق بدل ساعة. #الحوكمة',
  })

  // ── الإنفاق هذا الشهر (ر-10) — ومعه صفٌّ من الشهر الماضي لا يُحسب ──────────
  const ledger: [string, string, number, number, number][] = [
    ['anthropic', 'analyze:claude-opus-5', 18_400, 0.0000108, -2 * DAY + HOUR],
    ['anthropic', 'draft:x:claude-opus-5', 3_900, 0.0000059, -3 * DAY - HOUR],
    ['anthropic', 'draft:linkedin:claude-opus-5', 6_200, 0.0000097, -31 * HOUR],
    ['anthropic', 'draft:linkedin:claude-opus-5', 6_100, 0.0000100, -5 * HOUR],
    ['anthropic', 'infographic:claude-opus-5', 2_800, 0.0000120, -20 * HOUR],
    ['cloudflare-browser', 'infographic:linkedin', 1, 0, -20 * HOUR],
    ['x', 'read:metrics', 12, 0.001, -DAY],
  ]
  for (const [provider, operation, units, unitCost, offset] of ledger) {
    const id = await recordCost(db, { provider, operation, units, unitCost })
    await run(db, 'UPDATE cost_ledger SET at = ? WHERE id = ?', at(offset), id)
  }
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12))
  const old = await recordCost(db, { provider: 'anthropic', operation: 'analyze:claude-opus-5', units: 40_000, unitCost: 0.000011 })
  await run(db, 'UPDATE cost_ledger SET at = ? WHERE id = ?', sqlTime(lastMonth), old)

  // ── نبضُ الدورات: staging تعمل، فلا يظهر «الدورة متوقّفة» كذبًا ────────────
  for (const job of ['renew', 'dispatch', 'publish', 'metrics', 'scan', 'alerts', 'report']) {
    await run(db, `INSERT INTO heartbeats (job, at, outcome, detail) VALUES (?, ?, 'ok', 'محلّيّ')`, job, at(job === 'report' ? -2 * DAY : -10 * 60_000))
  }

  // ‏التقريرُ الأسبوعيّ كما تكتبه دورةُ الاثنين — بالدالّة نفسِها لا بصفٍّ مكتوبٍ باليد
  await runWeekly(db, now)

  // ‏مفتاحُ مرور المالك (D-317) — بالدالّة التي يحفظ بها مسارُ التسجيل
  const key = await ownerPasskey()
  await addPasskey(db, {
    credentialId: key.credentialId, publicKey: key.publicKey, alg: -7, signCount: 0,
    label: 'هاتف المالك', rpId: 'localhost', email: OWNER_EMAIL,
  })

  return {
    sources: { doc, slides },
    accounts: { linkedin, x, youtube },
    posts: { draft, youtubeEdited, xPublished, linkedinRejected, failed, queued },
    uploadId,
    uploadKey,
  }
}
