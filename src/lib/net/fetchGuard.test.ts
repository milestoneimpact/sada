/**
 * ‏**حارسُ المهلة: لا `fetch` عالميٌّ إلّا داخل `withTimeout(…)`** (D-320).
 *
 * ‏كانت خارطةُ الطريق تقول «مهلةٌ على كلّ `fetch`» (D-269)، والتجديدُ (`renew.ts`) والقياسُ (`metrics/job.ts`) يناديان
 * ‏`fetch` عاريًا، ومسحُ Drive (`drive/job.ts`) يمرّر `deps.fetchImpl ?? fetch` فيُسقط مهلةَ ‏30 ثانية التي في `client.ts` نفسِه.
 * ‏فنداءٌ يعلق عند مزوّد OAuth كان يعلق حتّى يقتل Cloudflare الدورةَ — **والإرسالُ بعده في الدورة نفسِها**.
 *
 * ‏والقاعدةُ هنا بنيويّة لا بالعدّ: **اسمُ `fetch` العالميّ لا يظهر في شيفرة الخادم إلّا في المعامل الأوّل لـ`withTimeout`**
 * ‏(أو في `net/timeout.ts` نفسِه). فكلُّ `fetchImpl` يصل سائقًا إمّا مغلَّفٌ بمهلة، وإمّا حقنه اختبار. ويُقرأ بشجرة TypeScript
 * ‏لا بنمطٍ نصّيّ: `fetch(` داخل سلسلة شيفرة المتصفّح (`panelScript.ts`) ليس معرِّفًا، و`x.fetch` و`typeof fetch` ليسا نداءً.
 * ‏ومعه: كلُّ `new Anthropic({…})` يحمل `timeout` — العُدّةُ تنادي `fetch` من تحت، وافتراضُها عشرُ دقائق.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SRC = new URL('../../', import.meta.url).pathname
/** ‏الموضعُ الوحيدُ الذي يلمس `fetch` بلا غلاف: الغلافُ نفسُه. */
const HOME = 'lib/net/timeout.ts'
const GLOBALS = new Set(['globalThis', 'self', 'window'])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'test') out.push(...walk(path))
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

/** ‏أهذه العقدةُ داخلَ المعامل الأوّل لنداء `withTimeout`؟ */
function insideTimeout(node: ts.Node): boolean {
  let child: ts.Node = node
  for (let parent = node.parent; parent !== undefined; child = parent, parent = parent.parent) {
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 'withTimeout') {
      return parent.arguments[0] === child
    }
  }
  return false
}

function inTypePosition(node: ts.Node): boolean {
  for (let p = node.parent; p !== undefined; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeOfExpression(p)) return true
    if (ts.isStatement(p) || ts.isSourceFile(p)) return false
  }
  return false
}

/** ‏أهو اسمُ تصريحٍ أو مفتاحُ خاصّيّةٍ لا إشارةٌ إلى `fetch` العالميّ؟ */
function isName(node: ts.Identifier): boolean {
  const p = node.parent
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === node) return true
  if ((ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p)) && p.name === node) return true
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isQualifiedName(p)) return true
  return false
}

export interface Finding { readonly file: string; readonly line: number; readonly text: string }

export function unguarded(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: Finding[] = []
  const report = (node: ts.Node, text: string) =>
    out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text })
  const visit = (node: ts.Node): void => {
    // ‏`fetch` معرِّفًا: إشارةٌ إلى العالميّ ما لم يكن اسمًا أو نوعًا
    if (ts.isIdentifier(node) && node.text === 'fetch' && !isName(node) && !inTypePosition(node) && !insideTimeout(node)) {
      report(node, node.parent.getText(sf).slice(0, 120))
    }
    // ‏و`globalThis.fetch` كذلك
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'fetch' && ts.isIdentifier(node.expression)
      && GLOBALS.has(node.expression.text) && !inTypePosition(node) && !insideTimeout(node)) {
      report(node, node.getText(sf).slice(0, 120))
    }
    // ‏وعُدّةُ Anthropic بلا `timeout` صريح: افتراضُها عشرُ دقائق
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Anthropic') {
      const arg = node.arguments?.[0]
      const timed = arg !== undefined && ts.isObjectLiteralExpression(arg)
        && arg.properties.some((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === 'timeout')
      if (!timed) report(node, 'new Anthropic({ … }) بلا timeout')
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

describe('حارسُ المهلة (D-320)', () => {
  it('يمسك ما يجب أن يُمسَك ويترك ما لا يُمسَك', () => {
    const caught = (code: string) => unguarded('x.ts', code).length
    // ‏ما يُمسَك
    expect(caught('const f = fetch')).toBe(1)
    expect(caught('await fetch("https://a")')).toBe(1)
    expect(caught('function g(fetchImpl: typeof fetch = fetch) {}')).toBe(1)
    expect(caught('const f = deps.fetchImpl ?? fetch')).toBe(1)
    expect(caught('run(url, fetch)')).toBe(1)
    expect(caught('const o = { fetch }')).toBe(1)
    expect(caught('await globalThis.fetch(u)')).toBe(1)
    expect(caught('new Anthropic({ apiKey: k })')).toBe(1)
    // ‏وما لا يُمسَك
    expect(caught('const f = withTimeout(fetch, 15_000)')).toBe(0)
    expect(caught('const f = withTimeout(deps.fetchImpl ?? fetch, 30_000)')).toBe(0)
    expect(caught('function g(fetchImpl: typeof fetch = withTimeout(fetch)) {}')).toBe(0)
    expect(caught('type F = typeof fetch')).toBe(0)
    expect(caught('export default { fetch: app.fetch }')).toBe(0)
    expect(caught('const s = `fetch(url).then(r => r.json())`')).toBe(0)
    expect(caught('const p = "fetch"')).toBe(0)
    expect(caught('new Anthropic({ apiKey: k, timeout: 120_000 })')).toBe(0)
    // ‏و`withTimeout` تحمي معاملها الأوّل وحده: الثاني ليس `fetch`
    expect(caught('withTimeout(other, fetch)')).toBe(1)
  })

  it('لا fetch عالميٌّ في شيفرة الخادم إلّا داخل withTimeout', () => {
    const found = walk(SRC)
      .filter((path) => relative(SRC, path) !== HOME)
      .flatMap((path) => unguarded(relative(SRC, path), readFileSync(path, 'utf8')))
    expect(found.map((f) => `${f.file}:${f.line} ${f.text}`)).toEqual([])
  })
})
