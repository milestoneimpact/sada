/**
 * **فحصٌ حيٌّ لـ D-378 على staging** — منطقةُ المتصفّح تصل الخادمَ من أوّل تحميل.
 *
 * قال D-378 إنّ سطرًا في `THEME_BOOT` يكتب `sada_tz` قبل `u.js`، والكعكةُ تُكتب من `u.js` وحده (D-392): سطرُ الرأس يُبلَّغ ولا يُسقط، وإن وُجد فبنونس. وهذا الفحصُ يسأل
 * الصفحاتِ العامّة على `sada2.basserh.com` وحده (لا الإنتاج) ثلاثةَ أسئلة، كلٌّ بجوابه:
 *
 * ١ · **سطرُ الرأس**: سكربتٌ في `<head>` نونسُه هو نونسُ رأس CSP، وفيه `sada_tz`.
 * ٢ · **الكعكة**: Chromium بمنطقة `Asia/Riyadh` يفتح الصفحة، فتُكتب `sada_tz=Asia%2FRiyadh` على `/panel`.
 * ٣ · **«بتوقيت الرياض»** في الصفحة إن رُسم وقتٌ مطلق بلا دخول — وإلّا يُقال «لا يُرى بلا دخول»، لا نجاح.
 *
 * لا دخولَ ولا سرَّ ولا كتابة: طلباتُ GET لصفحاتٍ عامّة. وكلُّ طلبٍ وكلُّ تنقّلٍ بمهلة (D-269).
 *
 * الاستعمال: node scripts/smoke_tz.mjs [<base>] | --self-test
 */

/** staging وحده — الإنتاج لا يُجرَّب عليه (CLAUDE.md: النطاقان). */
export const STAGING = 'https://sada2.basserh.com'
/** الصفحاتُ العامّة التي ترسم القالبَ كاملًا بلا دخول. */
export const PAGES = ['/panel']
export const TZ_COOKIE = 'sada_tz'
const TIMEOUT_MS = 20_000

/** مهلةٌ على `fetch` كما في `src/lib/net/timeout.ts` (D-269) — نسخةٌ صغيرةٌ لأنّ النصوصَ هنا `.mjs`. */
export function withTimeout(fetchImpl, ms = TIMEOUT_MS) {
  return (input, init = {}) => fetchImpl(input, { ...init, signal: init.signal ?? AbortSignal.timeout(ms) })
}

/** نونسُ `script-src` من رأس CSP — أو `null`. */
export function cspNonce(csp) {
  const m = /script-src[^;]*'nonce-([A-Za-z0-9+/=_-]+)'/.exec(csp ?? '')
  return m === null ? null : m[1]
}

/**
 * سطرُ المنطقة في `<head>` — نقيٌّ ليُختبَر.
 * @returns {{ found: boolean, nonced: boolean }} `found`: سكربتٌ مضمَّنٌ في الرأس يذكر الكعكة؛ `nonced`: ونونسُه نونسُ CSP.
 */
export function headTzLine(html, nonce) {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html ?? '')?.[1] ?? ''
  let found = false
  let nonced = false
  for (const m of head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1]
    if (/\bsrc=/.test(attrs) || !m[2].includes(TZ_COOKIE)) continue
    found = true
    const n = /\bnonce="([^"]*)"/.exec(attrs)?.[1]
    if (nonce !== null && n === nonce) nonced = true
  }
  return { found, nonced }
}

/** قيمةُ الكعكة من قائمة Playwright (`context.cookies()`) مفكوكةً — أو `null`. */
export function tzCookie(cookies) {
  const c = cookies.find((x) => x.name === TZ_COOKIE)
  if (c === undefined) return null
  try {
    return { zone: decodeURIComponent(c.value), path: c.path }
  } catch {
    return null
  }
}

