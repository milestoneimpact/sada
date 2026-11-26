/** ‏التيّار ومحرّرُ المنشور (D-417): اعتمادٌ بلا ضياع، وتحريرٌ غيرُ أعمى. */
import { afterEach, describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { newItems } from './newMenu'
import { feedScreen } from './feedView'
import { postEditScreen, type PostEditModel } from './postEditView'
import { planImportScreen } from './planImportView'
import { COUNT_SCRIPT } from './scripts'
import type { FeedCard, FeedModel } from '../../lib/feed'

const A = '0a1b2c3d-0001-4000-8000-000000000001'
const B = '0a1b2c3d-0002-4000-8000-000000000002'

function draft(id: string, at: string | null): FeedCard {
  return { id, kind: 'post', platform: 'linkedin', status: 'draft', text: 'نصّ', at, local: null, planId: null, media: null, metrics: null,
    warning: null, edited: false, correction: null } as unknown as FeedCard
}

function model(cards: FeedCard[]): FeedModel {
  return { upcoming: cards, past: [], counts: { published: 0, queued: 0, awaiting: cards.length, writing: 0 }, plan: null,
    awaitingIds: cards.map((c) => c.id), window: { from: '2026-10-01', to: '2026-11-26', older: null } } as unknown as FeedModel
}

const NOW = new Date('2026-11-26T08:00:00Z')

describe('التيّار: اعتمادٌ بلا ضياع', () => {
  it('«next» البطاقةُ التالية بترتيب awaitingIds، والأخيرةُ تعود إلى نفسها', () => {
    const html = feedScreen({ model: model([draft(A, '2026-11-29 06:00:00'), draft(B, null)]), zone: 'Asia/Riyadh', now: NOW, role: 'owner' })
    const a = html.slice(html.indexOf('id="f-' + A + '"'), html.indexOf('id="f-' + B + '"'))
    const b = html.slice(html.indexOf('id="f-' + B + '"'))
    expect(a).toContain('name="next" value="' + B + '"')
    expect(b).toContain('name="next" value="' + B + '"')
    expect(a).toContain('اعتمد وجدوِل')
    expect(a).toMatch(/title="يُنشر [^"]+ · [^"]+"/)
    expect(a).toContain('data-busy="يُعتمَد…"')
    expect(b).not.toContain('title="يُنشر')
  })

  it('«خطّة من ملفّ» خرج من «منشور جديد ▾» إلى قائمة الخطّة في رأس التيّار', () => {
    expect(newItems().join('')).not.toContain('خطّة من ملفّ')
    const html = feedScreen({ model: model([]), zone: null, now: NOW, role: 'owner' })
    expect(html).toContain('href="/panel/plan/new"')
    expect(html).toContain('عندي خطّة')
    expect(feedScreen({ model: model([]), zone: null, now: NOW, role: 'viewer' })).not.toContain('عندي خطّة')
  })

  it('إلغاءُ الاستيراد إلى الخطّة، وإعادةُ المحاولة على مسار الاستيراد', () => {
    const html = planImportScreen('p1', { rows: [], fileProblems: [] }, NOW)
    expect(html).toContain('href="/panel/plan">إلغاء')
    expect(planImportScreen('p1', { rows: [], fileProblems: ['تالف'] }, NOW)).toContain('href="/panel#plan-import"')
  })
})

const EDIT: PostEditModel = {
  id: A, platform: 'x', text: 'مرحبا', scheduledAt: '2026-11-29 06:00:00', rev: 2, edited: true, stage: 'scheduled', role: 'owner',
  history: [
    { id: 'e2', rev: 2, actor: 'owner', at: '2026-11-25 09:00:00', before: { text: 'النصّ الثاني كاملًا' }, after: null, reason: null },
    { id: 'e1', rev: 1, actor: 'owner', at: '2026-11-24 09:00:00', before: { text: 'الأوّل' }, after: null, reason: null },
  ] as never,
}

describe('محرّرُ المنشور: تحريرٌ غيرُ أعمى', () => {
  it('عدّادٌ بحدّ المنصّة، وتواريخُ مقروءة، و«الحالية» على الأحدث', () => {
    const html = postEditScreen(EDIT, 'Asia/Riyadh')
    expect(html).toContain('dir="auto"')
    expect(html).toContain('data-limit="280"')
    expect(html).toContain('data-count="x"')
    expect(html).toContain('class="draft-len"')
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    expect(html).toContain('<bdi>')
    expect(html.match(/الحالية/g)).toHaveLength(1)
    expect(html).toContain('<details><summary>النصّ السابق</summary>')
    expect(html).toContain('النصّ الثاني كاملًا')
    expect(html).toContain('data-confirm="يتوقّف نشرُه حتى تستأنفه. أتابع؟"')
    expect(html.match(/data-busy=/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).toContain('href="/panel/feed#f-' + A + '"')
    expect(html).toContain('عُد إلى التيّار')
  })
})

const open: InstanceType<typeof Window>[] = []
afterEach(async () => { for (const w of open.splice(0)) await w.happyDOM.close() })

describe('COUNT_SCRIPT في الصفحة المستقلّة', () => {
  it('يعدّ مع الكتابة ويُنذر فوق الحدّ', () => {
    const w = new Window(); open.push(w)
    w.document.body.innerHTML = '<div class="field"><textarea data-limit="5" data-target="4" data-count="linkedin">abc</textarea><span class="draft-len"><b>0</b> / 5</span></div>'
    w.eval(COUNT_SCRIPT)
    const out = w.document.querySelector('.draft-len')!
    expect(out.querySelector('b')!.textContent).toBe('3')
    const t = w.document.querySelector('textarea')!
    t.value = 'abcdefg'; t.dispatchEvent(new w.Event('input'))
    expect(out.className).toBe('draft-len bad')
  })
})
