/**
 * **فحوصُ سير النشر التي تحتاج منطقًا لا سطرَ bash** (D-319) — وكلٌّ منها يُختبر هنا بلا شبكة (`--self-test` في `npm run ci`).
 *
 * ## ١ · `ci-gate <owner/repo> <sha>` — بوّابةُ ci على الالتزام نفسِه
 *
 * كان `deploy.yml` يعيد `npm run ci` كاملًا على الالتزام الذي فرغ منه `ci.yml` للتوّ: نحو ثلاث دقائق تُدفع مرّتين في كلّ دمج،
 * والدقائقُ نفدت ثلاثَ مرّات (M-23). فصار النشرُ يسأل GitHub (`GITHUB_TOKEN` بإذن `actions: read`) عن تشغيلات `ci.yml` على
 * الالتزام، ويحكم:
 *
 * | ما وُجد | الحكم |
 * |---|---|
 * | تشغيلٌ ناجحٌ (`push` أو `workflow_dispatch`) | `pass` — لا تُعاد البوّابة |
 * | تشغيلٌ لم يكتمل ولا ناجحَ قبله | ينتظر حتّى يكتمل (حتّى المهلة) |
 * | تشغيلٌ ساقطٌ ولا ناجحَ ولا جارٍ | `refuse` — **لا نشرَ على شيفرةٍ سقطت بوّابتُها** |
 * | لا تشغيلَ أصلًا، أو أُلغي وحده، أو تعذّر السؤال | `run` — تجري البوّابةُ هنا كما كانت (الاحتياط) |
 *
 * وتشغيلُ `pull_request` لا يُعدّ: يفحص الدمجَ مع قاعدةٍ قد تكون تغيّرت، لا الالتزامَ نفسَه.
 * ويكتب الحكمَ في `$GITHUB_OUTPUT` (`gate=pass|run`)، ويخرج بـ1 على الرفض أو انقضاء المهلة.
 *
 * ## ٢ · `deployed <ndjson>` — معرّفُ النسخة التي نشرها `wrangler deploy` للتوّ
 *
 * من ملفّ `WRANGLER_OUTPUT_FILE_PATH` (سطرُ `"type":"deploy"` و`version_id`)، لا من نصٍّ مطبوعٍ للبشر يتبدّل بين إصدارات wrangler.
 *
 * ## ٣ · `wait <base> <version>` — النطاقُ يخدم تلك النسخة
 *
 * يسأل `<base>/ready` حتّى يقول `"version"` المعرّفَ نفسَه، أو يسقط بعد المحاولات بما خدمه وما نُشر. **والنطاقُ المخصّص وحده**
 * — لا بديلَ workers.dev: نشرٌ يصل عنوانًا آخر ولا يصل النطاقَ ليس نشرًا.
 *
 * الاستعمال: node scripts/deploy_checks.mjs <ci-gate|deployed|wait> … | --self-test
 */
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** ما يُعدّ من تشغيلات ci: ما فحص الالتزامَ نفسَه. */
const COUNTED_EVENTS = new Set(['push', 'workflow_dispatch'])
/** الخواتيمُ التي تعني «سقطت البوّابة» — لا «لم تجرِ». */
const FAILED = new Set(['failure', 'timed_out', 'startup_failure', 'action_required'])

/**
 * الحكمُ على تشغيلات ci لالتزامٍ واحد — نقيٌّ ليُختبَر.
 * @param {ReadonlyArray<{ event: string, status: string, conclusion: string | null, html_url?: string }>} runs
 * @returns {{ kind: 'pass' | 'wait' | 'refuse' | 'run', url?: string }}
 */
