/**
 * «ما ينجح» — تبويبٌ رابعٌ في «النتائج» (D-253).
 *
 * سؤالُ المالك: **متى أنشر، وبأيّ شكل، وكيف أكبّر الظهور؟** والجوابُ من تاريخ حسابه وحده، مقيسًا أو لا يُقال:
 * أرجحُ موعدٍ بتقديره وعيّنته، ثمّ جملٌ تقارن ما يكفي من العيّنة، ثمّ الأبعادُ الأربعة جداولَ، ثمّ السجلُّ كاملًا.
 */
import { escapeHtml } from './escape'
import { pageHead } from './parts'
import { resultsTabs } from './results'
import { emptyState } from './components/empty'
import { counted, NOUNS } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { stamp } from '../../lib/time/zone'
import { PER_BUCKET, type Dimension, type PostFact, type WhatWorks } from '../../lib/insights/whatWorks'
import { neutralizeFormula } from '../../lib/csv'

export interface InsightsData {
  readonly works: WhatWorks
  readonly facts: readonly PostFact[]
  /** المنصّةُ المعروضة — `null` للمنصّات كلّها. */
  readonly platform: string | null
  /** المنصّاتُ التي لها منشوراتٌ مقيسة — أزرارُ التبديل. */
  readonly platforms: readonly string[]
  readonly zone: string | null
}

const FORMAT_LABEL: Readonly<Record<PostFact['format'], string>> = { text: 'نصّ', image: 'صورة', video: 'فيديو' }

function href(platform: string | null): string {
  return platform === null ? '/panel/insights' : `/panel/insights?p=${encodeURIComponent(platform)}`
}

function switcher(d: InsightsData): string {
  if (d.platforms.length < 2) return ''
  const one = (p: string | null, label: string): string =>
    `<a class="btn btn-sm ${p === d.platform ? 'btn-primary' : 'btn-secondary'}" href="${escapeHtml(href(p))}"${
      p === d.platform ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`
  return `<div class="row gap-2 mb-4">${one(null, 'كلّها')}${d.platforms.map((p) => one(p, platformLabel(p as never))).join('')}</div>`
}

function dimCard(dim: Dimension): string {
  const rows = dim.buckets.map((b) => {
    const thin = b.posts < PER_BUCKET
    return `<tr${dim.best?.key === b.key ? ' class="urgent"' : ''}><th scope="row">${escapeHtml(b.label)}</th>
      <td>${b.posts}</td><td>${thin ? '—' : escapeHtml(String(Math.round(b.median)))}</td>
      <td>${thin ? 'عيّنةٌ أقلّ من ثلاثة' : escapeHtml(`${b.lift >= 1 ? '+' : '−'}${Math.abs(Math.round((b.lift - 1) * 100))}٪`)}</td></tr>`
  }).join('')
  return `<div class="card"><h2>${escapeHtml(dim.title)}</h2>
    <div class="scroll"><table>
      <thead><tr><th>${escapeHtml(dim.title)}</th><th>منشورات</th><th>وسيطُ التفاعل</th><th>عن المعتاد</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`
}

