/**
 * فحصُ الزوج.
 *
 * **والأجوبةُ هنا منسوخةٌ من LinkedIn حرفا** — نُوديت نهايةُ الرمز
 * فعلا وسُجّل ما عاد. ولا سطرَ مؤلَّف: صياغةٌ نخترعها تجعل الاختبارَ
 * يمرّ على وهمٍ لا على منصّة (D-054).
 */
import { describe, expect, it } from 'vitest'
import { PROBE_UNAVAILABLE, verifyAppCredentials } from './verify'
import { LINKEDIN, TIKTOK, X, YOUTUBE } from './providers'

const CREDS = { clientId: 'the-id', clientSecret: 'the-secret' }

/** ما عاد من LinkedIn حرفا بحرف عند القياس. */
const REAL = {
  badSecret: { error: 'invalid_client', error_description: 'Client authentication failed' },
  badId: {
    error: 'invalid_client_id',
    error_description: 'The passed in client_id is invalid "0000nosuchapp0000"',
  },
  /** وهذا ما يعود على مسار الرمز — وهو ما أسقط الفرضيّة الأولى. */
  codeFirst: {
    error: 'invalid_request',
    error_description: 'Unable to retrieve access token: authorization code not found',
  },
  /**
   * **وهذا ما كان يُقرأ جوازا ساعاتٍ** (D-076 · D-077).
   *
   * خطأُ منتَجٍ لا خطأُ توثيق: يعود بالنصّ نفسِه **لأيّ سرّ**، صحيحا
   * كان أو خاطئا — فلا يميّز شيئا. نُسخ من لوحة المالك حرفا.
   */
  noAppTokens: {
    error: 'access_denied',
    error_description: 'This application is not allowed to create application tokens',
  },
} as const

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

describe('ما قِيس من LinkedIn', () => {
  it('«Client authentication failed» تعني أنّ السرَّ هو الخطأ', async () => {
    const out = await verifyAppCredentials(LINKEDIN, CREDS, reply(REAL.badSecret, 401).fetch)
    expect(out.kind).toBe('bad_secret')
    if (out.kind !== 'bad_secret') return
    expect(out.description).toBe('Client authentication failed')
  })

  /**
   * **والفرقُ بين الحقلين يُقال، لا يُترك للمالك أن يفتّش فيهما معا.**
   */
  it('و«invalid_client_id» تعني أنّ المعرّفَ هو الخطأ', async () => {
    const out = await verifyAppCredentials(LINKEDIN, CREDS, reply(REAL.badId, 400).fetch)
    expect(out.kind).toBe('bad_client_id')
  })

  it('ونجاحٌ يعني أنّ الزوجَ جاز — ولا يُقرأ الجسدُ فيه', async () => {
    const { fetch } = reply({ access_token: 'APP-TOKEN-NOT-OURS' }, 200)
    const out = await verifyAppCredentials(LINKEDIN, CREDS, fetch)
    expect(out.kind).toBe('accepted')
    expect(JSON.stringify(out)).not.toContain('APP-TOKEN-NOT-OURS')
  })

  /**
   * **الفرضيّةُ الأولى سقطت بالقياس.**
   *
   * كان الفحصُ يرسل رمزا باطلا اتّكالا على ترتيب RFC 6749 §5.2. وقياسُ
   * LinkedIn أعطى هذا الجوابَ **سواءٌ صحَّ السرُّ أم لم يصحّ** — فهو
   * يفحص الرمزَ أوّلا. واختبارٌ يثبّت أنّ ذلك الجوابَ **لا يُقرأ
   * جوازا**، فلا يعود أحدٌ إلى ذلك المسار ظانّا أنّه يميّز.
   */
  it('وجوابُ مسارِ الرمز لا يُقرأ حكما على الزوج', async () => {
    const out = await verifyAppCredentials(LINKEDIN, CREDS, reply(REAL.codeFirst).fetch)
    /*
     * **واسمُ هذا الاختبار كان أصدقَ من توكيده** (D-076).
     *
     * يقول «لا يُقرأ حكما»، وكان يوكّد `accepted` — **وهو حكمٌ**، بل
     * أخطرُ الأحكام: خُضرةٌ تصرف المالكَ عن موضع العطب. فصار «لا
     * يُعرَف» كما يقول اسمُه.
     */
    expect(out.kind).toBe('inconclusive')
    if (out.kind !== 'inconclusive') return
    expect(out.detail).toContain('invalid_request')
  })
})

