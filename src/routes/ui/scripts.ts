/**
 * السكربتاتُ الثابتة — **نصوصٌ بلا استيراد** (D-160).
 *
 * كانت في `shell.ts` تحت حلقة استيراد (القشرةُ ← الأصلُ ← اللوحةُ ← القشرة)،
 * فطُبع `${B64URL_SCRIPT}` في الحزمة «undefined» ورمى سكربتُ الدخول بمفتاح
 * المرور وسكربتُ اللوحة كلاهما عند التحميل. **ونصٌّ لا يستورد شيئًا يُقيَّم
 * قبل كلِّ من يستورده، في أيّ ترتيب** — وهذا كلُّ ما يلزم.
 *
 * والحارسُ `scripts/audit_cycles.mjs` يُسقط CI على أيّ حلقةٍ جديدة، و
 * `src/bundle.test.ts` يشغّل السكربتاتِ من الحزمة المشحونة نفسِها.
 */

/**
 * زرُّ النسخ — **حرفًا بحرف، ومن مصدرٍ واحد** (D-042 · D-126).
 *
 * رابطُ العودة يُطابَق حرفًا بحرف عند المنصّة، وكتابتُه يدًا تُدخل مسافةً
 * أو شرطةً فيفشل الربطُ بخطأٍ لا يدلّ على سببه. وأمرُ `wrangler` في شاشة
 * «ما عليك» من الجنس نفسِه. **فالنصُّ واحدٌ تحمله اللوحةُ والشاشة**، لا
 * نسختان تفترقان في أوّل تعديل.
 */
import { BP } from './tokens'

export const COPY_SCRIPT = `
(function(){
  document.querySelectorAll('button[data-copy]').forEach(function(b){
    b.addEventListener('click',function(){
      var f=document.getElementById(b.dataset.copy); if(!f)return;
      f.select(); f.setSelectionRange(0,f.value.length);
      var done=function(){var t=b.textContent; b.textContent='نُسخ';
        setTimeout(function(){b.textContent=t;},1400);};
      // الحديثةُ أوّلا، والقديمةُ احتياطا: نافذةٌ بلا HTTPS لا تملك الأولى
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(f.value).then(done,function(){
          try{document.execCommand('copy'); done();}catch(e){}});
      }else{try{document.execCommand('copy'); done();}catch(e){}}
    });
  });
})();
`

/**
 * **تأكيدُ الزرّ** (D-218) — في كلّ صفحة، **للزرّ وحدَه**.
 *
 * «احذف» في دليل ضبط المنصّة يحمل «data-confirm» على الزرّ لا على النموذج (النموذجُ نفسُه يحفظ ويفحص)، وصفحةُ المنصّة
 * لا تحمل سكربتَ اللوحة أصلًا — **فكان يحذف السرَّ المحفوظ بضغطةٍ بلا سؤال**. والنموذجُ ذو «data-confirm» يسأل عنه
 * سكربتُ اللوحة؛ فهذا للأزرار وحدها، فلا يُسأل المالكُ مرّتين.
 */
export const CONFIRM_SCRIPT = `
(function(){
  document.querySelectorAll('button[data-confirm]').forEach(function(b){
    b.addEventListener('click',function(e){
      if(!confirm(b.dataset.confirm)){e.preventDefault(); e.stopImmediatePropagation();}
    });
  });
})();
`

/**
 * مبدّلُ الثيم — يُحفظ الاختيار، و«النظام» يمحوه فيعود التفضيل.
 *
 * **ولونُ شريط المتصفّح معه** (D-183): وسما «theme-color» بشرط الوضع، فاختيارٌ
 * يخالف الجهاز يكتب لونَه في الوسمين، و«النظام» يعيد كلًّا إلى وضعه. واللونُ
 * من «data-c» على الوسم نفسِه لا من استيراد — هذا الملفُّ نصوصٌ بلا استيراد. **وما لا «data-c»
 * عليه لا يُمَسّ**: وسمُ لحظة العلامة بأرضها الثابتة في الوضعين (مراجعة D-196).
 */
