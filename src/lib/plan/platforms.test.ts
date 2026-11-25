/** TikTok وInstagram في الخطّة خلف بوّابة (D-399): الدخولُ بالربط أو بالعلم، والوسيطُ شرطٌ، والمفاتيحُ لكلّ منصّة. */
import { describe, expect, it } from 'vitest'
import { mediaProblem, planNowFor, readPlanFlags } from './platforms'
import { planChecks, DEFAULT_RULES, type CheckItem } from './checks'
import { arrangeSlots } from './scheduler'
import { readPlan, rowKey, type PlanFacts } from './import'
import { changeStatements, packageKey } from '../package/apply'
import type { Change, SnapshotEntry } from '../package/diff'
import type { Db } from '../tokens'
import { cardMedia } from './checkStore'
import { planNewScreen, type PlanNewData } from '../../routes/ui/planNewView'

const FOUR = ['linkedin', 'x', 'instagram', 'tiktok'] as const

describe('planNowFor', () => {
  it('بلا ربطٍ ولا علمٍ: LinkedIn وX وحدهما كما كان', () => {
    expect(planNowFor([], [])).toEqual(['linkedin', 'x'])
    expect(planNowFor(['linkedin', 'x', 'youtube'])).toEqual(['linkedin', 'x'])
  })
  it('المربوطُ يدخل، والعلمُ يُدخل غيرَ المربوط', () => {
    expect(planNowFor(['instagram'])).toEqual(['linkedin', 'x', 'instagram'])
    expect(planNowFor([], ['tiktok'])).toEqual(['linkedin', 'x', 'tiktok'])
    expect(planNowFor(['instagram', 'tiktok'])).toEqual([...FOUR])
  })
  it('الأعلامُ تُقرأ للمنظّمة وحدها، وغيابُ الجدول لا يكسر', async () => {
    const seen: unknown[][] = []
    const db = { prepare: (sql: string) => ({ bind: (...a: unknown[]) => { seen.push([sql, ...a]); return { all: async () => ({ results: [{ platform: 'tiktok' }] }) } } }) } as unknown as Db
    expect(await readPlanFlags(db, 'org-a')).toEqual(['tiktok'])
    expect(String(seen[0]![0])).toContain('org_id = ?')
    expect(seen[0]![1]).toBe('org-a')
    const broken = { prepare: () => ({ bind: () => ({ all: async () => { throw new Error('no such table') } }) }) } as unknown as Db
    expect(await readPlanFlags(broken, 'org-a')).toEqual([])
  })
})

describe('شاشة «خطّة جديدة» بالبوّابة', () => {
  const data = (linked: string[], flagged: string[] = []): PlanNewData => ({
    now: new Date('2026-11-25T08:00:00Z'), linked, perWeek: 3, sources: [], perDraft: null, perImage: null,
    autoImage: false, ready: true, replacing: false, flagged,
  })
  it('غيرُ المربوطة خارج الخطّة، والشاشةُ تقول ما يفتحه الربط', () => {
    const out = planNewScreen(data(['linkedin', 'x']))
    expect(out).toContain('data-pf="linkedin"')
    expect(out).not.toContain('data-pf="instagram"')
    expect(out).not.toContain('data-pf="tiktok"')
    expect(out).toContain('اربط Instagram لتُضاف إلى خطّتك')
    expect(out).toContain('اربط TikTok لتُضاف إلى خطّتك')
  })
  it('الأربعُ مربوطة: أربعُ بطاقات ولا جملةَ فتح', () => {
    const out = planNewScreen(data([...FOUR]))
    for (const p of FOUR) expect(out).toContain(`data-pf="${p}"`)
    expect(out).not.toContain('لتُضاف إلى خطّتك')
  })
  it('العلمُ بلا ربط: لا بطاقة (لا ينشر له شيء) بل «غير مربوطة — اربطها»', () => {
    const out = planNewScreen(data(['linkedin', 'x'], ['tiktok']))
    expect(out).not.toContain('data-pf="tiktok"')
    expect(out).toContain('TikTok غير مربوطة')
    expect(out).not.toContain('اربط TikTok لتُضاف')
  })
})

