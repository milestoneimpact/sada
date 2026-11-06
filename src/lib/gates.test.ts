/**
 * البوّابات — **والاختبارُ يحرس أنّها لا تُجتاز بقول.**
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { currentPhase, gatesOf, readGateFacts, type GateFacts } from './gates'

const empty: GateFacts = {
  publishedPerPlatform: {}, publishedWithMedia: {}, scheduledPublished: 0,
  ledgerPerPlatform: {}, plans: 0, reports: 0, suggestions: 0,
  promoSpend: 0, orgAccounts: 0, weekAlertFired: false,
}

const gate = (f: GateFacts, phase: string) => gatesOf(f).find((g) => g.phase === phase)!

describe('لا تُجتاز بقول', () => {
  it('بلا شيء: لا بوّابة مجتازة', () => {
    expect(gatesOf(empty).every((g) => !g.passed)).toBe(true)
    expect(currentPhase(gatesOf(empty))).toBe('0')
  })

  /** **منصّةٌ واحدةٌ لا تكفي**: البوّابةُ تقول «على كلّ منصّة». */
  it('ومنصّة واحدة لا تجتاز بوّابة المرحلة 0', () => {
    const half: GateFacts = {
      ...empty,
      publishedPerPlatform: { linkedin: 3 },
      ledgerPerPlatform: { linkedin: 3 },
    }
    expect(gate(half, '0').passed).toBe(false)

    const both: GateFacts = {
      ...empty,
      publishedPerPlatform: { linkedin: 3, x: 1 },
      ledgerPerPlatform: { linkedin: 3, x: 1 },
    }
    expect(gate(both, '0').passed).toBe(true)
  })

  /** **ومنشورٌ بلا سطرٍ في الدفتر لا يجتاز** — D-008 شرطٌ لا زينة. */
  it('ونشر بلا سطر في الدفتر لا يجتاز', () => {
    const noLedger: GateFacts = { ...empty, publishedPerPlatform: { linkedin: 3, x: 1 } }
    expect(gate(noLedger, '0').passed).toBe(false)
  })

  it('وأربعة من خمسة لا تجتاز بوّابة المرحلة 1', () => {
    const four: GateFacts = { ...empty, plans: 1, scheduledPublished: 4 }
    expect(gate(four, '1').passed).toBe(false)
    expect(gate({ ...four, scheduledPublished: 5 }, '1').passed).toBe(true)
  })
})

describe('وبند التنبيه صار يُقاس', () => {
  /**
   * **كان `unmeasured`** — وسببُه أنّ التنبيه كان يُتصوَّر بريدا لا
   * نقرؤه. **فنُقل إلى حيث يُقاس** (D-065)، ولا يبقى في البوّابة بندٌ
   * يُجيزها بلا دليل.
   */
  const almost: GateFacts = {
    ...empty,
    publishedPerPlatform: { linkedin: 3, x: 2 },
    publishedWithMedia: { linkedin: 1, x: 1 },
    orgAccounts: 1,
  }

  it('بلا تنبيه سُجّل: البوّابة لا تُجتاز، والبند «لم يتحقّق» لا «لا يُقاس»', () => {
    const g = gate(almost, '2')
    expect(g.passed).toBe(false)
    expect(g.items.some((i) => i.state === 'unmeasured')).toBe(false)
    expect(g.items.filter((i) => i.state === 'unmet')).toHaveLength(1)
  })

  it('وبتنبيه سُجّل تُجتاز', () => {
    expect(gate({ ...almost, weekAlertFired: true }, '2').passed).toBe(true)
  })
})

describe('وبند سلبيّ يُجتاز بالصفر', () => {
  /** «ولم يُنفَق شيء» شرطٌ سلبيّ — وأيُّ صفٍّ يُسقط البوّابة (D-006). */
  it('إنفاق ترويج يُسقط بوّابة المرحلة 3 ولو تمّ الباقي', () => {
    const clean: GateFacts = { ...empty, reports: 1, suggestions: 1 }
    expect(gate(clean, '3').passed).toBe(true)

    const spent: GateFacts = { ...clean, promoSpend: 10 }
    expect(gate(spent, '3').passed).toBe(false)
    expect(gate(spent, '3').items.at(-1)!.evidence).toContain('يُسقط البوّابة')
  })
})

describe('ولكلّ بند دليلُه لا حكمُه وحده', () => {
  it('يُعرَض الرقم الذي بُني عليه الحكم', () => {
    const f: GateFacts = { ...empty, publishedPerPlatform: { linkedin: 3 } }
    const first = gate(f, '0').items[0]!
    expect(first.evidence).toContain('LinkedIn: 3')
    expect(first.evidence).toContain('X: 0')
  })
})

describe('والقراءة من قاعدة حقيقيّة', () => {
  let db: FakeDb
  beforeEach(() => { db = fakeDb() })

  it('قاعدة فارغة تعطي أصفارا ولا تسقط', async () => {
    const f = await readGateFacts(db, 'org_owner')
    expect(f.plans).toBe(0)
    expect(f.publishedPerPlatform).toEqual({})
    expect(gatesOf(f).every((g) => !g.passed)).toBe(true)
  })

  it('ومنشور خرج فعلا يُعَدّ لمنصّته', async () => {
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
    const f = await readGateFacts(db, 'org_owner')
    expect(f.publishedPerPlatform['x']).toBe(1)
    // **وجُدوِل ثمّ خرج** — فيُعَدّ في «بلا تدخّل»
    expect(f.scheduledPublished).toBe(1)
  })

  /** ومحاولةٌ فاشلةٌ ليست نشرا — والبوّابةُ لا تُخدَع بصفٍّ حالتُه تقول ذلك. */
  it('ومحاولة فاشلة لا تُعَدّ نشرا', async () => {
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
       VALUES ('at1', 'p1', 'k1', 1, '{}', 'failed')`,
    )
    expect((await readGateFacts(db, 'org_owner')).publishedPerPlatform['x']).toBeUndefined()
  })
})
