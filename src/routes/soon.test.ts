/**
 * ‏**موعدٌ قريبٌ يُرسَل إلى دقيقته من اللوحة** (D-320).
 *
 * ‏الدورةُ ترسل ما يحلّ قبل التي بعدها. وموعدٌ بعد خمس دقائق يُضبط بين دورتين لا تراه دورةٌ قبله، فكان يخرج في الدورة التالية:
 * ‏حتّى ثلاثَ عشرةَ دقيقةً بعد ما وُعد. فبعد كلّ فعلٍ يضع موعدًا يُرسَل ما في الأفق بعد الردّ.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { app } from '../index'
import { fakeDb } from '../test/fakes'
import { dispatchSoon, SCHEDULING_PATHS } from './panel/shared'

/**
 * ‏**مراجعة D-320: القائمةُ تُشتقّ من الشيفرة لا تُكتب باليد.** كانت قائمةُ الاختبار تقول «كلُّ مسارٍ ينادي دوالَّ الجدولة» ثمّ
 * ‏تفرض ألّا يطابق النمطُ ما سواها — ففاتتها ثلاثةٌ تنادي تلك الدوالَّ بوسيط (`pinPlan` و`applyPlan` و`delayItem`)، وأثبتت
 * ‏الفجوة. فهنا تُقرأ الشيفرة: كلُّ دالّةٍ تنادي دالّةَ جدولةٍ (حتّى تستقرّ)، ثمّ كلُّ مسار POST في اللوحة ينادي إحداها.
 */
const SRC = new URL('../', import.meta.url).pathname
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : []
  })
}
/** ‏أجسادُ الدوالّ المسمّاة: من `function الاسم(` إلى أوّل سطرٍ يبدأ بـ`}` — أسلوبُ الملفّات هنا. */
function bodies(code: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of code.matchAll(/^(?:export )?(?:async )?function (\w+)\s*[(<]/gm)) {
    const rest = code.slice(m.index!)
    const end = rest.search(/^\}/m)
    out.set(m[1]!, end === -1 ? rest : rest.slice(0, end))
  }
  return out
}
function schedulingRoutes(): Set<string> {
  const files = sources(SRC).map((path) => readFileSync(path, 'utf8'))
  const fns = new Map<string, string>()
  for (const code of files) for (const [name, body] of bodies(code)) fns.set(`${name}\u0000${fns.size}`, body)
  // ‏ما يضع موعدًا في القاعدة — والباقي من يناديه
  const schedulers = new Set(['schedulePost', 'reschedulePost', 'restoreSchedule'])
  const calls = (body: string) => [...schedulers].some((n) => new RegExp(`\\b${n}\\(`).test(body))
  for (let grew = true; grew;) {
    grew = false
    for (const [key, body] of fns) {
      const name = key.split('\u0000')[0]!
      if (!schedulers.has(name) && calls(body.slice(body.indexOf('{')))) { schedulers.add(name); grew = true }
    }
  }
  const routes = new Set<string>()
  for (const code of files) {
    for (const m of code.matchAll(/^\w+\.post\('(\/panel\/[^']+)'/gm)) {
      const rest = code.slice(m.index!)
      const end = rest.search(/^\}\)/m)
      if (calls(end === -1 ? rest : rest.slice(0, end))) routes.add(m[1]!)
    }
  }
  return routes
}

describe('أفعالُ الموعد (D-320)', () => {
  /** ‏كلُّ مسارٍ ينادي `schedulePost` أو `reschedulePost` أو `restoreSchedule`، بنفسه أو بدالّةٍ تناديها. */
  const SCHEDULING = [...schedulingRoutes()].sort()

  it('مراجعة D-320: الاشتقاقُ يراها كلّها (ومنها «اعتمد وجدول» من شاشة الشهر)، ومنها الثلاثةُ التي فاتت القائمةَ المكتوبة', () => {
    expect(SCHEDULING).toEqual([
      '/panel/drafts/decide', '/panel/drafts/reschedule', '/panel/drafts/schedule', '/panel/drafts/spread/apply',
      '/panel/drafts/undo-unschedule', '/panel/plan-import/:id/approve', '/panel/plan/approve-all', '/panel/plan/check/fix', '/panel/plan/month/approve', '/panel/plan/package/schedule', '/panel/plan/pin', '/panel/plan/post/hold',
      '/panel/plan/review/approve', '/panel/plan/review/bulk',
      '/panel/plan/review/delay', '/panel/plan/review/move', '/panel/plan/schedule', '/panel/uploads/:id/posts', '/panel/uploads/:id/schedule',
    ])
  })

  it('كلٌّ منها مسارٌ مسجَّل، والنمطُ يطابقه ولا يطابق ما سواه', () => {
    const posts = new Set(app.routes.filter((r) => r.method === 'POST').map((r) => r.path))
    for (const path of SCHEDULING) {
      expect(posts.has(path), path).toBe(true)
      expect(SCHEDULING_PATHS.test(path.replace(':id', 'u1')), path).toBe(true)
    }
    const others = [...posts].filter((p) => p.startsWith('/panel/') && !SCHEDULING.includes(p))
    expect(others.length).toBeGreaterThan(20)
    for (const path of others) expect(SCHEDULING_PATHS.test(path.replace(/:[a-z]+/g, 'u1')), path).toBe(false)
  })

  it('وبعدها يُرسَل ما يحلّ في الأفق مؤجَّلًا، بعد الردّ', async () => {
    const db = fakeDb()
    const due = new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('a1', 'x', 'member', 'e1', 'عمر')`)
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, account_id, scheduled_at)
      VALUES ('p1', 'x', 'text', 'نصّ', 'queued', 'k1', 'panel', '2026-11-01T07:00:00Z', 'a1', ?)`).run(due)
    const sent: { body: unknown; delaySeconds?: number }[] = []
    const queue = { async sendBatch(m: { body: unknown; delaySeconds?: number }[]) { sent.push(...m) } }
    const later: Promise<unknown>[] = []
    dispatchSoon({ env: { DB: db, PUBLISH_QUEUE: queue } as never, executionCtx: { waitUntil: (p) => { later.push(p) } } })
    expect(later).toHaveLength(1)
    await Promise.all(later)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.body).toEqual({ postId: 'p1', org: 'org_owner', due })
    expect(sent[0]!.delaySeconds).toBeGreaterThanOrEqual(298)
    expect(sent[0]!.delaySeconds).toBeLessThanOrEqual(301)
  })

  it('وبلا طابورٍ لا شيء، وطابورٌ يرمي لا يرمي من اللوحة', async () => {
    const db = fakeDb()
    expect(() => dispatchSoon({ env: { DB: db } as never, executionCtx: { waitUntil: () => { throw new Error('لا يُنادى') } } })).not.toThrow()
    const later: Promise<unknown>[] = []
    const down = { async sendBatch(): Promise<never> { throw new Error('queue down') } }
    dispatchSoon({ env: { DB: db, PUBLISH_QUEUE: down } as never, executionCtx: { waitUntil: (p) => { later.push(p) } } })
    await expect(Promise.all(later)).resolves.toEqual([0])
  })
})
