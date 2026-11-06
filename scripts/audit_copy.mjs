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
 * - `<script>` و`<style>` والوسوم، وقيم السمات **إلّا ما يُعرَض منها** (D-323): `data-tip` تلميحٌ يُقرأ،
 *   و`title` و`aria-label` يقرؤهما قارئُ الشاشة، و`placeholder` نصُّ الحقل الفارغ — وكانت تُستثنى كلُّها
 *   فمرّت مفاتيحُ المطوّر (`settings.write`) والمعرّفُ الخامُ للمنصّة (`linkedin`) إلى وجه المالك بلا فحص.
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
 * والتشكيلُ يُقاس ويُسقط فوق ‏6 لكلّ 100 حرف (D-241، والخطّةُ §11.4 قالت 3): حُذفت علامةُ
 * الإعراب في آخر الكلمة من نصوص اللوحة، وبقيت الشدّةُ وما يُقرأ به المبنيُّ للمجهول («يُنشر»).
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
  { id: 'dev-cmd', re: /\bwrangler\b|chat\/completions/g, say: 'لغةُ المالك، والأمرُ تحت «للمطوّر» (EASE-PLAN أ-2)', except: LEGAL },
  { id: 'task-id', re: /\bM-\d\d\b/g, say: 'يُحذف من الواجهة، والمهمّةُ بعنوانها', except: [...TASKS, ...SETUP] },
  { id: 'backtick', re: /`/g, say: '<code> مرسومة لا علامةٌ خلفيّة حرفيّة' },
  ...glossaryRules(),
]

/**
 * ‏**المعجمُ الواحد** (D-304): الجدولُ الأوّل في `docs/GLOSSARY.md` هو مصدرُ قواعد المرادفات، لا قائمةٌ هنا تُكرّره.
 * ‏الصفُّ: `| المفهوم | **الكلمة** | ممنوع1 · ممنوع2 | لماذا |`؛ وما بين `/…/` في «ممنوع» تعبيرٌ نمطيّ، وما سواه حرفيّ.
 * ‏والاستثناءُ الوحيد صفحتا الخصوصيّة والشروط: نصٌّ قانونيّ يسمّي الأشياءَ بأسمائها عمدًا.
 */
export function glossaryRules() {
  const doc = readFileSync(new URL('../docs/GLOSSARY.md', import.meta.url), 'utf8')
  const first = doc.split('## ٢')[0]
  const out = []
  for (const line of first.split('\n')) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*[^|]*\|\s*$/.exec(line)
    if (m === null || m[1] === 'المفهوم' || /^-+$/.test(m[1])) continue
    const word = m[2].replace(/\*\*/g, '').trim()
    const banned = m[3].split(' · ').map((b) => b.trim()).filter((b) => b !== '')
    const parts = banned.map((b) => (b.startsWith('/') && b.endsWith('/')
      ? b.slice(1, -1)
      : b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    if (parts.length === 0) continue
    out.push({ id: `glossary:${m[1].trim()}`, re: new RegExp(parts.join('|'), 'g'), say: word, except: LEGAL })
  }
  if (out.length < 5) throw new Error('المعجمُ لم يُقرأ: أقلّ من خمسة صفوف — تغيّر شكلُ الجدول')
  return out
}

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

/** ‏السماتُ التي تُعرَض للناس (D-323): التلميح، والعنوان، واسمُ قارئ الشاشة، ونصُّ الحقل الفارغ. */
export const SHOWN_ATTRS = ['data-tip', 'title', 'aria-label', 'placeholder']

/** ‏قيمُ السمات المعروضة في وسمٍ — كلُّ قيمةٍ جملةٌ وحدَها. */
export function attributeText(html) {
  const out = []
  const re = new RegExp(`\\s(?:${SHOWN_ATTRS.join('|')})="([^"]*)"`, 'g')
  for (const tag of html.matchAll(/<[a-zA-Z][^>]*>/g)) for (const a of tag[0].matchAll(re)) out.push(a[1])
  return out.join(' · ')
}

/**
 * ‏**ومفتاحُ الشيفرة في تلميحٍ أو اسم** (D-323): قيمةٌ كلُّها مفتاحٌ بحروفٍ لاتينيّةٍ صغيرة («linkedin»، «settings.write»)
 * ‏أو JSON — لا جملةَ فيها للمالك. و`title` و`placeholder` خارجها: اسمُ النموذج والعنوانُ مثالٌ يُكتب كما هو في الحقل.
 */
