/** سببُ الفشل بالعربيّة — **ولا حارسَ برمزٍ لا جملةَ له** (D-172). */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REASONS, whyFailed } from './reasons'

describe('القاموس', () => {
  it('كلّ رمز يكتبه الناشر له جملة', () => {
    const src = readFileSync(new URL('./publisher.ts', import.meta.url), 'utf8')
    const codes = new Set<string>()
    for (const m of src.matchAll(/preflightFailed\(db, post, '([a-z_]+)/g)) codes.add(m[1]!)
    for (const m of src.matchAll(/reason: '([a-z_]+)'/g)) codes.add(m[1]!)
    for (const m of src.matchAll(/'(missing_(?:media|publish)_scope)'/g)) codes.add(m[1]!)
    expect(codes.size).toBeGreaterThan(5)
    for (const code of codes) expect(REASONS[code], code).toBeDefined()
  })

  it('وكلُّ رمزٍ في سلسلة X له جملة، والمعلّقةُ تُسمّى برقمها وفعلُها «قل ما وجدت» لا «أعده» (مراجعة D-324)', () => {
    const src = readFileSync(new URL('./xThread.ts', import.meta.url), 'utf8')
    const codes = new Set([...src.matchAll(/`(thread_[a-z_]+):/g)].map((m) => m[1]!))
    expect([...codes].sort()).toEqual(['thread_account', 'thread_changed', 'thread_unconfirmed'])
    for (const code of codes) expect(REASONS[code], code).toBeDefined()
    const open = whyFailed('thread_unconfirmed: التغريدة 2 من 3 أُرسلت ولم يُؤكَّد نشرُها (انقضت المهلة قبل جوابها) — تحقّق على X ثمّ قل ما وجدت', 'x')
    expect(open).toEqual({ text: 'التغريدة 2 من 3 أُرسلت ولم يُؤكَّد نشرُها (انقضت المهلة قبل جوابها) — تحقّق على X ثمّ قل ما وجدت', action: 'confirm' })
    expect(whyFailed('thread_account: التغريدة 1 نُشرت من حسابٍ آخر', 'x').action).toBe('requeue')
  })

  it('والنطاق الناقص يُسمّى، والرمز لا يظهر', () => {
    const r = whyFailed('missing_publish_scope: w_member_social', 'linkedin')
    expect(r.text).toContain('w_member_social')
    expect(r.text).not.toContain('missing_')
    expect(r.action).toBe('relink')
  })

  it('وجواب المنصّة يُقال كما جاء، والجملة العربيّة كما كُتبت', () => {
    expect(whyFailed('Not enough permissions', 'linkedin').text).toBe('ردّته LinkedIn: Not enough permissions')
    expect(whyFailed('حساب صفحة — والنشر باسم الصفحة لم يُبن بعد', 'linkedin').action).toBe('none')
    expect(whyFailed(null, 'x').action).toBe('requeue')
  })

  it('وجواب المنصّة بعد بادئتها يُعاد: سببُه بلفظه، وزرّ «أعده إلى المعتمَد» (D-176)', () => {
    const r = whyFailed('x: تعذّر رفع الوسيط (Invalid Request)', 'x')
    expect(r.text).toBe('ردّته X: تعذّر رفع الوسيط (Invalid Request)')
    expect(r.action).toBe('requeue')
    // ‏ورمزٌ معروفٌ يبقى على جملته، وجملةُ حارسٍ بلا بادئةٍ تبقى بلا فعل
    expect(whyFailed('token_expired', 'x').action).toBe('relink')
    expect(whyFailed('حساب صفحة — والنشر باسم الصفحة لم يُبن بعد', 'linkedin').action).toBe('none')
  })
})

describe('جمل HTTP بالعربيّة (D-202)', () => {
  it('«Internal Server Error» تُقال عطلًا في خادمها، واسم المنصّة كما يُقرأ', () => {
    expect(whyFailed('linkedin: Internal Server Error', 'linkedin').text).toBe('ردّته LinkedIn: عطل في خادمها (500)')
    expect(whyFailed('Service Unavailable', 'youtube').text).toBe('ردّته YouTube: خدمتُها متوقّفة مؤقّتًا (503)')
    // ‏وما لا نعرفه يبقى كما جاء
    expect(whyFailed('x: duplicate content', 'x').text).toBe('ردّته X: duplicate content')
  })
})