export function verdict(runs) {
  const counted = runs.filter((r) => COUNTED_EVENTS.has(r.event))
  const passed = counted.find((r) => r.status === 'completed' && r.conclusion === 'success')
  if (passed !== undefined) return { kind: 'pass', url: passed.html_url }
  const running = counted.find((r) => r.status !== 'completed')
  if (running !== undefined) return { kind: 'wait', url: running.html_url }
  const failed = counted.find((r) => r.conclusion !== null && FAILED.has(r.conclusion))
  if (failed !== undefined) return { kind: 'refuse', url: failed.html_url }
  return { kind: 'run' }
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
 * @returns {Promise<{ ok: boolean, served: string | null }>}
 */
export async function waitVersion({ get, sleep, log, expected, tries, intervalMs }) {
  let served = null
  for (let i = 1; i <= tries; i += 1) {
    let status = 0
    try {
      const res = await get()
      status = res.status
      const body = JSON.parse(res.text)
      // ‏جوابُ صدى وحده يُقرأ: قالبٌ أو صفحةُ خطأٍ بحقل `version` لا تُعدّ
      served = body !== null && body.service === 'sada-api' && typeof body.version === 'string' ? body.version : null
    } catch {
      served = null
    }
    log(`  /ready → HTTP ${status} · النسخة ${served ?? 'لا تُقرأ'} (${i}/${tries})`)
    if (served === expected) return { ok: true, served }
    if (i < tries) await sleep(intervalMs)
  }
  return { ok: false, served }
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (line) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`) }

async function main(argv) {
  const [cmd, a, b] = argv
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
    if (!a || !b) { console.log('::error::الاستعمال: wait <base> <version> — والنسخةُ فارغة: أقرأ «النشر» معرّفَها؟'); return 2 }
    const get = async () => {
      const res = await fetch(`${a}/ready`, { signal: AbortSignal.timeout(15_000), headers: { 'Cache-Control': 'no-cache' } })
      return { status: res.status, text: await res.text() }
    }
    const r = await waitVersion({ get, sleep: sleepReal, log: console.log, expected: b, tries: 12, intervalMs: 5_000 })
    if (r.ok) { console.log(`${a} يخدم النسخةَ التي نُشرت للتوّ: ${b}`); return 0 }
    console.log(`::error::${a} يخدم «${r.served ?? 'ما لا يُقرأ'}» لا «${b}» الذي نُشر للتوّ — بناءٌ قديمٌ ما يزال يخدم، أو النطاقُ لغير هذا الـ Worker.`)
    return 1
  }
  console.log('الاستعمال: node scripts/deploy_checks.mjs <ci-gate|deployed|wait> … | --self-test')
  return 2
}

async function selfTest() {
  const fails = []
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`) }
  const run = (event, status, conclusion) => ({ event, status, conclusion, html_url: `u/${event}/${conclusion ?? status}` })

  // ١ · الحكم
  eq('لا تشغيل ← البوّابة هنا', verdict([]).kind, 'run')
  eq('ناجحٌ على push', verdict([run('push', 'completed', 'success')]).kind, 'pass')
  eq('ناجحٌ بعد ساقط (إعادة تشغيل)', verdict([run('push', 'completed', 'failure'), run('workflow_dispatch', 'completed', 'success')]).kind, 'pass')
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

  // ٥ · الأوامرُ نفسُها: ملفُّ المخرَج والخروج
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
    const codeEmpty = await main(['wait', 'https://sada2.basserh.com', ''])
    Object.assign(console, { log, error })
    eq('deployed يطبع المعرّف وحده', [codeOk, first], [0, NEW])
    eq('deployed بلا ملفّ يسقط', codeMissing, 1)
    eq('wait بلا نسخة يسقط', codeEmpty, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (fails.length > 0) {
    console.log(`✕ self-test: ${fails.length} لم يقع كما يجب`)
    for (const f of fails) console.log(`  ${f}`)
    return 1
  }
  console.log('✓ self-test: حكمُ ci (تسعُ حالات) والانتظارُ (أربع) ومعرّفُ ما نُشر (ثلاث) والنطاقُ يخدمه (ستّ) والأوامرُ (ثلاثة)')
  return 0
}

const args = process.argv.slice(2)
process.exitCode = args.includes('--self-test') ? await selfTest() : await main(args)