export const THEME_SCRIPT = `
(function(){
  // ‏ونسخةُ «المظهر» في الإعدادات تُربط مع نسخة القائمة (D-221): الأزرارُ كلُّها لا الصندوقُ الأوّل
  var box=document.getElementById('theme');
  if(!box)return;
  var all=function(){return document.querySelectorAll('.seg button[data-theme]');};
  var bar=function(v){
    var ms=document.querySelectorAll('meta[name="theme-color"][data-c]'),own={};
    ms.forEach(function(m){own[/dark/.test(m.media)?'dark':'light']=m.dataset.c;});
    ms.forEach(function(m){m.content=v==='system'?m.dataset.c:(own[v]||m.dataset.c);});
  };
  var apply=function(v){
    bar(v);
    try{
      if(v==='system'){localStorage.removeItem('sada-theme');
        delete document.documentElement.dataset.theme;}
      else{localStorage.setItem('sada-theme',v); document.documentElement.dataset.theme=v;}
    }catch(e){
      if(v==='system')delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme=v;
    }
    all().forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.theme===v));});
  };
  var saved='system';
  try{saved=localStorage.getItem('sada-theme')||'system';}catch(e){}
  apply(saved);
  all().forEach(function(b){
    b.addEventListener('click',function(){apply(b.dataset.theme);});});
})();
`

/**
 * مبدّلُ الكثافة (D-102) — **ووضعان لا ثلاثة**.
 *
 * الثيمُ ثلاثةٌ لأنّ للنظام رأيا فيه (`prefers-color-scheme`). **ولا رأيَ
 * للنظام في الكثافة** — فوضعٌ ثالثٌ اسمُه «النظام» يَعِد بما لا مصدرَ له.
 *
 * والحفظُ في `try` كما في الثيم: `localStorage` يرمي في نافذةٍ خاصّة،
 * **ونافذةٌ خاصّة يجب أن تفتح اللوحة** لا أن تسقط على سطرٍ من الزينة.
 */
export const DENSITY_SCRIPT = `
(function(){
  // ‏ونسخةُ «المظهر» في الإعدادات تُربط مع نسخة القائمة (D-221): الأزرارُ كلُّها لا الصندوقُ الأوّل
  var box=document.getElementById('density');
  if(!box)return;
  var all=function(){return document.querySelectorAll('.seg button[data-density]');};
  var apply=function(v){
    try{
      if(v==='compact'){localStorage.setItem('sada-density',v);
        document.documentElement.dataset.density=v;}
      else{localStorage.removeItem('sada-density');
        delete document.documentElement.dataset.density;}
    }catch(e){
      if(v==='compact')document.documentElement.dataset.density=v;
      else delete document.documentElement.dataset.density;
    }
    all().forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.density===v));});
  };
  var saved='cozy';
  try{saved=localStorage.getItem('sada-density')||'cozy';}catch(e){}
  apply(saved);
  all().forEach(function(b){
    b.addEventListener('click',function(){apply(b.dataset.density);});});
})();
`

/**
 * base64url للمفاتيح — **نسخةٌ واحدة** (D-151). كانت ثلاثًا حرفًا بحرف في
 * سكربت اللوحة وسكربت الدخول وسكربت العامل الثاني.
 */
export const B64URL_SCRIPT = `
var sadaB64={
  enc:function(buf){
    var by=new Uint8Array(buf),t='';
    for(var i=0;i<by.length;i++)t+=String.fromCharCode(by[i]);
    return btoa(t).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  },
  dec:function(v){
    var t=v.replace(/-/g,'+').replace(/_/g,'/');
    t+='='.repeat((4-t.length%4)%4);
    var bin=atob(t),out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return out;
  }
};
`

/**
 * رسائلُ مفتاح المرور بالعربيّة — **لا اسمَ استثناءٍ إنجليزيٍّ على الشاشة** (D-160).
 *
 * كانت الشاشاتُ الثلاث (الدخول، والعاملُ الثاني، وإضافةُ مفتاحٍ في الأمان)
 * تطبع «تعذّر: NotAllowedError»: اسمُ الاستثناء كما يرميه المتصفّح. والمالكُ
 * لا يعرف أنّ هذا يعني «أغلقتَ النافذة أو انتهت الدقيقة». ورمزُ الخادم
 * (`rate_limited` · `challenge_expired` · `denied`) كان يُطبَع «رُفض المفتاح»
 * أيًّا كان — فتذكرةٌ انتهت مهلتُها تُقرأ مفتاحًا مرفوضًا.
 *
 * `sadaPk.server(code, status)` يصنع خطأً برسالةٍ تُقرأ، و`sadaPk.why(err)`
 * يترجم ما يرميه المتصفّح؛ وما لا يُعرَف يحمل اسمَه بين قوسين ليُرسَل كما هو.
 */
