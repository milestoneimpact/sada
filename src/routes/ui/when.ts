/**
 * ‏«متى يُنشر؟» بتوقيت المالك (D-198 · D-199) — يشترك فيه المحرّرُ و«وزّع المعتمَد».
 *
 * ‏في ملفٍّ وحدَه لأنّ المحرّرَ يقرأ من `sections/drafts` و«المسوّداتُ» تقرؤه، وحلقةٌ بينهما يردّها `audit_cycles`.
 */
import type { Peaks } from '../../lib/schedule/peak'
import { clock, dayLabel, localParts } from '../../lib/time/zone'
import { presetAt, PRESETS } from '../../lib/time/local'
import { escapeHtml } from './escape'
import { field } from './components/field'

/** أوّلُ موعدٍ يقبله الحقلُ بتوقيت المالك: ربعُ ساعةٍ من الآن (دورةُ الإرسال تدور كلَّ ربع). */
export function earliestLocal(now: Date, zone: string | null): string {
  const p = localParts(new Date(now.getTime() + 15 * 60_000), zone)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`
}

/** ساعاتُ الذروة بتوقيت المالك — سطرٌ واحد، ولا شيءَ إن لم يُقَس (D-106). */
function peakLine(peaks: Peaks | undefined, zone: string | null, now: Date): string {
  if (peaks === undefined || peaks.hours.length === 0) return ''
  const said = peaks.hours.map((h) =>
    clock(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h.hour)), zone)).join(' · ')
  return `<p class="hint m-0">أعلى تفاعلٍ قِيس عندك: <bdi>${escapeHtml(said)}</bdi>${zone === null ? ' بتوقيت UTC' : ''}، من ${peaks.samples} منشوراتٍ قِيست.</p>`
}

/**
 * «متى يُنشر؟» — **أزرارٌ يحسبها الخادمُ بتوقيت المالك، أو يومٌ وساعة**.
 *
 * وتحت كلّ زرٍّ يومُه أو ساعتُه محسوبةً الآن، فيُقرأ ما سيُختار قبل الضغط. والحقلُ الحرُّ يُفسَّر
 * بمنطقة المالك من كعكته (D-173)، **وبـ UTC معلنةً** حين غابت.
 */
export function whenField(form: string, zone: string | null, now: Date, peaks: Peaks | undefined, legend = 'متى يُنشر؟'): string {
  const opts = PRESETS.map((p) => {
    const at = presetAt(p.kind, now, zone)
    const sub = at === null ? '' : p.kind === 'hour' ? clock(at, zone) : dayLabel(at, zone, false)
    return `<label class="when-opt"><input type="radio" name="preset" value="${p.kind}" form="${form}"${p.kind === 'tomorrow' ? ' checked' : ''}>
      <span><b>${escapeHtml(p.label)}</b><small>${escapeHtml(sub)}</small></span></label>`
  }).join('')
  return `<fieldset class="ed-when">
    <legend>${escapeHtml(legend)}</legend>
    <p class="hint m-0">${zone === null ? 'بتوقيت UTC: لم تصل منطقتُك بعد، وتصل بعد أوّل تحميل.' : `بتوقيتك (<bdi dir="ltr">${escapeHtml(zone)}</bdi>)`}</p>
    <div class="when-opts">${opts}
      <label class="when-opt"><input type="radio" name="preset" value="custom" form="${form}">
        <span><b>موعدٌ آخر</b><small>تختار اليوم والساعة</small></span></label>
    </div>
    <div class="when-custom">${field({
      id: `${form}-local`,
      label: zone === null ? 'اليوم والساعة (UTC)' : 'اليوم والساعة',
      control: `<input type="datetime-local" name="local" form="${form}" min="${escapeHtml(earliestLocal(now, zone))}">`,
    })}</div>
    ${peakLine(peaks, zone, now)}
  </fieldset>`
}
