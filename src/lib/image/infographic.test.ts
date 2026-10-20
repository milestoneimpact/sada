/**
 * الإنفوجرافيك (D-174) — **المحتوى من النصّ، ولا رقمٌ لا يرد فيه**.
 */
import { describe, expect, it } from 'vitest'
import { infoFromText, infographicHtml, parseInfo, INFO_SIZE } from './infographic'

const POST = `المعلم ليس نقطة على الخط الزمني.

في هذا الإطار، يُعاد تعريفه كنقطة قيادة وتحكّم بخمسة أبعاد: قرار، توقيت، تحكّم، قياس، قيمة. ليست علامات إنجاز فحسب، بل لحظات قرار.

هذا التعريف يمتد عبر ثلاث طبقات — المشروع والبرنامج والمحفظة — لكلّ منها سؤالها الحاكم.

والنتيجة: حوكمة تُقاس بالمعالم لا بالمخرجات.

#إدارة_المشاريع #الحوكمة`

describe('الاستخراج من النصّ حين يسقط النموذج', () => {
  it('الأبعاد الخمسة بعد النقطتين أعمدة، والطبقات الثلاث المعطوفة قائمة ثانية بعنوانها', () => {
    const spec = infoFromText(POST)
    expect(spec.kind).toBe('pillars')
    expect(spec.items.map((i) => i.label)).toEqual(['قرار', 'توقيت', 'تحكّم', 'قياس', 'قيمة'])
    expect(spec.secondary).toEqual({ title: 'ثلاث طبقات', items: ['المشروع', 'البرنامج', 'المحفظة'] })
    expect(spec.title).toBe('المعلم ليس نقطة على الخط الزمني')
    expect(spec.source).toBe('text')
  })

  it('ولا وسم في الصورة', () => {
    const spec = infoFromText(POST)
    expect(JSON.stringify(spec)).not.toContain('#')
  })

  it('وفقرات بلا قائمة خطوات، وفكرة واحدة اقتباس', () => {
    expect(infoFromText('عنوان المنشور هنا.\n\nالفقرة الأولى تشرح شيئًا مهمًّا.\n\nالفقرة الثانية تكمل الفكرة.\n\nالفقرة الثالثة تختم.').kind).toBe('steps')
    expect(infoFromText('فكرة واحدة قويّة تقف وحدها.').kind).toBe('quote')
  })
})

describe('جواب النموذج', () => {
  const reply = (over: Record<string, unknown>): string => JSON.stringify({
    kind: 'pillars', kicker: 'Milestone Governance', title: 'المعلم نقطة قيادة',
    items: [{ label: 'قرار', value: '', note: 'لحظة قرار' }, { label: 'توقيت', value: '', note: '' }, { label: 'قياس', value: '', note: '' }],
    secondary: { title: 'ثلاث طبقات', items: ['المشروع', 'البرنامج', 'المحفظة'] },
    takeaway: 'حوكمة تُقاس بالمعالم',
    ...over,
  })

  it('يُقبل بشكله', () => {
    const spec = parseInfo(reply({}), POST)
    expect(spec?.kind).toBe('pillars')
    expect(spec?.kicker).toBe('Milestone Governance')
    expect(spec?.source).toBe('writer')
  })

  it('**ورقم لا يرد في النصّ يُمحى**، وشكل رقميّ فقد أرقامَه يعود أعمدة', () => {
    const spec = parseInfo(reply({
      kind: 'stats',
      items: [{ label: 'تأخّر', value: '62%', note: '' }, { label: 'أبعاد', value: '5', note: '' }, { label: 'طبقات', value: '3', note: '' }],
    }), POST)
    expect(spec?.kind).toBe('pillars')
    expect(spec?.items.every((i) => i.value === '')).toBe(true)
  })

  it('والرقم الوارد في النصّ يبقى، ولو كُتب بأرقام هنديّة', () => {
    const post = 'تأخّر ٦٢٪ من المشاريع، ومتوسّط التأخير 47 يومًا.'
    const spec = parseInfo(reply({
      kind: 'stats', items: [{ label: 'تتأخّر', value: '62%', note: '' }, { label: 'يومًا', value: '47', note: '' }],
    }), post)
    expect(spec?.kind).toBe('stats')
    expect(spec?.items.map((i) => i.value)).toEqual(['62%', '47'])
  })

  it('وشكل لا يوافق عدد بنوده يُردّ، وفوقيّة عربيّة تُمحى', () => {
    expect(parseInfo(reply({ kind: 'compare' }), POST)).toBeNull()
    expect(parseInfo(reply({ kicker: 'حوكمة المعالم' }), POST)?.kicker).toBe('')
    expect(parseInfo('ليس JSON', POST)).toBeNull()
  })
})

describe('الرسم', () => {
  it('مقاس كلّ منصّة، والنصّ مهرَّب، والخطوط مضمَّنة', () => {
    const spec = { ...infoFromText(POST), title: '<b>عنوان</b>' }
    const html = infographicHtml(spec, 'linkedin')
    expect(html).toContain(`width:${INFO_SIZE.linkedin.width}px;height:${INFO_SIZE.linkedin.height}px`)
    expect(html).toContain('&lt;b&gt;عنوان&lt;/b&gt;')
    expect(html).not.toContain('<b>عنوان</b>')
    expect(html).toContain("font-family:'Reem Kufi'")
    expect(html).toContain('dir="rtl"')
  })

  it('والنسبة حلقة بقدرها، وما ليس نسبةً رقم', () => {
    const html = infographicHtml({
      kind: 'stats', kicker: '', title: 'عنوان', takeaway: '', secondary: null, source: 'writer',
      items: [{ label: 'أ', value: '62%', note: '' }, { label: 'ب', value: '47', note: '' }],
    }, 'x')
    expect(html).toContain('stroke-dasharray="202.6 326.7"')
    expect(html).toContain('<span class="big">47</span>')
  })
})