export function rawAttributes(html) {
  const out = []
  for (const tag of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
    for (const a of tag[0].matchAll(/\s(data-tip|aria-label)="([^"]*)"/g)) {
      const v = a[2].replace(/&quot;/g, '"').trim()
      if (/^[a-z][a-z0-9_]*(?:[.:][a-z0-9_]+)*$/.test(v) || /^[[{]/.test(v)) out.push(`${a[1]}="${v.slice(0, 40)}"`)
    }
  }
  return out
}

/** النصُّ الذي يراه المالك — ومعه نصُّ السمات التي تُعرَض. */
export function visible(html) {
  let t = html
    .replace(/<script\b[\s\S]*?<\/script>/g, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/g, ' ')
    .replace(/<code\b[\s\S]*?<\/code>/g, ' ')
  t = dropBalanced(t, /<details\b[^>]*>\s*<summary\b[^>]*>[^<]*(?:للمطوّر|التفاصيل)/, 'details')
  t = dropBalanced(t, /<span\b[^>]*\bdata-copy-ok\b[^>]*>/, 'span')
  // ‏والسماتُ تُقرأ قبل نزع «mono»: الاسمُ التقنيُّ في المتن مسموح، وتلميحُه جملةٌ للمالك
  const shown = attributeText(t)
  t = dropBalanced(t, /<span\b[^>]*\bclass="[^"]*\bmono\b[^"]*"[^>]*>/, 'span')
  t = dropBalanced(t, /<bdi\b[^>]*\bclass="[^"]*\bmono\b[^"]*"[^>]*>/, 'bdi')
  return `${t.replace(/<[^>]+>/g, ' ')} ${shown}`
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
  const bare = html.replace(/<(script|style|template|code)\b[\s\S]*?<\/\1>/g, ' ')
  for (const r of rawAttributes(bare)) problems.push(`${name} · raw-attr: ${r} ← جملةٌ للمالك أو اسمٌ معروض، لا مفتاحُ الشيفرة (D-323)`)
  for (const rule of RULES) {
    if (rule.except?.includes(name)) continue
    for (const m of text.matchAll(rule.re)) {
      const i = m.index ?? 0
      problems.push(`${name} · ${rule.id}: «…${text.slice(Math.max(0, i - 30), i + m[0].length + 30).trim()}…» ← ${rule.say}`)
    }
  }
  return { problems, tashkeel: tashkeel(text) }
}

/** ‏سقفُ التشكيل لكلّ مئة حرف (D-241): ‏9.2 كان، والخطّةُ قالت 3، والمالكُ قال «اكمل» على اقتراح 6. */
const MAX_TASHKEEL = 6

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length === 0) {
  console.error('audit_copy: لا عيّنات — مرّر ملفّات HTML مرسومة')
  process.exit(2)
}

if (args.includes('--self-test')) {
  const name = basename(files[0])
  const base = readFileSync(files[0], 'utf8')
  const planted = check(name, base.replace('</body>', '<p>بقي 30 يوما على الربط، والمنشورُ في الطابور، وانظر «القنوات»</p></body>'))
  // ‏والحقيقةُ المكرّرة على صفحةٍ بلا ألواح، فيُعَدّ ما زُرع وحدَه لا مرّةً لكلّ لوح
  const facts = repeatedFacts('<body><p data-fact="zz:broken">أ</p><section data-pane="a"><p data-fact="zz:broken">ب</p></section><section data-pane="b"></section></body>')
  const hidden = check(name, base.replace('</body>', '<details><summary>للمطوّر</summary><p>30 يوما · الطابور</p></details></body>'))
  const clean = check(name, base)
  // ‏والسماتُ المعروضة تُقرأ (D-323): كلمةٌ من المعجم في تلميح، ورقمٌ هنديّ في اسم قارئ الشاشة
  const attrs = check(name, base.replace('</body>', '<span data-tip="انظر «القنوات»" aria-label="٣ منشورات">x</span><span data-tip="settings.write">y</span></body>'))
  const inAttrs = attrs.problems.length - clean.problems.length
  const caught = planted.problems.length - clean.problems.length
  const fromGlossary = planted.problems.some((p) => p.includes('glossary:'))
  if (caught !== 3 || !fromGlossary || inAttrs !== 3 || facts.length !== 1 || hidden.problems.length !== clean.problems.length) {
    console.error(`audit_copy --self-test: العيبُ المزروع أُمسك ${caught} من 3، وفي السمات ${inAttrs} من 3، والحقيقةُ المكرّرة ${facts.length} من 1، و«للمطوّر» ${hidden.problems.length === clean.problems.length ? 'مستثناة' : 'لم تُستثنَ'}`)
    process.exit(1)
  }
  console.log('audit_copy --self-test: العيوبُ الثلاثة المزروعة (ومنها كلمةٌ من المعجم) وعيوبُ السمات المعروضة الثلاثة والحقيقةُ المكرّرةُ في لوحها أُمسكت، وما تحت «للمطوّر» مستثنى ✓')
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
    ` · التشكيلُ ${mean.toFixed(1)} لكلّ 100 حرف (السقفُ ${MAX_TASHKEEL}، D-241)`,
)
if (mean > MAX_TASHKEEL) console.log(`  ✗ التشكيلُ ${mean.toFixed(1)} فوق السقف ${MAX_TASHKEEL}: علامةُ الإعراب في آخر الكلمة تُحذف، والشدّةُ وما يميّز المبنيَّ للمجهول يبقيان`)
process.exit(problems.length === 0 && mean <= MAX_TASHKEEL ? 0 : 1)
