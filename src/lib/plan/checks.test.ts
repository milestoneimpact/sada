import { describe, expect, it } from 'vitest'
import { blockedKeys, DEFAULT_RULES, inQuiet, parseRulesForm, planChecks, planFix, rulesFromRow, summarize, type CheckInput, type CheckItem } from './checks'
import { requiredRole } from '../access'

const at = (day: string, time: string): { day: string; minutes: number } => ({ day, minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) })
const item = (key: string, platform: string, day: string, time: string, extra: Partial<CheckItem> = {}): CheckItem =>
  ({ key, platform, at: at(day, time), text: 'نصّ ' + key, ...extra })
const input = (items: CheckItem[], extra: Partial<CheckInput> = {}): CheckInput =>
  ({ planId: 'p1', items, others: [], activePlatforms: ['x', 'linkedin'], now: at('2026-11-01', '00:00'), ...extra })
const rules = (findings: ReturnType<typeof planChecks>): string[] => findings.map((f) => f.rule + ':' + f.severity)

describe('planChecks: جدول القواعد حالةً حالة (D-383 · المرحلة ٥)', () => {
  it('خطّةٌ نظيفة: لا شيء', () => {
    expect(planChecks(input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'x', '2026-11-20', '12:00')]))).toEqual([])
  })

  it('نفس الخانة: الحسابُ نفسُه بأقلّ من ٩٠ دقيقة تحذير، وإصلاحُه «أزِح»', () => {
    const f = planChecks(input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'x', '2026-11-20', '10:00')]))
    expect(rules(f)).toEqual(['same_slot:warn'])
    expect(f[0]!.fix).toBe('shift')
    // ‏ومنصّتان مختلفتان لا تتعارضان
    expect(planChecks(input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'linkedin', '2026-11-20', '09:30')]))).toEqual([])
  })

  it('تطابقٌ تامّ: الدقيقةُ نفسُها منع', () => {
    const f = planChecks(input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'x', '2026-11-20', '09:00')]))
    expect(rules(f)).toEqual(['exact:block'])
    expect([...blockedKeys(f)]).toEqual(['a', 'b'])
  })

  it('محتوى مكرّر: البصمةُ نفسُها تحذيرٌ بـ«ادمج»', () => {
    const f = planChecks(input([item('a', 'x', '2026-11-20', '09:00', { text: 'نفسه' }), item('b', 'x', '2026-11-22', '09:00', { text: '  نفسه ' })]))
    expect(rules(f)).toEqual(['duplicate:warn'])
    expect(f[0]!.fix).toBe('merge')
    // ‏والمادّةُ نفسُها من مصدرين بمفتاحها
    const g = planChecks(input([item('a', 'x', '2026-11-20', '09:00', { contentKey: 'item:06' }), item('b', 'x', '2026-11-22', '09:00', { contentKey: 'item:06' })]))
    expect(rules(g)).toEqual(['duplicate:warn'])
  })

  it('تداخلٌ مع خطّةٍ أخرى في اليوم نفسِه: تحذير', () => {
    const f = planChecks(input([item('a', 'x', '2026-11-20', '09:00')], { others: [{ id: 'o', platform: 'linkedin', planId: 'p2', at: at('2026-11-20', '15:00') }] }))
    expect(rules(f)).toEqual(['other_plan:warn'])
  })

  it('تداخلٌ مع منشورٍ يدويٍّ داخل الفاصل: تحذير بـ«أزِح»', () => {
    const f = planChecks(input([item('a', 'x', '2026-11-20', '09:00')], { others: [{ id: 'o', platform: 'x', planId: null, at: at('2026-11-20', '09:45') }] }))
    expect(rules(f)).toEqual(['near_post:warn'])
  })

  it('سقفُ المنصّة: فوقه تحذير، وعند الضعف منع', () => {
    const four = ['08:00', '10:00', '12:00', '14:00'].map((t, i) => item('x' + String(i), 'x', '2026-11-20', t))
    expect(rules(planChecks(input(four)))).toEqual(['platform_cap:warn'])
    const six = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].map((t, i) => item('x' + String(i), 'x', '2026-11-20', t))
    expect(rules(planChecks(input(six)))).toEqual(['platform_cap:block', 'daily_total:warn'])
  })

  it('الحملُ اليوميُّ الكلّيّ فوق ٥: تحذير', () => {
    const items = [
      ...['08:00', '11:00', '14:00'].map((t, i) => item('x' + String(i), 'x', '2026-11-20', t)),
      ...['09:00', '13:00'].map((t, i) => item('l' + String(i), 'linkedin', '2026-11-20', t)),
    ]
    expect(planChecks(input(items))).toEqual([])
    const f = planChecks(input(items, { others: [{ id: 'o', platform: 'instagram', planId: null, at: at('2026-11-20', '20:00') }] }))
    expect(rules(f)).toEqual(['daily_total:warn'])
  })

  it('ساعاتُ الهدوء تعبر منتصف الليل: 23:30 و06:30 تحذير، و07:00 لا', () => {
    expect(inQuiet(23 * 60 + 30, DEFAULT_RULES)).toBe(true)
    expect(inQuiet(6 * 60 + 30, DEFAULT_RULES)).toBe(true)
    expect(inQuiet(7 * 60, DEFAULT_RULES)).toBe(false)
    expect(rules(planChecks(input([item('a', 'x', '2026-11-20', '23:30')])))).toEqual(['quiet:warn'])
  })

  it('موعدٌ مضى منعٌ لهذا البند، والمنشورُ لا يُعدّ', () => {
    const now = at('2026-11-20', '12:00')
    expect(rules(planChecks(input([item('a', 'x', '2026-11-20', '09:00')], { now })))).toEqual(['past:block'])
    expect(planChecks(input([item('a', 'x', '2026-11-20', '09:00', { status: 'published' })], { now }))).toEqual([])
  })

  it('نصٌّ ناقص ووسيطٌ ناقص وصيغةٌ غير مناسبة: منعٌ لهذا البند', () => {
    expect(rules(planChecks(input([item('a', 'x', '2026-11-20', '09:00', { text: null })])))).toEqual(['no_text:block'])
    expect(rules(planChecks(input([item('a', 'x', '2026-11-20', '09:00', { mediaMissing: true })])))).toEqual(['no_media:block'])
    expect(rules(planChecks(input([item('a', 'linkedin', '2026-11-20', '09:00', { kind: 'thread' })])))).toEqual(['bad_format:block'])
    expect(planChecks(input([item('a', 'x', '2026-11-20', '09:00', { kind: 'thread' })]))).toEqual([])
  })

  it('حسابٌ غائب: منعٌ للمنصّة كلّها', () => {
    const f = planChecks(input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'x', '2026-11-21', '09:00')], { activePlatforms: ['linkedin'] }))
    expect(rules(f)).toEqual(['no_account:block'])
    expect(f[0]!.keys).toEqual(['a', 'b'])
  })

  it('العتباتُ من schedule_rules لا من الثوابت', () => {
    const tight = { ...DEFAULT_RULES, minGapMinutes: 30, platformCaps: { x: 10 } }
    expect(planChecks(input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'x', '2026-11-20', '10:00')]), tight)).toEqual([])
    expect(summarize(planChecks(input([item('a', 'x', '2026-11-20', '09:00', { text: null })])))).toEqual({ warn: 0, block: 1, blockedItems: 1 })
  })
})

