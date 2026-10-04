import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { CHANNELS, isLinkedInPage, SETUP, listAccounts, viewChannels } from './channels'

let db: FakeDb
const ALL = (): boolean => true
const NONE = (): boolean => false

beforeEach(() => {
  db = fakeDb()
})

async function seed(
  platform: string,
  status = 'active',
  kind = 'member',
  name = 'عمر',
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), platform, kind, crypto.randomUUID(), name, status)
    .run()
}

describe('السجلّ', () => {
  /**
   * **ثلاثُ مراتبَ لا اثنتان** (D-056).
   *
   * والقاعدةُ تُثبَّت لا تُعدَّد: ما ينشر يحمل أسرارا، وما يُربَط يحمل
   * أسرارا، **وما لا سائقَ له لا يحمل شيئا** — فلا ينتظره المالك.
   */
  it('لكلّ مرتبةٍ ما يليق بها، ولا يعد بما لم يُبنَ', () => {
    // والمرتبةُ تتبع ما بُني: TikTok في D-092 وYouTube في D-096
    // وInstagram في D-121 — **والترتيبُ ترتيبُ السجلّ لا ترتيبُ البناء**
    expect(CHANNELS.filter((c) => c.stage === 'publish').map((c) => c.id))
      .toEqual(['linkedin', 'x', 'instagram', 'tiktok', 'youtube'])

    for (const spec of CHANNELS) {
      // ولكلٍّ سببٌ مكتوب، لا صمت
      expect(spec.note.length).toBeGreaterThan(20)

      if (spec.stage === 'none') {
        // لا سرَّ له ولا مهمّة: لا شيء ينتظره المالك
        expect(spec.secrets).toHaveLength(0)
        expect(spec.task).toBeNull()
      } else {
        // وما يُربَط يحتاج سرَّين ومهمّةً تفتحهما
        expect(spec.secrets).toHaveLength(2)
        expect(spec.task).not.toBeNull()
      }
    }
  })

  /** و`built` مشتقٌّ من المرتبة، فلا يفترقان. */
  it('و built هو stage === publish — لا حقلٌ ثانٍ يُنسى', () => {
    for (const spec of CHANNELS) expect(spec.built).toBe(spec.stage === 'publish')
  })

  /** ولكلّ ما يُربَط دليلٌ مكتوب — وزرُّ ربطٍ بلا دليلٍ يترك المالكَ واقفا. */
  it('ولكلّ ما يُربَط دليلُ ضبطٍ كامل', () => {
    for (const spec of CHANNELS.filter((c) => c.stage !== 'none')) {
      const guide = SETUP[spec.id]
      expect(guide, spec.id).toBeDefined()
      expect(guide!.before.length).toBeGreaterThan(1)
      expect(guide!.success.length).toBeGreaterThan(20)
      expect(guide!.failure.length).toBeGreaterThan(20)
    }
  })

  it('ترتيبُه ثابت — فالعين تحفظ مواضعها', () => {
    expect(CHANNELS.map((c) => c.id)).toEqual([
      'linkedin', 'x', 'snapchat', 'instagram', 'tiktok', 'threads', 'youtube',
    ])
  })
})

describe('listAccounts', () => {
  it('يقرأ ما رُبط', async () => {
    await seed('linkedin')
    const rows = await listAccounts(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ platform: 'linkedin', displayName: 'عمر', status: 'active' })
  })

  it('ويحمل موعدَ انتهاء الرمز من جانبه — و`null` حين لا رمز (D-126)', async () => {
    await seed('linkedin')
    const bare = await listAccounts(db)
    expect(bare[0]!.expiresAt).toBeNull()
    await db
      .prepare(
        `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes)
         VALUES (?, 'e', 'i', '2026-09-20 00:00:00', 'openid')`,
      )
      .bind(bare[0]!.id)
      .run()
    const withToken = await listAccounts(db)
    expect(withToken[0]!.expiresAt).toBe('2026-09-20 00:00:00')
  })

  it('جدولٌ لا يُقرأ يعطي قائمةً فارغة ولا يُسقط اللوحة', async () => {
    db.raw.exec('DROP TABLE accounts')
    expect(await listAccounts(db)).toEqual([])
  })
})

/*
 * ‏**صفحةُ LinkedIn وحدَها ليست وجهة** (D-087): YouTube يحفظ قناتَه `org` دائمًا (`identity.ts`)،
 * ‏وكان `kind !== 'org'` في جدولة المقطع والبطاقة والتوزيع يُسقطها كلَّها.
 */
