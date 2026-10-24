import { describe, expect, it } from 'vitest'
import { allows, orgAllowed, requiredRole } from './access'

describe('من يملك ماذا (D-272)', () => {
  it('الدورُ يملك ما تحته', () => {
    expect(allows('publisher', 'editor')).toBe(true)
    expect(allows('editor', 'publisher')).toBe(false)
    expect(allows('admin', 'owner')).toBe(false)
  })

  it('القراءةُ للقارئ إلّا الفريقَ والإعدادات، والدخولُ مفتوح', () => {
    expect(requiredRole('GET', '/panel', null)).toBe('viewer')
    expect(requiredRole('GET', '/panel/client', null)).toBe('viewer')
    expect(requiredRole('GET', '/panel/settings', null)).toBe('admin')
    expect(requiredRole('GET', '/panel/team', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/login', null)).toBeNull()
    expect(requiredRole('POST', '/panel/2fa/totp', null)).toBeNull()
  })

  it('الكتابةُ للمحرّر، والاعتمادُ والجدولةُ للناشر، والربطُ للمدير، والأمانُ للمالك', () => {
    expect(requiredRole('POST', '/panel/drafts/write', null)).toBe('editor')
    expect(requiredRole('POST', '/panel/plan/item', null)).toBe('editor')
    expect(requiredRole('POST', '/panel/drafts/decide', 'save')).toBe('editor')
    expect(requiredRole('POST', '/panel/drafts/decide', 'approve')).toBe('publisher')
    expect(requiredRole('POST', '/panel/drafts/decide', 'reject')).toBe('publisher')
    expect(requiredRole('POST', '/panel/plan/start', null)).toBe('publisher')
    expect(requiredRole('POST', '/panel/uploads/u1/schedule', null)).toBe('publisher')
    expect(requiredRole('GET', '/oauth/linkedin/start', null)).toBe('admin')
    expect(requiredRole('POST', '/panel/channels/disconnect', null)).toBe('admin')
    expect(requiredRole('POST', '/panel/security/totp/start', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/team/invite', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/providers/key', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/orgs/switch', null)).toBe('viewer')
  })

  it('وبابٌ جديدٌ لم يُصنَّف للمالك وحدَه — يُغلَق لا يُفتح', () => {
    expect(requiredRole('POST', '/panel/something-new', null)).toBe('owner')
  })

  it('الشركاتُ: الكلُّ أو القائمة', () => {
    expect(orgAllowed({ orgs: '*' }, 'org_x')).toBe(true)
    expect(orgAllowed({ orgs: ['org_a'] }, 'org_a')).toBe(true)
    expect(orgAllowed({ orgs: ['org_a'] }, 'org_b')).toBe(false)
  })
})