describe('الوسيطُ شرطُ Instagram وTikTok', () => {
  const item = (over: Partial<CheckItem>): CheckItem => ({ key: 'k', platform: 'instagram', at: { day: '2026-12-02', minutes: 600 }, text: 'نصّ', ...over })
  const input = (items: CheckItem[]) => ({ planId: 'p', items, others: [], activePlatforms: [...FOUR], now: { day: '2026-12-01', minutes: 0 } })
  it('صفُّ Instagram بلا وسيطٍ ممنوع، وبصورةٍ يمرّ', () => {
    const blocked = planChecks(input([item({ media: 'none' })]))
    expect(blocked).toContainEqual(expect.objectContaining({ rule: 'no_media', severity: 'block', keys: ['k'], message: expect.stringContaining('Instagram') }))
    expect(planChecks(input([item({ media: 'image' })])).filter((f) => f.rule === 'no_media')).toEqual([])
    expect(planChecks(input([item({ media: null })])).some((f) => f.rule === 'no_media')).toBe(true)
  })
  it('TikTok بصورةٍ ممنوع، وبمقطعٍ يمرّ؛ وLinkedIn بلا وسيطٍ يمرّ', () => {
    expect(mediaProblem('tiktok', 'image')).toContain('مقطع')
    expect(mediaProblem('tiktok', 'video')).toBeNull()
    expect(mediaProblem('linkedin', 'none')).toBeNull()
    expect(mediaProblem('instagram', undefined)).toBeNull()
    expect(planChecks(input([item({ platform: 'tiktok', media: 'image' })])).some((f) => f.rule === 'no_media')).toBe(true)
  })
  it('سقفُ كلّ منصّةٍ من `schedule_rules`: سقفٌ لـ Instagram يُطبَّق عليه وحده', () => {
    const rules = { ...DEFAULT_RULES, platformCaps: { ...DEFAULT_RULES.platformCaps, instagram: 1 }, minGapMinutes: 0 }
    const two = [item({ key: 'a', media: 'image' }), item({ key: 'b', media: 'image', at: { day: '2026-12-02', minutes: 900 } })]
    expect(planChecks(input(two), rules).some((f) => f.rule === 'platform_cap' && f.platform === 'instagram')).toBe(true)
    expect(planChecks(input(two), DEFAULT_RULES).some((f) => f.rule === 'platform_cap')).toBe(false)
  })
})

