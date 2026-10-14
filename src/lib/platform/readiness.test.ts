/**
 * سلّمُ الجاهزيّة (D-158) — **كلُّ درجةٍ من صفٍّ لا من كلمة.**
 */
import { describe, expect, it } from 'vitest'
import { viewChannels, type LinkedAccount } from '../channels'
import type { AppStatus } from '../oauth/apps'
import type { AccountHealth, PlatformPost, PlatformTally } from './screen'
import { readiness } from './readiness'

const now = new Date('2026-09-27T12:00:00Z')

function account(over: Partial<LinkedAccount> = {}): LinkedAccount {
  return {
    id: 'a1', platform: 'x', kind: 'member', displayName: '@omar', status: 'active',
    createdAt: '2026-09-01 00:00:00', expiresAt: '2026-10-10 00:00:00', ...over,
  }
}
function viewOf(accounts: LinkedAccount[], present = true, platform = 'x') {
  return viewChannels(accounts, () => present).find((v) => v.spec.id === platform)!
}
function health(over: Partial<AccountHealth> = {}): AccountHealth {
  return {
    status: 'active', expiresAt: '2026-10-10 00:00:00', refreshExpiresAt: '2026-12-01 00:00:00',
    refreshedAt: '2026-09-27 10:30:00', needsReauthAt: null, alerts: [], ...over,
  }
}
const app: AppStatus = {
  platform: 'x', source: 'vault', clientId: 'cid', hint: '••••', updatedAt: null, updatedBy: null,
  secretNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'], verifiedAt: '2026-09-20 00:00:00', verifiedKind: 'accepted',
}
const tally = (over: Partial<PlatformTally> = {}): PlatformTally => ({
  published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null, ...over,
})
const post = (over: Partial<PlatformPost> = {}): PlatformPost => ({
  id: 'p1', text: 'نصّ', status: 'queued', scheduledAt: null, createdAt: '2026-09-26 00:00:00',
  accountName: '@omar', platformPostId: null, publishedAt: null, lastError: null, lastFailedAt: null,
  hasMedia: false, costUsd: 0, ...over,
})

