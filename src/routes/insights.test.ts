/**
 * «ما ينجح» (D-253) من طرفه إلى طرفه: الباب، والقراءةُ من القاعدة، والملفّ، وقائمةُ السماح للمنصّة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { COOKIE } from '../lib/session'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: KEY, ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('a-li', 'linkedin', 'member', 'e1', 'عمر')`)
})

/** منشوراتٌ نُشرت وقِيست: كلُّها الأحدَ في الضحى بتوقيت الرياض، وتفاعلُها يتصاعد. */
function seed(n: number): void {
  for (let i = 1; i <= n; i += 1) {
    db.raw.exec(`INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, created_at, approved_by, approved_at, scheduled_at)
      VALUES ('p${i}', 'a-li', 'linkedin', 'text', 'نصّ "${i}"', 'published', 'k${i}', '2026-10-01 00:00:00', 'omar', '2026-10-02 00:00:00', '2026-10-04 06:00:00')`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
      VALUES ('t${i}', 'p${i}', 'k${i}', 1, '{}', 'succeeded', '2026-10-04 06:00:00')`)
    db.raw.exec(`INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares, pulled_at)
      VALUES ('p${i}', '24h', NULL, ${10 + i}, 1, 0, '2026-10-05 06:00:00')`)
  }
}

async function get(path: string): Promise<Response> {
  const cookie = (( await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
  return app.request(path, { headers: { Cookie: cookie } }, env)
}

describe('«ما ينجح»', () => {
  it('لا يُفتَح بلا جلسة', async () => {
    expect((await app.request('/panel/insights', { headers: { Cookie: `${COOKIE}=gone` } }, env)).status).toBe(401)
  })

  it('قبل ثمانية منشوراتٍ مقيسة: لا حكم، ويقول كم بقي', async () => {
    seed(3)
    const html = await (await get('/panel/insights')).text()
    expect(html).toContain('لا حكمَ بعد')
    expect(html).toContain('3 من 8 منشورات نُشرت وقِيست')
    expect(html).toContain('aria-current="page"><span>ما ينجح</span>')
  })

  it('بعدها: أرجحُ موعدٍ بيومه وفترته، والسجلُّ ومنصّةٌ مجهولةٌ تُتجاهَل', async () => {
    seed(9)
    const html = await (await get('/panel/insights?p=<script>')).text()
    expect(html).toContain('أرجحُ موعدٍ للنشر')
    expect(html).toContain('الأحد في الضحى (9–12)')
    expect(html).toContain('href="/panel/journey/p9"')
    expect(html).not.toContain('<script>"')
  })

  it('والسجلُّ ملفًّا بالأسماء، والاقتباسُ في النصّ مهروب', async () => {
    seed(9)
    const res = await get('/panel/insights.csv')
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    const csv = await res.text()
    expect(csv.replace(/^\uFEFF/, '').startsWith('"نُشر","المنصّة","الشكل"')).toBe(true)
    expect(csv).toContain('"LinkedIn","نصّ"')
    expect(csv).toContain('"نصّ ""9"""')
  })

  it('ونصٌّ يبدأ بصيغةٍ يُكتب نصًّا لا صيغة (D-318)', async () => {
    seed(2)
    db.raw.exec(`UPDATE posts SET text = '=HYPERLINK("https://evil.example","اضغط")' WHERE id = 'p1'`)
    db.raw.exec(`UPDATE posts SET text = '@SUM(1+1)' WHERE id = 'p2'`)
    const csv = await (await get('/panel/insights.csv')).text()
    expect(csv).toContain('"\'=HYPERLINK(""https://evil.example"",""اضغط"")"')
    expect(csv).toContain('"\'@SUM(1+1)"')
    expect(csv).not.toMatch(/(^|,)"[=+\-@]/m)
  })
})
