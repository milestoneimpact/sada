/**
 * شاشةُ العامل الثاني.
 *
 * ولها ملفُّها لا قسمٌ في `panelView`: هي الشاشةُ الوحيدة التي تُعرض على
 * جلسةٍ **معلَّقة**، ولا تحمل من اللوحة شيئا — لا مصادرَ ولا مزوّدين ولا
 * أرقاما. وخلطُها بصفحةٍ تحمل ذلك يعني أن تُبنى بيانات اللوحة لمن لم
 * يُثبت عاملَه الثاني بعد.
 */
import { escapeHtml, shell } from './panelView'
import { brandMoment } from './ui/moment'
import { notice, noticeText } from './ui/components/toast'
import { B64URL_SCRIPT, FACTORS_SCRIPT, PASSKEY_TEXT_SCRIPT } from './ui/scripts'
import { html, raw } from './ui/html'

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
const SCRIPT = `${B64URL_SCRIPT}${PASSKEY_TEXT_SCRIPT}
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
  var label=btn.textContent;
  btn.addEventListener('click',function(){
    btn.disabled=true; btn.setAttribute('aria-busy','true');
    btn.textContent='المس مفتاحك…'; if(note)note.textContent='';
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
      btn.disabled=false; btn.removeAttribute('aria-busy'); btn.textContent=label;
      if(note)note.textContent=sadaPk.why(err); try{btn.focus();}catch(e){}
    });
  });
})();
`

export function secondFactorPage(d: SecondFactorData, nonce: string): string {
  const hidden = `<input type="hidden" name="_csrf" value="${escapeHtml(d.csrf)}">`

  const note =
    d.error === null
      ? ''
      : noticeText('bad', d.error)

  const passkey = !d.hasPasskey
    ? ''
    : `<form id="pk-form" method="POST" action="/panel/2fa/passkey"
             data-challenge="${escapeHtml(d.challenge)}" data-rpid="${escapeHtml(d.rpId)}">
         ${hidden}
         <input type="hidden" name="assertion" value="">
         <button class="btn btn-primary" id="pk-btn" type="button">الدخول بمفتاح المرور</button>
       </form>
       <div class="note" id="pk-note" role="status" aria-live="polite"></div>`

  const totp = !d.hasTotp
    ? ''
    : `${d.hasPasskey ? '<div class="or">أو</div>' : ''}
       <form method="POST" action="/panel/2fa/totp">
         ${hidden}
         <div class="field"><label for="code">الرقم من تطبيق المصادقة</label>
           <input id="code" name="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9 ]{6,8}" maxlength="8" required
                  ${d.hasPasskey ? '' : 'autofocus'}></div>
         <button class="btn ${d.hasPasskey ? 'btn-secondary' : 'btn-primary'}" type="submit">تأكيد</button>
       </form>`

  const recovery = !d.hasRecovery
    ? ''
    : `<details class="rec"><summary>فقدت جهازي — استعمل رمز استرداد</summary>
         <form method="POST" action="/panel/2fa/recovery">
           ${hidden}
           <div class="field"><label for="rc">رمز الاسترداد</label>
             <input id="rc" name="code" dir="ltr" autocomplete="off" spellcheck="false"
                    placeholder="XXXXX-XXXXX" required></div>
           <button class="btn btn-secondary" type="submit">استخدم الرمز</button>
         </form>
         <div class="note">يُستهلك مرّةً واحدة، ولا يُقرأ من القاعدة بعد توليده.</div>
       </details>`

  const nothing =
    d.hasPasskey || d.hasTotp
      ? ''
      : notice({ tone: 'warn', html: `لا عامل ثان مضبوطا — وهذا لا ينبغي أن يقع.
               أعد الدخول، وإن تكرّر فبدّل <span class="mono">ADMIN_TOKEN</span>.` })

  return shell(
    'صدى — العامل الثاني',
    `<div class="auth-split">${brandMoment()}<div class="wrap"><main class="auth">
      <h1>خطوة أخيرة</h1>
      <p class="lede">${escapeHtml(d.hasPasskey && d.hasTotp ? 'ادخل بمفتاح المرور على هذا الجهاز، أو اكتب الرقم من تطبيق المصادقة.' : d.hasPasskey ? 'ادخل بمفتاح المرور على هذا الجهاز — بصمة الوجه أو الإصبع.' : 'افتح تطبيق المصادقة على هاتفك، واكتب الرقم الظاهر فيه.')}</p>
      ${note}${nothing}
      <div class="card">${passkey}${totp}</div>
      ${recovery}
      <form method="POST" action="/panel/2fa/cancel" class="cancel">
        ${hidden}<button class="btn btn-secondary btn-sm" type="submit">إلغاء والعودة</button></form>
      <footer>${escapeHtml(d.rpId)}</footer>
    </main></div></div>`,
    nonce,
    SCRIPT,
    { moment: true },
  )
}

