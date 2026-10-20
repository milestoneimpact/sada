/**
 * الوثيقتان العامّتان.
 *
 * ما يُختبَر هنا **شرطُ المراجعة لا الجمال**: أنّ الرابط يفتح بلا جلسة،
 * وأنّه يُفهرَس، وأنّه لا يخترع بريدا لا وجود له. ورابطٌ يطلب دخولا
 * يُسقط طلبَ LinkedIn في سطرٍ واحد.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { scopeSet } from '../lib/oauth/scopes'

let db: FakeDb

function env(extra: Record<string, string> = {}): Record<string, unknown> {
  return {
    SADA_ENV: 'staging',
    DB: db,
    KV: fakeKv(),
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    ADMIN_TOKEN: 'token-for-tests-0001',
    TOKEN_ENC_KEY: 'k'.repeat(43),
    ...extra,
  }
}

beforeEach(() => {
  db = fakeDb()
})

describe('يفتحان بلا جلسة — وهو شرط المراجعة', () => {
  for (const path of ['/privacy', '/terms']) {
    it(`${path} يردّ 200 لزائر بلا كعكة`, async () => {
      const response = await app.request(path, {}, env())
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')
      // ولا كعكةَ تُزرع: صفحةٌ تُقرأ لا تتبع قارئها
      expect(response.headers.get('Set-Cookie')).toBeNull()
    })
  }
})

describe('تُفهرَسان — بخلاف اللوحة', () => {
  it('السياسة تسمح بالفهرسة', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).toContain('name="robots" content="index,follow"')
  })

  it('واللوحة تمنعها — فالاستثناء مقصور على ما يُقرأ من الخارج', async () => {
    const html = await (await app.request('/panel', {}, env())).text()
    expect(html).toContain('noindex,nofollow')
  })
})

describe('تُخزَّنان مؤقّتا ولا تُمنعان من التأطير', () => {
  it('السياسة قابلة للتخزين', async () => {
    const response = await app.request('/privacy', {}, env())
    expect(response.headers.get('Cache-Control')).toContain('public')
    expect(response.headers.get('X-Frame-Options')).toBeNull()
    expect(response.headers.get('Content-Security-Policy')).toContain('frame-ancestors *')
  })

  it('واللوحة لا — no-store و DENY كما كانتا', async () => {
    const response = await app.request('/panel', {}, env())
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
  })
})

describe('لا تخترع ما لم يُضبَط', () => {
  it('بلا LEGAL_CONTACT لا يظهر بريد إطلاقا', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).not.toContain('mailto:')
    expect(html).toContain('لم يُضبط بريد تواصل بعد')
  })

  it('وحين يُضبَط يظهر كما هو', async () => {
    const html = await (
      await app.request('/privacy', {}, env({ LEGAL_CONTACT: 'privacy@basserh.com', LEGAL_ENTITY: 'بصائر' }))
    ).text()
    expect(html).toContain('mailto:privacy@basserh.com')
    expect(html).toContain('بصائر')
  })

  it('اسم جهة يحمل HTML يُهرَب ولا يُحقَن', async () => {
    const html = await (
      await app.request('/privacy', {}, env({ LEGAL_ENTITY: '<img src=x onerror=alert(1)>' }))
    ).text()
    expect(html).not.toContain('<img src=x onerror')
  })
})

describe('تصفان ما يقع فعلا', () => {
  it('تسمّيان النطاقات المطلوبة من المنصّتين بأسمائها', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).toContain('w_member_social')
    expect(html).toContain('tweet.write')
  })

  /*
   * ‏**ومراجعةُ YouTube وTikTok تقرأ السياسةَ قبل الطلب** (D-190 · M-28 · M-29): سياسةٌ تقول
   * ‏«LinkedIn و X» وحدهما وصدى يرفع مقاطعَ إلى YouTube وTikTok وInstagram تُسقط الطلبَ كلَّه.
   * ‏وشروطُ YouTube توجب: ذكرَ خدماتها، ورابطَي شروطها وسياسة Google، وصفحةَ سحب الإذن.
   */
  it('تذكران منصّات المقاطع ونطاقاتِها، وشروط YouTube وسياسة Google وسحب الإذن', async () => {
    const privacy = await (await app.request('/privacy', {}, env())).text()
    for (const scope of ['youtube.upload', 'video.publish', 'video.upload']) expect(privacy).toContain(scope)
    expect(privacy).toContain('YouTube API')
    expect(privacy).toContain('href="https://www.youtube.com/t/terms"')
    expect(privacy).toContain('href="https://policies.google.com/privacy"')
    expect(privacy).toContain('href="https://security.google.com/settings/security/permissions"')
    expect(privacy).toContain('Cloudflare R2')
    const terms = await (await app.request('/terms', {}, env())).text()
    expect(terms).toContain('href="https://www.youtube.com/t/terms"')
  })

  /*
   * ‏**وكلُّ نطاقٍ يُطلب مسمًّى في السياسة** (مراجعة D-190): «أضيقَ ما يكفي» ثمّ سطرُ X بلا
   * ‏`media.write` الذي يُطلب فعلًا — والمراجعون يقارنون الطلبَ بالسياسة. فيُقرأ من `scopeSet`
   * ‏نفسِه، فلا يفترقان في أوّل نطاقٍ يُضاف.
   */
  it('كلّ نطاق تطلبه صدى من كلّ منصّة مسمًّى فيها باسمه', async () => {
    const privacy = await (await app.request('/privacy', {}, env())).text()
    for (const platform of ['linkedin', 'x', 'youtube', 'tiktok', 'instagram'] as const) {
      for (const scope of scopeSet(platform)) {
        expect(privacy, `${platform}: ${scope}`).toContain(scope.replace('https://www.googleapis.com/auth/', ''))
      }
    }
  })

  it('وتعدّ حسابات المشغّل بلا مثنّى بعد خمس منصّات، ونصوص المقطع في KV صفًّا بمدّتها', async () => {
    const privacy = await (await app.request('/privacy', {}, env())).text()
    expect(privacy).not.toContain('وحسابَيه')
    expect(privacy).toContain('وحساباته على المنصّات التي يربطها')
    const row = privacy.slice(privacy.indexOf('وصف المقطع والنصوص المكتوبة له'))
    expect(row).toContain('Cloudflare KV')
    expect(row).toContain('يوم واحد من آخر حفظ')
  })

  it('تقولان إنّ الرموز مشفّرة — وهو ما تفعله الشيفرة (D-005)', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).toContain('AES-GCM')
  })

  it('**وتقولان إنّ بيانات المنصّة لا تصل إلى مزوّد الذكاء** — وهو صحيح', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).toContain('ولا يرون حسابَه ولا رمزَه')
  })

  it('ولا تعدان بنشر آليّ — والقاعدة نفسها ترفضه (D-009)', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).toContain('لا نشر آليّ')
  })

  it('ولا تسرّبان كلمة الإدارة', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    expect(html).not.toContain('token-for-tests-0001')
  })
})

/**
 * علّةٌ وقعت فعلا: كُتب `**نصّ**` داخل قالب HTML فظهرت النجومُ حرفا في
 * الصفحة. ولا اختبارَ محتوًى يمسكها — النصُّ موجودٌ والاختبارُ يجده —
 * فيُفحَص **شكلُ المخرَج** لا وجودُ الكلمة.
 */
describe('لا Markdown في مخرَج HTML', () => {
  for (const path of ['/privacy', '/terms']) {
    it(`${path} لا يحمل نجوما ولا شرطات قوائم حرفيّة`, async () => {
      const html = await (await app.request(path, {}, env())).text()
      const body = html.slice(html.indexOf('<body>'))
      expect(body).not.toMatch(/\*\*/)
      expect(body).not.toMatch(/^\s*[-*] /m)
    })
  }
})

describe('كلّ تصل إلى الأخرى', () => {
  it('السياسة تشير إلى الشروط والعكس', async () => {
    expect(await (await app.request('/privacy', {}, env())).text()).toContain('href="/terms"')
    expect(await (await app.request('/terms', {}, env())).text()).toContain('href="/privacy"')
  })
})
