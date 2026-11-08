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
import { html, raw } from './ui/html'
import { agoTag } from './ui/time'
import { filterBar } from './ui/components/filterbar'
import { stamp } from '../lib/time/zone'
import { relativeTime, money } from '../lib/format'
import { chosenTiles, TILE_MAX, TILE_MIN, TILES } from '../lib/dashboard'
import { LIMITS as SETTING_LIMITS } from '../lib/settings'
import { pivotPane, type PivotView } from './ui/sections/pivot'
import { channelHealth, unsignedAccounts, type ChannelView } from '../lib/channels'
import { channelsSection } from './ui/channels'
import { buildCommands, commandTrigger, SECTIONS, sectionLabel } from './ui/command'
import type { Peaks } from '../lib/schedule/peak'
import { draftsParts, type MediaView, type Target } from './ui/sections/drafts'
import { editorPane } from './ui/sections/editor'
import { earliestLocal } from './ui/when'
import { tabs } from './ui/components/tabs'
import type { SlideGate } from '../lib/image/gate'
import type { MediaReady } from '../lib/media/readiness'
import { planSection, type PlanFormInput } from './ui/sections/plan'
import type { StoredPlan } from '../lib/plan/job'
import type { DraftRow } from '../lib/draft/store'
import { providersSection } from './ui/sections/providers'
import { securitySection } from './ui/sections/security'
import { shortcutsSwitch } from './ui/components/tabs'
import { accountMenu, densitySwitch, escapeHtml, GLYPH_SVG, injectCsrf, shell, themeSwitch, bell } from './ui/shell'
import { brandMoment, firstBand } from './ui/moment'
import { B64URL_SCRIPT, PASSKEY_TEXT_SCRIPT, RC_RENEW, recoveryStaleNote } from './ui/scripts'
import { alertChannel, bar, fileName, glyph, machineCard, pageHead, pathArrows, pct, type OutboxRow } from './ui/parts'
import { statusBadge } from './ui/components/badge'
import { notice, noticeText, toastRegion } from './ui/components/toast'
import { field } from './ui/components/field'
import { button } from './ui/components/button'
import type { Pulse } from '../lib/ops/heartbeat'
import { areaChart, barChart } from './ui/chart'
import type { SpendRow } from '../lib/ai/spend'
import { ICON } from './ui/icons'
import type { TodayItem } from '../lib/today'
import { driveFileUrl } from '../lib/drive/sync'
import { LOGOS } from './ui/logos'
import { activityCard, homeTop, planCard } from './ui/sections/home'
import { deskQueue } from './ui/sections/desk'
import { menu, menuItem } from './ui/components/menu'
import { railHtml } from './ui/rail'
import { panelHref, type PaneId } from '../lib/nav/panes'
import { videosSection } from './ui/sections/videos'
import { imagesGallery } from './ui/sections/library'
import { planImportCard } from './ui/planImportView'
import type { Reach, UploadRow } from '../lib/media/uploads'
import type { VideoCaptions } from '../lib/media/captions'
import type { LinkState } from '../lib/channels'
import { firstRun, systemPill, writeBlock, type HomeFacts, type JourneyCounts } from '../lib/home'
import type { Blocker } from '../lib/limits'
import { counted, NOUNS } from '../lib/format'
import { platformLabel } from '../lib/oauth/providers'
import { emptyState } from './ui/components/empty'
import { ORG_KIND_LABEL, ORG_KINDS, ORG_NAME_MAX, OWNER_ORG, type OrgRow } from '../lib/tenancy'

import { OWNER_EMAIL } from '../lib/ownerEmail'
import type { Role } from '../lib/ownerEmail'

export { escapeHtml, injectCsrf, shell }




// ── صفحة الدخول ──────────────────────────────────────────

export interface LoginState {
  readonly error?: string
  readonly blocked?: boolean
  /** أثمّة مفاتيحُ مرورٍ مسجَّلة؟ فيُعرض بابُها قبل حقل الرمز. */
  readonly passkeys?: boolean
  /**
   * الصفحةُ التي طُلبت — مسارٌ مرَّ بـ `safeNext` — يعود إليها المالكُ بعد الدخول (ر-11).
   * وبلا قيمةٍ فالرئيسيّة.
   */
  readonly next?: string
  /** البريدُ الذي طُلب له الرمز (D-272) — يُحمل في خطوة الرمز فيُعرف صاحبُه، مالكًا كان أو مدعوًّا. */
  readonly email?: string
  /**
   * الخطوة (D-245): `email` يطلب العنوان، و`code` يطلب الرمزَ بعد «أُرسل إن كان العنوانُ للمالك».
   */
  readonly step?: 'email' | 'code'
}

/** ما يُقال بعد طلب الرمز — **لكلّ عنوان**، فلا يُعرف منه أيُّ العناوين للمالك. */
export const CODE_SENT_NOTE = 'إن كان هذا البريد بريد المالك فقد أُرسل إليه رمز من ستّة أرقام، صالح عشر دقائق.'

/**
 * ‏والمرساةُ لا تصل إلى الخادم أصلًا: `/panel#posts` يُطلَب `/panel`. فتُلحَق بالوجهة هنا،
 * ‏في الحقل وفي عنوان النموذج معًا — فإعادةُ تحميل صفحةِ كلمةٍ خاطئة (`GET /panel/login`)
 * ‏تعود بها كذلك. والخادمُ يتحقّق منها بعد ذلك كما يتحقّق من غيرها (`safeNext`).
 */
const NEXT_SCRIPT = `
(function(){
  var f=document.getElementById('login-next');
  if(!f||!location.hash||f.value.indexOf('#')>=0)return;
  f.value=f.value+location.hash;
  if(f.form)f.form.setAttribute('action',(f.form.getAttribute('action')||'/panel/login').split('?')[0]+'?next='+encodeURIComponent(f.value));
})();
`

/**
 * سكربتُ الدخول بمفتاح مرور.
 *
 * ونداءٌ واحدٌ إلى أصلنا، ولا شيء غيره — و`connect-src 'self'` تفرضه.
 */
const LOGIN_SCRIPT = `${B64URL_SCRIPT}${PASSKEY_TEXT_SCRIPT}
/*
 * ‏**والمرساةُ تعود بعد الدخول** (خطّة التصميم 7.11 · D-210): الخادمُ لا يرى ما بعد «#»، فكان «next» يحمل «/panel»
 * ‏ومن انتهت جلستُه على بطاقةٍ (#d-…) أو لوحٍ (#settings) يعود إلى الرئيسيّة. فتُلحَق المرساةُ هنا — مرساةٌ بسيطةٌ وحدَها،
 * ‏و«safeNext» في الخادم يحكم ما يُقبل كما كان.
 */
(function(){var nx=document.getElementById('login-next');
  if(nx&&nx.value.indexOf('#')<0&&/^#[A-Za-z0-9_-]{1,80}$/.test(location.hash))nx.value+=location.hash;})();
(function(){
  var b64u=sadaB64.enc, fromB64u=sadaB64.dec;
  var btn=document.getElementById('pk-login');
  var note=document.getElementById('pk-note');
  if(!btn)return;
  var label=btn.textContent;
  // ‏ومتصفّحٌ بلا مفاتيح مرور (D-313): الزرُّ المعطَّل لا يبقى الأوّليَّ الوحيد، و«أرسل الرمز» يعود أوّليًّا والتركيزُ في البريد.
  // ‏والمعطَّلُ موصوفٌ بسببه الظاهر تحته «#pk-note» (مراجعة D-325): كان السببُ هناك بلا رابطٍ يصله به قارئُ الشاشة
  if(!window.PublicKeyCredential||!navigator.credentials){btn.disabled=true; btn.setAttribute('aria-describedby','pk-note');
    btn.className=String(btn.className).replace('btn-primary','btn-secondary');
    var send=document.getElementById('login-send'); if(send)send.className=String(send.className).replace('btn-secondary','btn-primary');
    var mail=document.getElementById('e'); if(mail)try{mail.focus();}catch(e){}
    if(note)note.textContent='متصفّحك لا يدعم مفاتيح المرور — ادخل برمز البريد.'; return;}
  // ‏والتركيزُ يعود إلى الزرّ: زرٌّ عُطّل يفقده، فـEnter بعد نافذةٍ أُغلقت لا يفعل شيئًا
  var reset=function(msg){btn.disabled=false; btn.removeAttribute('aria-busy');
    btn.textContent=label; if(note)note.textContent=msg; try{btn.focus();}catch(e){}};
  btn.addEventListener('click',function(){
    btn.disabled=true; btn.setAttribute('aria-busy','true');
    btn.textContent='المس مفتاحك…'; if(note)note.textContent='';
    fetch('/panel/passkey/challenge',{method:'POST'}).then(function(r){
      return r.ok?r.json():sadaPk.fail(r);
    }).then(function(d){
      return navigator.credentials.get({publicKey:{
        challenge:fromB64u(d.challenge), rpId:d.rpId, userVerification:'required',
        timeout:60000,
        allowCredentials:d.allowCredentials.map(function(id){
          return {id:fromB64u(id), type:'public-key'};})
      }}).then(function(cred){return {cred:cred, ticket:d.ticket};});
    }).then(function(x){
      var r=x.cred.response;
      if(note)note.textContent='يُتحقَّق من التوقيع…';
      return fetch('/panel/passkey/login',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ticket:x.ticket, credentialId:x.cred.id,
          authenticatorData:b64u(r.authenticatorData),
          clientDataJSON:b64u(r.clientDataJSON), signature:b64u(r.signature)})});
    }).then(function(r){
      // ‏والوجهةُ من الحقل الذي كتبه الخادمُ وأُلحقت به المرساة — لا «/panel» ثابتة (ر-11).
      // **وصفحةُ الدخول تُرسَم على عنوان الوجهة نفسِه**: «location.href» إلى العنوان نفسِه بمرساةٍ
      // انتقالٌ داخل الوثيقة لا تحميل، فتبقى الدوّارةُ والكعكةُ مكتوبة حتّى يُحدِّث المالكُ بيده
      // (الجلسة ب، المهمّة ١). فالوجهةُ نفسُها تُعاد تحميلًا، وغيرُها يحلّ محلّ الدخول في السجلّ،
      // وبعد ثماني ثوانٍ بلا انتقالٍ رابطٌ يُضغط بدل دوّارةٍ بلا نهاية
      if(r.ok){var nx=document.getElementById('login-next');
        var to=nx&&nx.value.charAt(0)==='/'&&nx.value.charAt(1)!=='/'?nx.value:'/panel';
        btn.textContent='تمّ'; if(note)note.textContent='تمّ — تُفتح لوحتك…';
        setTimeout(function(){if(!note)return; note.textContent='';
          var a=document.createElement('a'); a.href=to; a.textContent='لم تُفتح؟ افتح لوحتك';
          note.appendChild(a);},8000);
        if(to.split('#')[0]===location.pathname+location.search)location.reload();
        else location.replace(to);
        return;}
      return sadaPk.fail(r);
    }).catch(function(err){reset(sadaPk.why(err));});
  });
})();
`

export function loginPage(state: LoginState = {}, nonce = ''): string {
  const step = state.step ?? 'email'
  // ‏وزرٌّ أوّليٌّ واحد في البطاقة (D-313): مفتاحُ المرور حين يُعرض (مقاومٌ للتصيّد)، و«أرسل الرمز» ثانويٌّ بعده؛
  // ‏وبلا مفتاحٍ يعود «أرسل الرمز» الأوّليَّ الوحيد
  const passkey =
    state.passkeys !== true || state.blocked === true || step === 'code'
      ? ''
      : `<button class="btn btn-primary" id="pk-login" type="button">الدخول بمفتاح المرور</button>
         <div class="note" id="pk-note" role="status" aria-live="polite"></div>
         <div class="or">أو برمز إلى بريدك</div>`

  const note =
    state.error === undefined
      ? step === 'code' ? noticeText('ok', CODE_SENT_NOTE, true) : ''
      : noticeText(state.blocked === true ? 'bad' : 'warn', state.error, true)
  // ‏والمعطَّلُ يصف نفسَه بسبب الإيقاف المكتوب فوقه (D-325): كانت الأزرارُ «disabled» وحدَها
  const disabled = state.blocked === true ? ' disabled aria-describedby="login-why"' : ''
  const next = state.next ?? '/panel'
  const path = step === 'code' ? '/panel/login' : '/panel/login/code'
  const action = next === '/panel' ? path : `${path}?next=${encodeURIComponent(next)}`
  const form = step === 'code'
    ? `<form method="POST" action="${escapeHtml(action)}">
          <input type="hidden" name="next" id="login-next" value="${escapeHtml(next)}">
          ${state.email === undefined || state.email === '' ? '' : `<input type="hidden" name="email" value="${escapeHtml(state.email)}">`}
          <div class="field"><label for="c">رمز الدخول</label>
            <input id="c" name="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code"
                   pattern="[0-9 ]{6,8}" maxlength="8" required autofocus${disabled}></div>
          <button class="btn btn-primary" type="submit"${disabled}>دخول</button>
        </form>
        <form method="POST" action="/panel/login/code" class="cancel">
          <input type="hidden" name="next" value="${escapeHtml(next)}">
          <button class="btn btn-secondary btn-sm" type="submit" name="again" value="1"${disabled}>عنوان آخر أو رمز جديد</button>
        </form>`
    : `<form method="POST" action="${escapeHtml(action)}">
          <input type="hidden" name="next" id="login-next" value="${escapeHtml(next)}">
          <div class="field"><label for="e">البريد</label>
            <input id="e" type="email" name="email" dir="ltr" autocomplete="email"
                   required${passkey === '' ? ' autofocus' : ''}${disabled}></div>
          <button class="btn ${passkey === '' ? 'btn-primary' : 'btn-secondary'}" id="login-send" type="submit"${disabled}>أرسل الرمز</button>
        </form>`
  return shell(
    'صدى — الدخول',
    `<div class="auth-split">${brandMoment()}<div class="wrap"><main class="auth">
      <h1>لوحة التحكّم</h1>
      <p class="lede"${state.blocked === true ? ' id="login-why"' : ''}>${state.blocked === true
        ? 'الدخول موقوف مؤقتًا لحماية اللوحة'
        : step === 'code'
          ? 'اكتب الرمز الذي وصل بريدك'
          : state.passkeys === true
            ? 'ادخل بمفتاح المرور، أو برمز إلى بريدك'
            : 'اكتب بريدك ليصلك رمز الدخول'}</p>
      ${note}
      <div class="card">
        ${passkey}
        ${form}
      </div>
      ${state.blocked === true
        ? `<p class="lede"><a href="${escapeHtml(next)}">حدّث الصفحة</a> بعد ربع ساعة لتعيد المحاولة.</p>`
        : ''}
      <footer>الجلسة 3 أيّام</footer>
    </main></div></div>`,
    nonce,
    `${NEXT_SCRIPT}${state.passkeys === true && step === 'email' ? LOGIN_SCRIPT : ''}`,
    { moment: true },
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
  /** `drive` · `upload` · `url` (D-284) — وغيابُه Drive، كما كان كلُّ مصدرٍ قبله. */
  readonly kind?: string
  /** عنوانُ الصفحة لمصدر الرابط. */
  readonly originUrl?: string | null
  /** أللمرفوع أصلٌ في R2 يُنزَّل؟ */
  readonly hasFile?: boolean
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
    /** حقولٌ يحملها الزرّ مع المعرّف (D-303): الموعدُ والحسابُ لاستعادة سحب */
    readonly fields?: Readonly<Record<string, string>>
  }
}

