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
import type { SlideGate } from '../lib/image/gate'
import type { MediaReady } from '../lib/media/readiness'
import { planSection } from './ui/sections/plan'
import type { StoredPlan } from '../lib/plan/job'
import type { DraftRow } from '../lib/draft/store'
import { providersSection } from './ui/sections/providers'
import { securitySection } from './ui/sections/security'
import { densitySwitch, escapeHtml, GLYPH_SVG, injectCsrf, shell, themeSwitch } from './ui/shell'
import { B64URL_SCRIPT, PASSKEY_TEXT_SCRIPT } from './ui/scripts'
import { alertChannel, bar, firstDay, machineCard, pageHead, pct, type OutboxRow, status as chip } from './ui/parts'
import type { Pulse } from '../lib/ops/heartbeat'
import { areaChart, barChart } from './ui/chart'
import { ICON } from './ui/icons'
import type { TodayItem } from '../lib/today'
import { driveFileUrl } from '../lib/drive/sync'
import { LOGOS } from './ui/logos'

export { escapeHtml, injectCsrf, shell }




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
const LOGIN_SCRIPT = `${B64URL_SCRIPT}${PASSKEY_TEXT_SCRIPT}
(function(){
  var b64u=sadaB64.enc, fromB64u=sadaB64.dec;
  var btn=document.getElementById('pk-login');
  var note=document.getElementById('pk-note');
  if(!btn)return;
  var label=btn.textContent;
  if(!window.PublicKeyCredential||!navigator.credentials){btn.disabled=true;
    if(note)note.textContent='متصفّحك لا يدعم مفاتيح المرور — ادخل بكلمة الإدارة.'; return;}
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
        challenge:fromB64u(d.challenge), rpId:d.rpId, userVerification:'preferred',
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
      if(r.ok){location.href='/panel'; return;}
      return sadaPk.fail(r);
    }).catch(function(err){reset(sadaPk.why(err));});
  });
})();
`

export function loginPage(state: LoginState = {}, nonce = ''): string {
  const passkey =
    state.passkeys !== true || state.blocked === true
      ? ''
      : `<button class="p" id="pk-login" type="button">الدخول بمفتاح المرور</button>
         <div class="n" id="pk-note" role="status" aria-live="polite"></div>
         <div class="or">أو بكلمة الإدارة</div>`

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
      <p class="lede">${state.blocked === true
        ? 'الدخولُ موقوفٌ مؤقتًا لحماية اللوحة'
        : state.passkeys === true
          ? 'ادخل بمفتاح المرور، أو بكلمة الإدارة'
          : 'أدخل كلمةَ الإدارة للمتابعة'}</p>
      ${note}
      <div class="card">
        ${passkey}
        <form method="POST" action="/panel/login">
          <div class="field"><label for="t">كلمةُ الإدارة <span class="mono">ADMIN_TOKEN</span></label>
            <input id="t" type="password" name="token" autocomplete="current-password"
                   required${passkey === '' ? ' autofocus' : ''}${disabled}></div>
          <button class="p" type="submit"${disabled}>دخول</button>
        </form>
      </div>
      ${state.blocked === true
        ? '<p class="lede"><a href="/panel">حدّث الصفحة</a> بعد ربع ساعة لتعيد المحاولة.</p>'
        : ''}
      <footer style="border:0;justify-content:center">الجلسة 8 ساعات</footer>
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
  /** البيئةُ كما يعرفها Worker — تُطبَع في العلامة (D-151) */
  readonly env: 'staging' | 'production'
  readonly paused: boolean
  readonly autoEnqueue: boolean
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
  /** «ما وقع اليوم» — مرويٌّ ممّا في اليد (D-127). */
  readonly today: { readonly items: readonly TodayItem[]; readonly more: number }
  /** نبضُ الدورات — من `heartbeats` (D-158). */
  readonly pulses: readonly Pulse[]
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
  /** بصمةُ الجلسة لا سرُّها (D-150) — ما يُطبَع في النموذج لا يفتح بابا */
  readonly handle: string
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
  if (worth === null) return chip('idle', '○', 'لم يُحلَّل')
  const p = Math.round(worth * 100)
  const shade = worth >= 0.66 ? 'var(--brand)' : worth >= 0.33 ? 'var(--brand-soft)' : 'var(--ink-3)'
  return `<div class="worth" title="درجة الاستحقاق ${worth.toFixed(2)} من 1">
    <div class="track"><span class="fill" style="width:${p}%;background:${shade}"></span></div>
    <span class="val">${worth.toFixed(2)}</span></div>`
}

