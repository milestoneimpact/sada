/**
 * جلسة اللوحة.
 *
 * المتصفّح لا يرسل `Authorization: Bearer` من صفحةٍ عاديّة، فلا بدّ من
 * كعكة. وأربعةُ قيودٍ تجعلها كعكةً لا ثغرة:
 *
 * ١ · **`HttpOnly`** — لا تُقرأ من JavaScript، فثغرة XSS لا تسرقها.
 * ٢ · **`SameSite=Strict`** — لا تُرسل مع طلبٍ من موقعٍ آخر.
 * ٣ · **`Secure`** — لا تُرسل إلا على HTTPS.
 * ٤ · **`__Host-`** — بادئةٌ يفرضها المتصفّح نفسه: لا تُقبَل الكعكة إلا
 *     بـ `Secure` و `Path=/` وبلا `Domain`. فنطاقٌ شقيقٌ مخترَق لا
 *     يستطيع أن يكتب كعكةً تُقبَل هنا (Cookie Tossing).
 *
 * والمعرّف عشوائيّ من `crypto`، والقيمة في KV بمهلة انتهاء — لا في
 * الكعكة نفسها. فلا يُزوَّر بتعديل نصّها، ولا يُقرأ منها شيء.
 *
 * **والجلسة مربوطةٌ بما أنشأها.** يُحفظ مع الصفّ بصمةُ الاعتماد الذي فتحه،
 * ويُقارَن في كلّ طلب. فتدويرُ `ADMIN_TOKEN` يُبطل كلّ الجلسات القائمة في
 * اللحظة نفسها. وكان قبل ذلك لا يُبطل شيئا: تُبدّل الرمز المسروق فتظنّ
 * البابَ أُغلق، وجلسةُ السارق حيّةٌ ثماني ساعات.
 */
import { fingerprint, randomToken, sameSecret } from './security/digest'
import { OWNER_EMAIL, type Role } from './ownerEmail'

/**
 * `__Host-` بادئةٌ ذاتُ معنى عند المتصفّح لا مجرّد اسم.
 *
 * وهي تشترط `Path=/`، فالكعكة تُرسل إلى كلّ المسارات — وكان `Path=/panel`
 * يضيّقها. والمقايضة مقصودة: منعُ نطاقٍ شقيقٍ من زرع كعكةٍ أهمّ من
 * تضييقِ المسار، لأنّ المسار لا يمنع شيئا أصلا (المسارات كلّها لنا).
 */
export const COOKIE = '__Host-sada_session'
/**
 * ثلاثةُ أيّام (D-245) — بطلب المالك: الدخولُ برمز بريدٍ أثقلُ من كلمة، فلا يُطلب كلَّ يوم.
 * وتدويرُ `ADMIN_TOKEN` و«أنهِ الجلسات» يُغلقانها قبل ذلك متى شئت.
 */
export const SESSION_TTL_SECONDS = 3 * 24 * 60 * 60

/** بادئةُ مفاتيح الجلسات في KV — يُجرَد بها ويُبطَل. */
const PREFIX = 'session:'

/** الوجهةُ حين لا تُطلَب وجهة، أو تُطلَب وجهةٌ لا تُقبَل. */
const HOME = '/panel'

