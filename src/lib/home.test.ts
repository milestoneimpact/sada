/** الرئيسيّة: فعلٌ واحدٌ بأولويّةٍ مكتوبة، وسبعُ محطّات، وزرٌّ لكلّ منصّة (D-177). */
import { describe, expect, it } from 'vitest'
import { viewChannels, type LinkedAccount } from './channels'
import { counted, NOUNS } from './format'
import {
  firstRun, journeyCounts, journeySteps, nextAction, systemPill, writeBlock,
  type HomeFacts, type PlatformCounts,
} from './home'
import { pulses, type Heartbeat } from './ops/heartbeat'
import { fakeDb } from '../test/fakes'

const acc = (over: Partial<LinkedAccount>): LinkedAccount => ({
  id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
  createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00', ...over,
})
const counts = (over: Partial<PlatformCounts> = {}): PlatformCounts =>
  ({ draft: 0, approved: 0, queued: 0, published: 0, failed: 0, nextAt: null, ...over })

const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  channels: viewChannels([acc({})], () => true),
  counts: { perPlatform: {}, publishedWeek: 0 },
  paused: false,
  sources: { total: 2, analyzed: 2 },
  withoutImage: 0,
  withImage: 0,
  openSuggestions: 0,
  firsts: { waiting: null, unscheduled: null, withoutImage: null },
  pulses: [],
  blocker: null,
  zone: null,
  ...over,
})

const NOW = new Date('2026-10-04T12:00:00Z')
/** نبضُ الدورات كلِّها في موعدها، إلّا ما يُبدَّل منه. */
const beats = (over: Partial<Record<Heartbeat['job'], Partial<Heartbeat>>> = {}): ReturnType<typeof pulses> =>
  pulses((['renew', 'dispatch', 'publish', 'metrics', 'scan', 'alerts', 'report'] as const).map((job) => ({
    job, at: '2026-10-04 11:55:00', outcome: 'ok' as const, detail: null, ...over[job],
  })), NOW)
const FAILED = '/panel/channels/x?filter=failed#history'

describe('counted', () => {
  it('واحد بوصفه، واثنان بالمثنّى، والجمع إلى عشرة، والتمييز بعدها', () => {
    expect(counted(1, NOUNS.draft)).toBe('مسوّدة واحدة')
    expect(counted(2, NOUNS.post)).toBe('منشوران')
    expect(counted(5, NOUNS.source)).toBe('5 مصادر')
    expect(counted(11, NOUNS.post)).toBe('11 منشورًا')
    expect(counted(30, NOUNS.day)).toBe('30 يومًا')
  })
})

