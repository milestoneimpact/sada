/**
 * ‏«متى يُنشر؟» بتوقيت المالك (D-198 · D-199) — يشترك فيه المحرّرُ و«وزّع المعتمَد».
 *
 * ‏في ملفٍّ وحدَه لأنّ المحرّرَ يقرأ من `sections/drafts` و«المسوّداتُ» تقرؤه، وحلقةٌ بينهما يردّها `audit_cycles`.
 */
import type { Peaks } from '../../lib/schedule/peak'
import { clock, dayLabel, localParts, zoneNote } from '../../lib/time/zone'
import { momentLabel, nextPeak, presetAt, PRESETS } from '../../lib/time/local'
import { escapeHtml } from './escape'
import { field } from './components/field'
import { counted, NOUNS } from '../../lib/format'

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
  return `<p class="hint m-0">أعلى تفاعل قِيس عندك: <bdi>${escapeHtml(said)}</bdi>${zoneNote(zone)}، من ${peaks.samples} منشورات قِيست.</p>`
}

/**
 * «متى يُنشر؟» — **أزرارٌ يحسبها الخادمُ بتوقيت المالك، أو يومٌ وساعة**.
 *
 * وتحت كلّ زرٍّ يومُه أو ساعتُه محسوبةً الآن، فيُقرأ ما سيُختار قبل الضغط. والحقلُ الحرُّ يُفسَّر
 * بمنطقة المالك من كعكته (D-173)، وبالمنطقة المحفوظة إن غابت (D-200)، **وبتوقيت الرياض معلنًا** في أوّل زيارةٍ حقًّا (D-201).
 */
export function whenField(form: string, zone: string | null, now: Date, peaks: Peaks | undefined, legend = 'متى يُنشر؟'): string {
  // ‏«أقرب ذروة» أوّلُ الخيارات ومختارُها حين قِيست الذروة — كـ«Next Available» في Buffer،
  // لكن من تفاعل جمهور المالك لا من فتحاتٍ ثابتة. ولم تُقَس؟ يبقى «غدًا 9:00 ص».
  const best = peaks?.hours[0]
  const peakAt = best === undefined ? null : nextPeak(best.hour, now)
  const peakOpt = peakAt === null ? '' : `<label class="when-opt"><input type="radio" name="preset" value="peak-${best!.hour}" form="${form}" checked>
      <span><b>أقرب ذروة</b><small>${escapeHtml(momentLabel(peakAt, zone, now))}</small></span></label>`
  const opts = peakOpt + PRESETS.map((p) => {
    const at = presetAt(p.kind, now, zone)
    const sub = at === null ? '' : p.kind === 'hour' ? clock(at, zone) : dayLabel(at, zone, false)
    const checked = peakAt === null && p.kind === 'tomorrow'
    return `<label class="when-opt"><input type="radio" name="preset" value="${p.kind}" form="${form}"${checked ? ' checked' : ''}>
      <span><b>${escapeHtml(p.label)}</b><small>${escapeHtml(sub)}</small></span></label>`
  }).join('')
  return `<fieldset class="ed-when">
    <legend>${escapeHtml(legend)}</legend>
    ${zone === null ? '<p class="hint m-0">بتوقيت الرياض.</p>' : ''}
    <div class="when-opts">${opts}
      <label class="when-opt"><input type="radio" name="preset" value="custom" form="${form}">
        <span><b>موعد آخر</b><small>تختار اليوم والساعة</small></span></label>
    </div>
    <div class="when-custom">${field({
      id: `${form}-local`,
      label: zone === null ? 'اليوم والساعة (بتوقيت الرياض)' : 'اليوم والساعة',
      control: `<input type="datetime-local" name="local" form="${form}" min="${escapeHtml(earliestLocal(now, zone))}">`,
    })}</div>
    ${peakLine(peaks, zone, now)}
  </fieldset>`
}

/**
 * ‏**رأسُ خانة اليوم** (D-447): «الأحد 8 نوفمبر · منشوران» — اليومُ بلا فاصلته وعددُ منشوراته بمثنّاه وجمعه (`counted`).
 * ‏يأخذ وسمَ اليوم جاهزًا لأنّ لكلّ شاشةٍ صيغتَها (بتوقيتٍ أو بلا)، والعدُّ هنا وحدَه.
 */
export function dayHeading(label: string, n: number): string {
  const day = label.replace(/،\s*/g, ' ').trim()
  return n <= 0 ? day : day + ' · ' + counted(n, NOUNS.post)
}
