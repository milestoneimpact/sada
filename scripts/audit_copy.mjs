/**
 * مدقّقُ النصّ: **كلمةُ المطوّر في وجه المالك** (خطّة التصميم §8.2، المرحلة ٣، D-213).
 *
 * ## لماذا
 *
 * المدقّقاتُ الأخرى تقيس الشكلَ: اللونَ والسلّمَ والجوّالَ والروابط. **ولا شيءَ
 * يقرأ الكلام.** فبقيت في اللوحة «30 يوما» و«في الطابور» و«ساقطة» و«المزوّدون»
 * و«التقريرُ الأسبوعيّ» بعد أن صار اسمُه «النتائج»، وكلٌّ منها أُصلح مرّةً في
 * موضعٍ وعاد في غيره. والقاعدةُ المكتوبةُ في الخطّة لا تحرس نفسَها.
 *
 * ## ما يُقرأ
 *
 * النصُّ المرئيُّ من عيّنات `/tmp/*.html` المرسومة (`npm run render`)، بلا:
 *
 * - `<script>` و`<style>` والوسوم وقيم السمات (لا يراها المالك).
 * - `<code>` وما صنفُه `mono`: **الاسمُ التقنيُّ مرسومًا اسمًا تقنيًّا** مسموح (§8.2).
 * - `<details>` عنوانُها «للمطوّر» أو «التفاصيل»: هناك يُقال UTC والمعرّفُ كما هو.
 * - `<span data-copy-ok>`: استثناءٌ مقصودٌ بسببٍ مكتوبٍ في الشيفرة بجانبه.
 *
 * ## القواعد
 *
 * لكلّ قاعدةٍ نمطٌ، وبديلُه في وجه المالك، **والعيّناتُ المستثناةُ بسببها**:
 * صفحةُ الخصوصيّة نصٌّ قانونيٌّ يسمّي البنيةَ بأسمائها عمدًا، وأدلّةُ الإعداد
 * تقتبس أسماءَ شاشات المنصّات وأخطاءها كما تظهر هناك، وصفحةُ المهامّ تُنادي
 * المهمّةَ برقمها لأنّه ما يكتبه المالكُ حين يسأل عنها.
 *
 * والتشكيلُ يُقاس ويُطبع ولا يُسقط (الهدفُ 3 لكلّ 100 حرف، §11.4): خفضُه
 * مراجعةٌ لكلّ نصٍّ في اللوحة، وتُفتح وحدَها لا في طيّ هذا الحارس.
 *
 * ## والحقيقةُ مرّةً في الصفحة (§10.2 · D-235)
 *
 * كلُّ عنصرٍ يقول حالَ منصّةٍ يحمل `data-fact="<المنصّة>:<الحال>"` (`x:broken`)،
 * **وتتكرّر القيمةُ في الصفحة الواحدة فيسقط الفحص**: «X منقطعة» في الشريط
 * وفي البلاطة وفي البطاقة ثلاثُ جملٍ عن شيءٍ واحد، يقرؤها المالكُ ثلاثَ مشكلات.
 * و«الصفحةُ» في اللوحة كلُّ `data-pane` وحدَه، وما خارجَ الألواح (الشريطُ) يُعَدّ
 * في كلّ لوح.
 *
 * ## والحارسُ يُجرَّب على عيبٍ مزروع
 *
 * `--self-test` يحقن في عيّنةٍ نصًّا فيه قاعدتان مكسورتان ويتحقّق أنّ الفحص
 * يسقط على كلٍّ منهما، **ويحقن الكلامَ نفسَه داخل «للمطوّر» فلا يسقط**.
 *
 * الاستعمال:  node scripts/audit_copy.mjs /tmp/panel.html …  [--self-test]
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** العيّناتُ التي تسمّي الأشياءَ بأسمائها التقنيّة عمدًا — وسببُ كلٍّ. */
const LEGAL = ['privacy.html'] // ‏نصٌّ قانونيّ: ما يُخزَّن وأين، بأسمائه
const SETUP = ['screen-wizard.html', 'screen-li-setup.html', 'screen-refused.html', 'screen-connected.html'] // ‏أسماءُ شاشات المنصّة كما هي (HANDOVER §6)
const TASKS = ['screen-tasks.html'] // ‏المهمّةُ برقمها: هو ما يُسأل به عنها

/**
 * @type {readonly { id: string; re: RegExp; say: string; except?: readonly string[] }[]}
 */
