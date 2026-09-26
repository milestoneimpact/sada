/**
 * شاشةُ العامل الثاني.
 *
 * ولها ملفُّها لا قسمٌ في `panelView`: هي الشاشةُ الوحيدة التي تُعرض على
 * جلسةٍ **معلَّقة**، ولا تحمل من اللوحة شيئا — لا مصادرَ ولا مزوّدين ولا
 * أرقاما. وخلطُها بصفحةٍ تحمل ذلك يعني أن تُبنى بيانات اللوحة لمن لم
 * يُثبت عاملَه الثاني بعد.
 */
import { escapeHtml, shell } from './panelView'
import { B64URL_SCRIPT, GLYPH_SVG } from './ui/shell'

export interface SecondFactorData {
  readonly csrf: string
  readonly challenge: string
  readonly rpId: string
  readonly hasPasskey: boolean
  readonly hasTotp: boolean
  readonly hasRecovery: boolean
  readonly error: string | null
}

/**
 * سكربتُ الشاشة.
 *
 * ويعمل بلا شبكةٍ سوى نداءٍ واحد إلى أصلنا — والسياسة تسمح بـ
 * `connect-src 'self'` لا أكثر.
 */
const SCRIPT = `${B64URL_SCRIPT}
(function(){
  var b64u=sadaB64.enc, fromB64u=sadaB64.dec;
  var form=document.getElementById('pk-form');
  var btn=document.getElementById('pk-btn');
  var note=document.getElementById('pk-note');
  if(!form||!btn)return;
  if(!window.PublicKeyCredential){
    btn.disabled=true;
    if(note)note.textContent='متصفّحك لا يدعم مفاتيح المرور.';
    return;
  }
  btn.addEventListener('click',function(){
    btn.disabled=true; btn.textContent='المس مفتاحك…';
    navigator.credentials.get({publicKey:{
      challenge:fromB64u(form.dataset.challenge),
      rpId:form.dataset.rpid,
      userVerification:'preferred',
      timeout:60000
    }}).then(function(cred){
      var r=cred.response;
      form.assertion.value=JSON.stringify({
        credentialId:cred.id,
        authenticatorData:b64u(r.authenticatorData),
        clientDataJSON:b64u(r.clientDataJSON),
        signature:b64u(r.signature)
      });
      form.submit();
    }).catch(function(err){
      btn.disabled=false; btn.textContent='الدخول بمفتاح المرور';
      if(note)note.textContent='تعذّر: '+(err&&err.name?err.name:'أُلغي');
    });
  });
})();
`

export function secondFactorPage(d: SecondFactorData, nonce: string): string {
  const hidden = `<input type="hidden" name="_csrf" value="${escapeHtml(d.csrf)}">`

  const note =
    d.error === null
      ? ''
      : `<div class="flash bad" role="alert"><span class="ic">✕</span>
         <span>${escapeHtml(d.error)}</span></div>`

  const passkey = !d.hasPasskey
    ? ''
    : `<form id="pk-form" method="POST" action="/panel/2fa/passkey"
             data-challenge="${escapeHtml(d.challenge)}" data-rpid="${escapeHtml(d.rpId)}">
         ${hidden}
         <input type="hidden" name="assertion" value="">
         <button class="p" id="pk-btn" type="button">الدخول بمفتاح المرور</button>
       </form>
       <div class="n" id="pk-note" role="status" aria-live="polite"></div>`

  const totp = !d.hasTotp
    ? ''
    : `${d.hasPasskey ? '<div class="or">أو</div>' : ''}
       <form method="POST" action="/panel/2fa/totp">
         ${hidden}
         <div class="field"><label for="code">رمز التطبيق</label>
           <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9 ]{6,8}" maxlength="8" required
                  ${d.hasPasskey ? '' : 'autofocus'}></div>
         <button class="${d.hasPasskey ? 'g' : 'p'}" type="submit">تأكيد</button>
       </form>`

  const recovery = !d.hasRecovery
    ? ''
    : `<details class="rec"><summary>فقدتُ جهازي — استعمل رمز استرداد</summary>
         <form method="POST" action="/panel/2fa/recovery">
           ${hidden}
           <div class="field"><label for="rc">رمز الاسترداد</label>
             <input id="rc" name="code" autocomplete="off" spellcheck="false"
                    placeholder="XXXXX-XXXXX" required></div>
           <button class="g" type="submit">استخدم الرمز</button>
         </form>
         <div class="n">يُستهلك مرّةً واحدة، ولا يُقرأ من القاعدة بعد توليده.</div>
       </details>`

  const nothing =
    d.hasPasskey || d.hasTotp
      ? ''
      : `<div class="flash warn"><span class="ic">!</span>
         <span>لا عاملَ ثانٍ مضبوطا — وهذا لا ينبغي أن يقع.
               أعد الدخول، وإن تكرّر فبدّل <span class="mono">ADMIN_TOKEN</span>.</span></div>`

  return shell(
    'صدى — العامل الثاني',
    `<div class="wrap"><div class="auth">
      <div class="glyph">${GLYPH_SVG}</div>
      <h1>خطوةٌ أخيرة</h1>
      <p class="lede">أثبتَّ الرمز. وبقي ما يثبت أنّك أنت.</p>
      ${note}${nothing}
      <div class="card">${passkey}${totp}</div>
      ${recovery}
      <form method="POST" action="/panel/2fa/cancel" class="cancel">
        ${hidden}<button class="g sm" type="submit">إلغاء والعودة</button></form>
      <footer style="border:0;justify-content:center">${escapeHtml(d.rpId)}</footer>
    </div></div>`,
    nonce,
    SCRIPT,
  )
}