export const PASSKEY_TEXT_SCRIPT = `
var sadaPk={
  server:function(code,status){
    var t={
      rate_limited:'محاولات كثيرة — انتظر دقائق ثمّ أعد.',
      no_passkeys:'لا مفتاح مسجَّلًا على هذه البيئة — ادخل برمز البريد.',
      challenge_expired:'انتهت مهلة الطلب — اضغط مرّةً أخرى.',
      denied:'لم يُقبَل المفتاح — جرّب مفتاحًا آخر أو ادخل برمز البريد.',
      uv_required:'هذا المفتاح لا يتحقّق منك (لا بصمة ولا PIN)، فلا يكفي وحدَه — ادخل برمز البريد ثمّ به.',
      not_started:'ابدأ ضبط رمز التطبيق أوّلًا.',
      admin_disabled:'الدخول معطَّل: ADMIN_TOKEN غير مضبوط على الخادم.',
      csrf_failed:'انتهت صلاحية الصفحة — حدّثها ثمّ أعد.',
      no_session:'انتهت الجلسة — ادخل من جديد.',
      pending_second_factor:'أتمّ العامل الثاني أوّلًا.',
      step_up:'هذا الفعل يحتاج تحقّقًا للتوّ — جارٍ فتحُ صفحته.',
      enrol_required:'سجّل عاملك الثاني أوّلًا.',
      totp_confirmed:'رمز التطبيق مضبوط — أزله أوّلًا ثمّ اضبط غيره.',
      no_attestation:'متصفّحك لم يرسل بيانات المفتاح كاملة — حدّث الصفحة أو جرّب متصفّحًا أحدث.',
      unavailable:'القاعدة لم تردّ — أعد المحاولة بعد دقيقة.'
    }[code];
    var e=new Error(t||('تعذّر الطلب ('+status+').'));
    e.name='SadaServer';
    return e;
  },
  why:function(err){
    var n=err&&err.name?err.name:'';
    if(n==='SadaServer')return err.message;
    if(n==='NotAllowedError')return 'أُلغي الطلب أو انتهت مهلتُه — اضغط مرّةً أخرى والمس مفتاحك.';
    if(n==='AbortError')return 'أُوقف الطلب قبل تمامه.';
    if(n==='SecurityError')return 'العنوان لا يطابق نطاق المفتاح — افتح اللوحة من عنوانها.';
    if(n==='InvalidStateError')return 'هذا المفتاح مسجَّل من قبل.';
    if(n==='NotSupportedError')return 'متصفّحُك لا يدعم هذا النوع من المفاتيح.';
    if(n==='TypeError')return 'تعذّر الاتصال بالخادم — تحقّق من الشبكة.';
    return 'تعذّر إتمام العمليّة بالمفتاح'+(n?' ('+n+')':'')+'.';
  },
  fail:function(r){
    return r.json().catch(function(){return {};}).then(function(e){
      throw sadaPk.server(e&&e.error,r.status);});
  }
};
`

/**
 * **أفعالُ العامل الثاني** (D-317) — تسجيلُ مفتاحٍ وحذفُه، وضبطُ رمز التطبيق وتأكيدُه وإزالتُه، وتوليدُ رموز الاسترداد.
 *
 * سكربتٌ واحدٌ تقرؤه الإعداداتُ (قسمُ الأمان) وصفحةُ «أمان حسابك» (`/panel/enrol`)، فلا نسختان تفترقان. ويقرأ المعرّفاتِ
 * نفسَها (`pk-add` و`totp-start`…) ويعمل حيث وُجدت.
 *
 * - **«تحقّق للتوّ»**: ردُّ `step_up` يحمل وجهتَه (`to`)، فيُفتح ويعود صاحبُه إلى الصفحة نفسِها.
 * - **والتسجيلُ يرسل `attestationObject`**: المفتاحُ العامّ يُقرأ على الخادم من بيانات الاعتماد المشهودة لا ممّا يقوله العميل.
 * - **ورموزُ الاسترداد** تُعرض مع أوّل عامل، و«تابع» بعدها إلى اللوحة حين صارت الجلسةُ كاملة.
 */