export interface PanelData {
  /** دورُ صاحب الطلب (D-272) — والغائبُ المالك. يحجب أقسامَ الإعدادات التي للمالك وحده. */
  readonly role?: Role
  /** البيئةُ كما يعرفها Worker — تُطبَع في العلامة (D-151) */
  readonly env: 'staging' | 'production'
  readonly paused: boolean
  /** ما لم يُقرأ من الإشعارات (D-294) — جملةٌ واحدة في الهيكل، وغيابُه صفر. */
  readonly unread?: number
  readonly autoEnqueue: boolean
  /** صورةٌ مع كلّ مسوّدة (D-255) وسقفُها وما وُلّد اليوم. */
  readonly autoImage: boolean
  readonly imageCap: number
  readonly usedImages: number
  /** أيُركَّب العنوانُ العربيُّ فوق الصورة؟ (D-085) */
  readonly imageOverlay: boolean
  /**
   * حكمُ الشريحة كما تحكم به `composeSlide` (D-163) — **وجودُ السرّين يُفحَص،
   * وقيمتُهما لا تغادر البيئة**.
   *
   * كان `browserToken` منطقيًّا يفحص المفتاحَ وحده بلا قصّ، فيقول «مضبوط»
   * وحسابُ Cloudflare غائب — والدالّةُ تُخرج الصورةَ بلا عنوانٍ في كلّ مرّة.
   */
  readonly slide: SlideGate
  /** نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع — تُحسَب مرّةً للّوح (D-163). */
  readonly mediaReady: MediaReady
  readonly analysisCap: number
  readonly spendCap: number
  readonly usedAnalyses: number
  readonly usedSpend: number
  /** سقفُ المقاطع اليوميّ بالعدد (D-168)، وما عُدَّ منها في الدفتر اليوم. */
  readonly videoCap: number
  readonly usedClips: number
  /** إنفاقُ ثلاثين يومًا من الدفتر كلِّه، صفًّا لكلّ جهةٍ باسمها — الذكاءُ والنشرُ معًا. */
  readonly spendBy: readonly SpendRow[]
  /** منذ أوّل الشهر بتوقيت المالك، و`utc` حين غابت منطقتُه (ر-10). */
  readonly spendMonth: { readonly total: number; readonly utc: boolean }
  readonly series: { day: string; total: number }[]
  readonly sources: PanelSource[]
  readonly providers: PanelProvider[]
  readonly routing: {
    task: string; provider: string; model: string
    why: string; ready: boolean; implemented: boolean
    /**
     * ما ينتظرك قبل أن يُضمَن النداء — **ملاحظةُ النقطة التي تحت الزرّ بعينها**
     * حين تنتظرك ولا تسقط (رابطُ Worker وحده). فلا يقول الجدولُ «جاهز» ولا
     * «غير جاهز» والنقطةُ بينهما.
     */
    pending?: string
  }[]
  readonly knownProviders: { name: string; label: string }[]
  readonly drafts: readonly DraftRow[]
  /** المنشورُ المفتوحُ في المحرّر المركّز (`?open=<id>`، D-198) — أو لا شيء. */
  readonly editing?: DraftRow | null
  /**
   * ساعاتُ الذروة لكلّ منصّةٍ في المسوّدات (D-106) — **مقيسةٌ أو صامتة**.
   *
   * واختياريّةٌ لأنّ الشاشاتِ الفرعيّةَ لا تجدول، **وحقلٌ إلزاميٌّ يُملأ
   * بفراغٍ في نصف المواضع حقلٌ يكذب**.
   */
  readonly peaks?: Readonly<Record<string, Peaks>>
  /** **قناعُ** عنوان قناة التنبيهات (D-109 · D-318) — للمالك وحدَه، وفارغٌ يعني «لا قناة» أو «ليس لك». */
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
  /** نموذجُ الخطّة (D-282): ما يلزمه من القنوات والمصادر والكلفة، وعدُّ ما ينتظر منها. */
  readonly planForm?: PlanFormInput
  readonly planPending?: number
  /** أين الخطّةُ من الرحلة (D-289): ما كُتب منها، وما اعتُمد، وما ينتظر — لبطاقة «خطّة الشهر» في الرئيسيّة. */
  readonly planCounts?: { readonly written: number; readonly ready: number; readonly pending: number }
  /** صورٌ تنتظر حصّةَ Cloudflare المجّانيّة اليوم (D-285)، وقرارُ المالك إن قاله. */
  readonly imageQuota?: { readonly waiting: number; readonly usd: number; readonly decided: 'pay' | 'wait' | null }
  readonly planReady: boolean
  /** المصادرُ التي لها خلاصة — وحدها تُكتب منها مسوّدة. */
  readonly writableSources: readonly { id: string; name: string }[]
  /** أمزوّدُ مهمّة `draft` مضبوطٌ ومفعَّل؟ */
  readonly draftReady: boolean
  /** مزوّدو الكتابة الجاهزون — للمقارنة على النسخة الواحدة (D-244). */
  readonly writers?: readonly { readonly name: string; readonly label: string }[]
  readonly flash: PanelFlash | null
  readonly now: Date
  /** رمز CSRF لهذه الجلسة — يُحقن في كلّ نموذج. */
  readonly csrf: string
  /** قيمة `nonce` لهذا الردّ وحده. */
  readonly nonce: string
  readonly sessions: PanelSession[]
  /** المنظّماتُ كلُّها وما النشطةُ منها (D-225) — حسابُ الدخول يدير الكلّ. */
  readonly orgs?: readonly OrgRow[]
  readonly org?: string
  readonly audit: PanelAudit[]
  /** «ما وقع اليوم» — مرويٌّ ممّا في اليد (D-127). */
  readonly today: { readonly items: readonly TodayItem[]; readonly more: number }
  /** نبضُ الدورات — من `heartbeats` (D-158). */
  readonly pulses: readonly Pulse[]
  /** النطاق الذي تُوقَّع عليه المفاتيح — يُعرض ليُعرف أنّه ليس الآخر. */
  readonly rpId: string
  readonly factors: PanelFactors
  readonly channels: readonly ChannelView[]
  /** أصلُ اللوحة — يُبنى منه رابطُ العودة المعروض للنسخ. */
  readonly baseUrl: string
  /** أبوابُ الطرفيّة الثلاثة مفتوحةٌ بقرار المالك؟ (D-318) — والغائبُ مغلقة. */
  readonly adminApi?: boolean
  /** كم توصيةَ ترويجٍ تنتظر بتّك — عددٌ على رابط التقرير (D-058). */
  readonly openSuggestions: number
  /** عدُّ المنشورات بحالها ومنصّتها من القاعدة كلِّها — لرحلة الرئيسيّة (D-177). */
  readonly journey: JourneyCounts
  /** مقاطعُ المالك المرفوعة (D-180) — أحدثُها أوّلًا. */
  readonly uploads: readonly UploadRow[]
  /** نصوصٌ كُتبت لمقاطع لم تُنشأ منشوراتُها كلُّها بعد (KV، D-190) — مفتاحُها معرّفُ المقطع. */
  readonly captions?: Readonly<Record<string, VideoCaptions>>
  /** حالُ ربط كلّ منصّة — يُقال حيث تُختار (D-190). */
  readonly links?: Readonly<Record<string, LinkState>>
  /**
   * ‏بصمةُ المنظّمة وصاحبِ الجلسة (مراجعة D-324) — مفتاحُ ما يحفظه «بنفسي» في المتصفّح (`sada-own:<البصمة>`)، فلا يرى عضوٌ
   * ‏آخر على الجهاز نفسِه نصًّا لم يُرسَل، ولا يُملأ مُنشئُ عميلٍ بنصّ عميلٍ آخر. وغيابُها بصمةٌ فارغة.
   */
  readonly ownScope?: string
  /** مَن يرى مقاطع YouTube وTikTok: قرارُ المالك بعد الإجازة (D-190). */
  readonly reach?: Reach
  /** سقفُ الترويج الأسبوعيّ — ومنه وحده يأتي مبلغُ التوصية. */
  readonly promoCap: number
  /**
   * معرّفُ حساب Cloudflare إن كان مضبوطا — يُملأ به عنوانُ نموذجه.
   *
   * **وليس سرّا**: هو في كلّ عنوانٍ يُنادى، وفي لوحة Cloudflare نفسِها.
   * والسرُّ هو الرمز، ولا يمرّ من هنا (D-005).
   */
  readonly cfAccountId: string | null
  /**
   * حاجزُ الكتابة المدفوعة — `blockerFor('draft', …)` الذي يحكم به النداءُ نفسُه.
   * ومنه يُعطَّل زرُّ «اكتب مسوّدة» بسببه، ويُقال السقفُ في «خطوتك التالية».
   * واختياريٌّ: الشاشاتُ المرسومةُ للتدقيق لا تكتب.
   */
  readonly draftBlocker?: Blocker | null
  /** منطقةُ المالك من كعكة `sada_tz` (D-173) — ومنها ساعةُ انفتاح السقف بتوقيته. */
  readonly zone?: string | null
}

/*
 * ‏**كلُّ لوحٍ يسمّي ما يقرأ** (D-280). كانت `PanelData` حقيبةً واحدةً تُملأ كلُّها لكلّ طلب — خمسةٌ وأربعون
 * ‏استعلامًا متتابعًا لرسم لوحٍ يقرأ عشرة. فصار لكلّ لوحٍ نوعُه: `Pick` من الحقيبة يقول للمحمِّل في `panel/home.ts`
 * ‏ما يُحمَّل، وللمصرِّف أنّ قسمًا يقرأ حقلًا ليس في لوحه **خطأٌ في النوع لا فراغٌ صامت**. والهيكلُ — الرافدةُ
 * ‏والترويسةُ والإشعارُ والذيل — يقرأ `ShellData` في كلّ لوح.
 */

/** ما يرسمه الهيكلُ لكلّ لوح: الرافدةُ بأعدادها، والترويسةُ وحبّةُ الحال، والإشعارُ وشريطُ المنصّات المنقطعة. */
export type ShellData = Pick<PanelData,
  'env' | 'role' | 'paused' | 'pulses' | 'rpId' | 'flash' | 'now' | 'csrf' | 'nonce' | 'orgs' | 'org' | 'drafts' | 'channels' | 'zone' | 'unread'>

/** «نظرة عامّة»: الرحلةُ و«ما ينتظرك» والبطاقاتُ (`TileSource`) و«الكلفة وما وقع». */
export type OverviewData = Pick<PanelData,
  'sources' | 'media' | 'journey' | 'openSuggestions' | 'draftBlocker' | 'factors' | 'providers' | 'routing'
  | 'dashboardTiles' | 'series' | 'spendBy' | 'spendMonth' | 'today' | 'autoEnqueue' | 'slide' | 'analysisCap'
  | 'spendCap' | 'usedAnalyses' | 'usedSpend' | 'targets' | 'outbox' | 'alertWebhook' | 'planReady'>

/** «المنشورات»: المسوّداتُ ومحرّرُها، و«اكتب»، والخطّة. */
export type PostsData = Pick<PanelData,
  'editing' | 'media' | 'targets' | 'pageOnly' | 'peaks' | 'mediaReady' | 'writableSources' | 'draftReady' | 'writers'
  | 'draftBlocker' | 'links' | 'ownScope' | 'plan' | 'planReady' | 'sources' | 'audit' | 'planForm' | 'planPending' | 'planCounts' | 'imageQuota'>

/** «المكتبة»: المصادرُ والمقاطعُ والصور. */
export type LibraryData = Pick<PanelData,
  'sources' | 'uploads' | 'captions' | 'links' | 'reach' | 'draftReady' | 'draftBlocker' | 'media'>

/** «الحسابات»: القنواتُ وحدها — وهي في الهيكل أصلًا. */
export type AccountsData = Pick<PanelData, 'channels'>

/** «الإعدادات»: الحدودُ والمزوّدون والأمانُ والمنظّمات وما للمطوّر. */
export type SettingsData = Pick<PanelData,
  'dashboardTiles' | 'analysisCap' | 'usedAnalyses' | 'spendCap' | 'usedSpend' | 'videoCap' | 'usedClips' | 'promoCap'
  | 'autoEnqueue' | 'autoImage' | 'imageCap' | 'usedImages' | 'alertWebhook' | 'outbox' | 'imageOverlay' | 'slide'
  | 'sessions' | 'factors' | 'audit' | 'providers' | 'routing' | 'knownProviders' | 'cfAccountId' | 'baseUrl' | 'adminApi'>