describe('planFix: الإصلاحُ بضغطة', () => {
  it('«أزِح» يُبقي الأوّلَ ويضع الثاني في أقرب خانةٍ تحترم الفاصل', () => {
    const inp = input([item('a', 'x', '2026-11-20', '09:00'), item('b', 'x', '2026-11-20', '09:00')])
    const plan = planFix(inp, DEFAULT_RULES, planChecks(inp)[0]!)
    expect(plan).toEqual({ kind: 'move', moves: [{ key: 'b', to: at('2026-11-20', '10:30') }] })
  })

  it('«أزِح» لا ينقل إلى ساعات الهدوء: من 22:00 إلى ما قبلها', () => {
    const inp = input([item('a', 'x', '2026-11-20', '22:00'), item('b', 'x', '2026-11-20', '22:00')])
    const plan = planFix(inp, DEFAULT_RULES, planChecks(inp)[0]!)
    expect(plan).toEqual({ kind: 'move', moves: [{ key: 'b', to: at('2026-11-20', '20:30') }] })
  })

  it('«وزّع» ينقل الزائد إلى أقرب يومٍ فيه متّسع، ثمّ يزول التحذير', () => {
    const four = ['08:00', '10:00', '12:00', '14:00'].map((t, i) => item('x' + String(i), 'x', '2026-11-20', t))
    const inp = input(four)
    const plan = planFix(inp, DEFAULT_RULES, planChecks(inp)[0]!)
    expect(plan).toEqual({ kind: 'move', moves: [{ key: 'x3', to: at('2026-11-21', '14:00') }] })
    const after = four.map((i) => (i.key === 'x3' ? { ...i, at: at('2026-11-21', '14:00') } : i))
    expect(planChecks(input(after))).toEqual([])
  })

  it('«ادمج» يُبقي الأوّلَ ويحذف المكرَّر', () => {
    const inp = input([item('a', 'x', '2026-11-20', '09:00', { text: 'نفسه' }), item('b', 'x', '2026-11-22', '09:00', { text: 'نفسه' })])
    expect(planFix(inp, DEFAULT_RULES, planChecks(inp)[0]!)).toEqual({ kind: 'remove', keys: ['b'] })
  })

  it('الهدوءُ إلى 08:00 من يومه، والماضي إلى أقرب يومٍ قادم بساعته', () => {
    const q = input([item('a', 'x', '2026-11-20', '23:30')])
    expect(planFix(q, DEFAULT_RULES, planChecks(q)[0]!)).toEqual({ kind: 'move', moves: [{ key: 'a', to: at('2026-11-20', '08:00') }] })
    const p = input([item('a', 'x', '2026-11-18', '09:00')], { now: at('2026-11-20', '12:00') })
    expect(planFix(p, DEFAULT_RULES, planChecks(p)[0]!)).toEqual({ kind: 'move', moves: [{ key: 'a', to: at('2026-11-21', '09:00') }] })
  })

  it('ما نُشر لا يُحرَّك', () => {
    const inp = input([item('a', 'x', '2026-11-20', '09:00', { status: 'published' }), item('b', 'x', '2026-11-20', '09:00', { status: 'published' })])
    expect(planFix(inp, DEFAULT_RULES, planChecks(inp)[0]!).kind).toBe('none')
  })
})

