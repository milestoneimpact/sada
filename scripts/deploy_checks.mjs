/**
 * **فحوصُ سير النشر التي تحتاج منطقًا لا سطرَ bash** (D-319) — وكلٌّ منها يُختبر هنا بلا شبكة (`--self-test` في `npm run ci`).
 *
 * ## ١ · `ci-gate <owner/repo> <sha>` — بوّابةُ ci على الالتزام نفسِه
 *
 * كان `deploy.yml` يعيد `npm run ci` كاملًا على الالتزام الذي فرغ منه `ci.yml` للتوّ: نحو ثلاث دقائق تُدفع مرّتين في كلّ دمج،
 * والدقائقُ نفدت ثلاثَ مرّات (M-23). فصار النشرُ يسأل GitHub (`GITHUB_TOKEN` بإذن `actions: read`) عن تشغيلات `ci.yml` على
 * الالتزام، ويحكم:
 *
 * **والحَكَمُ أحدثُ تشغيلٍ قال كلمتَه** (`push` أو `workflow_dispatch`، بترتيب `run_started_at`) — لا أيُّ نجاحٍ وُجد (مراجعة D-319):
 * ساقطٌ بعد ناجحٍ على الالتزام نفسِه معناه أنّ شيئًا تغيّر بينهما (ثغرةٌ نُشرت فأسقطت `npm audit`)، والنجاحُ القديم لا يغلبه.
 *
 * | أحدثُ ما قال كلمتَه | الحكم |
 * |---|---|
 * | ناجح | `pass` — لا تُعاد البوّابة |
 * | لم يكتمل | ينتظر حتّى يكتمل (حتّى المهلة) |
 * | ساقط | `refuse` — **لا نشرَ على شيفرةٍ سقطت بوّابتُها** |
 * | لا شيء: لا تشغيلَ أصلًا، أو أُلغي وحده، أو تعذّر السؤال | `run` — تجري البوّابةُ هنا كما كانت (الاحتياط) |
 *
 * والملغى والمتخطّى لم يحكما على شيء فلا يُعدّان. وتشغيلُ `pull_request` لا يُعدّ: يفحص الدمجَ مع قاعدةٍ قد تكون تغيّرت، لا الالتزامَ نفسَه.
 * ويكتب الحكمَ في `$GITHUB_OUTPUT` (`gate=pass|run`)، ويخرج بـ1 على الرفض أو انقضاء المهلة.
 *
 * ## ٢ · `deployed <ndjson>` — معرّفُ النسخة التي نشرها `wrangler deploy` للتوّ
 *
 * من ملفّ `WRANGLER_OUTPUT_FILE_PATH` (سطرُ `"type":"deploy"` و`version_id`)، لا من نصٍّ مطبوعٍ للبشر يتبدّل بين إصدارات wrangler.
 *
 * ## ٣ · `wait <base> <version> [<body>]` — النطاقُ يخدم تلك النسخة
 *
 * يسأل `<base>/ready` حتّى يقول `"version"` المعرّفَ نفسَه، أو يسقط بعد المحاولات بما خدمه وما نُشر. **والنطاقُ المخصّص وحده**
 * — لا بديلَ workers.dev: نشرٌ يصل عنوانًا آخر ولا يصل النطاقَ ليس نشرًا. **ويكتب في `<body>` جوابَ النسخة التي طابقت**
 * (مراجعة D-319): فحوصُ الخدمة والقاعدة و`ready` بعده تقرؤه هو، لا أوّلَ جوابٍ ردّه البناءُ القديم قبل أن يُستبدَل.
 *
 * ## ٤ · `bookmark <json>` — علامةُ Time Travel قبل الترحيل (D-321)
 *
 * من مخرَج `wrangler d1 time-travel info <db> --json` (`{"bookmark": "…"}`)، لا من نصٍّ مطبوعٍ للبشر. وتُطابَق بشكلها (أربعةُ
 * مقاطعَ ستّ عشريّة، ‏8-8-8-32): علامةٌ لا تُقرأ لا يُرحَّل بعدها، **فالترحيلُ الذي يكسر القاعدةَ لا يبقى بلا طريقٍ إلى ما قبله**.
 *
 * الاستعمال: node scripts/deploy_checks.mjs <ci-gate|deployed|wait|bookmark> … | --self-test
 */
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** ما يُعدّ من تشغيلات ci: ما فحص الالتزامَ نفسَه. */
const COUNTED_EVENTS = new Set(['push', 'workflow_dispatch'])
/** الخواتيمُ التي تعني «سقطت البوّابة» — لا «لم تجرِ». */
const FAILED = new Set(['failure', 'timed_out', 'startup_failure', 'action_required'])

