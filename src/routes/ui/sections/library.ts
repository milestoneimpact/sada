/**
 * «المكتبة ← الصور» (خطّة التصميم 5.8 · D-206) — **كلُّ صورةٍ جاهزةٍ في موضعٍ واحد**.
 *
 * كانت الصورةُ لا تُرى إلّا في طيّة بطاقة مسوّدتها، فمن أراد أن يعرف «ماذا ولّدتُ هذا الأسبوع» فتح البطاقاتِ
 * واحدةً واحدة. فهنا شبكةٌ بالصور، تحت كلٍّ منصّتُها وسطرٌ من نصّ مسوّدتها، **والصورةُ رابطٌ إلى بطاقتها**
 * (`#d-…` يفتح «المنشورات» وينزل إليها، `show()`) — فالأفعالُ (أعد التوليد، ارفض، حرّكها) تبقى حيث حرّاسُها.
 */
import { escapeHtml } from '../escape'
import { platformLabel } from '../../../lib/oauth/providers'
import { emptyState } from '../components/empty'
import type { MediaView } from './drafts'

/** ما تحتاجه الشبكةُ من المسوّدة — سطرٌ يعرّف لا البطاقةُ كلُّها. */
export interface GalleryDraft {
  readonly id: string
  readonly platform: string
  readonly text: string
}

const SNIP = 64

function snippet(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= SNIP ? one : one.slice(0, SNIP - 1) + '…'
}

export function imagesGallery(images: readonly MediaView[], drafts: readonly GalleryDraft[]): string {
  if (images.length === 0) {
    return emptyState({
      echo: true,
      title: 'لا صورةَ بعد',
      html: 'تُولَّد الصورةُ من بطاقة المسوّدة في «المنشورات» — <b>وهي نداءٌ مدفوع</b>، فلا تقع وحدَها.',
    })
  }
  const byId = new Map(drafts.map((d) => [d.id, d]))
  const cells = images.map((m) => {
    const d = byId.get(m.postId)
    const alt = d === undefined ? 'صورةُ منشور' : `صورةُ منشور ${platformLabel(d.platform)}`
    return `<a class="lib-img" href="#d-${escapeHtml(m.postId)}">
      <img src="/panel/media/${escapeHtml(m.id)}" alt="${escapeHtml(alt)}" loading="lazy" width="320" height="320">
      <span class="lib-cap">${d === undefined
        ? 'مسوّدةٌ لم تعد في القائمة'
        : `<b>${escapeHtml(platformLabel(d.platform))}</b> · ${escapeHtml(snippet(d.text))}`}</span>
    </a>`
  }).join('')
  // ‏بلا بطاقةٍ حولها: صورتان في بطاقةٍ بعرض الشاشة تتركان ثلثيها أرضًا فارغة (مدقّقُ «الجوفاء»، D-137)
  return `<p class="hint">الصورةُ تفتح بطاقةَ مسوّدتها، <b>وهناك تُعاد أو تُرفض أو تُحرَّك</b>.</p>
    <div class="lib-grid">${cells}</div>`
}