describe('خطّةٌ بأربع منصّات', () => {
  it('المُجدوِل: كلُّ منصّةٍ بحسابها، فالموعدُ نفسُه لا يُدفع بالتباعد، والحسابُ الواحد يُدفع', () => {
    const slots = FOUR.map((p) => ({ id: 'id-' + p, account: 'acc-' + p, at: '2026-12-02T07:00', local: '2026-12-02 10:00', exact: true }))
    const out = arrangeSlots(slots, DEFAULT_RULES, new Date('2026-12-01T00:00:00Z'))
    expect(out.held).toEqual([])
    expect(out.placed.map((s) => s.shift)).toEqual([0, 0, 0, 0])
    const same = arrangeSlots([...slots, { id: 'id-ig2', account: 'acc-instagram', at: '2026-12-02T07:00', local: '2026-12-02 10:00', exact: true }], DEFAULT_RULES, new Date('2026-12-01T00:00:00Z'))
    expect(same.placed.filter((s) => s.account === 'acc-instagram').map((s) => s.shift).sort((a, b) => a - b)).toEqual([0, DEFAULT_RULES.minGapMinutes])
  })

  it('الاستيراد: أسماءُ المنصّات بالعربيّة والإنجليزيّة، ومفتاحُ كلّ صفٍّ لمنصّته', async () => {
    const acc = (platform: string) => ({ id: 'acc-' + platform, platform, kind: 'member', displayName: 'عمر', status: 'active', createdAt: '2026-09-01 00:00:00', expiresAt: '2027-01-01 00:00:00' })
    const facts = { accounts: FOUR.map(acc), uploads: [], now: new Date('2026-11-25T08:00:00Z'), zone: 'Asia/Riyadh', publishable: new Set(FOUR) } as unknown as PlanFacts
    const csv = ['date,time,platform,text', '2026-12-02,10:00,تيك توك,نصّ', '2026-12-02,10:00,TikTok,نصّ', '2026-12-02,10:00,إنستغرام,نصّ', '2026-12-02,10:00,Instagram,نصّ', '2026-12-02,10:00,LinkedIn,نصّ', '2026-12-02,10:00,x,نصّ'].join('\n')
    const rows = readPlan(csv, facts).rows
    expect(rows.map((r) => r.platform)).toEqual(['tiktok', 'tiktok', 'instagram', 'instagram', 'linkedin', 'x'])
    const keys = await Promise.all(rows.map(rowKey))
    // ‏«تيك توك» و«TikTok» بالنصّ نفسِه صفٌّ واحد، والمنصّاتُ الأربع أربعةُ مفاتيح
    expect(new Set(keys).size).toBe(4)
  })

  it('التسكين: أربعُ منشورات بمفاتيح `plan:{org}:{period}:{item}:{platform}` فريدةٍ لكلّ منصّة', () => {
    const binds: unknown[][] = []
    const db = { prepare: (sql: string) => ({ bind: (...a: unknown[]) => { binds.push([sql, ...a]); return { run: async () => ({}) } } }) } as unknown as Db
    const entry = (platform: string): SnapshotEntry => ({ item: '07', platform, date: '2026-12-02', time: '10:00', format: platform === 'tiktok' ? 'مقطع' : 'منشور', idea: 'فكرة', text: 'نصّ', media: null, mediaName: null, problems: [] })
    const changes: Change[] = FOUR.map((p) => ({ item: '07', platform: p, kind: 'added', before: null, after: entry(p) }))
    for (const ch of changes) changeStatements({ db, org: 'org-a', revisionId: 'rev', copySha: null }, ch, null, false)
    const inserts = binds.filter((b) => String(b[0]).includes('INSERT OR IGNORE INTO posts'))
    expect(inserts).toHaveLength(4)
    const keys = inserts.map((b) => b[5])
    expect(keys).toEqual(FOUR.map((p) => packageKey('org-a', '2026-12', '07', p)))
    expect(new Set(keys).size).toBe(4)
    expect(inserts.map((b) => b[2])).toEqual([...FOUR])
    expect(inserts.every((b) => b[6] === 'org-a')).toBe(true)
  })
})

describe('مراجعة D-399: بطاقةُ الخطّة تحمل نوعَ وسيطها', () => {
  const check = (platform: string, c: { post: unknown; mediaMime?: string | null }) => planChecks({ planId: 'p', activePlatforms: [...FOUR], others: [], now: { day: '2026-12-01', minutes: 0 },
    items: [{ key: 'k', platform, at: { day: '2026-12-02', minutes: 600 }, text: 'نصّ', ...cardMedia(c) }] }).some((f) => f.rule === 'no_media')
  it('TikTok بمسوّدةٍ بصورةٍ أو بلا وسيطٍ ممنوع، وبمقطعٍ يمرّ', () => {
    expect(check('tiktok', { post: { id: 'x' }, mediaMime: 'image/png' })).toBe(true)
    expect(check('tiktok', { post: { id: 'x' }, mediaMime: null })).toBe(true)
    expect(check('tiktok', { post: { id: 'x' }, mediaMime: 'video/mp4' })).toBe(false)
    expect(check('instagram', { post: { id: 'x' }, mediaMime: null })).toBe(true)
  })
  it('البندُ الذي لم يُكتب لا يُمنع', () => {
    expect(cardMedia({ post: null, mediaMime: null })).toEqual({})
    expect(check('tiktok', { post: null })).toBe(false)
  })
})
