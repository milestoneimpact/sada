/**
 * عدّادُ الخطوات (DESIGN-PLAN §10.1) — الرحلاتُ الاثنتا عشرة على نسخةٍ محلّيّةٍ حيّة.
 *
 *     npm run journeys                          ← كلُّ الرحلات، هاتفٌ وحاسوب
 *     npm run journeys -- --only R-2,R-8        ← بعضُها
 *     npm run journeys -- --vp phone            ← مقاسٌ واحد
 *     npm run journeys -- --out /path/to/dir    ← مجلّدُ المخرجات (افتراضًا ‎$TMPDIR/sada-journeys)
 *     npm run journeys -- --port 8788           ← منفذٌ غيرُ 8787
 *     npm run journeys -- --baseline old/results.json  ← جدولُ «قبل ← بعد» في SUMMARY.md
 *     npm run journeys -- --update              ← يضيّق عتبةَ ما نزل تحتها، ويكتب عتبةَ رحلةٍ جديدة (ولا يُرخي)
 *
 * ‏**ويخرج بغير الصفر** (D-326) حين تخسر رحلةٌ نجاحَها أو تزيد خطوةً أو تحميلًا عن عتبتها في `thresholds.json`، أو تُقاس رحلةٌ
 * ‏بلا عتبة. والخلاصةُ لا تقول إلّا ما قيس: لا جملةَ ثابتةً فيها، والبذرةُ تُقرأ من القاعدة نفسِها (`gate.ts`).
 *
 * لكلّ رحلةٍ ولكلّ مقاس: قاعدةٌ جديدةٌ من البذرة، وجلسةٌ جديدة، ثمّ تبدأ من الرئيسيّة
 * وتمضي بما يُرى. ويُكتب `results.json` و`SUMMARY.md` ولقطةٌ لكلّ خطوة.
 *
 * **ولا شبكة**: الخادمُ يجيب عن المزوّدين المدفوعين بجوابٍ حتميّ، والمتصفّحُ يُمنع من
 * كلّ عنوانٍ غير المحلّيّ — ومغادرتُه إلى OAuth تُسجَّل ولا تقع.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { Blocked, Meter, VIEWPORTS, type StepRecord, type Viewport } from './meter'
import { CHROMIUM, startServer, type Stack } from './server'
import { JOURNEYS, login, type Journey } from './journeys'
import { judge, readThresholds, tightened, writeThresholds, type Judgement } from './gate'

interface Args {
  readonly only: readonly string[] | null
  readonly vps: readonly Viewport[]
  readonly out: string
  readonly port: number
  /** نتائجُ تشغيلٍ سابق (`results.json`) تُقارَن بها هذه في SUMMARY.md. */
  readonly baseline: string | null
  /** يضيّق العتبات بما قيس (ولا يُرخي)، ويكتب عتبةَ الجديدة. */
  readonly update: boolean
}

function args(argv: readonly string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const only = get('only')
  const vp = get('vp')
  const baseline = get('baseline')
  return {
    only: only === undefined ? null : only.split(',').map((s) => s.trim()),
    vps: vp === undefined ? VIEWPORTS : VIEWPORTS.filter((v) => vp.split(',').includes(v.name)),
    // ‏خارجَ المستودع افتراضًا: لقطاتٌ ومقاطعُ لا تُلتزَم
    out: resolve(get('out') ?? process.env['JOURNEYS_OUT'] ?? join(tmpdir(), 'sada-journeys')),
    port: Number(get('port') ?? 8787),
    baseline: baseline === undefined ? null : resolve(baseline),
    update: argv.includes('--update'),
  }
}