/** «التحليل»: اللوحُ المحوريّ. */
export type ResultsData = Pick<PanelData, 'pivot'>

/**
 * ما يُرسَم وبياناتُه معًا — **والنوعُ يربط اللوحَ بما يحتاجه**: «/panel» الرئيسيّةُ والمنشورات، و`swapPosts`
 * ‏«المنشورات» وحدَها لسكربت التبديل (D-232)، وكلُّ لوحٍ آخر في مساره (D-211).
 */
export type PaneView =
  | { readonly only: null; readonly swapPosts?: false; readonly data: ShellData & OverviewData & PostsData }
  | { readonly only: null; readonly swapPosts: true; readonly data: ShellData & PostsData }
  | { readonly only: 'overview'; readonly data: ShellData & OverviewData }
  | { readonly only: 'posts'; readonly data: ShellData & PostsData }
  | { readonly only: 'library'; readonly data: ShellData & LibraryData }
  | { readonly only: 'accounts'; readonly data: ShellData & AccountsData }
  | { readonly only: 'settings'; readonly data: ShellData & SettingsData }
  | { readonly only: 'results'; readonly data: ShellData & ResultsData }

export interface PanelFactors {
  readonly passkeys: {
    id: string; label: string; createdAt: string; lastUsedAt: string | null
  }[]
  readonly totpConfirmed: boolean
  readonly recoveryLeft: number
  /** رموزٌ على مفتاحٍ غير الحاليّ (مراجعة D-318) — تبطل أو بطلت. */
  readonly recoveryStale?: number
  readonly enforced: boolean
}

export interface PanelSession {
  /** بصمةُ الجلسة لا سرُّها (D-150) — ما يُطبَع في النموذج لا يفتح بابا */
  readonly handle: string
  readonly at: string
  readonly ip: string
  readonly ua: string
  readonly via: 'admin_token' | 'passkey' | 'email_code'
  readonly current: boolean
  /** صاحبُ الجهاز (D-318) — يُرسَم تحت عنوانه، والمالكُ وحدَه يرى أجهزةَ غيره. */
  readonly email?: string
}