/**
 * وجهةُ ما بعد الدخول — **مسارٌ في اللوحة وحدَها، أو الرئيسيّة** (الخطّة ر-11، 7.11).
 *
 * كان كلُّ توجيهٍ بعد الدخول `/panel` ثابتًا: من طلب «التقرير» وصل إلى الرئيسيّة
 * وضغط مرّةً ثانية، ومرساةُ `#posts` تضيع بإرسال النموذج. والوجهةُ تأتي من نموذجٍ
 * يكتبه المتصفّح، **فهي مدخلٌ لا يُوثَق به**: توجيهٌ إلى ما يُكتب فيه بابٌ مفتوحٌ
 * إلى أيّ موقع (Open Redirect). فقائمةُ سماحٍ لا قائمةُ منع:
 *
 * - تبدأ بـ `/panel` ثمّ نهايةٌ أو `/` أو `?` أو `#` — فلا `/panelx` ولا مخطّط
 *   (`https:`) ولا نطاقَ قبلها؛
 * - ولا `//` ولا `\` في أيّ موضع: المتصفّحُ يقرأ `/\evil` و`//evil` نطاقًا؛
 * - ولا محرفَ تحكّمٍ ولا مسافة: `Location` بسطرٍ جديدٍ ترويسةٌ ثانية؛
 * - ولا `..`، ولا صفحتا الدخول والخروج — فلا حلقة؛
 * - وطولُها محدود.
 */
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return HOME
  if (!/^\/panel(?:[/?#]|$)/.test(raw)) return HOME
  if (raw.includes('//') || raw.includes('\\') || raw.includes('..')) return HOME
  if (/[\u0000-\u0020\u007f]/.test(raw)) return HOME
  if (/^\/panel\/(?:login|logout|2fa)(?:[/?#]|$)/.test(raw)) return HOME
  return raw
}

export interface KvListKey {
  readonly name: string
}
export interface KvListResult {
  readonly keys: KvListKey[]
  readonly list_complete: boolean
  readonly cursor?: string
}

/**
 * ما نحتاجه من KV لا أكثر.
 *
 * و`list` **اختياريّة**: بيئةُ اختبارٍ لا تدعمها تُشغّل كلَّ شيءٍ عداها،
 * والجردُ يعود فارغا بدل أن يسقط. وأنواعُها مكتوبةٌ لتقبل ما تعيده
 * Cloudflare حرفيّا — `null` لا `undefined` في المؤشّر.
 */
export interface SessionStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list?(options?: {
    prefix?: string | null
    cursor?: string | null
    limit?: number
  }): Promise<KvListResult>
}

/** كيف فُتحت الجلسة. */
export type SessionVia = 'email_code' | 'passkey' | 'admin_token'

export interface SessionRecord {
  /** متى فُتحت — ISO. */
  readonly at: string
  readonly via: SessionVia
  /** بصمةُ الاعتماد الذي فتحها. تبديلُه يُبطلها. */
  readonly bind: string
  /** سرُّ CSRF لهذه الجلسة وحدها. */
  readonly csrf: string
  /** عنوانُ من فتحها — للجرد، لا للتحقّق. */
  readonly ip: string
  /** المتصفّح كما عرّف نفسه — للجرد، مقصوصا. */
  readonly ua: string
  /**
   * جلسةٌ لم تُتمّ عاملَها الثاني بعد.
   *
   * ودخولٌ بالرمز حين يكون ثمّة عاملٌ ثانٍ **لا يُعطي جلسةً كاملة**: يُعطي
   * جلسةً معلَّقة لا تفتح إلّا صفحةَ العامل الثاني. وهذا هو الفرق بين
   * «عاملين» و«عاملٍ ثمّ سؤالٍ يُتخطّى» — لو كانت الجلسة كاملةً ثمّ
   * عُرضت شاشةُ الرمز، لكفى طلبٌ مباشرٌ إلى `/panel/settings` لتخطّيها.
   */
  readonly pending: boolean
  /**
   * أين يعود المالكُ بعد العامل الثاني — **مسارٌ مُتحقَّقٌ منه بـ `safeNext`**.
   *
   * يُكتب في الجلسة المعلَّقة لا في عنوان `/panel/2fa`: الرابطُ يُنسَخ ويُعدَّل،
   * والصفُّ في KV لا يكتبه إلّا الخادم. ويسقط عند الترقية.
   */
  readonly next?: string
  /**
   * المنظّمةُ النشطة (D-225) — وغيابُها منظّمةُ المالك. يكتبها `setActiveOrg` وحدَه،
   * بعد أن يتحقّق المسارُ أنّها موجودة.
   */
  readonly org?: string
  /** من دخل ودورُه (D-245) — المالكُ اليوم، والمدعوّون لاحقا. والغائبُ جلسةٌ قديمةٌ للمالك. */
  readonly email?: string
  readonly role?: Role
}

export interface Session {
  readonly id: string
  readonly record: SessionRecord
}

function sessionKey(id: string): string {
  return `${PREFIX}${id}`
}

/** يُقصّ ما يُعرض في الجرد: ترويسةٌ طويلة لا تملأ KV ولا الشاشة. */
function trim(value: string | null, max: number): string {
  return value === null ? '' : value.slice(0, max)
}

/**
 * بصمةُ الاعتماد الحاليّ.
 *
 * تُعاد `null` إن لم يكن ثمّة `ADMIN_TOKEN`: فلا جلسةَ تصحّ على بيئةٍ
 * مقفلة — الغيابُ يُغلق لا يفتح، هنا كما في `authorizeAdmin`.
 */
async function currentBind(adminToken: string | undefined): Promise<string | null> {
  const secret = typeof adminToken === 'string' ? adminToken.trim() : ''
  return secret.length === 0 ? null : await fingerprint(secret)
}

/**
 * جلسةٌ فُتحت برمز البريد (D-245) — **بعد أن قُبل الرمز**، فلا فحصَ هنا.
 *
 * والتحقّقُ في `verifyCode` وحده: موضعٌ ثانٍ للمقارنة موضعٌ ثانٍ يُخطئ فيه أحد.
 * وتُعلَّق إن كان ثمّة عاملٌ ثانٍ، كما كانت جلسةُ كلمة الإدارة.
 */
export async function createEmailSession(
  store: SessionStore,
  adminToken: string | undefined,
  who: { readonly email: string; readonly role: Role },
  request?: Request,
  options: { readonly pending?: boolean; readonly now?: Date; readonly next?: string } = {},
): Promise<{ id: string; record: SessionRecord } | { error: 'disabled' }> {
  const bind = await currentBind(adminToken)
  if (bind === null) return { error: 'disabled' }

  const next = safeNext(options.next)
  return await write(store, {
    at: (options.now ?? new Date()).toISOString(),
    via: 'email_code',
    bind,
    csrf: randomToken(32),
    ip: trim(request?.headers.get('CF-Connecting-IP') ?? null, 45),
    ua: trim(request?.headers.get('User-Agent') ?? null, 160),
    pending: options.pending === true,
    email: who.email,
    role: who.role,
    // ‏والوجهةُ للمعلَّقة وحدها: الكاملةُ تُوجَّه في ردّ الدخول نفسِه
    ...(options.pending === true && next !== HOME ? { next } : {}),
  })
}

/**
 * يكتب صفّا ويعيد معرّفه ومحتواه معا.
 *
 * ويعيدهما من وسيطه لا من حالةٍ في الوحدة: Worker يخدم طلباتٍ متوازيةً
 * في العامل الواحد، ومتغيّرٌ عامّ يحمل «آخرَ ما كُتب» يسلّم جلسةَ فلانٍ
 * إلى فلان.
 */
async function write(
  store: SessionStore,
  record: SessionRecord,
): Promise<{ id: string; record: SessionRecord }> {
  const id = crypto.randomUUID()
  await store.put(sessionKey(id), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
  return { id, record }
}

/**
 * جلسةٌ فُتحت بمفتاح مرور — كاملةٌ من أوّلها.
 *
 * ولا تُعلَّق: Passkey عاملان أصلا — جهازٌ في اليد وبصمةٌ أو رقمٌ يفتحه.
 * وطلبُ رمزٍ بعدها ليس تشديدا بل تكرارٌ يُتعب المالك بلا مقابل.
 *
 * وتُربَط بـ `ADMIN_TOKEN` أيضا وإن لم تُفتح به: تدويرُ الرمز يبقى
 * المفتاحَ الواحد الذي يُغلق كلَّ الأبواب دفعةً.
 */
export async function createPasskeySession(
  store: SessionStore,
  adminToken: string | undefined,
  request?: Request,
  now: Date = new Date(),
): Promise<{ id: string; record: SessionRecord } | { error: 'disabled' }> {
  const bind = await currentBind(adminToken)
  if (bind === null) return { error: 'disabled' }

  const record: SessionRecord = {
    at: now.toISOString(),
    via: 'passkey',
    bind,
    csrf: randomToken(32),
    ip: trim(request?.headers.get('CF-Connecting-IP') ?? null, 45),
    ua: trim(request?.headers.get('User-Agent') ?? null, 160),
    pending: false,
    email: OWNER_EMAIL,
    role: 'owner',
  }
  return await write(store, record)
}

/**
 * يرقّي جلسةً معلَّقة إلى كاملة — **بمعرّفٍ جديد**.
 *
 * وتبديلُ المعرّف ليس زينة: هو ما يمنع تثبيت الجلسة (Session Fixation).
 * فمن عرف معرّفَ الجلسة المعلَّقة — من سجلٍّ أو من فوق كتف — لا ينفعه
 * حين تُتمّ عاملَك الثاني، لأنّ الذي يحمل الصلاحيّة معرّفٌ لم يره.
 */
export async function promoteSession(
  store: SessionStore,
  session: Session,
): Promise<{ id: string; record: SessionRecord }> {
  // ‏والوجهةُ تُقرأ قبل الترقية وتسقط معها: جلسةٌ كاملةٌ لا تحمل وجهةً لا يقرؤها أحد
  const { next: _next, ...rest } = session.record
  const written = await write(store, {
    ...rest,
    csrf: randomToken(32),
    pending: false,
  })
  await store.delete(sessionKey(session.id))
  return written
}

/** يقرأ معرّف الجلسة من ترويسة الكعكة. */
export function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      const value = rest.join('=')
      return value.length === 0 ? null : value
    }
  }
  return null
}

function parse(raw: string): SessionRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<SessionRecord>
    if (typeof value.bind !== 'string' || typeof value.csrf !== 'string') return null
    if (typeof value.pending !== 'boolean') return null
    return {
      at: typeof value.at === 'string' ? value.at : '',
      via: value.via === 'passkey' || value.via === 'email_code' ? value.via : 'admin_token',
      bind: value.bind,
      csrf: value.csrf,
      ip: typeof value.ip === 'string' ? value.ip : '',
      ua: typeof value.ua === 'string' ? value.ua : '',
      pending: value.pending,
      ...(typeof value.next === 'string' ? { next: safeNext(value.next) } : {}),
      ...(typeof value.org === 'string' && value.org.length > 0 ? { org: value.org } : {}),
      email: typeof value.email === 'string' ? value.email : OWNER_EMAIL,
      role: 'owner',
    }
  } catch {
    return null
  }
}