describe('nextAction', () => {
  it('الإذن المنتهي أوّلًا — وزرُّه يجدّد مباشرةً', () => {
    const f = facts({
      channels: viewChannels([acc({ status: 'needs_reauth' })], () => true),
      counts: { perPlatform: { linkedin: counts({ draft: 4 }) }, publishedWeek: 0 },
    })
    expect(nextAction(f)).toMatchObject({ tone: 'bad', href: '/oauth/linkedin/start' })
  })

  it('والفشل قبل المسوّدات، ويفتح صفحة منصّته', () => {
    const f = facts({ counts: { perPlatform: { linkedin: counts({ draft: 3 }), x: counts({ failed: 1 }) }, publishedWeek: 0 } })
    const a = nextAction(f)
    expect(a.tone).toBe('bad')
    // ‏إلى صفّ الفشل بسببه وزرِّ إعادته، لا إلى رأس صفحة المنصّة (ر-8)
    expect(a.href).toBe(FAILED)
    expect(a.label).toBe('أصلح المنشور')
    expect(a.text).toContain('منشور واحد')
  })

  it('ولا منصّة متّصلة: اربط أوّلًا', () => {
    expect(nextAction(facts({ channels: viewChannels([], () => true) })).label).toBe('اربط أوّل منصّة')
  })

  it('ثمّ المسوّدات بعدد صحيح، ثمّ المواعيد، ثمّ «على المسار»', () => {
    expect(nextAction(facts({ counts: { perPlatform: { linkedin: counts({ draft: 2 }) }, publishedWeek: 0 } })).text)
      .toContain('مسوّدتان')
    expect(nextAction(facts({ counts: { perPlatform: { linkedin: counts({ approved: 3 }) }, publishedWeek: 0 } })).label)
      .toBe('حدّد المواعيد')
    const calm = nextAction(facts({
      counts: { perPlatform: { linkedin: counts({ queued: 1, nextAt: '2026-10-02 09:00:00' }) }, publishedWeek: 0 },
    }))
    expect(calm).toMatchObject({ tone: 'ok', href: '/panel/channels/linkedin' })
  })

  it('والفشل القديم لا يحجب ما بعده — يُحمِّر فشل الأسبوع وحده', () => {
    const old = facts({ counts: { perPlatform: { linkedin: counts({ draft: 2 }), x: counts({ failed: 3, recentFailed: 0 }) }, publishedWeek: 0 } })
    expect(nextAction(old)).toMatchObject({ tone: 'ok', label: 'راجع المسوّدات' })
    const fresh = facts({ counts: { perPlatform: { linkedin: counts({ draft: 2 }), x: counts({ failed: 3, recentFailed: 1 }) }, publishedWeek: 0 } })
    const a = nextAction(fresh)
    expect(a).toMatchObject({ tone: 'bad', href: FAILED })
    expect(a.text).toContain('منشور واحد')
  })

  it('و«لا مصدر» حين لا شيء أصلًا — والمقطع والخطّة يكتبان بلا Drive', () => {
    const none = { total: 0, analyzed: 0 }
    expect(nextAction(facts({ sources: none }))).toMatchObject({ tone: 'warn', href: '#sources' })
    // ‏مسوّداتٌ من مقطعٍ مرفوع: تُراجَع، لا «اذهب إلى المصادر»
    expect(nextAction(facts({ sources: none, counts: { perPlatform: { youtube: counts({ draft: 2 }) }, publishedWeek: 0 } })))
      .toMatchObject({ tone: 'ok', label: 'راجع المسوّدات' })
    expect(nextAction(facts({ sources: none, counts: { perPlatform: { youtube: counts({ approved: 1 }) }, publishedWeek: 0 } })).label)
      .toBe('حدّد المواعيد')
    // ‏ونُشر كلُّه بلا مصدر: الدورةُ الجديدةُ من فكرةٍ أو مقطع لا «من مصدرٍ محلَّل» (D-190)
    const idle = nextAction(facts({ sources: none, counts: { perPlatform: { youtube: counts({ published: 4 }) }, publishedWeek: 0 } }))
    expect(idle).toMatchObject({ tone: 'ok', href: '#idea' })
    expect(idle.text).toContain('ارفع مقطعًا')
    expect(idle.text).not.toContain('مصدر محلَّل')
  })
})

/**
 * ‏**والزرُّ والمحطّةُ ينزلان إلى البطاقة لا إلى رأس اللوح** (ر-0، ر-2، ر-3، ر-6): كانت
 * ‏أربعُ محطّاتٍ كلُّها `#posts`، و«اعتمد» على بُعد ‏١٢٩٠px و«جدوِل» على ‏٣٠٩٠ على الهاتف.
 */