function sourceRow(s: PanelSource, now: Date): string {
  const pending = !s.analyzed || s.stale
  const status = s.stale
    ? chip('warn', '▲', 'تغيّر بعد التحليل')
    : s.analyzed
      ? chip('ok', '●', 'محلَّل')
      : chip('idle', '○', 'ينتظر')

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
    <td data-label="">${acts === '' ? '<span class="mono">—</span>' : `<div class="row acts">${acts}</div>`}</td>
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
  return `<div class="grid tiles ${cols}">${cards.join('')}</div>`
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

/**
 * «ما وقع اليوم» (D-127) — **الروايةُ تحت «ما ينتظرك»**: الأولى ما عليك،
 * والثانيةُ ما وقع منذ منتصف الليل UTC. ولا استعلامَ لها: تُروى من سجلّ
 * التدقيق والمسوّدات وحقائق اللوح المحوريّ التي قُرئت أصلًا.
 */
function todayList(d: PanelData): string {
  const rows = d.today.items
    .map((i) => `<li><span class="dot ${i.kind}"></span>
      <span>${escapeHtml(i.text)}${i.at === null ? '' : ` <span class="ago">${escapeHtml(relativeTime(i.at, d.now))}</span>`}</span>
      ${i.go === undefined ? '' : `<a class="btn g sm" href="${escapeHtml(i.go)}">${escapeHtml(i.goLabel ?? 'افتح')}</a>`}</li>`)
    .join('')
  const more = d.today.more === 0 ? '' : `<p class="hint">و${d.today.more} غيرُها اليوم — في سجلّ الأمان.</p>`
  return `<div class="card"><h2>ما وقع اليوم</h2>
      <p class="hint">يُروى ممّا قُرئ — ولا يُفتَح له استعلام</p>
      ${rows === ''
        ? '<div class="empty"><b>لم يقع شيءٌ بعد</b><p>منذ منتصف الليل UTC.</p></div>'
        : `<ul class="todo">${rows}</ul>${more}`}</div>`
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
        const what = e.kind === 'refresh' ? 'إذنُ التجديد' : 'إذنُ الوصول'
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
      text: 'لا عاملَ ثانٍ: كلمةُ الإدارة وحدَها تفتح اللوحة.',
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
    <div class="brand"><b>صدى</b><span>SADA · ${d.env === 'production' ? 'PRODUCTION' : 'STAGING'}</span></div>
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
  <div class="ttl"><h1 id="pane-title" aria-live="polite">نظرة عامّة</h1>
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
  <div class="ov" style="margin-top:var(--s-3)">
    <div class="stack">
      <div class="card"><h2>ما ينتظرك</h2>
        <p class="hint">مولَّدٌ من حال النظام الآن — لا قائمةٌ ثابتة</p>
        ${todo === ''
          ? '<div class="empty"><b>لا شيء ينتظر</b><p>كلّ ما بُني مضبوط.</p></div>'
          : `<ul class="todo">${todo}</ul>`}
        <div class="row" style="margin-top:var(--s-3)">${scanBtn}
          <a class="btn g sm" href="#sources">مراجعة المصادر</a></div></div>
      ${todayList(d)}
      ${machineCard(d.pulses, d.now)}
    </div>
    <div class="stack">
      <div class="card"><h2>الإنفاق — 14 يوما</h2>
        <p class="hint">كلّ المزوّدين، بالدولار</p>${areaChart(d.series)}
</div>
      <div class="card">
        <div class="card-head"><h2>أين يذهب المال</h2><div class="grow"></div>
          <span class="st idle">30 يوما</span></div>
        <p class="hint">إنفاقُ كلّ مزوّدٍ على حدة. <b>والسؤالُ «أيُّها أكبر» لا
          «كيف تغيّر»</b> — فأعمدةٌ لا خطّ: ليس بين مزوّدين زمنٌ يمرّ.</p>
        ${barChart(d.providers.map((p) => ({ label: p.label, value: p.spend })), { unit: 'money' })}
      </div>
    </div>
  </div>
</section>

${pivotPane(d.pivot)}

<section data-pane="sources" hidden>
  ${pageHead('Google Drive', 'المصادر', 'ما رآه صدى في مجلّدك، وما استحقّ منه نشرا. <b>والتحليلُ نداءٌ مدفوع</b> — فلا يقع تلقائيّا على كلّ ملفّ.')}
  ${/*
    * **ولا يُقال العنوانُ مرّتين** (D-122). كانت الترويسةُ هنا
    * «المصادر والتحليل» — **وهي عنوانُ اللوح نفسُه فوقها**. فيقول
    * الجدولُ ما فيه هو، لا ما في الشاشة كلِّها.
    */''}
  <div class="card"><div class="card-head"><h2>ملفّاتُ مجلّدك</h2><div class="grow"></div>${scanBtn}</div>
    ${sourcesTable}</div>
</section>

<section data-pane="providers" hidden>
  ${pageHead('الذكاء', 'المزوّدون', 'أيُّ نموذجٍ ينفّذ كلَّ مهمّة، وكم أنفق. <b>وأسرارُ Worker تغلب الخزانة دائما</b>، ولا يُعرض مفتاحٌ كاملا هنا.')}
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
    <div class="card-head"><h2>المفاتيحُ المضبوطة</h2><div class="grow"></div>
      <span class="st idle">${d.providers.length} مزوّدا</span></div>
    <p class="hint"><b>أسرارُ Worker تغلب الخزانة دائما</b> — فمفتاحك الأساسيّ يبقى حيث لا تقرؤه هذه
      الشيفرة ولا تعيده Cloudflare، والخزانة للتجريب والتبديل السريع.
      ولا يُعرض مفتاحٌ كاملا هنا ولا يُخزَّن مقروءا: أوّلُه وآخرُه فقط.</p>
    ${providerRows}
  </div>

  <div style="margin-top:var(--s-3)">${addCard}</div>
</section>

<section data-pane="channels" hidden>
  ${pageHead('النشر', 'القنوات', 'ما يُنشَر عليه، وما ينتظر ضبطا، وما لم يُبنَ له سائقٌ بعد. <b>ولكلّ قناةٍ شاشتُها</b> — فيها ما نُشر عليها وما تستطيعه.')}
  ${channelsSection(d.channels, d.now, d.apps, d.baseUrl)}
</section>

<section data-pane="posts" hidden>
  ${pageHead('التحرير', 'المنشورات', 'ما اقترحه صدى للأسبوع، وما كتبه ينتظر قرارك. <b>ولا يمرّ نصٌّ إلى قناةٍ قبل أن تعتمده أو تعدّله.</b>')}
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
    mediaReady: d.mediaReady,
  })}
  <div style="margin-top:var(--s-3)">${planSection({
    plan: d.plan,
    names: Object.fromEntries(d.sources.map((s) => [s.id, s.name])),
    ready: d.planReady,
    analyzed: d.sources.filter((s) => s.analyzed).length,
    now: d.now,
    // من الخمسين صفًّا المحمَّلة أصلًا للأمان — لا استعلامَ جديد (D-157)
    lastAttempt: d.audit.find((a) => a.action === 'plan.generate') ?? null,
  })}</div>
