/**
 * **المكتبة** (D-260) — كلُّ ما رُفع أو وُلّد أو في Drive لهذا العميل، **مجلّداتٍ تُقرأ**: النوعُ › المنشأ › الشهر.
 *
 * وتُفتح بوجهين: تصفّحًا، **أو اختيارًا لبندٍ في الخطّة** (`?plan=…&index=…`) فيصير تحت كلّ ملفٍّ زرُّ «اختر لهذا البند»،
 * والرفعُ من هنا يُربط بالبند نفسِه. والفلاترُ روابطُ لا سكربت: تعمل بلا JavaScript، وتُحفظ في العنوان.
 */
import { ICON as SVG } from './icons'
import { escapeHtml } from './escape'
import { html, raw } from './html'
import { button } from './components/button'
import { field } from './components/field'
import { card } from './components/card'
import { pageHead } from './parts'
import { notice, toastRegion } from './components/toast'
import { counted, kb, NOUNS } from '../../lib/format'
import { folderOf, KIND_LABEL, LIBRARY_MIMES, ORIGIN_LABEL, searchAssets, type Asset, type AssetKind, type AssetOrigin } from '../../lib/library'
import { assetMarks, assetSearch } from './sections/assetMarks'

export interface LibraryData {
  readonly assets: readonly Asset[]
  readonly kind: AssetKind | null
  readonly origin: AssetOrigin | null
  /** وجهُ الاختيار: البندُ الذي يُختار له. */
  readonly pick: { readonly plan: string; readonly index: number } | null
  /** وجهُ الاختيار لمنشورٍ مكتوب (D-334): «اختر من المكتبة» على بطاقة الخطّة — المنشورُ وبطاقتُه وأسبوعُها للعودة. */
  readonly pickPost?: { readonly post: string; readonly index: number; readonly w: string } | null
  readonly flash?: {
    readonly kind: 'ok' | 'warn' | 'bad'
    readonly text: string
    /** «تراجَع» بعد حذف صورة (D-322) — رمزُه وحدَه، والصفُّ في KV لا في النموذج. */
    readonly undo?: { readonly action: string; readonly id: string; readonly label: string }
  } | null
  /** البحثُ والمفضّلة (D-347). */
  readonly q?: string
  readonly fav?: boolean
  /** مجلّدُ وسائط المالك في Drive (D-363) — اسمُه وعددُ ما فيه. */
  readonly driveMedia?: { readonly folder: string; readonly count: number }
}

/**
 * بطاقةُ «وسائطك من Drive» (D-363) — اسمُ المجلّد يُغيَّر، و«زامن الآن» نموذجٌ يعمل بلا سكربت (D-328). والخطّةُ تختار منه لكلّ مادّة.
 */
export function driveMediaCard(dm: { readonly folder: string; readonly count: number }): string {
  const body = '<p class="hint">صورُك ومقاطعُك في مجلّد <bdi dir="ltr">' + escapeHtml(dm.folder) + '</bdi> ومجلّداته الفرعيّة («01-…» لكلّ مادّة، و«داكن» أو «فاتح» في الاسم). '
    + (dm.count === 0 ? 'لم يُزامَن منه شيءٌ بعد.' : 'في المكتبة منه ' + counted(dm.count, NOUNS.file) + '، وتختار الخطّةُ منها لكلّ مادّة.') + '</p>'
    + '<form method="POST" action="/panel/scan/media-folder">'
    + field({ id: 'dm-folder', label: 'اسم المجلّد', hint: 'كما في Drive، تحت مجلّد المصادر المشارَك.',
      control: '<input type="text" id="dm-folder" name="folder" dir="ltr" maxlength="100" required value="' + escapeHtml(dm.folder) + '">' })
    + '<div class="row gap-2 mt-3">' + button({ label: 'احفظ الاسم', size: 'sm', type: 'submit' }) + '</div></form>'
    + '<form class="inline mt-3" method="POST" action="/panel/scan/media" data-busy="جار المزامنة…">'
    + button({ label: 'زامن الآن', variant: 'primary', size: 'sm', type: 'submit' }) + '</form>'
  return card({ variant: 'inset', id: 'drive-media', title: 'وسائطك من Drive', titleId: 'dm-h', attrs: 'aria-labelledby="dm-h"', body })
}

// ‏أيقوناتُ العُدّة لا حروفُ رموزٍ يرسمها خطُّ النظام (D-347)
const KIND_ICON: Readonly<Record<AssetKind, string>> = { image: SVG.sources, video: SVG.play, doc: SVG.guide }

