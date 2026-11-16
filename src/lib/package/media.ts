/**
 * نقلُ وسائط الحزمة إلى R2 (D-366) — **بثٌّ لا تجميع، والمفتاحُ من المحتوى**.
 *
 * المفتاحُ `pkg/<org>/<blob_sha>.<ext>`: ملفٌّ نُقل أو أُعيدت تسميتُه بصمتُه نفسُها فلا يُرفع ثانيةً، و`head` يُسأل أوّلًا. وحدودُ
 * الحجم حدودُ وسائط Drive نفسُها (`withinLimit`)، وما تجاوز سقفَ الدفعة يُكمل في رسالة الطابور التالية.
 */
import { withinLimit } from '../drive/media'
import { isLfsPointer, rawFile, type RepoRef } from './github'
import { mimeOf } from './classify'

/** ما يحتاجه النقلُ من الدلو — الدلوُ الحقيقيُّ يوافقه، والاختبارُ يقلّده. */
export interface StreamBucket {
  head(key: string): Promise<unknown>
  /** ‏`value` جسمُ الاستجابة كما هو (بثٌّ)، أو نصٌّ صغير — والنوعُ واسعٌ لأنّ تيّارَ Workers غيرُ تيّار DOM في الأنواع. */
  put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

export function packageKey(org: string, blobSha: string, path: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(path)?.[1]?.toLowerCase() ?? 'bin'
  return `pkg/${org}/${blobSha}.${ext}`
}

export type StoreResult = 'stored' | 'exists' | 'too_big' | 'lfs'

/**
 * ينقل ملفًّا واحدًا: موجودٌ في R2 ← لا شيء. وفوق الحدّ ← لا يُنزَّل. ومؤشّرُ LFS (صغيرٌ وبادئتُه معروفة) ← يُقال ولا يُخزَّن.
 * وما سوى ذلك جسمُ الاستجابة يُمرَّر إلى `put` مباشرةً.
 */
export async function storeBlob(
  bucket: StreamBucket, org: string, repo: RepoRef, commit: string,
  file: { readonly path: string; readonly blobSha: string; readonly size: number; readonly kind: 'video' | 'image' },
  fetchImpl?: typeof fetch,
  /** مجلّدُ الحزمة في المستودع: المسارُ المحفوظ تحته، وGitHub يريده كاملًا من جذر المستودع. */
  root = '',
): Promise<{ readonly result: StoreResult; readonly key: string }> {
  const key = packageKey(org, file.blobSha, file.path)
  const remote = root.replace(/^\/+|\/+$/g, '') === '' ? file.path : root.replace(/^\/+|\/+$/g, '') + '/' + file.path
  if ((await bucket.head(key)) !== null) return { result: 'exists', key }
  if (file.size > 0 && file.size < 1024) {
    const res = await rawFile(repo, remote, commit, fetchImpl)
    const text = await res.text()
    if (isLfsPointer(text)) return { result: 'lfs', key }
    await bucket.put(key, text, { httpMetadata: { contentType: mimeOf(file.path) } })
    return { result: 'stored', key }
  }
  if (!withinLimit(file.kind, file.size)) return { result: 'too_big', key }
  const res = await rawFile(repo, remote, commit, fetchImpl)
  if (res.body === null) return { result: 'too_big', key }
  // ‏R2 لا يقبل جسمًا بلا طولٍ معلوم، وGitHub يبثّ الملفَّ الخامّ مقطَّعًا بلا Content-Length: فيُعلَن الطولُ من الشجرة
  // ‏(FixedLengthStream في Workers)، وإن غاب يُقرأ الملفُّ كلُّه — والمقاطعُ ميغابايتٌ أو اثنان
  const declared = Number(res.headers.get('Content-Length') ?? '')
  const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream<Uint8Array, Uint8Array> }).FixedLengthStream
  const body: ReadableStream | ArrayBuffer = Number.isFinite(declared) && declared > 0 ? res.body
    : Fixed !== undefined && file.size > 0 ? res.body.pipeThrough(new Fixed(file.size)) : await res.arrayBuffer()
  await bucket.put(key, body, { httpMetadata: { contentType: mimeOf(file.path) } })
  return { result: 'stored', key }
}
