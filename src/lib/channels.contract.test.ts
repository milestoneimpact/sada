/**
 * **كلُّ منصّةٍ تنشر لها عقدٌ مكتوبٌ في `PLATFORMS.md`** (D-138).
 *
 * ## العلّة المقيسة
 *
 * `docs/PLATFORMS.md` هي سجلُّ العقود: ما قِيس حيّا، وما كُتب من وثيقةٍ
 * مقروءة، وما بقي مجهولا. **وبُني سائقُ Instagram (D-121) ولم يُذكَر
 * فيها حرفا** — صفرُ مرّات.
 *
 * فمن قرأ السجلَّ ظنّ أنّ ما ليس فيه لم يُبنَ، **ومن قرأ الشيفرة ظنّ أنّ
 * عقدَها مقيسٌ كغيره**. وكلاهما يبني على وهم.
 *
 * وهي علّةُ «قائمتان تفترقان» نفسُها التي أسقطت `KNOWN_TASKS` (D-091)
 * و`TASK_LABEL` وحارسَي القنوات — **تُزاد إحداهما وتُنسى الأخرى**.
 *
 * ## ولماذا حارسٌ لا مراجعة
 *
 * السجلُّ يُقرأ حين يُشَكّ في قيمة، **وذلك بعد أن تكون قد كذبت**. وحارسٌ
 * يسأل السؤالَ عند كلّ بناءٍ أرخصُ من قارئٍ ينتبه.
 *
 * **ولا يفحص هذا صحّةَ العقد** — لا يستطيع. يفحص أنّه **مكتوب**: أنّ
 * لكلّ منصّةٍ تنشر موضعا في السجلّ يُقرأ فيه ما لها وما عليها.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHANNELS } from './channels'

const DOC = readFileSync(new URL('../../docs/PLATFORMS.md', import.meta.url), 'utf8')

/** ما تُعرَف به المنصّةُ في السجلّ — الاسمُ المعروض، لا المعرّف. */
const NAMED: Readonly<Record<string, string>> = {
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
}

describe('سجلّ العقود يواكب ما بُني (D-138)', () => {
  const publishing = CHANNELS.filter((c) => c.stage === 'publish')

  it('كلّ منصّة تنشر مذكورة في `PLATFORMS.md`', () => {
    expect(publishing.length).toBeGreaterThan(0)
    for (const spec of publishing) {
      const name = NAMED[spec.id] ?? spec.label
      expect(DOC, `${spec.id} — سائق بُني ولا عقد له في السجلّ`).toContain(name)
    }
  })

  /**
   * **ولا يكفي ذكرُ الاسم عَرَضا**: منصّةٌ تُذكَر في قائمة المصادر وحدَها
   * لا عقدَ لها. فيُشترَط عنوانٌ يخصّها — سطرٌ يبدأ بـ`#` وفيه اسمُها.
   */
  it('ولكلّ عنوان يخصّها لا ذكر عابر', () => {
    const headings = DOC.split('\n').filter((line) => line.startsWith('#'))
    for (const spec of publishing) {
      const name = NAMED[spec.id] ?? spec.label
      expect(
        headings.some((h) => h.includes(name)),
        `${spec.id} — مذكور بلا عنوان يخصّه`,
      ).toBe(true)
    }
  })

  /**
   * **وما لم يُبنَ لا يُوعَد به في السجلّ.** عقدٌ مكتوبٌ لمنصّةٍ بلا سائق
   * يُقرأ قدرةً، فينتظرها المالكُ ولا تأتي — وهي D-056 نفسُها.
   */
  it('وما لم يُبن سائقُه لا عنوان له', () => {
    const headings = DOC.split('\n').filter((line) => line.startsWith('#'))
    for (const spec of CHANNELS.filter((c) => c.stage === 'none')) {
      const name = NAMED[spec.id] ?? spec.label
      expect(
        headings.some((h) => h.includes(name)),
        `${spec.id} — عقد لمنصّة لا سائق لها`,
      ).toBe(false)
    }
  })
})
