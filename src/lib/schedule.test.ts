/**
 * جداولُ الدورات — **تُعرَّف مرّتين، فتُقارَن.**
 *
 * الشيفرةُ تقول `controller.cron === METRICS_CRON`، و`wrangler.toml`
 * هو الذي يقرّر أيَّ نصٍّ يصل. **وحرفٌ يفترق بينهما يوقف الدورةَ
 * صامتا**: لا عطل، ولا سطرَ في السجلّ — دورةٌ لا تُنادى فقط.
 *
 * وقد حذّر D-037 من هذا بالضبط وبنى الإرسالَ ليقع في كلّ دورةٍ لأجله.
 * **والتحذيرُ وثيقةٌ حتّى يصير اختبارا.**
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const TOML = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')

/** كلُّ سطر `crons = [...]` في الملفّ — بيئةً بيئة. */
function cronBlocks(): string[][] {
  const blocks: string[][] = []
  for (const line of TOML.split('\n')) {
    const match = /^\s*crons\s*=\s*\[(.*)\]\s*$/.exec(line)
    if (match === null) continue
    blocks.push(
      match[1]!
        .split(',')
        .map((part) => part.trim().replace(/^["']|["']$/g, ''))
        .filter((part) => part.length > 0),
    )
  }
  return blocks
}

/** ما تعرفه الشيفرة — يُنسَخ هنا حرفا، ويُقارَن بالمصدرين. */
const KNOWN = {
  SCAN_CRON: '3 3 * * *',
  METRICS_CRON: '7 * * * *',
  REPORT_CRON: '14 4 * * 1',
  QUARTER_CRON: '*/15 * * * *',
} as const

const SOURCE = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')

describe('ما في الشيفرة هو ما في الشيفرة', () => {
  it('كلّ ثابت هنا مكتوب في `index.ts` بنصّه', () => {
    for (const [name, cron] of Object.entries(KNOWN)) {
      expect(SOURCE, `${name} تبدّل في index.ts ولم يتبدّل هنا`)
        .toContain(`const ${name} = '${cron}'`)
    }
  })

  /** ثابتٌ جديدٌ يُضاف هناك ولا يُضاف هنا يفلت من المقارنة كلِّها. */
  it('ولا ثابت جدول في `index.ts` غائب عن هذه القائمة', () => {
    const declared = [...SOURCE.matchAll(/const ([A-Z_]*CRON) = '([^']+)'/g)].map((m) => m[1]!)
    expect(declared.sort()).toEqual(Object.keys(KNOWN).sort())
  })
})

describe('وما في الشيفرة هو ما في `wrangler.toml`', () => {
  const blocks = cronBlocks()

  it('البيئتان معرَّفتان — وإلّا فالمقارنة تمرّ على لا شيء', () => {
    expect(blocks.length).toBe(2)
  })

  it('وكلّ جدول تعرفه الشيفرة مسجَّل في كلّ بيئة', () => {
    for (const block of blocks) {
      for (const [name, cron] of Object.entries(KNOWN)) {
        expect(block, `${name} غائب عن إحدى البيئتين — الدورة لن تُنادى`)
          .toContain(cron)
      }
    }
  })

  /**
   * **والعكسُ يلزم كذلك.** جدولٌ في `wrangler.toml` لا تعرفه الشيفرةُ
   * يوقظ Worker ويجعله يدفع الطابورَ بلا سبب — ثمنُه صغير، **ودلالتُه
   * أنّ أحدَ الطرفين تبدّل وحده**.
   */
  it('ولا جدول في الملفّ لا تعرفه الشيفرة', () => {
    const known = Object.values(KNOWN) as string[]
    // الإرسالُ يقع في كلّ دورة، وجدولُه ربعُ ساعةٍ لا يُقارَن باسم (D-037)
    const dispatch = '*/15 * * * *'
    for (const block of blocks) {
      for (const cron of block) {
        if (cron === dispatch) continue
        expect(known, `جدول ${cron} في wrangler.toml لا تعرفه الشيفرة`).toContain(cron)
      }
    }
  })

  it('والبيئتان متطابقتان — staging تجرّب ما ينشر في الإنتاج', () => {
    expect([...blocks[0]!].sort()).toEqual([...blocks[1]!].sort())
  })
})