export const RULES = [
  { id: 'count', re: /\d+\s*(?:يوما|منشورا|نطاقا|مصدرا|حسابا|طلبا|صفا)(?![ً-ْء-ي])/g, say: 'counted() من src/lib/format.ts: «30 يومًا» و«3 منشورات»' },
  { id: 'since-ago', re: /منذ\s+قبل/g, say: 'relativeTime() تقول «قبل …» وحدَها' },
  { id: 'utc', re: /\bUTC\b/g, say: '«بتوقيتك»، وUTC في تأكيد الجدولة و«التفاصيل» وحدهما', except: [...LEGAL, ...SETUP] },
  { id: 'operator-id', re: /panel:(?:token|passkey)/g, say: '«أنت» أو «أنت بمفتاح المرور»' },
  { id: 'infra', re: /الطابور|\bQueue\b|\bcron\b|\bD1\b|\bR2\b|idempotency/g, say: '«مجدولة» و«قيد النشر» و«المهامّ الدوريّة»', except: LEGAL },
  { id: 'scopes', re: /\bopenid\b|w_member_social|\bscopes?\b/g, say: '«الصلاحيات»، والأسماءُ تحت «للمطوّر»', except: [...LEGAL, ...SETUP] },
  { id: 'secret-name', re: /\b[A-Z][A-Z0-9]*_(?:SECRET|TOKEN|KEY)\b|client_credentials|invalid_client/g, say: '«المفتاحُ السرّيّ للتطبيق»، والاسمُ في `<code>`', except: [...LEGAL, ...SETUP] },
  { id: 'task-id', re: /\bM-\d\d\b/g, say: 'يُحذف من الواجهة، والمهمّةُ بعنوانها', except: [...TASKS, ...SETUP] },
  { id: 'failed', re: /ساقطة/g, say: '«فشلت»' },
  { id: 'gone', re: /غادرت?\s+إلى/g, say: '«قيد النشر» أو «نُشرت» أو «فشلت» بحسب الحال' },
  { id: 'providers', re: /المزوّدون|«المزوّدين»|المزوّدين»/g, say: '«خدماتُ الكتابة والصور»' },
  { id: 'audit-log', re: /سجلّ التدقيق/g, say: '«سجلّ النشاط»', except: LEGAL },
  { id: 'report', re: /التقرير(?:ُ)?\s*الأسبوعيّ|«التقرير»/g, say: '«النتائج»' },
  { id: 'channels', re: /«القنوات»|«المنصّات»/g, say: '«الحسابات»' },
  { id: 'spread', re: /وزّع المعتمَد|وزّع المعتمد/g, say: '«جدوِل الجاهزة على الأسبوع»' },
  { id: 'backtick', re: /`/g, say: '<code> مرسومة لا علامةٌ خلفيّة حرفيّة' },
]

/** ‏يُحذف عنصرٌ متوازن الوسم من موضعه، مع ما تداخل فيه من الوسم نفسه. */
function dropBalanced(html, open, tag) {
  let out = html
  for (;;) {
    const m = open.exec(out)
    if (m === null) return out
    let depth = 0
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
    re.lastIndex = m.index
    let end = -1
    for (let t; (t = re.exec(out)) !== null;) {
      depth += t[1] === '' ? 1 : -1
      if (depth === 0) { end = re.lastIndex; break }
    }
    if (end < 0) return out
    out = out.slice(0, m.index) + ' ' + out.slice(end)
  }
}

/** النصُّ الذي يراه المالك. */
export function visible(html) {
  let t = html
    .replace(/<script\b[\s\S]*?<\/script>/g, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/g, ' ')
    .replace(/<code\b[\s\S]*?<\/code>/g, ' ')
  t = dropBalanced(t, /<details\b[^>]*>\s*<summary\b[^>]*>[^<]*(?:للمطوّر|التفاصيل)/, 'details')
  t = dropBalanced(t, /<span\b[^>]*\bdata-copy-ok\b[^>]*>/, 'span')
  t = dropBalanced(t, /<span\b[^>]*\bclass="[^"]*\bmono\b[^"]*"[^>]*>/, 'span')
  t = dropBalanced(t, /<bdi\b[^>]*\bclass="[^"]*\bmono\b[^"]*"[^>]*>/, 'bdi')
  return t
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[‎‏]/g, '')
    .replace(/\s+/g, ' ')
}

/** ‏التشكيلُ لكلّ مئة حرفٍ عربيّ — يُطبع ولا يُسقط. */
export function tashkeel(text) {
  const marks = (text.match(/[ً-ْ]/g) ?? []).length
  const letters = (text.match(/[ء-ي]/g) ?? []).length
  return letters === 0 ? 0 : (100 * marks) / letters
}

/** ‏مدى كلّ لوحٍ في اللوحة: `[اسمُه، بدايتُه، نهايتُه]`. */
function panes(html) {
  const out = []
  for (const m of html.matchAll(/<section\b[^>]*\bdata-pane="([a-z]+)"[^>]*>/g)) {
    const re = /<(\/?)section\b[^>]*>/g
    re.lastIndex = m.index
    let depth = 0
    for (let t; (t = re.exec(html)) !== null;) {
      depth += t[1] === '' ? 1 : -1
      if (depth === 0) { out.push([m[1], m.index, re.lastIndex]); break }
    }
  }
  return out
}

/** ‏كلُّ حقيقةٍ تكرّرت في صفحةٍ واحدة (أو لوحٍ واحد). */
export function repeatedFacts(html) {
  const bare = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, (m) => ' '.repeat(m.length))
  const ranges = panes(bare)
  const scopes = new Map(ranges.length === 0 ? [['', []]] : ranges.map(([n]) => [n, []]))
  for (const m of bare.matchAll(/\bdata-fact="([^"]+)"/g)) {
    const own = ranges.find(([, a, b]) => m.index > a && m.index < b)
    for (const [n, list] of scopes) if (own === undefined || own[0] === n) list.push(m[1])
  }
  const out = []
  for (const [n, list] of scopes) {
    for (const f of new Set(list)) {
      const k = list.filter((x) => x === f).length
      if (k > 1) out.push(`${f} ×${k}${n === '' ? '' : ` في «${n}»`}`)
    }
  }
  return out
}

export function check(name, html) {
  const text = visible(html)
  const problems = repeatedFacts(html).map((f) => `${name} · fact: ${f} ← الحالُ مرّةً في الصفحة، وما سواه يحيل إليه`)
  for (const rule of RULES) {
    if (rule.except?.includes(name)) continue
    for (const m of text.matchAll(rule.re)) {
      const i = m.index ?? 0
      problems.push(`${name} · ${rule.id}: «…${text.slice(Math.max(0, i - 30), i + m[0].length + 30).trim()}…» ← ${rule.say}`)
    }
  }
  return { problems, tashkeel: tashkeel(text) }
}

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length === 0) {
  console.error('audit_copy: لا عيّنات — مرّر ملفّات HTML مرسومة')
  process.exit(2)
}

if (args.includes('--self-test')) {
  const name = basename(files[0])
  const base = readFileSync(files[0], 'utf8')
  const planted = check(name, base.replace('</body>', '<p>بقي 30 يوما على الربط، والمنشورُ في الطابور</p></body>'))
  // ‏والحقيقةُ المكرّرة على صفحةٍ بلا ألواح، فيُعَدّ ما زُرع وحدَه لا مرّةً لكلّ لوح
  const facts = repeatedFacts('<body><p data-fact="zz:broken">أ</p><section data-pane="a"><p data-fact="zz:broken">ب</p></section><section data-pane="b"></section></body>')
  const hidden = check(name, base.replace('</body>', '<details><summary>للمطوّر</summary><p>30 يوما · الطابور</p></details></body>'))
  const clean = check(name, base)
  const caught = planted.problems.length - clean.problems.length
  if (caught !== 2 || facts.length !== 1 || hidden.problems.length !== clean.problems.length) {
    console.error(`audit_copy --self-test: العيبُ المزروع أُمسك ${caught} من 2، والحقيقةُ المكرّرة ${facts.length} من 1، و«للمطوّر» ${hidden.problems.length === clean.problems.length ? 'مستثناة' : 'لم تُستثنَ'}`)
    process.exit(1)
  }
  console.log('audit_copy --self-test: العيبان المزروعان والحقيقةُ المكرّرةُ في لوحها أُمسكت، وما تحت «للمطوّر» مستثنى ✓')
}

const problems = []
const marks = []
for (const file of files) {
  const r = check(basename(file), readFileSync(file, 'utf8'))
  problems.push(...r.problems)
  marks.push(r.tashkeel)
}
for (const p of problems) console.log(`  ✗ ${p}`)
const mean = marks.reduce((a, b) => a + b, 0) / marks.length
console.log(
  `copy: ${RULES.length} قاعدةً على ${files.length} عيّنة · ` +
    (problems.length === 0 ? 'لا كلمةَ مطوّرٍ في وجه المالك' : `${problems.length} مخالفة`) +
    ` · التشكيلُ ${mean.toFixed(1)} لكلّ 100 حرف (الهدفُ 3، يُقاس ولا يُسقط)`,
)
process.exit(problems.length === 0 ? 0 : 1)