async function main(base) {
  if (!/^https:\/\/sada2\.basserh\.com\/?$/.test(base)) {
    console.log(`✕ staging وحده: ${base}`)
    return 2
  }
  base = base.replace(/\/$/, '')
  const fetchT = withTimeout(fetch)
  const lines = []
  let fails = 0
  const say = (ok, text) => {
    if (ok === false) fails++
    lines.push(`${ok === true ? '✓' : ok === false ? '✕' : '·'} ${text}`)
  }

  for (const path of PAGES) {
    let res
    try {
      res = await fetchT(base + path, { redirect: 'manual' })
    } catch (e) {
      say(false, `${path}: لم يُجب (${e?.name ?? e})`)
      continue
    }
    if (res.status !== 200) {
      say(null, `${path}: ${res.status} — لا يُفحص`)
      continue
    }
    const nonce = cspNonce(res.headers.get('content-security-policy'))
    const { found, nonced } = headTzLine(await res.text(), nonce)
    say(found ? nonced : null, `${path}: سطرُ \`${TZ_COOKIE}\` في <head> ${found ? (nonced ? 'بنونس CSP' : 'بلا نونس CSP') : 'غائب'} (نونس CSP: ${nonce === null ? 'غائب' : 'حاضر'})`)
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    say(false, 'playwright غير متاح')
  }
  if (chromium !== undefined) {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ timezoneId: 'Asia/Riyadh', locale: 'ar' })
      context.setDefaultTimeout(TIMEOUT_MS)
      const page = await context.newPage()
      const errors = []
      page.on('console', (m) => {
        if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text())
      })
      await page.goto(base + '/panel', { waitUntil: 'load', timeout: TIMEOUT_MS })
      // ‏قبل أيّ تفاعل: ما كُتب من أوّل تحميل
      const tz = tzCookie(await context.cookies(base + '/panel'))
      say(tz?.zone === 'Asia/Riyadh' && tz.path === '/panel',
        `الكعكة بعد أوّل تحميل: ${tz === null ? 'غائبة' : `${tz.zone} على ${tz.path}`}`)
      say(errors.length === 0, `رفضُ CSP في الطرفيّة: ${errors.length}`)
      const text = (await page.textContent('body')) ?? ''
      say(text.includes('بتوقيت الرياض') ? true : null,
        text.includes('بتوقيت الرياض') ? '«بتوقيت الرياض» مرسومة' : '«بتوقيت الرياض»: لا وقتَ مطلقًا يُرى بلا دخول — لم يُفحص')
    } catch (e) {
      say(false, `المتصفّح: ${e?.message ?? e}`)
    } finally {
      await browser.close()
    }
  }

  console.log(lines.join('\n'))
  console.log(fails === 0 ? `✓ D-378 على ${base}` : `✕ D-378 على ${base}: ${fails} لم يقع كما يجب`)
  return fails === 0 ? 0 : 1
}

async function selfTest() {
  const fails = []
  const eq = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`)
  }
  eq('نونس CSP', cspNonce("default-src 'none'; script-src 'nonce-Ab+9/=_-'; style-src 'self'"), 'Ab+9/=_-')
  eq('بلا نونس', cspNonce("script-src 'self'"), null)
  eq('بلا رأس', cspNonce(null), null)
  const page = (head) => `<!doctype html><html><head>${head}</head><body><script nonce="n">sada_tz</script></body></html>`
  eq('سطرٌ بنونس', headTzLine(page(`<script nonce="n">document.cookie='sada_tz='</script>`), 'n'), { found: true, nonced: true })
  eq('نونسٌ آخر', headTzLine(page(`<script nonce="x">sada_tz</script>`), 'n'), { found: true, nonced: false })
  eq('بلا نونس', headTzLine(page(`<script>sada_tz</script>`), 'n'), { found: true, nonced: false })
  eq('CSP بلا نونس', headTzLine(page(`<script nonce="n">sada_tz</script>`), null), { found: true, nonced: false })
  eq('سكربتُ الجسد لا يُعدّ', headTzLine(page(`<script nonce="n">theme</script>`), 'n'), { found: false, nonced: false })
  eq('ملفٌّ خارجيّ لا يُعدّ', headTzLine(page(`<script nonce="n" src="/a/u.js">sada_tz</script>`), 'n'), { found: false, nonced: false })
  eq('كعكةٌ مفكوكة', tzCookie([{ name: 'x', value: '1', path: '/' }, { name: 'sada_tz', value: 'Asia%2FRiyadh', path: '/panel' }]), { zone: 'Asia/Riyadh', path: '/panel' })
  eq('كعكةٌ غائبة', tzCookie([]), null)
  eq('كعكةٌ فاسدة', tzCookie([{ name: 'sada_tz', value: '%E0%A4%A', path: '/panel' }]), null)
  let seen = null
  await withTimeout(async (_u, init) => { seen = init.signal instanceof AbortSignal }, 10)('x')
  eq('المهلةُ إشارة', seen, true)
  if (fails.length > 0) {
    console.log(fails.join('\n'))
    console.log(`✕ self-test: ${fails.length} لم يقع كما يجب`)
    return 1
  }
  console.log('✓ self-test: نونسُ CSP (ثلاث) وسطرُ الرأس (ستّ) والكعكة (ثلاث) والمهلة (واحدة)')
  return 0
}

const args = process.argv.slice(2)
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = args.includes('--self-test') ? await selfTest() : await main(args[0] ?? STAGING)
}