export interface PanelAudit {
  readonly at: string
  readonly actor: string
  readonly action: string
  readonly target: string | null
  readonly detail: string | null
  readonly ip: string | null
  readonly byEmail?: string | null
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

/** درجةٌ مقياسُ مقدار: تدرّجُ هيئةٍ واحدة بدرجات الحبر الثلاث (D-187)، والرقم بلون النصّ لا بلون العلامة. */
export function worthCell(worth: number | null): string {
  if (worth === null) return statusBadge('idle', '○', 'لم يُحلَّل')
  const p = Math.round(worth * 100)
  const shade = worth >= 0.66 ? 'var(--ink)' : worth >= 0.33 ? 'var(--ink-2)' : 'var(--ink-3)'
  return `<div class="worth" tabindex="0" data-tip="درجة الاستحقاق ${worth.toFixed(2)} من 1">
    <div class="track"><span class="fill" style="width:${p}%;background:${shade}"></span></div>
    <span class="val">${worth.toFixed(2)}</span></div>`
}

function sourceRow(s: PanelSource, now: Date, zone: string | null): string {
  const pending = !s.analyzed || s.stale
  const status = s.stale
    ? statusBadge('warn', '▲', 'تغيّر بعد التحليل')
    : s.analyzed
      ? statusBadge('ok', '●', 'محلَّل')
      : statusBadge('idle', '○', 'ينتظر')

  const themes = s.themes.slice(0, 5).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')
  const body = s.summary === null
    ? ''
    : `<div class="sub clamp2">${escapeHtml(s.summary)}</div>` +
      (s.reason === null ? '' : `<div class="sub">— ${escapeHtml(s.reason)}</div>`) +
      (themes === '' ? '' : `<div class="mt-1">${themes}</div>`)

  const action = pending
    ? `<form class="inline" method="POST" action="/panel/analyze" data-busy="جار…">
         <input type="hidden" name="id" value="${escapeHtml(s.id)}">
         ${button({ label: 'حلّل الآن', size: 'sm', type: 'submit' })}</form>`
    : ''
  /*
   * **«افتح في Drive»** (D-126): المعرِّفُ في اليد والرابطُ ثابتُ الصيغة،
   * ويفتح في تبويبٍ جديدٍ بأيقونة المغادرة — كرابط بوّابة المطوّرين.
   * **ومعرِّفٌ لا يوافق صيغةَ Drive لا يصير رابطًا.**
   */
  const drive = driveFileUrl(s.driveFileId)
  const open = drive === null
    ? ''
    : `<a class="btn btn-secondary btn-sm" href="${escapeHtml(drive)}" target="_blank" rel="noopener noreferrer"
         aria-label="افتح ${escapeHtml(s.name)} في Drive">${ICON.external} افتح في Drive</a>`
  // ‏والمرفوعُ يُنزَّل أصلُه، والرابطُ يُفتح عنوانُه (D-284) — والعنوانُ مقبولٌ عند الاستلام بـ https وحدَه
  const origin = s.originUrl !== undefined && s.originUrl !== null && s.originUrl.startsWith('https://')
    ? html`<a class="btn btn-secondary btn-sm" href="${s.originUrl}" target="_blank" rel="noopener noreferrer"
         aria-label="افتح صفحة ${s.name}">${raw(ICON.external)} افتح الصفحة</a>`.value
    : ''
  const file = s.hasFile === true
    ? html`<a class="btn btn-secondary btn-sm" href="/panel/sources/${encodeURIComponent(s.id)}/file" download>نزّل الأصل</a>`.value
    : ''
  const acts = `${action}${open}${origin}${file}`

  const seen = Date.parse(s.lastSeenAt.replace(' ', 'T') + 'Z') || 0
  return `<tr data-pending="${pending ? '1' : '0'}" data-worth="${s.worth ?? -1}"
      data-name="${escapeHtml(s.name)}" data-seen="${seen}">
    <td><div class="nm">${fileName(s.name)}${s.kind === 'upload' ? ' <span class="chip">مرفوع</span>' : s.kind === 'url' ? ' <span class="chip">رابط</span>' : ''}</div>${body}</td>
    <td data-label="الحال">${status}</td>
    <td data-label="الاستحقاق">${worthCell(s.worth)}</td>
    <td data-label="آخر ظهور">${agoTag(s.lastSeenAt, now, zone)}</td>
    <td data-label="">${acts === '' ? '<span class="mono">—</span>' : `<div class="row acts">${acts}</div>`}</td>
  </tr>`
}

/** أيقوناتُ الرافدة. `currentColor` فتتبع حالَ العنصر والثيم معا. */



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
function tileRow(d: ShellData & OverviewData): string {
  const tiles = chosenTiles(d.dashboardTiles)
  const cols = tiles.length >= 6 ? 'c3' : tiles.length === 5 ? 'c5' : `c${tiles.length}`
  const cards = tiles.map((spec) => {
    const v = spec.of(d, { money })
    return `<div class="card tile"><div class="kv-k">${escapeHtml(spec.label)}</div>
      <div class="kv-v">${escapeHtml(v.value)}${
        v.em === undefined ? '' : `<em> ${escapeHtml(v.em)}</em>`}</div>
      ${v.bar === undefined ? '' : bar(v.bar.used, v.bar.cap, v.bar.full)}
      ${v.delta === true ? deltaOf(d.series) : ''}
      ${v.note === undefined ? '' : `<div class="note">${escapeHtml(v.note)}</div>`}</div>`
  })
  return `<div class="card grid tiles ${cols}">${cards.join('')}</div>`
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
function tilePicker(d: Pick<SettingsData, 'dashboardTiles'>): string {
  const chosen = new Set(chosenTiles(d.dashboardTiles).map((t) => t.id))
  const boxes = TILES.map((spec) => {
    const on = chosen.has(spec.id)
    return `<label class="card card-inset tpick">
      <input type="checkbox" name="tile" value="${escapeHtml(spec.id)}"${on ? ' checked' : ''}>
      <span class="tp-t"><b>${escapeHtml(spec.label)}</b>
        <span>${escapeHtml(spec.why.replaceAll('**', ''))}</span></span>
    </label>`
  }).join('')
  return `<div class="card mt-3" id="tiles"><h2>بطاقات لوحك</h2>
    <p class="hint">ما تراه تحت «اليوم بالأرقام» في الرئيسيّة. اختر من ${TILE_MIN} إلى ${TILE_MAX}،
      وترتيبُها ترتيب هذه القائمة.</p>
    <form method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="dashboard_tiles">
      <div class="tgrid">${boxes}</div>
      <div class="row mt-4">
        ${button({ label: 'احفظ لوحي', variant: 'primary', type: 'submit' })}
        <span class="note self-center">
          وما دون ${TILE_MIN} يعود إلى الأربع الأصليّة — فلا شاشة فارغة.</span>
      </div>
    </form>
  </div>`
}

function deltaOf(series: readonly { day: string; total: number }[]): string {
  if (series.length < 2) return ''
  const today = series[series.length - 1]!.total
  const yesterday = series[series.length - 2]!.total
  if (yesterday === 0 && today === 0) return '<div class="delta">كأمس تماما</div>'
  // ‏والسهمُ مرسومٌ من parts لا حرفٌ من خطّ النظام (D-167)، **وسهمٌ لا مثلّث** (D-185):
  // ‏«▲» في جدول الحال يعني «ساقط»، فكان الصاعدُ هنا يُرسَم مثلّثَ تنبيه
  if (yesterday === 0) return `<div class="delta up"><span class="ar">${glyph('↑')}</span>بدأ اليوم</div>`
  const change = ((today - yesterday) / yesterday) * 100
  if (Math.abs(change) < 1) return '<div class="delta">كأمس تقريبا</div>'
  const up = change > 0
  return `<div class="delta ${up ? 'up' : 'down'}"><span class="ar">${glyph(up ? '↑' : '↓')}</span>${
    Math.abs(change).toFixed(0)}٪ ${up ? 'أكثر' : 'أقلّ'} من أمس</div>`
}

/**
 * «ما وقع اليوم» (D-127) — **الروايةُ تحت «ما ينتظرك»**: الأولى ما عليك،
 * والثانيةُ ما وقع منذ منتصف الليل UTC. ولا استعلامَ لها: تُروى من سجلّ
 * التدقيق والمسوّدات وحقائق اللوح المحوريّ التي قُرئت أصلًا.
 */
function todayList(d: Pick<PanelData, 'today' | 'now'>): string {
  const rows = d.today.items
    .map((i) => `<li><span class="dot ${i.kind}"></span>
      <span>${escapeHtml(i.text)}${i.at === null ? '' : ` <span class="ago">${escapeHtml(relativeTime(i.at, d.now))}</span>`}</span>
      ${i.go === undefined ? '' : button({ label: i.goLabel ?? 'افتح', size: 'sm', href: i.go })}</li>`)
    .join('')
  const more = d.today.more === 0 ? '' : `<p class="hint">و${d.today.more} غيرُها اليوم — في سجلّ الأمان.</p>`
  return `<div class="card"><h2>ما وقع اليوم</h2>
      <p class="hint">من سجلّ النشاط، منذ الثالثة فجرًا بتوقيت الرياض</p>
      ${rows === ''
        ? emptyState({ title: 'لم يقع شيء بعد', html: 'منذ الثالثة فجرًا بتوقيت الرياض.' })
        : `<ul class="todo">${rows}</ul>${more}`}</div>`
}

/**
 * «المنشورات» أربعةُ تبويبات (D-195): **المسوّدات** (الاعتمادُ والجدولة)، و**اكتب** (من فكرةٍ ومن مصدر)،
 * و**الفيديو**، و**الخطّة**. كان اللوحُ صفحةً واحدةً بستّ مهامّ: ‏١٨ شاشةً على الهاتف والكتابةُ في التاسعة.
 *
 * والتبويبُ رابطٌ إلى قسمه (`#sub-…`)، **وكلُّ مرساةٍ قديمة تفتح قسمَها** (`#idea` و`#write` و`#videos`
 * و`#plan-import` و`#d-…`) — يقرأ `show()` القسمَ الذي يحوي المرساة. وبلا سكربتٍ تظهر الأقسامُ كلُّها.
 */
function postsTabs(d: ShellData & PostsData, drafts: { readonly list: string; readonly write: string }, plan: string): string {
  /*
   * ‏**والمحرّرُ المركّز بجوار القائمة في قسمها** (D-198): لا تبويبَ خامس ولا صفحةٌ ثانية. لوحٌ ‏560px
   * ‏على الحاسوب، وشاشةٌ كاملةٌ على الهاتف، وبلا `?open=` تبقى القائمةُ كما رسمها D-195.
   */
  const ed = d.editing ?? null
  const list = ed === null
    ? drafts.list
    : `<div class="posts-split"><div class="posts-list">${drafts.list}</div>${editorPane({
        draft: ed,
        media: d.media,
        targets: d.targets,
        pageOnly: d.pageOnly,
        peaks: d.peaks?.[ed.platform],
        mediaReady: d.mediaReady,
        zone: d.zone ?? null,
        now: d.now,
      })}</div>`
  const waiting = d.drafts.filter((x) => x.status === 'draft').length
  const failed = d.drafts.filter((x) => x.status === 'failed').length
  const nav = tabs('أقسام المنشورات', [
    { label: 'المسوّدات', href: '#sub-list', current: true, ...(waiting + failed > 0 ? { count: waiting + failed, bad: failed > 0 } : {}) },
    { label: 'اكتب', href: '#sub-write' },
    { label: 'الخطّة', href: '#sub-plan' },
  ], { id: 'posts-sub' })
  return `${nav}
  <div data-sub id="sub-list">${list}</div>
  <div data-sub id="sub-write">${drafts.write}</div>
  <div data-sub id="sub-plan">${plan}</div>`
}

/**
 * «الإعدادات» بأقسامها السبعة كما في خطّة التصميم 5.8 (D-204 · D-221): كانت ثلاثةَ ألواحٍ في الرافدة — «الحدود»
 * و«المزوّدون» و«الأمان» — تُفتح نادرًا وتأخذ ثلاثةَ أسطرٍ ممّا يُفتح كلَّ يوم. **والمراسي القديمة
 * أسماءُ أقسامها**: `#settings` يفتح الأوّل، و`#limits` و`#providers` و`#security` أقسامَها.
 * و«المظهر» و«النظام» أوّلًا (D-221): السمةُ والكثافةُ وبطاقاتُ اللوح، ثمّ «هل الآلةُ تعمل؟» نُقلت من الرئيسيّة.
 */
function settingsTabs(missing: number, owner: boolean): string {
  // ‏أربعةٌ لا ثمانية (EASE-PLAN ز): ما يُفتح كثيرًا تبويبٌ وحده، والنادرُ تحت «متقدّم».
  // ‏والمراسي القديمة (#providers و#activity و#dev…) معرّفاتٌ داخل أقسامها، فتفتح قسمَها كما كانت
  // ‏ولغير المالك (D-272) المظهرُ والحدودُ وحدهما: «الأمان» (الأجهزةُ والمفاتيحُ وسجلُّ التدقيق) و«متقدّم»
  // ‏(خدماتُ الكتابة ومفاتيحُها والمنظّمات) للمالك وحده — والحارسُ يردّ أفعالَها، وهنا لا تُرسَم قراءتُها أصلًا
  return tabs('أقسام الإعدادات', [
    { label: 'المظهر', href: '#appearance', current: true },
    { label: 'الإنفاق والحدود', href: '#limits' },
    ...(owner ? [
      { label: 'الأمان', href: '#security-all' },
      { label: 'متقدّم', href: '#advanced', ...(missing > 0 ? { count: missing, bad: true } : {}) },
    ] : []),
  ], { id: 'settings-sub' })
}

/**
 * «المنظّمات» (D-225): حسابُ الدخول الحاليّ حسابُ المشغّل — يرى كلَّ المنظّمات وينشئها وينتقل بينها.
 * وصلاحيّاتُ كلّ منظّمةٍ والحساباتُ الإشرافيّة في المرحلة الثانية (وثيقةُ الرؤية §الوصول).
 */
function orgsPane(d: Pick<ShellData, 'orgs' | 'org'>): string {
  const orgs = d.orgs ?? []
  const rows = orgs.map((o) => {
    const current = o.id === d.org
    const action = current
      ? statusBadge('ok', '●', 'النشطة')
      : `<form class="inline" method="POST" action="/panel/orgs/switch">
          <input type="hidden" name="org" value="${escapeHtml(o.id)}">
          ${button({ label: 'انتقل إليها', size: 'sm', type: 'submit' })}</form>`
    return `<tr><th scope="row">${escapeHtml(o.name)}</th><td>${ORG_KIND_LABEL[o.kind]}</td><td>${o.brands}</td><td>${action}</td></tr>`
  }).join('')
  const kinds = ORG_KINDS.map((k) => `<option value="${k}">${ORG_KIND_LABEL[k]}</option>`).join('')
  return `<div class="card"><h2>منظّماتك</h2>
    <p class="hint">تدير كلّ المنظّمات من حسابك هذا. <b>وبيانات كلّ منظّمة معزولة عن غيرها</b>.</p>
    <div class="scroll"><table><thead><tr><th>المنظّمة</th><th>النوع</th><th>العلامات</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
  <div class="card mt-3"><h2>منظّمة جديدة</h2>
    <form method="POST" action="/panel/orgs">
      <div class="field"><label for="org-name">الاسم</label>
        <input id="org-name" name="name" required maxlength="${ORG_NAME_MAX}"></div>
      <div class="field"><label for="org-kind">النوع</label>
        <select id="org-kind" name="kind">${kinds}</select></div>
      ${button({ label: 'أنشئ المنظّمة', variant: 'primary', type: 'submit' })}
    </form></div>`
}

/**
 * «للمطوّر» (خطّة التصميم 5.7 و5.8 · D-209): **ما لا يحتاجه المالكُ كلَّ يوم ويحتاجه حين يضبط**. البيئةُ والنطاق،
 * ورابطُ العودة لكلّ منصّة كما يُلصق في بوّابتها، وأسماءُ أسرار Worker الناقصة — **أسماءٌ لا قيَم**، ولا يُقرأ سرٌّ هنا.
 * كانت أسماءُ الأسرار على بطاقة «الحسابات» فرُفعت عنها في D-205؛ فهذا موضعُها.
 */
function devPane(d: Pick<ShellData, 'channels' | 'env' | 'rpId'> & Pick<SettingsData, 'baseUrl' | 'adminApi'>): string {
  const built = d.channels.filter((v) => v.spec.built)
  const rows = built.map((v) => `<tr><th scope="row">${escapeHtml(v.spec.label)}</th>
      <td dir="ltr" class="mono">${escapeHtml(`${d.baseUrl}/oauth/${v.spec.id}/callback`)}</td>
      <td>${v.missing.length === 0 ? 'لا ينقص شيء' : v.missing.map((m) => `<span class="mono">${escapeHtml(m)}</span>`).join(' · ')}</td></tr>`).join('')
  return `<div class="card"><h2>البيئة</h2>
    <div class="scroll"><table><tbody>
      <tr><th scope="row">البيئة</th><td>${d.env === 'production' ? 'الإنتاج' : 'التجريبيّة'}</td></tr>
      <tr><th scope="row">النطاق</th><td dir="ltr" class="mono">${escapeHtml(d.rpId)}</td></tr>
      <tr><th scope="row">العنوان</th><td dir="ltr" class="mono">${escapeHtml(d.baseUrl)}</td></tr>
    </tbody></table></div></div>
  <div class="card mt-3"><h2>المنصّات</h2>
    <p class="hint">رابط العودة يُلصق حرفًا في بوّابة كلّ منصّة — <b>ولا يُخلَط النطاقان</b>. والأسرار أسماؤها وحدها؛
      تُضبط بـ<span class="mono">wrangler secret put</span> أو من شاشة المنصّة.</p>
    <div class="scroll"><table><thead><tr><th>المنصّة</th><th>رابط العودة</th><th>أسرار Worker الناقصة</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
  ${adminApiCard(d.adminApi === true)}`
}

/**
 * **أبوابُ الطرفيّة** (D-318) — ما يُنادى بكلمة الإدارة من الطرفيّة بلا عاملٍ ثانٍ. الجاهزيّةُ والمسحُ مفتوحان دائمًا (تذكرهما
 * «ما عليك» وسيرُ النشر)، والثلاثةُ التي لا يناديها شيءٌ في المستودع مغلقةٌ حتّى يفتحها المالكُ هنا، بتحقّقٍ للتوّ.
 *
 * ‏**والزرُّ `raw(button(…))`** (مراجعة D-325): `button()` يعيد نصًّا والقالبُ `html` يهرّب النصّ — فبلا `raw` صار الزرُّ وسمًا
 * ‏يُقرأ ولا يُضغط، والنموذجُ بلا إرسال. ويمسك ذلك `audit_markup` (دالّةُ عُدّةٍ في قالب `html` بلا `raw`).
 */
function adminApiCard(open: boolean): string {
  return html`<div class="card mt-3" id="admin-api"><h2>أبواب الطرفيّة</h2>
    <p class="hint">تُنادى بكلمة الإدارة (<span class="mono">ADMIN_TOKEN</span>) من الطرفيّة، بلا عامل ثانٍ.
      <b>الجاهزيّة والمسح مفتوحان دائمًا</b>، وكلّ نداء بالكلمة صفّ في سجلّ النشاط، وثلاثون نداءً في ربع ساعة لكلّ عنوان.</p>
    <div class="split">
      <p class="m-0">${raw(open
        ? 'الثلاثة الأخرى <b>مفتوحة</b>: قراءة خدمات الكتابة والصور، وقراءة المصادر، والتحليل المدفوع بسقوف اللوحة نفسِها.'
        : 'الثلاثة الأخرى <b>مغلقة</b>: قراءة خدمات الكتابة والصور، وقراءة المصادر، والتحليل المدفوع — ولكلّ منها باب في اللوحة.')}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${open
              ? 'إغلاق الأبواب الثلاثة؟ تبقى الجاهزيّة والمسح.'
              : 'فتح الأبواب الثلاثة لكلمة الإدارة؟ من يملكها يقرأ ويحلّل بلا عامل ثانٍ، بسقوف الإنفاق نفسِها.'}">
        <input type="hidden" name="key" value="admin_api">
        <input type="hidden" name="value" value="${open ? 'false' : 'true'}">
        ${raw(button({ label: open ? 'أغلقها' : 'افتحها', type: 'submit' }))}
      </form>
    </div>
  </div>`.value
}

/**
 * «المكتبة» ثلاثةُ تبويبات (خطّة التصميم 5.8 · D-206): **المصادر · الفيديو · الصور** — المادّةُ الخامّ في وجهةٍ
 * واحدة. كان الفيديو تبويبًا في «المنشورات» بين الكتابة والخطّة، والصورُ لا تُرى إلّا داخل بطاقة مسوّدتها.
 * والعددُ «ينتظرك» في المصادر (غيرُ المحلَّل)، وعددُ ما هناك في الفيديو والصور.
 */
function libraryTabs(pending: number, videos: number, images: number): string {
  return tabs('أقسام المكتبة', [
    { label: 'المصادر', href: '#sources', current: true, ...(pending > 0 ? { count: pending } : {}) },
    { label: 'الفيديو', href: '#sub-videos', ...(videos > 0 ? { count: videos } : {}) },
    { label: 'الصور', href: '#sub-images', ...(images > 0 ? { count: images } : {}) },
  ], { id: 'library-sub' })
}

/**
 * «منشور جديد» عائمٌ على الهاتف (خطّة التصميم 5.3 · D-208) — **ظاهرٌ حيث يُبدأ العمل**: الرئيسيّةُ والمكتبة. ولا في
 * «المنشورات»: رأسُها يحمل الأبوابَ الأربعة نفسَها، وكان الزرُّ فوق «اكتب المسوّدات» يبتلع ضغطتَها (ر-2·stop).
 *
 * على الحاسوب أبوابُ الكتابة الأربعة في رأس «المنشورات»؛ وعلى الهاتف كانت في رأس لوحٍ يُبلَغ بضغطتين. فصارت زرًّا
 * فوق الشريط في طرف السطر، يفتح قائمةً بالأبواب الأربعة نفسِها. وهو `<details>` يعمل بلا سكربت، ويختفي حين يُكتب
 * في نموذج (`form:focus-within`) وحين يُفتح المحرّر، وفي الألواح الأخرى.
 */
/**
 * ‏**«منشور جديد» على الحاسوب أيضًا** (D-216): كان الزرُّ العائم على الهاتف وحدَه، وعلى الحاسوب أربعةُ أزرار بدءٍ داخل
 * ‏«المنشورات» فقط. فصار في الترويسة من كلّ صفحة، بالبدايات الأربع نفسِها، ومساراتُها إلى «/panel» لتصل من أيّ لوح.
 */
/** ‏أبوابُ الكتابة الخمسة بمساراتها إلى «/panel» — لتصل من أيّ لوح. */
function newItems(): string[] {
  return [
    menuItem({ label: 'من فكرة', note: 'جملة أو كلمات', href: '/panel#idea' }),
    menuItem({ label: 'من مصدر', note: 'ملفّ محلَّل من Drive', href: '/panel#write' }),
    // ‏ونصُّك كما كتبته، بلا نموذج ولا كلفة (D-324)
    menuItem({ label: 'بنفسي', note: 'نصّك كما تكتبه', href: '/panel#own' }),
    menuItem({ label: 'فيديو', note: 'يُرفع ثمّ يُكتب نصُّه', href: panelHref('videos') }),
    menuItem({ label: 'خطّة من ملفّ', note: 'CSV لأسابيع', href: '/panel#plan-import' }),
  ]
}

function topNew(): string {
  return menu({ label: 'منشور جديد', variant: 'primary', size: 'sm', icon: ICON.add, attrs: 'data-tb-new', items: newItems() })
}

/**
 * ‏**«منشور جديد ▾» في سطر التحيّة على الهاتف** (D-326 · «أنشئ من كلّ مكان»، من مقارنة Buffer في UX-AUDIT-5): الترويسةُ على
 * ‏الهاتف لا تحمل «منشور جديد»، وكان بابُ الكتابة في الرئيسيّة زرًّا عائمًا مستديرًا اسمُه لقارئ الشاشة وحده (UX-AUDIT-4 · أ) —
 * ‏فقالت الخلاصةُ «لا باب» وقال المالكُ «لا أجد أين أكتب» (الجلسة أ، المهمّة ٢). فصار البابُ نفسُه **باسمه** في سطر التحيّة،
 * ‏ثانويًّا: البطاقةُ تحمل أوّليَّها («خطوتك التالية»)، ولا زرّان أوّليّان في منطقة. وعلى الحاسوب لا يُرسم: زرُّ الترويسة ظاهر،
 * ‏فلا زرّان بالاسم نفسِه في شاشة. والعائمُ يبقى في «المكتبة» ويخرج من الرئيسيّة لهذا.
 */
function homeNew(): string {
  return menu({ label: 'منشور جديد', variant: 'secondary', size: 'sm', icon: ICON.add, attrs: 'data-home-new', items: newItems() })
}

/**
 * ‏**بابٌ واحدٌ للإنشاء** (D-232، من مقارنة Buffer وCanva): كان رأسُ «المنشورات» أربعةَ أزرارٍ متساوية، فيقرأ
 * ‏المالكُ أربعةَ خيارات قبل أن يعرف ماذا يريد. فصار زرًّا واحدًا يسأل «من أين تبدأ؟». وعلى العريض لا يُرسم:
 * ‏زرُّ الترويسة (`topNew`) نفسُه ظاهرٌ هناك، فلا زرّان بالاسم نفسِه في شاشةٍ واحدة.
 */
function headNew(): string {
  return menu({
    label: 'منشور جديد', variant: 'primary', size: 'sm', icon: ICON.add, attrs: 'data-head-new',
    items: [
      menuItem({ label: 'من فكرة', note: 'جملة أو كلمات', href: '#idea' }),
      menuItem({ label: 'من مصدر', note: 'ملفّ محلَّل من Drive', href: '#write' }),
      menuItem({ label: 'بنفسي', note: 'نصّك كما تكتبه', href: '#own' }),
      menuItem({ label: 'فيديو', note: 'يُرفع ثمّ يُكتب نصُّه', href: panelHref('videos') }),
      menuItem({ label: 'خطّة من ملفّ', note: 'CSV لأسابيع', href: '#plan-import' }),
    ],
  })
}

function fabNew(): string {
  const items = [
    // ‏بمسار «/panel» لا بمرساةٍ وحدها: الزرُّ في كلّ صفحة، و«#idea» في «المكتبة» لا هدفَ لها (EASE-PLAN أ-1)
    ['/panel#idea', 'من فكرة'], ['/panel#write', 'من مصدر'], ['/panel#own', 'بنفسي'], [panelHref('videos'), 'ارفع فيديو'], ['/panel#plan-import', 'خطّة من ملفّ'],
  ].map(([h, t]) => `<a href="${h}">${escapeHtml(t!)}</a>`).join('')
  return `<details class="fab"><summary>${ICON.add}<span class="vh">منشور جديد</span></summary>
    <div class="fab-menu">${items}</div></details>`
}
/** زرُّ المسح — في «ما ينتظرك» وفي رأس جدول المصادر. */
const SCAN_BTN = `<form class="inline" method="POST" action="/panel/scan" data-busy="جار المسح…">
      ${button({ label: 'مسح Drive الآن', size: 'sm', type: 'submit' })}</form>`

/** ما ينتظر التحليل — **والمتقادمُ ينتظر وإن حُلِّل**. */
function pendingSources(sources: readonly PanelSource[]): number {
  return sources.filter((s) => !s.analyzed || s.stale).length
}

/**
 * «نظرة عامّة» (D-280: تُرسَم وحدَها حين تُطلَب، ولا يُحمَّل لها غيرُ ما تقرأ).
 */
function overviewPane(d: ShellData & OverviewData & Partial<Pick<PostsData, 'plan' | 'planCounts'>>): string {
  const pending = pendingSources(d.sources)
  const waitingDrafts = d.drafts.filter((x) => x.status === 'draft').length
  const linkedChannels = d.channels.filter(
    (c) => c.state === 'linked' || c.state === 'needs_reauth',
  ).length

  // ‏مفتوحٌ بلا صورةٍ جاهزة — عدُّ محطّة «الصورة» وأوّلُها من شرطٍ واحد
  const bare = (x: DraftRow): boolean =>
    (x.status === 'draft' || x.status === 'approved' || x.status === 'edited')
    && !d.media.some((m) => m.postId === x.id && m.status === 'ready')

  // ‏حقائقُ الرئيسيّة مرّةً: للرأس ولبطاقة «ما كُتب في أسبوعين» في المطويّ (D-309)
  const facts: HomeFacts = {
    channels: d.channels,
    counts: d.journey,
    paused: d.paused,
    sources: { total: d.sources.length, analyzed: d.sources.filter((x) => x.analyzed).length },
    withoutImage: d.drafts.filter(bare).length,
    withImage: d.drafts.filter((x) => d.media.some((m) => m.postId === x.id && m.status === 'ready' && m.mime.startsWith('image/'))).length,
    openSuggestions: d.openSuggestions,
    // ‏والأولى من الستّين المرسومة بترتيب اللوح — فالمرساةُ تجد بطاقتَها
    firsts: {
      waiting: d.drafts.find((x) => x.status === 'draft')?.id ?? null,
      unscheduled: d.drafts.find((x) => x.status === 'approved' || x.status === 'edited')?.id ?? null,
      withoutImage: d.drafts.find(bare)?.id ?? null,
    },
    pulses: d.pulses,
    blocker: d.draftBlocker ?? null,
    zone: d.zone ?? null,
    scheduled: d.drafts.filter((x) => x.scheduledAt !== null && x.status === 'queued')
      .map((x) => ({ platform: x.platform, at: x.scheduledAt! })),
    written: d.drafts.map((x) => x.createdAt),
  // ‏الأرقامُ بعد «خطوتك التالية» مباشرةً (D-194) — كانت بعد الرحلة والمنصّات
  // ‏و«ينتظر قرارك» قبل الأرقام (D-216): القرارُ يُتّخذ من الرئيسيّة، والأرقامُ بعده
  // ‏و«اليوم بالأرقام» نزل إلى المطويّ (D-289): التحليلاتُ والإنفاقُ أرقامُ تشغيلٍ لا قرارُ اليوم
  // ‏والخطّةُ بعد التحيّة وقبل الأرقام (D-289)
  }
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
      text: `${c.spec.label}: انتهى الإذن — والنشر متوقّف عليها.`,
      go: '#channels',
      label: 'جدّد',
    })
  }
  // ‏والمحفوظُ بلا إذنٍ بعد المنتهي (D-166): يسقط أوّلُ منشورٍ مجدولٍ عليه
  for (const c of d.channels.filter((v) => unsignedAccounts(v).length > 0)) {
    items.push({
      kind: 'bad',
      text: `${c.spec.label}: الحساب محفوظ بلا إذن — أوّل منشور مجدول عليها يسقط.`,
      go: `/panel/channels/${c.spec.id}`,
      label: 'أعد الربط',
    })
  }
  if (d.paused) {
    items.push({ kind: 'warn', text: 'النظام موقوف مؤقّتا — لا مسح ولا تحليل ولا نشر.', go: '#limits', label: 'استأنف' })
  }
  if (!d.factors.enforced) {
    items.push({
      kind: 'warn',
      text: 'لا عامل ثان: رمز البريد وحدَه يفتح اللوحة.',
      go: '#security',
      label: 'سجّل مفتاحا',
    })
  }
  /*
   * ‏ولا حسابَ أصلًا في أوّل يوم: تقولها «البدء في ثلاث خطوات» و«خطوتك التالية» فوقها (D-326) — الحقيقةُ تُقال مرّةً. **وتُقال
   * ‏هنا حين لا ترسم الرئيسيّةُ تلك القائمة** (مراجعة D-326): من نشر ثمّ فصل حساباتِه كلَّها لا قائمةَ له، و«خطوتك التالية» يأخذها
   * ‏فشلُ ما كان مجدولًا — وكان الشرطُ «في منصّةٍ حساب» لا يقع أبدًا مع «لا مربوطة».
   */
  if (linkedChannels === 0 && firstRun(facts) === null) {
    items.push({ kind: 'warn', text: 'لا قناة مربوطة — النظام يفهم ويكتب ولا ينشر.', go: '#channels', label: 'اربط' })
  }
  const unverified = d.providers.filter((p) => p.configured && p.enabled && p.verifiedAt === null)
  for (const p of unverified) {
    items.push({ kind: 'warn', text: `${p.label}: مفتاحُه لم يُختبر بعد.`, go: '#providers', label: 'اختبره' })
  }
  // ‏ولا «تنتظر قرارك» ولا «ينتظر التحليل» هنا (D-309): تقولهما «ينتظر قرارك» و«رحلة المنشور» فوق هذه البطاقة بأزرارهما
  if (d.factors.enforced && d.factors.recoveryLeft === 0) {
    items.push({ kind: 'warn', text: 'لا رموز استرداد — فقد الجهاز يصير قفلا نهائيّا.', go: '#security', label: 'ولّدها' })
  }

  const todo = items
    .map((i) => `<li><span class="dot ${i.kind}"></span><span>${escapeHtml(i.text)}</span>
      ${i.go === undefined ? '' : button({ label: i.label ?? 'اذهب', size: 'sm', href: i.go })}</li>`)
    .join('')

  return `<section data-pane="overview" hidden>
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
  ${/*
    * **الرحلةُ قبل الدفتر** (D-177): خطوتُك التالية، ثمّ المحطّاتُ السبع، ثمّ
    * المنصّاتُ الخمس. والمالُ وصحّةُ الدورات بعدها — كانت أوّلَ الشاشة فقال
    * المالك «لا أجد المراحل».
    */''}
  ${d.sources.some((x) => x.analyzed) ? '' : firstBand()}
  ${/* ‏**الخطّةُ أوّلًا** (D-289): محورُ المنصّة أوّلُ ما يُرى — وتُحمَّل مع «المنشورات» على `/panel`، فلا جملةَ جديدة */''}
  ${homeTop(facts, d.now, deskQueue(d.drafts, d.now), d.plan === undefined ? '' : planCard(d.plan, d.planCounts, d.now, d.zone ?? null), homeNew())}
  ${/*
   * **عمودان يُملآن لا يُمدّان** (D-136): ما عليك وما وقع في العمود الأوّل،
   * والمالُ كلُّه (كيف تغيّر، ثمّ أين يذهب) رصّةً في الثاني. كانت بطاقةُ
   * الإنفاق تُمدّ لتساوي القائمةَ فتترك ‏٥٢١px بيضاء — أمسكها مدقّقُ
   * الذيل بعد أن رآها المالك.
   */''}
  ${/*
   * **رصّتان لا رصّةٌ وبطاقة** (D-145): كانت «ما ينتظرك» و«ما وقع اليوم»
   * قائمتين في بطاقةٍ واحدة تطول إلى ‏١٣١٠px والمالُ في العمود الآخر يقف
   * عند ‏٩٦٥ — ‏٣٥٠px من الأرض الفارغة تحته. والاثنتان شيئان: أفعالٌ تنتظر
   * وسجلٌّ وقع. فلكلٍّ بطاقتُها، والعمودُ الأوّل رصّةٌ كالثاني.
   */''}
  ${/*
   * ‏**قاعدةُ الحذف** (D-232، والدرسُ العكسيّ من Hootsuite): ما يُضاف إلى الرئيسيّة يُطوى مقابلَه شيء. و«ما وقع اليوم»
   * ‏سجلٌّ لا قرار، فنزل إلى المطويّ مع الكلفة، وبقي «ما ينتظرك» وحدَه هنا بعرض اللوح.
   */''}
  <div class="mt-3">
      <div class="card"><h2>ما ينتظرك</h2>
        <p class="hint">مولَّد من حال النظام الآن — لا قائمة ثابتة</p>
        ${todo === ''
          ? emptyState({ title: 'لا شيء ينتظر', html: 'كلّ ما بُني مضبوط.' })
          : `<ul class="todo">${todo}</ul>`}
        <div class="row mt-3">${SCAN_BTN}
          ${button({ label: 'مراجعة المصادر', size: 'sm', href: '#sources' })}</div></div>
  </div>
  ${/*
   * ‏**التشغيلُ والكلفة مطويّان** (D-216): المالُ كان يُعرض أربعَ مرّاتٍ في الرئيسيّة (بطاقتان ورسمٌ وأعمدة)، و«هل الآلةُ
   * ‏تعمل؟» معلومةُ تشغيلٍ لا قرار. فبقيت بطاقتا الإنفاق في «اليوم بالأرقام»، وما عداهما هنا، مطويًّا بسطرٍ يقول حالَه.
   */''}
  <details class="card home-ops mt-3" id="ops">
    <summary><h2>الكلفة وما وقع</h2><span class="grow"></span><span class="ago">اليوم بالأرقام، والإنفاق 14 يومًا، وأين يذهب المال، وسجلّ اليوم</span></summary>
  <h2 class="home-sub mt-3">اليوم بالأرقام</h2>${tileRow(d)}
  <div class="mt-3">${todayList(d)}</div>
  <div class="mt-3">${activityCard(facts, d.now)}</div>
  <div class="ov mt-3">
    <div class="stack">
      <div class="card"><h2>الإنفاق — 14 يومًا</h2>
        <p class="hint">كلّ الخدمات، بالدولار</p>${areaChart(d.series)}
</div>
    </div>
    <div class="stack">
      ${/* ‏والأعمدة من الدفتر كلِّه لا من مزوّدي الذكاء (ر-10): كانت كلفة X تغيب
           عنها والمجموع فوقها يحسبها، فلا تساوي الأعمدة المجموع */ ''}
      <div class="card">
        <div class="card-head"><h2>أين يذهب المال</h2><div class="grow"></div>
          <span class="st idle">30 يومًا</span></div>
        <p class="hint">إنفاق كلّ خدمة على حدة، الكتابة والصور والنشر معًا، <b>والأطول أكبرُها كلفة</b>.
          واضبط سقف اليوم من «الحدود» إن جاوز أحدُها ما تريد.</p>
        ${barChart(d.spendBy.map((r) => ({ label: r.label, value: r.total })), { unit: 'money' })}
      </div>
    </div>
  </div>
  </details>
</section>`
}

