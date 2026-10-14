/** معاينةُ الخطّة تقول المنطقةَ التي قُرئت بها المواعيد (D-202). */
import { describe, expect, it } from 'vitest'
import type { PlanRead } from '../../lib/plan/import'
import { planImportScreen } from './planImportView'

const EMPTY: PlanRead = { rows: [], fileProblems: [] }

describe('تلميحُ المنطقة في معاينة الخطّة', () => {
  it('أوّلَ زيارةٍ «بتوقيت الرياض» لا «بتوقيتك»', () => {
    const html = planImportScreen('p1', EMPTY, new Date('2026-10-04T08:00:00Z'), undefined, true)
    expect(html).toContain('المواعيدُ بتوقيت الرياض كما فهمها صدى')
    expect(html).not.toContain('بتوقيتك')
  })

  it('ومنطقةٌ معروفة «بتوقيتك»', () => {
    const html = planImportScreen('p1', EMPTY, new Date('2026-10-04T08:00:00Z'))
    expect(html).toContain('المواعيدُ بتوقيتك كما فهمها صدى')
  })
})
