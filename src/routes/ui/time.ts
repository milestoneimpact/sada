/**
 * الوقتُ كما يعيشه المالك (D-106) — **والرقمان حاضران معا**.
 *
 * ## ما وُجد عند القياس — وأكثرُه مبنيّ
 *
 * قالت `UX-5` إنّ المواعيد «تُعرَض بوجهٍ واحد». **فقِيست فوُجد نصفُ
 * البند مبنيّا**: نموذجُ الجدولة يحمل مرآةً محلّيّةً تحت الصندوق، وأزرارَ
 * الموعد السريع تحسب لحظةً محليّةً ثمّ تكتبها UTC (D-100).
 *
 * **والناقصُ كان في القراءة لا في الكتابة.** فمن جدول رأى الرقمين، ثمّ
 * قرأ موعدَه بعد ساعةٍ في بطاقة المسوّدة **بلا منطقةٍ أصلا**، وفي شاشة
 * المنصّة **بمنطقةٍ في `title` لا يراها إلّا من حوّم بالفأرة** — ولا فأرةَ
 * في الجوّال.
 *
 * وهي رابعُ مرّةٍ يكذّب فيها القياسُ بندا في الخطّة.
 *
 * ## والتحويلُ في المتصفّح — ولا منطقةَ تُخزَّن
 *
 * الخادمُ لا يعرف منطقةَ أحد، **وهذا صواب**: منطقةٌ تُخزَّن في إعدادٍ
 * تُنسى فتكذب بعد سفرٍ أو تحوّلٍ صيفيّ. **والمتصفّح يعرفها يقينا ويقرؤها
 * لحظتَها.**
 *
 * ## وبلا JavaScript يبقى النصُّ صحيحا
 *
 * يُرسَم `UTC` نصّا في الوسم، **ولا يفعل النصُّ البرمجيُّ إلّا أن يزيد
 * عليه** السطرَ المحلّيّ. فمن عُطّل عنده النصُّ قرأ `UTC` صريحةً موسومةً —
 * **لا فراغا ولا رقما بلا منطقة**، وهو أسوأُ الثلاثة.
 */
import { escapeHtml } from './shell'
import { parseSqliteUtc } from '../../lib/format'

/**
 * وسمُ موعد — **`UTC` مكتوبةٌ فيه، والمحلّيُّ يُضاف إليه**.
 *
 * و`datetime` بصيغة ISO لأنّها الصيغةُ التي يقرؤها `Date` في كلّ متصفّح،
 * **ولأنّ قارئ الشاشة يقرؤها تاريخا لا سلسلةَ أرقام**.
 */
export function whenTag(value: string | null, opts: { readonly label?: string } = {}): string {
  if (value === null) return ''
  const date = parseSqliteUtc(value)
  if (date === null) return escapeHtml(value)

  const iso = date.toISOString()
  const utc = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
  const head = opts.label === undefined ? '' : `${escapeHtml(opts.label)} `
  return `${head}<time class="when-t" datetime="${iso}" data-when-utc>` +
    `<b>${escapeHtml(utc)}</b> <span class="tz">UTC</span></time>`
}

/**
 * يقلب كلَّ وسمِ موعدٍ إلى سطرين: `UTC` كما هو، ثمّ المحلّيُّ تحته.
 *
 * **ولا `innerHTML`** (D-071): تُبنى العقدُ بـ `createElement` ويُكتب
 * النصُّ بـ `textContent`. والوسمُ يحمل تاريخا من الخادم لا من مستخدِم،
 * **لكنّ القاعدةَ لا تُخرَق لأنّ المصدرَ آمنُ اليوم** — فمصدرٌ يتبدّل غدا
 * لا يجد ثغرةً تنتظره.
 *
 * **وفشلُ `toLocaleString` لا يمحو شيئا**: متصفّحٌ بلا `Intl` عربيّةٍ
 * يُبقي `UTC` وحدها — وهي صحيحة.
 */
export const TIME_SCRIPT = `
(function(){
  var tags=document.querySelectorAll('time[data-when-utc]');
  if(tags.length===0)return;
  var tz='';
  try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
  tags.forEach(function(t){
    var at=new Date(t.getAttribute('datetime'));
    if(isNaN(at.getTime()))return;
    var said='';
    try{
      said=at.toLocaleString('ar-u-nu-latn',{weekday:'long',day:'numeric',month:'long',
        hour:'numeric',minute:'2-digit'});
    }catch(e){return;}
    if(said==='')return;
    var line=document.createElement('span');
    line.className='when-local';
    // ‏«بتوقيتك» لا اسمُ المنطقة: المالكُ يعرف أين هو، واسمٌ مثل
    // ‏Asia/Riyadh يُقرأ إعدادَ خادمٍ لا وقتَ إنسان. ويبقى في العنوان لمن سأل
    line.textContent=said+' بتوقيتك';
    if(tz!=='')line.title=tz;
    t.appendChild(line);
    t.classList.add('two');
  });
})();
`