function query(d: LibraryData, change: { kind?: AssetKind | null; origin?: AssetOrigin | null }): string {
  const q = new URLSearchParams()
  const kind = change.kind === undefined ? d.kind : change.kind
  const origin = change.origin === undefined ? d.origin : change.origin
  if (kind !== null) q.set('kind', kind)
  if (origin !== null) q.set('origin', origin)
  if (d.q !== undefined && d.q !== '') q.set('q', d.q)
  if (d.fav === true) q.set('fav', '1')
  if (d.pick !== null) { q.set('plan', d.pick.plan); q.set('index', String(d.pick.index)) }
  if (d.pickPost !== undefined && d.pickPost !== null) { q.set('post', d.pickPost.post); q.set('index', String(d.pickPost.index)); if (d.pickPost.w !== '') q.set('w', d.pickPost.w) }
  const s = q.toString()
  return `/panel/assets${s === '' ? '' : `?${s}`}`
}

function chips<T extends string>(d: LibraryData, labels: Readonly<Record<T, string>>, current: T | null, key: 'kind' | 'origin', counts: (v: T | null) => number): string {
  const one = (v: T | null, text: string): string =>
    `<a class="btn btn-secondary btn-sm" href="${escapeHtml(query(d, { [key]: v }))}"${v === current ? ' aria-current="page"' : ''}>${escapeHtml(text)} <span class="count">${counts(v)}</span></a>`
  return [one(null, 'الكلّ'), ...(Object.keys(labels) as T[]).map((v) => one(v, labels[v]))].join('')
}

function hidden(d: LibraryData): string {
  if (d.pickPost !== undefined && d.pickPost !== null) {
    return '<input type="hidden" name="post" value="' + escapeHtml(d.pickPost.post) + '"><input type="hidden" name="index" value="' + String(d.pickPost.index) + '"><input type="hidden" name="w" value="' + escapeHtml(d.pickPost.w) + '">'
  }
  return d.pick === null ? ''
    : `<input type="hidden" name="id" value="${escapeHtml(d.pick.plan)}"><input type="hidden" name="index" value="${d.pick.index}">`
}

function tile(a: Asset, d: LibraryData): string {
  const media = a.preview !== null && a.kind === 'image'
    ? `<img class="lib-thumb" src="${escapeHtml(a.preview)}?w=800" alt="" loading="lazy" decoding="async">`
    : `<div class="lib-thumb lib-ico" aria-hidden="true">${KIND_ICON[a.kind]}</div>`
  const open = a.drive !== null
    ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(a.drive)}" target="_blank" rel="noopener">افتح في Drive</a>`
    : a.preview !== null ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(a.preview)}" target="_blank" rel="noopener">افتح</a>` : ''
  const forPost = d.pickPost !== undefined && d.pickPost !== null
  // ‏عدّادُ الاستعمال (D-334): يُرى قبل الاختيار، فلا تتكرّر الصورةُ بلا قصد
  const used = a.uses === undefined || a.uses === 0 ? '' : ' · ' + (a.uses === 1 ? 'في منشورٍ واحد' : 'في ' + String(a.uses) + ' منشورات')
  // ‏وصورةُ الأصول المرفوعةُ تُحذف من هنا (D-322) بلا «أتمضي؟» — «تراجَع» في إشعارها. والمقاطعُ من «فيديوهاتك»، والمولَّدةُ مع منشورها
  const remove = d.pick !== null || forPost || !a.ref.startsWith('f:') ? ''
    : html`<form class="inline" method="POST" action="/panel/assets/delete" data-busy="جار…"><input type="hidden" name="ref" value="${a.ref}">
        ${raw(button({ label: 'احذف', variant: 'danger', size: 'sm', type: 'submit', attrs: html`aria-label="${'احذف ' + a.name}"`.value }))}</form>`.value
  const pick = forPost
    ? a.kind !== 'image' || a.origin === 'drive' ? ''
      : '<form class="inline" method="POST" action="/panel/plan/review/image">' + hidden(d) + '<input type="hidden" name="ref" value="' + escapeHtml(a.ref) + '">'
        + button({ label: 'استعملها لهذا المنشور', variant: 'primary', size: 'sm', type: 'submit' }) + '</form>'
    : d.pick === null ? ''
    : `<form class="inline" method="POST" action="/panel/plan/item">${hidden(d)}<input type="hidden" name="asset" value="${escapeHtml(a.ref)}">
        <button class="btn btn-primary btn-sm" type="submit">${a.origin === 'drive' ? 'اكتب منه' : 'اختر لهذا البند'}</button></form>`
  return `<article class="card card-inset tile">
    ${media}
    <div class="kv-k"><bdi>${escapeHtml(a.name)}</bdi></div>
    <div class="note">${escapeHtml(folderOf(a))}${a.bytes === null ? '' : ` · ${escapeHtml(kb(a.bytes))}`}${escapeHtml(used)}</div>
    <div class="row gap-2 mt-3">${pick}${open}${remove}</div>
    ${assetMarks(a, query(d, {}).split('?')[1] ?? '')}
  </article>`
}

