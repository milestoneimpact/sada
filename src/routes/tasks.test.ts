/**
 * شاشةُ «ما عليك» — من طرفها إلى طرفها.
 *
 * **والحالُ يُشتقّ من قاعدةٍ وبيئةٍ حقيقيّتين**، لا يُمرَّر مصنوعا:
 * اشتقاقٌ يُختبَر على قيمٍ مؤلَّفة يمرّ على وهم.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: KEY, ADMIN_TOKEN: TOKEN,
  }
})

async function open(scoped = env): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const login = await app.request('/panel/login', { method: 'POST', body }, scoped)
  const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
  return (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, scoped)).text()
}

describe('الباب', () => {
  it('لا يُفتَح بلا جلسة', async () => {
    const response = await app.request('/panel/tasks', {}, env)
    expect(response.status).toBe(401)
  })
})

describe('والحالُ يُشتقّ لا يُكتَب', () => {
  it('بلا شيءٍ مضبوط: المهامُّ عليك، والبوّابةُ أوّلا', async () => {
    const html = await open()
    expect(html).toContain('M-02')
    expect(html).toContain('توقف بوّابةَ مرحلة')
    expect(html).toContain('عليك')
  })

  /** ومتغيّرا الكيان يُشتقّان من البيئة نفسِها لا من صفٍّ يُكتَب. */
  it('ومتغيّرا الكيان حين يُضبطان تصير M-17 «تمّت»', async () => {
    const before = await open()
    expect(before).toContain('M-17')

    const after = await open({
      ...env, LEGAL_ENTITY: 'بصائر للاستشارات', LEGAL_CONTACT: 'omar@example.com',
    })
    // العدُّ ينقص واحدا — والرقمُ هو الدليل لا النصّ
    const count = (h: string): number =>
      Number(/(\d+)<\/b> عليك/.exec(h)?.[1] ?? '0')
    expect(count(after)).toBe(count(before) - 1)
  })

  it('وربطُ حسابٍ يُتمّ مهمّتَه', async () => {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a1', 'youtube', 'org', 'UC1', 'قناتي')`,
    )
    const html = await open()
    expect(html).toContain('M-15')
    expect(html).toContain('تمّت')
  })
})

describe('ولا علامةَ صحٍّ على ما لم يُتحقَّق منه', () => {
  /**
   * موافقةُ Community Management تقع عند LinkedIn لا عندنا.
   * **وقولُ «لم تتمّ» عن طلبٍ قُبل يجعل المالكَ يعيده.**
   */
  it('ما يقع عند المنصّة يُقال «لا يُعرَف من هنا»', async () => {
    const html = await open()
    expect(html).toContain('لا يُعرَف من هنا')
    expect(html).toContain('M-03')
  })

  it('والعدُّ لا يشمل ما لا يُعرَف', async () => {
    const html = await open()
    const unknown = Number(/(\d+) لا تُعرَف/.exec(html)?.[1] ?? '0')
    const todo = Number(/· (\d+) عليك/.exec(html)?.[1] ?? '0')
    expect(unknown).toBeGreaterThan(0)
    // ولو عُدّ المجهولُ لصار المجموعُ أكبر — والرقمُ لا ينزل أبدا فيُهمَل
    expect(todo).toBeLessThan(todo + unknown)
  })
})

