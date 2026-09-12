/**
 * صفحة اللوحة.
 *
 * **قاعدةٌ ملزمة:** لا زرَّ هنا إلا وله قيدٌ مقابلٌ مُختبَر في الخادم.
 * وما لم يُبنَ يُعرض بحاله الصريحة لا كجدولٍ فارغ يُظنّ عطلا.
 *
 * وقواعد اللون من مرجع التصوير لا من الذوق:
 * - **ألوان الحالة محجوزة** (جيّد · تحذير · خطر) ولا تُستعمل لسلسلةٍ ولا زينة
 * - **لا تعتمد الحالة على اللون وحده**: معه رمزٌ ونصّ دائما
 * - **درجة الاستحقاق مقياس مقدار**، فتدرّجُ هيئةٍ واحدة لا قوس قزح
 * - النصّ يلبس ألوان النصّ لا لون العلامة بجانبه
 */
import { relativeTime, money } from '../lib/format'
import { chosenTiles, TILE_MAX, TILE_MIN, TILES } from '../lib/dashboard'
import { pivotPane, type PivotView } from './ui/sections/pivot'
import type { ChannelView } from '../lib/channels'
import type { AppStatus } from '../lib/oauth/apps'
import { channelsSection } from './ui/channels'
import { buildCommands, commandMore, commandTrigger, SECTIONS } from './ui/command'
import type { Peaks } from '../lib/schedule/peak'
import { onboarding } from '../lib/onboard'
import { draftsSection, type MediaView, type Target } from './ui/sections/drafts'
import { planSection } from './ui/sections/plan'
import type { StoredPlan } from '../lib/plan/job'
import type { DraftRow } from '../lib/draft/store'
import { X_HEAVY, X_LIGHT_RANGES, X_URL_LENGTH } from '../lib/draft/length'
import { providersSection } from './ui/sections/providers'
import { securitySection } from './ui/sections/security'
import { densitySwitch, DENSITY_SCRIPT, escapeHtml, GLYPH_SVG, injectCsrf, shell, themeSwitch, THEME_SCRIPT } from './ui/shell'
import { alertChannel, bar, firstDay, pct, type OutboxRow } from './ui/parts'
import { areaChart, barChart } from './ui/chart'
import { ICON } from './ui/icons'
import { COPY_SCRIPT } from './ui/shell'
import { driveFileUrl } from '../lib/drive/sync'
import { LOGOS } from './ui/logos'

export { escapeHtml, injectCsrf, shell }


/**
 * رأسُ القسم — لصيقةٌ وعنوانٌ وسطر.
 *
 * كان أعلى ما في الشاشة عنوانا في الشريط بستّةَ عشرَ بكسلا، وتحته
 * أرقامٌ باثنين وثلاثين. **فالرقمُ هو الذي يُقرأ عنوانا**، وتصير الشاشةُ
 * لوحةَ عدّاداتٍ لا شاشةَ عمل: العينُ تقع على أكبر شيءٍ أوّلا، لا على
 * ما وُسم عنوانا.
 *
 * والسطرُ الثالث ليس زينة: قسمٌ يبدأ بجدولٍ بلا جملةٍ تقول ما هو يجعل
 * القارئَ يستنتج غرضَه من أعمدته.
 */