export function libraryScreen(d: LibraryData): string {
  // ‏البحثُ والمفضّلة أوّلًا (D-347)، ثمّ النوعُ والمنشأ — والمفضّلةُ تتقدّم في مجلّدها
  const shown = searchAssets(d.assets, d.q ?? '', d.fav === true)
    .filter((a) => (d.kind === null || a.kind === d.kind) && (d.origin === null || a.origin === d.origin))
    .sort((a, b) => Number(b.favourite === true) - Number(a.favourite === true))
  const keep: (readonly [string, string])[] = [...new URLSearchParams(query({ ...d, q: '', fav: false }, {}).split('?')[1] ?? '')]
  // ‏المجلّداتُ بترتيب أحدث ما فيها — وكلُّ مجلّدٍ عنوانٌ وعدد
  const folders = new Map<string, Asset[]>()
  for (const a of shown) {
    const f = folderOf(a)
    folders.set(f, [...(folders.get(f) ?? []), a])
  }
  const lead = d.pickPost !== undefined && d.pickPost !== null
    ? '<b>اختر صورةً لهذا المنشور</b> — تُربط به بلا كلفة، وصورتُه الحاليّةُ تُستبدل. أو ارفع جديدةً فتُحفظ في الأصول وتُربط به. <a href="/panel/plan/review'
      + (d.pickPost.w === '' ? '' : '?w=' + escapeHtml(d.pickPost.w)) + '#c-' + String(d.pickPost.index) + '">عُد إلى الخطّة</a>'
    : d.pick === null
    ? 'كلُّ ما رُفع أو وُلّد أو في Drive — <b>يُحفظ مصنَّفًا ويُعاد استعمالُه بلا كلفة</b>.'
    : `<b>اختر ملفًّا لبند الخطّة</b> — أو ارفع جديدًا فيُحفظ في الأصول ويُربط به. <a href="/panel/client#board">عُد إلى الخطّة</a>`
  const accept = [...LIBRARY_MIMES].join(',')
  // ‏نموذجُ الرفع بحقلٍ من العُدّة (اسمٌ يُقرأ، وهدفُ لمسٍ كامل)، ورابطُ المقاطع زرٌّ لا كلمةٌ صغيرةٌ في سطر (D-347)
  const upload = '<form class="card card-inset" id="upload" method="POST" action="/panel/assets/upload" enctype="multipart/form-data">'
    + hidden(d)
    + field({ id: 'lib-up', label: 'ارفع صورة', hint: 'PNG أو JPEG أو WebP حتّى 5MB. والمقاطعُ تُرفع من «فيديوهاتك» وتظهر هنا بعدها.',
      control: '<input type="file" id="lib-up" name="file" accept="' + escapeHtml(accept) + '" required>' })
    + '<div class="row gap-2 mt-3">'
    + button({ label: 'ارفع' + (d.pickPost !== undefined && d.pickPost !== null ? ' واربطها بالمنشور' : d.pick === null ? '' : ' واربطه بالبند'), variant: 'primary', size: 'sm', type: 'submit' })
    + button({ label: 'فيديوهاتك', size: 'sm', href: '/panel/library#videos' })
    + '</div></form>'

  return `${pageHead('الأصول', 'أصولُ العميل', lead)}
  ${d.flash === undefined || d.flash === null ? '' : toastRegion(notice({
    tone: d.flash.kind, html: escapeHtml(d.flash.text), alert: d.flash.kind === 'bad',
    ...(d.flash.undo === undefined ? {} : {
      action: html`<form class="inline" method="POST" action="${d.flash.undo.action}"><input type="hidden" name="id" value="${d.flash.undo.id}">
        ${raw(button({ label: d.flash.undo.label, size: 'sm', type: 'submit' }))}</form>`.value,
    }),
  }))}
  <div class="row gap-2 mb-3 lib-chips" role="group" aria-label="النوع">${chips(d, KIND_LABEL, d.kind, 'kind', (v) => d.assets.filter((a) => v === null || a.kind === v).length)}</div>
  <div class="row gap-2 mb-4 lib-chips" role="group" aria-label="المنشأ">${chips(d, ORIGIN_LABEL, d.origin, 'origin', (v) => d.assets.filter((a) => v === null || a.origin === v).length)}</div>
  ${assetSearch(d.q ?? '', d.fav === true, keep)}
  ${upload}
  ${d.driveMedia === undefined ? '' : driveMediaCard(d.driveMedia)}
  ${folders.size === 0
    ? '<p class="hint mt-4">لا شيءَ هنا بعد — ارفع صورة، أو ولّد صورةً لمسوّدة، أو أضف ملفًّا إلى مجلّد Drive.</p>'
    : [...folders].map(([f, list]) => `<section class="mt-4" aria-label="${escapeHtml(f)}">
        <h2 class="lib-h">${escapeHtml(f)} <span class="count">${list.length}</span></h2>
        <div class="lib-grid">${list.map((a) => tile(a, d)).join('')}</div></section>`).join('')}`
}