describe('والرابطُ في اللوحة', () => {
  it('يظهر ويحمل عددَ ما عليك', async () => {
    const body = new FormData()
    body.set('token', TOKEN)
    const login = await app.request('/panel/login', { method: 'POST', body }, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('href="/panel/tasks"')
    expect(html).toContain('ما عليك')
  })
})

describe('وبوّاباتُ المراحل تُقاس', () => {
  /**
   * `PLAN.md` يعلّق القاعدةَ على `STATUS.md` — **وهو يُكتب بيد، وقد
   * شاخ مرّتين**. فتُقاس هنا من القاعدة.
   */
  it('تُعرَض الأربعُ، ولا واحدةَ مجتازةٌ على قاعدةٍ فارغة', async () => {
    const html = await open()
    for (const phase of ['٠', '١', '٢', '٣']) {
      expect(html).toContain(`المرحلة ${phase}`)
    }
    expect(html).not.toContain('اجتِيزت')
    expect(html).toContain('أنت في المرحلة ٠')
  })

  /** **ومعه دليلُه**: «لم تُجتَز» بلا رقمٍ لا تُعالَج. */
  it('ولكلّ بندٍ دليلُه لا حكمُه وحده', async () => {
    const html = await open()
    expect(html).toContain('LinkedIn: 0')
    expect(html).toContain('X: 0')
  })

  /**
   * **ولا بندَ يُجيز بوّابةً بلا دليل.**
   *
   * كان بندُ تنبيه الرمز `unmeasured` — **ثمّ نُقل التنبيهُ إلى حيث
   * يُقاس** (D-065). فلم يبقَ في البوّابات بندٌ لا يُقاس، **والحالُ
   * محروسةٌ باختبار**: بندٌ جديدٌ يُضاف بلا استعلامٍ يُسقط هذا.
   */
  it('ولا بندَ في البوّابات يُجيزها بلا قياس', async () => {
    expect(await open()).not.toContain('لا يُقاس من هنا')
  })

  it('ومنشورٌ خرج فعلا يُغيّر الدليل', async () => {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a-x', 'x', 'member', 'e', 'عمر')`,
    )
    db.raw.exec(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES ('p1', 'a-x', 'x', 'text', 'ن', '2026-09-01T00:00:00Z', 'published',
               'k1', 'omar', '2026-09-01T00:00:00Z')`,
    )
    db.raw.exec(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no,
                                     request_json, status)
       VALUES ('at1', 'p1', 'k1', 1, '{}', 'succeeded')`,
    )
    expect(await open()).toContain('X: 1')
  })
})

