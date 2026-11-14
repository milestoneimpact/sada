/**
 * **المفضّلةُ والوسومُ والبحث** في مكتبة الأصول (D-347، باقي المرحلة الرابعة من `docs/FLOW-PLAN.md`).
 *
 * نماذجُ عاديّةٌ تعمل بلا سكربت: البحثُ `GET` يُحفظ في العنوان، والعلامةُ `POST` إلى `/panel/assets/mark` بحرّاسه وتعود إلى العرض نفسِه.
 */
import { html, raw } from '../html'
import { button } from '../components/button'
import { field } from '../components/field'
import type { Asset } from '../../../lib/library'

/** شريطُ البحث: اسمٌ أو وسم، والمفضّلةُ وحدَها — وما في العنوان من فرزٍ واختيارٍ يبقى (`keep`: حقولٌ مخفيّةٌ جاهزة). */
export function assetSearch(q: string, favOnly: boolean, keep: readonly (readonly [string, string])[]): string {
  return html`<form method="GET" action="/panel/assets" class="lib-find" role="search">
      ${keep.map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
      ${raw(field({ id: 'lib-q', label: 'ابحث في الأصول', hint: 'باسم الملفّ أو بوسمٍ كتبتَه.', control: html`<input type="search" id="lib-q" name="q" value="${q}" autocomplete="off">`.value }))}
      ${raw(field({ id: 'lib-fav', label: 'أعرض', control: html`<select id="lib-fav" name="fav"><option value="">الكلّ</option><option value="1"${favOnly ? raw(' selected') : ''}>المفضّلة وحدَها</option></select>`.value }))}
      ${raw(button({ label: 'ابحث', type: 'submit' }))}
    </form>`.value
}

/** علامتا البلاطة: زرُّ المفضّلة، ووسومُها رقائقَ، وطيّةٌ لتعديلها. و`back` عنوانُ العرض الحاليّ ليعود إليه. */
export function assetMarks(a: Asset, back: string): string {
  if (a.favourite === undefined) return ''
  const tags = a.tags ?? []
  const idOf = 'tg-' + a.ref.replace(/[^A-Za-z0-9_-]/g, '-')
  return html`<div class="lib-marks">
      ${tags.length === 0 ? html`` : html`<div class="row gap-1 lib-tags">${tags.map((t) => html`<span class="chip">${t}</span>`)}</div>`}
      <div class="row gap-2">
        <form class="inline" method="POST" action="/panel/assets/mark"><input type="hidden" name="ref" value="${a.ref}"><input type="hidden" name="back" value="${back}">
          <input type="hidden" name="fav" value="${a.favourite ? '0' : '1'}">${raw(button({ label: a.favourite ? 'مفضّلة' : 'فضّلها', size: 'sm', type: 'submit', attrs: 'aria-pressed="' + String(a.favourite) + '"' }))}</form>
        <details class="fold lib-tag-edit"><summary><span>الوسوم</span></summary>
          <form method="POST" action="/panel/assets/mark" class="stack"><input type="hidden" name="ref" value="${a.ref}"><input type="hidden" name="back" value="${back}">
            ${raw(field({ id: idOf, label: 'وسومُ «' + a.name + '»', hint: 'افصل بينها بفاصلة — حتّى ثمانية.', control: html`<input type="text" id="${idOf}" name="tags" value="${tags.join('، ')}" autocomplete="off">`.value }))}
            ${raw(button({ label: 'احفظ الوسوم', size: 'sm', type: 'submit' }))}</form></details>
      </div></div>`.value
}
