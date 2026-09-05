import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { CHANNELS, listAccounts, viewChannels } from './channels'

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
  it('يحمل المبنيَّ وغيرَ المبنيّ، ولا يعد بما لم يُبنَ', () => {
    const built = CHANNELS.filter((c) => c.built).map((c) => c.id)
    expect(built).toEqual(['linkedin', 'x'])
    for (const spec of CHANNELS.filter((c) => !c.built)) {
      // غيرُ المبنيّ لا سرَّ له ولا مهمّة: لا شيء ينتظره المالك
      expect(spec.secrets).toHaveLength(0)
      expect(spec.task).toBeNull()
      // ولكلٍّ سببٌ مكتوب، لا صمت
      expect(spec.note.length).toBeGreaterThan(20)
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

  it('جدولٌ لا يُقرأ يعطي قائمةً فارغة ولا يُسقط اللوحة', async () => {
    db.raw.exec('DROP TABLE accounts')
    expect(await listAccounts(db)).toEqual([])
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
      for (const view of views.filter((v) => !v.spec.built)) {
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
