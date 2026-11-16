/**
 * عميلُ GitHub للقراءة وحدها (D-366) — **نداءاتٌ مجّانيّة، ولا كتابةَ إلى المستودع أبدًا**.
 *
 * ثلاثُ قراءات: رأسُ الفرع بـ ETag (و304 لا يكلّف شيئًا)، والشجرةُ كلُّها مرّةً واحدة (وإن عادت مقطوعةً `truncated` تُمشى مجلّدًا
 * مجلّدًا من الجذر)، والملفُّ الخامُ جسمًا يُبثّ ولا يُجمع في الذاكرة. **والمهلةُ على كلّ نداءٍ ولو جاء `fetchImpl` من المنادي**. **والرمزُ في الترويسة وحدها**: لا يدخل رسالةَ خطأٍ ولا سجلًّا.
 */
import { withTimeout } from '../net/timeout'
import { underRoot } from './classify'

const API = 'https://api.github.com'

export interface RepoRef {
  readonly owner: string
  readonly repo: string
  readonly branch: string
  readonly token: string
}

export class GitHubError extends Error {
  override readonly name = 'GitHubError'
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** سببٌ تقرؤه المالك من رمز الحالة — بلا رمزٍ ولا عنوان. */
export function statusReason(status: number): string {
  if (status === 401) return 'GitHub ردّ 401: رمز القراءة خاطئٌ أو انتهى'
  if (status === 403) return 'GitHub ردّ 403: الرمز بلا صلاحيّة قراءة المحتوى أو بلغ حدّه'
  if (status === 404) return 'GitHub ردّ 404: المستودع أو الفرع غير مختارٍ في الرمز أو غير موجود'
  return `GitHub ردّ ${status}`
}

/**
 * ردٌّ فاشلٌ خطأً بسببه (D-376) — و403 مع `x-ratelimit-remaining: 0` (أو `retry-after`) **حدُّ معدّلٍ عابر**، لا رمزٌ بلا صلاحيّة:
 * يُحمل على 429 فيُعاد في الدورة التالية.
 */
export function failure(res: Response): GitHubError {
  const limited = (res.status === 403 || res.status === 429) && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('retry-after') !== null)
  if (limited) return new GitHubError(RATE_LIMITED, 429)
  return new GitHubError(statusReason(res.status), res.status)
}

export const RATE_LIMITED = 'GitHub أوقف القراءة مؤقّتًا: بلغ الرمزُ حدَّ الطلبات في الساعة — تُعاد المزامنة وحدها بعد انقضائه'

function headers(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sada-package-sync' }
}

const seg = (s: string): string => encodeURIComponent(s)
const repoPath = (r: RepoRef): string => `${API}/repos/${seg(r.owner)}/${seg(r.repo)}`

export type BranchHead =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'head'; readonly sha: string; readonly treeSha: string; readonly etag: string | null }

/** رأسُ الفرع: الالتزامُ وشجرتُه — و`If-None-Match` بآخر ETag يجعل الفحصَ الساعيّ 304 بلا كلفة. */
export async function branchHead(r: RepoRef, etag: string | null, fetchImpl: typeof fetch = withTimeout(fetch, 20_000)): Promise<BranchHead> {
  const call = withTimeout(fetchImpl, 20_000)
  const h = headers(r.token)
  if (etag !== null && etag !== '') h['If-None-Match'] = etag
  const res = await call(`${repoPath(r)}/branches/${seg(r.branch)}`, { headers: h })
  if (res.status === 304) return { kind: 'unchanged' }
  if (!res.ok) throw failure(res)
  const body = (await res.json()) as { commit?: { sha?: unknown; commit?: { tree?: { sha?: unknown } } } }
  const sha = body.commit?.sha
  const treeSha = body.commit?.commit?.tree?.sha
  if (typeof sha !== 'string' || typeof treeSha !== 'string') throw new GitHubError('GitHub ردّ بفرعٍ بلا التزام', 502)
  return { kind: 'head', sha, treeSha, etag: res.headers.get('ETag') }
}

export interface TreeBlob {
  /** المسارُ تحت المجلّد الجذر. */
  readonly path: string
  readonly sha: string
  readonly size: number
}

interface RawTree {
  truncated?: unknown
  tree?: { path?: unknown; type?: unknown; sha?: unknown; size?: unknown }[]
}