describe('المحطّات والفعل إلى البطاقة نفسِها', () => {
  const busy = {
    perPlatform: { linkedin: counts({ draft: 2, approved: 1 }), x: counts({ queued: 1, nextAt: '2026-10-05 09:00:00' }) },
    publishedWeek: 0,
  }
  const firsts = { waiting: 'p-wait', unscheduled: 'p-ok', withoutImage: 'p-bare' }

  it('«الاعتماد» إلى أوّل مسوّدة تنتظر، و«الموعد» إلى نموذج جدولة أوّل معتمَد، و«الصورة» إلى لوح صورته', () => {
    const by = Object.fromEntries(journeySteps(facts({ counts: busy, withoutImage: 2, firsts })).map((s) => [s.key, s.href]))
    expect(by['approve']).toBe('#d-p-wait')
    expect(by['schedule']).toBe('#s-p-ok')
    expect(by['image']).toBe('#i-p-bare')
    // ‏و«المسوّدة» محطّةُ الكتابة: إلى بطاقتها في آخر اللوح
    expect(by['draft']).toBe('#write')
  })

  it('وبطاقة لم تُرسَم (خارج الستّين) تُبقي رأس اللوح — لا مرساةً لا تجد شيئًا', () => {
    const by = Object.fromEntries(journeySteps(facts({ counts: busy, withoutImage: 2 })).map((s) => [s.key, s.href]))
    expect(by['approve']).toBe('#posts')
    expect(by['schedule']).toBe('#posts')
    expect(by['image']).toBe('#posts')
  })

  it('والفعل يقصد البطاقة نفسَها ويسمّي محطّتَه', () => {
    expect(nextAction(facts({ counts: busy, firsts }))).toMatchObject({ href: '#d-p-wait', step: 'approve' })
    const ready = { perPlatform: { linkedin: counts({ approved: 1 }) }, publishedWeek: 0 }
    expect(nextAction(facts({ counts: ready, firsts }))).toMatchObject({ href: '#s-p-ok', step: 'schedule' })
    // ‏ولا شيءَ ينتظر: «اكتب من فكرة» إلى بطاقتها لا إلى رأس اللوح — أقصرُ الأبواب، ولا يحتاج مصدرًا (D-190)
    const idle = { perPlatform: { linkedin: counts({ published: 3 }) }, publishedWeek: 0 }
    expect(nextAction(facts({ counts: idle }))).toMatchObject({ label: 'اكتب من فكرة', href: '#idea', step: 'draft' })
  })
})

/**
 * ‏**الإرسالُ المتوقّف يُقال في الشاشة الأولى** (الخطّة 5.5/7، 5.9): كانت الحبّةُ «يعمل»
 * ‏خضراءَ والدوراتُ متوقّفةٌ منذ ثلاثة أيّام، و«خطوتك التالية» كما هي.
 */
describe('حبّة النظام ونبض الإرسال', () => {
  const stale = beats({ dispatch: { at: '2026-10-01 12:00:00' } })

  it('الإرسال المتأخّر يوقف النشر — حبّة حمراء وفعل قبل الفشل', () => {
    expect(systemPill(false, stale)).toEqual({ tone: 'bad', text: 'النشر متوقّف' })
    const f = facts({ pulses: stale, counts: { perPlatform: { x: counts({ failed: 1 }) }, publishedWeek: 0 } })
    const a = nextAction(f, NOW)
    expect(a).toMatchObject({ tone: 'bad', href: '#machine', label: 'افحص الآلة' })
    expect(a.text).toContain('قبل 3 أيّام')
  })

  it('وفشل آخر إرسال مثلُه — والإيقاف بقرارك يسبقهما', () => {
    const failed = beats({ dispatch: { outcome: 'failed' } })
    expect(nextAction(facts({ pulses: failed }), NOW)).toMatchObject({ tone: 'bad', href: '#machine' })
    expect(systemPill(true, failed)).toEqual({ tone: 'off', text: 'موقوف مؤقتا' })
    expect(nextAction(facts({ pulses: failed, paused: true }), NOW).href).toBe('#limits')
  })

  it('ودورة أخرى تتأخّر لا تقول «النشر متوقّف» — ولا تبقى «يعمل» صامتة', () => {
    const scan = beats({ scan: { at: '2026-09-30 03:00:00' } })
    expect(systemPill(false, scan)).toEqual({ tone: 'off', text: 'يعمل بتأخّر' })
    expect(nextAction(facts({ pulses: scan }), NOW).href).not.toBe('#machine')
    expect(systemPill(false, beats())).toEqual({ tone: 'on', text: 'يعمل' })
    // ‏ودفعةُ نشرٍ فشلت فشلُ منشورٍ يقوله فرعُ الفشل بسببه، لا توقّفٌ للإرسال
    expect(systemPill(false, beats({ publish: { outcome: 'failed' } })).text).not.toBe('النشر متوقّف')
  })
})

