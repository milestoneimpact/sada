/**
 * توصيةُ الترويج — **الاختبارُ يحرس أنّها لا تُنفق ولا تخترع مبلغا.**
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { writeSetting } from '../settings'
import { runWeekly, runWeeklyAll } from './job'
import { readReport } from './weekly'
import {
  MAX_SHARE, MIN_COHORT, OUTLIER_FACTOR,
  decide, openSuggestions, pick, saveSuggestion,
} from './promote'
import type { ReportPost } from './weekly'

let db: FakeDb

const post = (id: string, interactions: number | null, window: '24h' | '7d' | null = '24h'): ReportPost => ({
  id, platform: 'x', text: `نصّ ${id}`, publishedAt: '2026-08-25T10:00:00.000Z',
  window, impressions: null, interactions,
})

/** جماعةٌ وسيطُها ١٠ ومعها متفوّقٌ يبلغ `star`. */
const cohort = (star: number): ReportPost[] => [
  post('a', 10), post('b', 10), post('c', 10), post('d', 10), post('star', star),
]

beforeEach(() => {
  db = fakeDb()
  db.raw.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name)
     VALUES ('a-x', 'x', 'member', 'e', 'عمر')`,
  )
})

describe('لا مبلغ بلا سقف يضعه المالك', () => {
  /**
   * **هذا هو الحدُّ الأوّل.**
   *
   * `suggested_budget` لا يقبل الفراغ — ورقمٌ نؤلّفه رقمٌ بلا مصدر.
   * فالصفرُ يعني «لا توصية»، لا «توصيةٌ بصفر».
   */
  it('سقف صفر يعني لا توصية أصلا', () => {
    expect(pick(cohort(100), 0).kind).toBe('no_cap')
  })

  it('وسقف سالب كذلك — ولا يُقلَب إلى موجب', () => {
    expect(pick(cohort(100), -50).kind).toBe('no_cap')
  })

  it('والمبلغ حصّة من السقف لا رقم من عندنا', () => {
    const out = pick(cohort(100), 20)
    expect(out.kind).toBe('suggested')
    if (out.kind !== 'suggested') return
    expect(out.candidate.budgetUsd).toBe(20 * MAX_SHARE)
    expect(out.candidate.reason).toContain('سقف وضعتَه')
    // والنافذةُ باسمها لا بمفتاح `CHECK` (D-125): «‏٢٤ ساعة» لا «24h»
    expect(out.candidate.reason).toContain('نافذة 24 ساعة')
    expect(out.candidate.reason).not.toMatch(/نافذة (24h|72h|7d)/)
  })
})

describe('لا توصية على ضجيج', () => {
  /** اثنان لا يصنعان معتادا، ووسيطٌ عليهما هو أحدُهما. */
  it('جماعة أقلّ من الحدّ لا يُرشَّح منها', () => {
    const thin = [post('a', 10), post('b', 100)]
    const out = pick(thin, 20)
    expect(out.kind).toBe('thin')
    expect(MIN_COHORT).toBeGreaterThan(2)
  })

  it('وتفوّق دون الضعف لا يستحقّ إنفاقا', () => {
    expect(pick(cohort(10 * OUTLIER_FACTOR - 1), 20).kind).toBe('none')
    expect(pick(cohort(10 * OUTLIER_FACTOR), 20).kind).toBe('suggested')
  })

  /** وسيطٌ صفرٌ يجعل كلَّ شيءٍ «ضعفَه» — فأسبوعٌ بلا تفاعلٍ لا يُروَّج. */
  it('وأسبوع بلا تفاعل لا يُروَّج ولو تفوّق واحد بصفر على أصفار', () => {
    const dead = [post('a', 0), post('b', 0), post('c', 0), post('d', 0), post('e', 1)]
    expect(pick(dead, 20).kind).toBe('none')
  })

  it('وغير المقيس لا يدخل الجماعة', () => {
    const unmeasured = [post('a', null, null), post('b', null, null), post('c', null, null),
      post('d', null, null), post('e', null, null)]
    expect(pick(unmeasured, 20).kind).toBe('none')
  })
})

describe('والترتيب بالعدد لا بالنسبة — عمدا', () => {
  /**
   * النسبةُ تحتاج ظهورا، وLinkedIn لا يعطيه لمنشور عضو. **فترتيبٌ
   * بالنسبة يُقصي منصّةً كاملةً من الترويج** لا لضعفها بل لصمت واجهتها.
   */
  it('منشور بلا ظهور مقيس يبقى مرشّحا', () => {
    const out = pick(cohort(100), 20)
    expect(out.kind).toBe('suggested')
    if (out.kind !== 'suggested') return
    expect(out.candidate.post.impressions).toBeNull()
    expect(out.candidate.post.id).toBe('star')
  })

  it('ولا تُخلَط نافذة بنافذة', () => {
    const mixed = [
      post('week', 900, '7d'),
      ...cohort(100),
    ]
    const out = pick(mixed, 20)
    // 7d فيها واحدٌ وحده فلا تُرتَّب، ويقع الترشيحُ في 24h
    expect(out.kind).toBe('suggested')
    if (out.kind !== 'suggested') return
    expect(out.candidate.window).toBe('24h')
  })
})

describe('الصفّ في القاعدة', () => {
  function seedPost(id: string): void {
    db.raw.exec(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES ('${id}', 'a-x', 'x', 'text', 'نصّ ${id}', '2026-08-25T10:00:00Z',
               'published', 'k-${id}', 'omar', '2026-08-25T10:00:00Z')`,
    )
  }

  it('يُكتب بلا بتّ — والبتّ للمالك وحده (D-006)', async () => {
    seedPost('star')
    const out = pick(cohort(100), 20)
    if (out.kind !== 'suggested') throw new Error('توقّعنا توصية')
    expect(await saveSuggestion(db, out.candidate)).toBe(true)

    const row = db.raw.prepare('SELECT * FROM promotion_suggestions').get() as Record<string, unknown>
    expect(row['human_decision']).toBeNull()
    expect(row['decided_at']).toBeNull()
    expect(row['suggested_budget']).toBe(10)
  })

  /** توصيةٌ رفضها المالك لا تُقترَح ثانيةً كأنّ رفضَه لم يقع. */
  it('ولا يُوصى بمنشور مرّتين — ولو بُتّ فيه', async () => {
    seedPost('star')
    const out = pick(cohort(100), 20)
    if (out.kind !== 'suggested') throw new Error('توقّعنا توصية')
    await saveSuggestion(db, out.candidate)
    await decide(db, 'org_owner', 'star', 'rejected')

    expect(await saveSuggestion(db, out.candidate)).toBe(false)
    const row = db.raw.prepare('SELECT human_decision FROM promotion_suggestions').get() as {
      human_decision: string
    }
    expect(row.human_decision).toBe('rejected')
  })

  it('وما بُتّ فيه لا يعود يسأل', async () => {
    seedPost('star')
    const out = pick(cohort(100), 20)
    if (out.kind !== 'suggested') throw new Error('توقّعنا توصية')
    await saveSuggestion(db, out.candidate)

    expect((await openSuggestions(db, 'org_owner')).map((s) => s.postId)).toEqual(['star'])
    await decide(db, 'org_owner', 'star', 'accepted')
    expect(await openSuggestions(db, 'org_owner')).toEqual([])
  })

  it('وبتّ ثان لا يبدّل الأوّل', async () => {
    seedPost('star')
    const out = pick(cohort(100), 20)
    if (out.kind !== 'suggested') throw new Error('توقّعنا توصية')
    await saveSuggestion(db, out.candidate)
    expect(await decide(db, 'org_owner', 'star', 'accepted')).toBe(true)
    expect(await decide(db, 'org_owner', 'star', 'rejected')).toBe(false)
  })
})