/** بدءُ آخر محاولةٍ في التشغيل: إعادةُ التشغيل تُحدّث `run_started_at` على التشغيل نفسِه، و`created_at` احتياطًا. */
const startedAt = (r) => Date.parse(r.run_started_at ?? r.created_at ?? '') || 0

/**
 * الحكمُ على تشغيلات ci لالتزامٍ واحد — نقيٌّ ليُختبَر. الحَكَمُ أحدثُ تشغيلٍ معدودٍ قال كلمتَه (جارٍ أو ناجحٌ أو ساقط).
 * @param {ReadonlyArray<{ event: string, status: string, conclusion: string | null, html_url?: string, run_started_at?: string, created_at?: string }>} runs
 * @returns {{ kind: 'pass' | 'wait' | 'refuse' | 'run', url?: string }}
 */
export function verdict(runs) {
  const latest = runs
    .filter((r) => COUNTED_EVENTS.has(r.event))
    .filter((r) => r.status !== 'completed' || r.conclusion === 'success' || (r.conclusion !== null && FAILED.has(r.conclusion)))
    // ‏الترتيبُ ثابت: ما تساوى زمنُه يبقى على ترتيب GitHub (الأحدثُ أوّلًا)
    .sort((x, y) => startedAt(y) - startedAt(x))[0]
  if (latest === undefined) return { kind: 'run' }
  if (latest.status !== 'completed') return { kind: 'wait', url: latest.html_url }
  if (latest.conclusion === 'success') return { kind: 'pass', url: latest.html_url }
  return { kind: 'refuse', url: latest.html_url }
}

/**
 * ينتظر حكمًا نهائيًّا. `fetchRuns` يعيد التشغيلات أو يرمي؛ والرميُ ← `run` (البوّابةُ تجري هنا: الاتّجاهُ الآمن).
 * @param {{ fetchRuns: () => Promise<any[]>, sleep: (ms: number) => Promise<void>, log: (s: string) => void, tries: number, intervalMs: number }} io
 */
export async function ciGate({ fetchRuns, sleep, log, tries, intervalMs }) {
  for (let i = 1; i <= tries; i += 1) {
    let runs
    try {
      runs = await fetchRuns()
    } catch (err) {
      log(`::warning::تعذّر سؤالُ GitHub عن تشغيلات ci (${err instanceof Error ? err.message : String(err)}) — تجري البوّابةُ هنا.`)
      return { kind: 'run' }
    }
    const v = verdict(runs)
    if (v.kind !== 'wait') return v
    log(`  ci على هذا الالتزام لم يكتمل بعد (${i}/${tries})${v.url === undefined ? '' : ` — ${v.url}`}`)
    if (i < tries) await sleep(intervalMs)
  }
  return { kind: 'timeout' }
}

/** معرّفُ النسخة من سطور ملفّ مخرَج wrangler (ND-JSON): آخرُ سطر `deploy`، أو `null`. */
export function deployedVersion(ndjson) {
  let found = null
  for (const line of ndjson.split('\n')) {
    if (line.trim() === '') continue
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    if (entry !== null && entry.type === 'deploy' && typeof entry.version_id === 'string' && entry.version_id !== '') found = entry.version_id
  }
  return found
}

/**
 * يسأل `/ready` حتّى يقول المعرّفَ المنتظَر. `get` يعيد `{ status, text }` أو يرمي.
 * @param {{ get: () => Promise<{ status: number, text: string }>, sleep: (ms: number) => Promise<void>, log: (s: string) => void, expected: string, tries: number, intervalMs: number }} io
 * @returns {Promise<{ ok: boolean, served: string | null, text?: string }>} و`text` جوابُ النسخة التي طابقت
 */
