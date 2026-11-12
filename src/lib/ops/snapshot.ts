/**
 * ‏**صيغةُ النسخة الاحتياطيّة** (D-321) — ملفٌّ واحدٌ يكتبه الـ Worker ويقرؤه تمرينُ الاسترجاع (`scripts/restore_drill.mjs`).
 *
 * ## لماذا ملفٌّ بلا استيراد
 *
 * ‏صيغتان تُكتبان مرّتين تفترقان بعد شهر: يكتب الـ Worker نسخةً لا يفتحها التمرين، ولا يُعرَف ذلك إلّا يومَ الحاجة إليها.
 * ‏فالكتابةُ والقراءةُ هنا معًا، **ولا `import` في الملفّ**: Node يحمله كما هو بمحو الأنواع (`node scripts/restore_drill.mjs`)، والـ
 * ‏Worker يحمله بالحزمة. وما فيه من واجهاتٍ (WebCrypto و`CompressionStream` و`TextEncoder`) واحدٌ في الاثنين.
 *
 * ## الصيغة (`v: 1`)
 *
 * ```
 * 0      8           12            12+H        12+H+12
 * │SADASNP1│ H (uint32 BE) │ رأسٌ JSON (H بايت) │ iv (12) │ نصٌّ مشفَّر + وسمُ GCM │
 * ```
 *
 * - **الرأسُ مقروءٌ بلا مفتاح**: متى، وأيُّ بيئة، وأيُّ مفتاحٍ يفتحها (`kid` — ثمانيةُ محارف من بصمةٍ لا تُعكَس، كمعرّف D-318)،
 *   والجداولُ بعدد صفوفها، والترحيلاتُ المطبَّقةُ ساعتَها. **ولا قيمةَ فيه**: أسماءٌ وأعداد.
 * - **والرأسُ مربوطٌ بالنصّ** (AAD = البايتاتُ من الأوّل إلى آخر الرأس): رأسٌ يُعدَّل — عددٌ أو جدولٌ أو `kid` — يُسقط فكَّ التشفير.
 * - **والمتنُ** `gzip(JSON)` لصفوف كلّ جدولٍ بأعمدتها، ثمّ AES-256-GCM بمفتاحٍ مشتقٍّ بـ HKDF-SHA256 من `TOKEN_ENC_KEY`
 *   (`info = backup-v1`، والملحُ `sada:backup:v1`). مفتاحٌ مشتقٌّ لا الخامُ نفسُه: نسخةٌ تتسرّب لا تعطي مفتاحَ الرموز، ورموزٌ تتسرّب
 *   لا تعطي مفتاحَ النسخة.
 * - **والأعمدةُ المشفَّرةُ تبقى كما هي** (`tokens.access_enc` وأخواتُه): تُنسَخ نصًّا مشفَّرًا، ثمّ يُشفَّر الملفُّ كلُّه فوقها. فلا
 *   رمزَ يظهر في النسخة مقروءًا ولو فُكّ الملفّ، ولا يُفكّ بها رمزٌ بلا `TOKEN_ENC_KEY` نفسِه.
 */

export const SNAPSHOT_MAGIC = 'SADASNP1'
export const SNAPSHOT_INFO = 'backup-v1'
const SNAPSHOT_SALT = 'sada:backup:v1'
const KEY_BYTES = 32
const IV_BYTES = 12
const HEAD_AT = 12

export interface SnapshotTable {
  readonly name: string
  readonly rows: number
}

export interface SnapshotHeader {
  readonly format: 'sada-snapshot'
  readonly v: 1
  readonly at: string
  readonly env: string
  readonly kid: string
  readonly tables: readonly SnapshotTable[]
  readonly rows: number
  /** الترحيلاتُ المطبَّقةُ ساعةَ النسخ (`d1_migrations`)، و`null` حين لا جدولَ لها (قاعدةٌ لم تُرحَّل بـ wrangler). */
  readonly migrations: readonly string[] | null
  readonly cipher: 'AES-256-GCM'
  readonly kdf: 'HKDF-SHA256'
  readonly info: typeof SNAPSHOT_INFO
  readonly compression: 'gzip'
}