describe('الدورة الأسبوعيّة', () => {
  it('تكتب التقرير أوّلا، ولا توصي بلا سقف', async () => {
    const out = await runWeekly(db, new Date('2026-09-06T04:17:00Z'))
    expect(out.written).toBe(true)
    expect(out.promotion.kind).toBe('no_cap')
    expect(out.suggested).toBe(false)

    const rows = db.raw.prepare('SELECT count(*) AS n FROM reports').get() as { n: number }
    expect(rows.n).toBe(1)
  })

  it('وإعادتُها لا تكتب أسبوعا ثانيا', async () => {
    await runWeekly(db, new Date('2026-09-06T04:17:00Z'))
    const again = await runWeekly(db, new Date('2026-09-06T05:00:00Z'))
    expect(again.written).toBe(false)
    const rows = db.raw.prepare('SELECT count(*) AS n FROM reports').get() as { n: number }
    expect(rows.n).toBe(1)
  })

  it('ولكلّ منظّمة تقريرُها، ولا ترى تقرير غيرها (D-234)', async () => {
    db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
    const all = await runWeeklyAll(db, new Date('2026-09-06T04:17:00Z'))
    expect(all.map((o) => o.id).sort()).toEqual(['2026-08-24', '2026-08-24.org_b'])
    expect(await readReport(db, 'org_b', '2026-08-24')).toBeNull()
    expect(await readReport(db, 'org_b', '2026-08-24.org_b')).not.toBeNull()
  })

  /** **ولا مسارَ إنفاقٍ في المستودع أصلا** — أقوى من شرطٍ في الشيفرة. */
  it('وسقف موضوع لا يجعل الدورة تُنفق — تكتب صفّا فقط', async () => {
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    const before = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    await runWeekly(db, new Date('2026-09-06T04:17:00Z'))
    const after = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(after.n).toBe(before.n)
  })
})
