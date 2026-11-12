/**
 * شاشةُ «ما عليك» — من طرفها إلى طرفها.
 *
 * **والحالُ يُشتقّ من قاعدةٍ وبيئةٍ حقيقيّتين**، لا يُمرَّر مصنوعا:
 * اشتقاقٌ يُختبَر على قيمٍ مؤلَّفة يمرّ على وهم.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { OWNER_TASKS } from '../lib/owner'

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

async function open(scoped = env, path = '/panel/tasks'): Promise<string> {
  const login = await emailLogin(app, scoped)
  const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
  return (await app.request(path, { headers: { Cookie: cookie } }, scoped)).text()
}

/** ‏شاشةُ «بوّابات المراحل» (دمجُ D-318 مع D-324): خرجت من «ما عليك» إلى صفحتها. */
const gates = (scoped = env): Promise<string> => open(scoped, '/panel/gates')
/** ‏وشاشةُ «تفتح قدرة» (متابعة D-324): مهامُّ القدرة خرجت من «ما عليك» إلى صفحتها، وما يوقف أو يحرس بقي. */
const later = (scoped = env): Promise<string> => open(scoped, '/panel/tasks/later')
/** ‏العددُ في رأس الصفحة («<b>N</b> عليك») — والرقمُ هو الدليل لا النصّ. */
const ledeCount = (h: string): number => Number(/(\d+)<\/b> عليك/.exec(h)?.[1] ?? '0')
/** ‏والعددُ في سطر «تفتح قدرة» على «ما عليك». */
const laterCount = (h: string): number => Number(/href="\/panel\/tasks\/later">تفتح قدرة<\/a> · (\d+) عليك/.exec(h)?.[1] ?? '0')
/** ‏والعددُ في رقاقة القائمة («N تمّت · N عليك · N لا تُعرَف») — لا أوّلُ «· N عليك» في الصفحة، فسطرُ «تفتح قدرة» قبلها. */
const chipCount = (h: string): number => Number(/<span class="chip">\d+ تمّت · (\d+) عليك/.exec(h)?.[1] ?? '-1')
/** ‏رموزُ المهامّ المرسومة في الصفحة، معلّقةً أو مطويّةً فيما تمّ. */
const codesIn = (h: string): string[] => [...h.matchAll(/<bdi dir="ltr">(M-\d+)<\/bdi><\/small>/g)].map((m) => m[1]!)

describe('الباب', () => {
  it('لا يُفتَح بلا جلسة', async () => {
    const response = await app.request('/panel/tasks', {}, env)
    expect(response.status).toBe(401)
  })

  it('ولا بابُ البوّابات', async () => {
    expect((await app.request('/panel/gates', {}, env)).status).toBe(401)
  })

  it('ولا بابُ «تفتح قدرة»', async () => {
    expect((await app.request('/panel/tasks/later', {}, env)).status).toBe(401)
  })

  /**
   * ‏**والبابان بدورٍ واحد** (`requiredRole`): البوّاباتُ كانت طيّةً في «ما عليك» فلا يراها إلّا من يرى «ما عليك».
   * ‏وبابُها الجديد لا يُفتح لمن دونه، ولا يُغلق على من فوقه.
   */
  it('والبوّاباتُ و«تفتح قدرة» لمن يرى «ما عليك» وحدَه: الناشرُ يُردّ عن الأبواب الثلاثة، والمديرُ يفتحها', async () => {
    const member = async (email: string, role: 'admin' | 'publisher'): Promise<string> => {
      db.raw.prepare("INSERT INTO members (email, role, orgs, invited_by) VALUES (?, ?, '*', 'owner')").run(email, role)
      const res = await emailLogin(app, env, { email })
      expect(res.status, `دخول ${email}`).toBe(303)
      return (res.headers.get('Set-Cookie') ?? '').split(';')[0]!
    }
    const publisher = await member('p@example.com', 'publisher')
    const admin = await member('a@example.com', 'admin')
    for (const path of ['/panel/tasks', '/panel/gates', '/panel/tasks/later']) {
      const denied = await app.request(path, { headers: { Cookie: publisher } }, env)
      expect(denied.status, path).toBe(303)
      expect(denied.headers.get('Location'), path).toBe('/panel')
      expect((await app.request(path, { headers: { Cookie: admin } }, env)).status, path).toBe(200)
    }
  })
})