describe('وخطأُ المنتَج يُسمَّى ولا يُقرأ جوازا', () => {
  /**
   * **الجوابُ الذي كلّف الليلة.** كان يُصنَّف `accepted` بالاستدلال،
   * فتخضرّ الخطوةُ على سرٍّ ترفضه المنصّةُ في منحة الرمز.
   */
  it('«لا يملك منحةَ رموز التطبيقات» لا يُعدّ جوازا', async () => {
    const out = await verifyAppCredentials(LINKEDIN, CREDS, reply(REAL.noAppTokens, 403).fetch)
    expect(out.kind).toBe('inconclusive')
  })

  /** **ويُقال معناه** — لا يُعرَض نصٌّ خامٌ يُترَك تفسيرُه للمالك. */
  it('ويُقال للمالك أنّه ليس عيبا في زوجه', async () => {
    const out = await verifyAppCredentials(LINKEDIN, CREDS, reply(REAL.noAppTokens, 403).fetch)
    if (out.kind !== 'inconclusive') return
    expect(out.detail).toContain('رموز التطبيقات')
    expect(out.detail).toContain('نجاحُ الربط')
  })
})

describe('وما لم يُقَس لا يُدَّعى', () => {
  /** Google مقيسٌ أنّه يردّ الصيغةَ قبل التوثيق — فلا يُنادى أصلا. */
  it('لا فحصَ لـ YouTube، ويُقال السبب', async () => {
    const dead = (async () => { throw new Error('يجب ألّا يُنادى') }) as unknown as typeof fetch
    const out = await verifyAppCredentials(YOUTUBE, CREDS, dead)
    expect(out.kind).toBe('unsupported')
    if (out.kind !== 'unsupported') return
    expect(out.detail).toContain('unsupported_grant_type')
    expect(PROBE_UNAVAILABLE.youtube).toBeDefined()
  })

  it('وعطلُ شبكةٍ ليس حكما على الزوج', async () => {
    const dead = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect((await verifyAppCredentials(LINKEDIN, CREDS, dead)).kind).toBe('inconclusive')
  })

  it('وجوابٌ ليس JSON لا يُفسَّر', async () => {
    const html = (async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch
    expect((await verifyAppCredentials(LINKEDIN, CREDS, html)).kind).toBe('inconclusive')
  })

  it('وجوابٌ بلا رمزِ خطأٍ لا يُفسَّر', async () => {
    expect((await verifyAppCredentials(LINKEDIN, CREDS, reply({ msg: 'x' }).fetch)).kind)
      .toBe('inconclusive')
  })
})

describe('وما يُرسَل', () => {
  /** **لا منحةَ تُفحَص، فلا يبقى إلّا التوثيق** — وهي كلُّ الفكرة. */
  it('client_credentials لا authorization_code', async () => {
    const { fetch, seen } = reply(REAL.badSecret, 401)
    await verifyAppCredentials(LINKEDIN, CREDS, fetch)
    const body = new URLSearchParams(String(seen[0]!.body))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('code')).toBeNull()
    expect(body.get('code_verifier')).toBeNull()
  })

  it('ويحترم صيغةَ التوثيق عند كلّ مزوّد', async () => {
    const basic = reply(REAL.badSecret, 401)
    await verifyAppCredentials(X, CREDS, basic.fetch)
    expect((basic.seen[0]!.headers as Record<string, string>)['Authorization'])
      .toContain('Basic ')
    // ولا يُكرَّر السرُّ في الجسد حين يكون في الترويسة (D-005)
    expect(String(basic.seen[0]!.body)).not.toContain('the-secret')

    const tik = reply(REAL.badSecret, 401)
    await verifyAppCredentials(TIKTOK, CREDS, tik.fetch)
    const body = new URLSearchParams(String(tik.seen[0]!.body))
    expect(body.get('client_key')).toBe('the-id')
    expect(body.get('client_id')).toBeNull()
  })
})
