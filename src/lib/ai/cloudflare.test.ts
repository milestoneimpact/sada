import { describe, expect, it } from 'vitest'
import { cfAccountId, cfModelsUrl, cfRunUrl } from './cloudflare'

const ACC = 'c6ea7ba30984d494a1a78efea6ddc9a0'
const V1 = `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/v1`
const ROOT = `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai`

describe('يقرأ الحسابَ من العنوان المحفوظ — فلا يُطلَب إدخالُه ثانية', () => {
  it('يقبل عنوانَ لهجة OpenAI كما هو في البطاقة', () => {
    expect(cfAccountId(V1)).toBe(ACC)
  })

  it('ويقبل الجذعَ بلا لاحقة', () => {
    expect(cfAccountId(ROOT)).toBe(ACC)
  })

  it('ويتسامح مع شرطةٍ في آخره', () => {
    expect(cfAccountId(`${V1}/`)).toBe(ACC)
  })
})

describe('وما ليس عنوانَ Cloudflare يُردّ — والاسمُ لا يشهد', () => {
  it('مضيفٌ آخر ليس Cloudflare ولو سُمّي المزوّدُ باسمها', () => {
    expect(cfAccountId('https://api.deepseek.com/v1')).toBeNull()
  })

  it('مضيفٌ يشبهها ولا يساويها', () => {
    expect(cfAccountId(`https://api.cloudflare.com.evil.test/client/v4/accounts/${ACC}/ai/v1`)).toBeNull()
  })

  it('مسارٌ ليس مسارَ Workers AI', () => {
    expect(cfAccountId(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1`)).toBeNull()
  })

  it('و**قالبٌ لم يُملأ ليس معرّفَ حساب** — وإلّا نُودي حسابٌ لا وجود له', () => {
    expect(cfAccountId('https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1')).toBeNull()
  })

  it('وفارغٌ أو معطوبٌ يُردّ بلا رمي', () => {
    expect(cfAccountId('')).toBeNull()
    expect(cfAccountId(null)).toBeNull()
    expect(cfAccountId('ليس عنوانا')).toBeNull()
  })
})

describe('والمساران يُشتقّان من الجذع لا يُكتبان', () => {
  it('الفهرسُ على models/search لا على v1/models', () => {
    const url = cfModelsUrl(ACC)
    expect(url).toContain('/ai/models/search')
    expect(url).not.toContain('/ai/v1/')
  })

  it('والتوليدُ على ai/run — وهي وحدها التي تقبل الصور', () => {
    expect(cfRunUrl(ACC, '@cf/black-forest-labs/flux-1-schnell')).toBe(
      `${ROOT}/run/@cf/black-forest-labs/flux-1-schnell`,
    )
  })
})
