/** المصدرُ الواحد (D-340): حالُ المنشور واسمُ المنصّة لا يُعرَّفان في موضعٍ ثانٍ. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POST_STATUS, postStatus } from './status'

const ROOT = join(__dirname, '..')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const at = join(dir, name)
    return statSync(at).isDirectory() ? files(at) : /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [at] : []
  })
}

describe('حالُ المنشور مصدرٌ واحد (D-340)', () => {
  it('سبعُ حالاتٍ لكلٍّ نصٌّ ونغمةٌ وعلامة، وما لا يُعرَف محايدٌ باسمه', () => {
    expect(Object.keys(POST_STATUS).sort()).toEqual(['approved', 'draft', 'edited', 'failed', 'published', 'queued', 'rejected'])
    for (const f of Object.values(POST_STATUS)) { expect(f.label.length).toBeGreaterThan(3); expect(f.glyph.length).toBe(1) }
    expect(postStatus('queued')).toEqual({ label: 'مجدولة', tone: 'ok', glyph: '◔' })
    expect(postStatus('archived')).toEqual({ label: 'archived', tone: 'idle', glyph: '○' })
  })

  it('لا خريطةَ حالٍ ثانيةً في الشيفرة: كائنٌ فيه `queued:` و`published:` نصَّين لا يُكتب إلّا هنا', () => {
    // ‏المستثنى بسببه: ترميزُ الرسم (gantt)، وحالُ منشور المقطع بصيغة المذكّر (videos)، وأخبارُ ما وقع (store · import)
    const allowed = new Set(['lib/status.ts', 'lib/gantt.ts', 'routes/ui/sections/videos.ts', 'lib/draft/store.ts', 'lib/plan/import.ts'])
    const copies = files(ROOT)
      .filter((f) => /queued:\s*(\{[^}]*)?['"`]/.test(readFileSync(f, 'utf8')) && /published:\s*(\{[^}]*)?['"`]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1))
      .filter((f) => !allowed.has(f))
    expect(copies).toEqual([])
  })

  it('واسمُ المنصّة من `PLATFORM_LABEL` وحدَه: لا خريطةَ تكتب «LinkedIn» و«TikTok» معًا في موضعٍ آخر', () => {
    const copies = files(ROOT)
      .filter((f) => /linkedin:\s*'LinkedIn'/.test(readFileSync(f, 'utf8')) && /tiktok:\s*'TikTok'/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1))
    expect(copies).toEqual(['lib/oauth/providers.ts'])
  })
})