describe('والحال يُشتقّ لا يُكتَب', () => {
  it('بلا شيء مضبوط: المهامّ عليك، والبوّابة أوّلا', async () => {
    const html = await open()
    expect(html).toContain('M-02')
    expect(html).toContain('توقف بوّابة مرحلة')
    expect(html).toContain('عليك')
  })

  /**
   * ومتغيّرا الكيان يُشتقّان من البيئة نفسِها لا من صفٍّ يُكتَب. **وM-17 قدرةٌ**، فعدُّها في «تفتح قدرة» وفي سطرها على
   * «ما عليك» (متابعة D-324)، ورأسُ «ما عليك» لا يتبدّل: يعدّ ما يوقف أو يحرس وحدَه.
   */
  it('ومتغيّرا الكيان حين يُضبطان تصير M-17 «تمّت»', async () => {
    const legal = { ...env, LEGAL_ENTITY: 'بصائر للاستشارات', LEGAL_CONTACT: 'omar@example.com' }
    const before = await later()
    expect(before).toContain('M-17')
    const after = await later(legal)
    expect(ledeCount(after)).toBe(ledeCount(before) - 1)

    const tasksBefore = await open()
    const tasksAfter = await open(legal)
    expect(laterCount(tasksAfter)).toBe(laterCount(tasksBefore) - 1)
    expect(ledeCount(tasksAfter)).toBe(ledeCount(tasksBefore))
  })

  it('وربط حساب يُتمّ مهمّتَه', async () => {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a1', 'youtube', 'org', 'UC1', 'قناتي')`,
    )
    // ‏وربطُ YouTube قدرةٌ: في «تفتح قدرة»، وفي طيّة ما تمّ منها
    const html = await later()
    const done = html.slice(html.indexOf('<details class="setup mt-3">'))
    expect(done).toContain('<summary>تمّت (1)</summary>')
    expect(done).toContain('M-15')
  })
})

describe('ولا علامة صحّ على ما لم يُتحقَّق منه', () => {
  /**
   * موافقةُ Community Management تقع عند LinkedIn لا عندنا.
   * **وقولُ «لم تتمّ» عن طلبٍ قُبل يجعل المالكَ يعيده.**
   */
  it('ما يقع عند المنصّة يُقال «لا يُعرَف من هنا»', async () => {
    // ‏وموافقةُ Community Management قدرةٌ: في «تفتح قدرة» (متابعة D-324)
    const html = await later()
    expect(html).toContain('لا يُعرَف من هنا')
    expect(html).toContain('M-03')
  })

  it('والعدّ لا يشمل ما لا يُعرَف — في الصفحتين', async () => {
    for (const html of [await open(), await later()]) {
      const unknown = Number(/(\d+) لا تُعرَف/.exec(html)?.[1] ?? '0')
      const todo = chipCount(html)
      expect(unknown).toBeGreaterThan(0)
      // ولو عُدّ المجهولُ لصار المجموعُ أكبر — والرقمُ لا ينزل أبدا فيُهمَل
      expect(todo).toBeLessThan(todo + unknown)
      // ‏والرأسُ يعدّ ما في الرقاقة نفسَه: ما عليك في هذه الصفحة
      expect(ledeCount(html)).toBe(todo)
    }
  })
})

describe('والرابط في اللوحة', () => {
  it('يظهر ويحمل عدد ما عليك', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('href="/panel/tasks"')
    expect(html).toContain('ما عليك')
  })
})

