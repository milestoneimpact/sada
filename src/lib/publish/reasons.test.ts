/** سببُ الفشل بالعربيّة — **ولا حارسَ برمزٍ لا جملةَ له** (D-172). */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REASONS, whyFailed } from './reasons'

describe('القاموس', () => {
  it('كلُّ رمزٍ يكتبه الناشرُ له جملة', () => {
    const src = readFileSync(new URL('./publisher.ts', import.meta.url), 'utf8')
    const codes = new Set<string>()
    for (const m of src.matchAll(/preflightFailed\(db, post, '([a-z_]+)/g)) codes.add(m[1]!)
    for (const m of src.matchAll(/reason: '([a-z_]+)'/g)) codes.add(m[1]!)
    for (const m of src.matchAll(/'(missing_(?:media|publish)_scope)'/g)) codes.add(m[1]!)
    expect(codes.size).toBeGreaterThan(5)
    for (const code of codes) expect(REASONS[code], code).toBeDefined()
  })

  it('والنطاقُ الناقصُ يُسمّى، والرمزُ لا يظهر', () => {
    const r = whyFailed('missing_publish_scope: w_member_social', 'linkedin')
    expect(r.text).toContain('w_member_social')
    expect(r.text).not.toContain('missing_')
    expect(r.action).toBe('relink')
  })

  it('وجوابُ المنصّة يُقال كما جاء، والجملةُ العربيّةُ كما كُتبت', () => {
    expect(whyFailed('Not enough permissions', 'linkedin').text).toBe('ردّته LinkedIn: Not enough permissions')
    expect(whyFailed('حسابُ صفحةٍ — والنشرُ باسم الصفحة لم يُبنَ بعد', 'linkedin').action).toBe('none')
    expect(whyFailed(null, 'x').action).toBe('requeue')
  })
})