export const FACTORS_SCRIPT = `
(function(){
  var csrf=(document.querySelector('input[name="_csrf"]')||{}).value||'';
  var b64u=sadaB64.enc, fromB64u=sadaB64.dec;
  var send=function(url,fields){
    var body=new FormData(); body.set('_csrf',csrf);
    for(var k in fields)body.set(k,fields[k]);
    return fetch(url,{method:'POST',body:body}).then(function(r){
      if(r.status!==403)return r;
      return r.clone().json().then(function(e){
        if(e&&e.error==='step_up'&&e.to){location.assign(e.to); return new Promise(function(){});}
        return r;
      },function(){return r;});
    });
  };
  var tell=function(id,msg){var n=document.getElementById(id); if(n)n.textContent=msg;};
  var after=function(d,box){
    if(d&&d.codes&&d.codes.length){showCodes(d.codes); tell(box,'سُجّل. وهذه رموز استردادك — انسخها الآن.'); return;}
    if(d&&d.promoted){location.assign('/panel'); return;}
    location.reload();
  };

  var add=document.getElementById('pk-add');
  if(add)add.addEventListener('click',function(){
    if(!window.PublicKeyCredential){tell('pk-msg','متصفّحك لا يدعم مفاتيح المرور.'); return;}
    var label=(document.getElementById('pk-label')||{}).value||'';
    add.disabled=true; tell('pk-msg','المس مفتاحك…');
    send('/panel/security/passkey/challenge',{}).then(function(r){
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
      if(!r.attestationObject)throw new Error('OldBrowser');
      return send('/panel/security/passkey/register',{label:label,
        credential:JSON.stringify({credentialId:cred.id,
          clientDataJSON:b64u(r.clientDataJSON),
          attestationObject:b64u(r.attestationObject)})});
    }).then(function(r){
      if(r.ok)return r.json().then(function(d){after(d,'pk-msg');});
      return r.json().catch(function(){return {};}).then(function(e){add.disabled=false;
        tell('pk-msg',e.detail||sadaPk.server(e.error,r.status).message); add.focus();});
    }).catch(function(err){add.disabled=false;
      tell('pk-msg',err&&err.message==='OldBrowser'
        ?'متصفّحك لا يقدّم بيانات المفتاح — يلزم متصفّح أحدث.'
        :sadaPk.why(err)); add.focus();});
  });

  document.querySelectorAll('button.pk-del').forEach(function(b){
    b.addEventListener('click',function(){
      if(!confirm('حذف المفتاح «'+b.dataset.label+'»؟'))return;
      b.disabled=true;
      send('/panel/security/passkey/delete',{id:b.dataset.id}).then(function(r){
        if(r.ok){location.reload(); return;}
        return r.json().catch(function(){return {};}).then(function(e){b.disabled=false;
          tell('pk-msg',e.detail||sadaPk.server(e.error,r.status).message);});
      }).catch(function(err){b.disabled=false; tell('pk-msg',sadaPk.why(err));});
    });
  });

  var ts=document.getElementById('totp-start');
  if(ts)ts.addEventListener('click',function(){
    ts.disabled=true;
    send('/panel/security/totp/start',{}).then(function(r){
      return r.ok?r.json():sadaPk.fail(r);
    }).then(function(d){
      document.getElementById('totp-secret').value=d.secret;
      document.getElementById('totp-box').hidden=false;
      // ‏و«أكّد» الأوّليُّ الوحيد في البطاقة ما دام الضبطُ مفتوحًا (D-313): الخطوةُ التالية خطوتُه
      Array.prototype.forEach.call(document.querySelectorAll('#factors .btn-primary'),function(b){
        if(!b.closest('#totp-box'))b.className=b.className.replace('btn-primary','btn-secondary');});
      tell('totp-msg','انسخ السرّ إلى تطبيق المصادقة ثمّ أكّد بالرمز الظاهر.');
    }).catch(function(err){ts.disabled=false; tell('totp-msg',sadaPk.why(err)); ts.focus();});
  });

  var tc=document.getElementById('totp-confirm');
  if(tc)tc.addEventListener('submit',function(e){
    e.preventDefault();
    /*
     * ‏«رمزٌ غير صحيح» لما هو كذلك وحدَه (D-161): جلسةٌ انتهت أو صفحةٌ قديمة
     * ‏كانت تُقرأ رمزًا خاطئًا، فيعيد المالكُ رمزًا صحيحًا مرّةً بعد مرّة
     */
    send('/panel/security/totp/confirm',{code:tc.code.value})
      .then(function(r){
        if(r.ok)return r.json();
        return r.json().catch(function(){return {};}).then(function(e){
          if(r.status===401&&e.error==='denied')throw Object.assign(new Error(e.detail||'رمز غير صحيح.'),{name:'SadaServer'});
          throw sadaPk.server(e.error,r.status);});
      }).then(function(d){after(d,'totp-msg');})
      .catch(function(err){tell('totp-msg',sadaPk.why(err));});
  });

  var tr=document.getElementById('totp-remove');
  if(tr)tr.addEventListener('click',function(){
    if(!confirm('إزالة رمز التطبيق؟'))return;
    tr.disabled=true;
    send('/panel/security/totp/remove',{}).then(function(r){
      if(r.ok){location.reload(); return;}
      return r.json().catch(function(){return {};}).then(function(e){
        if(e.detail)throw Object.assign(new Error(e.detail),{name:'SadaServer'});
        throw sadaPk.server(e.error,r.status);});
    }).catch(function(err){tr.disabled=false; tell('totp-msg',sadaPk.why(err)); tr.focus();});
  });

  function showCodes(list){
    var box=document.getElementById('rc-box'), out=document.getElementById('rc-list');
    if(!box||!out)return;
    out.textContent='';
    list.forEach(function(c){var d=document.createElement('code'); d.textContent=c; out.appendChild(d);});
    box.hidden=false;
    var go=document.getElementById('rc-go'); if(go)go.hidden=false;
  }

  var ri=document.getElementById('rc-issue');
  if(ri)ri.addEventListener('click',function(){
    if(!confirm('توليد مجموعة جديدة يُبطل القديمة كلَّها. متابعة؟'))return;
    ri.disabled=true;
    send('/panel/security/recovery/issue',{}).then(function(r){
      return r.ok?r.json():sadaPk.fail(r);
    }).then(function(d){ri.disabled=false;
        if(d.codes){showCodes(d.codes); tell('rc-msg','وُلّدت '+d.codes.length+' رموز. انسخها الآن.');}
        else tell('rc-msg','تعذّر التوليد.');
    }).catch(function(err){ri.disabled=false; tell('rc-msg',sadaPk.why(err)); ri.focus();});
  });
})();
`