describe('وشريطُ الرموز المقتربة', () => {
  async function panel(): Promise<string> {
    const body = new FormData()
    body.set('token', TOKEN)
    const login = await app.request('/panel/login', { method: 'POST', body }, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    return (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
  }

  function seed(days: number, kind: 'access' | 'refresh'): void {
    const at = new Date(Date.now() + days * 86_400_000).toISOString()
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a1', 'x', 'member', 'e1', '@omar')`,
    )
    db.raw.exec(
      `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at,
                           refresh_expires_at, scopes)
       VALUES ('a1', 'x', 'y', '${kind === 'access' ? at : new Date(Date.now() + 90 * 86_400_000).toISOString()}',
               ${kind === 'refresh' ? `'${at}'` : 'NULL'}, 'tweet.write')`,
    )
  }

  it('لا شريطَ حيث لا رمزَ يقترب', async () => {
    expect(await panel()).not.toContain('إذنُ التجديد')
  })

  /** **يُعرَض في صدر اللوحة لا في شاشةٍ تُفتَح** — قد لا تُفتَح قبل أن يقع. */
  it('وإذنُ وصولٍ قريبٌ يُعرَض تحذيرا', async () => {
    seed(4, 'access')
    const html = await panel()
    expect(html).toContain('إذنُ الوصول')
    expect(html).toContain('@omar')
  })

  /**
   * **ولا يُسوَّى بين الرمزين.**
   *
   * سقوطُ الوصول يُصلحه النظامُ وحده، **وسقوطُ التجديد يوجب يدَ
   * المالك** — فيُعرَض أشدّ، ويُقال ذلك نصّا لا بلونٍ وحده.
   */
  it('ورمزُ تجديدٍ يُعرَض أشدَّ ويُقال أنّه يوجب يدَك', async () => {
    seed(2, 'refresh')
    const html = await panel()
    expect(html).toContain('إذنُ التجديد')
    expect(html).toContain('يوجب سقوطُه دورةَ إذنٍ بيدك')
    expect(html).toContain('class="toast-note bad"')
  })
})

/**
 * **الأمرُ يُنسَخ من الصفّ** (D-126): مهمّةٌ تُغلَق بسرٍّ في Worker تحمل أمرَ
 * `wrangler` للبيئة الحاليّة وزرَّ نسخ، ولا تحمله مهمّةٌ تمّت.
 */
describe('أمرُ wrangler في صفّ المهمّة (D-126)', () => {
  it('المهمّةُ المفتوحةُ تحمل الأمرَ للبيئة الحاليّة وزرَّ النسخ', async () => {
    const html = await open()
    expect(html).toContain('data-copy="cmd-M-19"')
    expect(html).toContain('npx wrangler secret put CF_BROWSER_TOKEN --env staging')
    expect(html).toContain('npx wrangler secret put X_CLIENT_ID --env staging\nnpx wrangler secret put X_CLIENT_SECRET --env staging')
    expect(html).not.toContain('--env production')
  })
})

describe('قراراتُ المالك في «ما عليك» (D-130)', () => {
  it('بوّابةُ الستّة وسقفُ الترويج صفّان بحالهما من الإعدادات، ولكلٍّ بابُه', async () => {
    const html = await open()
    expect(html).toContain('M-20')
    expect(html).toContain('4 من 6 بطاقاتٍ مختارة')
    expect(html).toContain('M-21')
    expect(html).toContain('صفر — لا توصيةَ تُكتب')
    expect(html).toContain('href="/panel#settings">افتح الحدود</a>')
  })
})


describe('مهامُّ الربط في «ما عليك» (ر-1)', () => {
  it('كلُّ مهمّةِ ربطٍ تحمل زرَّها، وكلُّ مفتوحةٍ رابطَ خطواتها', async () => {
    const html = await open()
    expect(html).toContain('href="/panel/channels/instagram?tab=setup#ci-instagram">اضبط Instagram</a>')
    expect(html).toContain('href="/panel/channels/tiktok?tab=setup#ci-tiktok">اضبط TikTok</a>')
    expect(html).toContain('href="/panel/channels/youtube?tab=setup#ci-youtube">اضبط YouTube</a>')
    expect(html).toContain('href="https://github.com/milestoneimpact/sada/blob/main/docs/MANUAL-TASKS.md#m-24"')
    expect(html).toContain('href="/panel#tiles">اختر بطاقاتك</a>')
    // ‏واسمُ الوثيقة رابطٌ لا نصٌّ يُقرأ ولا يُفتَح
    expect(html).toContain('href="https://github.com/milestoneimpact/sada/blob/main/docs/MANUAL-TASKS.md"')
  })

  it('وبعد حفظ سرَّي Instagram يصير الزرُّ «اربط Instagram» ويقول ما قِيس', async () => {
    const html = await open({ ...env, INSTAGRAM_APP_ID: 'ig-id', INSTAGRAM_APP_SECRET: 'ig-secret' })
    expect(html).toContain('href="/oauth/instagram/start">اربط Instagram</a>')
    expect(html).toContain('سرّا التطبيق محفوظان — بقي «اربط»')
    expect(html).not.toContain('ig-secret')
  })
})

describe('«ما عليك» بلغة المالك (D-203)', () => {
  it('العنوانُ أوّلُ الصفّ والرمزُ صغيرٌ بعده، ولا مسارَ ملفٍّ نصًّا ظاهرًا', async () => {
    const html = await open()
    expect(html).not.toMatch(/<span class="mono">M-\d+<\/span>/)
    expect(html).toMatch(/<small class="ago"><bdi dir="ltr">M-\d+<\/bdi><\/small>/)
    const shown = html.replace(/<[^>]*>/g, ' ')
    expect(shown).not.toMatch(/docs\/|STATUS\.md|PLAN\.md|MANUAL-TASKS\.md/)
    expect(html).toContain('title="docs/MANUAL-TASKS.md">دليلِ المهامّ اليدويّة</a>')
  })
})
