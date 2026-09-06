/**
 * المعالج — **وأكثرُ ما يُفحَص هنا ما يرفض أن يدّعيه.**
 */
import { describe, expect, it } from 'vitest'
import { wizardFor, type StepState } from './wizard'
import type { AppStatus } from './apps'
import type { ChannelView } from '../channels'

const SPEC = { id: 'linkedin', label: 'LinkedIn' } as unknown as ChannelView['spec']

function view(accounts = 0): ChannelView {
  return {
    spec: SPEC,
    state: accounts > 0 ? 'linked' : 'connectable',
    accounts: Array.from({ length: accounts }, (_, i) => ({ id: `a${i}` })) as never,
    missing: [],
  } as unknown as ChannelView
}

function app(over: Partial<AppStatus> = {}): AppStatus {
  return {
    platform: 'linkedin', source: 'vault', clientId: 'the-id', hint: 'th…id',
    updatedAt: '2026-09-06', updatedBy: 'panel',
    secretNames: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    verifiedAt: null, verifiedKind: null,
    ...over,
  }
}

const at = (w: ReturnType<typeof wizardFor>, n: number): StepState =>
  w.steps.find((s) => s.n === n)!.state

describe('ما لا يُعرَف لا تُوضَع عليه علامة', () => {
  /**
   * **رابطُ العودة حقلٌ عند المنصّة** — ولا واجهةَ تقول ما فيه.
   * ولوحةٌ تضع عليه علامةَ صحٍّ تكذب في أخطر موضع: يبحث المالكُ في
   * غيره وهو العطل.
   */
  it('رابطُ العودة «لا يُعرَف» حتّى ينجح الربط', () => {
    expect(at(wizardFor(view(0), app()), 2)).toBe('unknowable')
    expect(at(wizardFor(view(0), app({ verifiedKind: 'accepted' })), 2)).toBe('unknowable')
    // ولا يثبت إلّا بالربط نفسِه
    expect(at(wizardFor(view(1), app()), 2)).toBe('done')
  })

  /**
   * **وسرٌّ يُلصَق لتطبيقٍ لم يُنشَأ يُحفَظ كما يُحفَظ الصحيح.**
   * فوجودُ صفٍّ في الخزانة لا يثبت أنّ التطبيق قائم.
   */
  it('وحفظُ المعرّف لا يثبت أنّ التطبيق قائم', () => {
    expect(at(wizardFor(view(0), app()), 1)).toBe('unknowable')
    expect(at(wizardFor(view(0), app({ verifiedKind: 'accepted' })), 1)).toBe('done')
  })

  /**
   * **ولا «لم يُفحَص» أيضا** (D-076).
   *
   * كانت الخطوةُ ٣ تعود `now` — أي «محفوظٌ ولم يُفحَص، فاضغط افحص».
   * **وقد فُحص**، وردّت المنصّةُ بما لا يتكلّم عن الزوج. فيُقال ذلك:
   * لا خُضرةٌ تكذب، ولا دعوةٌ إلى فحصٍ وقع.
   */
  it('و«لم يُحسَم» لا يُعدّ جوازا ولا رفضا ولا فحصا لم يقع', () => {
    const w = wizardFor(view(0), app({ verifiedKind: 'inconclusive' }))
    expect(at(w, 1)).toBe('unknowable')
    expect(at(w, 3)).toBe('unknowable')
  })
})

describe('والطريقُ يتقدّم بما ثبت', () => {
  it('بلا أسرارٍ: الأولى هي الآن، والباقي ينتظر', () => {
    const w = wizardFor(view(0), app({ source: 'none', clientId: null }))
    expect(at(w, 1)).toBe('now')
    expect(at(w, 3)).toBe('waiting')
    expect(at(w, 4)).toBe('waiting')
    expect(w.current).toBe(1)
  })

  it('وبأسرارٍ لم تُفحَص: الثالثةُ هي الآن', () => {
    const w = wizardFor(view(0), app())
    expect(at(w, 3)).toBe('now')
    expect(w.current).toBe(3)
    expect(w.steps[2]!.proof).toContain('افحص الزوج')
  })

  it('وبفحصٍ جائز: الرابعةُ هي الآن', () => {
    const w = wizardFor(view(0), app({ verifiedKind: 'accepted', verifiedAt: 'x' }))
    expect(at(w, 3)).toBe('done')
    expect(at(w, 4)).toBe('now')
    expect(w.current).toBe(4)
  })

  it('وبربطٍ قائم: تمّ كلُّ شيء', () => {
    const w = wizardFor(view(2), app({ verifiedKind: 'accepted', verifiedAt: 'x' }))
    expect(w.steps.every((s) => s.state === 'done')).toBe(true)
    expect(w.current).toBeNull()
    expect(w.linked).toBe(true)
  })
})

describe('والرفضُ يوقف ما بعده', () => {
  /** دورةُ إذنٍ تنتهي بالرفض نفسِه ليست محاولة — هي إضاعةُ دقيقة. */
  it('سرٌّ مرفوضٌ يُبقي الرابعةَ منتظِرةً لا «الآن»', () => {
    const w = wizardFor(view(0), app({ verifiedKind: 'bad_secret', verifiedAt: 'x' }))
    expect(at(w, 3)).toBe('failed')
    expect(at(w, 4)).toBe('waiting')
    expect(w.steps[3]!.proof).toContain('دورةٌ تنتهي بالرفض')
    expect(w.current).toBe(3)
  })

  /** **ومعرّفٌ مجهولٌ يُسقط الأولى لا الثالثة** — فيُفتَّش حيث العطل. */
  it('ومعرّفٌ مجهولٌ يُسقط الخطوةَ الأولى', () => {
    const w = wizardFor(view(0), app({ verifiedKind: 'bad_client_id', verifiedAt: 'x' }))
    expect(at(w, 1)).toBe('failed')
    expect(w.current).toBe(1)
    expect(w.steps[0]!.proof).toContain('تطبيقٌ آخر')
  })
})

describe('وسرُّ Worker يمرّ كما يمرّ سرُّ الخزانة', () => {
  it('لا أثرَ فحصٍ له، فيبقى «الآن» على الفحص', () => {
    const w = wizardFor(view(0), app({ source: 'worker_secret', hint: null }))
    expect(at(w, 3)).toBe('now')
  })
})