/** «المكتبة» — المصادرُ والمقاطعُ والصور. */
function libraryPane(d: ShellData & LibraryData): string {
  const pending = pendingSources(d.sources)
  // ‏والصورُ الجاهزةُ وحدَها في «المكتبة ← الصور» (D-206): المرفوضةُ لا تُعرض مادّةً
  const libraryImages = d.media.filter((m) => m.status === 'ready' && m.mime.startsWith('image/'))

  const sourcesTable = d.sources.length === 0
    ? emptyState({
        echo: true,
        title: 'لا مصادر بعد',
        html: 'صدى تقرأ مجلد Drive المشترَك معها. شغّل المسح ليظهر ما فيه.',
        action: `<form class="inline" method="POST" action="/panel/scan" data-busy="جار المسح…">
           ${button({ label: 'مسح Drive الآن', variant: 'primary', type: 'submit' })}</form>`,
      })
    : `${filterBar([
         { kind: 'seg', label: 'أيّ الملفّات', name: 'src-show', options: [
           { label: 'الكلّ', value: 'all', current: true },
           { label: 'ينتظر', value: 'pending', current: false },
           { label: 'محلَّل', value: 'analyzed', current: false },
         ] },
         { kind: 'pick', label: 'رتّب:', name: 'src-sort', options: [
           { label: 'الأحدث', value: 'seen', current: true },
           { label: 'الأهمّ', value: 'worth', current: false },
           { label: 'الاسم', value: 'name', current: false },
         ] },
       ], 'فلتر الملفّات')}
       <p class="note m-0 mb-3">يُعرض <b id="shown">${d.sources.length}</b> من ${d.sources.length}</p>
       <div class="scroll"><table>
         <thead><tr><th>المصدر</th><th>الحال</th><th>الاستحقاق</th><th>آخر مسح</th><th><span class="vh">الإجراء</span></th></tr></thead>
         <tbody id="src-body">${d.sources.map((s) => sourceRow(s, d.now, d.zone ?? null)).join('')}</tbody>
       </table></div>`

  return `<section data-pane="library" hidden>
  ${/* ‏رأسٌ بلا فقرة (D-277): «التحليل نداء مدفوع» في «؟» بجوار عنوان الملفّات، حيث زرُّ «حلّل الآن» */''}
  ${pageHead('المادّة', sectionLabel('library'), '')}
  ${libraryTabs(pending, d.uploads.length, libraryImages.length)}
  <div data-sub id="sources">
  ${/*
    * **ولا يُقال العنوانُ مرّتين** (D-122). كانت الترويسةُ هنا
    * «المصادر والتحليل» — **وهي عنوانُ اللوح نفسُه فوقها**. فيقول
    * الجدولُ ما فيه هو، لا ما في الشاشة كلِّها.
    */''}
  <div class="card"><div class="card-head"><h2>ملفّات مجلّدك</h2>
    <details class="why-tip"><summary aria-label="لماذا لا يُحلَّل كلُّ ملفّ؟">؟</summary>
      <p class="hint m-0">ما يُبنى منه كلّ منشور: ملفّات Drive، ومقاطعُك، والصور المولَّدة. <b>والتحليل نداء مدفوع</b> — فلا يقع تلقائيًّا على كلّ ملفّ، بل حين تضغط «حلّل الآن».</p>
    </details><div class="grow"></div>${SCAN_BTN}</div>
    ${sourcesTable}</div>
  </div>
  <div data-sub id="sub-videos">${videosSection(d.uploads, d.now, new Set(d.drafts.map((x) => x.id)), {
    ...(d.links === undefined ? {} : { links: d.links }),
    ...(d.reach === undefined ? {} : { reach: d.reach }),
    ...(d.captions === undefined ? {} : { captions: d.captions }),
    zone: d.zone ?? null,
    // ‏«اكتب النصوص» بحكم «اكتب المسوّدات» نفسِه: المزوّدُ والحاجزُ واحد (D-190)
    writer: { ready: d.draftReady, blocked: writeBlock(d.draftBlocker ?? null, d.now, d.zone ?? null) },
  })}</div>
  <div data-sub id="sub-images">${imagesGallery(libraryImages, d.drafts)}</div>
</section>`
}