/**
 * يقرأ جلسةً صالحة، أو `null`.
 *
 * ويُبطل بلا تردّد: صفٌّ لا يُقرأ، أو صفٌّ من صيغةٍ قديمة بلا `bind`، أو
 * بصمةٌ لا تطابق الاعتماد الحاليّ — كلّها «لا جلسة». وصفٌّ فاسد لا
 * يُترك ليُقرأ ثانيةً: يُمحى.
 */
export async function loadSession(
  store: SessionStore,
  request: Request,
  adminToken: string | undefined,
): Promise<Session | null> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id === null) return null

  const raw = await store.get(sessionKey(id))
  if (raw === null) return null

  const record = parse(raw)
  if (record === null) {
    await store.delete(sessionKey(id))
    return null
  }

  const bind = await currentBind(adminToken)
  if (bind === null || bind !== record.bind) {
    // الاعتماد تبدّل أو رُفع: الجلسة تسقط معه، ولا تُترك لتنتهي وحدها
    await store.delete(sessionKey(id))
    return null
  }

  return { id, record }
}

/**
 * يبدّل المنظّمةَ النشطة في الجلسة نفسِها (D-225).
 *
 * **بالمعرّف نفسِه** لا بمعرّفٍ جديد: لا صلاحيّةَ تُكتسب هنا — الجلسةُ كاملةٌ
 * أصلا، وجلسةُ المشغّل ترى كلَّ المنظّمات. والكتابةُ تجدّد مهلتَها الثلاثة أيّام.
 */