// ── «تحقّق للتوّ» (D-317) ────────────────────────────────────────────

export interface StepUpData {
  readonly csrf: string
  readonly challenge: string
  readonly rpId: string
  readonly hasPasskey: boolean
  readonly hasTotp: boolean
  /** لمن لا عاملَ له وحده: رمزُ بريدٍ يُطلب ثمّ يُكتب. */
  readonly emailCode: 'none' | 'ask' | 'sent'
  readonly email: string
  /** إلى أين بعد التحقّق — مسارٌ مُتحقَّقٌ منه (`safeStepUpNext`). */
  readonly next: string
  readonly error: string | null
}

/**
 * **«تحقّق للتوّ»** (D-317): الأفعالُ التي تغيّر من يدخل حسابَك أو ما يُرسَل باسمك تُسأل عنها مرّةً كلَّ خمس دقائق.
 * مفتاحُ المرور أوّلًا (المسُّ يكفي)، ثمّ رمزُ التطبيق، **ورمزُ البريد لمن لا عاملَ له وحده** — فمن ملك عاملًا لا
 * يُتحقَّق منه بما هو أضعفُ منه. والصفحةُ بالقالب `html`: كلُّ ما يُقحَم يُهرَّب (D-281).
 */
export function stepUpPage(d: StepUpData, nonce: string): string {
  const hidden = html`<input type="hidden" name="_csrf" value="${d.csrf}"><input type="hidden" name="next" value="${d.next}">`
  const passkey = !d.hasPasskey ? '' : html`<form id="pk-form" method="POST" action="/panel/stepup/passkey"
       data-challenge="${d.challenge}" data-rpid="${d.rpId}">
       ${hidden}<input type="hidden" name="assertion" value="">
       <button class="btn btn-primary" id="pk-btn" type="button">المس مفتاح المرور</button>
     </form>
     <div class="note" id="pk-note" role="status" aria-live="polite"></div>`
  const totp = !d.hasTotp ? '' : html`${d.hasPasskey ? raw('<div class="or">أو</div>') : ''}
     <form method="POST" action="/panel/stepup/totp">
       ${hidden}
       <div class="field"><label for="code">الرقم من تطبيق المصادقة</label>
         <input id="code" name="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code"
                pattern="[0-9 ]{6,8}" maxlength="8" required${d.hasPasskey ? '' : raw(' autofocus')}></div>
       <button class="btn ${d.hasPasskey ? 'btn-secondary' : 'btn-primary'}" type="submit">تأكيد</button>
     </form>`
  const mail = d.emailCode === 'none' ? '' : d.emailCode === 'ask'
    ? html`<form method="POST" action="/panel/stepup/code/send">
         ${hidden}
         <p class="hint">لا عامل ثانيًا لحسابك بعد، فيصل رمز من ستّة أرقام إلى <bdi dir="ltr">${d.email}</bdi>.</p>
         <button class="btn btn-primary" type="submit">أرسل الرمز إلى بريدي</button>
       </form>`
    : html`<form method="POST" action="/panel/stepup/code">
         ${hidden}
         <div class="field"><label for="code">الرمز من البريد</label>
           <input id="code" name="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9 ]{6,7}" maxlength="7" required autofocus></div>
         <button class="btn btn-primary" type="submit">تأكيد</button>
       </form>`
  const body = html`<div class="auth-split">${raw(brandMoment())}<div class="wrap"><main class="auth">
      <h1>تحقّق للتوّ</h1>
      <p class="lede">ما طلبته يغيّر من يدخل حسابك أو ما يُرسل باسمك، فيُسأل عنه مرة كل خمس دقائق.</p>
      ${d.error === null ? '' : raw(noticeText('bad', d.error))}
      <div class="card">${passkey}${totp}${mail}</div>
      <div class="cancel"><a class="btn btn-secondary btn-sm" href="/panel">ارجع</a></div>
      <footer>${d.rpId}</footer>
    </main></div></div>`
  return shell('صدى — تحقّق للتوّ', body.value, nonce, SCRIPT, { moment: true })
}

/** أسماءُ الحقول كما يقرؤها صاحبُها في «أكمل ما بدأته» — وما ليس هنا يُرسَل ولا يُعرَض. */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  email: 'البريد', role: 'الدور', name: 'الاسم', label: 'الاسم الظاهر', base_url: 'العنوان', model: 'النموذج',
  provider: 'الخدمة', platform: 'المنصّة', account: 'الحساب',
}