/**
 * صورةٌ لم تُحمَّل تُقال بلفظها (D-170).
 *
 * كان المربّعُ الرماديُّ خلفَ الصورة يبقى وحدَه إن سقط الملفّ، **فيُقرأ «لا
 * صورة» أو «صورةٌ فارغة»** ولا يُعرَف أيُّهما. والحدثُ `error` لا يصعد،
 * فيُلتقَط في طور الالتقاط، **وما سقط قبل أن يُحمَّل السكربتُ** يُكشَف بـ
 * `complete` مع عرضٍ طبيعيٍّ صفر.
 */
export const IMG_SCRIPT = `
(function(){
  function broke(img){
    if(img.dataset.broke)return; img.dataset.broke='1';
    // ‏وداخلَ رابطٍ لا يُزرَع رابطٌ ثانٍ: وسمٌ يكفي، والرابطُ نفسُه يفتح الملفّ
    if(img.closest('a')){var s=document.createElement('span'); s.className='st bad';
      s.textContent='لم تُحمَّل'; img.replaceWith(s); return;}
    var box=document.createElement('div'); box.className='pic-err'; box.setAttribute('role','status');
    var b=document.createElement('b'); b.textContent='تعذّر عرض الصورة';
    var t=document.createElement('span'); t.className='ago';
    t.textContent='لم يصل الملفّ من المخزن. افتحه وحده، فإن لم يُفتح فولّد صورةً بديلة.';
    var a=document.createElement('a'); a.className='btn btn-secondary btn-sm'; a.href=img.currentSrc||img.src;
    a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='افتح الملفّ';
    box.append(b,t,a); img.replaceWith(box);
  }
  document.addEventListener('error',function(e){var t=e.target;
    if(t&&t.tagName==='IMG'&&t.hasAttribute('data-media'))broke(t);},true);
  document.querySelectorAll('img[data-media]').forEach(function(i){
    if(i.complete&&i.naturalWidth===0)broke(i);});
})();
`

