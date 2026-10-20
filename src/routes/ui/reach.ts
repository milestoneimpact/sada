/**
 * سطرُ المنصّة حيث تُختار — **أمتّصلة، ومَن يرى ما يُنشر عليها** (D-190).
 *
 * قال المالك: «TikTok غير متّصل، يجب أن يكون واضحًا». وكان مربّعُ TikTok في صفّ المقطع
 * مؤشَّرًا وتحته «لا يراه غيرك حتّى تنشره أنت من تطبيق TikTok» — جملةٌ عن نشرٍ لن يقع،
 * لحسابٍ لم يُربط. فيُقال الأوّلُ أوّلًا: **غيرُ متّصلٍ ومعه رابطُ ربطه**، أو انقطع ربطُه؛
 * ثمّ — للمتّصل وحدَه — مَن يرى المقطع: خاصٌّ لأنّ المنصّةَ لم تُجِز التطبيق، أو للعامّة
 * بقرار المالك بعد الإجازة. ويقرؤه صفُّ المقطع و«اكتب من فكرتك» بنصٍّ واحد.
 */
import { escapeHtml } from './escape'
import { statusBadge } from './components/badge'
import { platformLabel } from '../../lib/oauth/providers'
import type { LinkState } from '../../lib/channels'
import { tiktokNeedsScope, UNAUDITED, type Reach } from '../../lib/media/uploads'

/** أين يُصلَح الربط — صفحةُ المنصّة نفسُها، وفي رأسها زرُّ الربط وحالُه. */
function channelHref(platform: string): string {
  return `/panel/channels/${encodeURIComponent(platform)}`
}

export function linkLine(platform: string, link: LinkState, reach: Reach): string {
  const label = platformLabel(platform)
  if (link === 'none') {
    return `<span>${statusBadge('warn', '!', 'غير متّصل')} <a class="tap" href="${escapeHtml(channelHref(platform))}"
      aria-label="${escapeHtml(`اربط ${label}`)}">اربطه</a></span>`
  }
  if (link === 'relink') {
    return `<span>${statusBadge('bad', '▲', 'انقطع ربطه')} <a class="tap" href="${escapeHtml(channelHref(platform))}"
      aria-label="${escapeHtml(`أعد ربط ${label}`)}">أعد ربطه</a></span>`
  }
  if (platform === 'youtube' || platform === 'tiktok') {
    if (reach[platform]) return statusBadge('ok', '●', 'متّصل · يُنشر للعامّة')
    // ‏قلب المالكُ العلنيَّ والحسابُ بلا `video.publish`: الناشرُ يرسل إلى الصندوق — فلا «للعامّة» (D-190)
    if (platform === 'tiktok' && tiktokNeedsScope(reach)) {
      return `${statusBadge('warn', '!', 'متّصل · يصل صندوقَك')}
      <span class="ago">ينقص <bdi dir="ltr">video.publish</bdi> — <a class="tap" href="${escapeHtml(`${channelHref(platform)}?tab=setup`)}"
        aria-label="اربط TikTok من جديد وامنح video.publish">اربطه من جديد وامنحه</a>.</span>`
    }
    return `${statusBadge('warn', '!', platform === 'youtube' ? 'متّصل · يصل خاصًّا' : 'متّصل · لا يراه غيرك')}
      <span class="ago">${escapeHtml(`${UNAUDITED[platform]} — ${platform === 'youtube'
        ? 'تنشره أنت من YouTube Studio'
        : 'تنشره أنت من تطبيق TikTok'}.`)}</span>`
  }
  return statusBadge('ok', '●', 'متّصل')
}

/**
 * سطرُ الاختيار تحت مربّعات المنصّات (D-190) — **الحكمُ قبل الضغط، والسببُ في موضعه**.
 *
 * غيرُ المتّصل لا يُؤشَّر، فقد تكون المربّعاتُ كلُّها فارغة: كان الخادمُ يردّ «اختر منصّةً»
 * ويعود بحقلٍ فارغ فيضيع ما كُتب. فالسكربتُ يمنع الإرسالَ بلا مربّعٍ ويكتب السببَ في
 * `data-pick-msg`، والخادمُ يبقى حارسًا لمن لا سكربتَ عنده. و`made` ما يقع لغير المتّصلة.
 */
export function pickLine(made: string): string {
  return `<div class="row"><span class="ago">اختر منصّةً — وغير المتّصلة ${escapeHtml(made)} حتّى تربطها.</span>
      <span class="st bad" data-pick-msg role="alert" hidden></span></div>`
}