function pageHead(eyebrow: string, title: string, lede: string, aside = ''): string {
  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${lede}</p>
    </div>
    ${aside === '' ? '' : `<div class="aside">${aside}</div>`}
  </div>`
}

/**
 * نصُّ اللوحة الجاري في المتصفّح.
 *
 * **ومُصدَّرٌ ليُختبَر لا ليُستورَد**: فيه عدّادٌ يجب أن يعدّ كما يعدّ
 * الخادم (D-071)، **وعدّادٌ يخالفه أسوأُ من لا عدّاد** — يُري المالكَ
 * أحمرَ على منشورٍ مقبول. فيُنتزَع في الاختبار ويُقارَن حالةً حالة.
 */
export const SCRIPT = `
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
  function show(id,push){
    var found=false;
    panes.forEach(function(p){var m=p.dataset.pane===id; p.hidden=!m; if(m)found=true;});
    if(!found){show(panes[0].dataset.pane,push); return;}
    tabs.forEach(function(t){
      var m=t.getAttribute('href')==='#'+id;
      if(m){t.setAttribute('aria-current','page');}else{t.removeAttribute('aria-current');}
    });
    if(push&&history.replaceState)history.replaceState(null,'','#'+id);
  }
  tabs.forEach(function(t){t.addEventListener('click',function(e){
    e.preventDefault(); show(t.getAttribute('href').slice(1),true);
  });});
  show((location.hash||'').slice(1)||panes[0].dataset.pane,false);
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
    show((location.hash||'').slice(1)||panes[0].dataset.pane,false);
    var t=null;
    for(var i=0;i<tabs.length;i++){
      if(tabs[i].getAttribute('href')===location.hash)t=tabs[i];
    }
    var h=document.getElementById('pane-title');
    if(t&&h){var sp=t.querySelector('span'); if(sp)h.textContent=sp.textContent;}
  });
  // عنوانُ الشريط العلويّ يتبع القسم — فلا يبقى «نظرة عامّة» فوق الأمان
  var head=document.getElementById('pane-title');
  if(head)tabs.forEach(function(t){t.addEventListener('click',function(){
    var s=t.querySelector('span'); if(s)head.textContent=s.textContent;});});

  // زرُّ النسخ مشترَكٌ مع شاشة «ما عليك» (D-126) — يُعرَّف في shell.ts
  ${COPY_SCRIPT}

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
    var out=t.parentNode.querySelector('.count'); if(!out)return;
    var b=out.querySelector('b'); var lim=+t.dataset.limit||0; var tgt=+t.dataset.target||0;
    // و LinkedIn على عدّ المحارف: لا قاعدةَ وزنٍ منشورةً لها فلا تُخترَع
    var weighted=t.dataset.count==='x';
    function tick(){
      var v=t.value.trim();
      var n=weighted?xLen(v):v.length; if(b)b.textContent=n;
      out.className='count'+(n>lim?' bad':n>tgt?' warn':'');
    }
    t.addEventListener('input',tick); tick();
  });

  // تأكيدٌ قبل فعلٍ يوقف النظام كلّه
  document.querySelectorAll('form[data-confirm]').forEach(function(f){
    f.addEventListener('submit',function(e){
      if(!confirm(f.dataset.confirm)){e.preventDefault(); return;}
      var b=f.querySelector('button'); if(b){b.disabled=true; b.textContent='…';}
    });
  });
  // زرٌّ مضغوط لا يُضغط مرّتين — نداءٌ مدفوع لا يُكرَّر بنقرةٍ عصبيّة.
  //
  // والنصُّ يبقى وتُضاف دوّامة: كان النصُّ يُستبدَل فيضيع ما كان
  // مكتوبا، ويسأل الضاغطُ نفسَه ماذا ضغط. والنداءُ مدفوع فالسؤال ليس
  // هيّنا. والزرُّ المضغوط وحده يدور، لا كلُّ أزرار النموذج.
  document.querySelectorAll('form[data-busy]').forEach(function(f){
    var pressed=null;
    f.querySelectorAll('button').forEach(function(b){
      b.addEventListener('click',function(){pressed=b;});
    });
    f.addEventListener('submit',function(){
      var b=pressed||f.querySelector('button[type=submit]')||f.querySelector('button');
      f.querySelectorAll('button').forEach(function(x){x.disabled=true;});
      if(b){b.setAttribute('data-busy-on','1');
        b.setAttribute('aria-label',(b.textContent||'').trim()+' — '+f.dataset.busy);}
    });
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
    var bucket='all';
    function refilter(){
      var shown=0;
      cards.forEach(function(c){
        var on = bucket==='all' || c.dataset.status===bucket;
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
          bucket=b.dataset.bucket;
          ftabs.querySelectorAll('button[data-bucket]').forEach(function(o){
            var on=o===b;
            o.classList.toggle('on',on); o.setAttribute('aria-pressed',String(on));
          });
          refilter();
        });
      });
    }

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
        c.textContent = sum>0 ? 'ثمنُ نشرها ‎'+sum.toFixed(4)+'$' : '';
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
        case 'KeyE': did=press('textarea.draft-text'); break;
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
  var b64u=function(buf){
    var by=new Uint8Array(buf),t='';
    for(var i=0;i<by.length;i++)t+=String.fromCharCode(by[i]);
    return btoa(t).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  };
  var fromB64u=function(v){
    var t=v.replace(/-/g,'+').replace(/_/g,'/');
    t+='='.repeat((4-t.length%4)%4);
    var bin=atob(t),out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return out;
  };
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
      if(!r.ok)throw new Error('challenge'); return r.json();
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
      return r.json().then(function(e){add.disabled=false;
        say('pk-msg',e.detail||'رُفض التسجيل.');});
    }).catch(function(err){add.disabled=false;
      say('pk-msg',err&&err.message==='OldBrowser'
        ?'متصفّحك لا يقدّم المفتاح العامّ مباشرةً — يلزم متصفّح أحدث.'
        :'تعذّر: '+(err&&err.name?err.name:'أُلغي'));});
  });

  document.querySelectorAll('button.pk-del').forEach(function(b){
    b.addEventListener('click',function(){
      if(!confirm('حذف المفتاح «'+b.dataset.label+'»؟'))return;
      b.disabled=true;
      post('/panel/security/passkey/delete',{id:b.dataset.id}).then(function(r){
        if(r.ok){location.reload(); return;}
        return r.json().then(function(e){b.disabled=false;
          say('pk-msg',e.detail||'تعذّر الحذف.');});
      });
    });
  });

  var ts=document.getElementById('totp-start');
  if(ts)ts.addEventListener('click',function(){
    ts.disabled=true;
    post('/panel/security/totp/start',{}).then(function(r){return r.json();}).then(function(d){
      if(d.error){ts.disabled=false; say('totp-msg',d.detail||'تعذّر البدء.'); return;}
      document.getElementById('totp-secret').value=d.secret;
      document.getElementById('totp-box').hidden=false;
      say('totp-msg','انسخ السرّ إلى تطبيق المصادقة ثمّ أكّد بالرمز الظاهر.');
    });
  });

  var tc=document.getElementById('totp-confirm');
  if(tc)tc.addEventListener('submit',function(e){
    e.preventDefault();
    post('/panel/security/totp/confirm',{code:tc.code.value})
      .then(function(r){return r.json();}).then(function(d){
        if(d.error){say('totp-msg',d.detail||'رمزٌ غير صحيح.'); return;}
        if(d.codes&&d.codes.length){showCodes(d.codes); say('totp-msg','أُكّد. وهذه رموز استردادك — انسخها.');}
        else location.reload();
      });
  });

  var tr=document.getElementById('totp-remove');
  if(tr)tr.addEventListener('click',function(){
    if(!confirm('إزالة رمز التطبيق؟'))return;
    tr.disabled=true;
    post('/panel/security/totp/remove',{}).then(function(r){
      if(r.ok){location.reload(); return;}
      return r.json().then(function(e){tr.disabled=false; say('totp-msg',e.detail||'تعذّر.');});
    });
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
    post('/panel/security/recovery/issue',{}).then(function(r){return r.json();})
      .then(function(d){ri.disabled=false;
        if(d.codes){showCodes(d.codes); say('rc-msg','وُلّدت '+d.codes.length+' رموز. انسخها الآن.');}
        else say('rc-msg','تعذّر التوليد.');});
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
          o.value=m.id; o.textContent=m.label||m.id;
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
   * «الموعدُ يُكتب UTC ويُقرأ بتوقيت المالك» (D-089).
   *
   * الخادمُ يقرأ الصندوقَ UTC ولا يعرف منطقةَ أحد — وهذا صواب: منطقةٌ
   * تُخزَّن في إعدادٍ تُنسى فتكذب بعد سفرٍ أو تحوّلٍ صيفيّ. فالتحويلُ
   * هنا، حيث المنطقةُ معروفةٌ يقينا وتُقرأ لحظتَها.
   *
   * «والدوالُّ الثلاثُ خالصة»: تأخذ لحظةً وتردّ لحظةً، ولا تمسّ صفحةً
   * ولا شبكة. فهي تُنتزَع من هذا النصّ عينِه وتُختبَر — كما يُنتزَع
   * العدّاد (D-071). ونسخةٌ ثانيةٌ في الاختبار تفترق بلا حارس.
   */
  function pad2(n){return (n<10?'0':'')+n;}
  function utcBox(d){
    return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())
      +'T'+pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes());
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
    var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]));
    /*
     * «والشكلُ ليس صحّة»: «2026-13-40T99:99» يوافق النمطَ، و«Date.UTC»
     * يدحرجه إلى فبراير ٢٠٢٧ — «فتقول المرآةُ تاريخا واثقا لا علاقةَ له
     * بما كُتب». فيُقارَن الذهابُ بالإياب: ما لم يُعِد الرقمَ نفسَه فليس
     * لحظةً، وصمتٌ خيرٌ من رقمٍ يُصدَّق.
     */
    return utcBox(d)===v.slice(0,16)?d:null;
  }

  document.querySelectorAll('.quick').forEach(function(bar){
    var field=document.getElementById(bar.dataset.quick);
    var mirror=bar.parentNode.querySelector('[data-mirror="'+bar.dataset.quick+'"]');
    if(!field)return;
    function reflect(){
      if(!mirror)return;
      var at=boxToDate(field.value);
      if(at===null){mirror.textContent='';return;}
      /*
       * «والرقمان حاضران معا»: الصندوقُ UTC والمرآةُ محلّيّة. ومَن
       * أظهر واحدا وأخفى الآخر جعل المالكَ يحوّل ذهنيّا كما كان.
       */
      try{
        mirror.textContent='= '+at.toLocaleString('ar',{weekday:'long',day:'numeric',
          month:'long',hour:'numeric',minute:'2-digit'})+' بتوقيتك';
      }catch(e){mirror.textContent='';}
    }
    bar.querySelectorAll('[data-preset]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var at=preset(new Date(),btn.dataset.preset);
        if(at===null)return;
        field.value=utcBox(at);
        reflect();
      });
    });
    field.addEventListener('input',reflect);
    reflect();
  });
})();
`

// ── صفحة الدخول ──────────────────────────────────────────

export interface LoginState {
  readonly error?: string
  readonly blocked?: boolean
  /** أثمّة مفاتيحُ مرورٍ مسجَّلة؟ فيُعرض بابُها قبل حقل الرمز. */
  readonly passkeys?: boolean
}

/**
 * سكربتُ الدخول بمفتاح مرور.
 *
 * ونداءٌ واحدٌ إلى أصلنا، ولا شيء غيره — و`connect-src 'self'` تفرضه.
 */
const LOGIN_SCRIPT = `
(function(){
  var b64u=function(buf){
    var bytes=new Uint8Array(buf),s='';
    for(var i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  };
  var fromB64u=function(v){
    var s=v.replace(/-/g,'+').replace(/_/g,'/');
    s+='='.repeat((4-s.length%4)%4);
    var bin=atob(s),out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return out;
  };
  var btn=document.getElementById('pk-login');
  var note=document.getElementById('pk-note');
  if(!btn)return;
  if(!window.PublicKeyCredential){btn.disabled=true;
    if(note)note.textContent='متصفّحك لا يدعم مفاتيح المرور — استعمل الرمز.'; return;}
  btn.addEventListener('click',function(){
    btn.disabled=true; btn.textContent='المس مفتاحك…';
    var reset=function(msg){btn.disabled=false; btn.textContent='الدخول بمفتاح المرور';
      if(note)note.textContent=msg;};
    fetch('/panel/passkey/challenge',{method:'POST'}).then(function(r){
      if(!r.ok)throw new Error('challenge');
      return r.json();
    }).then(function(d){
      return navigator.credentials.get({publicKey:{
        challenge:fromB64u(d.challenge), rpId:d.rpId, userVerification:'preferred',
        timeout:60000,
        allowCredentials:d.allowCredentials.map(function(id){
          return {id:fromB64u(id), type:'public-key'};})
      }}).then(function(cred){return {cred:cred, ticket:d.ticket};});
    }).then(function(x){
      var r=x.cred.response;
      return fetch('/panel/passkey/login',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ticket:x.ticket, credentialId:x.cred.id,
          authenticatorData:b64u(r.authenticatorData),
          clientDataJSON:b64u(r.clientDataJSON), signature:b64u(r.signature)})});
    }).then(function(r){
      if(r.ok){location.href='/panel'; return;}
      return r.json().then(function(e){reset(e.detail||'رُفض المفتاح.');});
    }).catch(function(err){reset('تعذّر: '+(err&&err.name?err.name:'أُلغي'));});
  });
})();
`

export function loginPage(state: LoginState = {}, nonce = ''): string {
  const passkey =
    state.passkeys !== true || state.blocked === true
      ? ''
      : `<button class="p" id="pk-login" type="button">الدخول بمفتاح المرور</button>
         <div class="n" id="pk-note" role="status" aria-live="polite"></div>
         <div class="or">أو بالرمز</div>`

  const note =
    state.error === undefined
      ? ''
      : `<div class="flash ${state.blocked === true ? 'bad' : 'warn'}" role="alert">
           <span class="ic">${state.blocked === true ? '✕' : '!'}</span>
           <span>${escapeHtml(state.error)}</span></div>`
  const disabled = state.blocked === true ? ' disabled' : ''
  return shell(
    'صدى — الدخول',
    `<div class="wrap"><div class="auth">
      <div class="glyph">${GLYPH_SVG}</div>
      <h1>لوحة التحكّم</h1>
      <p class="lede">أدخل رمز الإدارة للمتابعة</p>
      ${note}
      <div class="card">
        ${passkey}
        <form method="POST" action="/panel/login">
          <div class="field"><label for="t">رمزُ الإدارة <span class="mono">ADMIN_TOKEN</span></label>
            <input id="t" type="password" name="token" autocomplete="current-password"
                   required autofocus${disabled}></div>
          <button class="p" type="submit"${disabled}>دخول</button>
        </form>
      </div>
      <footer style="border:0;justify-content:center">الجلسة ثماني ساعات</footer>
    </div></div>`,
    nonce,
    state.passkeys === true ? LOGIN_SCRIPT : '',
  )
}

// ── الصفحة الرئيسة ───────────────────────────────────────

export interface PanelSource {
  readonly id: string
  readonly driveFileId: string
  readonly name: string
  readonly analyzed: boolean
  readonly stale: boolean
  readonly worth: number | null
  readonly summary: string | null
  readonly reason: string | null
  readonly themes: string[]
  readonly lastSeenAt: string
}

export interface PanelProvider {
  readonly name: string
  readonly label: string
  readonly kind: 'anthropic' | 'openai_compat'
  readonly baseUrl: string | null
  readonly model: string | null
  /** مدمَجٌ في الشيفرة: لا يُحذف ولا يُبدَّل عنوانه. */
  readonly builtin: boolean
  readonly configured: boolean
  readonly secretName: string | null
  readonly howToGet: string
  readonly calls: number
  readonly spend: number
  readonly source: 'worker_secret' | 'vault' | 'none'
  /** «AIzaSy…7f2a» — أوّله وآخره. ولا يوجد الوسط مقروءا في أيّ مكان. */
  readonly hint: string | null
  readonly enabled: boolean
  readonly dailyCap: number | null
  readonly priceIn: number | null
  readonly priceOut: number | null
  readonly spendToday: number
  readonly verifiedAt: string | null
  readonly updatedAt: string | null
}

export interface PanelFlash {
  readonly kind: 'ok' | 'warn' | 'bad'
  readonly text: string
  /**
   * فعلٌ يُتراجَع عنه — **والنافذةُ نافذةُ الإشعار نفسِها** (D-100).
   *
   * ## ولا عدّادَ ثوانٍ
   *
   * وُعِد في الخطّة بشريطٍ يعطي ثمانيَ ثوانٍ. **وعدّادٌ في المتصفّح يَعِد
   * بما لا يملك**: يُغلق التبويبُ فيسقط، وتُبطئ الشبكةُ فينفد قبل أن
   * تُرسَم الصفحة. والحقيقةُ أنّ النافذة **نافذةُ الإشعار في KV** — دقيقةٌ
   * واحدة، ويُستهلَك عند أوّل قراءة.
   *
   * فالتراجعُ متاحٌ ما دام الإشعارُ معروضا، **ويذهب بذهابه**. وهذا ما
   * يقع فعلا، فهو ما يُقال.
   *
   * ## والحارسُ في القاعدة لا في الزرّ
   *
   * `undoReject` تشترط أنّ الحالَ `rejected` الآن. فإشعارٌ شاخ في تبويبٍ
   * منسيٍّ لا يقلب حالا تبدّلت بعده.
   */
  readonly undo?: {
    /** المسارُ الذي يُرسَل إليه — ولا يُبنى في المتصفّح. */
    readonly action: string
    readonly id: string
    readonly label: string
  }
}

export interface PanelData {
  readonly paused: boolean
  readonly autoEnqueue: boolean
  /** أيُركَّب العنوانُ العربيُّ فوق الصورة؟ (D-085) */
  readonly imageOverlay: boolean
  /** أمضبوطٌ رمزُ المتصفّح؟ **وجودُه يُفحَص، وقيمتُه لا تغادر البيئة**. */
  readonly browserToken: boolean
  readonly analysisCap: number
  readonly spendCap: number
  readonly usedAnalyses: number
  readonly usedSpend: number
  readonly spend30d: number
  readonly series: { day: string; total: number }[]
  readonly sources: PanelSource[]
  readonly providers: PanelProvider[]
  readonly routing: {
    task: string; provider: string; model: string
    why: string; ready: boolean; implemented: boolean
  }[]
  readonly knownProviders: { name: string; label: string }[]
  readonly drafts: readonly DraftRow[]
  /**
   * ساعاتُ الذروة لكلّ منصّةٍ في المسوّدات (D-106) — **مقيسةٌ أو صامتة**.
   *
   * واختياريّةٌ لأنّ الشاشاتِ الفرعيّةَ لا تجدول، **وحقلٌ إلزاميٌّ يُملأ
   * بفراغٍ في نصف المواضع حقلٌ يكذب**.
   */
  readonly peaks?: Readonly<Record<string, Peaks>>
  /** عنوانُ قناة التنبيهات (D-109) — وفارغٌ يعني «لا قناة». */
  readonly alertWebhook: string
  /** بطاقاتُ لوح المالك بمعرِّفاتها (D-119) — **مصفّاةً**. */
  readonly dashboardTiles: string
  /** اللوحُ المحوريّ: جدولُه ومواصفتُه (D-120). */
  readonly pivot: PivotView
  /** آخرُ ما خرج من الصندوق — **ولا صمتٌ يُظنّ نجاحا**. */
  readonly outbox: readonly OutboxRow[]
  /** الوجهاتُ الحيّة للجدولة — مربوطةٌ وإذنُها قائم. */
  readonly targets: readonly Target[]
  /** منصّاتٌ حساباتُها الحيّةُ صفحاتٌ لا أشخاص — فالنشرُ باسمها لم يُبنَ (D-087). */
  readonly pageOnly: readonly string[]
  /** الصورُ المولَّدة لهذه المسوّدات. */
  readonly media: readonly MediaView[]
  /** خطّةُ الأسبوع إن وُجدت، وأمزوّدُها جاهز. */
  readonly plan: StoredPlan | null
  readonly planReady: boolean
  /** المصادرُ التي لها خلاصة — وحدها تُكتب منها مسوّدة. */
  readonly writableSources: readonly { id: string; name: string }[]
  /** أمزوّدُ مهمّة `draft` مضبوطٌ ومفعَّل؟ */
  readonly draftReady: boolean
  readonly flash: PanelFlash | null
  readonly now: Date
  /** رمز CSRF لهذه الجلسة — يُحقن في كلّ نموذج. */
  readonly csrf: string
  /** قيمة `nonce` لهذا الردّ وحده. */
  readonly nonce: string
  readonly sessions: PanelSession[]
  readonly audit: PanelAudit[]
  /** النطاق الذي تُوقَّع عليه المفاتيح — يُعرض ليُعرف أنّه ليس الآخر. */
  readonly rpId: string
  readonly via: 'admin_token' | 'passkey'
  readonly factors: PanelFactors
  readonly channels: readonly ChannelView[]
  /** حالُ تطبيقَي OAuth — بلا سرٍّ ولا فكِّ تشفير. */
  readonly apps: readonly AppStatus[]
  /** أصلُ اللوحة — يُبنى منه رابطُ العودة المعروض للنسخ. */
  readonly baseUrl: string
  /** كم توصيةَ ترويجٍ تنتظر بتّك — عددٌ على رابط التقرير (D-058). */
  readonly openSuggestions: number
  /**
   * رموزٌ تقترب من الانتهاء — **تُعرَض في صدر اللوحة لا في شاشةٍ تُفتَح.**
   *
   * وسقوطُ رمزِ تجديدٍ **يوقف المنصّة حتّى يجلس المالكُ إليها**، فلا
   * يُترك في صفحةٍ قد لا تُفتَح قبل أن يقع (D-065).
   */
  readonly expiring: readonly {
    readonly platform: string
    readonly displayName: string
    readonly kind: 'access' | 'refresh'
    readonly daysLeft: number
  }[]
  /** سقفُ الترويج الأسبوعيّ — ومنه وحده يأتي مبلغُ التوصية. */
  readonly promoCap: number
  /**
   * كم مهمّةً **يُعرَف** أنّها على المالك — ولا يُعدّ فيها ما لا يُعرَف.
   *
   * وعدٌّ يشمل المجهولَ يجعل الرقمَ لا ينزل أبدا، **فيُهمَل** (D-063).
   */
  readonly ownerPending: number
  /**
   * معرّفُ حساب Cloudflare إن كان مضبوطا — يُملأ به عنوانُ نموذجه.
   *
   * **وليس سرّا**: هو في كلّ عنوانٍ يُنادى، وفي لوحة Cloudflare نفسِها.
   * والسرُّ هو الرمز، ولا يمرّ من هنا (D-005).
   */
  readonly cfAccountId: string | null
}

export interface PanelFactors {
  readonly passkeys: {
    id: string; label: string; createdAt: string; lastUsedAt: string | null
  }[]
  readonly totpConfirmed: boolean
  readonly recoveryLeft: number
  readonly enforced: boolean
}

export interface PanelSession {
  readonly id: string
  readonly at: string
  readonly ip: string
  readonly ua: string
  readonly via: 'admin_token' | 'passkey'
  readonly current: boolean
}

export interface PanelAudit {
  readonly at: string
  readonly actor: string
  readonly action: string
  readonly target: string | null
  readonly detail: string | null
  readonly ip: string | null
}

/**
 * اسمُ الفعل بالعربيّة.
 *
 * والقاموس ناقصٌ عمدا: فعلٌ لا اسمَ له يُعرض باسمه الحرفيّ لا بـ«غير
 * معروف». سجلٌّ يُخفي ما لا يفهمه ليس سجلّا.
 */

/**
 * رسمُ منطقةٍ صغير للإنفاق.
 *
 * السلسلة كاملةٌ بأصفارها: خطٌّ يقفز فوق يومٍ خالٍ يوصل الاثنين بالأربعاء
 * وكأنّ الثلاثاء لم يكن. **وسلسلةٌ كلّها أصفار تُرسم خطّا عند القاع**، لا
 * قمّةً كاذبة من قسمةٍ على صفر.
 */

/** درجةٌ مقياسُ مقدار: تدرّجُ هيئةٍ واحدة، والرقم بلون النصّ لا بلون العلامة. */
function worthCell(worth: number | null): string {
  if (worth === null) return '<span class="st idle"><span class="g">○</span>لم يُحلَّل</span>'
  const p = Math.round(worth * 100)
  const shade = worth >= 0.66 ? 'var(--brand)' : worth >= 0.33 ? 'var(--brand-soft)' : 'var(--ink-3)'
  return `<div class="worth" title="درجة الاستحقاق ${worth.toFixed(2)} من 1">
    <div class="track"><span class="fill" style="width:${p}%;background:${shade}"></span></div>
    <span class="val">${worth.toFixed(2)}</span></div>`
}

function sourceRow(s: PanelSource, now: Date): string {
  const pending = !s.analyzed || s.stale
  const status = s.stale
    ? '<span class="st warn"><span class="g">▲</span>تغيّر بعد التحليل</span>'
    : s.analyzed
      ? '<span class="st ok"><span class="g">●</span>محلَّل</span>'
      : '<span class="st idle"><span class="g">○</span>ينتظر</span>'

  const themes = s.themes.slice(0, 5).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')
  const body = s.summary === null
    ? ''
    : `<div class="sub">${escapeHtml(s.summary)}</div>` +
      (s.reason === null ? '' : `<div class="sub">— ${escapeHtml(s.reason)}</div>`) +
      (themes === '' ? '' : `<div style="margin-top:var(--s-1)">${themes}</div>`)

  const action = pending
    ? `<form class="inline" method="POST" action="/panel/analyze" data-busy="جارٍ…">
         <input type="hidden" name="id" value="${escapeHtml(s.id)}">
         <button class="g sm" type="submit">حلّل الآن</button></form>`
    : ''
  /*
   * **«افتح في Drive»** (D-126): المعرِّفُ في اليد والرابطُ ثابتُ الصيغة،
   * ويفتح في تبويبٍ جديدٍ بأيقونة المغادرة — كرابط بوّابة المطوّرين.
   * **ومعرِّفٌ لا يوافق صيغةَ Drive لا يصير رابطًا.**
   */
  const drive = driveFileUrl(s.driveFileId)
  const open = drive === null
    ? ''
    : `<a class="btn g sm" href="${escapeHtml(drive)}" target="_blank" rel="noopener noreferrer"
         aria-label="افتح ${escapeHtml(s.name)} في Drive">${ICON.external} افتح في Drive</a>`
  const acts = `${action}${open}`

  const seen = Date.parse(s.lastSeenAt.replace(' ', 'T') + 'Z') || 0
  return `<tr data-pending="${pending ? '1' : '0'}" data-worth="${s.worth ?? -1}"
      data-name="${escapeHtml(s.name)}" data-seen="${seen}">
    <td><div class="nm">${escapeHtml(s.name)}</div>
        <div class="mono">${escapeHtml(s.driveFileId)}</div>${body}</td>
    <td data-label="الحال">${status}</td>
    <td data-label="الاستحقاق">${worthCell(s.worth)}</td>
    <td data-label="آخر ظهور"><span title="${escapeHtml(s.lastSeenAt)} UTC">${escapeHtml(relativeTime(s.lastSeenAt, now))}</span></td>
    <td data-label="">${acts === '' ? '<span class="mono">—</span>' : `<div class="row" style="gap:var(--s-2)">${acts}</div>`}</td>
  </tr>`
}

/** أيقوناتُ الرافدة. `currentColor` فتتبع حالَ العنصر والثيم معا. */
/**
 * فرعُ المنصّات في الرافدة.
 *
 * وشاشاتُ المنصّات (D-046) كانت لا تُبلَغ إلّا من بطاقةٍ في لوح
 * القنوات — **فمن لم يفتح اللوحَ لم يعرف أنّها موجودة**. وهي الشاشاتُ
 * التي يُسأل فيها كلَّ يومٍ «ماذا نُشر»، فموضعُها الرافدة.
 *
 * ومطويٌّ افتراضا حيث لا قناةَ مربوطة، مفتوحٌ حيث توجد: **رافدةٌ تفتح
 * سبعةَ أسماءٍ لمن لم يربط شيئا تزحم بلا أن تفيد.**
 *
 * والحالُ نقطةٌ لا نصّ: الاسمُ هو المقروء، والنقطةُ تُقرأ بلمحة. ومعها
 * `title` لقارئ الشاشة — واللونُ وحده لا يقول شيئا.
 */
function platformNav(views: readonly ChannelView[]): string {
  const built = views.filter((v) => v.spec.built)
  const anyLinked = built.some((v) => v.state === 'linked' || v.state === 'needs_reauth')

  const row = (v: ChannelView): string => {
    const dot =
      v.state === 'linked' ? 'ok'
      : v.state === 'needs_reauth' ? 'bad'
      : v.state === 'awaiting_owner' ? 'warn'
      : 'idle'
    const title =
      v.state === 'linked' ? 'مربوطة'
      : v.state === 'needs_reauth' ? 'تحتاج تجديدا'
      : v.state === 'awaiting_owner' ? 'تنتظرك'
      : v.state === 'connectable' ? 'جاهزةٌ للربط'
      : 'لم يُبنَ سائقُها'
    return `<a href="/panel/channels/${escapeHtml(v.spec.id)}">
      <span class="pl">${LOGOS[v.spec.id] ?? ''}</span>
      <span>${escapeHtml(v.spec.label)}</span>
      <span class="dot ${dot}" title="${escapeHtml(title)}"></span></a>`
  }

  return `<details class="plat"${anyLinked ? ' open' : ''}>
    <summary>${ICON.channels}<span>المنصّات</span></summary>
    <div class="plat-list">${views.map(row).join('')}</div>
  </details>`
}



/**
 * فرقُ اليوم عن أمس — **علامةٌ ونصّ**، فالسهم وحده لا يُقرأ بصوتٍ عالٍ.
 *
 * ويُحسب من السلسلة نفسها لا من رقمٍ يُمرَّر: رقمان من مصدرين يتباعدان.
 * ويوما أمسٍ صفران يعنيان «بلا تغيير» لا قسمةً على صفر.
 */
/**
 * صفُّ البطاقات — **كما اختاره المالكُ لا كما كُتب في الملفّ** (D-119).
 *
 * والعرضُ يتبع العدد: أربعٌ في `c4` وثلاثٌ في `c3` واثنتان في `c2`.
 * **وشبكةُ أربعةٍ فيها خمسُ بطاقاتٍ تترك واحدةً وحيدةً في صفٍّ ثانٍ** —
 * وهي عينُ التمزّق الذي حُرِس في D-111.
 */
function tileRow(d: PanelData): string {
  const tiles = chosenTiles(d.dashboardTiles)
  const cols = tiles.length >= 6 ? 'c3' : tiles.length === 5 ? 'c5' : `c${tiles.length}`
  const cards = tiles.map((spec) => {
    const v = spec.of(d, { money })
    return `<div class="card tile"><div class="k">${escapeHtml(spec.label)}</div>
      <div class="v">${escapeHtml(v.value)}${
        v.em === undefined ? '' : `<em> ${escapeHtml(v.em)}</em>`}</div>
      ${v.bar === undefined ? '' : bar(v.bar.used, v.bar.cap, v.bar.full)}
      ${v.delta === true ? deltaOf(d.series) : ''}
      ${v.note === undefined ? '' : `<div class="n">${escapeHtml(v.note)}</div>`}</div>`
  })
  return `<div class="grid ${cols}">${cards.join('')}</div>`
}

/**
 * شاشةُ اختيار البطاقات — **والاختيارُ يُرى قبل أن يُحفَظ** (D-119).
 *
 * **ومربّعاتُ اختيارٍ لا سحبٌ وإفلات.** السحبُ يحتاج جافاسكربت يعمل،
 * **ولوحةٌ تُضبَط بالسحب وحدَه لا تُضبَط بلوحة المفاتيح ولا بقارئ
 * الشاشة**. والترتيبُ يتبع ترتيبَ الكتالوج — وهو ترتيبٌ مقصود.
 *
 * **والحدُّ يُقال قبل أن يُردّ**: «ستّ على الأكثر» مكتوبةٌ فوق المربّعات،
 * لا رسالةَ خطأ بعد الضغط.
 */
function tilePicker(d: PanelData): string {
  const chosen = new Set(chosenTiles(d.dashboardTiles).map((t) => t.id))
  const boxes = TILES.map((spec) => {
    const on = chosen.has(spec.id)
    return `<label class="tpick${on ? ' on' : ''}">
      <input type="checkbox" name="tile" value="${escapeHtml(spec.id)}"${on ? ' checked' : ''}>
      <span class="tp-t"><b>${escapeHtml(spec.label)}</b>
        <span>${escapeHtml(spec.why.replaceAll('**', ''))}</span></span>
    </label>`
  }).join('')
  return `<div class="card" style="margin-top:var(--s-3)"><h2>بطاقاتُ لوحك</h2>
    <p class="hint">ما تراه في صدر «نظرة عامّة». اختر من ${TILE_MIN} إلى ${TILE_MAX}،
      وترتيبُها ترتيبُ هذه القائمة.</p>
    <form method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="dashboard_tiles">
      <div class="tgrid">${boxes}</div>
      <div class="row" style="margin-top:var(--s-4)">
        <button class="p" type="submit">احفظ لوحي</button>
        <span class="n" style="align-self:center">
          وما دون ${TILE_MIN} يعود إلى الأربع الأصليّة — فلا شاشةَ فارغة.</span>
      </div>
    </form>
  </div>`
}

function deltaOf(series: readonly { day: string; total: number }[]): string {
  if (series.length < 2) return ''
  const today = series[series.length - 1]!.total
  const yesterday = series[series.length - 2]!.total
  if (yesterday === 0 && today === 0) return '<div class="delta">كأمس تماما</div>'
  if (yesterday === 0) return `<div class="delta up"><span class="ar">▲</span>بدأ اليوم</div>`
  const change = ((today - yesterday) / yesterday) * 100
  if (Math.abs(change) < 1) return '<div class="delta">كأمس تقريبا</div>'
  const up = change > 0
  return `<div class="delta ${up ? 'up' : 'down'}"><span class="ar">${up ? '▲' : '▼'}</span>${
    Math.abs(change).toFixed(0)}٪ ${up ? 'أكثر' : 'أقلّ'} من أمس</div>`
}

export function panelPage(d: PanelData): string {
  const pending = d.sources.filter((s) => !s.analyzed || s.stale).length
  const ready = d.sources.length - pending
  const missing = d.providers.filter((p) => !p.configured).length
  const waitingDrafts = d.drafts.filter((x) => x.status === 'draft').length

  // منطقة الإعلان تُنشأ دائما وإن كانت فارغة: قارئ الشاشة لا يعلن ما ظهر
  // في منطقةٍ وُلدت معه — الحيّةُ يجب أن تسبق الرسالة لا أن تأتي بها
  /**
   * شريطُ الرموز المقتربة — **فوق كلّ شيءٍ في اللوحة.**
   *
   * ولا يُخفى خلف زرّ: سقوطُ رمزِ تجديدٍ يوقف المنصّة، **وأوّلُ علامةٍ
   * بغير هذا منشورٌ وُعد بموعده ولم يخرج**.
   *
   * والتجديدُ يُعرَض `bad` والوصولُ `warn`: **الأوّلُ يوجب يدَك،
   * والثاني يُصلحه النظامُ وحده** — ولا يُسوَّى بينهما فيُقرآن سواء.
   */
  const expiring = d.expiring.length === 0 ? '' : `<div class="flash ${
    d.expiring.some((e) => e.kind === 'refresh') ? 'bad' : 'warn'
  }" role="alert"><span class="ic">!</span><span>${
    d.expiring
      .slice(0, 3)
      .map((e) => {
        const what = e.kind === 'refresh' ? 'رمزُ التجديد' : 'رمزُ الوصول'
        const when = e.daysLeft < 0
          ? '<b>انتهى</b>'
          : e.daysLeft === 0
            ? '<b>ينتهي اليوم</b>'
            : `يبقى <b>${e.daysLeft}</b> يوما`
        const why = e.kind === 'refresh'
          ? ' — <b>ويوجب سقوطُه دورةَ إذنٍ بيدك</b>'
          : ''
        return `${what} لـ<b>${escapeHtml(e.displayName)}</b>
                (${escapeHtml(e.platform)}): ${when}${why}`
      })
      .join(' · ')
  }${
    d.expiring.length > 3 ? ` · <b>و${d.expiring.length - 3} غيرُها</b>` : ''
  } <a class="tap" href="#channels">جدّد الإذن</a></span></div>`

  const flash = `${expiring}<div id="flash" role="status" aria-live="polite">${
    d.flash === null
      ? ''
      : `<div class="flash ${d.flash.kind}">
           <span class="ic">${d.flash.kind === 'ok' ? '✓' : d.flash.kind === 'warn' ? '!' : '✕'}</span>
           <span>${escapeHtml(d.flash.text)}</span>
           ${
             d.flash.undo === undefined
               ? ''
               : `<span class="grow"></span>
                  <form class="inline" method="POST" action="${escapeHtml(d.flash.undo.action)}"
                        data-busy="جارٍ…">
                    <input type="hidden" name="id" value="${escapeHtml(d.flash.undo.id)}">
                    <button class="g sm" type="submit">${escapeHtml(d.flash.undo.label)}</button>
                  </form>`
           }</div>`
  }</div>`

  const state = d.paused
    ? '<span class="pill off"><i class="led"></i>موقوف مؤقتا</span>'
    : '<span class="pill on"><i class="led"></i>يعمل</span>'

  const scanBtn = `<form class="inline" method="POST" action="/panel/scan" data-busy="جارٍ المسح…">
      <button class="g sm" type="submit">مسح Drive الآن</button></form>`

  const sourcesTable = d.sources.length === 0
    ? `<div class="empty"><b>لا مصادر بعد</b>
         <p>صدى تقرأ مجلد Drive المشترَك معها. شغّل المسح ليظهر ما فيه.</p>
         <form class="inline" method="POST" action="/panel/scan" data-busy="جارٍ المسح…">
           <button class="p" type="submit">مسح Drive الآن</button></form></div>`
    : `<div class="row" style="margin-bottom:var(--s-3)">
         <div class="field"><label for="flt">التصفية</label>
           <select id="flt"><option value="all">الكلّ</option>
             <option value="pending">ما ينتظر تحليلا</option>
             <option value="analyzed">المحلَّل</option></select></div>
         <div class="field"><label for="srt">الفرز</label>
           <select id="srt"><option value="seen">الأحدث مسحا</option>
             <option value="worth">الأعلى استحقاقا</option>
             <option value="name">الاسم</option></select></div>
         <div class="grow"></div>
         <div class="tile" style="text-align:left">
           <span class="n">يُعرض <b id="shown">${d.sources.length}</b> من ${d.sources.length}</span></div>
       </div>
       <div class="scroll"><table>
         <thead><tr><th>المصدر</th><th>الحال</th><th>الاستحقاق</th><th>آخر مسح</th><th></th></tr></thead>
         <tbody id="src-body">${d.sources.map((s) => sourceRow(s, d.now)).join('')}</tbody>
       </table></div>`

  const { strip: providerStrip, rows: providerRows, add: addCard, routing: routingRows } =
    providersSection(d)
  const linkedChannels = d.channels.filter(
    (c) => c.state === 'linked' || c.state === 'needs_reauth',
  ).length

  /**
   * «ما ينتظرك» — مولَّدةٌ من الحال لا مكتوبةٌ سلفا.
   *
   * وترتيبُها بالخطورة لا بالقسم: ما يوقف النظام صامتا أوّلا، ثمّ ما
   * يمنع النشر، ثمّ ما هو تحسين. ومالكٌ يفتح اللوحة صباحا يقرأ سطرا
   * واحدا فيعرف أين يذهب.
   */
  const items: { kind: 'bad' | 'warn' | 'ok'; text: string; go?: string; label?: string }[] = []

  const stale = d.channels.filter((c) => c.state === 'needs_reauth')
  for (const c of stale) {
    items.push({
      kind: 'bad',
      text: `${c.spec.label}: انتهى الإذن — والنشرُ متوقّفٌ عليها.`,
      go: '#channels',
      label: 'جدّد',
    })
  }
  if (d.paused) {
    items.push({ kind: 'warn', text: 'النظام موقوفٌ مؤقّتا — لا مسح ولا تحليل ولا نشر.', go: '#settings', label: 'استأنف' })
  }
  if (!d.factors.enforced) {
    items.push({
      kind: 'warn',
      text: 'لا عاملَ ثانٍ: الرمزُ وحده يفتح اللوحة.',
      go: '#security',
      label: 'سجّل مفتاحا',
    })
  }
  if (linkedChannels === 0) {
    items.push({ kind: 'warn', text: 'لا قناةَ مربوطة — النظام يفهم ويكتب ولا ينشر.', go: '#channels', label: 'اربط' })
  }
  const unverified = d.providers.filter((p) => p.configured && p.enabled && p.verifiedAt === null)
  for (const p of unverified) {
    items.push({ kind: 'warn', text: `${p.label}: مفتاحُه لم يُختبر بعد.`, go: '#providers', label: 'اختبره' })
  }
  if (waitingDrafts > 0) {
    items.push({
      kind: 'ok',
      text: `${waitingDrafts} مسوّدة تنتظر قرارك — ولا تُنشر واحدةٌ منها قبله.`,
      go: '#posts',
      label: 'اقرأها',
    })
  }
  if (pending > 0) {
    items.push({ kind: 'ok', text: `${pending} مصدرا ينتظر تحليلا.`, go: '#sources', label: 'راجعها' })
  }
  if (d.factors.enforced && d.factors.recoveryLeft === 0) {
    items.push({ kind: 'warn', text: 'لا رموزَ استرداد — فقدُ الجهاز يصير قفلا نهائيّا.', go: '#security', label: 'ولّدها' })
  }

  /*
   * **اليومُ الأوّل يُشتَقّ ممّا قُرئ — ولا استعلامَ جديد** (D-108).
   *
   * الخمسُ كلُّها من حقائقَ في اليد: مصادرُ وحساباتٌ وخطّةٌ ومسوّدات.
   * **واستعلامٌ يُضاف لمعالجٍ يختفي بعد أسبوعٍ ثمنٌ يُدفَع كلَّ يوم.**
   */
  const first = onboarding({
    sources: d.sources.length,
    analyzed: d.sources.filter((x) => x.analyzed).length,
    liveAccounts: d.channels.reduce(
      (n, c) => n + c.accounts.filter((a) => a.status === 'active').length, 0,
    ),
    hasPlan: d.plan !== null,
    decided: d.drafts.filter((x) => x.status !== 'draft').length,
    drafts: d.drafts.filter((x) => x.status === 'draft').length,
  })

  const todo = items
    .map((i) => `<li><span class="dot ${i.kind}"></span><span>${escapeHtml(i.text)}</span>
      ${i.go === undefined ? '' : `<a class="btn g sm" href="${i.go}">${escapeHtml(i.label ?? 'اذهب')}</a>`}</li>`)
    .join('')

  const { sessions: sessionRows, passkeys: passkeyRows, audit: auditRows } =
    securitySection(d)

  const nav = (href: string, icon: string, text: string, count = 0, attrs = ''): string =>
    `<a href="${href}"${attrs}>${icon}<span>${text}</span>${
      count > 0 ? `<span class="count">${count}</span>` : ''
    }</a>`

  /*
   * **الرافدةُ تُرسَم من جدول الأقسام** (D-105) — لا من عشرة أسطرٍ بيد.
   *
   * والفهرسُ يُبنى من الجدول نفسِه، **فقسمٌ يُضاف في مكانٍ واحدٍ يظهر
   * في الاثنين**. ولو كُتبا مفترقَين لبقي القسمُ الجديدُ خارجَ اللوحة،
   * **ولا حارسَ يمسك غيابا**: لوحةٌ لا تجده تبدو ناقصةَ الفهرسة لا
   * معطوبة، فلا يُشتكى منها — وتشيخ صامتة.
   */
  const counts: Readonly<Record<string, number>> = {
    sources: pending,
    posts: waitingDrafts,
    channels: linkedChannels,
    report: d.openSuggestions,
    tasks: d.ownerPending,
    providers: missing,
    security: d.sessions.length > 1 ? d.sessions.length : 0,
  }
  let lastGroup = ''
  const tabs = SECTIONS.map((s) => {
    const head = s.group === lastGroup ? '' : `<span class="lbl">${s.group}</span>`
    lastGroup = s.group
    // ‏أزرارُ المنصّات تتبع «القنوات» لأنّها تفريعٌ عنها لا قسمٌ ثالث
    const after = s.id === 'channels' ? platformNav(d.channels) : ''
    /*
     * **وسمةُ الشريط تُقرأ من الجدول** (D-107): الرافدةُ نفسُها تصير
     * شريطا سفليّا في الجوّال، **ولا وسمَ ثانٍ يُبنى** — فقسمٌ يُضاف
     * مرّةً يدخل الثلاثةَ: الرافدةَ واللوحةَ والشريط.
     */
    const bar = s.bar === true ? ' data-bar' : ''
    return head +
      nav(s.page ?? `#${s.id}`, s.icon, s.short ?? s.label, counts[s.id] ?? 0, bar) + after
  }).join('\n    ')

  const body = `
<a class="skip" href="#main">تخطّي إلى المحتوى</a>
<div class="app">

<aside class="rail">
  <div class="rail-head">
    <div class="glyph">${GLYPH_SVG}</div>
    <div class="brand"><b>صدى</b><span>SADA · STAGING</span></div>
  </div>
  <nav class="tabs" aria-label="أقسام اللوحة">
    ${tabs}
    ${commandMore()}
  </nav>
  <div class="rail-foot">${themeSwitch()}${densitySwitch()}</div>
</aside>

<div class="main">
<header class="topbar">
  ${/*
    * **والعلامةُ حاضرةٌ في كلّ عرض** (D-123). رأسُ الرافدة يختفي في
    * الجوّال (D-107) فلم يبقَ في الشاشة ما يقول «هذه صدى» — ثلاثون
    * بكسلا في شريطٍ ارتفاعُه ستّون لا تُشترى بشيء. وفي المكتب تُخفى:
    * علامتان في شاشةٍ واحدة تكرار.
    */''}
  <div class="glyph tb" aria-hidden="true">${GLYPH_SVG}</div>
  <div class="ttl"><h1 id="pane-title">نظرة عامّة</h1>
    <div class="crumb">${escapeHtml(d.rpId)}</div></div>
  <div class="grow"></div>
  ${commandTrigger()}
  ${state}
  <form class="inline" method="POST" action="/panel/logout">
    <button class="g sm" type="submit">خروج</button></form>
</header>

<main id="main" class="content">
${flash}
<section data-pane="overview" hidden>
  ${firstDay(first)}
  ${/*
    * **الشاشةُ اليوميّةُ تبدأ بجوابها** (D-114).
    *
    * ورأسُ الصفحة بُني لعلّةٍ صحيحة: صفحةٌ تفتح في وسطها بلا عنوان. لكنّه
    * على هذا اللوح **يعيد ما قيل مرّتين**: «نظرة عامّة» في `#pane-title`
    * فوقه، و«لوحةُ صدى» في الشريط الجانبيّ يمينَه. فقِيس أوّلُ مؤشّرٍ عند
    * ‏٣٩٨px — **أكثرُ من ثلث الشاشة قبل أوّل رقم**، وأربعةُ أرقامٍ فيما بقي.
    *
    * فيسقط المكرَّرُ وحدَه ويبقى السطر: **هو الذي يقول ما هذه الشاشة**،
    * وهو وحدَه ما لا يُقال في مكانٍ آخر. ولا يسقط على غيره من الألواح —
    * تلك تُفتَح قصدا فتحتمل رأسا، **وهذا يُفتَح كلَّ صباح.**
    */''}
  <p class="lede lede-lead">حالُ اليوم في سطر: ما أُنفق، وما حُلّل، وما ينتظر قرارك.
    <b>ولا يُنشر شيءٌ من هنا بلا موافقةٍ مسجّلة.</b></p>
  ${tileRow(d)}
  <div class="grid c2" style="margin-top:var(--s-3)">
    <div class="card"><h2>ما ينتظرك</h2>
      <p class="hint">مولَّدٌ من حال النظام الآن — لا قائمةٌ ثابتة</p>
      ${todo === ''
        ? '<div class="empty"><b>لا شيء ينتظر</b><p>كلّ ما بُني مضبوط.</p></div>'
        : `<ul class="todo">${todo}</ul>`}</div>
    <div class="card"><h2>الإنفاق — أربعة عشر يوما</h2>
      <p class="hint">كلّ المزوّدين، بالدولار</p>${areaChart(d.series)}
      <div class="row" style="margin-top:var(--s-3)">${scanBtn}
        <a class="btn g sm" href="#sources">مراجعة المصادر</a></div></div>
  </div>

  <div class="card" style="margin-top:var(--s-3)">
    <div class="card-head"><h2>أين يذهب المال</h2><div class="grow"></div>
      <span class="st idle">٣٠ يوما</span></div>
    <p class="hint">إنفاقُ كلّ مزوّدٍ على حدة. <b>والسؤالُ «أيُّها أكبر» لا
      «كيف تغيّر»</b> — فأعمدةٌ لا خطّ: ليس بين مزوّدين زمنٌ يمرّ.</p>
    ${barChart(d.providers.map((p) => ({ label: p.label, value: p.spend })), { unit: 'money' })}
  </div>