/**
 * منطقةُ المالك إلى الخادم — **في كلّ فتحة، لا في إعدادٍ يُخزَّن** (D-173).
 *
 * رؤوسُ الأيّام في صفحة المنصّة تُجمَع على الخادم، والخادمُ لا يعرف أين
 * المالك. فتُكتب المنطقةُ كعكةً قصيرةَ العمر يقرؤها في الطلب التالي، وتُعاد
 * كتابتُها في كلّ فتحة فلا تشيخ بعد سفر. **وليست سرًّا ولا تدخل قرارَ أمن**،
 * والكتابةُ في `try` فمتصفّحٌ يمنع الكعكات لا يُسقط ما بعدها.
 */
export const TZ_SCRIPT = `
(function(){
  try{
    var tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
    if(tz!=='')document.cookie='sada_tz='+encodeURIComponent(tz)+'; Path=/panel; SameSite=Strict; Max-Age=86400'+
      (location.protocol==='https:'?'; Secure':'');
  }catch(e){}
})();
`


/**
 * سلوكُ العُدّة (D-189) — **ما لا يقوله الوسمُ وحدَه**.
 *
 * ١ · **المعطّلُ بـ`aria-disabled` لا يُضغَط** (خطّة التصميم 7.1): يبقى في ترتيب التركيز فيُقرأ
 *     سببُه المربوط، **ويُمنع فعلُه هنا** في طور الالتقاط — نقرًا وEnter ومسافةً وإرسالَ نموذج —
 *     والخادمُ يمنعه كذلك (لا يُعوَّل على السكربت وحدَه).
 * ٢ · **الحوارُ يُفتَح من زرّه ويعود التركيزُ إليه** (7.9): `data-dialog-open="<id>"` يفتح
 *     `<dialog>` بـ`showModal()` (التركيزُ محبوسٌ وEsc يغلق، من المتصفّح)، والنقرُ على الستارة
 *     يغلقه، والإغلاقُ يعيد التركيزَ إلى الزرّ الذي فتحه — لا إلى رأس الصفحة.
 */
