/**
 * **قياسُ سعر klein 9B** (D-398، ما تركه D-285).
 *
 * ## ما كان
 *
 * صفُّ الصورة النهائيّة يُكتب بـ Neurons من جدول `imagePricing` (صيغةُ صفحة الأسعار)، ولا شيءَ يقول أصدقت الصيغةُ ما
 * حاسبت عليه Cloudflare — فالسعرُ «غيرُ متحقَّق» في خارطة الطريق وإن لم يحمل الصفُّ العلامة.
 *
 * ## ما صار
 *
 * ١ · **ردُّ Workers AI لا يحمل Neurons** — لا ترويسةً ولا حقلًا موثّقًا (بحثٌ في وثائق Cloudflare، 2026-11-25)؛ فلا يُقرأ من
 *     الردّ ما ليس فيه. المصدرُ الوحيدُ المقيس **لوحةُ Workers AI** (Neurons لليوم بالنموذج)، يقرؤها المالكُ ويمرّرها.
 * ٢ · `compareKlein` (خالصة): صفوفُ klein في الدفتر ليومٍ (UTC) — كلُّ صفٍّ يُقارن بما تقوله الصيغةُ لمقاس منصّته
 *     (`GEN_SIZE`)، ومجموعُها يُقارن بعدد اللوحة إن مُرِّر. والفرقُ فوق 10٪ يُعلَّم `gap`؛ ودونه `measured`؛ وبلا عددٍ من
 *     اللوحة `unmeasured` — **يبقى غيرَ متحقَّق ويُقال**، لا يُخترَع.
 */
import type { Db } from '../tokens'
import { FINAL_IMAGE_MODEL, NEURON_USD, imageNeurons } from '../ai/imagePricing'
import { GEN_SIZE } from './job'

/** حدُّ الفرق المقبول بين الدفتر واللوحة (ROADMAP-3 §4 البند ٣). */
export const PRICE_GAP_LIMIT = 0.1

export interface KleinLedgerRow {
  readonly operation: string
  readonly units: number
  readonly total: number
}

export interface KleinCheck {
  readonly day: string
  readonly model: string
  readonly images: number
  /** Neurons الدفتر لليوم — مجموعُ `units`. */
  readonly ledger_neurons: number
  readonly ledger_usd: number
  /** ما تقوله صيغةُ الجدول لهذه الصور بمقاس منصّاتها. */
  readonly table_neurons: number
  /** صفوفٌ تخالف الصيغةَ فوق الحدّ (أو بمنصّةٍ لا مقاسَ لها). */
  readonly rows_off_table: number
  readonly dashboard_neurons: number | null
  /** (الدفتر − اللوحة) ÷ اللوحة — أو `null` بلا لوحة. */
  readonly gap: number | null
  readonly status: 'measured' | 'gap' | 'unmeasured' | 'no_images'
  readonly note: string
}

const ratio = (a: number, b: number): number => (b === 0 ? (a === 0 ? 0 : Infinity) : (a - b) / b)

/** خالصة: مقارنةُ صفوف klein ليومٍ بالجدول، وبعدد اللوحة إن وُجد. */
export function compareKlein(day: string, rows: readonly KleinLedgerRow[], dashboardNeurons: number | null): KleinCheck {
  let ledgerNeurons = 0
  let ledgerUsd = 0
  let tableNeurons = 0
  let off = 0
  for (const r of rows) {
    ledgerNeurons += r.units
    ledgerUsd += r.total
    const platform = r.operation.split(':')[1] ?? ''
    const size = (GEN_SIZE as Record<string, { width: number; height: number } | undefined>)[platform]
    const expected = size === undefined ? null : imageNeurons(FINAL_IMAGE_MODEL, size.width, size.height)
    if (expected === null) {
      off++
      continue
    }
    tableNeurons += expected
    if (Math.abs(ratio(r.units, expected)) > PRICE_GAP_LIMIT) off++
  }
  const base = { day, model: FINAL_IMAGE_MODEL, images: rows.length, ledger_neurons: ledgerNeurons, ledger_usd: ledgerUsd, table_neurons: tableNeurons, rows_off_table: off }
  if (rows.length === 0) {
    return { ...base, dashboard_neurons: dashboardNeurons, gap: null, status: 'no_images', note: 'لا صورةَ klein في الدفتر لهذا اليوم — ولّد واحدةً ثمّ قارن' }
  }
  if (dashboardNeurons === null) {
    return { ...base, dashboard_neurons: null, gap: null, status: 'unmeasured', note: 'السعرُ غيرُ متحقَّق: مرّر Neurons klein لليوم من لوحة Workers AI (klein_dashboard_neurons)' }
  }
  const gap = ratio(ledgerNeurons, dashboardNeurons)
  const over = Math.abs(gap) > PRICE_GAP_LIMIT
  return {
    ...base,
    dashboard_neurons: dashboardNeurons,
    gap,
    status: over ? 'gap' : 'measured',
    note: over
      ? `الفرقُ بين الدفتر واللوحة ${(gap * 100).toFixed(1)}٪ فوق 10٪ — راجع جدول imagePricing بصفحة الأسعار`
      : `مقيس: الدفترُ يطابق اللوحة بفرق ${(gap * 100).toFixed(1)}٪ (${(dashboardNeurons * NEURON_USD).toFixed(4)}$ بسعرها)`,
  }
}

/** صفوفُ klein في الدفتر ليومٍ (UTC) — على المنظّمات كلّها، فالحصّةُ واللوحةُ لحساب Cloudflare كلِّه. */
export async function kleinLedgerRows(db: Db, day: string): Promise<KleinLedgerRow[]> {
  const res = await db
    .prepare("SELECT operation, units, total FROM cost_ledger WHERE org_id IN (SELECT id FROM orgs) AND provider = 'cloudflare' AND operation LIKE ? AND date(at) = ?")
    .bind(`image:%:${FINAL_IMAGE_MODEL}%`, day)
    .all<KleinLedgerRow>()
  return res.results ?? []
}

/** ما يُقرأ من رابط القراءة: يومٌ صحيحٌ أو اليوم، وعددٌ موجبٌ أو لا شيء. */
export function parseCheckQuery(dayRaw: string | undefined, neuronsRaw: string | undefined, today: string): { day: string; dashboard: number | null } {
  const day = dayRaw !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : today
  const n = neuronsRaw === undefined ? NaN : Number(neuronsRaw)
  return { day, dashboard: Number.isFinite(n) && n >= 0 ? n : null }
}