async function readTree(r: RepoRef, sha: string, recursive: boolean, call: typeof fetch): Promise<RawTree> {
  const res = await call(`${repoPath(r)}/git/trees/${seg(sha)}${recursive ? '?recursive=1' : ''}`, { headers: headers(r.token) })
  if (!res.ok) throw failure(res)
  return (await res.json()) as RawTree
}

/**
 * ملفّاتُ المجلّد الجذر من شجرة الالتزام — **نداءٌ واحد** بـ `recursive=1`، وإن قُطع (مستودعٌ كبير) تُمشى الشجرةُ مستوًى مستوًى
 * لا تنزل إلا فيما يقع على طريق الجذر أو تحته. والسقفُ `limit` ملفًّا.
 */
export async function listTree(r: RepoRef, treeSha: string, root: string, limit: number, fetchImpl: typeof fetch = withTimeout(fetch, 30_000)): Promise<TreeBlob[]> {
  const call = withTimeout(fetchImpl, 30_000)
  const whole = await readTree(r, treeSha, true, call)
  if (whole.truncated !== true) {
    const out: TreeBlob[] = []
    for (const e of whole.tree ?? []) {
      if (e.type !== 'blob' || typeof e.path !== 'string' || typeof e.sha !== 'string') continue
      const rel = underRoot(e.path, root)
      if (rel !== null) out.push({ path: rel, sha: e.sha, size: Number(e.size ?? 0) || 0 })
      if (out.length >= limit) break
    }
    return out
  }
  const want = root.replace(/^\/+|\/+$/g, '')
  const out: TreeBlob[] = []
  const queue: { sha: string; prefix: string }[] = [{ sha: treeSha, prefix: '' }]
  for (let calls = 0; queue.length > 0 && out.length < limit && calls < 200; calls += 1) {
    const at = queue.shift()!
    for (const e of (await readTree(r, at.sha, false, call)).tree ?? []) {
      if (typeof e.path !== 'string' || typeof e.sha !== 'string') continue
      const full = at.prefix === '' ? e.path : `${at.prefix}/${e.path}`
      const inside = want === '' || full === want || full.startsWith(want + '/')
      if (e.type === 'tree' && (inside || want.startsWith(full + '/'))) queue.push({ sha: e.sha, prefix: full })
      if (e.type !== 'blob' || !inside) continue
      const rel = underRoot(full, want)
      if (rel !== null) out.push({ path: rel, sha: e.sha, size: Number(e.size ?? 0) || 0 })
      if (out.length >= limit) break
    }
  }
  return out
}

/** الملفُّ خامًا بالتزامه — الجسمُ يُبثّ كما هو إلى R2، ولا يُقرأ هنا. */
export async function rawFile(r: RepoRef, path: string, ref: string, fetchImpl: typeof fetch = withTimeout(fetch, 120_000)): Promise<Response> {
  const p = path.split('/').map(seg).join('/')
  const res = await withTimeout(fetchImpl, 120_000)(`${repoPath(r)}/contents/${p}?ref=${seg(ref)}`, { headers: headers(r.token, 'application/vnd.github.raw') })
  if (!res.ok) throw failure(res)
  return res
}

/** ملفُّ مؤشّر Git LFS بدل البايتات: صغيرٌ ويبدأ بسطر النسخة. */
export function isLfsPointer(head: string): boolean {
  return head.startsWith('version https://git-lfs')
}

export interface CommitInfo { readonly sha: string; readonly parent: string | null; readonly message: string }

/** رسالةُ الالتزام وأبوه — لسجلّ المراجعات. نداءٌ مجّانيّ واحد، وعطلُه لا يمنع المراجعة. */
export async function commitInfo(r: RepoRef, sha: string, fetchImpl: typeof fetch = withTimeout(fetch, 20_000)): Promise<CommitInfo | null> {
  const res = await withTimeout(fetchImpl, 20_000)(`${repoPath(r)}/commits/${seg(sha)}`, { headers: headers(r.token) }).catch(() => null)
  if (res === null || !res.ok) return null
  const body = (await res.json().catch(() => ({}))) as { parents?: { sha?: unknown }[]; commit?: { message?: unknown } }
  const parent = body.parents?.[0]?.sha
  const message = body.commit?.message
  return { sha, parent: typeof parent === 'string' ? parent : null, message: typeof message === 'string' ? message.split('\n')[0]!.slice(0, 200) : '' }
}
