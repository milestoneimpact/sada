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
import { RETENTION } from '../lib/privacy/retention'
import { counted, NOUNS } from '../lib/format'
import { RETENTION_DAYS as VITALS_DAYS } from '../lib/vitals'
import { UNDO_SECONDS } from '../lib/privacy/trash'
import { CODE_TTL_SECONDS } from '../lib/security/loginCode'

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

/**
 * ‏**السياسةُ تقول ما يقع** (D-322). كانت تقول «ليس لصدى مستخدمون» وله فريقٌ وعملاء، و«خلف عاملين» والعاملُ اختياريٌّ لبعض
 * ‏الأدوار، و«حتّى يحذفها المشغّل» أربعَ مرّاتٍ ولا بابَ يحذف، ولا تسمّي خدمةَ كتابةٍ واحدةً ولا مدّة.
 */
describe('سياسةٌ صادقة (D-322)', () => {
  it('لا تقول ما لم يعد صحيحًا', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    for (const stale of ['وليس لصدى مستخدمون', 'خلف عاملين', 'حتّى يحذفها المشغّل', 'يشغّلها شخص واحد']) expect(html).not.toContain(stale)
  })

  /*
   * ‏**مراجعة D-322**: «لا يخرج منشور إلّا بعد أن يعتمده المشغّل بيده» بقيت في «ما لا يقع» و«ويعتمده بيده» في صفّ المنشورات، والناشرُ
   * ‏المدعوُّ يعتمد ويجدول (D-272 · `access.ts`)؛ و«حين يؤكّده المشغّل» في الفصل، والمديرُ يفصل. والإنجليزيّةُ وحدَها صُحّحت.
   */
  it('**ومن يعتمد ويفصل كما في الشيفرة**: المشغّلُ أو ناشرٌ من فريقه، والمشغّلُ أو مديرٌ — في السياسة والشروط', async () => {
    const policy = (await (await app.request('/privacy', {}, env())).text()).replace(/\s+/g, ' ')
    const terms = (await (await app.request('/terms', {}, env())).text()).replace(/\s+/g, ' ')
    for (const stale of ['يعتمده المشغّل بيده', 'يكتبه المشغّل، ويعتمده بيده', 'وحين يؤكّده المشغّل يقع', 'المشغّل ويعتمده بيده']) {
      expect(policy, stale).not.toContain(stale)
      expect(terms, stale).not.toContain(stale)
    }
    expect(terms).not.toContain('until the owner reads and approves it')
    expect(policy).toContain('المشغّل أو ناشرٌ من فريقه')
    expect(policy).toContain('المشغّل أو مديرٌ من فريقه')
    expect(terms).toContain('المشغّل أو ناشرٌ من فريقه')
  })

  it('تسمّي من يدخل ومن يعالج: الفريقَ والعملاء، وكلَّ خدمة كتابةٍ وصور، وCloudflare وDrive والبريد', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    for (const name of ['أعضاءُ فريقٍ', 'عملائه', 'Anthropic', 'Gemini', 'OpenAI', 'Workers AI', 'Drive API', 'Email Routing', 'قناة التنبيهات', 'خارج المملكة']) {
      expect(html, name).toContain(name)
    }
  })

  /*
   * ‏**مراجعة D-322**: كان الاختبارُ يسأل عن الرقم وحده، و90 و180 يقعان مرّتين (الصندوقُ و«إرسالٌ رُدّ»، والصندوقُ والأذونات)، فحذفُ جملةٍ
   * ‏كاملة لا يُسقطه؛ والإنجليزيّةُ تُسأل عن مدّةٍ واحدة وقد سقطت منها اثنتان. فلكلّ مدّةٍ جملتُها في اللغتين — **والنوعُ يُلزم مفتاحًا
   * ‏يُضاف إلى `RETENTION` بجملتيه**.
   */
  it('**وكلُّ مدّةٍ في الكنّاس مكتوبةٌ بجملتها** — بالعربيّة والإنجليزيّة، ومعها ثوابتُها الثلاثة', async () => {
    const html = (await (await app.request('/privacy', {}, env())).text()).replace(/\s+/g, ' ')
    const d = (n: number): string => counted(n, NOUNS.day, 'gen')
    const r = RETENTION
    const ar: Record<keyof typeof RETENTION, string> = {
      auditDays: `سجلّ النشاط بعد ${d(r.auditDays)}`,
      ipDays: `يُقصَّر إلى شبكته بعد ${d(r.ipDays)}`,
      formRejectDays: `و«إرسالٌ رُدّ» بعد ${d(r.formRejectDays)}`,
      outboxDeliveredDays: `ما وصل بعد ${d(r.outboxDeliveredDays)}`,
      outboxUndeliveredDays: `وما لم يصل بعد ${d(r.outboxUndeliveredDays)}`,
      tokenAlertDays: `وتنبيهات الأذونات بعد ${d(r.tokenAlertDays)}`,
      authAttemptDays: `وعدّادات الدخول بعد ${d(r.authAttemptDays)}`,
    }
    const en: Record<keyof typeof RETENTION, string> = {
      auditDays: `the activity log after ${r.auditDays} days`,
      ipDays: `to their network after ${r.ipDays} days`,
      formRejectDays: `rejected form submissions after ${r.formRejectDays} days`,
      outboxDeliveredDays: `delivered alerts after ${r.outboxDeliveredDays} days`,
      outboxUndeliveredDays: `undelivered ones after ${r.outboxUndeliveredDays} days`,
      tokenAlertDays: `token-expiry alerts after ${r.tokenAlertDays} days`,
      authAttemptDays: `login-attempt counters after ${r.authAttemptDays} days`,
    }
    for (const key of Object.keys(RETENTION) as (keyof typeof RETENTION)[]) {
      expect(html, 'ar ' + key).toContain(ar[key])
      expect(html, 'en ' + key).toContain(en[key])
    }
    // ‏والثوابتُ الثلاثة: عيّناتُ السرعة، ومهلةُ «تراجَع»، ورمزُ الدخول
    expect(html).toContain(`عيّنات سرعة الصفحات تُمحى بعد ${d(VITALS_DAYS)}`)
    expect(html).toContain(`speed samples (no identity) are kept ${VITALS_DAYS} days`)
    expect(html).toContain(`"Undo" for ${Math.round(UNDO_SECONDS / 60)} minutes`)
    expect(html).toContain(`KV, ${Math.round(CODE_TTL_SECONDS / 60)} minutes`)
    expect(html).toContain('Time Travel')
  })

  it('وتقول كيف يُحذف كلُّ شيءٍ ويُصدَّر، وما لا يُحذف وحدَه ولماذا', async () => {
    const html = await (await app.request('/privacy', {}, env())).text()
    for (const how of ['احذفها', 'احذف المقطع', '«صدّر»', 'احذف عميلًا وبياناته', 'تراجَع', 'يمنع نشره', 'دفترُ الكلفة']) expect(html, how).toContain(how)
  })
})
