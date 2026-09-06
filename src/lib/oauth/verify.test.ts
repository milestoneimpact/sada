/**
 * فحصُ الزوج — **والاختبارُ يحرس الترتيبَ الذي قام عليه كلُّه.**
 */
import { describe, expect, it } from 'vitest'
import { PROBE_CODE, verifyAppCredentials } from './verify'
import { LINKEDIN, TIKTOK, X } from './providers'

const CREDS = { clientId: 'the-id', clientSecret: 'the-secret' }
const CB = 'https://sada2.basserh.com/oauth/linkedin/callback'

function reply(body: unknown, status = 400): { fetch: typeof fetch; seen: RequestInit[] } {
  const seen: RequestInit[] = []
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    seen.push(init ?? {})
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { fetch: impl, seen }
}

describe('الترتيبُ في المعيار هو الحيلة', () => {
  /**
   * RFC 6749 §5.2: **التوثيقُ قبل المنحة.** فرمزٌ باطلٌ يُردّ بـ
   * `invalid_grant` **يثبت أنّ الزوجَ جاز** — وهو ما لا يُعرَف بغير
   * هذا الفحص إلّا بدورةِ إذنٍ كاملة.
   */
  it('`invalid_grant` تعني أنّ الزوجَ سليم', async () => {
    const { fetch } = reply({ error: 'invalid_grant', error_description: 'code expired' })
    const out = await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)
    expect(out.kind).toBe('accepted')
    if (out.kind !== 'accepted') return
    expect(out.description).toBe('code expired')
  })

  it('و`invalid_client` تعني أنّ الزوجَ مرفوض — وهو الجوابُ الحاسم', async () => {
    const { fetch } = reply({ error: 'invalid_client' })
    expect((await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)).kind).toBe('rejected')
  })

  it('و`unauthorized_client` كذلك', async () => {
    const { fetch } = reply({ error: 'unauthorized_client' })
    expect((await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)).kind).toBe('rejected')
  })

  /** وأيُّ خطأٍ آخرَ وصل بعد التوثيق — فالتوثيقُ جاز. */
  it('وخطأٌ آخرُ يُعدّ جوازا لا رفضا', async () => {
    for (const error of ['invalid_request', 'invalid_grant', 'unsupported_grant_type']) {
      const { fetch } = reply({ error })
      expect((await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)).kind).toBe('accepted')
    }
  })
})

describe('ولا يُدَّعى حكمٌ بلا دليل', () => {
  it('عطلُ شبكةٍ ليس حكما على الزوج', async () => {
    const dead = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect((await verifyAppCredentials(LINKEDIN, CREDS, CB, dead)).kind).toBe('inconclusive')
  })

  it('وجوابٌ ليس JSON لا يُفسَّر', async () => {
    const html = (async () =>
      new Response('<html>', { status: 502 })) as unknown as typeof fetch
    expect((await verifyAppCredentials(LINKEDIN, CREDS, CB, html)).kind).toBe('inconclusive')
  })

  it('وجوابٌ بلا رمزِ خطأٍ لا يُفسَّر', async () => {
    const { fetch } = reply({ message: 'something' })
    expect((await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)).kind).toBe('inconclusive')
  })

  /**
   * **٢٠٠ على رمزٍ باطلٍ خطأٌ برمجيّ لا نجاح** — ولا يُقرأ الجسدُ فيه
   * لئلّا يُخزَّن رمزٌ وصل من طريقٍ لم يُقصَد.
   */
  it('ونجاحٌ على رمزٍ باطلٍ لا يُعدّ جوازا', async () => {
    const { fetch } = reply({ access_token: 'SHOULD-NEVER-HAPPEN' }, 200)
    const out = await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)
    expect(out.kind).toBe('inconclusive')
    expect(JSON.stringify(out)).not.toContain('SHOULD-NEVER-HAPPEN')
  })
})

describe('وما يُرسَل', () => {
  it('رمزٌ لا يمكن أن يكون منحةً صالحة', async () => {
    const { fetch, seen } = reply({ error: 'invalid_grant' })
    await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)
    const body = new URLSearchParams(String(seen[0]!.body))
    expect(body.get('code')).toBe(PROBE_CODE)
    expect(PROBE_CODE).toContain('not-a-real-grant')
  })

  it('ولا `code_verifier`: الفحصُ يسأل عن الزوج وحده', async () => {
    const { fetch, seen } = reply({ error: 'invalid_grant' })
    await verifyAppCredentials(LINKEDIN, CREDS, CB, fetch)
    expect(String(seen[0]!.body)).not.toContain('code_verifier')
  })

  /** واختلافُ المزوّدين محفوظ: Basic لـ X، و`client_key` لـ TikTok. */
  it('ويحترم صيغةَ التوثيق عند كلّ مزوّد', async () => {
    const basic = reply({ error: 'invalid_grant' })
    await verifyAppCredentials(X, CREDS, CB, basic.fetch)
    const headers = basic.seen[0]!.headers as Record<string, string>
    expect(headers['Authorization']).toContain('Basic ')
    // ولا يُكرَّر السرُّ في الجسد حين يكون في الترويسة (D-005)
    expect(String(basic.seen[0]!.body)).not.toContain('the-secret')

    const tik = reply({ error: 'invalid_grant' })
    await verifyAppCredentials(TIKTOK, CREDS, CB, tik.fetch)
    const body = new URLSearchParams(String(tik.seen[0]!.body))
    expect(body.get('client_key')).toBe('the-id')
    expect(body.get('client_id')).toBeNull()
  })
})