export function insightsScreen(d: InsightsData): string {
  const w = d.works
  const head = pageHead('القياس', 'ما ينجح',
    'متى تنشر، وبأيّ شكل وطول — <b>من تاريخ حسابك وحده</b>. والتفاعلُ إعجابٌ وتعليقٌ ومشاركة في أوّل ‏24 ساعة.')
  if (w.dims === null) {
    return `${resultsTabs('insights')}${head}${switcher(d)}
    <div class="card">${emptyState({
      title: 'لا حكمَ بعد',
      html: `${escapeHtml(w.why ?? '')}. <b>ولا يُقترَح وقتٌ لم يُقَس</b>: «التاسعة صباحًا» في مدوّنات التسويق ليست قياسًا لحسابك.
        كلُّ منشورٍ يُنشر من صدى ويُقاس يقرّبك من الحكم.`,
    })}</div>`
  }

  const slot = w.slot === null
    ? ''
    : `<div class="card card-alert next mb-4"><h2>أرجحُ موعدٍ للنشر</h2>
        <p class="lede m-0 mb-4"><b>${escapeHtml(w.slot.label)}</b> — تفاعلٌ متوقَّع نحو <b>${w.slot.expected}</b>،
          والمعتادُ ${Math.round(w.overall)}.</p>
        <p class="hint m-0">تقديرٌ من ${escapeHtml(counted(w.samples, NOUNS.post))}: يومُه أفضلُ أيّامك وفترتُه أفضلُ فتراتك،
          ويُفترَض أنّهما لا يتداخلان. جدوِل عليه، وقِس، فيصحّ التقديرُ أو يتبدّل.</p></div>`

  const advice = w.advice.length === 0
    ? '<p class="hint">لا فرقَ يُقال بعد: الفروقُ دون ‏20٪ أو خاناتٌ دون ثلاثة منشورات.</p>'
    : `<ul class="todo">${w.advice.map((a) => `<li><span>${escapeHtml(a)}</span></li>`).join('')}</ul>`

  const log = d.facts.slice(0, 50).map((f) => `<tr>
      <td>${escapeHtml(stamp(f.publishedAt, d.zone))}</td><td>${escapeHtml(platformLabel(f.platform as never))}</td>
      <td>${FORMAT_LABEL[f.format]}</td><td>${f.chars}</td><td>${f.engagement}</td>
      <td>${f.impressions === null ? '—' : f.impressions.toLocaleString('en-US')}</td>
      <td><a class="tap" href="/panel/journey/${escapeHtml(encodeURIComponent(f.id))}">رحلتُه</a></td></tr>`).join('')

  return `${resultsTabs('insights')}${head}${switcher(d)}
  ${slot}
  <div class="card mb-4"><h2>ما يقوله تاريخُك</h2>${advice}</div>
  <div class="grid c2 mb-4">${w.dims.map(dimCard).join('')}</div>
  <div class="card">
    <div class="split"><h2>السجلُّ كاملًا</h2>
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(`/panel/insights.csv${d.platform === null ? '' : `?p=${encodeURIComponent(d.platform)}`}`)}" download>نزّله CSV</a></div>
    <p class="hint">متى نُشر كلُّ منشور، وشكلُه وطولُه وتفاعلُه — آخرُ ‏50 هنا، والملفُّ فيه الكلّ.</p>
    <div class="scroll"><table>
      <thead><tr><th>نُشر</th><th>المنصّة</th><th>الشكل</th><th>الطول</th><th>التفاعل</th><th>الظهور</th><th></th></tr></thead>
      <tbody>${log}</tbody></table></div>
  </div>`
}

/** السجلُّ ملفًّا: بالأسماء لا المفاتيح، وبمنطقة المالك، ويفتح في Excel بالعربيّة (BOM). */
export function insightsCsv(facts: readonly PostFact[], zone: string | null): string {
  // ‏نصُّ المنشور يكتبه غيرُنا: خليّةٌ تبدأ بـ`=` تصير صيغةً في Excel (D-318)
  const cell = (v: string | number): string => `"${neutralizeFormula(String(v)).replaceAll('"', '""')}"`
  const rows = facts.map((f) => [stamp(f.publishedAt, zone), platformLabel(f.platform as never), FORMAT_LABEL[f.format],
    f.chars, f.engagement, f.impressions ?? '', f.text.replace(/\s+/g, ' ').slice(0, 280)].map(cell).join(','))
  return `﻿${['نُشر', 'المنصّة', 'الشكل', 'الطول', 'التفاعل (24 ساعة)', 'الظهور', 'النصّ'].map(cell).join(',')}\r\n${rows.join('\r\n')}\r\n`
}