export async function setActiveOrg(store: SessionStore, session: Session, org: string): Promise<Session> {
  const record: SessionRecord = { ...session.record, org }
  await store.put(sessionKey(session.id), JSON.stringify(record), { expirationTtl: SESSION_TTL_SECONDS })
  return { id: session.id, record }
}

export async function destroySession(store: SessionStore, request: Request): Promise<void> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id !== null) await store.delete(sessionKey(id))
}

export interface SessionSummary {
  /**
   * **بصمةُ الجلسة لا سرُّها** (D-150). كان الجردُ يحمل `id` — وهو قيمةُ
   * الكعكة بعينها — فيُطبَع سرُّ كلِّ جهازٍ آخر في HTML اللوحة وفي `target`
   * سجلِّ التدقيق. البصمةُ ستّةَ عشرَ محرفا لا تُعكَس، وتكفي للإبطال.
   */
  readonly handle: string
  readonly at: string
  readonly ip: string
  readonly ua: string
  readonly via: SessionVia
  readonly current: boolean
}

/**
 * جردُ الجلسات المفتوحة.
 *
 * وُجد لأنّ الخروج كان يقتل جلستك أنت وحدها، فلا سبيل إلى معرفة كم بابا
 * مفتوحٌ ولا إلى إغلاقه. و`list` في KV **متّسقةٌ في النهاية** لا فورا،
 * فقد يظهر صفٌّ حُذف للتوّ — ولذلك يُقرأ كلّ صفٍّ ويُتخطّى ما بطل، فلا
 * يُعرض في الجرد إلا ما هو حيٌّ فعلا.
 */