export async function waitVersion({ get, sleep, log, expected, tries, intervalMs }) {
  let served = null
  for (let i = 1; i <= tries; i += 1) {
    let status = 0
    let text = ''
    try {
      const res = await get()
      status = res.status
      text = res.text
      const body = JSON.parse(text)
      // ‏جوابُ صدى وحده يُقرأ: قالبٌ أو صفحةُ خطأٍ بحقل `version` لا تُعدّ
      served = body !== null && body.service === 'sada-api' && typeof body.version === 'string' ? body.version : null
    } catch {
      served = null
    }
    log(`  /ready → HTTP ${status} · النسخة ${served ?? 'لا تُقرأ'} (${i}/${tries})`)
    if (served === expected) return { ok: true, served, text }
    if (i < tries) await sleep(intervalMs)
  }
  return { ok: false, served }
}

/** ‏شكلُ علامة D1 (وثائق Time Travel): ‏`00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683`. */
const BOOKMARK = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/

/** علامةُ Time Travel من مخرَج `--json` — كاملًا، أو من أوّل سطرٍ JSON فيه (ما قبله تحذيرٌ لا يُقرأ)، أو `null`. */
export function bookmarkOf(text) {
  const candidates = [text, ...text.split('\n')]
  const start = text.indexOf('{')
  if (start > 0) candidates.push(text.slice(start))
  for (const c of candidates) {
    let v
    try { v = JSON.parse(c) } catch { continue }
    const b = v !== null && typeof v === 'object' ? v.bookmark : undefined
    if (typeof b === 'string' && BOOKMARK.test(b)) return b
  }
  return null
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (line) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`) }

async function main(argv) {
  const [cmd, a, b, c] = argv
  if (cmd === 'ci-gate') {
    if (!a || !b) { console.log('الاستعمال: ci-gate <owner/repo> <sha>'); return 2 }
    const api = process.env.GITHUB_API_URL || 'https://api.github.com'
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
    const fetchRuns = async () => {
      const res = await fetch(`${api}/repos/${a}/actions/workflows/ci.yml/runs?head_sha=${encodeURIComponent(b)}&per_page=50`, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()).workflow_runs ?? []
    }
    const v = await ciGate({ fetchRuns, sleep: sleepReal, log: console.log, tries: 60, intervalMs: 20_000 })
    if (v.kind === 'pass') {
      console.log(`ci نجح على ${b} — لا تُعاد البوّابة هنا.${v.url ? ` ${v.url}` : ''}`)
      out('gate=pass')
      return 0
    }
    if (v.kind === 'run') {
      console.log(`لا تشغيلَ مكتملًا لـci على ${b} — تجري البوّابةُ في هذا النشر (الاحتياط).`)
      out('gate=run')
      return 0
    }
    if (v.kind === 'refuse') {
      console.log(`::error::ci سقط على ${b} ولا تشغيلَ ناجحَ بعده — لا نشرَ على شيفرةٍ سقطت بوّابتُها.${v.url ? ` ${v.url}` : ''}`)
      console.log('::error::أصلح السببَ، أو أعد تشغيل ci على الالتزام نفسِه (Re-run jobs) ثمّ أعد هذا النشر.')
      return 1
    }
    console.log(`::error::ci على ${b} لم يكتمل في عشرين دقيقة — لا نشر. أعد هذا النشر حين يكتمل.`)
    return 1
  }
  if (cmd === 'deployed') {
    let text = ''
    try { text = readFileSync(a, 'utf8') } catch { text = '' }
    const id = deployedVersion(text)
    if (id === null) {
      console.error(`::error::لم يُقرأ معرّفُ النسخة من ${a} — أنشر wrangler أصلًا؟ أم تغيّر شكلُ ملفّ مخرَجه؟`)
      return 1
    }
    console.log(id)
    return 0
  }
  if (cmd === 'wait') {
    if (!a || !b) { console.log('::error::الاستعمال: wait <base> <version> [<body>] — والنسخةُ فارغة: أقرأ «النشر» معرّفَها؟'); return 2 }
    // ‏لا يبقى في `<body>` جوابٌ سابق: ما لم يطابق لا يُكتب، فيسقط ما يقرؤه بعدُ بدل أن يقرأ القديم
    if (c) rmSync(c, { force: true })
    const get = async () => {
      const res = await fetch(`${a}/ready`, { signal: AbortSignal.timeout(15_000), headers: { 'Cache-Control': 'no-cache' } })
      return { status: res.status, text: await res.text() }
    }
    const r = await waitVersion({ get, sleep: sleepReal, log: console.log, expected: b, tries: 12, intervalMs: 5_000 })
    if (r.ok) {
      if (c) writeFileSync(c, r.text ?? '')
      console.log(`${a} يخدم النسخةَ التي نُشرت للتوّ: ${b}`)
      return 0
    }
    console.log(`::error::${a} يخدم «${r.served ?? 'ما لا يُقرأ'}» لا «${b}» الذي نُشر للتوّ — بناءٌ قديمٌ ما يزال يخدم، أو النطاقُ لغير هذا الـ Worker، أو جوابُه ليس جوابَ صدى (قالبٌ قديم).`)
    return 1
  }
  if (cmd === 'bookmark') {
    let text = ''
    try { text = readFileSync(a, 'utf8') } catch { text = '' }
    const b = bookmarkOf(text)
    if (b === null) {
      // ‏إلى stderr: stdout يُلتقَط في `BOOKMARK=$(…)`
      console.error(`::error::لم تُقرأ علامةُ Time Travel من ${a} — لا ترحيلَ بلا طريقٍ إلى ما قبله. أعد التشغيل؛ وإن تكرّر فأرسل مخرَجَ الخطوة.`)
      return 1
    }
    console.log(b)
    return 0
  }
  console.log('الاستعمال: node scripts/deploy_checks.mjs <ci-gate|deployed|wait|bookmark> … | --self-test')
  return 2
}

async function selfTest() {
  const fails = []
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`) }
  // ‏`minute`: دقيقةُ البدء (`run_started_at`)، والأكبرُ أحدث — وGitHub يرتّب الأحدثَ أوّلًا
  const run = (event, status, conclusion, minute = 0) => ({
    event, status, conclusion, html_url: `u/${event}/${conclusion ?? status}`,
    run_started_at: new Date(Date.UTC(2026, 10, 7, 12, minute)).toISOString(),
  })

  // ١ · الحكم
  eq('لا تشغيل ← البوّابة هنا', verdict([]).kind, 'run')
  eq('ناجحٌ على push', verdict([run('push', 'completed', 'success')]).kind, 'pass')
  eq('ناجحٌ بعد ساقط (إعادة تشغيل)', verdict([run('workflow_dispatch', 'completed', 'success', 2), run('push', 'completed', 'failure', 1)]).kind, 'pass')
  // ‏مراجعة D-319: الحكمُ لأحدث تشغيلٍ قال كلمتَه، لا لأيّ نجاحٍ وُجد — ساقطٌ بعد ناجحٍ (ثغرةٌ نُشرت بينهما) يمنع النشر
  eq('ساقطٌ بعد ناجح ← لا نشر', verdict([run('workflow_dispatch', 'completed', 'failure', 9), run('push', 'completed', 'success', 1)]).kind, 'refuse')
  eq('ساقطٌ بعد ناجح بأيّ ترتيب', verdict([run('push', 'completed', 'success', 1), run('workflow_dispatch', 'completed', 'failure', 9)]).kind, 'refuse')
  eq('جارٍ بعد ناجح ← ينتظر', verdict([run('workflow_dispatch', 'in_progress', null, 9), run('push', 'completed', 'success', 1)]).kind, 'wait')
  eq('ملغًى بعد ناجح ← الناجح', verdict([run('workflow_dispatch', 'completed', 'cancelled', 9), run('push', 'completed', 'success', 1)]).kind, 'pass')
  eq('جارٍ', verdict([run('push', 'in_progress', null)]).kind, 'wait')
  eq('ساقط', verdict([run('push', 'completed', 'failure')]).kind, 'refuse')
  eq('بلا عدّاء (الدقائق)', verdict([run('push', 'completed', 'startup_failure')]).kind, 'refuse')
  eq('أُلغي وحده ← البوّابة هنا', verdict([run('push', 'completed', 'cancelled')]).kind, 'run')
  eq('pull_request لا يُعدّ', verdict([run('pull_request', 'completed', 'success')]).kind, 'run')
  eq('pull_request الساقط لا يمنع', verdict([run('pull_request', 'completed', 'failure')]).kind, 'run')

  // ٢ · الانتظار
  const seq = (...lists) => { let i = 0; return async () => lists[Math.min(i++, lists.length - 1)] }
  const quiet = { sleep: async () => {}, log: () => {}, intervalMs: 0 }
  eq('ينتظر ثمّ ينجح', (await ciGate({ ...quiet, tries: 5, fetchRuns: seq([run('push', 'queued', null)], [run('push', 'completed', 'success')]) })).kind, 'pass')
  eq('ينتظر ثمّ يسقط', (await ciGate({ ...quiet, tries: 5, fetchRuns: seq([run('push', 'in_progress', null)], [run('push', 'completed', 'failure')]) })).kind, 'refuse')
  eq('لا يكتمل ← مهلة', (await ciGate({ ...quiet, tries: 3, fetchRuns: seq([run('push', 'in_progress', null)]) })).kind, 'timeout')
  eq('السؤالُ يتعذّر ← البوّابة هنا', (await ciGate({ ...quiet, tries: 3, fetchRuns: async () => { throw new Error('HTTP 403') } })).kind, 'run')

  // ٣ · معرّفُ ما نُشر
  const ndjson = [
    '{"version":1,"type":"wrangler-session","wrangler_version":"4.153.0"}',
    'ليس JSON',
    '{"version":1,"type":"deploy","worker_name":"sada-api-staging","version_id":"11111111-aaaa-4bbb-8ccc-222222222222","targets":[]}',
    '',
  ].join('\n')
  eq('سطرُ deploy', deployedVersion(ndjson), '11111111-aaaa-4bbb-8ccc-222222222222')
  eq('لا سطرَ deploy', deployedVersion('{"type":"wrangler-session"}\n'), null)
  eq('ملفٌّ فارغ', deployedVersion(''), null)

  // ٤ · النطاقُ يخدم ما نُشر
  const NEW = '11111111-aaaa-4bbb-8ccc-222222222222'
  const ready = (version, service = 'sada-api') => ({ status: 503, text: JSON.stringify({ ready: false, service, database: 'ok', version }) })
  const gets = (...rs) => { let i = 0; return async () => { const r = rs[Math.min(i++, rs.length - 1)]; if (r instanceof Error) throw r; return r } }
  eq('القديمُ ثمّ الجديد', (await waitVersion({ ...quiet, tries: 5, expected: NEW, get: gets(ready('old-version'), ready(NEW)) })).ok, true)
  eq('القديمُ أبدًا', await waitVersion({ ...quiet, tries: 3, expected: NEW, get: gets(ready('old-version')) }), { ok: false, served: 'old-version' })
  eq('ليس صدى ولو حمل المعرّف', (await waitVersion({ ...quiet, tries: 2, expected: NEW, get: gets(ready(NEW, 'other')) })).ok, false)
  eq('بلا نسخة (null)', (await waitVersion({ ...quiet, tries: 2, expected: NEW, get: gets(ready(null)) })).ok, false)
  eq('انقطاعٌ ثمّ الجديد', (await waitVersion({ ...quiet, tries: 3, expected: NEW, get: gets(new Error('reset'), ready(NEW)) })).ok, true)
  eq('صفحةُ خطأ HTML', (await waitVersion({ ...quiet, tries: 2, expected: NEW, get: gets({ status: 502, text: '<html>Bad gateway</html>' }) })).ok, false)
  // ‏مراجعة D-319: ما يُفحَص بعد `wait` (الخدمةُ والقاعدةُ و`ready`) جوابُ النسخة الجديدة لا أوّلُ جوابٍ ردّه البناءُ القديم
  const oldOk = { status: 200, text: JSON.stringify({ ready: true, service: 'sada-api', database: 'ok', version: 'OLD' }) }
  const newBroken = { status: 503, text: JSON.stringify({ ready: false, service: 'sada-api', database: 'error', version: NEW }) }
  const matched = await waitVersion({ ...quiet, tries: 3, expected: NEW, get: gets(oldOk, newBroken) })
  eq('جوابُ النسخة الجديدة هو ما يُعاد', [matched.ok, JSON.parse(matched.text ?? 'null')?.database], [true, 'error'])

  // ٥ · علامةُ Time Travel (D-321)
  const BM = '00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683'
  eq('علامةٌ من --json', bookmarkOf(JSON.stringify({ bookmark: BM }, null, 2)), BM)
  eq('تحذيرٌ قبل الـJSON', bookmarkOf(`▲ [WARNING] Proxy environment variables detected\n${JSON.stringify({ bookmark: BM }, null, 2)}`), BM)
  eq('نصُّ البشر لا يُقرأ', bookmarkOf(`⚠️ The current bookmark is '${BM}'`), null)
  eq('علامةٌ بشكلٍ آخر', bookmarkOf('{"bookmark":"not-a-bookmark"}'), null)
  eq('فارغ', bookmarkOf(''), null)

  // ٦ · الأوامرُ نفسُها: ملفُّ المخرَج والخروج
  const dir = mkdtempSync(join(tmpdir(), 'sada-deploy-'))
  try {
    const file = join(dir, 'out.ndjson')
    writeFileSync(file, ndjson)
    const { log, error } = console
    let printed = ''
    console.log = (s) => { printed += `${s}\n` }
    // ‏خطأُ `deployed` إلى stderr: stdout يُلتقَط في `VERSION=$(…)` فلا يُرى ما يُطبع فيه
    console.error = () => {}
    const codeOk = await main(['deployed', file])
    const first = printed.trim()
    const codeMissing = await main(['deployed', join(dir, 'missing.ndjson')])
    const bm = join(dir, 'bookmark.json')
    writeFileSync(bm, JSON.stringify({ bookmark: BM }))
    printed = ''
    const codeBookmark = await main(['bookmark', bm])
    const bookmarkPrinted = printed.trim()
    const codeNoBookmark = await main(['bookmark', join(dir, 'missing.json')])
    const codeEmpty = await main(['wait', 'https://sada2.basserh.com', ''])
    // ‏مراجعة D-319: `wait` يكتب جوابَ النسخة التي طابقت في الملفّ الذي تقرؤه فحوصُ الخدمة والقاعدة و`ready` بعده.
    // ‏خادمٌ محلّيٌّ يردّ النسخةَ الجديدة وقاعدتُها لا تصل — فالملفُّ يجب أن يقول `error`، لا ما ردّه البناءُ القديم قبلها.
    const server = createServer((req, res) => { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(newBroken.text) })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const body = join(dir, 'ready.json')
    writeFileSync(body, oldOk.text)
    let codeWait
    try {
      codeWait = await main(['wait', `http://127.0.0.1:${server.address().port}`, NEW, body])
    } finally {
      await new Promise((r) => server.close(r))
    }
    Object.assign(console, { log, error })
    eq('deployed يطبع المعرّف وحده', [codeOk, first], [0, NEW])
    eq('deployed بلا ملفّ يسقط', codeMissing, 1)
    eq('bookmark يطبع العلامةَ وحدَها', [codeBookmark, bookmarkPrinted], [0, BM])
    eq('bookmark بلا ملفّ يسقط', codeNoBookmark, 1)
    eq('wait بلا نسخة يسقط', codeEmpty, 2)
    eq('wait يكتب جوابَ النسخة الجديدة', [codeWait, JSON.parse(readFileSync(body, 'utf8')).database], [0, 'error'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (fails.length > 0) {
    console.log(`✕ self-test: ${fails.length} لم يقع كما يجب`)
    for (const f of fails) console.log(`  ${f}`)
    return 1
  }
  console.log('✓ self-test: حكمُ ci (ثلاثَ عشرةَ حالة) والانتظارُ (أربع) ومعرّفُ ما نُشر (ثلاث) والنطاقُ يخدمه (سبع) وعلامةُ Time Travel (خمس) والأوامرُ (ستّة)')
  return 0
}

const args = process.argv.slice(2)
process.exitCode = args.includes('--self-test') ? await selfTest() : await main(args)