describe('وبوّابات المراحل تُقاس', () => {
  /**
   * `PLAN.md` يعلّق القاعدةَ على `STATUS.md` — **وهو يُكتب بيد، وقد
   * شاخ مرّتين**. فتُقاس هنا من القاعدة.
   */
  it('تُعرَض الأربع، ولا واحدة مجتازة على قاعدة فارغة', async () => {
    const html = await gates()
    for (const phase of ['0', '1', '2', '3']) {
      expect(html).toContain(`<h2>المرحلة ${phase} · `)
    }
    expect(html).not.toContain('اجتِيزت')
    expect(html).toContain('أنت في المرحلة 0')
  })

  /** **ومعه دليلُه**: «لم تُجتَز» بلا رقمٍ لا تُعالَج. */
  it('ولكلّ بند دليلُه لا حكمُه وحده', async () => {
    const html = await gates()
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
  it('ولا بند في البوّابات يُجيزها بلا قياس', async () => {
    expect(await gates()).not.toContain('لا يُقاس من هنا')
  })

  it('ومنشور خرج فعلا يُغيّر الدليل', async () => {
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
    expect(await gates()).toContain('X: 1')
  })
})

/**
 * ‏**البوّاباتُ صفحتُها، و«ما عليك» يحيل إليها بسطر** (دمجُ D-318 مع D-324): مهامُّ القرارين الأربعُ (M-39 إلى M-42)
 * ‏رفعت «ما عليك» فوق سقفه (‏14.2KB من ‏14KB مضغوطًا)، والحارسُ يقول «يُقسَم أو يُؤجَّل ولا يُرفع السقف». فخرجت البوّاباتُ،
 * ‏وهي لغةُ خطّة المشروع لا سؤالُ اليوم، إلى `/panel/gates`.
 */
describe('صفحة البوّابات وسطرُها في «ما عليك»', () => {
  it('«ما عليك» يحمل سطرًا إليها يقول المرحلة، ولا يحمل بطاقاتها', async () => {
    const html = await open()
    expect(html).toContain('href="/panel/gates"')
    expect(html).toContain('أنت في المرحلة 0')
    expect(html).not.toMatch(/<h2>المرحلة \d · /)
    expect(html).not.toContain('LinkedIn: 0')
    expect(html).not.toContain('<details class="setup mt-6">')
  })

  it('وصفحتُها صفحةٌ من اللوحة: عنوانُها، وعودتُها إلى «ما عليك»، وموضعُها في الرافدة', async () => {
    const html = await gates()
    expect(html).toContain('<title>صدى — بوّابات المراحل</title>')
    expect(html).toContain('<h1>بوّابات المراحل</h1>')
    const back = /<nav class="back"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    expect(back).toContain('href="/panel/tasks"')
    expect(back).toContain('ما عليك')
    expect(html).toContain('href="/panel/tasks" aria-current="page"')
    expect(html).toContain('cmdk-open')
    // ‏والشرحُ مرّةً فوق البطاقات، لا في كلّ بطاقة
    expect(html.match(/تُقاس من القاعدة لا تُكتَب في وثيقة/g)).toHaveLength(1)
  })
})

/**
 * ‏**ما يفتح قدرةً صفحتُه، و«ما عليك» يحيل إليها بسطرٍ يعدّ** (متابعة D-324): كانت «ما عليك» ‏14.0KB مضغوطًا والسقفُ ‏14KB،
 * ‏ومهامُّ D-321 وD-322 قادمة؛ وD-324 كتب قاعدةَ العبور التالي: تُقسَم القائمةُ بنوعها. فبقي ما يوقف مرحلةً أو يحرس،
 * ‏وخرج ما يفتح قدرةً إلى `/panel/tasks/later`.
 */
describe('«تفتح قدرة» صفحتُها، وسطرُها في «ما عليك»', () => {
  it('كلُّ مهمّةٍ في صفحة نوعها مرّةً، ولا تسقط واحدة', async () => {
    const tasks = codesIn(await open())
    const capability = codesIn(await later())
    for (const t of OWNER_TASKS) {
      const [here, there] = t.unblocks === 'capability' ? [capability, tasks] : [tasks, capability]
      expect(here.filter((c) => c === t.code), t.code).toHaveLength(1)
      expect(there, t.code).not.toContain(t.code)
    }
    expect(tasks.length + capability.length).toBe(OWNER_TASKS.length)
  })

  it('«ما عليك» يحمل سطرًا إليها يعدّ ما عليك منها، وفي الشاشة الأولى تحت الرأس', async () => {
    const html = await open()
    const head = /<div class="page-head">[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? ''
    expect(head).toContain('<a class="tap" href="/panel/tasks/later">تفتح قدرة</a> · ')
    const n = laterCount(html)
    expect(n).toBeGreaterThan(0)
    // ‏والعددُ عددُ صفحتها نفسُه: رأسُها ورقاقتُها
    const page = await later()
    expect(ledeCount(page)).toBe(n)
    expect(chipCount(page)).toBe(n)
  })

  it('وصفحتُها صفحةٌ من اللوحة: عنوانُها، وعودتُها إلى «ما عليك»، وموضعُها في الرافدة', async () => {
    const html = await later()
    expect(html).toContain('<title>صدى — ما عليك · تفتح قدرة</title>')
    expect(html).toContain('<h1>تفتح قدرة</h1>')
    const back = /<nav class="back"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    expect(back).toContain('href="/panel/tasks"')
    expect(back).toContain('ما عليك')
    expect(html).toContain('href="/panel/tasks" aria-current="page"')
    expect(html).toContain('cmdk-open')
    expect(html).toContain('href="/panel/help"')
    // ‏والمعلّقةُ الأولى مفتوحةٌ وحدَها، وما تمّ مطويّ، كما في «ما عليك»
    expect(html.match(/<details class="setup task[^"]*" open>/g)).toHaveLength(1)
    // ‏وشرحُ النوع مرّةً في رأسها، لا في كلّ صفّ
    expect(html.match(/تُفتَح قدرة جديدة/g)).toHaveLength(1)
  })

  /** ‏**والرابطُ إلى مهمّةٍ خرجت يصل صفحتَها** — بمرساة عنوانها، لا «ما عليك» التي لم تعد تحملها. */
  it('ورابطُ «ما عليك لتُجاز» في صفحة YouTube يصل M-28 في «تفتح قدرة»', async () => {
    const html = await open(env, '/panel/channels/youtube?tab=setup')
    expect(html).toContain('href="/panel/tasks/later#task-t-M-28">ما عليك لتُجاز</a>')
    expect(await later()).toContain('id="task-t-M-28"')
  })
})

describe('وشريط الرموز المقتربة', () => {
  async function panel(): Promise<string> {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    return (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
  }
  // ‏وحالُ المنصّة بأيّامها في بطاقتها في «الحسابات» (D-309): لا بلاطةَ منصّاتٍ في الرئيسيّة
  async function accounts(): Promise<string> {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    return (await app.request('/panel/accounts', { headers: { Cookie: cookie } }, env)).text()
  }

  function seed(days: number, kind: 'access' | 'refresh'): void {
    const at = new Date(Date.now() + days * 86_400_000).toISOString()
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a1', 'x', 'member', 'e1', '@omar')`,
    )
    db.raw.exec(
      // ‏وموعدُ تجديدٍ بلا رمزِ تجديدٍ حالٌ لا تقع: فالتجديدُ يُبذَر برمزه (D-205)
      `INSERT INTO tokens (account_id, access_enc, access_iv, refresh_enc, refresh_iv, expires_at,
                           refresh_expires_at, scopes)
       VALUES ('a1', 'x', 'y', ${kind === 'refresh' ? "'r', 'v'" : 'NULL, NULL'},
               '${kind === 'access' ? at : new Date(Date.now() + 90 * 86_400_000).toISOString()}',
               ${kind === 'refresh' ? `'${at}'` : 'NULL'}, 'tweet.write')`,
    )
  }

  it('لا شريط حيث لا رمز يقترب', async () => {
    expect(await panel()).not.toContain('افتح الحسابات')
  })

  /**
   * **يُعرَض في صدر اللوحة لا في شاشةٍ تُفتَح** — قد لا تُفتَح قبل أن يقع.
   * **وبكلمة البطاقة نفسِها** (D-205): لا «إذنُ الوصول» ولا «إذنُ التجديد»، بل حالُ المنصّة ومتى تنقطع.
   */
  it('وإذن وصول قريب بلا تجديد: «تحتاج إعادة ربط» بعدد الأيّام', async () => {
    seed(4, 'access')
    const html = await panel()
    // ‏الشريطُ يسمّي ويحيل، والحالُ بأيّامها في البلاطة مرّةً (D-235)
    expect(html).toContain('<b><bdi>X</bdi></b> تحتاج يدَك.')
    expect(await accounts()).toMatch(/data-fact="x:expiring"><span class="st-ic">[\s\S]*?<\/span>تحتاج إعادة ربط خلال [34] أيّام/)
    expect(html).toContain('class="toast-note warn"')
    expect(html).not.toContain('إذن الوصول')
  })

  it('وإذن تجديد قريب: الحكم نفسُه، فالربط ينقطع بانقضائه', async () => {
    seed(2, 'refresh')
    const html = await accounts()
    expect(html).toMatch(/data-fact="x:expiring"><span class="st-ic">[\s\S]*?<\/span>تحتاج إعادة ربط خلال (يوم|يومين)/)
    expect(html).not.toContain('إذن التجديد')
  })
})

/**
 * **الأمرُ يُنسَخ من الصفّ** (D-126): مهمّةٌ تُغلَق بسرٍّ في Worker تحمل أمرَ
 * `wrangler` للبيئة الحاليّة وزرَّ نسخ، ولا تحمله مهمّةٌ تمّت.
 */
describe('أمر wrangler في صفّ المهمّة (D-126)', () => {
  it('المهمّة المفتوحة تحمل الأمر للبيئة الحاليّة وزرّ النسخ — في صفحة نوعها', async () => {
    // ‏M-04 بوّابةٌ في «ما عليك»، وM-19 قدرةٌ في «تفتح قدرة» (متابعة D-324)
    const html = await open()
    expect(html).toContain('npx wrangler secret put X_CLIENT_ID --env staging\nnpx wrangler secret put X_CLIENT_SECRET --env staging')
    expect(html).not.toContain('--env production')
    const capability = await later()
    expect(capability).toContain('data-copy="cmd-M-19"')
    expect(capability).toContain('npx wrangler secret put CF_BROWSER_TOKEN --env staging')
    expect(capability).not.toContain('--env production')
  })
})

describe('قرارات المالك في «ما عليك» (D-130)', () => {
  it('بوّابة الستّة وسقف الترويج صفّان بحالهما من الإعدادات، ولكلّ بابُه', async () => {
    // ‏وكلتاهما قدرة: في «تفتح قدرة» (متابعة D-324)
    const html = await later()
    expect(html).toContain('M-20')
    expect(html).toContain('4 من 6 بطاقات مختارة')
    expect(html).toContain('M-21')
    expect(html).toContain('صفر — لا توصية تُكتب')
    expect(html).toContain('href="/panel/settings#settings">افتح الحدود</a>')
  })
})


describe('مهامّ الربط في «تفتح قدرة» (ر-1 · متابعة D-324)', () => {
  it('كلّ مهمّة ربط تحمل زرَّها، وكلّ مفتوحة رابط خطواتها', async () => {
    const html = await later()
    expect(html).toContain('href="/panel/channels/instagram?tab=setup#ci-instagram">اضبط Instagram</a>')
    expect(html).toContain('href="/panel/channels/tiktok?tab=setup#ci-tiktok">اضبط TikTok</a>')
    expect(html).toContain('href="/panel/channels/youtube?tab=setup#ci-youtube">اضبط YouTube</a>')
    expect(html).toContain('href="https://github.com/milestoneimpact/sada/blob/main/docs/MANUAL-TASKS.md#m-24"')
    expect(html).toContain('href="/panel/settings#tiles">اختر بطاقاتك</a>')
    // ‏واسمُ الوثيقة رابطٌ لا نصٌّ يُقرأ ولا يُفتَح — في «ما عليك» وفي «تفتح قدرة»
    for (const page of [await open(), html]) {
      expect(page).toContain('href="https://github.com/milestoneimpact/sada/blob/main/docs/MANUAL-TASKS.md"')
    }
  })

  it('وبعد حفظ سرَّي Instagram يصير الزرّ «اربط Instagram» ويقول ما قِيس', async () => {
    const html = await later({ ...env, INSTAGRAM_APP_ID: 'ig-id', INSTAGRAM_APP_SECRET: 'ig-secret' })
    expect(html).toContain('href="/oauth/instagram/start">اربط Instagram</a>')
    expect(html).toContain('سرّا التطبيق محفوظان — بقي «اربط»')
    expect(html).not.toContain('ig-secret')
  })
})

describe('«ما عليك» بلغة المالك (D-203)', () => {
  it('العنوان أوّل الصفّ والرمز صغير بعده، ولا مسار ملفّ نصًّا ظاهرًا — في الصفحتين', async () => {
    for (const html of [await open(), await later()]) {
      expect(html).not.toMatch(/<span class="mono">M-\d+<\/span>/)
      expect(html).toMatch(/<small class="ago"><bdi dir="ltr">M-\d+<\/bdi><\/small>/)
      const shown = html.replace(/<[^>]*>/g, ' ')
      expect(shown).not.toMatch(/docs\/|STATUS\.md|PLAN\.md|MANUAL-TASKS\.md/)
      expect(html).toContain('data-tip="docs/MANUAL-TASKS.md">دليل المهامّ اليدويّة</a>')
    }
  })
})
