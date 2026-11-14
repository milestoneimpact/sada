import { describe, expect, it } from 'vitest'
import { allows, enrolMayOpen, factorRequired, needsStepUp, orgAllowed, pendingMayOpen, requiredRole } from './access'

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

  it('الكتابةُ للمحرّر، والاعتمادُ والجدولةُ للناشر، والربطُ للمدير، والفريقُ والجلساتُ للمالك', () => {
    // ‏(D-318) كان «اكتب مسوّدة من مصدر» للمحرّر، وهو نداءٌ مدفوع: صار للناشر (أدناه «الإنفاقُ لمن يعتمد»)
    expect(requiredRole('POST', '/panel/drafts/write', null)).toBe('publisher')
    expect(requiredRole('POST', '/panel/plan/item', null)).toBe('editor')
    expect(requiredRole('POST', '/panel/drafts/decide', 'save')).toBe('editor')
    expect(requiredRole('POST', '/panel/drafts/decide', 'approve')).toBe('publisher')
    expect(requiredRole('POST', '/panel/drafts/decide', 'reject')).toBe('publisher')
    expect(requiredRole('POST', '/panel/plan/start', null)).toBe('publisher')
    expect(requiredRole('POST', '/panel/uploads/u1/schedule', null)).toBe('publisher')
    expect(requiredRole('GET', '/oauth/linkedin/start', null)).toBe('admin')
    expect(requiredRole('POST', '/panel/channels/disconnect', null)).toBe('admin')
    // ‏‏D-317: عواملُ الحساب نفسِه لكلّ دور — المسارُ لا يمسّ إلّا عواملَ بريد الجلسة، والمدعوُّ يسجّل عاملَه الإلزاميّ
    expect(requiredRole('POST', '/panel/security/totp/start', null)).toBe('viewer')
    expect(requiredRole('POST', '/panel/stepup/totp', null)).toBe('viewer')
    expect(requiredRole('POST', '/panel/sessions/revoke-all', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/team/invite', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/providers/key', null)).toBe('owner')
    expect(requiredRole('POST', '/panel/orgs/switch', null)).toBe('viewer')
  })

  /**
   * ‏**وصفحةُ البوّابات بدور «ما عليك» نفسِه** (دمجُ D-318 مع D-324): كانت طيّةً فيها فلا يراها إلّا من يراها. وبابُ قراءةٍ
   * ‏جديدٌ لا يُصنَّف يُفتح للقارئ (القراءةُ مفتوحة)، فتُسمّى في القاعدة مع «ما عليك» لا بعدها.
   */
  it('وبوّابات المراحل بدور «ما عليك» لا أدنى', () => {
    for (const method of ['GET', 'HEAD']) {
      expect(requiredRole(method, '/panel/gates', null)).toBe(requiredRole(method, '/panel/tasks', null))
      expect(requiredRole(method, '/panel/gates', null)).toBe('admin')
    }
  })

  /**
   * ‏**وصفحةُ «تفتح قدرة» بدور «ما عليك» نفسِه** (متابعة D-324): مهامُّ القدرة كانت في «ما عليك» فلا يراها إلّا من يراها،
   * ‏وخرجت إلى صفحتها لوزن الأولى. والبابُ الجديد تحت `/panel/tasks/` فيقع في قاعدة «ما عليك» نفسِها، وهذا يحرسه أن يبقى.
   */
  it('و«تفتح قدرة» بدور «ما عليك» لا أدنى', () => {
    for (const method of ['GET', 'HEAD']) {
      expect(requiredRole(method, '/panel/tasks/later', null)).toBe(requiredRole(method, '/panel/tasks', null))
      expect(requiredRole(method, '/panel/tasks/later', null)).toBe('admin')
    }
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

describe('الجلسةُ الناقصةُ والفعلُ الحسّاس (D-317)', () => {
  it('العاملُ الثاني إلزاميٌّ للمالك والمدير والناشر، واختياريٌّ للمحرّر والقارئ', () => {
    expect(['owner', 'admin', 'publisher', 'editor', 'viewer'].map((r) => factorRequired(r as never))).toEqual([true, true, true, false, false])
  })

  it('المعلَّقةُ لا تفتح إلّا شاشةَ عاملها وأبوابَ الدخول', () => {
    for (const p of ['/panel/2fa', '/panel/2fa/totp', '/panel/login', '/panel/logout', '/panel/passkey/login']) expect(pendingMayOpen(p), p).toBe(true)
    for (const p of ['/panel', '/panel/settings', '/panel/enrol', '/panel/stepup', '/panel/plan-import/template.csv']) expect(pendingMayOpen(p), p).toBe(false)
  })

  it('جلسةُ التسجيل لا تفتح إلّا صفحتَه وتسجيلَ العامل والتحقّقَ والمساعدةَ والخروج', () => {
    expect(enrolMayOpen('GET', '/panel/enrol')).toBe(true)
    expect(enrolMayOpen('GET', '/panel/help')).toBe(true)
    expect(enrolMayOpen('GET', '/panel/stepup')).toBe(true)
    expect(enrolMayOpen('POST', '/panel/security/passkey/register')).toBe(true)
    expect(enrolMayOpen('POST', '/panel/security/totp/confirm')).toBe(true)
    expect(enrolMayOpen('POST', '/panel/stepup/code/send')).toBe(true)
    expect(enrolMayOpen('POST', '/panel/logout')).toBe(true)
    for (const [m, p] of [['GET', '/panel'], ['GET', '/panel/settings'], ['POST', '/panel/security/recovery/issue'],
      ['POST', '/panel/security/passkey/delete'], ['POST', '/panel/team/invite'], ['GET', '/oauth/x/start']] as const) {
      expect(enrolMayOpen(m, p), `${m} ${p}`).toBe(false)
    }
  })

  it('الأفعالُ الحسّاسةُ بتحقّقٍ حديث — والإعدادُ العاديُّ لا', () => {
    for (const p of ['/panel/security/passkey/challenge', '/panel/security/passkey/register', '/panel/security/passkey/delete',
      '/panel/security/totp/start', '/panel/security/totp/remove', '/panel/security/recovery/issue', '/panel/sessions/revoke-all',
      '/panel/team/invite', '/panel/team/revoke', '/panel/providers/add', '/panel/providers/key', '/panel/providers/delete',
      '/panel/channels/disconnect']) expect(needsStepUp('POST', p), p).toBe(true)
    expect(needsStepUp('GET', '/oauth/linkedin/start')).toBe(true)
    expect(needsStepUp('POST', '/panel/settings', 'alert_webhook')).toBe(true)
    // ‏وأبوابُ الطرفيّة (D-318): رمزٌ ثابتٌ بلا عاملٍ ثانٍ لا تفتحه جلسةٌ مسروقة
    expect(needsStepUp('POST', '/panel/settings', 'admin_api')).toBe(true)
    expect(needsStepUp('POST', '/panel/settings', 'paused')).toBe(false)
    expect(needsStepUp('POST', '/panel/security/totp/confirm')).toBe(false)
    expect(needsStepUp('POST', '/panel/drafts/write')).toBe(false)
    expect(needsStepUp('GET', '/panel/settings')).toBe(false)
  })
})

describe('الإنفاقُ لمن يعتمد (D-318)', () => {
  it.each([
    '/panel/plan/generate', '/panel/drafts/write', '/panel/drafts/idea',
    '/panel/media/generate', '/panel/media/regenerate', '/panel/media/animate', '/panel/uploads/u1/captions',
  ])('%s للناشر فما فوق — لا للمحرّر', (path) => {
    expect(requiredRole('POST', path)).toBe('publisher')
    expect(allows('editor', requiredRole('POST', path)!)).toBe(false)
  })

  it.each([
    ['/panel/drafts/decide', 'save'], ['/panel/media/reject', null], ['/panel/uploads/start', null],
    ['/panel/plan/item', null], ['/panel/client/brief', null], ['/panel/assets/upload', null], ['/panel/uploads/u1/posts', null],
  ] as const)('وما لا يُنفق يبقى للمحرّر: %s', (path, action) => {
    expect(requiredRole('POST', path, action)).toBe('editor')
  })
})

/**
 * ‏**«بنفسي» للمحرّر في سطرٍ لا يشاركه بابٌ مدفوع** (D-324): يكتب ولا ينفق، فلا يتبع ما يُقيَّد من الكتابة المدفوعة.
 * ‏و«تراجَع» بعد الجدولة للناشر كالجدولة نفسِها، ولا يحتاج تحقّقًا للتوّ: يُعيد ما فعله الناشرُ قبل ثوانٍ.
 */
describe('«بنفسي» و«تراجَع» بعد الجدولة (D-324)', () => {
  it('«بنفسي» للمحرّر، و«تراجَع» بعد الجدولة للناشر', () => {
    expect(requiredRole('POST', '/panel/drafts/own', null)).toBe('editor')
    expect(requiredRole('POST', '/panel/drafts/undo-schedule', null)).toBe('publisher')
    // ‏و«قل ما وجدت» لتغريدةٍ معلّقة (مراجعة D-324) دورُ «أعده» نفسُه: يعيد المنشورَ إلى المعتمَد
    expect(requiredRole('POST', '/panel/drafts/thread-check', null)).toBe('publisher')
    expect(needsStepUp('POST', '/panel/drafts/own')).toBe(false)
    expect(needsStepUp('POST', '/panel/drafts/undo-schedule')).toBe(false)
  })
})

/** الحذفُ والتصدير (D-322): لمن يعتمد، والمصدرُ للمدير كإضافته، والعميلُ كلُّه للمالك وبتحقّقٍ للتوّ. */
describe('أبوابُ الحذف والتصدير (D-322)', () => {
  it('الحذفُ والتراجعُ للناشر — والمقطعُ لا يتبع سطرَ المحرّر في «uploads»', () => {
    for (const path of ['/panel/drafts/delete', '/panel/uploads/u1/delete', '/panel/assets/delete', '/panel/trash/restore']) {
      expect(requiredRole('POST', path), path).toBe('publisher')
    }
    expect(requiredRole('POST', '/panel/sources/delete')).toBe('admin')
  })

  it('وتصديرُ العميل وحذفُه للمالك، ولا يجريان بلا تحقّقٍ حديث', () => {
    expect(requiredRole('POST', '/panel/orgs/delete')).toBe('owner')
    expect(requiredRole('GET', '/panel/orgs/export')).toBe('owner')
    expect(needsStepUp('POST', '/panel/orgs/delete')).toBe(true)
    expect(needsStepUp('GET', '/panel/orgs/export')).toBe(true)
    expect(needsStepUp('HEAD', '/panel/orgs/export')).toBe(true)
    // ‏وحذفُ مسوّدةٍ يُتراجَع عنه: لا يُسأل عن العامل
    expect(needsStepUp('POST', '/panel/drafts/delete')).toBe(false)
  })
})
