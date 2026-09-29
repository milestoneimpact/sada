/**
 * المعجمُ في الثوابت لا في المرسوم وحدَه (D-166).
 *
 * `measure_text` يقرأ ما ظهر في العيّنة، **وما لا يُرسَم فيها لا يُقرأ**: لوحةُ ⌘K
 * مخفيّة، وحالُ الصفر في البطاقة لا تقع في العيّنة، وسببُ المحاولة يُكتب في
 * القاعدة ثمّ يظهر في الرحلة. فأفلتت ستّةُ مواضع من D-155. وهنا يُمرّ على كلّ
 * نصٍّ مقتبسٍ في الشيفرة (بلا تعليقاتها، فالتعليقاتُ تناقش المعجمَ بألفاظه).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname)

/** الألفاظُ نفسُها التي يمنعها `measure_text` في المرسوم. */
const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\(D-\d{3}\)/, 'رقمُ قرارٍ'],
  [/رمز[ُِ]? ?الإدارة|الرمز الإداري/, '«رمز الإدارة»'],
  [/رمز[ُِ]? ?(الوصول|التجديد)|رمز[َِ] (وصول|تجديد)/, '«رمز الوصول/التجديد»'],
  [/رمز[ُِ]? ?المتصفّح|رمز Cloudflare/, '«رمز المتصفّح»'],
  [/مليون رمز/, '«مليون رمز»'],
  [/وجهة/, '«الوجهة»'],
  [/الرمز وحده|حالُ رموزها|الرموزُ مشفّرة|رمزٌ يُسرَّب/, '«الرمز» لكلمة الإدارة أو للإذن'],
]

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'test') out.push(...sources(path))
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(path)
    }
  }
  return out
}

/** النصوصُ المقتبسة بلا التعليقات — وما بين `${…}` في القوالب يبقى شيفرةً لا نصًّا. */
export function quoted(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const out: string[] = []
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    out.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' '))
  }
  return out
}

describe('المعجمُ في ثوابت الشيفرة', () => {
  it('لا لفظَ ممنوعًا في نصٍّ يصل إلى المالك', () => {
    const hits: string[] = []
    for (const file of sources(ROOT)) {
      for (const text of quoted(readFileSync(file, 'utf8'))) {
        for (const [pattern, why] of BANNED) {
          if (pattern.test(text)) hits.push(`${file.slice(ROOT.length + 1)} · ${why} · ${text.slice(0, 60)}`)
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('والحارسُ يمسك لفظًا مزروعًا، ولا يقرأ التعليق', () => {
    const planted = quoted("// الوجهة في تعليق\nconst a = 'لا وجهةَ حيّة'\n/* الرمز وحده */")
    const found = planted.filter((t) => BANNED.some(([p]) => p.test(t)))
    expect(found).toEqual(['لا وجهةَ حيّة'])
  })
})