describe('العتبات: القراءةُ والنموذج والصلاحيّة', () => {
  it('صفٌّ غائبٌ أو فاسد يأخذ الافتراضيّ', () => {
    expect(rulesFromRow(null)).toEqual(DEFAULT_RULES)
    expect(rulesFromRow({ platform_caps_json: '{bad', daily_total_cap: 7, quiet_start: 'x' })).toEqual({ ...DEFAULT_RULES, dailyTotalCap: 7 })
    expect(rulesFromRow({ platform_caps_json: '{"x":4,"linkedin":0}' }).platformCaps).toEqual({ x: 4 })
  })

  it('النموذجُ يُرفض بسببٍ عربيّ ويُقبل صحيحًا', () => {
    const form = (o: Record<string, string>): { get(n: string): unknown } => ({ get: (n) => o[n] ?? null })
    const ok = { cap_x: '4', cap_linkedin: '2', daily_total: '6', min_gap: '60', jitter: '5', quiet_start: '22:00', quiet_end: '06:30' }
    expect(parseRulesForm(form(ok))).toEqual({ ok: true, rules: { platformCaps: { x: 4, linkedin: 2 }, dailyTotalCap: 6, minGapMinutes: 60, quietStart: '22:00', quietEnd: '06:30', jitterMinutes: 5 } })
    expect(parseRulesForm(form({ ...ok, cap_x: '0' }))).toEqual({ ok: false, reason: 'سقف المنصّة عددٌ بين 1 و20' })
    expect(parseRulesForm(form({ ...ok, quiet_end: '25:00' })).ok).toBe(false)
  })

  it('ضبطُ القواعد للمدير، والإصلاحُ بضغطة لمن يجدول', () => {
    expect(requiredRole('POST', '/panel/plan-rules')).toBe('admin')
    expect(requiredRole('POST', '/panel/plan/check/fix')).toBe('publisher')
  })
})
