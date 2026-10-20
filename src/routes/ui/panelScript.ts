import { X_HEAVY, X_LIGHT_RANGES, X_URL_LENGTH } from '../../lib/draft/length'
import { B64URL_SCRIPT, PASSKEY_TEXT_SCRIPT } from './scripts'
import { MOVED_ANCHORS, MOVED_PREFIXES } from '../../lib/nav/panes'

/**
 * نصُّ اللوحة الجاري في المتصفّح.
 *
 * **ومُصدَّرٌ ليُختبَر لا ليُستورَد**: فيه عدّادٌ يجب أن يعدّ كما يعدّ
 * الخادم (D-071)، **وعدّادٌ يخالفه أسوأُ من لا عدّاد** — يُري المالكَ
 * أحمرَ على منشورٍ مقبول. فيُنتزَع في الاختبار ويُقارَن حالةً حالة.
 */
export const SCRIPT = `${B64URL_SCRIPT}${PASSKEY_TEXT_SCRIPT}
(function(){
  /*
   * «الروابطُ التي تُخطَف هي روابطُ المرساة وحدها» (D-087).
   *
   * كان المحدّدُ «nav.tabs a» — أي كلَّ رابطٍ في الشريط. وفي الشريط
   * روابطُ صفحاتٍ حقيقيّة: «ما عليك» و«التقرير» وشاشةُ كلّ منصّة. فكان
   * «preventDefault» يمنع انتقالَها، ثمّ «show» يبحث عن لوحٍ اسمُه
   * «panel/tasks» فلا يجده، «فيرتدّ إلى أوّل لوحٍ — نظرة عامّة».
   *
   * فكلُّ زرِّ منصّةٍ وكلُّ صفحةٍ في الشريط كانت تعيد المالكَ إلى نظرة
   * عامّة. «والزرُّ الذي يعمل خطأً أسوأُ من زرٍّ لا يعمل»: هذا يُشتكى
   * منه، وذاك يُظنّ به أنّ الصفحةَ فارغة.
   */
  var all=document.querySelectorAll('nav.tabs a');
  var tabs=Array.prototype.filter.call(all,function(a){
    return (a.getAttribute('href')||'').charAt(0)==='#';
  });
  var panes=document.querySelectorAll('section[data-pane]');
  // ‏دالّةٌ واحدةٌ لثلاثة مستدعين (النقر، والمرساة، والتحميل): تُظهر اللوحَ
  // ‏وتعلّم التبويبَ وتضبط عنوانَ الشريط، وإن كان السببُ فعلًا من المالك
  // ‏نقلت التركيزَ إلى رأس اللوح — فلا يبقى في الرافدة ‏٢٣ ضغطةَ Tab عن
  // ‏المحتوى، ولا يبقى «نظرة عامّة» فوق الأمان عند رابطٍ عميق (D-149)
  var head=document.getElementById('pane-title');
  // ‏ولا لوحَ فلا تبديل: سطرٌ يرمي هنا كان يُسقط ما بعده كلَّه (D-160)
  var first=panes.length>0?panes[0].dataset.pane:null;
  // ‏ومرساةُ جزءٍ من بطاقة («#s-…» نموذجُ جدولتها، «#i-…» لوحُ صورتها) لا تُرسَم على كلّ
  // ‏بطاقة: معتمَدٌ بلا قناةٍ لا نموذجَ له، ومن له صورةٌ لا زرَّ توليد. فتنزل إلى البطاقة
  // ‏نفسِها «#d-…» — لا ترتدّ إلى الرئيسيّة فيُقرأ الرابطُ معطوبًا (D-046)
  function target(id){
    var el=document.getElementById(id);
    if(!el&&/^[si]-./.test(id))el=document.getElementById('d-'+id.slice(2));
    return el;
  }
  /*
   * ‏**والمحرّرُ لا يُفتَح إلّا بطلب** (D-199). كان «?open=<id>» يبقى في العنوان بعد كلّ فعلٍ من المحرّر،
   * ‏فالتحميلُ والرجوعُ والتنقّلُ بين الألواح يفتحه من جديد والمالكُ لم يطلبه. فيُرفَع من العنوان بعد أن
   * ‏يُرسَم (والأفعالُ فيه تعيده بـ«from=editor»)، ويُطوى المحرّرُ متى انتقل المالكُ إلى غيره.
   */
  function shutEditor(){
    var ed=document.getElementById('ed'); if(!ed)return;
    var split=ed.parentElement, listEl=split&&split.querySelector('.posts-list');
    if(listEl&&split.classList.contains('posts-split')){
      while(listEl.firstChild)split.parentNode.insertBefore(listEl.firstChild,split);
      split.parentNode.removeChild(split);
    }else ed.parentNode.removeChild(ed);
  }
  if(/[?&]open=/.test(location.search)&&history.replaceState){
    history.replaceState(null,'',location.pathname+location.search.replace(/([?&])open=[^&]*&?/,'$1').replace(/[?&]$/,'')+location.hash);
  }
  var MOVED=${JSON.stringify(MOVED_ANCHORS)}, MOVED_P=${JSON.stringify(MOVED_PREFIXES)};
  function movedPath(id){
    if(Object.prototype.hasOwnProperty.call(MOVED,id))return MOVED[id];
    for(var i=0;i<MOVED_P.length;i++)if(id.indexOf(MOVED_P[i][0])===0)return MOVED_P[i][1];
    return null;
  }
  function show(id,push,focus){
    if(first===null)return;
    if(focus&&!/^ed(-|$)/.test(id))shutEditor();
    var asked=id;
    // ‏ومرساةُ ما في اللوح تفتح لوحَها ثمّ تنزل إليها: فعلٌ يعود إلى البطاقة
    // ‏لا إلى رأس لوحٍ طولُه آلافُ البكسلات. وكانت «#d-…» وحدَها، فـ«#videos»
    // ‏بعد الرفع و«#plan-import» من المعاينة و«#write» تُخفي الألواحَ كلَّها
    // ‏وترتدّ إلى الرئيسيّة — فالمعرّفُ يُطلَب أيًّا كان، ولوحُه من موضعه
    var isPane=Array.prototype.some.call(panes,function(p){return p.dataset.pane===id;});
    var card=isPane?null:target(id);
    // ‏ومرساةٌ لوحُها في صفحةٍ أخرى (D-211): «/panel#settings» المحفوظةُ تذهب إلى «/panel/settings#settings»، والخريطةُ
    // ‏من «lib/nav/panes» نفسِها التي يقرؤها الخادم. عند التحميل استبدالٌ لا يُبقي خطوةً ميّتةً في الرجوع
    if(!isPane&&!card&&id){var to=movedPath(id);
      if(to&&to!==location.pathname){if(push||focus)location.assign(to+'#'+id); else location.replace(to+'#'+id); return;}}
    var host=card?card.closest('section[data-pane]'):null;
    if(card&&!host){
      // ‏ومرساةٌ خارجَ الألواح («#main» من رابط التخطّي) لا تبدّل اللوحَ المفتوح:
      // ‏المتصفّحُ ينزل إليها وحدَه. وعند التحميل لا مفتوحَ، فالأوّل
      if(Array.prototype.some.call(panes,function(p){return !p.hidden;}))return;
      card=null; id=first;
    }
    if(host)id=host.dataset.pane;
    var found=false, pane=null;
    panes.forEach(function(p){var m=p.dataset.pane===id; p.hidden=!m; if(m){found=true; pane=p;}});
    // ‏واللوحُ المفتوحُ سِمةٌ على الجسد: الزرُّ العائمُ يظهر في اثنين منها وحدهما (D-208)
    if(found)document.body.setAttribute('data-pane',id);
    if(!found){if(id!==first)show(first,push,focus); return;}
    tabs.forEach(function(t){
      var m=t.getAttribute('href')==='#'+id;
      if(m){t.setAttribute('aria-current','page');
        var sp=t.querySelector('span');
        if(sp&&head){head.textContent=sp.textContent; document.title=sp.textContent+' — صدى';}
      }else{t.removeAttribute('aria-current');}
    });
    // ‏وفي اللوح أقسامٌ («المنشورات»: المسوّداتُ واكتب والفيديو والخطّة، D-195): يظهر القسمُ الذي
    // ‏يحوي المرساةَ — «#idea» تفتح «اكتب» و«#d-…» تفتح «المسوّدات» — أو الأوّلُ حين تُطلَب اللوحةُ نفسُها
    var subs=pane?pane.querySelectorAll('[data-sub]'):[];
    if(subs.length>0){
      var on=card?(card.hasAttribute('data-sub')?card:card.closest('[data-sub]')):null;
      if(!on)on=subs[0];
      Array.prototype.forEach.call(subs,function(s){s.hidden=s!==on;});
      Array.prototype.forEach.call(pane.querySelectorAll(':scope>nav.tab-bar a'),function(t){
        if(t.getAttribute('href')==='#'+on.id)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current');});
      // ‏والقسمُ نفسُه مرساةُ تبويبه: لا ينزل إليه فوق الشريط، بل يبقى الشريطُ ظاهرًا
      if(card===on){if(push&&history.replaceState)history.replaceState(null,'','#'+asked);
        var bar=pane.querySelector(':scope>nav.tab-bar'); if(bar&&focus)bar.scrollIntoView({block:'nearest'}); return;}
    }
    if(push&&history.replaceState)history.replaceState(null,'','#'+id);
    // ‏و«tabindex=-1» لما لا يُركَّز عليه وحدَه: حقلٌ أو زرٌّ يُعلَّم به يخرج من ترتيب Tab
    // ‏وما في طيّةٍ مغلقة («تفاصيلُ» بطاقة المسوّدة، D-195) تُفتح طيّاتُه قبل النزول إليه
    if(card){for(var dt=card.parentElement;dt;dt=dt.parentElement){if(dt.tagName==='DETAILS')dt.open=true;}}
    if(card&&host){if(card.tabIndex<0)card.setAttribute('tabindex','-1'); card.scrollIntoView({block:'start'});
      card.focus({preventScroll:true});
      // ‏وما فوق البطاقة يتبدّل طولُه حتّى يكتمل التحميل (الخطوطُ وسكربتُ الفرز والصور)، فتنزل البطاقةُ
      // ‏عن رأس الشاشة بعد النزول إليها: ‏١٥٥١px على الهاتف لـ«#d-…» (D-195). فتُعاد مرّةً بعد التحميل
      if(document.readyState!=='complete'){var again=card;
        window.addEventListener('load',function(){again.scrollIntoView({block:'start'});},{once:true});}
      return;}
    if(focus&&pane){var hd=pane.querySelector('h1,h2');
      if(hd){hd.setAttribute('tabindex','-1'); hd.focus();}}
  }
  tabs.forEach(function(t){t.addEventListener('click',function(e){
    e.preventDefault(); show(t.getAttribute('href').slice(1),true,true);
  });});
  // ‏و«?open=…» بلا مرساةٍ (رابطٌ كُتب يدًا) يفتح قسمَ المحرّر، لا الرئيسيّةَ والمحرّرُ مخفيٌّ خلفها (D-198)
  show((location.hash||'').slice(1)||(document.getElementById('ed')?'sub-list':first),false,false);
  /*
   * ‏والمرساةُ تُتبَع من أيّ مكان (D-105).
   *
   * ‏كان اللوحُ يُبدَّل بنقر الرافدة وحدَها. ولوحةُ الأوامر تُصدر روابطَ
   * ‏عاديّةً «#posts»، ورابطٌ كهذا يبدّل المرساةَ ولا يُبدّل اللوحَ —
   * ‏فيُقرأ الأمرُ منفَّذا والصفحةُ لم تتحرّك. وهي علّةُ D-046 نفسُها:
   * ‏زرٌّ يعمل خطأً أسوأُ من زرٍّ لا يعمل.
   *
   * ‏وكذلك من كتب مرساةً في شريط العنوان، أو عاد بزرّ الرجوع.
   */
  window.addEventListener('hashchange',function(){
    show((location.hash||'').slice(1)||first,false,true);
  });

  // ‏وزرُّ النسخ (D-126) في u.js الذي تحمله كلُّ صفحة، لا هنا: نسختان في
  // ‏اللوحة تربطان بالزرّ مستمعَين، فيبقى «نُسخ» عليه لا يعود (D-160)

  // عدّادُ المسوّدة يتحرّك مع الكتابة: طولٌ يُعرف بعد الإرسال يأتي متأخّرا
  // بنداءٍ كامل. والحدُّ من data-limit لا من ثابتٍ هنا — منصّةٌ تُضاف
  // تجلب حدَّها معها
  //
  // والعدّادُ يعدّ كما تعدّ المنصّة (D-071): كان يعدّ محارف
  // JavaScript، فيُري المالكَ أحمرَ على منشورٍ تقبله X، ويُريه أخضرَ
  // على آخرَ ترفضه. وعدّادٌ يخالف الخادمَ أسوأُ من لا عدّاد.
  //
  // والقاعدةُ واحدةٌ في الموضعين: ثوابتُها مُمرَّرةٌ من «length.ts»
  // أدناه، فلا رقمَ مكتوبٌ هنا يشيخ وحدَه.
  var URL_LEN=${X_URL_LENGTH}, HEAVY=${X_HEAVY};
  var LIGHT=${JSON.stringify(X_LIGHT_RANGES)};
  var RE_URL=/https?:\\/\\/\\S+/gu;
  var RE_EMOJI=/\\p{RI}\\p{RI}|\\p{Extended_Pictographic}(?:\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)/gu;
  function weigh(cp){
    for(var i=0;i<LIGHT.length;i++){if(cp>=LIGHT[i][0]&&cp<=LIGHT[i][1])return 1;}
    return HEAVY;
  }
  function xLen(text){
    var total=0;
    var rest=text.replace(RE_URL,function(){total+=URL_LEN; return '';});
    var plain=rest.replace(RE_EMOJI,function(){total+=HEAVY; return '';});
    for(var ch of plain)total+=weigh(ch.codePointAt(0)||0);
    return total;
  }
  document.querySelectorAll('textarea.draft-text').forEach(function(t){
    var out=t.parentNode.querySelector('.draft-len'); if(!out)return;
    var b=out.querySelector('b'); var lim=+t.dataset.limit||0; var tgt=+t.dataset.target||0;
    // و LinkedIn على عدّ المحارف: لا قاعدةَ وزنٍ منشورةً لها فلا تُخترَع
    var weighted=t.dataset.count==='x';
    function tick(){
      var v=t.value.trim();
      var n=weighted?xLen(v):v.length; if(b)b.textContent=n;
      out.className='draft-len'+(n>lim?' bad':n>tgt?' warn':'');
    }
    t.addEventListener('input',tick); tick();
  });

  // تأكيدٌ قبل فعلٍ يوقف النظام كلّه
  // ‏والربطُ لكلّ عنصرٍ دالّةٌ يُنادى بها عند التحميل ولما يُبدَّل بلا تحميل (D-207: «wire»)
  function bindConfirm(f){
    f.addEventListener('submit',function(e){
      if(!confirm(f.dataset.confirm)){e.preventDefault(); return;}
      var b=f.querySelector('button'); if(b){b.disabled=true; b.textContent='…';}
    });
  }
  document.querySelectorAll('form[data-confirm]').forEach(bindConfirm);
  /*
   * ‏ولا إرسالَ بلا منصّة (D-190): غيرُ المتّصلة لا تُؤشَّر، فقد تكون المربّعاتُ كلُّها فارغة،
   * ‏وردُّ الخادم «اختر منصّةً» يعود بحقلٍ فارغ فيضيع ما كُتب. فيُمنع هنا ويُقال السببُ في
   * ‏موضعه — **ويُسجَّل قبل معالج «مشغول»**: ذاك يقرأ ‹defaultPrevented› فلا يبقى النموذجُ مشغولًا.
   */
  document.querySelectorAll('form').forEach(function(f){
    var boxes=f.querySelectorAll('input[type=checkbox][name=platform]:not([disabled])');
    if(!boxes.length)return;
    var msg=f.querySelector('[data-pick-msg]');
    f.addEventListener('submit',function(e){
      if(Array.prototype.some.call(boxes,function(b){return b.checked;})){if(msg)msg.hidden=true; return;}
      e.preventDefault();
      if(msg){msg.hidden=false; msg.textContent='اختر منصّةً واحدةً على الأقلّ — وغيرُ المتّصلة تُختار ولا تُجدوَل حتّى تربطها.';}
      boxes[0].focus();
    });
  });
  // ‏وEnter في عنوان YouTube لا يُرسل «أنشئ المنشورات» (D-190): كان تعديلُ العنوان ثمّ Enter
  // ‏يُنشئ منشوراتِ كلِّ منصّةٍ مؤشَّرة قبل أن تُقرأ حقولُها تحته
  document.querySelectorAll('input[name=title_youtube]').forEach(function(i){
    i.addEventListener('keydown',function(e){if(e.key==='Enter')e.preventDefault();});
  });
  // زرٌّ مضغوط لا يُضغط مرّتين — نداءٌ مدفوع لا يُكرَّر بنقرةٍ عصبيّة.
  //
  // والنصُّ يبقى وتُضاف دوّامة: كان النصُّ يُستبدَل فيضيع ما كان
  // مكتوبا، ويسأل الضاغطُ نفسَه ماذا ضغط. والنداءُ مدفوع فالسؤال ليس
  // هيّنا. والزرُّ المضغوط وحده يدور، لا كلُّ أزرار النموذج.
  function bindBusy(f){
    var pressed=null;
    // ‏وأزرارُه التي خارجَه بسِمة «form» (شريطُ المساعد، D-218) منه: تُعلَّم مضغوطةً وتُعطَّل كأخواتها
    var btns=function(){var l=Array.prototype.slice.call(f.querySelectorAll('button'));
      if(f.id)l=l.concat(Array.prototype.slice.call(document.querySelectorAll('button[form="'+f.id+'"]')));return l;};
    btns().forEach(function(b){
      b.addEventListener('click',function(){pressed=b;});
    });
    f.addEventListener('submit',function(e){
      // ‏الإرسالُ الثاني يُمنَع بعلَمٍ لا بتعطيل الزرّ المضغوط: زرٌّ يُعطَّل يُسقط
      // ‏التركيزَ إلى body ولا يُقرأ. والنموذجُ يقول «مشغول» ورسالتُه تُعلَن (D-149)
      if(f.getAttribute('aria-busy')==='true'){e.preventDefault(); return;}
      // ‏ومن ألغى التأكيدَ أو منعه المعطّلُ لم يُرسِل — فلا يبقى النموذجُ «مشغولًا» بأزرارٍ معطّلة (D-189)
      if(e.defaultPrevented)return;
      var b=pressed||btns()[0]||null;
      f.setAttribute('aria-busy','true');
      btns().forEach(function(x){if(x!==b)x.disabled=true;});
      // ‏والزرُّ المضغوطُ «مشغولٌ» بسِمته (خطّة التصميم 7.1): دوّارةُ «.btn[aria-busy]» والعرضُ ثابت
      if(b){b.setAttribute('data-busy-on','1'); b.setAttribute('aria-busy','true'); b.setAttribute('aria-disabled','true');
        b.setAttribute('aria-label',(b.textContent||'').trim()+' — '+f.dataset.busy);}
      var st=document.getElementById('flash');
      if(st&&f.dataset.busy){var p=document.createElement('p'); p.className='busy-note'; p.textContent=f.dataset.busy; st.appendChild(p);}
    });
  }
  document.querySelectorAll('form[data-busy]').forEach(bindBusy);

  /*
   * ‏والإشعارُ يطفو ويُغلَق (الخطّة 7.8).
   *
   * ‏الفعلُ يعود إلى بطاقته في وسط اللوح، والإشعارُ في رأس المحتوى — فكان يُكتب حيث
   * ‏لا يُرى: «الملفُّ ليس UTF-8» عند ‏-5747px، والمالكُ يرى البطاقةَ نفسَها كأنّ شيئًا
   * ‏لم يقع. فيطفو هنا، ومعه «أغلق». ويختفي وحدَه بعد ستّ ثوانٍ، ويقف العدُّ ما دام
   * ‏المؤشّرُ أو التركيزُ أو الإصبعُ عليه (WCAG 2.2.1). **والخطأُ لا يذهب وحدَه**: يبقى
   * ‏حتّى يُغلَق، ويُعلَن تنبيهًا.
   *
   * ‏**وما فيه نموذجٌ لا يذهب وحدَه كذلك** (مراجعة ر-0 · D-100). «تراجَع» البابُ الوحيدُ إلى
   * ‏رفضٍ خاطئ، و«ولا عدّادَ ثوانٍ» قرارٌ مكتوب: نافذتُه نافذةُ الإشعار. وكانت عشرُ ثوانٍ تنفد
   * ‏قبل أن يبلغه لوحُ المفاتيح — عشرون Shift+Tab من البطاقة. **وما بقي يُعلَن**: نصٌّ جاء مع
   * ‏الصفحة لا يقرؤه قارئُ الشاشة، فيُعاد إدراجُه في المنطقة الحيّة بعد التحميل. و«أغلق» يعيد
   * ‏التركيزَ إلى البطاقة بلا تمرير، لا إلى رأس الصفحة.
   *
   * ‏**وموضعُه بعد ربط «data-busy»**: نموذجُ «تراجَع» يُفصَل لحظةً ليُعاد إدراجُه، و«querySelectorAll»
   * ‏لا يرى ما فُصل — فلو سبقه لأُرسل «تراجَع» مرّتين بنقرتين.
   */
  var flashBox=document.getElementById('flash');
  // ‏والإشعارُ يُسلَّح بدالّة (D-207): يُستدعى عند التحميل، ويُستدعى لإشعارٍ جاء مع فعلٍ بلا تحميل
  function armToast(note,fresh){
    var bad=note.classList.contains('bad');
    var keep=bad||!!note.querySelector('form');
    if(bad)note.setAttribute('role','alert');
    var shut=document.createElement('button');
    shut.type='button'; shut.className='btn btn-secondary btn-sm toast-x'; shut.textContent='أغلق';
    shut.setAttribute('aria-label','أغلق الإشعار');
    note.appendChild(shut);
    var timer=0;
    var drop=function(){clearTimeout(timer); if(note.parentNode)note.parentNode.removeChild(note);};
    shut.addEventListener('click',function(){
      drop();
      var back=target((location.hash||'').slice(1))||document.getElementById('main');
      if(back){if(back.tabIndex<0)back.setAttribute('tabindex','-1'); back.focus({preventScroll:true});}
    });
    if(keep){
      if(!fresh){
        flashBox.removeChild(note);
        setTimeout(function(){flashBox.appendChild(note);},150);
      }
    }else{
      var arm=function(){clearTimeout(timer); timer=setTimeout(drop,6000);};
      var hold=function(){clearTimeout(timer);};
      note.addEventListener('mouseenter',hold); note.addEventListener('mouseleave',arm);
      note.addEventListener('focusin',hold); note.addEventListener('focusout',arm);
      note.addEventListener('touchstart',hold,{passive:true});
      note.addEventListener('touchend',arm,{passive:true});
      arm();
    }
  }
  if(flashBox){
    flashBox.classList.add('toast');
    var note0=flashBox.querySelector('.toast-note');
    if(note0)armToast(note0,false);
  }

  /*
   * ‏**أفعالُ البطاقة بلا تحميل** (خطّة التصميم 7.8 و11.5(و) · D-207).
   *
   * ‏«اعتمد» و«ارفض» و«تراجَع» كانت تعيد رسمَ الصفحة كلِّها وتنزل إلى البطاقة بمرساتها: ثانيةٌ من البياض على
   * ‏الهاتف لكلّ قرار، والقرارُ اليوميُّ عشرةُ قرارات. فالنموذجُ المعلَّم «data-swap» يُرسَل بـfetch إلى المسار
   * ‏نفسِه، **والخادمُ لا يتغيّر**: يُنفّذ ويضع الإشعارَ ويحوّل إلى اللوحة كما كان، فيُقرأ ردُّه صفحةً وتُنقل منها
   * ‏ثلاثةُ أشياء: البطاقةُ نفسُها، وأعدادُ الرافدة والتبويبات، والإشعارُ بـ«تراجَع» (وحكمُه في الخادم: لا تراجعَ
   * ‏بعد محاولة نشر، D-004). **وكلُّ ما يخرج عن المتوقَّع يعود إلى الإرسال العاديّ** — ردٌّ ليس لوحةً (جلسةٌ
   * ‏انتهت فصفحةُ الدخول) يُفتح كما هو، وما سقط بعد خروج الطلب يعيد تحميلَ اللوحة بـGET ولا يُعيد الإرسال.
   */
  // ‏ما يُربط على عنصرٍ بعينه يُربط من جديد على ما يُبدَّل بلا تحميل — وإلّا جاءت البطاقةُ بزرّ «غدًا 9ص»
  // ‏لا يفعل شيئًا، ونموذجٍ يُرسَل مرّتين بنقرتين. وبترتيب التحميل: التأكيدُ قبل «مشغول» (يقرأ defaultPrevented)
  function wire(root){
    root.querySelectorAll('form[data-confirm]').forEach(bindConfirm);
    root.querySelectorAll('form[data-busy]').forEach(bindBusy);
    root.querySelectorAll('.quick').forEach(bindQuick);
  }
  // ‏و«المزيد» يُغلق بعد اختيارٍ منه، وبضغطةٍ خارجه، وبـEsc — ورقةٌ تبقى مفتوحةً فوق اللوح الذي فُتح تحتها تحجبه (D-208)
  document.querySelectorAll('details.more-sheet,details.fab').forEach(function(m){
    m.querySelectorAll('a,button').forEach(function(x){x.addEventListener('click',function(){m.open=false;});});
    document.addEventListener('click',function(e){if(m.open&&!m.contains(e.target))m.open=false;});
    m.addEventListener('keydown',function(e){if(m.open&&e.key==='Escape'){m.open=false; var s=m.querySelector('summary'); if(s)s.focus();}});
  });
  function unbusy(f){
    f.removeAttribute('aria-busy');
    f.querySelectorAll('button').forEach(function(x){x.disabled=false;
      if(x.getAttribute('data-busy-on')){x.removeAttribute('data-busy-on'); x.removeAttribute('aria-busy');
        x.removeAttribute('aria-disabled'); x.removeAttribute('aria-label');}});
    if(flashBox)flashBox.querySelectorAll('.busy-note').forEach(function(n){n.remove();});
  }
  // ‏إشعارٌ يُرسم في المتصفّح — بالأصناف نفسِها التي يرسمها الخادم (components/toast)
  // ‏واسمُها غيرُ «say»: سكربتُ مفاتيح المرور بعدها يعلن «var say» في النطاق نفسِه فيغلبها (أمسكه الفحصُ الحيّ)
  function toastSay(tone,text){
    if(!flashBox)return;
    var n=document.createElement('div'); n.className='toast-note '+tone;
    var t=document.createElement('span'); t.className='toast-t'; t.textContent=text; n.appendChild(t);
    flashBox.innerHTML=''; flashBox.appendChild(n); armToast(n,true);
  }
  function fail(text){toastSay('bad',text);}

  /*
   * ‏**بلا اتّصال** (خطّة التصميم 7.11): لا عملَ بلا اتّصال ولا Service Worker — اللوحةُ «no-store» عمدًا، وقرارُ نشرٍ
   * ‏لا يُؤجَّل إلى عودة الشبكة. فشريطٌ واحدٌ محايد أعلى المحتوى، **وأزرارُ الإرسال تُعطَّل بسببٍ مكتوب**، ثمّ «عاد
   * ‏الاتّصال» وتعود الأزرارُ التي عطّلها هو وحدَها. ولا يُرسَل شيءٌ تلقائيًّا.
   */
  var offBar=null;
  function setOffline(off){
    var main=document.getElementById('main'); if(!main)return;
    if(off){
      if(!offBar){
        offBar=document.createElement('div'); offBar.className='outcome warn mb-3'; offBar.setAttribute('role','status');
        offBar.innerHTML='<span class="kv-k">بلا اتّصال</span><span class="kv-v">لا اتّصالَ بالإنترنت. ما تكتبه في المحرّر محفوظٌ على هذا الجهاز، والأزرارُ تعود حين يعود الاتّصال.</span>';
        main.insertBefore(offBar,main.firstChild);
      }
      document.querySelectorAll('form[method=POST] button[type=submit],button[type=submit][form]').forEach(function(b){
        if(b.disabled)return; b.disabled=true; b.setAttribute('data-off','1'); b.title='بلا اتّصال';});
    }else{
      if(offBar){offBar.remove(); offBar=null;}
      document.querySelectorAll('button[data-off]').forEach(function(b){b.disabled=false; b.removeAttribute('data-off'); b.removeAttribute('title');});
    }
  }
  window.addEventListener('offline',function(){setOffline(true);});
  window.addEventListener('online',function(){setOffline(false); toastSay('ok','عاد الاتّصال.');});
  if(navigator.onLine===false)setOffline(true);

  /*
   * ‏**نصُّ المحرّر محفوظٌ على الجهاز** (7.11): كلَّ ثانيتين من الكتابة في «sada-draft:<id>»، ونصُّ المنشور وحدَه. فإن
   * ‏عاد المالكُ ونصُّ الجهاز غيرُ نصّ الخادم قيل له متى كتبه وخُيّر؛ وإن تساويا (حُفظ) مُحي. ولا يُرسل شيئًا وحدَه.
   */
  var edT=document.getElementById('ed-txt'), edBox=document.getElementById('ed');
  if(edT&&edT.tagName==='TEXTAREA'&&edBox&&edBox.dataset.post){
    var dKey='sada-draft:'+edBox.dataset.post, kept=null;
    try{kept=JSON.parse(localStorage.getItem(dKey)||'null');}catch(e){kept=null;}
    if(kept&&typeof kept.t==='string'){
      if(kept.t===edT.value){try{localStorage.removeItem(dKey);}catch(e){}}
      else{
        var at='';
        try{at=new Date(kept.at).toLocaleTimeString('ar-u-nu-latn',{hour:'numeric',minute:'2-digit'});}catch(e){}
        var row=document.createElement('p'); row.className='hint'; row.setAttribute('role','status');
        row.appendChild(document.createTextNode('لديك نصٌّ لم يُحفظ'+(at?' من '+at:'')+' على هذا الجهاز. '));
        var take=document.createElement('button'); take.type='button'; take.className='btn btn-secondary btn-sm'; take.textContent='استعده';
        var drop=document.createElement('button'); drop.type='button'; drop.className='btn btn-quiet btn-sm'; drop.textContent='تجاهله';
        row.appendChild(take); row.appendChild(document.createTextNode(' ')); row.appendChild(drop);
        edT.parentNode.insertBefore(row,edT);
        take.addEventListener('click',function(){edT.value=kept.t; edT.dispatchEvent(new Event('input')); row.remove(); edT.focus();});
        drop.addEventListener('click',function(){try{localStorage.removeItem(dKey);}catch(e){} row.remove(); edT.focus();});
      }
    }
    var dTimer=0;
    edT.addEventListener('input',function(){
      clearTimeout(dTimer);
      dTimer=setTimeout(function(){try{localStorage.setItem(dKey,JSON.stringify({t:edT.value,at:Date.now()}));}catch(e){}},2000);
    });
    /*
     * ‏**ويُحفظ على الخادم وحدَه** (D-227): بعد ثانيةٍ ونصف من آخر حرف يُرسل النصُّ بـ«do=save» و«auto=1»، ويُقال
     * ‏«حُفظ» بجوار العنوان. فلا يُرى زرُّ «احفظ» بعد أن يعمل هذا؛ وبلا سكربت يبقى الزرُّ كما كان.
     */
    var edF=document.getElementById('ed-form');
    if(edF&&edF.getAttribute('action')==='/panel/drafts/decide'&&window.fetch){
      var mark=document.createElement('span'); mark.className='ed-saved'; mark.setAttribute('role','status');
      var lbl=edBox.querySelector('.ed-label .grow'); if(lbl)lbl.parentNode.insertBefore(mark,lbl);
      document.querySelectorAll('button[form="ed-form"][value="save"]').forEach(function(b){b.hidden=true;});
      var sTimer=0, last=edT.value, flight=null;
      var push=function(){
        if(edT.value===last)return;
        var v=edT.value, body=new FormData(edF); body.set('do','save'); body.set('auto','1'); body.set('text',v);
        mark.textContent='جارٍ الحفظ…';
        flight=fetch(edF.action,{method:'POST',body:body,credentials:'same-origin'}).then(function(r){
          return r.json().then(function(j){
            if(r.ok&&j.ok){last=v; mark.textContent='حُفظ'; try{if(edT.value===v)localStorage.removeItem(dKey);}catch(e){}}
            else mark.textContent='لم يُحفظ: '+(j.reason||'');
          });
        }).catch(function(){mark.textContent=navigator.onLine===false?'لم يُحفظ: لا اتّصال':'لم يُحفظ';});
      };
      edT.addEventListener('input',function(){clearTimeout(sTimer); mark.textContent=''; sTimer=setTimeout(push,1500);});
      edT.addEventListener('blur',function(){clearTimeout(sTimer); push();});
    }
  }
  function countsFrom(doc){
    document.querySelectorAll('nav.tabs a,nav.tab-bar a').forEach(function(a){
      var h=a.getAttribute('href'); if(!h)return;
      var o=null;
      doc.querySelectorAll('nav.tabs a,nav.tab-bar a').forEach(function(x){if(!o&&x.getAttribute('href')===h)o=x;});
      if(!o)return;
      var n=a.querySelector('.count'), m=o.querySelector('.count');
      if(n&&m)n.replaceWith(document.importNode(m,true));
      else if(n)n.remove();
      else if(m)a.appendChild(document.importNode(m,true));
    });
  }
  document.addEventListener('submit',function(e){
    var f=e.target;
    if(!(f instanceof HTMLFormElement)||!f.hasAttribute('data-swap')||e.defaultPrevented)return;
    if(!window.fetch||!window.DOMParser)return;
    e.preventDefault();
    var sb=e.submitter||null;
    var body=new FormData(f); if(sb&&sb.name)body.append(sb.name,sb.value);
    var id=String(body.get('id')||'');
    /*
     * ‏**النتيجةُ تُرى قبل ردّ الخادم** (D-227، من Linear): البطاقةُ تقول ما ضُغط («اعتُمدت»، «رُفضت») في اللحظة نفسِها،
     * ‏ثمّ تُبدَّل ببطاقة الخادم حين يصل. والخادمُ يبقى الحَكَم: إن رفض أو انقطع الاتّصالُ عادت البطاقةُ كما كانت وقيل السبب.
     */
    var opt=sb&&sb.getAttribute('data-optimistic'), held=document.getElementById('d-'+id);
    var tag=null;
    if(opt&&held){held.setAttribute('data-pending',opt); tag=document.createElement('span'); tag.className='st ok pending-tag';
      tag.setAttribute('role','status'); tag.textContent=opt; held.appendChild(tag);}
    var undoOpt=function(){if(held)held.removeAttribute('data-pending'); if(tag)tag.remove();};
    // ‏**والطلبُ لا يُكرَّر أبدًا** (D-004 روحًا): التحويلُ يُقرأ يدويًّا، ثمّ تُجلب اللوحةُ بـGET منفصل. فإن سقط شيءٌ
    // ‏بعد أن خرج الطلب فالبديلُ إعادةُ تحميل اللوحة (GET) تُري الحالَ الحقيقيّة — لا إرسالٌ ثانٍ لما قد نُفّذ
    fetch(f.action,{method:'POST',body:body,credentials:'same-origin',redirect:'manual'}).then(function(r){
      if(r.type!=='opaqueredirect'&&!(r.status>=300&&r.status<400))throw new Error('status '+r.status);
      return fetch('/panel',{credentials:'same-origin'});
    }).then(function(r){
      if(!r.ok)throw new Error('panel '+r.status);
      return r.text().then(function(html){return {html:html,url:r.url};});
    }).then(function(res){
      // ‏وورقةُ الردّ تُنزَع قبل القراءة: نونسُها غيرُ نونس هذه الصفحة فيرفضها CSP في السجلّ، ولا حاجةَ بها
      var doc=new DOMParser().parseFromString(res.html.replace(/<style[\\s\\S]*?<\\/style>/g,''),'text/html');
      if(!doc.querySelector('section[data-pane]')){location.href=res.url; return;}
      var mine=document.getElementById('d-'+id), theirs=doc.getElementById('d-'+id);
      if(mine){
        var fresh=theirs?document.importNode(theirs,true):null;
        // ‏وقائمةُ الفرز تحمل البطاقةَ الجديدة لا القديمة: «reorder» تعيد إلحاقَ ما في القائمة، فبطاقةٌ
        // ‏مفصولةٌ تبقى فيها كانت تعود إلى الصفحة نسخةً ثانية
        var at=cards.indexOf(mine);
        if(fresh){fresh.hidden=mine.hidden; mine.replaceWith(fresh); if(at>=0)cards[at]=fresh; wire(fresh);}
        else{mine.remove(); if(at>=0)cards.splice(at,1);}
      }
      countsFrom(doc);
      var nf=doc.getElementById('flash');
      if(flashBox&&nf){
        flashBox.innerHTML='';
        var n=nf.querySelector('.toast-note');
        if(n){n=document.importNode(n,true); flashBox.appendChild(n); wire(n); armToast(n,true);}
      }
      // ‏والتركيزُ إلى البطاقة بلا تمرير — لا إلى رأس الصفحة، ولا يضيع مع النموذج الذي ذهب
      var card=document.getElementById('d-'+id);
      if(card){if(card.tabIndex<0)card.setAttribute('tabindex','-1'); card.focus({preventScroll:true});}
    }).catch(function(err){
      if(window.console)console.warn('swap',err);
      // ‏وبلا اتّصال لم يخرج الطلب: يعود الزرُّ، ويُقال ذلك في موضع الإشعار، وما كُتب باقٍ (خطّة التصميم 7.11)
      undoOpt();
      if(navigator.onLine===false){unbusy(f); fail('لم يُحفظ. تحقّق من الاتّصال ثمّ أعد المحاولة.'); return;}
      location.hash='d-'+id; location.reload();
    });
  });

  /*
   * ‏**الحدودُ تُحفظ وحدَها** (D-227، من Notion): حقلُ الرقم في نموذجٍ معلَّم «data-autosave» يُرسَل حين يتغيّر بـ«auto=1»،
   * ‏ويُقال ما حُفظ بجواره («حُفظ 5» أو القيمةُ بعد قصّها إلى المدى). ويُخفى «حفظ» حين يعمل هذا، ويبقى بلا سكربت.
   */
  document.querySelectorAll('form[data-autosave]').forEach(function(f){
    if(!window.fetch)return;
    var inp=f.querySelector('input[name="value"]'), btn=f.querySelector('button[type="submit"]');
    if(!inp)return;
    if(btn)btn.hidden=true;
    var mark=document.createElement('span'); mark.className='ed-saved self-center'; mark.setAttribute('role','status'); f.appendChild(mark);
    var last=inp.value;
    var push=function(){
      if(inp.value===last||!inp.checkValidity()){if(!inp.checkValidity())mark.textContent='خارج المدى';return;}
      var body=new FormData(f); body.set('auto','1'); mark.textContent='جارٍ الحفظ…';
      fetch(f.action,{method:'POST',body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
        if(j&&j.stored!==undefined){inp.value=j.stored; last=inp.value;}
        mark.textContent=j&&j.ok?'حُفظ':'لم يُحفظ'+(j&&j.text?': '+j.text:'');
      }).catch(function(){mark.textContent=navigator.onLine===false?'لم يُحفظ: لا اتّصال':'لم يُحفظ';});
    };
    inp.addEventListener('change',push);
    f.addEventListener('submit',function(e){e.preventDefault(); push();});
  });

  // ظلٌّ على الشريط حين يكون فوقك محتوى. و passive لأنّ المستمعَ لا
  // يمنع التمرير، وبدونها يؤخّره المتصفّحُ احتياطا
  var bar=document.querySelector('.topbar');
  if(bar){
    var sync=function(){bar.classList.toggle('lifted',window.scrollY>4);};
    window.addEventListener('scroll',sync,{passive:true}); sync();
  }
  // تصفية المصادر وفرزها — في المتصفّح، فلا رحلةَ خادمٍ لكلّ ضغطة
  document.querySelectorAll('button.preset').forEach(function(b){
    b.addEventListener('click',function(){
      var f=document.getElementById('add-provider'); if(!f)return;
      f.name.value=b.dataset.name; f.label.value=b.dataset.label;
      f.base_url.value=b.dataset.url; f.model.value=b.dataset.model;
      f.name.focus();
    });
  });
  var q=document.getElementById('flt'), s=document.getElementById('srt'),
      tb=document.getElementById('src-body');
  function apply(){
    if(!tb)return;
    var rows=Array.prototype.slice.call(tb.querySelectorAll('tr'));
    var mode=q?q.value:'all';
    rows.forEach(function(r){
      r.hidden = mode==='pending' ? r.dataset.pending!=='1'
              : mode==='analyzed' ? r.dataset.pending==='1' : false;
    });
    if(s){
      var k=s.value;
      rows.sort(function(a,b){
        if(k==='worth')return (+b.dataset.worth)-(+a.dataset.worth);
        if(k==='name')return a.dataset.name.localeCompare(b.dataset.name,'ar');
        return (+b.dataset.seen)-(+a.dataset.seen);
      }).forEach(function(r){tb.appendChild(r);});
    }
    var vis=rows.filter(function(r){return !r.hidden;}).length;
    var n=document.getElementById('shown'); if(n)n.textContent=vis;
  }
  if(q)q.addEventListener('change',apply);
  if(s)s.addEventListener('change',apply);
  apply();

  // ══ مسرحُ القرار (D-100) ══════════════════════════════
  //
  // ثلاثةٌ تعمل على المسوّدات وحدها، وكلُّها تحسينٌ فوق صفحةٍ تعمل
  // بدونها: بلا سكربتٍ تظهر المسوّداتُ كلُّها، ويُبَتُّ فيها واحدةً
  // واحدةً بالنماذج — وهو ما كان يقع قبل اليوم بالضبط.
  var cards=Array.prototype.slice.call(document.querySelectorAll('[data-draft]'));
  if(cards.length){
    var picks=Array.prototype.slice.call(document.querySelectorAll('input[data-pick]'));
    var bulkForm=document.getElementById('bulk');
    var ftabs=document.getElementById('draft-filter');
    var none=document.getElementById('draft-none');
    var help=document.getElementById('keys');
    if(help)help.hidden=false;

    // ── الفرز ───────────────────────────────────────────
    // الشريحةُ مخفيّةٌ في الوثيقة وتُظهَر هنا: تبويبٌ لا يرشّح بلا
    // سكربتٍ يُقرأ عطلا، والغائبُ لا يُعِد بشيء
    // ‏والافتراضُ «قيد العمل» بالأهمّ أوّلًا (D-215): ما انتهى في «الأرشيف»
    var bucket='active', bucketOf=['failed','waiting','approved','queued'];
    // والمنصّةُ والترتيبُ فرزٌ ثانٍ وثالث (D-127) — بالقاعدة نفسِها: افتراضُهما
    // «الكلّ» و«الأحدث»، وما يُخفى يُلغى تحديدُه
    var platform='all', order='urgent';
    var ptabs=document.getElementById('draft-platform');
    var orderSel=document.getElementById('draft-order');
    function reorder(){
      if(!cards.length)return;
      var parent=cards[0].parentNode; if(!parent)return;
      var key=function(c){return order==='cost'?parseFloat(c.dataset.cost||'0')||0:parseFloat(c.dataset.created||'0')||0;};
      var sorted=cards.slice().sort(function(a,b){
        if(order==='urgent'){var r=(+a.dataset.rank||0)-(+b.dataset.rank||0); if(r)return r;}
        var d=key(b)-key(a); return order==='old'?-d:d;});
      sorted.forEach(function(c){parent.appendChild(c);});
    }
    function refilter(){
      var shown=0;
      cards.forEach(function(c){
        var on = (bucketOf===null || bucketOf.indexOf(c.dataset.status)>=0) && (platform==='all' || c.dataset.platform===platform);
        c.hidden=!on; if(on)shown++;
        // صندوقٌ مخفيٌّ يبقى مرسَلا مع النموذج — فيُعتمَد ما لا يُرى
        if(!on){
          var box=c.querySelector('input[data-pick]');
          if(box&&box.checked){box.checked=false;}
        }
      });
      if(none)none.hidden=shown>0;
      count();
    }
    if(ftabs){
      ftabs.hidden=false;
      ftabs.querySelectorAll('button[data-bucket]').forEach(function(b){
        b.addEventListener('click',function(){
          bucket=b.dataset.bucket; bucketOf=b.dataset.of?b.dataset.of.split(' '):null;
          ftabs.querySelectorAll('button[data-bucket]').forEach(function(o){
            var on=o===b;
            o.setAttribute('aria-pressed',String(on));
          });
          refilter();
        });
      });
    }
    if(ptabs){
      ptabs.hidden=false;
      ptabs.querySelectorAll('button[data-platform-tab]').forEach(function(b){
        b.addEventListener('click',function(){
          platform=b.dataset.platformTab;
          ptabs.querySelectorAll('button[data-platform-tab]').forEach(function(o){
            var on=o===b;
            o.setAttribute('aria-pressed',String(on));
          });
          refilter();
        });
      });
    }
    if(orderSel){orderSel.addEventListener('change',function(){order=orderSel.value; reorder();});}
    refilter();
    // ‏رابطٌ إلى بطاقةٍ في «الأرشيف» (‎/panel#d-…‎ من الخطّ الزمنيّ أو إشعار) يفتح «الكلّ» فلا يصل إلى بطاقةٍ مخفيّة
    (function(){
      var h=location.hash.slice(1); if(!h||!ftabs)return;
      var t=document.getElementById(h); if(!t)return;
      var card=t.closest?t.closest('[data-draft]'):null;
      if(card&&card.hidden){var all=ftabs.querySelector('button[data-bucket="all"]'); if(all)all.click(); t.scrollIntoView();}
    })();

    // ── شريطُ البَتِّ الجماعيّ ───────────────────────────
    // والكلفةُ المعروضةُ ثمنُ النشر لا ثمنُ الكتابة (D-069): الأوّلُ
    // لم يقع بعدُ وهو الذي يبتّ فيه المالك، والثاني وقع ولا يُستردّ
    function count(){
      if(!bulkForm)return;
      var on=picks.filter(function(b){return b.checked;});
      var n=bulkForm.querySelector('[data-bulk-n]');
      var c=bulkForm.querySelector('[data-bulk-cost]');
      if(n)n.textContent=String(on.length);
      if(c){
        var sum=0; on.forEach(function(b){sum+=parseFloat(b.dataset.cost||'0')||0;});
        c.textContent = sum>0 ? 'ثمنُ نشرها \u2066'+sum.toFixed(4)+'$\u2069' : '';
      }
      bulkForm.hidden=on.length===0;
    }
    picks.forEach(function(b){b.addEventListener('change',count);});
    if(bulkForm){
      var clear=bulkForm.querySelector('[data-bulk-clear]');
      if(clear)clear.addEventListener('click',function(){
        picks.forEach(function(b){b.checked=false;}); count();
      });
    }
    count();

    // ── المعاينةُ تتبع المربّع ──────────────────────────
    //
    // والمربّعُ هو المصدر: النصُّ الذي يراه المالك هو النصُّ الذي
    // يُرسَل، والمعاينةُ تصويرٌ له لا نسخةٌ ثانية تُحرَّر. فلو انقطع
    // الرباطُ بقيت المعاينةُ تعرض ما لن يُنشَر — وهو أسوأُ من غيابها.
    //
    // و textContent لا innerHTML: النصُّ من المالك، وحقنُه وسما يجعل
    // معاينةً تعرض ما ليس فيه.
    cards.forEach(function(c){
      var box=c.querySelector('textarea.draft-text');
      var pv=c.querySelector('.pv');
      if(!box||!pv)return;
      var head=pv.querySelector('[data-pv-first]');
      var tail=pv.querySelector('[data-pv-rest]');
      if(!head||!tail)return;
      var sync=function(){
        var t=box.value, nl=t.indexOf('\\n');
        head.textContent = nl<0 ? t : t.slice(0,nl);
        tail.textContent = nl<0 ? '' : t.slice(nl);
      };
      box.addEventListener('input',sync);
    });

    // ── البَتُّ بلوحة المفاتيح ──────────────────────────
    //
    // وموضعُ المفتاح لا حرفُه — وهذا ليس تفصيلا: المالكُ يكتب
    // عربيّةً، وبتخطيطٍ عربيٍّ يعطي المفتاحُ الذي عليه «J» الحرفَ «ت».
    // فمقارنةُ الحرف تجعل الاختصاراتِ تعمل بالإنجليزيّ وتصمت
    // بالعربيّ — صمتا لا يُفسَّر. والموضعُ يعمل في التخطيطين معا.
    var here=-1;
    function visible(){return cards.filter(function(c){return !c.hidden;});}
    function mark(i){
      cards.forEach(function(c){c.classList.remove('here');});
      var list=visible(); if(!list.length)return;
      here=Math.max(0,Math.min(i,list.length-1));
      var el=list[here];
      el.classList.add('here');
      el.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    function press(sel){
      var list=visible(); if(here<0||!list[here])return false;
      var el=list[here].querySelector(sel);
      if(!el)return false;
      // ‏وما في طيّةٍ مغلقة (شريطُ الجدولة في «الموعدُ والصورة»، D-198) تُفتح طيّتُه قبل التركيز عليه
      for(var up=el.parentElement;up;up=up.parentElement){if(up.tagName==='DETAILS'&&!up.classList.contains('menu'))up.open=true;}
      el.focus(); if(el.tagName!=='TEXTAREA'&&el.tagName!=='SELECT')el.click();
      return true;
    }
    document.addEventListener('keydown',function(e){
      // حقلُ كتابةٍ يملك مفاتيحَه: من يكتب منشورا لا يبتّ فيه
      var t=e.target, tag=(t&&t.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
      // ومركّبةٌ للمتصفّح: Ctrl+R إعادةُ تحميل، لا رفضُ مسوّدة
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      var did=true;
      switch(e.code){
        case 'KeyJ': mark(here+1); break;
        case 'KeyK': mark(here<=0?0:here-1); break;
        case 'KeyA': did=press('button[value="approve"]'); break;
        case 'KeyR': did=press('button[value="reject"]'); break;
        case 'KeyE': did=press('[data-edit]'); break;
        case 'KeyS': did=press('.sched select'); break;
        case 'Slash': {
          var help=document.getElementById('keys');
          if(help)help.open=!help.open; else did=false;
          break;
        }
        default: did=false;
      }
      if(did)e.preventDefault();
    });
  }

  // ── العامل الثاني ─────────────────────────────────────
  var csrf=(document.querySelector('input[name="_csrf"]')||{}).value||'';
  var b64u=sadaB64.enc, fromB64u=sadaB64.dec;
  var post=function(url,fields){
    var body=new FormData(); body.set('_csrf',csrf);
    for(var k in fields)body.set(k,fields[k]);
    return fetch(url,{method:'POST',body:body});
  };
  var say=function(id,msg){var n=document.getElementById(id); if(n)n.textContent=msg;};

  var add=document.getElementById('pk-add');
  if(add)add.addEventListener('click',function(){
    if(!window.PublicKeyCredential){say('pk-msg','متصفّحك لا يدعم مفاتيح المرور.'); return;}
    var label=(document.getElementById('pk-label')||{}).value||'';
    add.disabled=true; say('pk-msg','المس مفتاحك…');
    post('/panel/security/passkey/challenge',{}).then(function(r){
      return r.ok?r.json():sadaPk.fail(r);
    }).then(function(d){
      return navigator.credentials.create({publicKey:{
        challenge:fromB64u(d.challenge),
        rp:{id:d.rp.id,name:d.rp.name},
        user:{id:fromB64u(d.user.id),name:d.user.name,displayName:d.user.displayName},
        pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
        authenticatorSelection:{userVerification:'preferred',residentKey:'preferred'},
        excludeCredentials:d.excludeCredentials.map(function(id){
          return {id:fromB64u(id),type:'public-key'};}),
        attestation:'none', timeout:60000
      }});
    }).then(function(cred){
      var r=cred.response;
      var pk=r.getPublicKey?r.getPublicKey():null;
      if(!pk)throw new Error('OldBrowser');
      return post('/panel/security/passkey/register',{label:label,
        credential:JSON.stringify({credentialId:cred.id,
          clientDataJSON:b64u(r.clientDataJSON),
          authenticatorData:r.getAuthenticatorData?b64u(r.getAuthenticatorData()):'',
          publicKey:b64u(pk), alg:r.getPublicKeyAlgorithm?r.getPublicKeyAlgorithm():-7})});
    }).then(function(r){
      if(r.ok){location.reload(); return;}
      return r.json().catch(function(){return {};}).then(function(e){add.disabled=false;
        say('pk-msg',e.detail||sadaPk.server(e.error,r.status).message); add.focus();});
    }).catch(function(err){add.disabled=false;
      say('pk-msg',err&&err.message==='OldBrowser'
        ?'متصفّحك لا يقدّم المفتاح العامّ مباشرةً — يلزم متصفّح أحدث.'
        :sadaPk.why(err)); add.focus();});
  });

  document.querySelectorAll('button.pk-del').forEach(function(b){
    b.addEventListener('click',function(){
      if(!confirm('حذف المفتاح «'+b.dataset.label+'»؟'))return;
      b.disabled=true;
      post('/panel/security/passkey/delete',{id:b.dataset.id}).then(function(r){
        if(r.ok){location.reload(); return;}
        return r.json().catch(function(){return {};}).then(function(e){b.disabled=false;
          say('pk-msg',e.detail||sadaPk.server(e.error,r.status).message);});
      }).catch(function(err){b.disabled=false; say('pk-msg',sadaPk.why(err));});
    });
  });

  var ts=document.getElementById('totp-start');
  if(ts)ts.addEventListener('click',function(){
    ts.disabled=true;
    post('/panel/security/totp/start',{}).then(function(r){
      return r.ok?r.json():sadaPk.fail(r);
    }).then(function(d){
      document.getElementById('totp-secret').value=d.secret;
      document.getElementById('totp-box').hidden=false;
      say('totp-msg','انسخ السرّ إلى تطبيق المصادقة ثمّ أكّد بالرمز الظاهر.');
    }).catch(function(err){ts.disabled=false; say('totp-msg',sadaPk.why(err)); ts.focus();});
  });

  var tc=document.getElementById('totp-confirm');
  if(tc)tc.addEventListener('submit',function(e){
    e.preventDefault();
    /*
     * ‏«رمزٌ غير صحيح» لما هو كذلك وحدَه (D-161): جلسةٌ انتهت أو صفحةٌ قديمة
     * ‏كانت تُقرأ رمزًا خاطئًا، فيعيد المالكُ رمزًا صحيحًا مرّةً بعد مرّة
     */
    post('/panel/security/totp/confirm',{code:tc.code.value})
      .then(function(r){
        if(r.ok)return r.json();
        return r.json().catch(function(){return {};}).then(function(e){
          if(r.status===401&&e.error==='denied')throw Object.assign(new Error(e.detail||'رمزٌ غير صحيح.'),{name:'SadaServer'});
          throw sadaPk.server(e.error,r.status);});
      }).then(function(d){
        if(d.codes&&d.codes.length){showCodes(d.codes); say('totp-msg','أُكّد. وهذه رموز استردادك — انسخها.');}
        else location.reload();
      }).catch(function(err){say('totp-msg',sadaPk.why(err));});
  });

  var tr=document.getElementById('totp-remove');
  if(tr)tr.addEventListener('click',function(){
    if(!confirm('إزالة رمز التطبيق؟'))return;
    tr.disabled=true;
    post('/panel/security/totp/remove',{}).then(function(r){
      if(r.ok){location.reload(); return;}
      return r.json().catch(function(){return {};}).then(function(e){
        if(e.detail)throw Object.assign(new Error(e.detail),{name:'SadaServer'});
        throw sadaPk.server(e.error,r.status);});
    }).catch(function(err){tr.disabled=false; say('totp-msg',sadaPk.why(err)); tr.focus();});
  });

  function showCodes(list){
    var box=document.getElementById('rc-box'), out=document.getElementById('rc-list');
    if(!box||!out)return;
    out.textContent='';
    list.forEach(function(c){var d=document.createElement('code'); d.textContent=c; out.appendChild(d);});
    box.hidden=false;
  }

  var ri=document.getElementById('rc-issue');
  if(ri)ri.addEventListener('click',function(){
    if(!confirm('توليدُ مجموعةٍ جديدة يُبطل القديمة كلَّها. متابعة؟'))return;
    ri.disabled=true;
    post('/panel/security/recovery/issue',{}).then(function(r){
      return r.ok?r.json():sadaPk.fail(r);
    }).then(function(d){ri.disabled=false;
        if(d.codes){showCodes(d.codes); say('rc-msg','وُلّدت '+d.codes.length+' رموز. انسخها الآن.');}
        else say('rc-msg','تعذّر التوليد.');
    }).catch(function(err){ri.disabled=false; say('rc-msg',sadaPk.why(err)); ri.focus();});
  });

  // ── دَرَجُ النماذج (D-081) ────────────────────────────
  //
  // القائمةُ تُجلَب من عند المزوّد بضغطةٍ لا تلقائيّا: فتحُ الشاشة لا
  // يوقظ نداءً إلى كلّ مزوّد. والقيمةُ المحفوظة تبقى مختارةً مهما وقع —
  // فتعذُّرُ الجلب لا يمحو نموذجا يعمل.
  var mpSet=function(sel,value){
    if(!value)return;
    var found=false,i;
    for(i=0;i<sel.options.length;i++)
      if(sel.options[i].value===value){found=true;break;}
    if(!found){
      var o=document.createElement('option');
      o.value=value; o.textContent=value;
      sel.insertBefore(o,sel.firstChild);
    }
    sel.value=value;
  };
  // في جدول التوجيه يتبدّل المزوّدُ في الصفّ نفسه، فيُقرأ منه لا من الحقل
  var mpProvider=function(box){
    var form=box.closest('form');
    var pick=form?form.querySelector('.mp-provider'):null;
    return pick&&pick.value?pick.value:(box.dataset.provider||'');
  };
  // السعرُ يُملأ ممّا يعطيه الفهرس — ولا يُحفَظ إلّا بضغطة المالك
  var mpFillPrice=function(box,opt,note){
    if(box.dataset.price!=='1'||!opt)return;
    var form=box.closest('form'); if(!form)return;
    var pin=form.querySelector('[name=price_in]');
    var pout=form.querySelector('[name=price_out]');
    var a=opt.dataset.pin,b=opt.dataset.pout;
    if(pin&&a)pin.value=a;
    if(pout&&b)pout.value=b;
    if(note&&(a||b))note.textContent='السعرُ مُلئ من فهرس المزوّد — احفظ ليُثبَت.';
  };
  // خيارُ الكتابة اليدويّة يُعاد بناؤه في كلّ تعبئة — فلا يُنسى
  var mpManual=function(sel){
    var man=document.createElement('option');
    man.value='__manual__'; man.textContent='اكتبه يدويّا…';
    sel.appendChild(man);
  };
  // «يُفرَّغ الدرجُ حين يتبدّل المزوّد» (D-083): نماذجُ مزوّدٍ معروضةً
  // تحت اسم آخر ليست إزعاجا — هي حفظُ توجيهٍ لا يعمل
  var mpClear=function(sel,placeholder){
    while(sel.options.length)sel.remove(0);
    var o=document.createElement('option');
    o.value=''; o.textContent=placeholder; o.selected=true;
    sel.appendChild(o);
    mpManual(sel);
  };
  document.querySelectorAll('.mp').forEach(function(box){
    var sel=box.querySelector('.mp-sel');
    var btn=box.querySelector('.mp-load');
    var note=box.querySelector('.mp-note');
    if(!sel||!btn||!note)return;
    var last=sel.value;
    // لأيّ مزوّدٍ هذه القائمةُ المعروضة الآن؟ فارغٌ يعني «لم تُجلَب بعد»
    var loadedFor='';
    var busy=false;

    sel.addEventListener('change',function(){
      if(sel.value==='__manual__'){
        var typed=prompt('اسمُ النموذج كما هو عند المزوّد:',last||'');
        if(typed&&typed.trim())mpSet(sel,typed.trim());
        else sel.value=last;
        last=sel.value;
        return;
      }
      last=sel.value;
      mpFillPrice(box,sel.options[sel.selectedIndex],note);
    });

    var load=function(silent){
      var name=mpProvider(box);
      if(!name){note.textContent='لا مزوّدَ لهذا الحقل.';return;}
      if(busy||loadedFor===name)return;
      // **ولا يُعطَّل الزرُّ وهي تُجلَب** (D-125): التركيزُ على القائمة يطلق
      // الجلبَ، وزرٌّ معطَّلٌ في تلك اللحظة يقفز عنه Tab — قِيس فوُجد
      // «حدّث» لا يُبلَغ بلوحة المفاتيح. و«busy» يحرس التكرار.
      busy=true; btn.setAttribute('aria-busy','true'); note.textContent='تُجلَب نماذجُ '+name+'…';
      post('/panel/providers/models',{provider:name}).then(function(r){
        return r.json();
      }).then(function(d){
        busy=false; btn.removeAttribute('aria-busy');
        var models=(d&&d.models)||[];
        if(!d||!d.ok||!models.length){
          note.textContent=(d&&d.detail)||'تعذّر الجلب — اكتب الاسم يدويّا.';
          return;
        }
        loadedFor=name;
        // يُصفّى إلى صنف المهمّة، وصنفٌ مجهولٌ يبقى: إخفاءُ نموذجٍ موجود
        // أسوأُ من عرضِ نموذجٍ لا يناسب
        var want=box.dataset.task||'';
        var keep=models.filter(function(m){return !want||!m.task||m.task===want;});
        var filtered=keep.length<models.length;
        if(!keep.length){keep=models;filtered=false;}
        // القيمةُ السابقة تبقى «إن كانت لهذا المزوّد»؛ وإلّا سقطت معه
        var chosen=silent?last:'';
        while(sel.options.length)sel.remove(0);
        var ph=document.createElement('option');
        ph.value=''; ph.textContent='— اختر نموذجا —';
        sel.appendChild(ph);
        keep.forEach(function(m){
          var o=document.createElement('option');
          o.value=m.id; o.textContent=m.name||m.label||m.id; o.title=m.id;
          if(m.priceIn!==null&&m.priceIn!==undefined)o.dataset.pin=String(m.priceIn);
          if(m.priceOut!==null&&m.priceOut!==undefined)o.dataset.pout=String(m.priceOut);
          sel.appendChild(o);
        });
        mpManual(sel);
        var has=false,i;
        for(i=0;i<sel.options.length;i++)
          if(chosen&&sel.options[i].value===chosen){has=true;break;}
        sel.value=has?chosen:'';
        last=sel.value;
        note.textContent=keep.length+' نموذجا الآن عند '+name
          +(filtered?' (صُفّيت من '+models.length+')':'')
          +(chosen&&!has?' — والنموذجُ السابق ليس منها، فاختر واحدا.':'')
          +' · قائمةٌ لحظيّة لا محفوظة.';
      }).catch(function(){
        busy=false; btn.removeAttribute('aria-busy');
        note.textContent='تعذّر الاتّصال — اكتب الاسم يدويّا.';
      });
    };

    btn.addEventListener('click',function(){loadedFor='';load(true);});
    // «وتُجلَب عند أوّل لمسةٍ للدرج»: تغييرُ النموذج لا يحتاج ضغطتين
    sel.addEventListener('focus',function(){load(true);});

    // «وتبديلُ المزوّد يُسقط نماذجَه» — وهو موضعُ العطل الذي رُئي:
    // اختير Cloudflare فبقيت نماذجُ Gemini معروضة، وحُفظ توجيهٌ لا يعمل
    var form=box.closest('form');
    var pick=form?form.querySelector('.mp-provider'):null;
    if(pick)pick.addEventListener('change',function(){
      loadedFor='';
      box.dataset.provider=pick.value;
      mpClear(sel,'— اختر نموذجا —');
      last='';
      note.textContent='بدّلتَ المزوّد — تُجلَب نماذجُه…';
      load(false);
    });
  });

  /*
   * «الموعدُ يُكتب ويُقرأ بتوقيت المالك» (D-089 · D-199).
   *
   * الصندوقُ ‹local› بساعة المتصفّح، والخادمُ يحوّله بمنطقة كعكته («readWhen»)،
   * وهي منطقةُ المتصفّح نفسِه تُكتب عند كلّ تحميل. فلا يرى المالكُ UTC ولا يحوّل في رأسه.
   *
   * «والدوالُّ الثلاثُ خالصة»: تأخذ لحظةً وتردّ لحظةً، ولا تمسّ صفحةً
   * ولا شبكة. فهي تُنتزَع من هذا النصّ عينِه وتُختبَر — كما يُنتزَع
   * العدّاد (D-071). ونسخةٌ ثانيةٌ في الاختبار تفترق بلا حارس.
   */
  function pad2(n){return (n<10?'0':'')+n;}
  function localBox(d){
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())
      +'T'+pad2(d.getHours())+':'+pad2(d.getMinutes());
  }
  function localAt(now,days,hour){
    var d=new Date(now.getTime());
    d.setDate(d.getDate()+days);
    d.setHours(hour,0,0,0);
    return d;
  }
  function preset(now,kind){
    if(kind==='hour')return new Date(now.getTime()+3600000);
    if(kind==='tonight'){var t=localAt(now,0,20);return t>now?t:localAt(now,1,20);}
    if(kind==='tomorrow')return localAt(now,1,9);
    if(kind==='sunday'){
      var d=localAt(now,1,9);
      /* «ولا يقع في الماضي أبدا»: يبدأ من الغد ثمّ يتقدّم إلى الأحد */
      for(var i=0;i<7&&d.getDay()!==0;i++)d.setDate(d.getDate()+1);
      return d;
    }
    return null;
  }
  function boxToDate(v){
    var m=/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/.exec(v||'');
    if(!m)return null;
    var d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
    /*
     * «والشكلُ ليس صحّة»: «2026-13-40T99:99» يوافق النمطَ، و«Date.UTC»
     * يدحرجه إلى فبراير ٢٠٢٧ — «فتقول المرآةُ تاريخا واثقا لا علاقةَ له
     * بما كُتب». فيُقارَن الذهابُ بالإياب: ما لم يُعِد الرقمَ نفسَه فليس
     * لحظةً، وصمتٌ خيرٌ من رقمٍ يُصدَّق.
     */
    return localBox(d)===v.slice(0,16)?d:null;
  }

  /*
   * «الساعةُ بالمنطقة التي قالتها اللصيقة» (D-202): لحظةٌ وهميّةٌ ساعتُها المحلّيّة ساعةُ ‹data-zone›،
   * فتحسب الأزرارُ «غدًا 9ص» بتوقيت الرياض في أوّل زيارةٍ كما يقرؤها الخادم.
   */
  function zoneNow(zone){
    var now=new Date();
    if(!zone)return now;
    try{
      var p={};
      new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'numeric',
        day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'}).formatToParts(now)
        .forEach(function(x){p[x.type]=+x.value;});
      return new Date(p.year,p.month-1,p.day,p.hour%24,p.minute,p.second);
    }catch(e){return now;}
  }

  function bindQuick(bar){
    var field=document.getElementById(bar.dataset.quick);
    var mirror=bar.parentNode.querySelector('[data-mirror="'+bar.dataset.quick+'"]');
    if(!field)return;
    function reflect(){
      if(!mirror)return;
      var at=boxToDate(field.value);
      if(at===null){mirror.textContent='';return;}
      /*
       * والمرآةُ تقول ما اختاره الزرُّ بالكلام، والصندوقُ في طيّة «موعدٌ آخر» (D-199).
       */
      try{
        mirror.textContent='= '+at.toLocaleString('ar-u-nu-latn',{weekday:'long',day:'numeric',
          month:'long',hour:'numeric',minute:'2-digit'});
      }catch(e){mirror.textContent='';}
    }
    bar.querySelectorAll('[data-preset]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var at=preset(zoneNow(field.dataset.zone),btn.dataset.preset);
        if(at===null)return;
        field.value=localBox(at);
        reflect();
      });
    });
    field.addEventListener('input',reflect);
    reflect();
  }
  document.querySelectorAll('.quick').forEach(bindQuick);

  /*
   * ── رفعُ المقطع قطعًا (D-180) ─────────────────────────────────────
   * المدّةُ والأبعادُ من ‹video› على عنوانٍ محلّيّ (blob:) قبل أن يُرفع بايت، ثمّ
   * «ابدأ» فالقطعُ بترتيبها بشريط تقدّم، ثمّ «أكمل». وكلُّ طلبٍ نموذجٌ بـ‹_csrf›
   * يمرّ من حارس اللوحة نفسِه. وفشلُ قطعةٍ يُلغي الرفعَ فلا يبقى معلّقًا في R2.
   */
  var vfile=document.getElementById('vfile');
  if(vfile)vfile.addEventListener('change',function(){
    var file=vfile.files&&vfile.files[0];
    if(!file)return;
    var msg=document.getElementById('vup-msg'), bar=document.getElementById('vup-bar');
    var tell=function(t){if(msg)msg.textContent=t;};
    var id=null;
    var meta=new Promise(function(done){
      var v=document.createElement('video'), url=URL.createObjectURL(file), over=false;
      var end=function(m){if(over)return; over=true; URL.revokeObjectURL(url); done(m);};
      v.preload='metadata';
      v.onloadedmetadata=function(){end({w:v.videoWidth,h:v.videoHeight,d:Math.round(v.duration*1000)});};
      v.onerror=function(){end({w:'',h:'',d:''});};
      setTimeout(function(){end({w:'',h:'',d:''});},8000);
      v.src=url;
    });
    vfile.disabled=true; tell('يقرأ المقطع…');
    meta.then(function(m){
      return post('/panel/uploads/start',{name:file.name,mime:file.type,bytes:String(file.size),
        width:String(m.w),height:String(m.h),duration_ms:isFinite(m.d)?String(m.d):''});
    }).then(function(r){return r.json();}).then(function(d){
      if(!d.ok)throw d.reason||'رُفض المقطع';
      id=d.id; if(bar){bar.hidden=false; bar.value=0;}
      var parts=[], n=0;
      var next=function(){
        n++;
        if(n>d.parts)return Promise.resolve();
        var body=new FormData(); body.set('_csrf',csrf); body.set('n',String(n));
        body.set('chunk',file.slice((n-1)*d.partBytes,Math.min(n*d.partBytes,file.size)));
        return fetch('/panel/uploads/'+id+'/part',{method:'POST',body:body})
          .then(function(r){return r.json();}).then(function(p){
            if(!p.ok)throw p.reason||'رُدّت قطعة';
            parts.push(p.part);
            if(bar)bar.value=Math.round(100*n/d.parts);
            tell('يرفع… '+Math.round(100*n/d.parts)+'٪');
            return next();
          });
      };
      return next().then(function(){
        tell('يجمع المقطع…');
        return post('/panel/uploads/'+id+'/complete',{parts:JSON.stringify(parts)});
      });
    }).then(function(r){return r.json();}).then(function(c){
      if(!c.ok)throw c.reason||'تعذّر جمعُ المقطع';
      location.hash='videos'; location.reload();
    }).catch(function(e){
      if(id!==null)post('/panel/uploads/'+id+'/abort',{});
      tell(typeof e==='string'?e:'انقطع الرفع — اختر الملفَّ مرّةً أخرى');
      vfile.disabled=false; vfile.value='';
      if(bar)bar.hidden=true;
    });
  });

  /*
   * ‏ملفُّ الخطّة يُقرأ فورَ اختياره (ر-5، خطّة التصميم 7.6): كان اختيارُه لا يغيّر شيئًا في
   * ‏الشاشة، ثمّ يلزم زرٌّ ثانٍ «اقرأ الخطّة». فاسمُه في اللصيقة، ثمّ يُرسَل النموذجُ بحارس
   * ‏«مشغول» نفسِه. والزرُّ يبقى لمن لا سكربتَ عنده.
   */
  document.querySelectorAll('input[data-plan-file]').forEach(function(inp){
    inp.addEventListener('change',function(){
      var f=inp.files&&inp.files[0], form=inp.form;
      if(!f||!form)return;
      var pick=inp.parentNode.querySelector('[data-plan-name]');
      if(pick)pick.textContent=f.name;
      if(form.requestSubmit)form.requestSubmit();
      else{var b=form.querySelector('button[type=submit]'); if(b)b.click();}
    });
  });

  /*
   * ‏عدّادُ عنوان YouTube (ر-4): السطرُ الأوّلُ من نصّ المقطع عنوانُه، ويُقصّ عند حدّه عند
   * ‏الرفع. كان الحدُّ في عنصرٍ نائبٍ يختفي مع أوّل حرف، والقصُّ لا يُقال قبل النشر ولا بعده.
   * ‏فيُعَدّ بقاعدة الرفع نفسِها (‹youtubeTitle›: السطرُ الأوّلُ بلا فراغ طرفيه)، والحدُّ من
   * ‏‹data-yt-title› لا من رقمٍ هنا، ويختفي إن أُزيل اختيارُ YouTube.
   */
  function ytLine(v){return (v.trim().split('\\n')[0]||'').trim();}
  document.querySelectorAll('textarea[data-yt-title]').forEach(function(t){
    var out=t.parentNode.querySelector('[data-yt-count]'); if(!out)return;
    var max=+t.dataset.ytTitle||0, form=t.form;
    var yt=form?form.querySelector('input[name=platform][value=youtube]'):null;
    function tick(){
      var n=ytLine(t.value).length, over=n>max;
      out.hidden=n===0||(yt!==null&&!yt.checked);
      // ‏الرقمان معزولان (LRI…PDI): «57 / 100» في سطرٍ عربيٍّ تنقلب «100 / 57» بلا عزل
      out.textContent='عنوانُ YouTube: \\u2066'+n+' / '+max+'\\u2069'+(over?' — يُقصّ عند '+max+' محرف':'');
      out.className=over?'st warn':'ago';
    }
    t.addEventListener('input',tick);
    if(yt)yt.addEventListener('change',tick);
    tick();
  });

  /*
   * ‏عدّادُ نصّ كلّ منصّة (D-190) — **بقاعدة الإنشاء نفسِها** (‹captionProblem›): TikTok وInstagram
   * ‏بالمحرف بعد طيّ الطرفين، ووصفُ YouTube بالبايت. والحدُّ من ‹data-cap-limit› لا من رقمٍ هنا.
   * ‏كان الحدُّ لا يُقال، والخطأُ يظهر بعد أن يُردّ الإنشاءُ كلُّه بإشعارٍ في رأس الصفحة.
   */
  var enc=typeof TextEncoder==='function'?new TextEncoder():null;
  function capLen(v,bytes){return bytes&&enc?enc.encode(v).length:v.length;}
  document.querySelectorAll('textarea[data-cap-limit]').forEach(function(t){
    var out=t.parentNode.querySelector('[data-cap-count]'); if(!out)return;
    var max=+t.dataset.capLimit||0, bytes=t.dataset.capUnit==='bytes';
    function tick(){
      var n=capLen(t.value.trim(),bytes), over=n>max;
      out.textContent='\u2066'+n+' / '+max+'\u2069 '+(bytes?'بايت':'محرف')+(over?' — أطولُ ممّا تقبله المنصّة':'');
      out.className=over?'st warn':'ago';
    }
    t.addEventListener('input',tick); tick();
  });
})();
`
