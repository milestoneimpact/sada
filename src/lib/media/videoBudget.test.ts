/**
 * ميزانيّةُ المقاطع الشهريّة (D-414) — القاعدةُ حقيقيّةٌ بقيودها، والمزوّدُ مزيّف.
 *
 * يُثبَت هنا: أنّ البلوغَ يمنع النداءَ قبل المزوّد، وأنّ طلبين متزامنين لا يمرّان معًا على آخر ما بقي،
 * وأنّ ما ردّه المزوّدُ يعيد مالَه، وأنّ صفَّ الدفتر يُكتب قبل النجاح، وأنّ سقفَ العميل يغلب الافتراضَ العامّ.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { readSettings, writeSetting } from '../settings'
import type { AiBinding } from './workersAi'
import { animateForPost } from './video'
import { claimVideoSpend, markVideoGenerated, reclaimStuckVideoSpend, releaseVideoSpend, videoBudget, videoSpendThisMonth } from './videoBudget'
import { STALE_MINUTES } from './claim'
import { checkAllowance, videoMonthCapOf } from '../limits'
import { spendByProvider, spendRows, spendThisMonth } from '../ai/spend'
import { monthlyReport } from '../report/monthly'
import { videoBudgetForms } from '../../routes/panelView'
import { videoReadiness } from './readiness'
import { videoCapGate } from '../limits'
import { spendTodayFor } from '../ai/spend'

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
    // ‏‏وولّد المزوّدُ: يُوسَم الصفُّ فلا يعيده الكنّاس (D-415)
    expect(rows()).toEqual([{ operation: expect.stringMatching(/^video:.+:price_unverified:generated$/), total: 0.5 }])
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

  it('تقديرُ المقطع لا يدخل سقفَ المزوّد اليوميّ فلا يوقف صورَه (D-414)', async () => {
    await claimVideoSpend(db, { org: 'org_owner', cap: 10, clip: 0.5, operation: 'video:m:price_unverified', refId: 'rv' })
    expect(await videoSpendThisMonth(db, 'org_owner')).toBe(0.5)
    expect(await spendTodayFor(db, 'cloudflare')).toBe(0)
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

describe('ملاحظاتُ المراجعة على D-414 (D-415)', () => {
  const minutesAgo = (id: string, m: number): void => {
    db.raw.prepare(`UPDATE cost_ledger SET at = datetime('now', ?) WHERE id = ?`).run(`-${m} minutes`, id)
  }
  const claim = async (ref: string): Promise<string> => {
    const c = await claimVideoSpend(db, { org: 'org_owner', cap: 10, clip: 0.5, operation: 'video:m:price_unverified', refId: ref })
    if (c.kind !== 'claimed') throw new Error('لم يُحجز')
    return c.ledgerId
  }

  it('حجزٌ علق بلا نتيجةٍ بعد مهلة حجز التوليد يعود مالُه، وما وُلّد لا يُلمس، والحديثُ ينتظر', async () => {
    const stuck = await claim('a')
    const made = await claim('b')
    const fresh = await claim('c')
    await markVideoGenerated(db, 'org_owner', made)
    minutesAgo(stuck, STALE_MINUTES.video + 1)
    minutesAgo(made, STALE_MINUTES.video + 1)
    minutesAgo(fresh, STALE_MINUTES.video - 1)
    expect(await reclaimStuckVideoSpend(db, new Date())).toBe(1)
    const by = (id: string) => db.raw.prepare('SELECT operation, total FROM cost_ledger WHERE id = ?').get(id) as { operation: string; total: number }
    expect(by(stuck)).toEqual({ operation: expect.stringMatching(/:released$/), total: 0 })
    expect(by(made)).toEqual({ operation: expect.stringMatching(/:generated$/), total: 0.5 })
    expect(by(fresh).total).toBe(0.5)
    expect(await videoSpendThisMonth(db, 'org_owner')).toBe(1)
    // ‏‏ومرّةً ثانيةً لا شيء: الكنسُ لا يكرّر
    expect(await reclaimStuckVideoSpend(db, new Date())).toBe(0)
  })

  it('وإعادةٌ فشلت تُسجَّل ولا تُبلَع — بالمعرّف وحده', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 down') } }) }) } as never
    await releaseVideoSpend(broken, 'org_owner', 'L1')
    expect(spy).toHaveBeenCalledWith({ job: 'video_release', ledger: 'L1', failed: expect.stringContaining('D1 down') })
    spy.mockRestore()
  })

  it('«سقفُ العميل» بوجود صفّه لا بتساوي القيمتين', async () => {
    db.raw.prepare("INSERT INTO orgs (id, name) VALUES ('org_b', 'عميل ب')").run()
    await writeSetting(db, 'monthly_video_cap_usd', '0.5', 'omar')
    await writeSetting(db, 'monthly_video_cap_usd', '0.5', 'panel', 'org_b')
    seed('pb1', 'org_b'); seed('pb2', 'org_b')
    expect(await animateForPost(deps(ai(), 'org_b'), 'pb1')).toMatchObject({ kind: 'generated' })
    expect(await animateForPost(deps(ai(), 'org_b'), 'pb2'))
      .toMatchObject({ kind: 'blocked', reason: expect.stringContaining('ميزانيّة مقاطع هذا العميل') })
  })

  it('تقديرُ المقاطع سطرٌ وحده موسومٌ «تقدير» وخارجَ الإنفاق الحقيقيّ — وصفُّه باقٍ (D-008)', async () => {
    await claim('v')
    db.raw.prepare(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id, org_id)
      VALUES ('img1', 'cloudflare', 'image:flux', 1, 0.2, 0.2, 'r', 'org_owner')`).run()
    const by = await spendByProvider(db, 30)
    expect(by.cloudflare).toEqual({ calls: 1, total: 0.2 })
    expect(by['cloudflare:estimate']).toEqual({ calls: 1, total: 0.5 })
    const row = spendRows(by, { cloudflare: 'Cloudflare' }).find((r) => r.key === 'cloudflare:estimate')
    expect(row).toMatchObject({ estimate: true, label: expect.stringContaining('تقدير') })
    expect(await spendThisMonth(db, null, new Date())).toMatchObject({ total: 0.2, estimated: 0.5 })
    const month = new Date().toISOString().slice(0, 7)
    expect(await monthlyReport(db, 'org_owner', month, null)).toMatchObject({ spend: 0.2, estimated: 0.5 })
  })

  it('«أُنفق هذا الشهر» في الإعدادات يُقرَن بسقف العميل النشط لا بالافتراض العامّ', async () => {
    db.raw.prepare("INSERT INTO orgs (id, name) VALUES ('org_b', 'عميل ب')").run()
    await writeSetting(db, 'monthly_video_cap_usd', '3', 'panel', 'org_b')
    const active = videoMonthCapOf(await checkAllowance(db, 'video', 'org_b'))
    expect(active).toEqual({ cap: 3, scope: 'org' })
    expect(videoMonthCapOf(await checkAllowance(db, 'video', 'org_owner'))).toEqual({ cap: 10, scope: 'global' })
    const html = videoBudgetForms(10, 0.5, 1, active.cap)
    expect(html).toContain('من ⁦3.00$⁩')
  })
})