export interface JourneyResult {
  readonly id: string
  readonly title: string
  readonly viewport: string
  readonly plan: { readonly target: string }
  /** أفعالُ المالك: نقرةٌ أو اختيارٌ أو كتابةٌ أو ملفٌّ أو تأكيد. */
  readonly steps: number
  /** اللمساتُ المادّيّة (القائمةُ لمستان، والملفُّ لمستان). */
  readonly taps: number
  readonly loads: number
  readonly scrollPx: number
  /** التمريرُ بالشاشات: البكسلُ مقسومًا على ما يُرى من النافذة. */
  readonly screens: number
  readonly swipes: number
  /** أكان الفعلُ الحاسمُ في الشاشة الأولى من صفحته؟ */
  readonly firstScreen: boolean | null
  readonly keyControl: string | null
  readonly success: boolean
  readonly verified: string
  readonly ms: number
  readonly systemMs: number
  readonly klmSec: number
  readonly flashes: readonly string[]
  readonly disabled: readonly string[]
  readonly dialogs: readonly string[]
  readonly milestones: Readonly<Record<string, number>>
  readonly notes: readonly string[]
  readonly screenshots: readonly string[]
  readonly detail: readonly StepRecord[]
  readonly leftSite: readonly string[]
  readonly serverErrors: readonly string[]
  readonly blockedNetwork: readonly string[]
  /** أخطاءُ الصفحة («pageerror»): ما رماه سكربتٌ ولم يُلتقَط. */
  readonly pageErrors: readonly string[]
  /**
   * ‏**وما كُتم منها** (مراجعة D-323): رفضُ انتقالٍ أسقطه المتصفّحُ يكتمه سكربتُ الرأس فلا يصير «pageerror»، ويكتب سطرًا
   * ‏في «console.debug» بعلامة «sada:vt-muted» — فيُعَدّ هنا بجوار أخطاء الصفحة، ولا يُقرأ الكتمُ منعًا.
   */
  readonly vtMuted: number
  readonly error: string | null
}

