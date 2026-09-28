import { X_HEAVY, X_LIGHT_RANGES, X_URL_LENGTH } from '../../lib/draft/length'
import { B64URL_SCRIPT, PASSKEY_TEXT_SCRIPT } from './scripts'

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
  function show(id,push,focus){
    if(first===null)return;
    var found=false, pane=null;
    panes.forEach(function(p){var m=p.dataset.pane===id; p.hidden=!m; if(m){found=true; pane=p;}});
    if(!found){if(id!==first)show(first,push,focus); return;}
    tabs.forEach(function(t){
      var m=t.getAttribute('href')==='#'+id;
      if(m){t.setAttribute('aria-current','page');
        var sp=t.querySelector('span');
        if(sp&&head){head.textContent=sp.textContent; document.title=sp.textContent+' — صدى';}
      }else{t.removeAttribute('aria-current');}
    });
    if(push&&history.replaceState)history.replaceState(null,'','#'+id);
    if(focus&&pane){var hd=pane.querySelector('h1,h2');
      if(hd){hd.setAttribute('tabindex','-1'); hd.focus();}}
  }
  tabs.forEach(function(t){t.addEventListener('click',function(e){
    e.preventDefault(); show(t.getAttribute('href').slice(1),true,true);
  });});
  show((location.hash||'').slice(1)||first,false,false);
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
  // ‏اللوحة تربطان بالزرّ مستمعَين، فيبقى «نُسخ ✓» عليه لا يعود (D-160)

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
    f.addEventListener('submit',function(e){
      // ‏الإرسالُ الثاني يُمنَع بعلَمٍ لا بتعطيل الزرّ المضغوط: زرٌّ يُعطَّل يُسقط
      // ‏التركيزَ إلى body ولا يُقرأ. والنموذجُ يقول «مشغول» ورسالتُه تُعلَن (D-149)
      if(f.getAttribute('aria-busy')==='true'){e.preventDefault(); return;}
      var b=pressed||f.querySelector('button[type=submit]')||f.querySelector('button');
      f.setAttribute('aria-busy','true');
      f.querySelectorAll('button').forEach(function(x){if(x!==b)x.disabled=true;});
      if(b){b.setAttribute('data-busy-on','1'); b.setAttribute('aria-disabled','true');
        b.setAttribute('aria-label',(b.textContent||'').trim()+' — '+f.dataset.busy);}
      var st=document.getElementById('flash');
      if(st&&f.dataset.busy){var p=document.createElement('p'); p.className='busy-note'; p.textContent=f.dataset.busy; st.appendChild(p);}
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
    // والمنصّةُ والترتيبُ فرزٌ ثانٍ وثالث (D-127) — بالقاعدة نفسِها: افتراضُهما
    // «الكلّ» و«الأحدث»، وما يُخفى يُلغى تحديدُه
    var platform='all', order='new';
    var ptabs=document.getElementById('draft-platform');
    var orderSel=document.getElementById('draft-order');
    function reorder(){
      if(!cards.length)return;
      var parent=cards[0].parentNode; if(!parent)return;
      var key=function(c){return order==='cost'?parseFloat(c.dataset.cost||'0')||0:parseFloat(c.dataset.created||'0')||0;};
      var sorted=cards.slice().sort(function(a,b){var d=key(b)-key(a); return order==='old'?-d:d;});
      sorted.forEach(function(c){parent.appendChild(c);});
    }
    function refilter(){
      var shown=0;
      cards.forEach(function(c){
        var on = (bucket==='all' || c.dataset.status===bucket) && (platform==='all' || c.dataset.platform===platform);
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
    if(ptabs){
      ptabs.hidden=false;
      ptabs.querySelectorAll('button[data-platform-tab]').forEach(function(b){
        b.addEventListener('click',function(){
          platform=b.dataset.platformTab;
          ptabs.querySelectorAll('button[data-platform-tab]').forEach(function(o){
            var on=o===b;
            o.classList.toggle('on',on); o.setAttribute('aria-pressed',String(on));
          });
          refilter();
        });
      });
    }
    if(orderSel){orderSel.addEventListener('change',function(){order=orderSel.value; reorder();});}

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
        mirror.textContent='= '+at.toLocaleString('ar-u-nu-latn',{weekday:'long',day:'numeric',
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