</section>

${pivotPane(d.pivot)}

<section data-pane="sources" hidden>
  ${pageHead('Google Drive', 'المصادر والتحليل', 'ما رآه صدى في مجلّدك، وما استحقّ منه نشرا. <b>والتحليلُ نداءٌ مدفوع</b> — فلا يقع تلقائيّا على كلّ ملفّ.')}
  ${/*
    * **ولا يُقال العنوانُ مرّتين** (D-122). كانت الترويسةُ هنا
    * «المصادر والتحليل» — **وهي عنوانُ اللوح نفسُه فوقها**. فيقول
    * الجدولُ ما فيه هو، لا ما في الشاشة كلِّها.
    */''}
  <div class="card"><div class="card-head"><h2>ملفّاتُ مجلّدك</h2><div class="grow"></div>${scanBtn}</div>
    ${sourcesTable}</div>
</section>

<section data-pane="providers" hidden>
  ${pageHead('الذكاء', 'المزوّدون والتوجيه', 'أيُّ نموذجٍ ينفّذ كلَّ مهمّة، وكم أنفق. <b>وأسرارُ Worker تغلب الخزانة دائما</b>، ولا يُعرض مفتاحٌ كاملا هنا.')}
  ${providerStrip}

  <div class="card"><div class="card-head"><h2>توجيه المهامّ</h2><div class="grow"></div>
      <span class="st idle">القرار</span></div>
    <p class="hint">أيّ مزوّدٍ ونموذجٍ ينفّذ كلَّ مهمّة. <b>والنموذجُ يُختار من درجٍ يُملأ من عندهم</b> —
      اضغط «حدّث» بجانبه.</p>
    <div class="scroll"><table><thead><tr><th>المهمّة</th><th>المزوّد والنموذج</th><th>الحال</th></tr></thead>
      <tbody>${routingRows}</tbody></table></div>
    <div class="sub" style="margin-top:var(--s-3)">والافتراضُ في الشيفرة يعمل حتّى تختار —
      فنظامٌ بجدولٍ فارغ يعمل ولا ينتظر أن يُملأ.</div>
  </div>

  <div class="card" style="margin-top:var(--s-3)">
    <div class="card-head"><h2>المزوّدون</h2><div class="grow"></div>
      <span class="st idle">${d.providers.length} مزوّدا</span></div>
    <p class="hint"><b>أسرارُ Worker تغلب الخزانة دائما</b> — فمفتاحك الأساسيّ يبقى حيث لا تقرؤه هذه
      الشيفرة ولا تعيده Cloudflare، والخزانة للتجريب والتبديل السريع.
      ولا يُعرض مفتاحٌ كاملا هنا ولا يُخزَّن مقروءا: أوّلُه وآخرُه فقط.</p>
    ${providerRows}
  </div>

  <div style="margin-top:var(--s-3)">${addCard}</div>
