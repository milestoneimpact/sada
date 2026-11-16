/**
 * **شريطُ الفحص** (D-383 · المرحلة ٥) — ما وجدته `planChecks` فوق المراجعة وفوق صفوف الحزمة، قبل الاعتماد.
 *
 * سطرٌ يعدّ التحذيرات والممنوع، ثمّ قائمةٌ لكلّ قاعدة: سببُها بالعربيّة، وزرُّ إصلاحٍ بضغطة (POST إلى `/panel/plan/check/fix`)
 * لما يُصلَح على الخادم، ورابطٌ لما يُصلَح بيد المالك. وبلا سكربتٍ يعمل كلُّه: كلُّ زرٍّ نموذجٌ صغير.
 */
import { FIX_LABEL, ONE_TAP, RULE_LABEL, summarize, type Finding, type ScheduleRules } from '../../lib/plan/checks'
import { field } from './components/field'
import { pageHead } from './parts'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { card } from './components/card'
import { html, raw, type Html } from './html'

export interface ChecksView {
  readonly findings: readonly Finding[]
  /** خطّةُ المراجعة: بها تُرسل الإصلاحاتُ بضغطة، وغيابُها (الحزمةُ قبل البناء) يعرض بلا أزرار. */
  readonly planId?: string
  readonly w?: string
  /** من يجدول (الناشرُ فأعلى) يرى أزرار الإصلاح. */
  readonly canFix: boolean
  /** شهرٌ «YYYY-MM» يعود إليه الإصلاح: من شاشة الشهر إليها، لا إلى المراجعة. */
  readonly back?: string
  /** وجهةُ ما يُصلَح بيد المالك. */
  readonly links?: Partial<Record<'edit' | 'upload' | 'connect' | 'format' | 'adopt', string>>
}

const LINKS = { edit: '#rv-bulk', upload: '#rv-bulk', connect: '/panel/accounts', format: '#rv-bulk', adopt: '/panel/plan/review' } as const

function fixOf(f: Finding, v: ChecksView): Html {
  if (ONE_TAP.includes(f.fix)) {
    if (!v.canFix || v.planId === undefined) return html``
    return html`<form class="inline" method="POST" action="/panel/plan/check/fix" data-busy="يُصلَح…">
      <input type="hidden" name="id" value="${v.planId}"><input type="hidden" name="w" value="${v.w ?? ''}">
      <input type="hidden" name="rule" value="${f.rule}"><input type="hidden" name="keys" value="${f.keys.join('\n')}">
      <input type="hidden" name="day" value="${f.day ?? ''}"><input type="hidden" name="platform" value="${f.platform ?? ''}">${v.back === undefined ? html`` : html`<input type="hidden" name="back" value="${v.back}">`}
      ${raw(button({ label: FIX_LABEL[f.fix], size: 'sm', type: 'submit' }))}</form>`
  }
  const href = v.links?.[f.fix as keyof typeof LINKS] ?? LINKS[f.fix as keyof typeof LINKS]
  return href === undefined ? html`` : html`<a class="tap" href="${href}">${FIX_LABEL[f.fix]}</a>`
}

export function checksStrip(v: ChecksView): string {
  const s = summarize(v.findings)
  if (v.findings.length === 0) {
    return html`<p class="m-0">${raw(statusBadge('ok', '✓', 'لا تعارض ولا ازدحام'))}</p>`.value
  }
  const head = html`<p class="m-0" role="status">${s.warn === 0 ? '' : String(s.warn) + ' تحذير'}${s.warn > 0 && s.block > 0 ? '، ' : ''}${s.block === 0 ? '' : String(s.blockedItems) + ' بند ممنوع لا يُجدوَل ويبقى مسوّدة'}. بقيّة الخطّة تُعتمد.</p>`
  const order = [...v.findings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'block' ? -1 : 1))
  const list = html`<ul class="plain stack">${order.slice(0, 30).map((f) => html`<li class="row gap-2">
      ${raw(statusBadge(f.severity === 'block' ? 'bad' : 'warn', f.severity === 'block' ? '×' : '!', RULE_LABEL[f.rule]))}
      <span class="grow">${f.message}</span>${fixOf(f, v)}</li>`)}</ul>`
  const more = order.length > 30 ? html`<p class="hint m-0">و${String(order.length - 30)} غيرها تظهر بعد إصلاح ما فوقها.</p>` : html``
  return card({ variant: 'alert', tone: s.block > 0 ? 'bad' : 'warn', title: 'قبل الاعتماد', level: 2, body: html`${head}${list}${more}`.value })
}

