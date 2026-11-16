/**
 * تشخيصُ الوصول (D-376): المستودعُ أوّلًا ثمّ الفرع، وحدُّ المعدّل عابر، والرمزُ لا يدخل سببًا — بـ fetch مزيّف بلا شبكة.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { fixFor, probeAccess, REASONS } from './diagnose'
import { failure } from './github'
import { transientError } from './revision'
import { readSource, saveSource, syncPackage } from './sync'

const REPO = { owner: 'o', repo: 'r', branch: 'b', token: 'ghp_SECRET_TOKEN_VALUE' }

function gh(repo: number, branch: number, headers: Record<string, string> = {}): { calls: string[]; fetch: typeof fetch } {
  const calls: string[] = []
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/branches/')) return new Response('{}', { status: branch, headers })
    if (/\/repos\/o\/r$/.test(url)) return new Response('{}', { status: repo, headers })
    return new Response('', { status: 404 })
  }
  return { calls, fetch: impl as typeof fetch }
}

const bucket = { async head() { return null }, async put() { /* ‏لا شيء */ } }

describe('اختبر الرمز', () => {
  it('404 على المستودع: الرمزُ لا يشمله، ولا نداءَ للفرع، وخطواتٌ مرقّمة', async () => {
    const f = gh(404, 200)
    const p = await probeAccess(REPO, f.fetch)
    expect(p).toMatchObject({ verdict: 'repo', passed: [], reason: REASONS.repo })
    expect(f.calls.filter((u) => !u.endsWith('/user'))).toHaveLength(1)
    expect(p.fix.join(' ')).toContain('Repository access')
    expect(p.fix.join(' ')).toContain('Resource owner')
  })

  it('المستودعُ مقروءٌ والفرعُ 404: اسمُ الفرع خاطئ', async () => {
    const p = await probeAccess(REPO, gh(200, 404).fetch)
    expect(p).toMatchObject({ verdict: 'branch', passed: ['repo'], reason: REASONS.branch })
  })

  it('الخطوتان تنجحان', async () => {
    expect(await probeAccess(REPO, gh(200, 200).fetch)).toMatchObject({ verdict: 'ok', passed: ['repo', 'branch'] })
  })

  it('403 مع x-ratelimit-remaining: 0 حدٌّ عابرٌ يُعاد، و403 بلا ذلك دائم', async () => {
    expect((await probeAccess(REPO, gh(403, 200, { 'x-ratelimit-remaining': '0' }).fetch)).verdict).toBe('rate')
    expect(transientError(failure(new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })))).toBe(true)
    expect(transientError(failure(new Response('', { status: 403 })))).toBe(false)
  })

  it('السببُ لا يحمل الرمز', async () => {
    for (const f of [gh(404, 200), gh(200, 404), gh(401, 200)]) {
      const p = await probeAccess(REPO, f.fetch)
      expect(JSON.stringify(p)).not.toContain('SECRET')
    }
  })

  it('المزامنةُ تكتب السببَ الدقيق لا «المستودع أو الفرع»', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: '' })
    const out = await syncPackage({ db, bucket, token: 't', fetchImpl: gh(200, 404).fetch }, (await readSource(db, 'org_owner'))!)
    expect(out).toEqual({ kind: 'failed', reason: REASONS.branch })
    expect(fixFor((await readSource(db, 'org_owner'))!.error).length).toBeGreaterThan(0)
  })
})

describe('شكلُ المفتاح بلا كشفه', async () => {
  const { tokenShape } = await import('./diagnose')
  it('البادئةُ والطولُ، والعيبُ يُسمّى، ولا حرفَ بعد البادئة', () => {
    const t = 'github_pat_' + 'A'.repeat(82)
    expect(tokenShape(t)).toBe('يبدأ بـ github_pat_ وطوله 93')
    expect(tokenShape(' "' + t + '" ')).toContain('مسافةٌ قبله أو بعده')
    expect(tokenShape(t)).not.toContain('AAAA')
  })
})
