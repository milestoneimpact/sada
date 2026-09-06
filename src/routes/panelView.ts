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
import type { ChannelView } from '../lib/channels'
import type { AppStatus } from '../lib/oauth/apps'
import { channelsSection } from './ui/channels'
import { draftsSection, type MediaView, type Target } from './ui/sections/drafts'
import { planSection } from './ui/sections/plan'
import type { StoredPlan } from '../lib/plan/job'
import type { DraftRow } from '../lib/draft/store'
import { providersSection } from './ui/sections/providers'
import { securitySection } from './ui/sections/security'
import { escapeHtml, GLYPH_SVG, injectCsrf, shell, themeSwitch, THEME_SCRIPT } from './ui/shell'
import { bar, pct } from './ui/parts'
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

const SCRIPT = `
(function(){
  var tabs=document.querySelectorAll('nav.tabs a');
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
  // عنوانُ الشريط العلويّ يتبع القسم — فلا يبقى «نظرة عامّة» فوق الأمان
  var head=document.getElementById('pane-title');
  if(head)tabs.forEach(function(t){t.addEventListener('click',function(){
    var s=t.querySelector('span'); if(s)head.textContent=s.textContent;});});

  // زرُّ النسخ: رابطُ العودة يُطابَق حرفا بحرف عند المنصّة، وكتابتُه يدا
  // تُدخل مسافةً أو شرطةً فيفشل الربطُ بخطأٍ لا يدلّ على سببه
  document.querySelectorAll('button[data-copy]').forEach(function(b){
    b.addEventListener('click',function(){
      var f=document.getElementById(b.dataset.copy); if(!f)return;
      f.select(); f.setSelectionRange(0,f.value.length);
      var done=function(){var t=b.textContent; b.textContent='نُسخ ✓';
        setTimeout(function(){b.textContent=t;},1400);};
      // الحديثةُ أوّلا، والقديمةُ احتياطا: نافذةٌ بلا HTTPS لا تملك الأولى
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(f.value).then(done,function(){
          try{document.execCommand('copy'); done();}catch(e){}});
      }else{try{document.execCommand('copy'); done();}catch(e){}}
    });
  });

  // عدّادُ المسوّدة يتحرّك مع الكتابة: طولٌ يُعرف بعد الإرسال يأتي متأخّرا
  // بنداءٍ كامل. والحدُّ من data-limit لا من ثابتٍ هنا — منصّةٌ تُضاف
  // تجلب حدَّها معها
  document.querySelectorAll('textarea.draft-text').forEach(function(t){
    var out=t.parentNode.querySelector('.count'); if(!out)return;
    var b=out.querySelector('b'); var lim=+t.dataset.limit||0; var tgt=+t.dataset.target||0;
    function tick(){
      var n=t.value.trim().length; if(b)b.textContent=n;
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
          <div class="field"><label for="t">ADMIN_TOKEN</label>
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
}

export interface PanelData {
  readonly paused: boolean
  readonly autoEnqueue: boolean
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
  /** الوجهاتُ الحيّة للجدولة — مربوطةٌ وإذنُها قائم. */
  readonly targets: readonly Target[]
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
function sparkline(series: { day: string; total: number }[]): string {
  if (series.length < 2) return '<div class="empty"><b>لا بيانات كافية بعد</b></div>'

  // مساحةٌ للمحور وأرقامه، لا رسمٌ مقصوصٌ إلى حافّة البطاقة
  const w = 640
  const h = 168
  const padTop = 14
  const padBottom = 26
  const padStart = 46
  const plotH = h - padTop - padBottom
  const plotW = w - padStart - 8

  const raw = Math.max(...series.map((d) => d.total))
  // سقفٌ مستدير: محورٌ ينتهي عند ٣٫٤٧ يُقرأ رقما عشوائيّا لا حدّا
  const max = raw <= 0 ? 1 : Math.ceil(raw * 1.15 * 2) / 2
  const step = plotW / (series.length - 1)
  const x = (i: number): number => padStart + i * step
  const y = (v: number): number => padTop + plotH - (v / max) * plotH

  const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`)
  const line = `M ${pts.join(' L ')}`
  const area = `${line} L ${x(series.length - 1).toFixed(1)},${padTop + plotH} L ${padStart},${padTop + plotH} Z`

  // ثلاثةُ خطوطٍ أفقيّة بأرقامها — وبدونها الرسمُ شكلٌ لا مقدار
  const ticks = [0, 0.5, 1].map((t) => {
    const value = max * t
    const yy = y(value).toFixed(1)
    return `<line class="grid-l" x1="${padStart}" y1="${yy}" x2="${w - 8}" y2="${yy}"/>
      <text class="axis" x="${padStart - 8}" y="${(Number(yy) + 3.5).toFixed(1)}"
        text-anchor="end">${value.toFixed(1)}</text>`
  }).join('')

  const peakIndex = series.reduce((best, d, i) => (d.total > series[best]!.total ? i : best), 0)
  const peak = series[peakIndex]!
  const last = series[series.length - 1]!
  const first = series[0]!

  // اليومان الطرفان وحدهما: محورٌ بأربعةَ عشرَ تاريخا يزدحم فلا يُقرأ
  const label = (d: { day: string }): string => d.day.slice(5)
  const dates = `<text class="axis" x="${x(0)}" y="${h - 8}" text-anchor="start">${label(first)}</text>
    <text class="axis" x="${x(series.length - 1)}" y="${h - 8}" text-anchor="end">${label(last)}</text>`

  const total = series.reduce((sum, d) => sum + d.total, 0)
  const average = total / series.length

  return `<div class="chart">
    <svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="none"
      aria-label="إنفاق ${series.length} يوما، مجموعه ${money(total)}، وأعلاه ${money(peak.total)} في ${peak.day}">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity=".22"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
      </linearGradient></defs>
      ${ticks}
      <path d="${area}" fill="url(#sg)"/>
      <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(peakIndex).toFixed(1)}" cy="${y(peak.total).toFixed(1)}" r="3.5"
        fill="var(--surface)" stroke="var(--brand)" stroke-width="2"/>
      <line class="base" x1="${padStart}" y1="${padTop + plotH}" x2="${w - 8}" y2="${padTop + plotH}"/>
      ${dates}
    </svg>
    <div class="legend">
      <span>المجموع <b>${money(total)}</b></span>
      <span>المتوسّط اليوميّ <b>${money(average)}</b></span>
      <span>الذروة <b>${money(peak.total)}</b> · ${escapeHtml(peak.day.slice(5))}</span>
    </div>
  </div>`
}

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
    : '<span class="mono">—</span>'

  const seen = Date.parse(s.lastSeenAt.replace(' ', 'T') + 'Z') || 0
  return `<tr data-pending="${pending ? '1' : '0'}" data-worth="${s.worth ?? -1}"
      data-name="${escapeHtml(s.name)}" data-seen="${seen}">
    <td><div class="nm">${escapeHtml(s.name)}</div>
        <div class="mono">${escapeHtml(s.driveFileId)}</div>${body}</td>
    <td data-label="الحال">${status}</td>
    <td data-label="الاستحقاق">${worthCell(s.worth)}</td>
    <td data-label="آخر ظهور"><span title="${escapeHtml(s.lastSeenAt)} UTC">${escapeHtml(relativeTime(s.lastSeenAt, now))}</span></td>
    <td data-label="">${action}</td>
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


const ICON = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  sources: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  posts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12.5h5"/></svg>',
  channels: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.4 10.8 15.6 6.7M8.4 13.2l7.2 4.1"/></svg>',
  providers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><circle cx="12" cy="12" r="3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h9M9 12h9M9 19h9"/><path d="m3.5 5 1.3 1.3L7 4"/><path d="m3.5 12 1.3 1.3L7 11"/><circle cx="5" cy="19" r="1.4"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/></svg>',
  security: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20 6v6c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
} as const

/**
 * فرقُ اليوم عن أمس — **علامةٌ ونصّ**، فالسهم وحده لا يُقرأ بصوتٍ عالٍ.
 *
 * ويُحسب من السلسلة نفسها لا من رقمٍ يُمرَّر: رقمان من مصدرين يتباعدان.
 * ويوما أمسٍ صفران يعنيان «بلا تغيير» لا قسمةً على صفر.
 */
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
  const flash = `<div id="flash" role="status" aria-live="polite">${
    d.flash === null
      ? ''
      : `<div class="flash ${d.flash.kind}">
           <span class="ic">${d.flash.kind === 'ok' ? '✓' : d.flash.kind === 'warn' ? '!' : '✕'}</span>
           <span>${escapeHtml(d.flash.text)}</span></div>`
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

  const { cards: providerCards, add: addCard, routing: routingRows } =
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

  const todo = items
    .map((i) => `<li><span class="dot ${i.kind}"></span><span>${escapeHtml(i.text)}</span>
      ${i.go === undefined ? '' : `<a class="btn g sm" href="${i.go}">${escapeHtml(i.label ?? 'اذهب')}</a>`}</li>`)
    .join('')

  const { sessions: sessionRows, passkeys: passkeyRows, audit: auditRows } =
    securitySection(d)

  const nav = (href: string, icon: string, text: string, count = 0): string =>
    `<a href="${href}">${icon}<span>${text}</span>${
      count > 0 ? `<span class="count">${count}</span>` : ''
    }</a>`

  const body = `
<a class="skip" href="#main">تخطّي إلى المحتوى</a>
<div class="app">

<aside class="rail">
  <div class="rail-head">
    <div class="glyph">${GLYPH_SVG}</div>
    <div class="brand"><b>صدى</b><span>SADA · STAGING</span></div>
  </div>
  <nav class="tabs" aria-label="أقسام اللوحة">
    <span class="lbl">العمل</span>
    ${nav('#overview', ICON.overview, 'نظرة عامّة')}
    ${nav('#sources', ICON.sources, 'المصادر', pending)}
    ${nav('#posts', ICON.posts, 'المنشورات', waitingDrafts)}
    ${nav('#channels', ICON.channels, 'القنوات', linkedChannels)}
    ${platformNav(d.channels)}
    ${nav('/panel/report', ICON.report, 'التقرير', d.openSuggestions)}
    <span class="lbl">الضبط</span>
    ${nav('/panel/tasks', ICON.tasks, 'ما عليك', d.ownerPending)}
    ${nav('#providers', ICON.providers, 'المزوّدون', missing)}
    ${nav('#settings', ICON.settings, 'الحدود')}
    ${nav('#security', ICON.security, 'الأمان', d.sessions.length > 1 ? d.sessions.length : 0)}
  </nav>
  <div class="rail-foot">${themeSwitch()}</div>
</aside>

<div class="main">
<header class="topbar">
  <div class="ttl"><h1 id="pane-title">نظرة عامّة</h1>
    <div class="crumb">${escapeHtml(d.rpId)}</div></div>
  <div class="grow"></div>
  ${state}
  <form class="inline" method="POST" action="/panel/logout">
    <button class="g sm" type="submit">خروج</button></form>
</header>

<main id="main" class="content">
${flash}
<section data-pane="overview" hidden>
  ${pageHead('لوحةُ صدى', 'نظرة عامّة', 'حالُ اليوم في سطر: ما أُنفق، وما حُلّل، وما ينتظر قرارك. <b>ولا يُنشر شيءٌ من هنا بلا موافقةٍ مسجّلة.</b>')}
  <div class="grid c4">
    <div class="card tile"><div class="k">تحليلات اليوم</div>
      <div class="v">${d.usedAnalyses}<em> / ${d.analysisCap}</em></div>
      ${bar(d.usedAnalyses, d.analysisCap)}
      <div class="n">يُصفَّر عند منتصف الليل UTC</div></div>
    <div class="card tile"><div class="k">إنفاق اليوم</div>
      <div class="v">${money(d.usedSpend)}<em> / ${money(d.spendCap)}</em></div>
      ${bar(d.usedSpend, d.spendCap)}
      ${deltaOf(d.series)}</div>
    <div class="card tile"><div class="k">المصادر المحلَّلة</div>
      <div class="v">${ready}<em> / ${d.sources.length}</em></div>
      ${d.sources.length === 0 ? '' : bar(ready, d.sources.length, 'كلّها محلَّلة')}
      <div class="n">${pending === 0 ? 'لا شيء ينتظر' : `${pending} تنتظر تحليلا`}</div></div>
    <div class="card tile"><div class="k">إنفاق ٣٠ يوما</div>
      <div class="v">${money(d.spend30d)}</div>
      <div class="n">${d.providers.filter((p) => p.calls > 0).length} مزوّدا نشطا · ${
        d.providers.reduce((sum, p) => sum + p.calls, 0)} نداءً</div></div>
  </div>
  <div class="grid c2" style="margin-top:var(--s-3)">
    <div class="card"><h2>ما ينتظرك</h2>
      <p class="hint">مولَّدٌ من حال النظام الآن — لا قائمةٌ ثابتة</p>
      ${todo === ''
        ? '<div class="empty"><b>لا شيء ينتظر</b><p>كلّ ما بُني مضبوط.</p></div>'
        : `<ul class="todo">${todo}</ul>`}</div>
    <div class="card"><h2>الإنفاق — أربعة عشر يوما</h2>
      <p class="hint">كلّ المزوّدين، بالدولار</p>${sparkline(d.series)}
      <div class="row" style="margin-top:var(--s-3)">${scanBtn}
        <a class="btn g sm" href="#sources">مراجعة المصادر</a></div></div>
  </div>
</section>

<section data-pane="sources" hidden>
  ${pageHead('Google Drive', 'المصادر والتحليل', 'ما رآه صدى في مجلّدك، وما استحقّ منه نشرا. <b>والتحليلُ نداءٌ مدفوع</b> — فلا يقع تلقائيّا على كلّ ملفّ.')}
  <div class="card"><div class="card-head"><h2>المصادر والتحليل</h2><div class="grow"></div>${scanBtn}</div>
    ${sourcesTable}</div>
</section>

<section data-pane="providers" hidden>
  ${pageHead('الذكاء', 'المزوّدون والتوجيه', 'أيُّ نموذجٍ ينفّذ كلَّ مهمّة، وكم أنفق. <b>وأسرارُ Worker تغلب الخزانة دائما</b>، ولا يُعرض مفتاحٌ كاملا هنا.')}
  <div class="card" style="margin-bottom:var(--s-3)">
    <h2>عن مفاتيح المزوّدين</h2>
    <p class="hint" style="margin:0"><b>أسرار Worker تغلب الخزانة دائما</b> — فمفتاحك الأساسيّ يبقى حيث لا تقرؤه هذه
      الشيفرة ولا تعيده Cloudflare، والخزانة للتجريب والتبديل السريع.
      ولا يُعرض مفتاحٌ كاملا هنا ولا يُخزَّن مقروءا: أوّله وآخره فقط.</p>
  </div>
  <div class="grid c2">${providerCards}</div>
  <div style="margin-top:var(--s-3)">${addCard}</div>
  <div class="card" style="margin-top:var(--s-3)"><h2>توجيه المهامّ</h2>
    <p class="hint">أيّ نموذج ينفّذ كلّ مهمّة، ولماذا</p>
    <div class="scroll"><table><thead><tr><th>المهمّة</th><th>المزوّد والنموذج</th><th>الحال</th></tr></thead>
      <tbody>${routingRows}</tbody></table></div>
    <div class="sub" style="margin-top:var(--s-3)">اختر لكلّ مهمّة مزوّدها ونموذجها. والافتراض في الشيفرة
      يعمل حتّى تختار — فنظامٌ بجدولٍ فارغ يعمل ولا ينتظر أن يُملأ.</div>
  </div>
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
    media: d.media,
    // أدنى موعدٍ يقبله المتصفّح: ربعُ ساعةٍ من الآن. ودورةُ الإرسال تدور
    // كلَّ ربع، فموعدٌ أقرب من ذلك يعد بدقّةٍ لا نملكها
    earliest: new Date(d.now.getTime() + 15 * 60_000).toISOString().slice(0, 16),
    now: d.now,
    ready: d.draftReady,
  })}
</section>

<section data-pane="settings" hidden>
  ${pageHead('الحدود', 'الإيقاف والسقوف', 'مفتاحُ الإيقاف وسقفا اليوم. <b>والقيدُ في الشيفرة لا في هذه الصفحة</b> — يقع قبل النداء لا بعده.')}
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

  return shell('صدى — لوحة التحكّم', injectCsrf(body, d.csrf), d.nonce, SCRIPT + THEME_SCRIPT)
}