/** «الحسابات» — القنواتُ وحالُ كلٍّ منها. */
function accountsPane(d: ShellData & AccountsData): string {
  return `<section data-pane="accounts" hidden>
  ${pageHead('النشر', sectionLabel('accounts'), 'منصّاتُك وحال كلّ منها، <b>وما يحتاج يدَك أوّلًا</b>. والبطاقة تفتح صفحة الحساب: ما نُشر عليه، وما يأتي، وإعدادُه.')}
  <div data-sub id="channels">${channelsSection(d.channels, d.now)}</div>
</section>`
}

/** «المنشورات» — المسوّداتُ ومحرّرُها و«اكتب» والخطّة. */
/**
 * **نفدت الحصّةُ المجّانيّة — والقرارُ للمالك** (D-285، «يسألني أوّلًا»): كم صورةً تنتظر، وكم تكلّف الآن،
 * وزرّان. وبعد «انتظر» سطرٌ يقول متى تُرسَم، فلا يُسأل مرّتين في اليوم.
 */
function quotaCard(q: PostsData['imageQuota']): string {
  if (q === undefined || q.waiting === 0 || q.decided === 'pay') return ''
  if (q.decided === 'wait') {
    return html`<p class="hint mb-3">${String(q.waiting)} صورةً تنتظر تجدّدَ حصّة Cloudflare (03:00 بتوقيت الرياض) — يرسمها صدى بعدها وحدَه.</p>`.value
  }
  return html`<div class="card card-alert mb-4" data-tone="warn" role="status">
    <h2 class="m-0">نفدت حصّةُ الصور المجّانيّة اليوم</h2>
    <p class="m-0 mt-2">${String(q.waiting)} صورةً تنتظر. رسمُها الآن يكلّف نحو <b>${money(q.usd)}</b>، أو تنتظر تجدّدَ الحصّة 03:00 بتوقيت الرياض بلا كلفة.</p>
    <div class="row gap-2 mt-3">
      <form class="inline" method="POST" action="/panel/images/quota" data-busy="جار…"><input type="hidden" name="decision" value="pay">${raw(button({ label: 'ارسمها الآن بالدفع', size: 'sm', type: 'submit' }))}</form>
      <form class="inline" method="POST" action="/panel/images/quota"><input type="hidden" name="decision" value="wait">${raw(button({ label: 'انتظر للغد', variant: 'primary', size: 'sm', type: 'submit' }))}</form>
    </div></div>`.value
}

function postsPane(d: ShellData & PostsData): string {
  return `<section data-pane="posts" hidden>
  ${/*
    * ‏**والأبوابُ الثلاثةُ في الشاشة الأولى** — جسرٌ إلى «منشور جديد ▾» (الخطّة 5.6). كانت
    * ‏«اكتب مسوّدة» في الشاشة التاسعة على الهاتف، فضغط المالكُ «اعتمد» على مسوّدةٍ قديمة
    * ‏وظنّ أنّه كتب (ر-2). والثلاثةُ مراسٍ تنزل إلى بطاقاتها في اللوح نفسِه.
    */''}
  ${/* ‏بلا فقرةٍ (D-274، المرحلة د): جملةُ القيد في «؟» بجانب الفرز، لا سطرٌ فوق كلّ فتحة */''}
  ${pageHead('التحرير', sectionLabel('posts'), '', headNew())}
  ${quotaCard(d.imageQuota)}
  ${postsTabs(d, draftsParts({
    drafts: d.drafts,
    writable: d.writableSources,
    targets: d.targets,
    pageOnly: d.pageOnly,
    media: d.media,
    // أدنى موعدٍ يقبله المتصفّح: ربعُ ساعةٍ من الآن. ودورةُ الإرسال تدور
    // كلَّ ربع، فموعدٌ أقرب من ذلك يعد بدقّةٍ لا نملكها
    earliest: earliestLocal(d.now, d.zone ?? null),
    now: d.now,
    ready: d.draftReady,
    writers: d.writers ?? [],
    blocked: writeBlock(d.draftBlocker ?? null, d.now, d.zone ?? null),
    peaks: d.peaks ?? {},
    mediaReady: d.mediaReady,
    ...(d.links === undefined ? {} : { links: d.links }),
    ...(d.ownScope === undefined ? {} : { ownScope: d.ownScope }),
    editing: d.editing?.id ?? null,
    zone: d.zone ?? null,
  }), `${planImportCard()}
  <div class="mt-3">${planSection({
    plan: d.plan,
    names: Object.fromEntries(d.sources.map((s) => [s.id, s.name])),
    ready: d.planReady,
    analyzed: d.sources.filter((s) => s.analyzed).length,
    now: d.now,
    zone: d.zone ?? null,
    // من الخمسين صفًّا المحمَّلة أصلًا للأمان — لا استعلامَ جديد (D-157)
    lastAttempt: d.audit.find((a) => a.action === 'plan.generate') ?? null,
    ...(d.planForm === undefined ? {} : { form: d.planForm }),
    ...(d.planPending === undefined ? {} : { pending: d.planPending }),
  })}</div>`)}
</section>`
}