/** ما يُعاد رسمُه: الفعلُ وحقولُه، وما كان سرًّا يُطلب ثانيةً. */
export interface ResumeData {
  readonly csrf: string
  readonly action: string
  readonly title: string
  readonly fields: readonly (readonly [string, string])[]
  readonly secrets: readonly string[]
  readonly back: string
  /**
   * **كيف تُقرأ القيمة** (مراجعة D-317): الدورُ باسمه في المعجم لا بمفتاحه، والمنصّةُ باسمها، والحسابُ باسمه الظاهر.
   * و`null` يُخفي الحقلَ من الملخّص (معرّفٌ داخليٌّ لا يقرؤه صاحبُه) ويبقى في النموذج.
   */
  readonly display?: Readonly<Record<string, string | null>>
  /** عاقبةُ الفعل كما كانت في حواره — تُقال قبل «أكمل» لا بعده. */
  readonly warning?: string
}

const SECRET_LABEL: Readonly<Record<string, { readonly label: string; readonly type: string }>> = {
  key: { label: 'أعد لصق المفتاح — لا يُحفظ في الطريق', type: 'password' },
  value: { label: 'أعد لصق عنوان القناة — لا يُحفظ في الطريق', type: 'url' },
}

/**
 * **«أكمل ما بدأته»** (D-317) — النموذجُ نفسُه يُعاد رسمُه بعد التحقّق، فيراه صاحبُه ويضغط «أكمل» بنفسه.
 * **لا يُعاد إرسالُ جسدٍ بلا علمه**، والسرُّ الذي كتبه لا يُخزَّن في الطريق: يُطلب ثانيةً.
 */
export function resumePage(d: ResumeData, nonce: string): string {
  const shown = d.fields
    .filter(([k]) => FIELD_LABEL[k] !== undefined && d.display?.[k] !== null)
    .map(([k, v]) => [k, d.display?.[k] ?? v] as const)
  const summary = shown.length === 0 ? '' : html`<ul class="plain">${shown.map(([k, v]) =>
    html`<li><b>${FIELD_LABEL[k] ?? k}:</b> <bdi>${v.slice(0, 120)}</bdi></li>`)}</ul>`
  const warning = d.warning === undefined ? '' : raw(noticeText('warn', d.warning))
  const hidden = d.fields.map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)
  const secrets = d.secrets.map((k, i) => {
    const f = SECRET_LABEL[k] ?? { label: k, type: 'password' }
    return html`<div class="field"><label for="${'s' + i}">${f.label}</label>
      <input id="${'s' + i}" name="${k}" type="${f.type}" dir="ltr" autocomplete="off" required></div>`
  })
  const body = html`<div class="auth-split">${raw(brandMoment())}<div class="wrap"><main class="auth">
      <h1>أكمل: ${d.title}</h1>
      <div class="card">${summary}${warning}
        <form method="POST" action="${d.action}">
          <input type="hidden" name="_csrf" value="${d.csrf}">${hidden}${secrets}
          <button class="btn btn-primary" type="submit">أكمل</button>
        </form>
        <p class="hint">تحقّقت. ولا يُرسَل شيء حتّى تضغط «أكمل».</p></div>
      <div class="cancel"><a class="btn btn-secondary btn-sm" href="${d.back}">ألغِ</a></div>
    </main></div></div>`
  return shell('صدى — أكمل ما بدأته', body.value, nonce, '', { moment: true })
}

// ── صفحةُ التسجيل و«أمان حسابك» (D-317) ───────────────────────────────

export interface EnrolData {
  readonly csrf: string
  readonly rpId: string
  /** جلسةُ تسجيلٍ وحده: الحسابُ يلزمه عاملٌ ولا عاملَ له. */
  readonly required: boolean
  /** اسمُ الدور كما يُقرأ («المالك»، «مدير»…). */
  readonly roleName: string
  readonly email: string
  readonly passkeys: readonly { readonly id: string; readonly label: string }[]
  readonly totpConfirmed: boolean
  readonly recoveryLeft: number
  readonly error: string | null
}

/**
 * **صفحةُ التسجيل** (D-317): المالكُ والمديرُ والناشرُ لا يكفيهم رمزُ البريد. ومن دخل منهم بلا عاملٍ ثانٍ يرى هذه
 * الصفحةَ وحدَها: لماذا، وكيف يسجّل مفتاحَ مرورٍ (الأقوى) أو رمزَ تطبيق، ثمّ رموزُ استردادٍ مع أوّل عامل، ثمّ «تابع».
 * ولغيره (عضوٌ بجلسةٍ كاملة) هي «أمانُ حسابك»: عواملُه وإضافتُها وإزالتُها.
 */