</section>

<section data-pane="settings" hidden>
  ${pageHead('الضبط', 'الحدود', 'مفتاحُ الإيقاف وسقفا اليوم. <b>والقيدُ في الشيفرة لا في هذه الصفحة</b> — يقع قبل النداء لا بعده.')}
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
    <p class="hint">سقفان لا واحد: مستندٌ ضخم قد يكلّف أكثر من 10 صغار، وطوفانُ ملفّاتٍ صغيرة يستنزف الحصّة.</p>
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
      لا عميلَ إعلاناتٍ في صدى ولا مفتاحَ يُطلَب. والتوصيةُ صفٌّ ينتظر بتّك،
      وما تفعله بالمبلغ تفعله في لوحة المنصّة بيدك.</div>
  </div>

  <div class="card" style="margin-top:var(--s-3)"><h2>الإدراج الآليّ</h2>
    <div class="split">
      <p>${d.autoEnqueue
        ? `مرفوع: المسح اليوميّ (3 فجرا UTC) يُدرج ما تغيّر في طابور الفهم، بما بقي من سقف اليوم لا بما وجد. وما يفيض يُترك لغد.`
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
    ${/* ثلاثةُ فروعٍ لا اثنان (D-163): كان «مضبوط» يُقال متى حضر المفتاح،
         والحسابُ الغائبُ يُخرج الصورةَ بلا عنوانٍ في كلّ مرّة. ومن أصلحه بفرعين
         قال «المفتاحُ غيرُ مضبوط» وهو مضبوط — كذبٌ بدل كذب */
      d.slide.missing.length === 0
      ? '<div class="sub" style="margin-top:var(--s-3)">مفتاحُ المتصفّح ومعرّفُ الحساب مضبوطان.'
        + ' وكلُّ لقطةٍ تُسجَّل في دفتر الكلفة كسائر النداءات المدفوعة.</div>'
      : d.slide.missing.includes('key')
        ? `<div class="outcome warn"><span class="k">ينقصك</span><span class="v">
          <span class="mono">CF_BROWSER_TOKEN</span> غيرُ مضبوطٍ في أسرار Worker${
            d.slide.missing.includes('account')
              ? '، ومعه <span class="mono">CF_AI_ACCOUNT_ID</span> في متغيّراته'
              : ''}،
          <b>فلا يقع نداءٌ ولا كلفة</b> — وتخرج الصورةُ بلا عنوانٍ مهما كان هذا المفتاح مرفوعا.
          وصلاحيّتُه <span class="mono">Browser Rendering · Edit</span>،
          <b>وهي غيرُ صلاحيّة Workers AI</b>. وتفصيلُه في «ما عليك».</span></div>`
        : `<div class="outcome warn"><span class="k">ينقصك</span><span class="v">
          مفتاحُ المتصفّح في أسرار Worker، و<span class="mono">CF_AI_ACCOUNT_ID</span> غيرُ مضبوطٍ
          في متغيّراته — <b>واللقطةُ تُنادى على حسابٍ بعينه</b>، فلا يقع نداءٌ ولا كلفة،
          وتخرج الصورةُ بلا عنوان. وتفصيلُه في «ما عليك».</span></div>`}
  </div>
</section>

<section data-pane="security" hidden>
  ${pageHead('الدخول', 'الأمان', 'العاملُ الثاني، والجلساتُ المفتوحة، وسجلُّ ما وقع. <b>والرموزُ مشفّرةٌ في القاعدة</b>، ومفتاحُها في أسرار Worker وحدها.')}
  <div class="card"><h2>الأجهزة المفتوحة</h2>
    <p class="hint">كلّ جلسةٍ حيّة الآن. والجلسة 8 ساعات ثمّ تنتهي وحدها.</p>
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
      : '<b>غير مفعَّل.</b> كلمةُ الإدارة وحدَها تفتح كلّ شيء. سجّل مفتاح مرورٍ أو اضبط رمز تطبيق.'}</p>

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

  <div class="card" style="margin-top:var(--s-3)"><h2>كلمةُ الإدارة</h2>
    <p class="hint" style="margin:0"><b>تدويرُ <span class="mono">ADMIN_TOKEN</span> يُبطل كلّ الجلسات فورا.</b>
      فالجلسة مربوطةٌ ببصمة كلمة الإدارة التي فتحتها، وتُفحص في كلّ طلب — وجلسةُ مفتاحِ المرور كذلك.
      فإن شككتَ في تسرّبٍ فبدّل كلمةَ الإدارة
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
    'صدى — لوحة التحكّم', injectCsrf(body, d.csrf), d.nonce, '',
    { commands: buildCommands({ onPanel: true, drafts: d.drafts }), panelScript: true },
  )
}