export interface SnapshotPayload {
  readonly tables: Readonly<Record<string, { readonly columns: readonly string[]; readonly rows: readonly (readonly unknown[])[] }>>
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function rawKey(material: string): Uint8Array {
  let binary: string
  try {
    binary = atob(material.trim())
  } catch {
    throw new SnapshotError('المفتاحُ ليس base64')
  }
  if (binary.length !== KEY_BYTES) throw new SnapshotError(`المفتاحُ يجب أن يكون ${KEY_BYTES} بايتًا، ووُجد ${binary.length}`)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

/** ‏معرّفُ المفتاح كما يحسبه `keyId` في `crypto.ts` (D-318) — ويُقارَن به في الاختبار، فلا يفترقان. */
export async function snapshotKid(material: string): Promise<string> {
  const raw = rawKey(material)
  const label = encoder.encode('sada:key-id:v2:')
  const joined = new Uint8Array(label.byteLength + raw.byteLength)
  joined.set(label, 0)
  joined.set(raw, label.byteLength)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', joined as BufferSource))
  return Array.from(hash.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** ‏مفتاحُ النسخة: HKDF-SHA256 من `TOKEN_ENC_KEY` بـ `info = backup-v1`. */
export async function snapshotKey(material: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', rawKey(material) as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(SNAPSHOT_SALT) as BufferSource, info: encoder.encode(SNAPSHOT_INFO) as BufferSource },
    base,
    { name: 'AES-GCM', length: KEY_BYTES * 8 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Response(bytes as BodyInit).body
  if (body === null) return new Uint8Array(0)
  return new Uint8Array(await new Response(body.pipeThrough(stream)).arrayBuffer())
}

function toB64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** ‏خليّةٌ ثنائيّةٌ (BLOB) تُكتب `{"$b64": …}`، وما سواها كما ردّته القاعدة. */
export function encodeCell(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return { $b64: toB64(new Uint8Array(value)) }
  if (ArrayBuffer.isView(value)) return { $b64: toB64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) }
  return value
}

/** يكتب النسخة: الرأسُ مقروءًا ومربوطًا، والمتنُ مضغوطًا مشفَّرًا. */
export async function encodeSnapshot(
  material: string,
  meta: { readonly at: string; readonly env: string; readonly migrations: readonly string[] | null },
  payload: SnapshotPayload,
): Promise<{ readonly bytes: Uint8Array; readonly header: SnapshotHeader }> {
  const tables = Object.entries(payload.tables).map(([name, t]) => ({ name, rows: t.rows.length }))
  const header: SnapshotHeader = {
    format: 'sada-snapshot', v: 1, at: meta.at, env: meta.env, kid: await snapshotKid(material),
    tables, rows: tables.reduce((n, t) => n + t.rows, 0), migrations: meta.migrations,
    cipher: 'AES-256-GCM', kdf: 'HKDF-SHA256', info: SNAPSHOT_INFO, compression: 'gzip',
  }
  const head = encoder.encode(JSON.stringify(header))
  const prefix = new Uint8Array(HEAD_AT + head.byteLength)
  prefix.set(encoder.encode(SNAPSHOT_MAGIC), 0)
  new DataView(prefix.buffer).setUint32(8, head.byteLength)
  prefix.set(head, HEAD_AT)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const packed = await through(encoder.encode(JSON.stringify(payload)), new CompressionStream('gzip'))
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: prefix as BufferSource }, await snapshotKey(material), packed as BufferSource,
  ))
  const bytes = new Uint8Array(prefix.byteLength + IV_BYTES + sealed.byteLength)
  bytes.set(prefix, 0)
  bytes.set(iv, prefix.byteLength)
  bytes.set(sealed, prefix.byteLength + IV_BYTES)
  return { bytes, header }
}

/** يقرأ الرأسَ وحدَه بلا مفتاح — ليقول التمرينُ أيَّ مفتاحٍ يلزم قبل أن يحاول. */
export function readSnapshotHeader(bytes: Uint8Array): { readonly header: SnapshotHeader; readonly end: number } {
  if (bytes.byteLength < HEAD_AT || decoder.decode(bytes.slice(0, 8)) !== SNAPSHOT_MAGIC) {
    throw new SnapshotError('ليس ملفَّ نسخةٍ من صدى (البادئةُ ليست SADASNP1)')
  }
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8)
  const end = HEAD_AT + size
  if (end + IV_BYTES > bytes.byteLength) throw new SnapshotError('الملفُّ مبتور: الرأسُ أطولُ من الملفّ')
  let header: SnapshotHeader
  try {
    header = JSON.parse(decoder.decode(bytes.slice(HEAD_AT, end))) as SnapshotHeader
  } catch {
    throw new SnapshotError('رأسُ النسخة ليس JSON')
  }
  if (header.format !== 'sada-snapshot' || header.v !== 1) throw new SnapshotError(`صيغةٌ لا تُعرَف: ${String(header.format)} v${String(header.v)}`)
  return { header, end }
}

/**
 * ‏يفكّ النسخة بأوّل مفتاحٍ يطابق `kid` رأسِها — الحاليّ ثمّ السابق في التدوير (D-318) — ويتحقّق أنّ عددَ كلّ جدولٍ في المتن هو
 * ‏ما في الرأس. ويرمي `SnapshotError` بسببٍ مسمّى، ولا يعيد نصفَ نسخة.
 */
export async function decodeSnapshot(
  bytes: Uint8Array,
  materials: readonly string[],
): Promise<{ readonly header: SnapshotHeader; readonly payload: SnapshotPayload }> {
  const { header, end } = readSnapshotHeader(bytes)
  let material: string | undefined
  for (const m of materials) {
    if (m.trim() === '') continue
    if ((await snapshotKid(m)) === header.kid) { material = m; break }
  }
  if (material === undefined) {
    throw new SnapshotError(`لا مفتاحَ معطًى يطابق المفتاحَ الذي شُفّرت به (kid ${header.kid}) — أهو TOKEN_ENC_KEY قبل تدويرٍ؟`)
  }
  let packed: Uint8Array
  try {
    packed = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(end, end + IV_BYTES) as BufferSource, additionalData: bytes.slice(0, end) as BufferSource },
      await snapshotKey(material),
      bytes.slice(end + IV_BYTES) as BufferSource,
    ))
  } catch {
    throw new SnapshotError('فكُّ التشفير سقط: الملفُّ أو رأسُه عُبث به، أو بُتر')
  }
  const payload = JSON.parse(decoder.decode(await through(packed, new DecompressionStream('gzip')))) as SnapshotPayload
  for (const t of header.tables) {
    const got = payload.tables[t.name]?.rows.length
    if (got !== t.rows) throw new SnapshotError(`«${t.name}»: في الرأس ${t.rows} صفًّا وفي المتن ${String(got)}`)
  }
  return { header, payload }
}