/** «الإعدادات» — الحدودُ والمزوّدون والأمانُ والمنظّمات وما للمطوّر. */
function settingsPane(d: ShellData & SettingsData): string {
  const missing = d.providers.filter((p) => !p.configured).length
  // ‏المالكُ وحدَه يرى أقسامَ الإعدادات التي للمالك (D-272)؛ والجلسةُ القديمةُ بلا دورٍ للمالك
  const ownerView = (d.role ?? 'owner') === 'owner'
  const { strip: providerStrip, rows: providerRows, add: addCard, routing: routingRows } =
    providersSection(d)
  const { sessions: sessionRows, passkeys: passkeyRows, audit: auditRows } =
    securitySection(d)

  return `<section data-pane="settings" hidden>
  ${pageHead('الضبط', sectionLabel('settings'), 'ما يُفتح نادرًا: <b>سقوف الإنفاق تُطبَّق قبل أيّ نداء مدفوع</b>، والمفاتيح لا تُعرض كاملة، والدخول بعاملين.')}
  ${settingsTabs(missing, ownerView)}
  <div data-sub id="appearance">
  <p class="hint">كيف تبدو اللوحة لك. <b>والسمة والكثافة والاختصارات تُحفظ في هذا المتصفّح وحده</b>، وبطاقات اللوح في حسابك.</p>
  <div class="card"><h2>السمة والكثافة والاختصارات</h2>
    <div class="split"><p><b>السمة</b>: «النظام» يتبع جهازَك نهارًا وليلًا.</p>${themeSwitch(false)}</div>
    <hr>
    <div class="split"><p><b>الكثافة</b>: «مضغوط» يُظهر صفوفًا أكثر في الشاشة.</p>${densitySwitch(false)}</div>
    <hr>
    <div class="split"><p><b>اختصارات الحرف الواحد</b>: J وK وA وR وE وS و/ في المنشورات. أطفئها إن كانت تعترض قارئَ الشاشة أو الإدخالَ الصوتيّ.</p>${shortcutsSwitch()}</div>
  </div>
  ${tilePicker(d)}
  </div>
  <div data-sub id="limits">
  <p class="hint">مفتاح الإيقاف وسقوف اليوم. <b>تُطبَّق قبل أيّ نداء مدفوع</b>، في اللوحة والنشر المجدول معًا.</p>
  ${/* الترتيب بالخطورة لا بتاريخ الكتابة (D-126): ما يوقف النظام أوّلًا، ثمّ ما
       يحدّ إنفاقَه، ثمّ ما يطلقه بلا أمر، ثمّ ما يُخبر عنه، ثمّ الشكل. وتعليق هنا
       لا في HTML: ذاك يُشحَن مع كلّ فتحة (D-166) */ ''}
  <div class="card"><h2>الإيقاف المؤقت</h2>
    <div class="split">
      <p>${d.paused
        ? 'النظام موقوف: لا نداء مدفوع ولا مسح ولا نشر. والقيد في الشيفرة لا في هذه الصفحة.'
        : 'الإيقاف يمنع كلّ نداء مدفوع فورا — قبل أن يُلمس Drive أو Claude، وفي النشر المجدول معًا.'}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.paused ? 'استئناف عمل النظام؟' : 'إيقاف النظام كلّه؟ سيتوقّف المسح والتحليل والنشر حتّى تستأنفه.'}">
        <input type="hidden" name="key" value="paused">
        <input type="hidden" name="value" value="${d.paused ? 'false' : 'true'}">
        ${button({ label: d.paused ? 'استئناف العمل' : 'إيقاف مؤقت', variant: d.paused ? 'primary' : 'danger', type: 'submit' })}
      </form>
    </div>
  </div>

  <div class="card mt-3"><h2>الحدود اليوميّة</h2>
    <p class="hint"><b>سقف التحليل</b> يعدّ التحليلات وحدَها، و<b>سقف الإنفاق</b> يعدّ كلّ ما دُفع اليوم:
      التحليل والكتابة والخطّة والصور والنشر. وبلوغ أيّ منهما يوقف التوليد <b>ولا يوقف نشر ما اعتمدتَه</b>.</p>
    <form class="row" method="POST" action="/panel/settings" data-autosave>
      <input type="hidden" name="key" value="daily_analysis_cap">
      ${field({ id: 'c1', label: 'سقف التحليل (عدد)',
        control: `<input type="number" name="value" min="0" max="500" step="1" value="${d.analysisCap}">` })}
      ${button({ label: 'حفظ', variant: 'primary', type: 'submit' })}
      <span class="note self-center">المستهلَك اليوم: ${d.usedAnalyses}</span>
    </form>
    <hr>
    <form class="row" method="POST" action="/panel/settings" data-autosave>
      <input type="hidden" name="key" value="daily_spend_cap_usd">
      ${field({ id: 'c2', label: 'سقف الإنفاق (دولار)',
        control: `<input type="number" name="value" min="0" max="100" step="0.5" value="${d.spendCap}">` })}
      ${button({ label: 'حفظ', variant: 'primary', type: 'submit' })}
      <span class="note self-center">المستهلَك اليوم: ${money(d.usedSpend)}</span>
    </form>
    <hr>
    ${/* ‏والمقاطع بعددها لا بمالها (D-168): سعرُها لم يُقرأ فيُسجَّل صفرًا،
         وصفر لا يبلغ سقف الإنفاق أبدًا */ ''}
    <p class="hint"><b>والمقاطع بعددها</b>: سعرُها لم يُقرأ بعد، فيُسجَّل صفرًا لا يبلغ سقف الإنفاق.
      والمحاولة التي تسقط تُعدّ كالتي تنجح. <b>وصفر يُغلق التحريك.</b></p>
    <form class="row" method="POST" action="/panel/settings" data-autosave>
      <input type="hidden" name="key" value="daily_video_cap">
      ${field({ id: 'c4', label: 'سقف المقاطع (عدد)',
        control: `<input type="number" name="value" min="0"
          max="${SETTING_LIMITS.dailyVideoCap.max}" step="1" value="${d.videoCap}">` })}
      ${button({ label: 'حفظ', variant: 'primary', type: 'submit' })}
      <span class="note self-center">المستهلَك اليوم: ${d.usedClips}</span>
    </form>
  </div>

  <div class="card mt-3"><h2>سقف الترويج الأسبوعيّ</h2>
    <p class="hint"><b>ومنه وحده يأتي مبلغ التوصية.</b> رقم يؤلّفه صدى رقم بلا مصدر —
      والتوصية هنا تقترح <b>مالا</b> لا كتابة. <b>وصفر يعني لا توصية تُكتب أصلا.</b></p>
    <form class="row" method="POST" action="/panel/settings" data-autosave>
      <input type="hidden" name="key" value="weekly_promo_cap_usd">
      ${field({ id: 'c3', label: 'سقف الترويج (دولار في الأسبوع)',
        control: `<input type="number" name="value" min="0" max="500" step="1"
               value="${d.promoCap}">` })}
      ${button({ label: 'حفظ', variant: 'primary', type: 'submit' })}
    </form>
    <div class="sub mt-3"><b>ولا يُنفَق منه شيء آليّا</b>:
      لا عميل إعلانات في صدى ولا مفتاح يُطلَب. والتوصية صفّ ينتظر بتّك،
      وما تفعله بالمبلغ تفعله في لوحة المنصّة بيدك.</div>
  </div>

  <div class="card mt-3"><h2>الإدراج الآليّ</h2>
    <div class="split">
      <p>${d.autoEnqueue
        ? `مرفوع: المسح اليوميّ (السادسة صباحًا بتوقيت الرياض) يُدرج ما تغيّر في طابور الفهم، بما بقي من سقف اليوم لا بما وجد. وما يفيض يُترك لغد.`
        : `مطفأ: المسح يرصد ما تغيّر ولا يحلّل شيئا حتّى تضغط «حلّل الآن». ورفعُه يجعل الخطّ كاملا — مستند تعدّله يظهر محلَّلا في اللوحة صباحا.`}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.autoEnqueue
              ? 'إطفاء الإدراج الآليّ؟ لن يُحلَّل شيء إلا بأمرك.'
              : `رفع الإدراج الآليّ؟ سيبدأ إنفاق يوميّ بلا أمر منك، بحدّ ${d.analysisCap} تحليلا و ${money(d.spendCap)} في اليوم.`}">
        <input type="hidden" name="key" value="auto_enqueue">
        <input type="hidden" name="value" value="${d.autoEnqueue ? 'false' : 'true'}">
        ${button({ label: d.autoEnqueue ? 'إطفاء' : 'رفع الإدراج الآليّ', variant: d.autoEnqueue ? 'secondary' : 'primary', type: 'submit' })}
      </form>
    </div>
    <div class="sub mt-3">الحدّ يُقصّ <b>قبل</b> الإرسال لا بعده: حدّ يُطبَّق بعد الإنفاق ليس حدّا.</div>
  </div>

  <div class="card mt-3" id="auto-image"><h2>صورةٌ مع كلّ مسوّدة</h2>
    <div class="split">
      <p>${d.autoImage
        ? `مرفوع: كلُّ مسوّدةٍ تُكتب يُرسَم لها إنفوجرافيك من نصّها في الخلفيّة، <b>بحدّ ${d.imageCap} صور في اليوم</b>.
           وكلُّ صورةٍ في دفتر الكلفة، وتُرفض أو تُبدَّل من بطاقتها كما هي.`
        : `مطفأ: الصورةُ بزرّ «ولّد صورة» على البطاقة. ورفعُه يجعل كلَّ مسوّدةٍ تأتي بصورتها — <b>وكلُّ صورةٍ نداءٌ مدفوع</b>.`}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.autoImage
              ? 'إطفاء الصورة الآليّة؟ تُولَّد الصورة بزرّها وحده.'
              : `رفع الصورة الآليّة؟ سيُرسَم لكلّ مسوّدةٍ صورةٌ مدفوعة، بحدّ ${d.imageCap} في اليوم وسقف الإنفاق.`}">
        <input type="hidden" name="key" value="auto_image">
        <input type="hidden" name="value" value="${d.autoImage ? 'false' : 'true'}">
        ${button({ label: d.autoImage ? 'إطفاء' : 'رفع الصورة الآليّة', variant: d.autoImage ? 'secondary' : 'primary', type: 'submit' })}
      </form>
    </div>
    <form class="row mt-3" method="POST" action="/panel/settings" data-autosave>
      <input type="hidden" name="key" value="daily_image_cap">
      ${field({ id: 'c5', label: 'سقف الصور (عدد في اليوم)',
        control: `<input type="number" name="value" min="0"
          max="${SETTING_LIMITS.dailyImageCap.max}" step="1" value="${d.imageCap}">` })}
      ${button({ label: 'حفظ', variant: 'primary', type: 'submit' })}
      <span class="note self-center">وُلّد اليوم: ${d.usedImages}</span>
    </form>
  </div>

  ${/* ‏قناةُ التنبيهات للمالك وحدَه (D-318): عنوانُها سرٌّ حامل، وما خرج إليها يحمل أحداثَ أمان حسابه */ ''}
  ${ownerView ? alertChannel(d.alertWebhook, d.outbox) : `<div class="card mt-3"><h2>قناة التنبيهات</h2>
    <p class="hint m-0">يضبطها المالك وحده: عنوانُها يفتح القناةَ لمن يقرؤه، وما يخرج إليها يحمل أحداثَ أمان حسابه.</p></div>`}

  <div class="card mt-3"><h2>النصّ فوق الصورة</h2>
    <div class="split">
      <p>${d.imageOverlay
        ? `مرفوع: يُركَّب عنوان عربيّ من كلمتين فوق كلّ صورة مولَّدة، وفوقه كلمتان إنجليزيّتان.
           <b>والنصّ يُرسَم في متصفّح لا في نموذج التوليد</b> — فالوصل صحيح والحروف تُقرأ.`
        : `مطفأ: تخرج الصورة نظيفةً بلا عنوان. <b>وهذا ليس عطلا</b> — النصّ في المنشور نفسِه
           حيث يُقرأ ويُترجَم ويبحث عنه محرّك.`}</p>
      <form class="inline" method="POST" action="/panel/settings">
        <input type="hidden" name="key" value="image_overlay">
        <input type="hidden" name="value" value="${d.imageOverlay ? 'false' : 'true'}">
        ${button({ label: d.imageOverlay ? 'إطفاء' : 'رفع التركيب', variant: d.imageOverlay ? 'secondary' : 'primary', type: 'submit' })}
      </form>
    </div>
    ${/* ثلاثة فروع لا اثنان (D-163): كان «مضبوط» يُقال متى حضر المفتاح،
         والحساب الغائب يُخرج الصورة بلا عنوان في كلّ مرّة. ومن أصلحه بفرعين
         قال «المفتاح غير مضبوط» وهو مضبوط — كذب بدل كذب */
      d.slide.missing.length === 0
      ? '<div class="sub mt-3">مفتاح المتصفّح ومعرّف الحساب مضبوطان.'
        + ' وكلّ لقطة تُسجَّل في دفتر الكلفة كسائر النداءات المدفوعة.</div>'
      : `<div class="outcome warn"><span class="kv-k">ينقصك</span><span class="kv-v">
          ${d.slide.missing.includes('key')
            ? (d.slide.missing.includes('account') ? 'مفتاحُ المتصفّح ومعرّفُ الحساب' : 'مفتاحُ المتصفّح')
            : 'معرّفُ الحساب'}،
          <b>فلا يقع نداءٌ ولا كلفة</b>، وتخرج الصورة بلا عنوان. وخطواتُه في «ما عليك».</span></div>
        <details class="setup mt-2"><summary>للمطوّر</summary>
          <p class="hint">${d.slide.missing.includes('key')
            ? '<span class="mono">CF_BROWSER_TOKEN</span> في أسرار Worker، وصلاحيّتُه <span class="mono">Browser Rendering · Edit</span> لا صلاحيّة Workers AI. '
            : ''}${d.slide.missing.includes('account') ? '<span class="mono">CF_AI_ACCOUNT_ID</span> في متغيّرات Worker.' : ''}</p>
        </details>`}
  </div>
</div>
${ownerView ? `<div data-sub id="security-all">
<div id="security">
  <h2>الدخول والأجهزة</h2>
  <p class="hint">العامل الثاني، والأجهزة المفتوحة وإغلاقها. <b>والأذونات مشفّرة في القاعدة</b>، ومفتاحُها في أسرار Worker وحدها.</p>
  <div class="card"><h2>الأجهزة المفتوحة</h2>
    <p class="hint">كلّ جلسة حيّة الآن. والجلسة 3 أيّام على الأكثر، وتنتهي قبلها بعد 12 ساعة بلا استعمال.</p>
    <p class="hint">بريد المالك <span class="mono" dir="ltr">${escapeHtml(OWNER_EMAIL)}</span> — ثابت في الشيفرة، لا يُعدَّل ولا يُحذف من اللوحة.</p>
    ${d.sessions.length === 0
      ? emptyState({ title: 'لا جلسات محفوظة', html: 'قد يكون التخزين لا يدعم الجرد في هذه البيئة.' })
      : `<div class="scroll"><table>
          <thead><tr><th>الجهاز</th><th>فُتحت</th><th><span class="vh">الإجراء</span></th></tr></thead>
          <tbody>${sessionRows}</tbody></table></div>`}
    <hr>
    <div class="split">
      <p>إبطال الجلسات كلّها عدا جلستك هذه. ويُستعمل إن فقدت جهازا أو شككت في تسرّب.</p>
      <form class="inline" method="POST" action="/panel/sessions/revoke-all"
            data-confirm="إبطال كلّ الجلسات الأخرى؟ كلّ جهاز آخر سيُطلب منه الدخول من جديد.">
        ${button({ label: 'أخرِج الأجهزة الأخرى', variant: 'danger', type: 'submit' })}</form>
    </div>
  </div>

  <div class="card mt-3" id="factors"><h2>العامل الثاني</h2>
    <p class="hint">${d.factors.enforced
      ? 'إلزاميّ للمالك والمدير والناشر: رمز البريد وحدَه لا يفتح اللوحة — يليه ما يثبت أنّك أنت. وإضافةُ عاملٍ أو إزالتُه تسأل عنه ثانيةً.'
      : '<b>لا عامل ثانيًا مسجَّل.</b> سجّل مفتاح مرور أو اضبط رمز تطبيق — وبلا واحدٍ منهما لا يفتح الدخولُ التالي إلّا صفحةَ التسجيل.'}</p>

    <h3 class="sec">مفاتيح المرور</h3>
    <p class="hint">مقاومة للتصيّد بالبناء: المفتاح موقَّع على
      <span class="mono">${escapeHtml(d.rpId)}</span> — فصفحة مزوّرة على عنوان يشبهه لا تحصل
      على توقيع مهما أتقنت الشكل. <b>ومفتاح تسجّله هنا لا يعمل على البيئة الأخرى</b>؛ لكلّ مفتاحها.</p>
    ${d.factors.passkeys.length === 0
      ? emptyState({ title: 'لا مفاتيح بعد' })
      : `<div class="scroll"><table>
          <thead><tr><th>المفتاح</th><th>سُجّل</th><th>آخر استعمال</th><th><span class="vh">الإجراء</span></th></tr></thead>
          <tbody>${passkeyRows}</tbody></table></div>`}
    <div class="row mt-3">
      <div class="field"><label for="pk-label">اسم الجهاز</label>
        <input id="pk-label" placeholder="هاتفي · مفتاح YubiKey" maxlength="60"></div>
      <button class="btn ${d.factors.passkeys.length === 0 ? 'btn-primary' : 'btn-secondary'}" id="pk-add" type="button">سجّل مفتاحا</button>
    </div>
    <div class="note" id="pk-msg" role="status" aria-live="polite"></div>

    <hr>
    <h3 class="sec">رمز التطبيق (TOTP)</h3>
    <p class="hint">${d.factors.totpConfirmed
      ? 'مضبوط ومؤكَّد. وهو <b>دون مفتاح المرور</b> درجةً: رمز يُقرأ من شاشة يمكن أن يُملى على صفحة مزوّرة. فموضعُه طريق رجوع لا باب رئيس.'
      : 'غير مضبوط. اضبطه طريق رجوع إن فقدت مفتاح المرور.'}</p>
    <div class="row">
      ${d.factors.totpConfirmed
        ? '<button class="btn btn-danger" id="totp-remove" type="button" data-confirm="أتُزيل رمزَ التطبيق؟ يبقى الدخولُ بمفتاح المرور ورموز الاستعادة وحدها." data-confirm-ok="أزله">أزل رمز التطبيق</button>'
        : '<button class="btn btn-secondary" id="totp-start" type="button">اضبط رمز التطبيق</button>'}
    </div>
    <div id="totp-box" hidden>
      <div class="field mt-3"><label for="totp-secret">السرّ — انسخه إلى تطبيق المصادقة</label>
        <input id="totp-secret" readonly dir="ltr"></div>
      <form class="row" method="POST" action="/panel/security/totp/confirm" id="totp-confirm">
        <div class="field"><label for="totp-code">الرمز الظاهر الآن</label>
          <input id="totp-code" name="code" dir="ltr" inputmode="numeric" maxlength="8" autocomplete="off"></div>
        ${button({ label: 'أكّد', variant: 'primary', type: 'submit' })}
      </form>
    </div>
    <div class="note" id="totp-msg" role="status" aria-live="polite"></div>

    <hr>
    <h3 class="sec">رموز الاسترداد</h3>
    <p class="hint">${d.factors.recoveryLeft > 0
      ? `بقي <b>${d.factors.recoveryLeft}</b> رمزا غير مستهلَك. تُعرض مرّةً واحدةً حين تُولَّد،
         ولا تُقرأ من القاعدة بعدها — لا لنا ولا لمن سرق نسخةً منها.`
      : 'لا رموز استرداد. وبلا طريق رجوع يصير فقد الجهاز قفلا نهائيّا.'}</p>
    ${(d.factors.recoveryStale ?? 0) > 0 ? noticeText('warn', recoveryStaleNote(d.factors.recoveryLeft, d.factors.recoveryStale ?? 0)) : ''}
    <div class="row">
      <button class="btn ${d.factors.recoveryLeft === 0 && d.factors.passkeys.length > 0 ? 'btn-primary' : 'btn-secondary'}" id="rc-issue" type="button" data-renew-ask="${escapeHtml(RC_RENEW.ask)}" data-renew-ok="${escapeHtml(RC_RENEW.ok)}"${d.factors.recoveryLeft > 0
        // ‏والسؤالُ حين يُبطَل شيءٌ وحده (D-323): أوّلُ مجموعةٍ لا تُبطل شيئًا — وما يُولَّد في الصفحة يُضيف السؤالَ سكربتُها
        ? ' data-confirm="' + escapeHtml(RC_RENEW.ask) + '" data-confirm-ok="' + escapeHtml(RC_RENEW.ok) + '"' : ''}>
        ${d.factors.recoveryLeft > 0 ? RC_RENEW.ok : 'ولّد رموز استرداد'}</button>
    </div>
    <div id="rc-box" hidden><div class="codes" id="rc-list"></div>
      <div class="note"><b>انسخها الآن.</b> لن تُعرض ثانية. والتوليد الجديد يُبطل القديمة كلَّها.</div></div>
    <div class="note" id="rc-msg" role="status" aria-live="polite"></div>
  </div>

  <div class="card mt-3"><h2>إبطال كلّ الجلسات</h2>
    <p class="hint m-0"><b>إن شككت في تسرّب فأغلق كلّ الجلسات الآن</b> من «الأجهزة المفتوحة» أعلاه،
      وادخل ثانيةً بالبريد أو بمفتاح المرور. ولا حاجة إلى انتظار انتهاء الجلسات.</p>
    <details class="setup mt-2"><summary>للمطوّر</summary>
      <p class="hint">وتدويرُ <span class="mono">ADMIN_TOKEN</span> يُبطل كلَّ الجلسات على كلّ جهاز معًا، لأنّ كلّ جلسةٍ مربوطةٌ ببصمته:
        <span class="mono">wrangler secret put ADMIN_TOKEN</span>.</p>
    </details>
  </div>

</div>
<div id="activity" class="mt-5">
  <div class="card"><h2>سجلّ النشاط</h2>
    <p class="hint">آخر ${d.audit.length} فعل مسجَّل. السجلّ يُكتب ولا يُعدَّل، ولا يُذكر فيه مفتاح قطّ.</p>
    ${d.audit.length === 0
      ? emptyState({ title: 'لا شيء بعد', html: 'أوّل فعل في اللوحة يظهر هنا.' })
      : `<div class="scroll"><table>
          <thead><tr><th>متى</th><th>الفعل</th><th>على ماذا</th><th>العنوان</th></tr></thead>
          <tbody>${auditRows}</tbody></table></div>`}
  </div>
</div>
</div>
<div data-sub id="advanced">
  <p class="hint">ما يُفتح نادرًا: حالُ المهامّ الدوريّة، وخدماتُ الكتابة والصور، والمنظّمات، وما يحتاجه المطوّر.</p>
<div id="system">
  <h2>النظام</h2>
  <p class="hint">هل يدور صدى في مواعيده. <b>والإيقاف المؤقّت في «الإنفاق والحدود»</b>.</p>
  ${machineCard(d.pulses, d.now)}
  </div>
<div id="providers" class="mt-5">
  <h2>خدمات الكتابة والصور</h2>
  <p class="hint">أيّ نموذج ينفّذ كلّ مهمّة، وكم أنفق. <b>وأسرار Worker تغلب الخزانة دائما</b>، ولا يُعرض مفتاح كاملا هنا.</p>
  ${providerStrip}

  <div class="card"><div class="card-head"><h2>توجيه المهامّ</h2><div class="grow"></div>
      <span class="st idle">القرار</span></div>
    <p class="hint">أيّ مزوّد ونموذج ينفّذ كلّ مهمّة. <b>والنموذج يُختار من درج يُملأ من عندهم</b> —
      اضغط «حدّث» بجانبه.</p>
    <div class="scroll"><table><thead><tr><th>المهمّة</th><th>المزوّد والنموذج</th><th>الحال</th></tr></thead>
      <tbody>${routingRows}</tbody></table></div>
    <div class="sub mt-3">والافتراض في الشيفرة يعمل حتّى تختار —
      فنظام بجدول فارغ يعمل ولا ينتظر أن يُملأ.</div>
  </div>

  <div class="card mt-3">
    <div class="card-head"><h2>المفاتيح المضبوطة</h2><div class="grow"></div>
      <span class="st idle">${d.providers.length} مزوّدا</span></div>
    <p class="hint"><b>أسرار Worker تغلب الخزانة دائما</b> — فمفتاحك الأساسيّ يبقى حيث لا تقرؤه هذه
      الشيفرة ولا تعيده Cloudflare، والخزانة للتجريب والتبديل السريع.
      ولا يُعرض مفتاح كاملا هنا ولا يُخزَّن مقروءا: أوّلُه وآخرُه فقط.</p>
    ${providerRows}
  </div>

  <div class="mt-3">${addCard}</div>
</div>
<div id="orgs" class="mt-5">
  <div class="split"><h2>المنظّمات</h2><div class="row gap-2">${button({ label: 'المحفظة', size: 'sm', href: '/panel/portfolio' })}${button({ label: 'الفريقُ والصلاحيّات', size: 'sm', href: '/panel/team' })}</div></div>
  ${orgsPane(d)}
</div>
<details class="setup mt-5" id="dev"><summary>للمطوّر</summary>${devPane(d)}</details>
</div>
` : ''}
</section>`
}