export const KIT_SCRIPT = `
(function(){
  /*
   * ‏**القائمةُ المنسدلة** («menu()»، D-198): «details» يفتحها ويغلقها بلا سكربت، وهنا ما يتوقّعه
   * ‏من اعتاد القوائم: النقرُ خارجها يغلقها، وEsc يغلقها ويعيد التركيزَ إلى زرّها، وفتحُ واحدةٍ يغلق أختها.
   */
  var menus=function(){return Array.prototype.slice.call(document.querySelectorAll('details.menu[open]'));};
  document.addEventListener('click',function(e){
    menus().forEach(function(m){if(!m.contains(e.target))m.open=false;});});
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape')return;
    menus().forEach(function(m){m.open=false; var s=m.querySelector('summary'); if(s&&m.contains(document.activeElement))s.focus();});});
  document.querySelectorAll('details.menu').forEach(function(m){
    m.addEventListener('toggle',function(){if(m.open)menus().forEach(function(o){if(o!==m)o.open=false;});});});
  /*
   * ‏و[تحرير | معاينة] في المحرّر (D-198): بلا سكربتٍ يظهر الاثنان واحدًا تحت الآخر، وبه واحدٌ في المرّة.
   * ‏والمعاينةُ تتبع المربّع نصًّا (textContent لا innerHTML): ما يكتبه المالكُ لا يصير وسمًا.
   */
  var seg=document.getElementById('ed-seg');
  if(seg){
    var views=document.querySelectorAll('#ed [data-view]');
    var pick=function(v){
      Array.prototype.forEach.call(views,function(x){x.hidden=x.getAttribute('data-view')!==v;});
      Array.prototype.forEach.call(seg.querySelectorAll('button[data-view-pick]'),function(b){
        b.setAttribute('aria-pressed',String(b.getAttribute('data-view-pick')===v));});
      if(v==='preview'){var box=document.getElementById('ed-txt'), body=document.querySelector('#ed [data-view=preview] .np-text');
        if(box&&body&&box.tagName==='TEXTAREA'&&(box.dataset.count==='x'||box.dataset.count==='linkedin'))body.textContent=box.value;}
    };
    /*
     * ‏**والمعاينةُ ظاهرةٌ دائمًا على العريض** (D-232، من Canva وLater): النصُّ والمنشورُ بشكله واحدًا تحت الآخر،
     * ‏والمعاينةُ تتبع كلَّ حرف. وعلى الضيّق يبقى المفتاح: الشاشةُ لا تتّسع للاثنين.
     */
    var box0=document.getElementById('ed-txt'), wide=window.matchMedia('(min-width: ${BP.md}px)');
    var live=function(){var body=document.querySelector('#ed [data-view=preview] .np-text');
      if(box0&&body&&box0.tagName==='TEXTAREA'&&(box0.dataset.count==='x'||box0.dataset.count==='linkedin'))body.textContent=box0.value;};
    if(box0)box0.addEventListener('input',function(){if(wide.matches)live();});
    var fit=function(){
      if(wide.matches){seg.hidden=true; Array.prototype.forEach.call(views,function(x){x.hidden=false;}); live();}
      else{seg.hidden=false; pick('edit');}
    };
    seg.querySelectorAll('button[data-view-pick]').forEach(function(b){
      b.addEventListener('click',function(){pick(b.getAttribute('data-view-pick'));});});
    if(wide.addEventListener)wide.addEventListener('change',fit);
    fit();
  }
  var dead=function(t){return t&&t.closest?t.closest('[aria-disabled="true"]'):null;};
  document.addEventListener('click',function(e){
    if(dead(e.target)){e.preventDefault(); e.stopImmediatePropagation();}},true);
  document.addEventListener('submit',function(e){
    if(e.submitter&&e.submitter.getAttribute('aria-disabled')==='true'){e.preventDefault(); e.stopImmediatePropagation();}},true);
  document.querySelectorAll('[data-dialog-open]').forEach(function(b){
    var d=document.getElementById(b.getAttribute('data-dialog-open'));
    if(!d||typeof d.showModal!=='function')return;
    b.addEventListener('click',function(){d.showModal();});
    d.addEventListener('close',function(){b.focus();});
    d.addEventListener('click',function(e){if(e.target===d)d.close('cancel');});
  });
})();
`

/** خلاصةُ الأخطاء تنال التركيزَ حين تُفتح الصفحة بها (D-302 · GOV.UK): فتُقرأ أوّلًا وتُرى قبل التمرير. */
export const ERRSUM_SCRIPT = `
(function(){
  var es = document.getElementById('err-sum');
  if (es) { try { es.focus({ preventScroll: false }); } catch (e) {} }
})();
`

/**
 * حجمُ الخطّ بدرجتين (D-306): «أكبر» يضع «data-size="large"» على <html> ويُحفَظ في المتصفّح كالكثافة، والأزرارُ كلُّها
 * (في القائمة وفي الإعدادات) تُربط معًا. والقراءةُ قبل الرسم في سكربت الرأس كالثيم، فلا وميضَ صغير ثمّ كبير.
 */
export const SIZE_SCRIPT = `
(function(){
  var box=document.getElementById('size');
  if(!box)return;
  var all=function(){return document.querySelectorAll('.seg button[data-size]');};
  var apply=function(v){
    try{
      if(v==='large'){localStorage.setItem('sada-size',v);
        document.documentElement.dataset.size=v;}
      else{localStorage.removeItem('sada-size');
        delete document.documentElement.dataset.size;}
    }catch(e){
      if(v==='large')document.documentElement.dataset.size=v;
      else delete document.documentElement.dataset.size;
    }
    all().forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.size===v));});
  };
  var saved='normal';
  try{saved=localStorage.getItem('sada-size')||'normal';}catch(e){}
  apply(saved);
  all().forEach(function(b){
    b.addEventListener('click',function(){apply(b.dataset.size);});});
})();
`