/** ‏**سقفُ اليوم في «خطوتك التالية» وتحت زرّ الكتابة**، وساعةُ انفتاحه بتوقيت المالك (ر-10). */
describe('سقف الإنفاق اليوميّ', () => {
  const cap = { kind: 'spend_cap', used: 6.06, cap: 5 } as const

  it('فعل برتقاليّ إلى حقل السقف، وساعة الانفتاح بتوقيت المالك أو الرياض (D-201)', () => {
    const a = nextAction(facts({ blocker: cap, zone: 'Asia/Riyadh' }), NOW)
    expect(a).toMatchObject({ tone: 'warn', href: '#c2', label: 'ارفع السقف' })
    expect(a.text).toContain('⁦6.06$⁩ من ⁦5.00$⁩')
    // ‏منتصفُ ليل UTC هو الثالثةُ فجرًا في الرياض
    expect(a.text).toContain('الساعة 3:00 ص،')
    // ‏وبلا منطقةٍ معروفةٍ فبتوقيت الرياض معلنًا، لا UTC
    const first = nextAction(facts({ blocker: cap }), NOW).text
    expect(first).toContain('الساعة 3:00 ص بتوقيت الرياض')
    expect(first).not.toContain('UTC')
  })

  it('والفشل الحديث يسبقه — السقف لا يوقف النشر', () => {
    const f = facts({ blocker: cap, counts: { perPlatform: { x: counts({ failed: 1 }) }, publishedWeek: 0 } })
    expect(nextAction(f, NOW).href).toBe(FAILED)
  })

  it('وسبب تعطيل زرّ الكتابة من الحاجز نفسِه', () => {
    expect(writeBlock(null, NOW, null)).toBeNull()
    expect(writeBlock(cap, NOW, 'Asia/Riyadh')).toMatchObject({ href: '#c2' })
    expect(writeBlock(cap, NOW, 'Asia/Riyadh')!.text).toContain('يُفتح الساعة 3:00 ص.')
    expect(writeBlock({ kind: 'paused' }, NOW, null)).toMatchObject({ href: '#limits' })
  })
})