/**
 * ألواحُ الطلب وحدَها (D-280). كانت الصفحةُ تُرسَم بألواحها الستّة ثمّ يُقصّ منها ما لم يُطلَب (`keepPanes`،
 * D-211) — **فتُحمَّل بياناتُ الستّة لرسم واحد**. فصار كلُّ لوحٍ دالّةً بنوعها، ولا يُنادى إلّا ما يُرسَم.
 */
function panesOf(view: PaneView): string {
  switch (view.only) {
    case null:
      // ‏وسكربتُ التبديل يطلب «المنشورات» وحدَها (D-232): البطاقةُ والأعدادُ والإشعارُ هناك، والرئيسيّةُ لا تُرسَم له
      return view.swapPosts === true
        ? postsPane(view.data)
        : `${overviewPane(view.data)}\n\n${postsPane(view.data)}`
    case 'overview': return overviewPane(view.data)
    case 'posts': return postsPane(view.data)
    case 'library': return libraryPane(view.data)
    case 'accounts': return accountsPane(view.data)
    case 'settings': return settingsPane(view.data)
    case 'results': return pivotPane(view.data.pivot)
  }
}

export function panelPage(view: PaneView): string {
  const d = view.data
  const only = view.only
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
  // ‏**ومن الحكم الواحد** (D-205): كان الشريطُ يقرأ استعلامَه بعتبته وكلماته («إذنُ الوصول»، «إذنُ التجديد»)،
  // ‏فيقول «يبقى 6 أيّام» عن منصّةٍ تقول بطاقتُها «متّصلة». فصار سطرًا واحدًا بحال كلّ منصّةٍ تحتاج يدَك، وزرًّا واحدًا
  const needy = d.channels
    .map((v) => ({ v, h: channelHealth(v, d.now) }))
    .filter(({ h }) => h.kind === 'broken' || h.kind === 'expiring')
  // ‏ولا شريطَ في «الحسابات» نفسِها (D-311): «افتح الحسابات» وأنت فيها تكرارٌ، وبطاقاتُها تقول الحالَ بزرّها
  const expiring = needy.length === 0 || only === 'accounts' ? '' : notice({
    tone: needy.some(({ h }) => h.kind === 'broken') ? 'bad' : 'warn', alert: true, g: '!',
    // ‏**والشريطُ يحيل ولا يعيد الحال** (D-235): «منقطعة» تقولها البلاطةُ والبطاقةُ مرّةً، والشريطُ يسمّي ويدلّ
    html: `${needy.slice(0, 3)
      .map(({ v }) => `<b><bdi>${escapeHtml(v.spec.label)}</bdi></b>`)
      .join(' و')}${needy.length > 3 ? ` <b>و${needy.length - 3} غيرُها</b>` : ''} ${needy.length === 1 ? 'تحتاج' : 'تحتاج كلّ منها'} يدَك. <a class="tap" href="#channels">افتح الحسابات</a>` })

  // ‏الإشعارُ مكوّنُه (D-189): «تراجَع» فعلُه في طرفه، والسكربتُ يُطفيه ويقرّر أيذهب وحدَه
  const flash = `${expiring}${toastRegion(
    d.flash === null
      ? ''
      : notice({
          tone: d.flash.kind,
          html: pathArrows(escapeHtml(d.flash.text)),
          ...(d.flash.undo === undefined ? {} : {
            action: `<form class="inline" method="POST" action="${escapeHtml(d.flash.undo.action)}"
                        data-busy="جار…" data-swap>
                    <input type="hidden" name="id" value="${escapeHtml(d.flash.undo.id)}">${
                      Object.entries(d.flash.undo.fields ?? {}).map(([k, v]) =>
                        html`<input type="hidden" name="${k}" value="${v}">`.value).join('')}
                    ${button({ label: d.flash.undo.label, size: 'sm', type: 'submit' })}
                  </form>`,
          }),
        }),
  )}`

  /*
   * ‏**والحبّةُ من النبض لا من مفتاح الإيقاف وحده**، ورابطٌ إلى بطاقة الآلة: كانت
   * ‏«يعمل» خضراءَ والإرسالُ متوقّفٌ منذ ثلاثة أيّام، والجوابُ على بُعد ثلاث شاشات
   */
  const pill = systemPill(d.paused, d.pulses)
  const state = `<a class="pill ${pill.tone}" href="${panelHref('machine')}"
    aria-label="${escapeHtml(`حال النظام: ${pill.text} — افتح «هل الآلة تعمل؟»`)}"><i class="led"></i>${escapeHtml(pill.text)}</a>`

  /*
   * **الرافدةُ تُرسَم من جدول الأقسام** (D-105)، وفي `rail.ts` منذ صارت لكلّ
   * صفحة (D-178). وهنا ما تملكه اللوحةُ وحدَها: الأعدادُ وأزرارُ المنصّات.
   */
  /*
   * ‏**عددان لا ستّة** (D-216): كانت الرافدةُ تقول «الإعدادات 4» و«ما عليك 6» و«المكتبة 1» و«المزيد 7» ولا تقول ماذا
   * ‏تعدّ، فكانت «ما ينتظرك» تُقال في خمسة أماكن. فبقي ما يوجب يدَ المالك اليوم وحدَه: المسوّداتُ التي تنتظر قرارَه
   * ‏والفاشلةُ (كما في «ينتظر قرارك»)، والحساباتُ المنقطعة. والباقي يُقال في صفحته.
   */
  // ‏المنظّمةُ النشطة ومبدّلُها (‏scope.ts)، والانتقالُ يعود إلى هذه الصفحة نفسِها
  const scope = { orgs: d.orgs ?? [], active: d.org ?? OWNER_ORG, next: only === null ? '/panel' : panelHref(only) }
  const counts: Readonly<Record<string, number>> = {
    posts: waitingDrafts + d.drafts.filter((x) => x.status === 'failed').length,
    accounts: d.channels.filter((c) => channelHealth(c, d.now).kind === 'broken').length,
  }

  const body = `
<a class="skip" href="#main">تخطّي إلى المحتوى</a>
<div class="app">

${/* ‏وفي صفحة لوح مستقلّ (D-211) روابط الرئيسيّة والمنشورات مسارات إلى «/panel»، ولوحُها معلَّم */''}
${railHtml({ inPanel: only === null, counts, env: d.env, scope, ...(only === null ? {} : { active: only }) })}

<div class="main">
<header class="topbar">
  ${/*
    * **والعلامةُ حاضرةٌ في كلّ عرض** (D-123). رأسُ الرافدة يختفي في
    * الجوّال (D-107) فلم يبقَ في الشاشة ما يقول «هذه صدى» — ثلاثون
    * بكسلا في شريطٍ ارتفاعُه ستّون لا تُشترى بشيء. وفي المكتب تُخفى:
    * علامتان في شاشةٍ واحدة تكرار.
    */''}
  <div class="glyph tb" aria-hidden="true">${GLYPH_SVG}</div>
  <div class="ttl"><h1 id="pane-title" aria-live="polite">${escapeHtml(sectionLabel(only === null ? 'overview' : only))}</h1>
    ${d.env === 'production' ? '' : '<div class="crumb">تجريبيّ</div>'}</div>
  <div class="grow"></div>
  ${topNew()}
  ${bell(d.unread ?? 0)}
  ${commandTrigger()}
  ${state}
  ${accountMenu({ logout: true, scope })}
</header>

<main id="main" class="content">
${flash}
${panesOf(view)}

${fabNew()}
${/* ‏والذيل اسم وساعة (D-215): «كلّ زرّ هنا يحرسه قيد مُختبَر في الخادم» جملة للمطوّر لا للمالك */''}
<footer><span>صدى</span>
  <span class="mono">${escapeHtml(stamp(d.now, null))}</span></footer>
</main>
</div>
</div>`

  // ‏و«/panel» الرئيسيّةُ والمنشورات، وكلُّ لوحٍ آخر في مساره (D-211: ‏166KB كانت الصفحة، والخطّةُ ‏90)
  return shell(
    only === null ? 'صدى — لوحة التحكّم' : `صدى — ${sectionLabel(only)}`, injectCsrf(body, d.csrf), d.nonce, '',
    { commands: buildCommands({ onPanel: only === null, drafts: d.drafts }), panelScript: true },
  )
}
