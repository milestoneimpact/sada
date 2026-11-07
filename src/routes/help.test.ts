/**
 * دليلُ المالك (D-305): الصفحةُ تُقرأ بجلسةٍ وحدها، وفيها المحطّاتُ السبع والأسئلةُ بمراسيها والاختصارات، وبابُها في قائمة
 * الحساب ولوحة الأوامر — فـ«كيف أربط حسابًا» على بُعد ضغطتين من أيّ صفحة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'
import { buildCommands } from './ui/command'
import { helpScreen } from './ui/helpView'
import { draftsSection } from './ui/sections/drafts'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NONE = { dots: [], next: null, blocked: false }

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
let env: Record<string, unknown>

beforeEach(() => {
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: fakeDb(),
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
})

describe('/panel/help', () => {
  it('بلا جلسةٍ صفحةُ الدخول', async () => {
    const r = await app.request('/panel/help', {}, env)
    expect([401, 303]).toContain(r.status)
  })

  it('المحطّاتُ السبع، والأسئلةُ العشر بمراسيها، والاختصاراتُ كما في المنشورات، ورابطُ «ما عليك»', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const r = await app.request('/panel/help', { headers: { Cookie: cookie } }, env)
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).toContain('<h1>المساعدة</h1>')
    // ‏ومحطّةُ «الكلفة» تقول أين رقمُ الشهر (D-314)
    expect(html).toContain('وما أُنفق هذا الشهر في رأس «النتائج»')
    for (const s of ['العميل', 'الموجز', 'الحسابات', 'الخطّة', 'المحتوى', 'الكلفة', 'التنفيذ والنتائج']) expect(html).toContain(`<b>${s}</b>`)
    for (const id of ['accounts', 'states', 'idea', 'plan', 'failed', 'spend', 'reschedule', 'phone', 'tasks', 'roles']) {
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('كيف أربط حسابًا؟')
    for (const k of ['Ctrl K', 'J · K', 'A', 'R', 'E', 'S', '?']) expect(html).toContain(`<kbd>${k}</kbd>`)
    expect(html).toContain('href="/panel/tasks"')
    // ‏بابُها في قائمة الحساب على هذه الصفحة أيضًا
    expect(html).toContain('href="/panel/help"')
  })

  it('وفي لوحة الأوامر بأسماءٍ يكتبها المالك', () => {
    const cmd = buildCommands({ onPanel: true }).find((c) => c.href === '/panel/help')
    expect(cmd?.label).toBe('المساعدة')
    expect(cmd?.alias).toContain('مساعده')
  })
})

/**
 * **والدليلُ لا يسمّي زرًّا لا يوجد** (D-323 · Nielsen #4). كان جوابُ «لماذا لم يُنشَر منشور؟» يقول «اضغط «أعد المحاولة»»
 * وزرُّ البطاقة الفاشلة «أعده إلى المعتمَد»، و«كيف أربط حسابًا؟» يقول «مربوطة بلا إذن» والبطاقةُ تقول «منقطعة». فكلُّ اسمٍ
 * بين «» في الأجوبة يُطلَب في الشيفرة اسمَ زرٍّ أو حالٍ — وزرُّ الفاشلة يُطلَب في البطاقة الفاشلة نفسِها مرسومةً.
 */
describe('أسماءُ الأزرار في الدليل موجودة', () => {
  // ‏ما ليس من صدى: شاشتا iPhone وAndroid، و«نعم» كلمةُ المالك لا زرّ
  const NOT_OURS = new Set(['إضافة إلى الشاشة الرئيسية', 'تثبيت التطبيق', 'نعم'])
  const answers = (): Record<string, string[]> => {
    const out: Record<string, string[]> = {}
    for (const m of helpScreen().matchAll(/<details class="setup" id="([a-z]+)"><summary>[^<]*<\/summary><p class="hint m-0">([\s\S]*?)<\/p><\/details>/g)) {
      out[m[1]!] = [...m[2]!.matchAll(/«([^»]+)»/g)].map((x) => x[1]!)
    }
    return out
  }

  it('كلُّ اسمٍ مقتبَسٍ اسمُ زرٍّ أو حالٍ في الشيفرة', () => {
    const src = readdirSync(join(__dirname), { recursive: true })
      .map(String).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('helpView.ts'))
      .map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n') + readFileSync(join(__dirname, '../lib/channels.ts'), 'utf8')
    const missing = Object.values(answers()).flat().filter((n) => !NOT_OURS.has(n))
      // ‏وعنوانُ بطاقةٍ بـ`card()` اسمٌ يُرى كذلك (`title: '…'`، دمجُ D-326 مع سقّاطة D-325)
      .filter((n) => !src.includes(`>${n}<`) && !src.includes(`label: '${n}'`) && !src.includes(`label: \`${n}`) && !src.includes(`title: '${n}'`))
    expect(missing).toEqual([])
  })

  it('وزرُّ «لماذا لم يُنشَر» في البطاقة الفاشلة نفسِها', () => {
    const failed = answers()['failed'] ?? []
    expect(failed.length).toBeGreaterThan(0)
    const card = draftsSection({
      drafts: [{
        id: 'd1', platform: 'linkedin', text: 'نصّ', rationale: null, status: 'failed', model: null, failure: 'http_500: Internal',
        cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null, approvedAt: null, createdAt: '2026-09-05 09:00:00',
        scheduledAt: null, accountName: null, dispatchedAt: null, publishCost: 0, originalText: null,
      } as never],
      media: [], targets: [], earliest: '2026-09-06T09:15', writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true,
      pageOnly: [], peaks: {}, mediaReady: { infographic: NONE, image: NONE, video: NONE },
    })
    const buttons = [...card.matchAll(/<(?:button|a)\b[^>]*>([^<]+)<\/(?:button|a)>/g)].map((m) => m[1]!.trim())
    for (const name of failed.filter((n) => n !== 'أعد الربط')) expect(buttons, name).toContain(name)
  })
})
