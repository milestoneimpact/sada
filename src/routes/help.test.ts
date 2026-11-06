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