describe('journeySteps', () => {
  it('سبع بترتيبها، وكلُّها رابط', () => {
    const steps = journeySteps(facts())
    expect(steps.map((s) => s.key)).toEqual(['source', 'draft', 'image', 'approve', 'schedule', 'publish', 'results'])
    for (const s of steps) expect(s.href).not.toBe('')
  })

  it('ما ينتظرك «تنتظرك»، والفشل يسقط، وما لم يصله شيء «تنتظر»', () => {
    const steps = journeySteps(facts({
      sources: { total: 3, analyzed: 1 },
      counts: { perPlatform: { linkedin: counts({ draft: 2, approved: 1 }), x: counts({ failed: 1 }) }, publishedWeek: 0 },
      withoutImage: 3,
    }))
    const by = Object.fromEntries(steps.map((s) => [s.key, s]))
    expect(by['source']!.state).toBe('now')
    expect(by['source']!.note).toBe('ينتظر التحليل مصدران')
    expect(by['approve']!).toMatchObject({ state: 'now', note: 'تنتظر قرارك مسوّدتان' })
    expect(by['schedule']!).toMatchObject({ state: 'now', note: 'بلا موعد: منشور واحد' })
    expect(by['publish']!).toMatchObject({ state: 'failed', href: FAILED })
    expect(by['results']!.state).toBe('waiting')
  })

  it('«المصدر» تامّة حين في الرحلة منشورات بلا Drive، و«تنتظرك» حين لا شيء', () => {
    const none = { total: 0, analyzed: 0 }
    const empty = Object.fromEntries(journeySteps(facts({ sources: none })).map((s) => [s.key, s]))
    expect(empty['source']!).toMatchObject({ state: 'now', href: '#sources' })
    const fed = Object.fromEntries(journeySteps(facts({
      sources: none, counts: { perPlatform: { youtube: counts({ draft: 1, published: 2 }) }, publishedWeek: 0 },
    })).map((s) => [s.key, s]))
    expect(fed['source']!.state).toBe('done')
    expect(fed['approve']!.state).toBe('now')
  })

  it('«الموعد» تامّة بعد نشر كلّ ما جُدول — لا «بعد الاعتماد»', () => {
    const by = Object.fromEntries(journeySteps(facts({
      counts: { perPlatform: { linkedin: counts({ published: 5 }) }, publishedWeek: 2 },
    })).map((s) => [s.key, s]))
    expect(by['approve']!.state).toBe('done')
    expect(by['schedule']!).toMatchObject({ state: 'done', note: 'لا موعد قادم — مضى ما جُدول' })
    expect(by['publish']!.state).toBe('done')
    // ‏والمجدولُ يُعدّ بعدده ما دام في الطابور
    const queued = journeySteps(facts({
      counts: { perPlatform: { linkedin: counts({ queued: 2, published: 5, nextAt: '2026-10-05 09:00:00' }) }, publishedWeek: 0 },
    })).find((s) => s.key === 'schedule')!
    expect(queued).toMatchObject({ state: 'done', note: 'جُدول منشوران' })
  })

  it('والنشر لا يسقط بفشل قديم — يُذكَر ولا يُحمِّر', () => {
    const old = journeySteps(facts({
      counts: { perPlatform: { x: counts({ failed: 2, recentFailed: 0 }) }, publishedWeek: 0 },
    }))
    const publish = old.find((s) => s.key === 'publish')!
    expect(publish).toMatchObject({ state: 'waiting', href: FAILED, note: 'فشل منشوران قبل أسبوع فأكثر' })
    expect(old.some((s) => s.state === 'failed')).toBe(false)
    const fresh = journeySteps(facts({
      counts: { perPlatform: { x: counts({ failed: 2, recentFailed: 1 }) }, publishedWeek: 0 },
    })).find((s) => s.key === 'publish')!
    expect(fresh).toMatchObject({ state: 'failed', note: 'فشل منشور واحد — والسبب في صفحة المنصّة' })
  })
})

/** العدُّ من القاعدة: **وفشلُ الأسبوع بوقت آخر محاولةٍ فاشلة** لا بحال المنشور وحده. */
describe('journeyCounts', () => {
  const now = new Date('2026-10-03T12:00:00Z')

  it('يعدّ الفاشل كلَّه، والحديث منه بآخر محاولة فاشلة في سبعة أيّام', async () => {
    const db = fakeDb()
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
      VALUES ('a1', 'x', 'member', 'abc', 'عمر', 'active')`)
    const post = (id: string, scheduled: string, created: string): void => {
      db.raw.prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at,
                            account_id, scheduled_at, created_at)
         VALUES (?, 'x', 'text', 'نصّ', 'failed', ?, 'omar', '2026-09-01 00:00:00', 'a1', ?, ?)`,
      ).run(id, `k-${id}`, scheduled, created)
    }
    const attempt = (postId: string, no: number, status: string, at: string): void => {
      db.raw.prepare(
        `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
         VALUES (?, ?, ?, ?, '{}', ?, ?)`,
      ).run(`${postId}-${no}`, postId, `k-${postId}`, no, status, at)
    }
    // ‏قديمٌ: آخرُ فشله قبل عشرة أيّام
    post('old', '2026-09-20 09:00:00', '2026-09-19 00:00:00')
    attempt('old', 1, 'failed', '2026-09-23 09:00:00')
    // ‏حديثٌ: جُدول قديمًا وأُعيد فسقط أمس — والمحاولةُ الأخيرةُ هي التي تؤرّخه
    post('fresh', '2026-09-01 09:00:00', '2026-08-30 00:00:00')
    attempt('fresh', 1, 'failed', '2026-09-01 09:00:00')
    attempt('fresh', 2, 'failed', '2026-10-02 09:00:00')
    // ‏بلا محاولة: يُؤرَّخ بموعده — قديم
    post('bare', '2026-09-10 09:00:00', '2026-09-09 00:00:00')

    const c = await journeyCounts(db, 'org_owner', now)
    expect(c.perPlatform['x']).toMatchObject({ failed: 3, recentFailed: 1 })
    expect(nextAction(facts({ counts: c }))).toMatchObject({ tone: 'bad', href: FAILED })

    // ‏ويمضي الأسبوعُ على الحديث فتهدأ الرئيسيّة
    const later = await journeyCounts(db, 'org_owner', new Date('2026-10-12T12:00:00Z'))
    expect(later.perPlatform['x']).toMatchObject({ failed: 3, recentFailed: 0 })
    expect(nextAction(facts({ counts: later })).tone).toBe('ok')
  })
})