export function enrolPage(d: EnrolData, nonce: string): string {
  const csrf = html`<input type="hidden" name="_csrf" value="${d.csrf}">`
  const keys = d.passkeys.length === 0 ? '' : html`<ul class="plain">${d.passkeys.map((k) => html`<li class="split"><span>${k.label}</span>
      <button class="btn btn-danger btn-sm pk-del" type="button" data-id="${k.id}" data-label="${k.label}"
        data-confirm="${'أتحذف المفتاح «' + k.label + '»؟ لا يُسترجَع، والجهازُ الذي يحمله يدخل بعده برمز البريد.'}">احذف</button></li>`)}</ul>`
  const totp = d.totpConfirmed
    ? raw('<button class="btn btn-danger" id="totp-remove" type="button" data-confirm="أتُزيل رمزَ التطبيق؟ يبقى الدخولُ بمفتاح المرور ورموز الاستعادة وحدها." data-confirm-ok="أزله">أزل رمز التطبيق</button>')
    : raw('<button class="btn btn-secondary" id="totp-start" type="button">اضبط رمز التطبيق</button>')
  const recovery = d.required ? '' : html`<hr><h2 class="sec">رموز الاسترداد</h2>
    <p class="hint">${d.recoveryLeft > 0 ? html`بقي <b>${d.recoveryLeft}</b> رمزًا غير مستهلَك.` : 'لا رموز استرداد. وبلا طريق رجوع يصير فقد الجهاز قفلًا.'}</p>
    <button class="btn btn-secondary" id="rc-issue" type="button"${raw(d.recoveryLeft > 0
      ? ' data-confirm="أتولّد مجموعةً جديدة؟ تُبطل القديمةَ كلَّها، فلا يصلح رمزٌ منها بعد اليوم." data-confirm-ok="ولّد مجموعةً جديدة"' : '')}>${d.recoveryLeft > 0 ? 'ولّد مجموعة جديدة' : 'ولّد رموز استرداد'}</button>
    <div class="note" id="rc-msg" role="status" aria-live="polite"></div>`
  const lede = d.required
    ? html`دورُك «${d.roleName}» لا يكفيه رمز البريد: من قرأ بريدك دخل. سجّل مفتاح مرور (بصمة الوجه أو الإصبع) أو رمز تطبيق.`
    : 'ما يثبت أنّك أنت بعد رمز البريد. ومفتاح المرور أقوى من رمز التطبيق: لا يُملى على صفحة مزوّرة.'
  const body = html`<div class="auth-split">${raw(brandMoment())}<div class="wrap"><main class="auth">
      <h1>${d.required ? 'سجّل عاملك الثاني' : 'أمان حسابك'}</h1>
      <p class="lede">${lede}</p>
      ${d.error === null ? '' : raw(noticeText('bad', d.error))}
      <div class="card" id="factors">${csrf}
        ${keys}
        <button class="btn ${d.passkeys.length === 0 ? 'btn-primary' : 'btn-secondary'}" id="pk-add" type="button">سجّل مفتاح مرور على هذا الجهاز</button>
        <div class="note" id="pk-msg" role="status" aria-live="polite"></div>
        <hr>
        <h2 class="sec">أو رمز تطبيق</h2>
        ${totp}
        <div id="totp-box" hidden>
          <div class="field mt-3"><label for="totp-secret">السرّ — انسخه إلى تطبيق المصادقة</label>
            <input id="totp-secret" readonly dir="ltr"></div>
          <form method="POST" action="/panel/security/totp/confirm" id="totp-confirm">
            <div class="field"><label for="totp-code">الرمز الظاهر الآن</label>
              <input id="totp-code" name="code" dir="ltr" inputmode="numeric" maxlength="8" autocomplete="off"></div>
            <button class="btn btn-primary" type="submit">أكّد</button>
          </form>
        </div>
        <div class="note" id="totp-msg" role="status" aria-live="polite"></div>
        ${recovery}
      </div>
      <div class="card mt-3" id="rc-box" hidden><h2>رموز الاسترداد</h2>
        <div class="codes" id="rc-list"></div>
        <div class="note"><b>انسخها الآن.</b> لن تُعرض ثانية. وكلٌّ منها يُدخلك مرّة إن فقدت جهازك.</div>
        <a class="btn btn-primary" id="rc-go" href="/panel" hidden>نسختُها — تابع إلى اللوحة</a>
      </div>
      <form method="POST" action="/panel/logout" class="cancel">
        ${csrf}<button class="btn btn-secondary btn-sm" type="submit">اخرج</button></form>
      <footer><bdi dir="ltr">${d.email}</bdi> · ${d.rpId}</footer>
    </main></div></div>`
  return shell(
    d.required ? 'صدى — سجّل عاملك الثاني' : 'صدى — أمان حسابك',
    body.value,
    nonce,
    B64URL_SCRIPT + PASSKEY_TEXT_SCRIPT + FACTORS_SCRIPT,
    { moment: true },
  )
}