</section>

<section data-pane="channels" hidden>
  ${pageHead('النشر', 'القنوات والحسابات', 'ما يُنشَر عليه، وما ينتظر ضبطا، وما لم يُبنَ له سائقٌ بعد. <b>ولكلّ قناةٍ شاشتُها</b> — فيها ما نُشر عليها وما تستطيعه.')}
  ${channelsSection(d.channels, d.now, d.apps, d.baseUrl)}
</section>

<section data-pane="posts" hidden>
  ${pageHead('التحرير', 'الخطّة والمسوّدات', 'ما اقترحه صدى للأسبوع، وما كتبه ينتظر قرارك. <b>ولا يمرّ نصٌّ إلى قناةٍ قبل أن تعتمده أو تعدّله.</b>')}
  <div style="margin-bottom:var(--s-3)">${planSection({
    plan: d.plan,
    names: Object.fromEntries(d.sources.map((s) => [s.id, s.name])),
    ready: d.planReady,
    analyzed: d.sources.filter((s) => s.analyzed).length,
    now: d.now,
  })}</div>
  ${draftsSection({
    drafts: d.drafts,
    writable: d.writableSources,
    targets: d.targets,
    pageOnly: d.pageOnly,
    media: d.media,
    // أدنى موعدٍ يقبله المتصفّح: ربعُ ساعةٍ من الآن. ودورةُ الإرسال تدور
    // كلَّ ربع، فموعدٌ أقرب من ذلك يعد بدقّةٍ لا نملكها
    earliest: new Date(d.now.getTime() + 15 * 60_000).toISOString().slice(0, 16),
    now: d.now,
    ready: d.draftReady,
    peaks: d.peaks ?? {},
  })}