describe('isLinkedInPage — القاعدةُ مرّةً لا شرطٌ في كلّ موضع', () => {
  it('صفحةُ الشركة على LinkedIn وحدَها؛ وقناةُ YouTube وحسابُ LinkedIn الشخصيّ وجهتان', () => {
    expect(isLinkedInPage({ platform: 'linkedin', kind: 'org' })).toBe(true)
    expect(isLinkedInPage({ platform: 'linkedin', kind: 'member' })).toBe(false)
    expect(isLinkedInPage({ platform: 'youtube', kind: 'org' })).toBe(false)
    expect(isLinkedInPage({ platform: 'instagram', kind: 'member' })).toBe(false)
  })
})

describe('viewChannels — الحالُ يُحسَب لا يُفترَض', () => {
  it('بلا حسابٍ وبأسرارٍ حاضرة: جاهزةٌ للربط', () => {
    const views = viewChannels([], ALL)
    expect(views.find((v) => v.spec.id === 'linkedin')?.state).toBe('connectable')
  })

  it('**بلا أسرار: تنتظر المالك، وتُسمّى الأسرار**', () => {
    const view = viewChannels([], NONE).find((v) => v.spec.id === 'x')
    expect(view?.state).toBe('awaiting_owner')
    expect(view?.missing).toEqual(['X_CLIENT_ID', 'X_CLIENT_SECRET'])
  })

  it('حسابٌ مربوط: مربوطة', async () => {
    await seed('linkedin')
    const views = viewChannels(await listAccounts(db), ALL)
    const linkedin = views.find((v) => v.spec.id === 'linkedin')
    expect(linkedin?.state).toBe('linked')
    expect(linkedin?.accounts).toHaveLength(1)
  })

  it('**رمزٌ انتهى يغلب المربوط** — لأنّه يوقف النشر صامتا', async () => {
    await seed('linkedin', 'active', 'member', 'الأوّل')
    await seed('linkedin', 'needs_reauth', 'org', 'الصفحة')
    const view = viewChannels(await listAccounts(db), ALL).find((v) => v.spec.id === 'linkedin')
    expect(view?.state).toBe('needs_reauth')
  })

  it('**والمربوطُ يغلب نقصَ السرّ** — الحسابُ قائمٌ والمالك يريد أن يعرف', async () => {
    await seed('linkedin')
    const view = viewChannels(await listAccounts(db), NONE).find((v) => v.spec.id === 'linkedin')
    expect(view?.state).toBe('linked')
  })

  it('المسحوبُ لا يُعدّ حسابا', async () => {
    await seed('x', 'revoked')
    const view = viewChannels(await listAccounts(db), ALL).find((v) => v.spec.id === 'x')
    expect(view?.accounts).toHaveLength(0)
    expect(view?.state).toBe('connectable')
  })

  it('**ما لم يُبنَ يبقى «لم يُبنَ» مهما كانت الأسرار**', () => {
    for (const guard of [ALL, NONE]) {
      const views = viewChannels([], guard)
      // و«لم يُبنَ» للمرتبة الدنيا وحدها: ما يُربَط له زرٌّ يعمل
      for (const view of views.filter((v) => v.spec.stage === 'none')) {
        expect(view.state).toBe('unbuilt')
      }
    }
  })

  it('لا يخلط حساب منصّةٍ بأخرى', async () => {
    await seed('x')
    const views = viewChannels(await listAccounts(db), ALL)
    expect(views.find((v) => v.spec.id === 'x')?.accounts).toHaveLength(1)
    expect(views.find((v) => v.spec.id === 'linkedin')?.accounts).toHaveLength(0)
  })
})

/**
 * **وحقلُ `note` نصٌّ صِرفٌ لا وسمَ فيه** (D-093).
 *
 * يُعرَض في أربعة مواضع، **وكلُّها تهرّبه** (`escapeHtml`) — وهو صواب:
 * نصٌّ من سجلٍّ يُحقَن في صفحةٍ بلا تهريبٍ بابٌ لا يحرسه أحد.
 *
 * فوسمٌ يُكتب فيه **يُعرَض حرفا للمالك**: رأى «‎<span class="mono">‎» و
 * «‎**‎» في شاشة TikTok. والعلّةُ صنفٌ يتكرّر: حقلٌ له عقدٌ غيرُ مكتوب،
 * فيُخالَف بحسن نيّة.
 *
 * **والفرقُ عن `SetupGuide`**: تلك تُرسَم بلا تهريب فتقبل الوسم. فحقلان
 * متجاوران بعقدين متضادّين — والحارسُ هو ما يفرّق بينهما.
 */
describe('عقدُ `note` — نصٌّ يُقرأ لا وسمٌ يُعرَض', () => {
  it('لا وسمَ HTML ولا Markdown في أيّ سجلّ', () => {
    for (const spec of CHANNELS) {
      expect(spec.note, spec.id).not.toContain('<')
      expect(spec.note, spec.id).not.toContain('**')
      expect(spec.note, spec.id).not.toContain('`')
    }
  })
})
