/**
 * مدقّقُ الروابط: **رابطٌ أو نموذجٌ في الواجهة يقصد مسارًا لا يخدمه أحد** (D-158).
 *
 * ## لماذا
 *
 * الواجهةُ تكتب `href` و`action` نصًّا، والمساراتُ تُسجَّل في `src/routes`
 * نصًّا آخر، **ولا شيءَ يربطهما**: مسارٌ يُعاد تسميتُه في `panel.ts` يبقى في
 * الوسم كما كان، فيضغط المالكُ ويقرأ ‏٤٠٤ — ولا اختبارٌ يمسكه لأنّ النصَّ
 * موجود، ولا مدقّقٌ بصريٌّ لأنّ الزرَّ مرسوم.
 *
 * ## ما يُقرأ
 *
 * - **المسجَّل**: كلُّ `x.get('/…')` و`x.post('/…')` في `src/index.ts` و
 *   `src/routes/*.ts`، والمعامِلُ `:name` يصير مقطعًا حرًّا.
 * - **المقصود**: كلُّ `href="/…"` و`action="/…"` في عيّنات `/tmp/*.html`
 *   المرسومة من القوالب نفسِها (`npm run render`)، بلا الاستعلام ولا المرساة.
 *
 * والخارجيُّ (`https:`، `mailto:`) والمرساةُ الداخليّة (`#…`) ليسا من هذا
 * الفحص. والأصولُ (`/a/`، `/f/`) مسجَّلةٌ كسائر المسارات.
 *
 * ## والحارسُ يُجرَّب على عيبٍ مزروع
 *
 * `--self-test` يحقن رابطًا إلى `/panel/ghost` في عيّنةٍ ويتحقّق أنّ الفحص
 * يسقط. مدقّقٌ لم يسقط على عيبٍ مزروعٍ لا يُوثَق بصفره.
 *
 * الاستعمال:  node scripts/audit_links.mjs /tmp/panel.html …  [--self-test]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname

function registered() {
  const files = [join(ROOT, 'index.ts'), ...readdirSync(join(ROOT, 'routes'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(ROOT, 'routes', f))]
  const out = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\b[A-Za-z_]+\.(get|post|delete|put|all)\(\s*'([^']+)'/g)) {
      const method = m[1] === 'all' ? '*' : m[1]
      const pattern = new RegExp(
        '^' + m[2].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z_]+/g, '[^/]+') + '$',
      )
      out.push({ method, path: m[2], pattern })
    }
  }
  return out
}

function targets(html) {
  const out = []
  for (const m of html.matchAll(/<(a|form|link|script|img)\b[^>]*?\b(href|action|src)="(\/[^"]*)"/g)) {
    const raw = m[3].replace(/[?#].*$/, '')
    const tag = m[1]
    const method = tag === 'form' ? (/\bmethod="post"/i.test(m[0]) ? 'post' : 'get') : 'get'
    out.push({ tag, method, path: raw, at: m.index })
  }
  return out
}

function check(files, inject = '') {
  const routes = registered()
  const problems = []
  let seen = 0
  for (const file of files) {
    let html = readFileSync(file, 'utf8')
    if (inject !== '') html += inject
    for (const t of targets(html)) {
      seen += 1
      const hit = routes.some((r) => (r.method === '*' || r.method === t.method) && r.pattern.test(t.path))
      if (!hit) problems.push(`${file}: <${t.tag}> ${t.method.toUpperCase()} ${t.path}`)
    }
  }
  return { problems, seen, routes: routes.length }
}

const args = process.argv.slice(2)
const selfTest = args.includes('--self-test')
const files = args.filter((a) => !a.startsWith('--'))
if (files.length === 0) {
  console.error('audit_links: لا عيّنات — مرّر ملفّات HTML مرسومة')
  process.exit(2)
}

if (selfTest) {
  const planted = check([files[0]], '<form method="post" action="/panel/ghost"></form><a href="/panel/nowhere">x</a>')
  if (planted.problems.length !== 2) {
    console.error(`audit_links --self-test: العيبُ المزروع لم يُمسَك (${planted.problems.length} بدل 2)`)
    process.exit(1)
  }
  console.log('audit_links --self-test: العيبُ المزروع أُمسك ✓')
}

const result = check(files)
for (const p of result.problems) console.log(`  ✗ ${p}`)
console.log(
  `links: ${result.seen} هدفًا في ${files.length} عيّنة مقابل ${result.routes} مسارًا مسجَّلًا · ` +
    (result.problems.length === 0 ? 'لا رابطَ يتيم' : `${result.problems.length} يتيم`),
)
process.exit(result.problems.length === 0 ? 0 : 1)