/** مقطعٌ رأسيٌّ حقيقيّ (MP4 يقرؤه المتصفّح) — يُسجَّل من لوحة رسمٍ في Chromium. */
async function makeClip(browser: Browser, path: string): Promise<{ bytes: Uint8Array; width: number; height: number; durationMs: number; mime: string }> {
  const page = await browser.newPage()
  const b64 = (await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 540; c.height = 960
    const g = c.getContext('2d'); document.body.appendChild(c)
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 900000 })
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data)
    const done = new Promise((r) => rec.onstop = r)
    rec.start(250)
    const t0 = performance.now()
    await new Promise((r) => { const tick = () => {
      const t = (performance.now() - t0) / 1000
      g.fillStyle = '#14213d'; g.fillRect(0, 0, 540, 960)
      g.fillStyle = '#e0b354'; g.beginPath(); g.arc(270, 480 + Math.sin(t * 3) * 220, 70, 0, 7); g.fill()
      g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.direction = 'rtl'
      g.fillText('الإطار الأوّل', 270, 160); g.fillText(t.toFixed(1), 270, 880)
      if (t < 4.2) requestAnimationFrame(tick); else r()
    }; tick() })
    rec.stop(); await done
    const blob = new Blob(parts, { type: mime })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    return mime + '|' + btoa(s)
  })()`)) as string
  await page.close()
  const [mime, data] = b64.split('|') as [string, string]
  const bytes = new Uint8Array(Buffer.from(data, 'base64'))
  writeFileSync(path, bytes)
  return { bytes, width: 540, height: 960, durationMs: 4200, mime }
}

/** خطّةٌ من ثلاثة أسطر بعد ثلاثة أيّام — LinkedIn وX المربوطتان. */
function makePlan(path: string): void {
  const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const rows = [
    'date,time,platform,text',
    `${day},09:30,linkedin,"المعلَم اتّفاق مكتوب على معنى «تمّ» قبل أن يبدأ العمل — ثلاثة أسئلة تحسمه."`,
    `${day},12:00,x,"ثلاثة أسئلة قبل كلّ معلَم توفّر ساعةً كلّ أسبوع. #إدارة_المشاريع"`,
    `${day},18:00,linkedin,"من الاجتماع الطويل إلى المراجعة القصيرة: ما الذي تغيّر حين عرّفنا «تمّ» كتابةً؟"`,
  ]
  writeFileSync(path, `${rows.join('\n')}\n`)
}

async function runOne(browser: Browser, stack: Stack, journey: Journey, vp: Viewport, out: string, assets: { clip: string; plan: string }): Promise<JourneyResult> {
  await stack.reset()
  const prepared = journey.prepare === undefined ? null : await journey.prepare(stack)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.touch,
    hasTouch: vp.touch,
    locale: 'ar',
    timezoneId: 'Asia/Riyadh',
  })
  // ‏`tsx` يلفّ الدوالّ بـ `__name` — ودالّةٌ تُمرَّر إلى الصفحة تحتاجه هناك
  await context.addInitScript('globalThis.__name = (f) => f')
  const leftSite: string[] = []
  const leftPage = (url: URL) => ({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html dir="rtl" lang="ar"><meta name="viewport" content="width=device-width"><body style="font:16px sans-serif;padding:24px"><h1>غادر الموقع</h1><p>إلى <b>${url.origin}</b></p><code style="word-break:break-all">${url.pathname}</code><p>(أوقفه القياس: هنا تبدأ موافقة المنصّة)</p></body></html>`,
  })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      leftSite.push(url.href)
      return route.fulfill(leftPage(url))
    }
    // ‏بدءُ OAuth يردّ 302 إلى المنصّة — والتحويلُ لا يمرّ بالموجِّه، فيُقرأ هنا ويُعاد **تحويلًا** كما يردّه الخادم: فيتبعه المتصفّح
    // ‏إلى أصل المنصّة، ويُسجَّل ويُوقَف في فرع العنوان الخارجيّ أعلاه. وكانت صفحةُ «غادر الموقع» تُردّ هنا على المسار المحلّيّ
    // ‏نفسِه — مستندًا من أصلنا بلا «@view-transition» — فيُسقط المتصفّحُ الانتقالَ بين المستندين ويرمي «Transition was aborted
    // ‏because of invalid state. ViewTransition opt-in disabled» خطأَ صفحةٍ في ر-1 لا يقع في الإنتاج (D-323)
    if (/^\/oauth\/[^/]+\/start$/.test(url.pathname)) {
      const response = await route.fetch({ maxRedirects: 0 })
      const location = response.headers()['location']
      if (response.status() >= 300 && response.status() < 400 && location !== undefined) {
        const to = new URL(location, url)
        if (to.hostname !== 'localhost') return route.fulfill({ status: response.status(), headers: { location: to.href } })
      }
      return route.fulfill({ response })
    }
    return route.continue()
  })
  const page = await context.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  let vtMuted = 0
  page.on('console', (msg) => { if (msg.type() === 'debug' && msg.text().startsWith('sada:vt-muted')) vtMuted += 1 })

  const rel = join('shots', vp.name, journey.id.replace(/[^\w-]+/g, '_'))
  const dir = join(out, rel)
  rmSync(dir, { recursive: true, force: true })
  const m = new Meter(page, vp, dir, rel)
  if (prepared !== null) m.note(prepared)

  let verdict: { success: boolean; verified: string } = { success: false, verified: 'لم تكتمل' }
  let error: string | null = null
  try {
    if (journey.startLoggedOut === true) {
      await page.goto(`${stack.url}/panel/report`)
    } else {
      await login(page, stack)
    }
    await page.waitForLoadState('networkidle')
    await m.start(journey.startLoggedOut === true ? 'صفحة الدخول' : 'الرئيسيّة')
    verdict = await journey.run({ page, m, stack, assets, leftSite })
  } catch (e) {
    error = e instanceof Blocked ? `توقّف: ${e.message}` : e instanceof Error ? e.message.split('\n')[0]! : String(e)
    await m.shot('توقّف').catch(() => undefined)
  }
  await m.shot('النتيجة').catch(() => undefined)
  const ms = m.elapsed()
  await context.close()
  if (pageErrors.length > 0) m.note(`أخطاء الصفحة: ${pageErrors.slice(0, 3).join(' · ')}`)
  if (vtMuted > 0) m.note(`انتقالٌ أسقطه المتصفّحُ فكُتم رفضُه: ${vtMuted}`)

  return {
    id: journey.id,
    title: journey.title,
    viewport: `${vp.name} ${vp.width}×${vp.height}${vp.touch ? ' touch' : ''} @${vp.dpr}x`,
    plan: journey.plan,
    steps: m.actions,
    taps: m.taps,
    loads: m.loads,
    scrollPx: Math.round(m.scrollPx),
    screens: m.usableHeight === 0 ? 0 : Math.round((m.scrollPx / m.usableHeight) * 10) / 10,
    swipes: m.swipes,
    firstScreen: m.firstScreen,
    keyControl: m.keyLabel,
    success: error === null && verdict.success,
    verified: verdict.verified,
    ms,
    systemMs: m.systemMs,
    klmSec: m.klmSeconds(),
    flashes: m.flashes,
    disabled: [...m.disabledSeen],
    dialogs: m.dialogs,
    milestones: m.milestones,
    notes: m.notes,
    screenshots: m.shots,
    detail: m.steps,
    leftSite,
    serverErrors: stack.errors.splice(0).map((e) => `${e.path}: ${e.message.split('\n')[0]}`),
    blockedNetwork: stack.calls.filter((c) => c.answeredBy === 'blocked').map((c) => `${c.method} ${c.url}`),
    pageErrors,
    vtMuted,
    error,
  }
}