/** بطاقةٌ في «الإعدادات» إلى صفحة القواعد — بلا قراءةٍ من القاعدة، فلا يثقل لوحُ الإعدادات. */
export function rulesLink(): string {
  return '<div class="mt-3">' + card({ title: 'قواعد الجدولة', level: 2, body: html`<p class="hint">بها تفحص المراجعةُ الخطّةَ قبل الاعتماد: سقفُ كلّ منصّة، والحملُ اليوميّ، والفاصلُ الأدنى، وساعاتُ الهدوء.</p>
    <div class="row">${raw(button({ label: 'اضبط القواعد', href: '/panel/plan-rules', variant: 'secondary' }))}</div>`.value }) + '</div>'
}

/**
 * **قواعد الجدولة** (D-383 · المرحلة ٥): ما تفحص به المراجعةُ الخطّةَ قبل الاعتماد. تحذيراتٌ لا تمنع النشر، إلّا سقفَ المنصّة
 * إذا بلغ ضعفَه. والقيمُ بتوقيت المالك.
 */
export function rulesScreen(r: ScheduleRules, canEdit: boolean): string {
  const dis = canEdit ? '' : ' disabled'
  const num = (id: string, name: string, label: string, value: number, min: number, max: number): Html =>
    raw(field({ id, label, control: html`<input type="number" id="${id}" name="${name}" min="${String(min)}" max="${String(max)}" step="1" value="${String(value)}" dir="ltr"${raw(dis)}>`.value }))
  const time = (id: string, name: string, label: string, value: string): Html =>
    raw(field({ id, label, control: html`<input type="time" id="${id}" name="${name}" value="${value}" dir="ltr"${raw(dis)}>`.value }))
  const head = pageHead('الضبط', 'قواعد الجدولة', 'بها تفحص المراجعةُ الخطّةَ قبل الاعتماد. تحذيراتٌ لا تمنع النشر، إلّا سقفَ المنصّة إذا بلغ ضعفَه.')
  const body = html`<form class="stack" method="POST" action="/panel/plan-rules">
      <div class="row">
        ${num('pr-x', 'cap_x', 'سقف X في اليوم', r.platformCaps['x'] ?? 3, 1, 20)}
        ${num('pr-li', 'cap_linkedin', 'سقف LinkedIn في اليوم', r.platformCaps['linkedin'] ?? 2, 1, 20)}
        ${num('pr-total', 'daily_total', 'الحمل اليوميّ الكلّيّ', r.dailyTotalCap, 1, 40)}
      </div>
      <div class="row">
        ${num('pr-gap', 'min_gap', 'الفاصل الأدنى بالدقائق', r.minGapMinutes, 0, 720)}
        ${num('pr-jit', 'jitter', 'التذبذب بالدقائق', r.jitterMinutes, 0, 30)}
        ${time('pr-qs', 'quiet_start', 'الهدوء من', r.quietStart)}
        ${time('pr-qe', 'quiet_end', 'الهدوء إلى', r.quietEnd)}
      </div>
      ${canEdit ? html`<div class="row">${raw(button({ label: 'احفظ القواعد', variant: 'primary', type: 'submit' }))}</div>` : html`<p class="hint m-0">يضبطها المدير أو المالك.</p>`}
    </form>`
  return html`${raw(head)}<div class="stack">${raw(card({ id: 'plan-rules', title: 'العتبات', level: 2, body: body.value }))}</div>`.value
}
