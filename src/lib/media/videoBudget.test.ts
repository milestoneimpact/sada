/**
 * ميزانيّةُ المقاطع الشهريّة (D-414) — القاعدةُ حقيقيّةٌ بقيودها، والمزوّدُ مزيّف.
 *
 * يُثبَت هنا: أنّ البلوغَ يمنع النداءَ قبل المزوّد، وأنّ طلبين متزامنين لا يمرّان معًا على آخر ما بقي،
 * وأنّ ما ردّه المزوّدُ يعيد مالَه، وأنّ صفَّ الدفتر يُكتب قبل النجاح، وأنّ سقفَ العميل يغلب الافتراضَ العامّ.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { readSettings, writeSetting } from '../settings'
import type { AiBinding } from './workersAi'
import { animateForPost } from './video'
import { claimVideoSpend, videoBudget, videoSpendThisMonth } from './videoBudget'
import { videoReadiness } from './readiness'
import { videoCapGate } from '../limits'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const OK_VIDEO = { state: 'Completed', result: { video: 'https://cf.example/v.mp4' } }

let db: FakeDb

function ai(fail = false): AiBinding & { calls: number } {
  const a = {
    calls: 0,
    async run() {
      a.calls++
      if (fail) throw new Error('رفض المزوّد')
      return OK_VIDEO
    },
  }
  return a
}

const pull = (async () => new Response(new Uint8Array(512), { headers: { 'Content-Type': 'video/mp4' } })) as unknown as typeof fetch
const deps = (a: AiBinding, org = 'org_owner') => ({
  db, ai: a, encKey: KEY, baseUrl: 'https://sada2.basserh.com', fetchImpl: pull, org,
  bucket: { async put() { return null } },
})

function seed(id: string, org = 'org_owner'): void {
  db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id)
    VALUES (?, 'linkedin', 'image', 'نصّ', 'approved', ?, ?)`).run(id, `k-${id}`, org)
  db.raw.prepare(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, status, idempotency_key, org_id)
    VALUES (?, ?, ?, 'image/png', 100, 'وصف', 'نموذج', 'ready', ?, ?)`).run(`img-${id}`, id, `k/${id}`, `i-${id}`, org)
}

const rows = (org = 'org_owner') => db.raw
  .prepare(`SELECT operation, total FROM cost_ledger WHERE org_id = ? AND operation LIKE 'video:%' ORDER BY rowid`)
  .all(org) as { operation: string; total: number }[]

beforeEach(async () => {
  db = fakeDb()
  // ‏‏سقفُ العدد بعيدٌ لتُختبَر الميزانيّةُ وحدَها
  await writeSetting(db, 'daily_video_cap', '20', 'omar')
})

describe('ميزانيّة المقاطع الشهريّة', () => {
  it('صفُّ الدفتر يُكتب بتقدير المقطع قبل أن يُعدّ ناجحًا (D-008)', async () => {
    seed('p1')
    expect(await animateForPost(deps(ai()), 'p1')).toMatchObject({ kind: 'generated' })
    expect(rows()).toEqual([{ operation: expect.stringMatching(/^video:.+:price_unverified$/), total: 0.5 }])
    expect(await videoSpendThisMonth(db, 'org_owner')).toBe(0.5)
  })

  it('البلوغُ يمنع النداءَ قبل المزوّد برسالةٍ عربيّة', async () => {
    await writeSetting(db, 'monthly_video_cap_usd', '0.5', 'omar')
    seed('p1'); seed('p2')
    expect(await animateForPost(deps(ai()), 'p1')).toMatchObject({ kind: 'generated' })
    const a = ai()
    const out = await animateForPost(deps(a), 'p2')
    expect(out).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('بلغت ميزانيّة المقاطع الشهريّة') })
    expect(a.calls).toBe(0)
    expect(rows()).toHaveLength(1)
    // ‏‏وحجزُ التوليد لا يبقى على منشورٍ لم يُنفَق عليه
    const held = db.raw.prepare(`SELECT count(*) AS n FROM media_claims WHERE post_id = 'p2'`).get() as { n: number }
    expect(held.n).toBe(0)
  })

  it('وصفرٌ يُغلق التحريك بقرار', async () => {
    await writeSetting(db, 'monthly_video_cap_usd', '0', 'omar')
    seed('p1')
    expect(await animateForPost(deps(ai()), 'p1')).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('صفر بقرار المالك') })
  })

  it('طلبان متزامنان على آخر ما بقي: يمرّ واحدٌ ويُردّ الآخر', async () => {
    await writeSetting(db, 'monthly_video_cap_usd', '0.5', 'omar')
    seed('p1'); seed('p2')
    const [a, b] = [ai(), ai()]
    const outs = await Promise.all([animateForPost(deps(a), 'p1'), animateForPost(deps(b), 'p2')])
    expect(outs.map((o) => o.kind).sort()).toEqual(['blocked', 'generated'])
    expect(a.calls + b.calls).toBe(1)
    expect(rows()).toHaveLength(1)
  })

  it('والحجزُ الذرّيُّ نفسُه: عشرة حجوزٍ معًا على ميزانيّة ثلاثة', async () => {
    const claims = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      claimVideoSpend(db, { org: 'org_owner', cap: 1.5, clip: 0.5, operation: 'video:m:price_unverified', refId: `r${i}` })))
    expect(claims.filter((c) => c.kind === 'claimed')).toHaveLength(3)
    expect(await videoSpendThisMonth(db, 'org_owner')).toBe(1.5)
  })

  it('ما ردّه المزوّدُ يعيد مالَه ويبقى صفُّه أثرًا', async () => {
    await writeSetting(db, 'monthly_video_cap_usd', '0.5', 'omar')
    seed('p1')
    expect((await animateForPost(deps(ai(true)), 'p1')).kind).toBe('failed')
    expect(rows()).toEqual([{ operation: expect.stringMatching(/:released$/), total: 0 }])
    // ‏‏والمالُ عاد: المحاولةُ التالية تمرّ
    expect(await animateForPost(deps(ai()), 'p1')).toMatchObject({ kind: 'generated' })
  })

  it('سقفُ العميل يغلب الافتراضَ العامّ، وعميلٌ بلا سقفٍ يأخذ العامّ', async () => {
    db.raw.prepare("INSERT INTO orgs (id, name) VALUES ('org_b', 'عميل ب'), ('org_c', 'عميل ج')").run()
    await writeSetting(db, 'monthly_video_cap_usd', '0', 'panel', 'org_b')
    seed('pb', 'org_b'); seed('pc', 'org_c')
    expect((await readSettings(db, 'org_b')).monthlyVideoCapUsd).toBe(0)
    expect((await readSettings(db, 'org_c')).monthlyVideoCapUsd).toBe(10)
    expect(await animateForPost(deps(ai(), 'org_b'), 'pb'))
      .toMatchObject({ kind: 'blocked', reason: expect.stringContaining('ميزانيّة مقاطع هذا العميل') })
    expect(await animateForPost(deps(ai(), 'org_c'), 'pc')).toMatchObject({ kind: 'generated' })
    // ‏‏والإنفاقُ لكلّ عميلٍ وحدَه
    expect(await videoSpendThisMonth(db, 'org_b')).toBe(0)
    expect(await videoSpendThisMonth(db, 'org_c')).toBe(0.5)
  })

  it('ونقطةُ «الميزانيّة» تحت الزرّ تقول كم بقي، وتسقط عند البلوغ', () => {
    const clips = videoCapGate(0, 2)
    const ok = videoReadiness({ face: 'env', blocker: null, clips, budget: videoBudget(10, 2.5, 0.5) })
    expect(ok.dots.find((d) => d.key === 'budget')).toMatchObject({ state: 'done', note: expect.stringContaining('هذا الشهر') })
    const full = videoReadiness({ face: 'env', blocker: null, clips, budget: videoBudget(1, 1, 0.5) })
    expect(full.blocked).toBe(true)
  })
})