// ── التقرير ────────────────────────────────────────────────────────────

/** الأعطالُ (ملاحظاتٌ تبدأ بـ ⚠) مجموعةً بنصّها، ومعها الرحلاتُ التي كشفتها. */
function findingsOf(results: readonly JourneyResult[]): { text: string; journeys: string[] }[] {
  const found = new Map<string, Set<string>>()
  for (const r of results) {
    for (const n of r.notes.filter((x) => x.startsWith('⚠'))) {
      found.set(n.slice(2), (found.get(n.slice(2)) ?? new Set<string>()).add(r.id))
    }
  }
  return [...found].map(([text, ids]) => ({ text, journeys: [...ids] }))
}

const yes = (v: boolean | null) => (v === null ? '—' : v ? 'نعم' : 'لا')

/** ما يُقارَن من تشغيلٍ سابق — حقولُ `results.json` التي يقرؤها جدولُ «قبل ← بعد». */
type Baseline = Pick<JourneyResult, 'id' | 'viewport' | 'steps' | 'loads' | 'scrollPx' | 'screens' | 'firstScreen' | 'success' | 'klmSec' | 'error'>

function readBaseline(path: string): { startedAt: string; results: Baseline[] } {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { startedAt?: string; results?: Baseline[] }
  return { startedAt: raw.startedAt ?? '—', results: raw.results ?? [] }
}

/** «قبل ← بعد» لكلّ رحلةٍ ومقاس: الأرقامُ نفسُها والتحقّقُ نفسُه، والفرقُ الواجهة. */
function comparison(results: readonly JourneyResult[], base: { startedAt: string; results: readonly Baseline[] }, path: string): string[] {
  const ids = [...new Set([...base.results.map((r) => r.id), ...results.map((r) => r.id)])]
  const pick = <T extends { id: string; viewport: string }>(rows: readonly T[], id: string, vp: string) => rows.find((r) => r.id === id && r.viewport.startsWith(vp))
  const ok = (r: Baseline | undefined) => (r === undefined ? '—' : r.success ? '✓' : r.error === null ? '✗' : '✗ توقّف')
  const arrow = (a: string | number | undefined, b: string | number | undefined) => `${a ?? '—'} ← ${b ?? '—'}`
  const half = (a: Baseline | undefined, b: Baseline | undefined) =>
    `${arrow(ok(a), ok(b))} · ${arrow(a?.steps, b?.steps)} · ${arrow(a?.loads, b?.loads)} · ${arrow(a === undefined ? undefined : `${a.scrollPx}px`, b === undefined ? undefined : `${b.scrollPx}px`)} · ${arrow(a === undefined ? undefined : yes(a.firstScreen), b === undefined ? undefined : yes(b.firstScreen))} · ${arrow(a === undefined ? undefined : `${a.klmSec}ث`, b === undefined ? undefined : `${b.klmSec}ث`)}`
  const lines: string[] = []
  lines.push('', '## قبل ← بعد', '')
  lines.push(`خطّ الأساس: \`${path}\` (شُغِّل في ${base.startedAt.slice(0, 16).replace('T', ' ')} UTC). كلّ خانة «قبل ← بعد»، والتحقّق من القاعدة نفسُه في التشغيلين. «✗ توقّف» رحلة لم تبلغ هدفَها (هدف غير ظاهر أو زرّ معطَّل).`, '')
  lines.push('| الرحلة | الهاتف: نجاح · خطوات · تحميل · تمرير · شاشة أولى · KLM | الحاسوب: نجاح · خطوات · تحميل · تمرير · شاشة أولى · KLM |')
  lines.push('|---|---|---|')
  for (const id of ids) {
    lines.push(`| **${id}** | ${half(pick(base.results, id, 'phone'), pick(results, id, 'phone'))} | ${half(pick(base.results, id, 'desktop'), pick(results, id, 'desktop'))} |`)
  }
  return lines
}

/** ما في البذرة كما قُرئ من القاعدة بعد زرعها — لا وصفٌ مكتوبٌ سلفًا (D-326). */
export interface SeedInventory {
  readonly rows: readonly { readonly what: string; readonly n: string }[]
}

export interface RunFacts {
  readonly judgement: Judgement
  readonly seed: SeedInventory
  readonly aiDelayMs: number
  readonly viewports: readonly Viewport[]
}