describe('السلّم يقرأ الصفوف', () => {
  it('حسابٌ «مربوط» بلا صفّ tokens: الإذنُ ساقطٌ والحكمُ «لا تنشر»', () => {
    const r = readiness({ view: viewOf([account({ expiresAt: null })]), app, health: {}, tally: tally(), posts: [], now })
    const token = r.rungs.find((x) => x.key === 'token')!
    expect(token.state).toBe('failed')
    expect(token.note).toContain('لا إذنَ وصولٍ')
    expect(r.verdict.kind).toBe('bad')
    expect(r.next?.action?.href).toBe('/oauth/x/start')
  })

  it('تجديدٌ وقع وإذنٌ صالح ونشرٌ سابق: تعمل وتنشر', () => {
    const r = readiness({
      view: viewOf([account()]), app, health: { a1: health() },
      tally: tally({ published: 3, lastPublishedAt: '2026-09-26 09:00:00' }), posts: [], now,
    })
    expect(r.rungs.map((x) => x.state)).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(r.verdict).toEqual({ kind: 'ok', text: 'تعمل وتنشر' })
    // ‏والعددُ بمعدوده (D-183): «صالحٌ 12 يومًا»، و«صالحٌ يومين» لا «صالحٌ 2 يوما»
    expect(r.rungs[2]!.note).toMatch(/^صالحٌ \d+ (يومًا|أيّام)$/)
  })

  it('needs_reauth مع تاريخه: الإذنُ ساقطٌ منذ يومه وزرُّه «جدّد الإذن»', () => {
    const r = readiness({
      view: viewOf([account({ status: 'needs_reauth' })]), app,
      health: { a1: health({ status: 'needs_reauth', needsReauthAt: '2026-09-26 03:01:00' }) },
      tally: tally(), posts: [], now,
    })
    const token = r.rungs.find((x) => x.key === 'token')!
    expect(token.state).toBe('failed')
    expect(token.note).toContain('2026-09-26')
    expect(token.action?.label).toBe('جدّد الإذن')
  })

  it('إذنٌ انتهى وإذنُ تجديدٍ قائم: ينتظر الدورةَ لا المالك', () => {
    const r = readiness({
      view: viewOf([account()]), app,
      health: { a1: health({ expiresAt: '2026-09-27 09:00:00', refreshedAt: null }) },
      tally: tally(), posts: [], now,
    })
    expect(r.rungs[2]!.state).toBe('waiting')
    expect(r.verdict.kind).toBe('idle')
  })

  it('آخرُ محاولةٍ فشلت بعد آخر نشر: النشرُ ساقطٌ بسببه', () => {
    const r = readiness({
      view: viewOf([account()]), app, health: { a1: health() },
      tally: tally({ published: 1, lastPublishedAt: '2026-09-20 09:00:00' }),
      posts: [post({ status: 'failed', lastError: 'رُدّ 401', createdAt: '2026-09-25 00:00:00' })], now,
    })
    const pub = r.rungs.find((x) => x.key === 'publish')!
    expect(pub.state).toBe('failed')
    expect(pub.note).toContain('رُدّ 401')
    expect(pub.action?.href).toBe('/panel/journey/p1')
  })

  it('وجوابُ المنصّة يُقال بالعربيّة، وآخرُ نشرٍ نسبيًّا لا بساعة UTC (D-202)', () => {
    const failed = readiness({
      view: viewOf([account()]), app, health: { a1: health() },
      tally: tally({ published: 1, lastPublishedAt: '2026-09-20 09:00:00' }),
      posts: [post({ status: 'failed', lastError: 'linkedin: Internal Server Error', createdAt: '2026-09-25 00:00:00' })], now,
    }).rungs.find((x) => x.key === 'publish')!
    expect(failed.note).toContain('عطلٌ في خادمها (500)')
    expect(failed.note).not.toContain('Internal Server Error')
    const done = readiness({
      view: viewOf([account()]), app, health: { a1: health() },
      tally: tally({ published: 1, lastPublishedAt: '2026-09-20 09:00:00' }), posts: [], now,
    }).rungs.find((x) => x.key === 'publish')!
    expect(done.note).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('كُتب قبل آخر نشرٍ ثمّ فشل بعده: النشرُ ساقطٌ بوقت الفشل لا بوقت الكتابة', () => {
    const r = readiness({
      view: viewOf([account()]), app, health: { a1: health() },
      tally: tally({ published: 1, lastPublishedAt: '2026-09-20 09:00:00' }),
      posts: [post({
        status: 'failed', lastError: 'رُدّ 401',
        createdAt: '2026-09-18 00:00:00', lastFailedAt: '2026-09-22 06:00:00',
      })], now,
    })
    expect(r.rungs.find((x) => x.key === 'publish')!.state).toBe('failed')
    expect(r.verdict.kind).toBe('bad')
  })

  /*
   * ‏**ر-8**: فشل ثمّ «أعده إلى المعتمَد» ثمّ «جدوِل» — صفُّ المحاولة الفاشلة باقٍ في
   * ‏`publish_attempts`، والمنشورُ نفسُه في الطابور. كانت الصفحةُ تقول «لا تنشر».
   */
  it('فشل ثمّ أُعيد وجُدول: لا يُحكَم عليه بفشلٍ أصلحه المالك', () => {
    for (const status of ['approved', 'queued']) {
      const r = readiness({
        view: viewOf([account()]), app, health: { a1: health() },
        tally: tally({ queued: status === 'queued' ? 1 : 0 }),
        posts: [post({ status, lastError: 'رُدّ 500', lastFailedAt: '2026-09-26 06:00:00' })], now,
      })
      expect(r.verdict.kind, status).not.toBe('bad')
      expect(r.rungs.find((x) => x.key === 'publish')!.state, status).not.toBe('failed')
    }
    const queued = readiness({
      view: viewOf([account()]), app, health: { a1: health() }, tally: tally({ queued: 1 }),
      posts: [post({ status: 'queued', lastError: 'رُدّ 500', lastFailedAt: '2026-09-26 06:00:00' })], now,
    })
    expect(queued.rungs.find((x) => x.key === 'publish')!.note).toBe('1 مجدولٌ ينتظر موعدَه')
    expect(queued.verdict).toEqual({ kind: 'ok', text: 'جاهزةٌ للنشر' })
  })

  it('لا تطبيقَ ولا حساب: التطبيقُ هو «الآن» والحسابُ ينتظره', () => {
    const r = readiness({ view: viewOf([], false), app: undefined, health: {}, tally: tally(), posts: [], now })
    expect(r.rungs[0]!.state).toBe('now')
    expect(r.rungs[1]!.state).toBe('waiting')
    expect(r.verdict.kind).toBe('warn')
  })

  it('سرٌّ مرفوضٌ من المنصّة: التطبيقُ ساقطٌ ولو كان الحسابُ مربوطًا', () => {
    const r = readiness({
      view: viewOf([account()]), app: { ...app, verifiedKind: 'bad_secret' }, health: { a1: health() },
      tally: tally(), posts: [], now,
    })
    expect(r.rungs[0]!.state).toBe('failed')
    expect(r.rungs[0]!.note).toContain('لا تقبل السرّ')
  })

  it('منصّةٌ تُربَط ولا تنشر: درجةُ النشر تنتظر السائق', () => {
    const base = viewOf([account()])
    const r = readiness({
      view: { ...base, spec: { ...base.spec, stage: 'link' } }, app, health: { a1: health() },
      tally: tally(), posts: [], now,
    })
    expect(r.rungs.find((x) => x.key === 'publish')!.note).toContain('سائقُ الرفع')
  })

  it('منصّةٌ بلا سائق: لا درجات وحكمٌ رماديّ', () => {
    const r = readiness({ view: viewOf([], true, 'snapchat'), app: undefined, health: {}, tally: tally(), posts: [], now })
    expect(r.rungs).toHaveLength(0)
    expect(r.verdict.kind).toBe('idle')
  })
})