</section>

<section data-pane="settings" hidden>
  ${pageHead('الحدود', 'الإيقاف والسقوف', 'مفتاحُ الإيقاف وسقفا اليوم. <b>والقيدُ في الشيفرة لا في هذه الصفحة</b> — يقع قبل النداء لا بعده.')}
  <!-- الترتيبُ بالخطورة لا بتاريخ الكتابة (D-126): ما يوقف النظامَ أوّلًا،
       ثمّ ما يحدّ إنفاقَه، ثمّ ما يطلقه بلا أمر، ثمّ ما يُخبر عنه، ثمّ الشكل -->
  <div class="card"><h2>الإيقاف المؤقت</h2>
    <div class="split">
      <p>${d.paused
        ? 'النظام موقوف: لا نداء مدفوع ولا مسح ولا نشر. والقيد في الشيفرة لا في هذه الصفحة.'
        : 'الإيقاف يمنع كلّ نداء مدفوع فورا — قبل أن يُلمس Drive أو Claude، وفي الطابور و Cron معا.'}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.paused ? 'استئناف عمل النظام؟' : 'إيقاف النظام كلّه؟ سيتوقّف المسح والتحليل والنشر حتّى تستأنفه.'}">
        <input type="hidden" name="key" value="paused">
        <input type="hidden" name="value" value="${d.paused ? 'false' : 'true'}">
        <button class="${d.paused ? 'p' : 'd'}" type="submit">${d.paused ? 'استئناف العمل' : 'إيقاف مؤقت'}</button>
      </form>
    </div>
  </div>

  <div class="card" style="margin-top:var(--s-3)"><h2>الحدود اليوميّة</h2>
    <p class="hint">سقفان لا واحد: مستندٌ ضخم قد يكلّف أكثر من عشرة صغار، وطوفانُ ملفّاتٍ صغيرة يستنزف الحصّة.</p>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="daily_analysis_cap">
      <div class="field"><label for="c1">سقف التحليل (عدد)</label>
        <input id="c1" type="number" name="value" min="0" max="500" step="1" value="${d.analysisCap}"></div>
      <button class="p" type="submit">حفظ</button>
      <span class="n" style="align-self:center">المستهلَك اليوم: ${d.usedAnalyses}</span>
    </form>
    <hr>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="daily_spend_cap_usd">
      <div class="field"><label for="c2">سقف الإنفاق (دولار)</label>
        <input id="c2" type="number" name="value" min="0" max="100" step="0.5" value="${d.spendCap}"></div>
      <button class="p" type="submit">حفظ</button>
      <span class="n" style="align-self:center">المستهلَك اليوم: ${money(d.usedSpend)}</span>
    </form>
  </div>

  <div class="card" style="margin-top:var(--s-3)"><h2>سقف الترويج الأسبوعيّ</h2>
    <p class="hint"><b>ومنه وحده يأتي مبلغُ التوصية.</b> رقمٌ يؤلّفه صدى رقمٌ بلا مصدر —
      والتوصيةُ هنا تقترح <b>مالا</b> لا كتابة. <b>وصفرٌ يعني لا توصيةَ تُكتب أصلا.</b></p>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="weekly_promo_cap_usd">
      <div class="field"><label for="c3">سقف الترويج (دولار في الأسبوع)</label>
        <input id="c3" type="number" name="value" min="0" max="500" step="1"
               value="${d.promoCap}"></div>
      <button class="p" type="submit">حفظ</button>
    </form>
    <div class="sub" style="margin-top:var(--s-3)"><b>ولا يُنفَق منه شيءٌ آليّا</b>:
      لا عميلَ إعلاناتٍ في صدى ولا مفتاحَ يُطلَب (D-006). والتوصيةُ صفٌّ ينتظر بتّك،
      وما تفعله بالمبلغ تفعله في لوحة المنصّة بيدك.</div>
  </div>

  <div class="card" style="margin-top:var(--s-3)"><h2>الإدراج الآليّ</h2>
    <div class="split">
      <p>${d.autoEnqueue
        ? `مرفوع: المسح اليوميّ (٣ فجرا UTC) يُدرج ما تغيّر في طابور الفهم، بما بقي من سقف اليوم لا بما وجد. وما يفيض يُترك لغد.`
        : `مطفأ: المسح يرصد ما تغيّر ولا يحلّل شيئا حتّى تضغط «حلّل الآن». ورفعُه يجعل الخطّ كاملا — مستندٌ تعدّله يظهر محلَّلا في اللوحة صباحا.`}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.autoEnqueue
              ? 'إطفاء الإدراج الآليّ؟ لن يُحلَّل شيء إلا بأمرك.'
              : `رفعُ الإدراج الآليّ؟ سيبدأ إنفاقٌ يوميّ بلا أمرٍ منك، بحدّ ${d.analysisCap} تحليلا و ${money(d.spendCap)} في اليوم.`}">
        <input type="hidden" name="key" value="auto_enqueue">
        <input type="hidden" name="value" value="${d.autoEnqueue ? 'false' : 'true'}">
        <button class="${d.autoEnqueue ? 'g' : 'p'}" type="submit">
          ${d.autoEnqueue ? 'إطفاء' : 'رفع الإدراج الآليّ'}</button>
      </form>
    </div>
    <div class="sub" style="margin-top:var(--s-3)">الحدّ يُقصّ <b>قبل</b> الإرسال لا بعده: حدٌّ يُطبَّق بعد الإنفاق ليس حدّا.</div>
  </div>

  ${alertChannel(d.alertWebhook, d.outbox)}

  ${tilePicker(d)}

  <div class="card" style="margin-top:var(--s-3)"><h2>النصُّ فوق الصورة</h2>
    <div class="split">
      <p>${d.imageOverlay
        ? `مرفوع: يُركَّب عنوانٌ عربيٌّ من كلمتين فوق كلّ صورةٍ مولَّدة، وفوقه كلمتان إنجليزيّتان.
           <b>والنصُّ يُرسَم في متصفّحٍ لا في نموذج التوليد</b> — فالوصلُ صحيحٌ والحروفُ تُقرأ.`
        : `مطفأ: تخرج الصورةُ نظيفةً بلا عنوان. <b>وهذا ليس عطلا</b> — النصُّ في المنشور نفسِه
           حيث يُقرأ ويُترجَم ويبحث عنه محرّك.`}</p>
      <form class="inline" method="POST" action="/panel/settings">
        <input type="hidden" name="key" value="image_overlay">
        <input type="hidden" name="value" value="${d.imageOverlay ? 'false' : 'true'}">
        <button class="${d.imageOverlay ? 'g' : 'p'}" type="submit">
          ${d.imageOverlay ? 'إطفاء' : 'رفع التركيب'}</button>
      </form>
    </div>
    ${d.browserToken
      ? '<div class="sub" style="margin-top:var(--s-3)">رمزُ المتصفّح مضبوط.'
        + ' وكلُّ لقطةٍ تُسجَّل في دفتر الكلفة كسائر النداءات المدفوعة.</div>'
      : `<div class="outcome warn"><span class="k">ينقصك</span><span class="v">
          <span class="mono">CF_BROWSER_TOKEN</span> غيرُ مضبوطٍ في أسرار Worker،
          <b>فلا يقع نداءٌ ولا كلفة</b> — وتخرج الصورةُ بلا عنوانٍ مهما كان هذا المفتاح مرفوعا.
          وصلاحيّتُه <span class="mono">Browser Rendering · Edit</span>،
          <b>وهي غيرُ صلاحيّة Workers AI</b>. وتفصيلُه في «ما عليك».</span></div>`}
  </div>