/** مقاسٌ كما يُكتب في رأس الخلاصة — من `VIEWPORTS` نفسِها. */
function vpLine(v: Viewport): string {
  return `${v.name === 'phone' ? 'الهاتف' : 'الحاسوب'} ${v.width}×${v.height}${v.touch ? ' لمس' : ''} @${v.dpr}x`
}

function gateLines(j: Judgement): string[] {
  const lines: string[] = []
  const word = { ok: '✓', tighter: '✓ تحتها', lost: '✕ خسرت النجاح', steps: '✕ خطوات أكثر', loads: '✕ تحميل أكثر', first: '✕ خرجت من الشاشة الأولى', missing: '✕ بلا عتبة', stale: '✕ عتبة قديمة' } as const
  lines.push('', '## العتبات (`scripts/journeys/thresholds.json`)', '')
  lines.push(j.failures.length === 0
    ? `لا رحلةَ تجاوزت عتبتَها${j.tighter.length === 0 ? '.' : ` — و${j.tighter.length} تحتها: \`npm run journeys -- --update\` يضيّقها.`}`
    : `**${j.failures.length} تجاوزٌ يُسقط التشغيل:**`)
  for (const f of j.failures) lines.push(`- ${f.text}`)
  lines.push('', '| الرحلة | الهاتف: العتبة ← المقيس | الحاسوب: العتبة ← المقيس |', '|---|---|---|')
  const ids = [...new Set(j.rows.map((r) => r.id))]
  const cell = (id: string, vp: 'phone' | 'desktop'): string => {
    const r = j.rows.find((x) => x.id === id && x.vp === vp)
    if (r === undefined) return '—'
    const t = r.threshold
    const want = t === null ? '—' : `≤${t.steps} خطوات · ≤${t.loads} تحميل${t.firstScreen === true ? ' · شاشة أولى' : ''}`
    return `${want} ← ${r.measured.steps} · ${r.measured.loads}${t?.firstScreen === true ? ` · ${yes(r.measured.firstScreen)}` : ''} ${word[r.kind]}`
  }
  for (const id of ids) lines.push(`| **${id}** | ${cell(id, 'phone')} | ${cell(id, 'desktop')} |`)
  return lines
}

function summary(results: readonly JourneyResult[], started: Date, facts: RunFacts, baseline: { path: string; data: { startedAt: string; results: readonly Baseline[] } } | null = null): string {
  const ids = [...new Set(results.map((r) => r.id))]
  const by = (id: string, vp: string) => results.find((r) => r.id === id && r.viewport.startsWith(vp))
  const cell = (r: JourneyResult | undefined, f: (r: JourneyResult) => string) => (r === undefined ? '—' : f(r))
  const lines: string[] = []
  lines.push(baseline === null ? '# قياس الرحلات — الواجهة الحاليّة' : '# قياس الرحلات — الواجهة الحاليّة مقابل خطّ الأساس', '')
  lines.push(`شُغِّل في ${started.toISOString().slice(0, 16).replace('T', ' ')} UTC على نسخة محلّيّة حيّة (\`npm run journeys\`): SQLite بكلّ الترحيلات، والبذرة أدناه، ومزوّدون مزيَّفون بلا شبكة. ${facts.viewports.map(vpLine).join('، ')}.`, '')
  lines.push(`**الخطوات** أفعال المالك (نقرة، اختيار من قائمة، لصق أو كتابة، ملفّ، تأكيد). **التمرير** بالبكسل حتّى يظهر كلّ هدف فوق الشريط السفليّ. **الشاشة الأولى**: أكان الفعل الحاسم ظاهرًا بلا تمرير حين بلغ صفحتَه. **النجاح** من القاعدة لا من رسالة الصفحة. **KLM** تقدير لزمن الإنسان (تفكير وإشارة لكلّ فعل + سحبات + زمن التطبيق المقيس)، والنموذج المزيَّف في هذا التشغيل يجيب بعد ${facts.aiDelayMs / 1000}ث.`, '')
  lines.push('| الرحلة | الهدف | الهاتف: خطوات · تحميل · تمرير (شاشات) · شاشة أولى · نجاح · KLM | الحاسوب: خطوات · تحميل · تمرير (شاشات) · شاشة أولى · نجاح · KLM |')
  lines.push('|---|---|---|---|')
  for (const id of ids) {
    const p = by(id, 'phone')
    const d = by(id, 'desktop')
    const row = (r: JourneyResult) =>
      `${r.steps} · ${r.loads} · ${r.scrollPx}px (${r.screens}) · ${yes(r.firstScreen)} · ${r.success ? '✓' : '✗'} · ${r.klmSec}ث`
    const any = p ?? d
    lines.push(`| **${id}** ${any?.title ?? ''} | ${any?.plan.target ?? ''} | ${cell(p, row)} | ${cell(d, row)} |`)
  }
  lines.push(...gateLines(facts.judgement))
  if (baseline !== null) lines.push(...comparison(results, baseline.data, baseline.path))

  // ‏أخطاءُ الصفحة وما كُتم منها — رقمان متجاوران لا رقمٌ واحد (مراجعة D-323)
  const erred = results.filter((r) => r.pageErrors.length > 0)
  const muted = results.filter((r) => r.vtMuted > 0)
  lines.push('', '## أخطاء الصفحة وما كُتم', '')
  lines.push(`- **أخطاء الصفحة** («pageerror»): ${erred.reduce((n, r) => n + r.pageErrors.length, 0)} في ${erred.length} من ${results.length} رحلة${erred.length === 0 ? '' : ` (${erred.map((r) => `${r.id} ${r.viewport.split(' ')[0]}`).join('، ')})`}.`)
  lines.push(`- **انتقالٌ أسقطه المتصفّحُ فكُتم رفضُه** (\`sada:vt-muted\`، سكربتُ الرأس): ${muted.reduce((n, r) => n + r.vtMuted, 0)} في ${muted.length} من ${results.length} رحلة${muted.length === 0 ? '' : ` (${muted.map((r) => `${r.id} ${r.viewport.split(' ')[0]}`).join('، ')})`}. يقع ولا يُرى: لا يكسر شيئًا، ويُعَدّ هنا كي لا يُقرأ الكتمُ منعًا.`)

  // ‏ر-2 كما وقع: أين يقف مالكٌ على الهاتف
  const stop = by('R-2·stop', 'phone')
  const ok = by('R-2', 'phone')
  if (stop !== undefined) {
    lines.push('', `## ر-2·stop على الهاتف — ${stop.success ? 'نجحت' : 'لم تنجح'}`, '')
    lines.push('مالك يفتح «المنشورات» من الشريط السفليّ ويمرّر بحثًا عن «اكتب»، ويقف عند أوّل زرٍّ رئيسيٍّ أو تبويبٍ في شريط القسم يوافق مقصدَه (اكتب · أنشئ · جديد · اعتمد). ما رآه شاشةً شاشة:', '')
    for (const n of stop.notes.filter((x) => x.startsWith('شاشة'))) lines.push(`- ${n}`)
    for (const n of stop.notes.filter((x) => !x.startsWith('شاشة') && !x.startsWith('⚠'))) lines.push(`- ${n}`)
    lines.push(`- **وما وقع حين ضغطه:** ${stop.verified}. والإشعار: ${stop.flashes.map((f) => `«${f}»`).join(' · ') || '—'}`)
    if (ok !== undefined) {
      lines.push(`- **ر-2 في التشغيل نفسِه**: ${ok.steps} خطوات و${ok.scrollPx}px تمريرًا (${ok.screens} شاشة): ${ok.detail.filter((x) => x.kind !== 'look').map((x) => x.label).join(' ← ') || '—'}.`)
    }
  }

  // ‏البذرةُ كما قُرئت من القاعدة بعد زرعها، وما زادته كلُّ رحلةٍ يُكتب في قسمها («أُضيف …»)
  lines.push('', '## البذرة كما قُرئت من القاعدة', '')
  for (const row of facts.seed.rows) lines.push(`- ${row.what}: ${row.n}`)
  lines.push('')

  const findings = findingsOf(results)
  if (findings.length > 0) {
    lines.push('', '## أعطال كشفها التشغيل الحيّ', '')
    for (const f of findings) lines.push(`- ${f.text} _(${f.journeys.join('، ')})_`)
  }
  lines.push('', '## ما وُجد في كلّ رحلة', '')
  for (const id of ids) {
    for (const r of results.filter((x) => x.id === id)) {
      lines.push(`### ${r.id} · ${r.viewport.split(' ')[0]} — ${r.success ? 'نجحت' : 'لم تنجح'}`, '')
      lines.push(`- **التحقّق:** ${r.verified}${r.error === null ? '' : ` · **${r.error}**`}`)
      lines.push(`- **الأرقام:** ${r.steps} خطوات (${r.taps} لمسة) · ${r.loads} تحميل صفحة · ${r.scrollPx}px تمريرًا (${r.screens} شاشة، ${r.swipes} سحبة) · الفعل الحاسم «${r.keyControl ?? '—'}» ${r.firstScreen === null ? '' : r.firstScreen ? 'في الشاشة الأولى' : 'تحت الشاشة الأولى'} · ${(r.ms / 1000).toFixed(1)}ث آليًّا (${(r.systemMs / 1000).toFixed(1)}ث انتظارًا للتطبيق) · KLM ≈ ${r.klmSec}ث`)
      if (Object.keys(r.milestones).length > 0) lines.push(`- **محطّات:** ${Object.entries(r.milestones).map(([k, v]) => `${k} بعد ${v} خطوات`).join(' · ')}`)
      const path = r.detail.map((s) => `${s.kind === 'look' ? '👁 ' : ''}${s.label}${s.scrolledPx > 0 ? ` (↓${s.scrolledPx}px)` : ''}${s.loaded ? ' ⟳' : ''}`).join(' ← ')
      lines.push(`- **المسار:** ${path || '—'}`)
      if (r.flashes.length > 0) lines.push(`- **الإشعارات:** ${r.flashes.map((f) => `«${f}»`).join(' · ')}`)
      if (r.disabled.length > 0) lines.push(`- **معطَّل في الشاشة:** ${r.disabled.map((d) => `«${d}»`).join(' · ')}`)
      if (r.dialogs.length > 0) lines.push(`- **حوارات:** ${r.dialogs.map((d) => `«${d}»`).join(' · ')}`)
      if (r.leftSite.length > 0) lines.push(`- **غادر إلى:** ${r.leftSite.map((u) => new URL(u).origin + new URL(u).pathname).join(' · ')}`)
      for (const n of r.notes) lines.push(`- ${n}`)
      if (r.serverErrors.length > 0) lines.push(`- **أخطاء الخادم:** ${r.serverErrors.join(' · ')}`)
      lines.push(`- **اللقطات:** \`${r.screenshots[0]?.split('/').slice(0, 3).join('/') ?? '—'}/\` (${r.screenshots.length})`, '')
    }
  }
  return `${lines.join('\n')}\n`
}

