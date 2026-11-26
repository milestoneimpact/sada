/**
 * **مفرداتُ الحركة** (D-341، المرحلةُ الثانية من `docs/FLOW-PLAN.md`).
 *
 * كانت كلُّ شاشةٍ تسمّي حركتَها (`pb-land` · `wz-in` · `menu-in`). هنا خمسُ حركاتٍ مسمّاةٌ تُبنى من رموز `tokens.ts` الموجودة
 * (`--dur-1..3` · `--ease*` · `--stagger`) ولا رقمَ مدّةٍ جديدًا:
 *
 *   enter   ظهورُ عنصر (المفتاحُ `rise` القائم)      settle  تبدّلُ حال: نبضةٌ واحدة
 *   leave   خروجُه                                    lift    ما يُحمَل أو يُحوَّم عليه
 *   press   استجابةُ الزرّ (قائمةٌ في 07-controls)
 *
 * القيود: لا حركةَ فوق `--dur-3`، ولا حركةَ تؤخّر فعلًا (كلُّها على الدخول أو بعد الفعل)، وكلُّها تسكن لمن طلب تقليلَ الحركة بالقاعدة
 * العامّة في 12-extras. والحارسُ `motion.test.ts` يفشل على مدّةٍ حرفيّةٍ في `animation` أو `transition`.
 */
import { below } from '../tokens'

export const MOTION = `/* ═══ مفرداتُ الحركة (D-341) ═══ */
@keyframes leave{to{opacity:0; transform:scale(.96)}}
@keyframes settle{40%{transform:scale(1.08)}}
@keyframes toast-in{from{opacity:0; transform:translateY(calc(-1 * var(--s-3)))}}
@keyframes sheet-in{from{transform:translateX(calc(var(--dir) * -1 * 100%))}}
@keyframes sheet-up{from{transform:translateY(100%)}}
@keyframes scrim-in{from{opacity:0}}
.m-enter{animation:rise var(--dur-3) var(--ease-out) both}
.m-leave{animation:leave var(--dur-2) var(--ease) both}
.m-settle{animation:settle var(--dur-3) var(--ease-rise)}
/* الإشعارُ يدخل من حافّته، واللوحُ ينزلق من جهته (ومن الأسفل على الهاتف)، والستارُ يظهر لا يقفز */
/* (والإشعارُ يحمل «toast-in» في قاعدته في 03-head، والمصغَّرةُ المحمولةُ ارتفاعَها في قاعدتها في 12-extras: محدّدٌ واحدٌ لا يُعرَّف مرّتين) */
.rv-sheet[open]{animation:sheet-in var(--dur-3) var(--ease-out)}
@media${below('md')}{.rv-sheet[open]{animation-name:sheet-up}}
dialog[open]::backdrop{animation:scrim-in var(--dur-2) var(--ease)}
/* تدرّجُ الدخول: أوّلَ رسمٍ وحدَه — التحديثُ الحيّ يبدّل البطاقاتِ كلَّ ثوانٍ ولا تتراقص («data-seen» يكتبه السكربت بعد الرسم) */
#rv-root:not([data-seen]) .rv-cards>*,.lib-grid>*{animation:rise var(--dur-3) var(--ease-out) both}
/* وبعد أوّل رسمٍ لا تصعد البطاقةُ من جديد: كانت كلُّ بطاقةٍ تعيد «rise» مع كلّ تحديثٍ حيّ (كلَّ ثماني ثوانٍ وصدى يكتب) */
#rv-root[data-seen] .card{animation:none}
#rv-root:not([data-seen]) .rv-cards>:nth-child(2),.lib-grid>:nth-child(2){animation-delay:var(--stagger)}
#rv-root:not([data-seen]) .rv-cards>:nth-child(3),.lib-grid>:nth-child(3){animation-delay:calc(var(--stagger) * 2)}
#rv-root:not([data-seen]) .rv-cards>:nth-child(4),.lib-grid>:nth-child(4){animation-delay:calc(var(--stagger) * 3)}
#rv-root:not([data-seen]) .rv-cards>:nth-child(n+5),.lib-grid>:nth-child(n+5){animation-delay:calc(var(--stagger) * 4)}
/* lift: البطاقةُ ترتفع تحت المؤشّر، والمصغَّرةُ المحمولةُ ترتفع تحت الإصبع */
@media(hover:hover){
  .lib-grid>*{transition:box-shadow var(--dur-2) var(--ease), transform var(--dur-2) var(--ease)}
  .card.rv:hover,.lib-grid>:hover{box-shadow:var(--sh-2); transform:translateY(calc(-1 * var(--stroke)))}
}
/* ── الانتقالُ المشترك والدخولُ من حالٍ ابتدائيّة (D-401) ──────────────
   البطاقةُ في «التيّار» ورأسُ صفحة منشورها يحملان «id» نفسَه («vtName»)، و«attr(id type(<custom-ident>))» يجعله اسمَ الانتقال
   (Chromium)، و«auto» يفعل ذلك في Safari: فيتحوّل الصندوقُ من موضعه في القائمة إلى رأس الصفحة بين المستندين — بلا «style»
   (CSP يمنعه)، ومتصفّحٌ لا يعرفهما يُسقط التصريحَ فيبقى انتقالُ المحتوى القائم. والـ«id» فريدٌ في الصفحة أصلًا، فلا يتكرّر اسم. والعنوانُ «h1» باسمٍ ثابت فيبقى
   في موضعه ولا يتلاشى مع المحتوى. والمجموعةُ تتحرّك بـtransform وحده (لقطتان تتلاشيان، ولا تخطيط) */
.fd-card[id^="f-"]:not([id^="f-item-"]),.page-head[id]{view-transition-name:attr(id type(<custom-ident>))}
@supports (view-transition-name:auto) and (not (view-transition-name:attr(id type(<custom-ident>)))){
  .fd-card[id^="f-"]:not([id^="f-item-"]),.page-head[id]{view-transition-name:auto}
}
.page-head .txt h1{view-transition-name:page-title}
::view-transition-old(page-title){animation:none; opacity:0}
::view-transition-new(page-title){animation:none}
/* ‏الحوارُ وألواحُ «المزيد» والطيُّ المفتوح تدخل من حالٍ ابتدائيّة بـ«@starting-style»: تلاشٍ و‏8px من جهتها. واللوحُ الجانبيّ
   «.rv-sheet» له مفتاحُه أعلاه فيُستثنى (مالكٌ واحدٌ لكلّ خاصّيّة) */
dialog[open]:not(.rv-sheet){opacity:1; transform:none; transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
@starting-style{dialog[open]:not(.rv-sheet){opacity:0; transform:translateY(var(--s-2))}}
details.more-sheet[open]>.more-panel{opacity:1; transform:none; transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
@starting-style{details.more-sheet[open]>.more-panel{opacity:0; transform:translateY(var(--s-2))}}
details[open]:not(.more-sheet):not(.menu):not(.fab)>:not(summary){transition:transform var(--dur-2) var(--ease-out)}
@starting-style{details[open]:not(.more-sheet):not(.menu):not(.fab)>:not(summary){transform:translateY(calc(-1 * var(--s-1)))}}
`