</section>

<section data-pane="security" hidden>
  ${pageHead('الدخول', 'الأمان والجلسات', 'العاملُ الثاني، والجلساتُ المفتوحة، وسجلُّ ما وقع. <b>والرموزُ مشفّرةٌ في القاعدة</b>، ومفتاحُها في أسرار Worker وحدها.')}
  <div class="card"><h2>الأجهزة المفتوحة</h2>
    <p class="hint">كلّ جلسةٍ حيّة الآن. والجلسة ثماني ساعات ثمّ تنتهي وحدها.</p>
    ${d.sessions.length === 0
      ? '<div class="empty"><b>لا جلسات محفوظة</b><p>قد يكون التخزين لا يدعم الجرد في هذه البيئة.</p></div>'
      : `<div class="scroll"><table>
          <thead><tr><th>الجهاز</th><th>فُتحت</th><th></th></tr></thead>
          <tbody>${sessionRows}</tbody></table></div>`}
    <hr>
    <div class="split">
      <p>إبطالُ الجلسات كلّها عدا جلستك هذه. ويُستعمل إن فقدتَ جهازا أو شككتَ في تسرّب.</p>
      <form class="inline" method="POST" action="/panel/sessions/revoke-all"
            data-confirm="إبطال كلّ الجلسات الأخرى؟ كلّ جهازٍ آخر سيُطلب منه الدخول من جديد.">
        <button class="d" type="submit">أخرِج الأجهزة الأخرى</button></form>
    </div>
  </div>

  <div class="card" style="margin-top:var(--s-3)" id="factors"><h2>العامل الثاني</h2>
    <p class="hint">${d.factors.enforced
      ? 'مفعَّل: الرمز وحده لا يفتح اللوحة — يليه ما يثبت أنّك أنت.'
      : '<b>غير مفعَّل.</b> الرمز وحده يفتح كلّ شيء. سجّل مفتاح مرورٍ أو اضبط رمز تطبيق.'}</p>

    <h3 class="sec">مفاتيح المرور</h3>
    <p class="hint">مقاومةٌ للتصيّد بالبناء: المفتاح موقَّعٌ على
      <span class="mono">${escapeHtml(d.rpId)}</span> — فصفحةٌ مزوّرة على عنوانٍ يشبهه لا تحصل
      على توقيع مهما أتقنت الشكل. <b>ومفتاحٌ تسجّله هنا لا يعمل على البيئة الأخرى</b>؛ لكلٍّ مفتاحها.</p>
    ${d.factors.passkeys.length === 0
      ? '<div class="empty"><b>لا مفاتيح بعد</b></div>'
      : `<div class="scroll"><table>
          <thead><tr><th>المفتاح</th><th>سُجّل</th><th>آخر استعمال</th><th></th></tr></thead>
          <tbody>${passkeyRows}</tbody></table></div>`}
    <div class="row" style="margin-top:var(--s-3)">
      <div class="field"><label for="pk-label">اسمُ الجهاز</label>
        <input id="pk-label" placeholder="هاتفي · مفتاح YubiKey" maxlength="60"></div>
      <button class="p" id="pk-add" type="button">سجّل مفتاحا</button>
    </div>
    <div class="n" id="pk-msg" role="status" aria-live="polite"></div>

    <hr>
    <h3 class="sec">رمز التطبيق (TOTP)</h3>
    <p class="hint">${d.factors.totpConfirmed
      ? 'مضبوطٌ ومؤكَّد. وهو <b>دون مفتاح المرور</b> درجةً: رمزٌ يُقرأ من شاشة يمكن أن يُملى على صفحةٍ مزوّرة. فموضعُه طريقُ رجوعٍ لا بابٌ رئيس.'
      : 'غير مضبوط. اضبطه طريقَ رجوعٍ إن فقدتَ مفتاح المرور.'}</p>
    <div class="row">
      ${d.factors.totpConfirmed
        ? '<button class="d" id="totp-remove" type="button">أزل رمز التطبيق</button>'
        : '<button class="p" id="totp-start" type="button">اضبط رمز التطبيق</button>'}
    </div>
    <div id="totp-box" hidden>
      <div class="field" style="margin-top:var(--s-3)"><label for="totp-secret">السرّ — انسخه إلى تطبيق المصادقة</label>
        <input id="totp-secret" readonly dir="ltr"></div>
      <form class="row" method="POST" action="/panel/security/totp/confirm" id="totp-confirm">
        <div class="field"><label for="totp-code">الرمز الظاهر الآن</label>
          <input id="totp-code" name="code" inputmode="numeric" maxlength="8" autocomplete="off"></div>
        <button class="p" type="submit">أكّد</button>
      </form>
    </div>
    <div class="n" id="totp-msg" role="status" aria-live="polite"></div>

    <hr>
    <h3 class="sec">رموز الاسترداد</h3>
    <p class="hint">${d.factors.recoveryLeft > 0
      ? `بقي <b>${d.factors.recoveryLeft}</b> رمزا غير مستهلَك. تُعرض مرّةً واحدةً حين تُولَّد،
         ولا تُقرأ من القاعدة بعدها — لا لنا ولا لمن سرق نسخةً منها.`
      : 'لا رموزَ استرداد. وبلا طريقِ رجوعٍ يصير فقدُ الجهاز قفلا نهائيّا.'}</p>
    <div class="row">
      <button class="${d.factors.recoveryLeft > 0 ? 'g' : 'p'}" id="rc-issue" type="button">
        ${d.factors.recoveryLeft > 0 ? 'ولّد مجموعةً جديدة' : 'ولّد رموز استرداد'}</button>
    </div>
    <div id="rc-box" hidden><div class="codes" id="rc-list"></div>
      <div class="n"><b>انسخها الآن.</b> لن تُعرض ثانية. والتوليدُ الجديد يُبطل القديمة كلَّها.</div></div>
    <div class="n" id="rc-msg" role="status" aria-live="polite"></div>
  </div>

  <div class="card" style="margin-top:var(--s-3)"><h2>الرمز الإداريّ</h2>
    <p class="hint" style="margin:0"><b>تدويرُ <span class="mono">ADMIN_TOKEN</span> يُبطل كلّ الجلسات فورا.</b>
      فالجلسة مربوطةٌ ببصمة الرمز الذي فتحها، وتُفحص في كلّ طلب — وجلسةُ مفتاحِ المرور كذلك.
      فإن شككتَ في تسرّبٍ فبدّل الرمز
      بـ <span class="mono">wrangler secret put ADMIN_TOKEN</span> — ولا حاجة إلى انتظار انتهاء الجلسات.</p>
  </div>

  <div class="card" style="margin-top:var(--s-3)"><h2>سجلّ التدقيق</h2>
    <p class="hint">آخر ${d.audit.length} فعلٍ مسجَّل. السجلّ يُكتب ولا يُعدَّل، ولا يُذكر فيه مفتاحٌ قطّ.</p>
    ${d.audit.length === 0
      ? '<div class="empty"><b>لا شيء بعد</b><p>أوّل فعلٍ في اللوحة يظهر هنا.</p></div>'
      : `<div class="scroll"><table>
          <thead><tr><th>متى</th><th>الفعل</th><th>على ماذا</th><th>العنوان</th></tr></thead>
          <tbody>${auditRows}</tbody></table></div>`}
  </div>
</section>

<footer><span>صدى — كلّ زرٍّ هنا يحرسه قيدٌ مُختبَر في الخادم</span>
  <span class="mono">${escapeHtml(d.now.toISOString().slice(0, 16).replace('T', ' '))} UTC</span></footer>
</main>
</div>
</div>`

  return shell(
    'صدى — لوحة التحكّم', injectCsrf(body, d.csrf), d.nonce, SCRIPT + THEME_SCRIPT,
    { commands: buildCommands({ onPanel: true, drafts: d.drafts }) },
  )
}
