/**
 * قراءة Google Drive بحساب خدمة (Service Account).
 *
 * لا OAuth بشري هنا: المالك يشارك مجلدا واحدا مع بريد حساب الخدمة، فيقرأه
 * النظام بلا تدخل. وهذا يعني أيضا أن نطاق الوصول محدود بما شُورك، لا بكل
 * ما في Drive المالك — وهو المقصود.
 *
 * الرمز يُصنع بـ JWT موقّع بمفتاح الحساب (RS256)، ويُبدّل برمز وصول عمره
 * ساعة. لا مكتبة: Web Crypto يكفي، وإضافة اعتمادية إلى Worker ثمنها حجم.
 */

export class DriveError extends Error {
  override readonly name = 'DriveError'
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** ما يلزم من `GOOGLE_SA_JSON`. البقية تُتجاهل. */
export interface ServiceAccount {
  readonly client_email: string
  readonly private_key: string
}

export interface DriveFile {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  /** بصمة Drive للمحتوى. تتغير بتغير الملف — وهي أساس «ما تغيّر فقط». */
  readonly contentHash: string
  readonly modifiedTime: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

const encoder = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new DriveError('GOOGLE_SA_JSON ليس JSON صالحا', 500)
  }
  const sa = parsed as Partial<ServiceAccount>
  if (typeof sa.client_email !== 'string' || sa.client_email.length === 0) {
    throw new DriveError('GOOGLE_SA_JSON بلا client_email', 500)
  }
  if (typeof sa.private_key !== 'string' || !sa.private_key.includes('PRIVATE KEY')) {
    throw new DriveError('GOOGLE_SA_JSON بلا private_key صالح', 500)
  }
  return { client_email: sa.client_email, private_key: sa.private_key }
}

/** يحوّل مفتاح PEM إلى مفتاح توقيع RS256. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    raw as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/**
 * يبني JWT موقّعا ويبدّله برمز وصول.
 *
 * `exp` ساعة واحدة — أقصى ما تقبله Google. ولا يُخزَّن الرمز في D1: عمره
 * أقصر من أن يستحق التشفير والقراءة، ويُطلب عند الحاجة.
 */
export async function accessToken(
  sa: ServiceAccount,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000)
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = b64url(
    encoder.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    ),
  )
  const signingInput = `${header}.${claims}`
  const key = await importPrivateKey(sa.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  )
  const jwt = `${signingInput}.${b64url(new Uint8Array(signature))}`

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!response.ok) {
    let code = 'unknown'
    try {
      const failure = (await response.json()) as { error?: unknown }
      if (typeof failure.error === 'string') code = failure.error
    } catch {
      code = 'unparsable'
    }
    throw new DriveError(`google: رفض إصدار الرمز (${code})`, response.status)
  }
  const body = (await response.json()) as { access_token?: unknown }
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new DriveError('google: استجابة بلا access_token', 502)
  }
  return body.access_token
}

interface RawFile {
  id?: unknown
  name?: unknown
  mimeType?: unknown
  md5Checksum?: unknown
  modifiedTime?: unknown
  version?: unknown
}

interface ListResponse {
  files?: RawFile[]
  nextPageToken?: unknown
}

/**
 * بصمة المحتوى.
 *
 * `md5Checksum` غير موجود لملفات Google الأصلية (مستند، جدول، عرض) —
 * تلك لا تحمل بايتات في Drive. فيُستعمل `version` بديلا، وهو يتغير مع كل
 * تعديل. والمهم أن تتغير البصمة حين يتغير الملف، لا أن تكون md5 بعينه.
 */
function hashOf(file: RawFile): string {
  if (typeof file.md5Checksum === 'string' && file.md5Checksum.length > 0) {
    return `md5:${file.md5Checksum}`
  }
  const version = typeof file.version === 'string' ? file.version : '0'
  const modified = typeof file.modifiedTime === 'string' ? file.modifiedTime : ''
  return `ver:${version}:${modified}`
}

/**
 * يسرد ملفات مجلد واحد. لا يتجاوز المجلدات الفرعية عمدا في v1: عمق واحد
 * يجعل نطاق ما يقرأه النظام مفهوما للمالك بنظرة.
 *
 * يتبع الصفحات حتى تنتهي، بسقف يمنع دورة لا تنتهي على مجلد ضخم.
 */
export async function listFolder(
  token: string,
  folderId: string,
  fetchImpl: typeof fetch = fetch,
  maxPages = 20,
): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(FILES_URL)
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`)
    url.searchParams.set(
      'fields',
      'nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, version)',
    )
    url.searchParams.set('pageSize', '100')
    if (pageToken !== undefined) url.searchParams.set('pageToken', pageToken)

    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new DriveError(`drive: تعذّر سرد المجلد`, response.status)
    }
    const body = (await response.json()) as ListResponse

    for (const raw of body.files ?? []) {
      if (typeof raw.id !== 'string' || typeof raw.name !== 'string') continue
      // المجلدات الفرعية تُتجاهل، لا تُتبع
      if (raw.mimeType === 'application/vnd.google-apps.folder') continue
      files.push({
        id: raw.id,
        name: raw.name,
        mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'application/octet-stream',
        contentHash: hashOf(raw),
        modifiedTime: typeof raw.modifiedTime === 'string' ? raw.modifiedTime : '',
      })
    }

    if (typeof body.nextPageToken !== 'string' || body.nextPageToken.length === 0) {
      return files
    }
    pageToken = body.nextPageToken
  }

  throw new DriveError(`drive: المجلد تجاوز ${maxPages} صفحة — نطاق أوسع من المقصود`, 400)
}