export async function listSessions(
  store: SessionStore,
  currentId: string | null,
): Promise<SessionSummary[]> {
  if (store.list === undefined) return []
  const summaries: SessionSummary[] = []
  let cursor: string | undefined
  do {
    const page = await store.list({ prefix: PREFIX, cursor: cursor ?? null })
    for (const key of page.keys) {
      const raw = await store.get(key.name)
      if (raw === null) continue
      const record = parse(raw)
      if (record === null) continue
      // الجلسةُ المعلَّقة ليست بابا مفتوحا: لا تُعرض في جرد الأجهزة
      if (record.pending) continue
      const id = key.name.slice(PREFIX.length)
      summaries.push({
        handle: await fingerprint(id),
        at: record.at,
        ip: record.ip,
        ua: record.ua,
        via: record.via,
        current: id === currentId,
      })
    }
    cursor = page.list_complete === false ? page.cursor : undefined
  } while (cursor !== undefined)

  return summaries.sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * يُبطل جلسةً بعينها، أو كلَّ الجلسات.
 *
 * و`keepId` تُبقي الجلسة الحاليّة: مالكٌ يُخرج أجهزته المنسيّة لا يريد أن
 * يُخرج نفسه ويعيد الدخول — وإخراجُه لنفسه معه يجعله يتردّد في الضغط.
 */
export async function revokeSessions(
  store: SessionStore,
  options: { readonly only?: string; readonly onlyHandle?: string; readonly keepId?: string } = {},
): Promise<number> {
  if (options.onlyHandle !== undefined) {
    // الإبطالُ بالبصمة: يُمشى الجردُ حتّى تُطابَق، ولا يُقبَل سرٌّ من النموذج
    if (store.list === undefined) return 0
    let cursor: string | undefined
    do {
      const page = await store.list({ prefix: PREFIX, cursor: cursor ?? null })
      for (const key of page.keys) {
        const id = key.name.slice(PREFIX.length)
        if ((await fingerprint(id)) !== options.onlyHandle) continue
        await store.delete(key.name)
        return 1
      }
      cursor = page.list_complete === false ? page.cursor : undefined
    } while (cursor !== undefined)
    return 0
  }
  if (options.only !== undefined) {
    await store.delete(sessionKey(options.only))
    return 1
  }
  if (store.list === undefined) return 0

  let removed = 0
  let cursor: string | undefined
  do {
    const page = await store.list({ prefix: PREFIX, cursor: cursor ?? null })
    for (const key of page.keys) {
      if (options.keepId !== undefined && key.name === sessionKey(options.keepId)) continue
      await store.delete(key.name)
      removed += 1
    }
    cursor = page.list_complete === false ? page.cursor : undefined
  } while (cursor !== undefined)
  return removed
}

/**
 * يتحقّق من رمز CSRF بمقارنةٍ ثابتة الزمن.
 *
 * و`SameSite=Strict` وحدها كانت الدفاع، وهي قويّة — لكنّها **طبقةٌ واحدة
 * في المتصفّح**، لا في الخادم. ومتصفّحٌ قديم أو استثناءٌ في التطبيق أو
 * تغيّرٌ في تفسير المواصفة يُسقطها كلَّها دفعةً واحدة. والرمزُ في النموذج
 * يفرضه الخادمُ نفسه فلا يسقط بسقوطها.
 */
export async function checkCsrf(session: Session, presented: string): Promise<boolean> {
  if (presented.length === 0) return false
  return await sameSecret(presented, session.record.csrf)
}

/** الكعكة بقيودها. `Path=/` تفرضه بادئةُ `__Host-` نفسها. */
export function sessionCookie(id: string): string {
  return [
    `${COOKIE}=${id}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ')
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}