// ── التشغيل ────────────────────────────────────────────────────────────

/** ‏البذرةُ كما في القاعدة بعد زرعها — عدٌّ بالاستعلام، فما تقوله الخلاصةُ عنها ما قيس لا ما كُتب سلفًا. */
function inventory(stack: Stack): SeedInventory {
  const rows: { what: string; n: string }[] = []
  const list = (what: string, sql: string, fmt: (r: Record<string, unknown>) => string): void => {
    try {
      const got = stack.db.raw.prepare(sql).all() as Record<string, unknown>[]
      rows.push({ what, n: got.length === 0 ? '0' : got.map(fmt).join(' · ') })
    } catch (e) {
      rows.push({ what, n: `تعذّرت قراءتُه (${e instanceof Error ? e.message.split('\n')[0] : String(e)})` })
    }
  }
  list('المصادر (المحلَّل منها)', `SELECT s.name AS name, COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM content_items c WHERE c.source_id = s.id)) AS done
    FROM sources s GROUP BY s.name`, (r) => `«${String(r['name'])}» ${String(r['n'])} (${String(r['done'])} محلَّل)`)
  list('الحسابات', 'SELECT platform, status, COUNT(*) AS n FROM accounts GROUP BY platform, status ORDER BY platform',
    (r) => `${String(r['platform'])} ${String(r['status'])} ${String(r['n'])}`)
  list('تطبيقات OAuth في الخزانة', 'SELECT platform FROM oauth_apps ORDER BY platform', (r) => String(r['platform']))
  list('المنشورات بحالها', 'SELECT platform, status, COUNT(*) AS n FROM posts GROUP BY platform, status ORDER BY platform, status',
    (r) => `${String(r['platform'])} ${String(r['status'])} ${String(r['n'])}`)
  list('المقاطع', 'SELECT status, COUNT(*) AS n FROM uploads GROUP BY status', (r) => `${String(r['status'])} ${String(r['n'])}`)
  list('صفوف cost_ledger', `SELECT provider, COUNT(*) AS n FROM cost_ledger GROUP BY provider ORDER BY provider`, (r) => `${String(r['provider'])} ${String(r['n'])}`)
  list('تقارير الأسبوع', 'SELECT COUNT(*) AS n FROM reports', (r) => String(r['n']))
  list('مفاتيح مرور المالك', 'SELECT COUNT(*) AS n FROM passkeys', (r) => String(r['n']))
  list('رمز تطبيق المصادقة (TOTP)', 'SELECT COUNT(*) AS n FROM totp', (r) => String(r['n']))
  return { rows }
}