describe('لوحة القيادة: القمع وشريط الأسبوع (D-194)', () => {
  it('كلّ محطّة تحمل كم مرّ بها — والاعتماد يعدّ ما بعده', () => {
    const steps = journeySteps(facts({
      sources: { total: 3, analyzed: 1 }, withImage: 4, openSuggestions: 2,
      counts: { perPlatform: { linkedin: counts({ draft: 5, approved: 2, queued: 3, published: 4, failed: 1 }) }, publishedWeek: 4 },
    }))
    expect(Object.fromEntries(steps.map((s) => [s.key, s.count]))).toEqual({
      source: 3, draft: 15, image: 4, approve: 10, schedule: 8, publish: 4, results: 2,
    })
  })
})

describe('قائمةُ البدء «1 من 3» (D-326 · خطّة التصميم 5.5 «أوّل تشغيل»)', () => {
  const empty = { channels: viewChannels([], () => false), sources: { total: 0, analyzed: 0 } }
  it('رئيسيّةٌ خالية: الخطوةُ الأولى الآن ولا شيءَ تمّ', () => {
    const r = firstRun(facts(empty))
    expect(r?.current).toBe(0)
    expect(r?.steps.map((s) => s.done)).toEqual([false, false, false])
  })
  it('حسابٌ مربوطٌ ولا مادّة: الثانيةُ الآن، والأولى تمّت', () => {
    const r = firstRun(facts({ sources: { total: 0, analyzed: 0 } }))
    expect(r?.current).toBe(1)
    expect(r?.steps.map((s) => s.done)).toEqual([true, false, false])
  })
  it('مسوّدةٌ تنتظر القرار (ولو بلا مصدر — من فكرة): الثالثةُ الآن', () => {
    const r = firstRun(facts({ sources: { total: 0, analyzed: 0 }, counts: { perPlatform: { linkedin: counts({ draft: 1 }) }, publishedWeek: 0 } }))
    expect(r?.current).toBe(2)
  })
  it('أوّلُ منشورٍ معتمَدٌ أو مجدول: اكتملت فلا قائمة', () => {
    expect(firstRun(facts({ counts: { perPlatform: { linkedin: counts({ approved: 1 }) }, publishedWeek: 0 } }))).toBeNull()
    expect(firstRun(facts({ counts: { perPlatform: { linkedin: counts({ queued: 1 }) }, publishedWeek: 0 } }))).toBeNull()
  })
  it('ومن نشر مرّةً (أو فشل نشرُه) لا يعود إلى البدء ولو انقطعت حساباتُه بعدها', () => {
    expect(firstRun(facts({ ...empty, counts: { perPlatform: { x: counts({ published: 1 }) }, publishedWeek: 0 } }))).toBeNull()
    expect(firstRun(facts({ ...empty, counts: { perPlatform: { x: counts({ failed: 1 }) }, publishedWeek: 0 } }))).toBeNull()
  })
})