async function main(): Promise<void> {
  const a = args(process.argv.slice(2))
  // ‏يُقرأ قبل التشغيل: مسارٌ خاطئٌ يُقال الآن لا بعد عشرين دقيقة
  const baseline = a.baseline === null ? null : { path: a.baseline, data: readBaseline(a.baseline) }
  mkdirSync(join(a.out, 'assets'), { recursive: true })
  const started = new Date()
  // ‏وكيلٌ ميّتٌ لكلّ ما ليس محلّيًّا: لا يخرج من المتصفّح طلبٌ ولو فات الموجِّه
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1' },
  })
  const clipPath = join(a.out, 'assets', 'clip.mp4')
  const clip = await makeClip(browser, clipPath)
  const planPath = join(a.out, 'assets', 'plan.csv')
  makePlan(planPath)
  const aiDelayMs = 800
  const stack = await startServer({ port: a.port, video: clip, quiet: true, aiDelayMs })
  console.log(`[journeys] ${stack.url} · المخرجات: ${a.out}`)
  const seedRows = inventory(stack)

  const results: JourneyResult[] = []
  const chosen = JOURNEYS.filter((j) => a.only === null || a.only.includes(j.id))
  try {
    for (const journey of chosen) {
      for (const vp of a.vps) {
        const r = await runOne(browser, stack, journey, vp, a.out, { clip: clipPath, plan: planPath })
        results.push(r)
        console.log(`[journeys] ${r.id.padEnd(9)} ${vp.name.padEnd(7)} ${r.success ? '✓' : '✗'} steps=${r.steps} loads=${r.loads} scroll=${r.scrollPx}px first=${yes(r.firstScreen)} ${(r.ms / 1000).toFixed(1)}s${r.error === null ? '' : ` — ${r.error}`}`)
      }
    }
  } finally {
    await stack.close()
    await browser.close()
  }

  /*
   * ‏**الحكمُ بالعتبات** (D-326): كاملٌ حين شُغّلت الرحلاتُ كلُّها بالمقاسين، فعتبةٌ لرحلةٍ غائبةٍ قديمة؛ وبـ`--only` أو `--vp`
   * ‏يُحكم على ما شُغّل وحده. و`--update` يضيّق ولا يُرخي، ثمّ يُعاد الحكمُ على الملفّ الجديد.
   */
  const complete = a.only === null && a.vps.length === VIEWPORTS.length
  let thresholds = readThresholds()
  if (a.update) {
    thresholds = tightened(results, thresholds, `قيس أوّلَ مرّة في ${started.toISOString().slice(0, 10)}`)
    writeThresholds(thresholds)
  }
  const judgement = judge(results, thresholds, { complete })
  const strip = results.map((r) => ({ ...r, stepsDetail: r.detail, detail: undefined }))
  const report = { startedAt: started.toISOString(), url: stack.url, viewports: a.vps, baseline: a.baseline, findings: findingsOf(results), gate: { failures: judgement.failures, tighter: judgement.tighter }, results: strip }
  writeFileSync(join(a.out, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(a.out, 'SUMMARY.md'), summary(results, started, { judgement, seed: seedRows, aiDelayMs, viewports: a.vps }, baseline))
  console.log(`[journeys] ${results.filter((r) => r.success).length}/${results.length} نجحت · ${join(a.out, 'SUMMARY.md')}`)
  for (const t of judgement.tighter) console.log(`[journeys] ↓ ${t.text}`)
  if (judgement.failures.length > 0) {
    for (const f of judgement.failures) console.log(`[journeys] ✕ ${f.text}`)
    console.log(`[journeys] ✕ ${judgement.failures.length} تجاوزٌ للعتبات (scripts/journeys/thresholds.json)`)
    process.exit(1)
  }
  console.log('[journeys] ✓ لا رحلةَ تجاوزت عتبتَها')
  process.exit(0)
}

await main()
