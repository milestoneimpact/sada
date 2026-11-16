/**
 * عناصرُ مشتركة بين الأقسام.
 *
 * وُضعت هنا لا في `panelView` لأنّ قسم المزوّدين يستعملها أيضا —
 * واستيرادُها منه يصنع دائرةً بين ملفّين. والدائرةُ تعمل في الأنواع
 * وتنكسر في التشغيل حين يتبدّل ترتيبُ الحزم.
 */
import { escapeHtml } from './escape'
import { html, raw, type Html, type HtmlValue } from './html'
import { glyph, ICON } from './icons'
import { statusBadge, type Tone } from './components/badge'
import { card } from './components/card'
import type { Job, Pulse } from '../../lib/ops/heartbeat'
import type { Sli, SliKey } from '../../lib/ops/slo'
import type { BackupRow } from '../../lib/ops/backup'
import { relativeTime } from '../../lib/format'
import type { RungState } from '../../lib/platform/readiness'
import { counted, duration, NOUNS } from '../../lib/format'

/**
 * الرمزُ وحدَه بلا شارة (D-167) — **وبيتُه اليومَ `icons.ts`** بجانب جدوله (D-189)، ويُعاد
 * تصديرُه من هنا لمن اعتاد استيرادَه. وشارةُ الحال صارت مكوّنًا: `statusBadge()` في
 * `components/badge.ts` — كانت `status()` هنا، وكانت الحبّةُ ورمزُها (بصنف «g») تُكتب يدًا ‏٦٥
 * مرّةً في عشرة ملفّات قبلها (D-154).
 */
export { glyph } from './icons'

/**
 * اسمُ ملفٍّ في جملةٍ عربيّة — **معزولًا وبلا امتداده** (خطّة التصميم 4.4/8 · D-185).
 *
 * «تقرير الأثر السنويّ 2026.docx» في سياقٍ عربيّ تُرسَم «docx.2026 تقرير الأثر السنويّ»:
 * النقطةُ بين رقمٍ وحرفٍ لاتينيّ تأخذ اتّجاهَ السطر فتنقلب الخانتان. والعزلُ وحدَه لا
 * يصلحه (الاسمُ عربيُّ الأوّل فيبقى سطرُه عربيًّا)، **والامتدادُ لا يقول للمالك شيئا** —
 * فيُحذف من المعروض ويبقى الاسمُ كاملًا في `title`.
 */
export function fileName(name: string): string {
  const stem = name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  // ‏والاسمُ كاملًا في تلميحٍ على وسمٍ يأخذ التركيز (D-323): لوحةُ المفاتيح واللمسُ يصلانه كالمؤشّر
  return `<bdi tabindex="0" data-tip="${escapeHtml(name)}">${escapeHtml(stem === '' ? name : stem)}</bdi>`
}

/**
 * سهمُ المسار في نصٍّ يُقرأ — «Credentials ← Create credentials» (D-185).
 *
 * أدلّةُ المنصّات وسطورُ المفاتيح تكتب الطريقَ بين شاشاتٍ بسهم، **والسهمان «←» و«→»
 * ليسا في Plex** (خطّة التصميم 3.4)، فكانا يُرسَمان بخطّ النظام في مئةِ موضع. والنصُّ
 * يبقى بيانًا بسهمه في `lib/` (يُقرأ ويُختبَر كما هو)، **ويُرسَم السهمُ عند العرض**:
 * «←» يشير إلى نهاية السطر العربيّ (`ICON.go`) و«→» إلى نهاية اللاتينيّ (`ICON.back`)،
 * كما كان الحرفُ يُرى، بلا زيادة. ومعناه في سمته لقارئ الشاشة: «ثمّ».
 *
 * **ويُعطى نصًّا مهرَّبًا أو وسمًا موثوقًا**، لا سِمة: الرسمُ وسمٌ، وفي `title=""` يُطبَع حرفًا.
 */
export function pathArrows(html: string): string {
  // ‏و«←» بين علامتَي RLM (ر-1): بين كلمتين لاتينيّتين يأخذ السهمُ اتّجاهَهما، فيصير
  // ‏«Instagram ← API setup ← Business login settings» مقطعًا لاتينيًّا واحدًا يُقرأ معكوسًا
  return html
    .replaceAll('←', `\u200F<span class="arw" role="img" aria-label="ثمّ">${ICON.go}</span>\u200F`)
    .replaceAll('→', `<span class="arw" role="img" aria-label="ثمّ">${ICON.back}</span>`)
}

/**
 * علامةُ الدرجة — مع كلمتها لا وحدَها (D-043).
 *
 * كانت في `platformView.ts` لسلّم المنصّة وحده (D-158). **ونقاطُ الجاهزيّة
 * تحت زرَّي الصورة والمقطع تقرأ الحالَ نفسَها** (D-163)، فنسخةٌ ثانيةٌ هناك
 * كانت تفترق عن الأولى عند أوّل رمزٍ يُبدَّل.
 */
export const RUNG_MARK: Readonly<Record<RungState, { g: string; cls: Tone; label: string }>> = {
  done: { g: '●', cls: 'ok', label: 'تامّة' },
  now: { g: '◍', cls: 'warn', label: 'تنتظرك' },
  waiting: { g: '○', cls: 'idle', label: 'تنتظر' },
  failed: { g: '▲', cls: 'bad', label: 'فشلت' },
}

/**
 * رأسُ اللوح — **واحدٌ لكلّ لوحٍ سوى «نظرة عامّة»** (D-137): كان لوحُ
 * الجدول المحوريّ وحدَه بلا رأس، فقُرئ ناقصًا بين ألواحٍ لكلٍّ منها اسمٌ
 * وسطرٌ. ونظرةٌ عامّة تُفتَح كلَّ صباحٍ فتحمل السطرَ وحدَه قصدًا.
 */
export function pageHead(eyebrow: string, title: string, lede: string, aside = '', tip = ''): string {
  // ‏و`tip` مساعدةٌ بجانب العنوان (ⓘ · D-381) خارج «h1» — فلا يدخل اسمُها اسمَ الصفحة
  const h1 = '<h1>' + escapeHtml(title) + '</h1>'
  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>${escapeHtml(eyebrow)}</div>
      ${tip === '' ? h1 : '<div class="ph-row">' + h1 + tip + '</div>'}
      ${lede === '' ? '' : `<p class="lede">${lede}</p>`}
    </div>
    ${aside === '' ? '' : `<div class="aside">${aside}</div>`}
  </div>`
}

export function pct(used: number, cap: number): number {
  if (cap <= 0) return 100
  return Math.min(100, Math.round((used / cap) * 100))
}

/**
 * مقياسُ مقدار: هيئةٌ واحدة تتدرّج بالطول لا بالهيئة.
 * والبلوغ حالةٌ لا مقدار — فيقفز إلى الأحمر **ومعه نصّ**، لأنّ الحالة
 * لا تقع على اللون وحده.
 *
 * **والامتلاءُ ليس واحدًا** (D-134): سقفٌ بُلغ إنذارٌ أحمر، **وعملٌ اكتمل
 * (كلُّها محلَّلة، كلُّهم جاهزون) خضرة** — وكان الشريطُ يحمرّ للاثنين،
 * فقرأ المالكُ «2 من 2 محلَّلة» عطلًا. والعلامةُ نصٌّ تحت الشريط تُلوَّن
 * كلونه، فلا يفترق الاثنان.
 */
export function bar(used: number, cap: number, label = 'بلغ السقف'): string {
  const p = pct(used, cap)
  const full = p >= 100
  const done = label !== 'بلغ السقف'
  return `<div class="bar"><i class="${full ? (done ? 'done' : 'full') : ''}" style="width:${p}%"></i></div>` +
    (full
      ? `<div class="cap${done ? ' done' : ''}"><span class="st-ic">${glyph(done ? '●' : '▲')}</span>${escapeHtml(label)}</div>`
      : '')
}


/** صفٌّ في صندوق التنبيهات — **ما خرج فعلا، لا ما وقع**. */
export interface OutboxRow {
  readonly kind: string
  readonly body: string
  readonly status: number | null
  readonly error: string | null
  readonly at: string
}

const ALERT_KIND: Readonly<Record<string, string>> = {
  token: 'إذن يقترب',
  publish: 'نشر فشل',
  budget: 'سقف الإنفاق',
  security: 'أمان الحساب',
  // ‏الخامسُ (D-320 · 0048 · تحقّق D-320 على main): دورةٌ تسقط أو تتأخّر أو نشرٌ لا يأخذ ما حلّ. والاسمُ من «هل الآلة تعمل؟»
  heartbeat: 'الآلة تتعثّر',
  // ‏السادسُ (D-348 · 0050): مفتاحُ مزوّدٍ سقط في اختبار الفجر أو في اختبارٍ يدويّ
  provider: 'مفتاح سقط',
}

/**
 * قناةُ التنبيهات (D-109) — **الحقلُ وما خرج منه معا**.
 *
 * **ولا صمتٌ يُظنّ نجاحا**: عنوانٌ مضبوطٌ لا يقول إن كان يصل. فيُعرَض
 * آخرُ ما أُرسل بحاله — **ومن رأى ‏٤٠٤ متكرّرةً عرف أنّ قناتَه ماتت**
 * قبل أن يقع الحدثُ الذي يحتاجها.
 *
 * **ولا يُعرَض المتنُ إلّا مقتضبا**: هو نصٌّ خرج إلى قناةٍ خارجيّة، وقد
 * قِيس أن لا سرَّ فيه — **لكنّ عرضَه كاملا يجعل الشاشةَ نسخةً من القناة**
 * لا سجلًّا لها.
 */
/**
 * **و`webhook` قناعٌ لا عنوان** (D-318): البروتوكولُ والمضيفُ وآخرُ أربعة محارف. العنوانُ سرٌّ حاملٌ يُحفَظ مشفَّرًا، فلا
 * يُعاد إلى الحقل ولا إلى الصفحة؛ والحقلُ فارغٌ لعنوانٍ جديدٍ يحلّ محلّه، وإزالتُه بزرٍّ مستقلّ لا بحقلٍ يُفرَّغ.
 */
export function alertChannel(webhook: string, rows: readonly OutboxRow[]): string {
  const list = rows.length === 0
    ? `<p class="hint">${webhook === ''
        ? 'ولا قناة مضبوطة — فالتنبيهات تُسجَّل في القاعدة ولا تخرج.'
        : 'لم يخرج شيء بعد. <b>وهذا خبر جيّد</b> — الخمسة لا تقع كلّ يوم.'}</p>`
    : `<ul class="ax">${rows
        .map((r) => {
          const ok = r.status !== null && r.status >= 200 && r.status < 300
          return `<li class="card card-inset ax-r">
            ${statusBadge(ok ? 'ok' : 'bad', ok ? '↑' : '✕', escapeHtml(ALERT_KIND[r.kind] ?? r.kind))}
            <span class="ax-b">${escapeHtml(r.body.slice(0, 70))}${r.body.length > 70 ? '…' : ''}</span>
            <span class="grow"></span>
            ${r.error === null
              ? `<span class="chip mono">${r.status ?? '—'}</span>`
              // ‏‏والخطأُ كاملًا بلا تمرير (D-323): كان مقصوصًا إلى ‏28 حرفًا وباقيه في تلميحٍ لا يصله الهاتف ولا لوحةُ
              // ‏المفاتيح — وهو ما يُرسَل إليّ حين تموت القناة. فالطويلُ سطرٌ يُفتح، والقصيرُ رقاقةٌ كما هو
              : r.error.length <= 28
                ? html`<span class="chip bad">${r.error}</span>`.value
                : html`<details class="ax-err"><summary class="chip bad">${r.error.slice(0, 28)}…</summary>
                    <p class="hint m-0">${r.error}</p></details>`.value}
          </li>`
        })
        .join('')}</ul>`

  return `<div class="card"><h2>قناة التنبيهات</h2>
    <p>ثلاثة أحداث في العمل تخرج من هنا: إذن يقترب من الانتهاء، ونشر
      فشل نهائيّا، وبلوغ سقف الإنفاق. <b>ورابعُها أمانُ الحساب</b>: دخولٌ جديد، وعاملٌ ثانٍ أُضيف أو أُزيل،
      ورمزُ استرداد استُعمل، وإخراجُ الأجهزة. <b>وخامسُها الآلةُ نفسُها</b>: دورةُ إرسال المجدول أو تجديد الأذونات
      تسقط نصفَ ساعةٍ متّصلة، أو منشورٌ حلّ موعدُه ولم يأخذه النشر. ولا سادس — إشعار يكثر يُطفَأ.</p>
    <p class="hint"><b>ولا يحمل الإشعار إذنا ولا سرّا ولا رابطا موقَّعا</b> —
      يقول ما وقع ويُحيلك إلى هذه اللوحة. والقناة خارج سيطرتنا: سجلُّها
      يُقرأ بعد سنة.</p>
    ${webhook === ''
      ? ''
      : html`<div class="split mt-2"><p class="m-0">القناة الآن: <bdi class="mono" dir="ltr">${webhook}</bdi>
          <span class="hint">— مشفَّرة، ولا يُعرض منها إلّا هذا.</span></p>
        <form class="inline" method="POST" action="/panel/settings"
              data-confirm="إزالة قناة التنبيهات؟ لن يخرج تنبيهٌ حتّى تضبط غيرها.">
          <input type="hidden" name="key" value="alert_webhook">
          <input type="hidden" name="value" value="">
          <input type="hidden" name="clear" value="1">
          <button class="btn btn-danger btn-sm" type="submit">أزل القناة</button></form></div>`.value}
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="alert_webhook">
      <div class="field grow"><label for="hook">${webhook === '' ? 'عنوان القناة (Webhook)' : 'عنوانٌ جديد يحلّ محلّها'}</label>
        <input id="hook" name="value" type="url" class="mono" dir="ltr" inputmode="url" autocomplete="off" required
          placeholder="https://hooks.slack.com/services/…" value=""></div>
      <button class="btn btn-secondary" type="submit">احفظ</button>
    </form>
    <p class="hint">يعمل مع Slack و Discord و Telegram وأيّ عنوان يقبل
      <span class="mono">POST</span> بحقل <span class="mono">text</span>.
      <b>والعناوين الداخليّة تُردّ عند الحفظ</b> — لا عند الإرسال وحدَه.</p>
    <h3 class="sec">آخر ما خرج</h3>
    ${list}
  </div>`
}

/**
 * «هل الآلةُ تعمل؟» (D-158) — نبضُ كلّ دورةٍ من صفّها في `heartbeats`.
 *
 * كان الجوابُ يُقرأ من سجلّ Cloudflare وحده، **والمالكُ لا يفتحه**. فمنشورٌ
 * مجدولٌ فات موعدُه كان يُقرأ «لا يعمل» بلا سبب: أدارت الدورةُ فلم تجد ما
 * تُرسل، أم لم تدُر (دقائقُ نفدت، M-23)؟ والسطرُ الأحمرُ هنا هو الفرق.
 */
export function machineCard(pulses: readonly Pulse[], now: Date): string {
  const bad = pulses.filter((p) => p.state === 'failed' || p.state === 'late')
  const never = pulses.filter((p) => p.state === 'never')
  const head =
    bad.length > 0
      // ‏والفعلُ قبل المعدود فلا يُطابَق مثنّاه (D-177): «تأخّرت أو سقطت دورتان» لا «2 دورةٌ متأخّرة»
      ? statusBadge('bad', '▲', `تأخّرت أو سقطت ${counted(bad.length, NOUNS.cycle)}`)
      : never.length === pulses.length
        ? statusBadge('idle', '○', 'لم تدُر دورة بعد')
        : statusBadge('ok', '●', 'الدورات في مواعيدها')
  const rows = pulses
    .map((p) => {
      const mark =
        // ‏‏النسخةُ بلا دلوٍ خاصّ تدور كلَّ فجرٍ ولا تأخذ شيئًا: «في موعدها» بالأخضر يُطمئن على ما لم يقع (مراجعة D-321)
        p.job === 'backup' && p.state === 'ok' && p.beat?.outcome === 'skipped' ? statusBadge('idle', '○', 'لا تعمل بعد')
        : p.state === 'ok' ? statusBadge('ok', '●', 'في موعدها')
        : p.state === 'late' ? statusBadge('bad', '▲', `تأخّرت ${duration(p.lateBy)}`)
        : p.state === 'failed' ? statusBadge('bad', '✕', 'سقطت')
        : statusBadge('idle', '○', 'لم تدُر بعد')
      const when = p.beat === null ? '' : `<span class="ago">${escapeHtml(relativeTime(p.beat.at, now))}</span>`
      const detail = p.beat?.detail == null ? '' : `<span class="ax-b">${escapeHtml(p.beat.detail)}</span>`
      return `<li class="card card-inset ax-r">${mark}<span>${escapeHtml(p.label)} ${when}</span>${detail}</li>`
    })
  // ‏والمتأخّرةُ وحدَها ظاهرةً، والكلُّ تحت «كلُّ الدورات» (D-194)
  const late = pulses.map((p) => p.state === 'failed' || p.state === 'late')
  // ‏و`id` مرساةُ حبّة النظام في الرأس و«افحص الآلة» في «خطوتك التالية». والبطاقةُ من العُدّة
  // ‏(D-189): عنوانٌ وحالُه في طرف الرأس
  return card({
    id: 'machine',
    title: 'هل الآلة تعمل؟',
    action: head,
    // ‏**والسليمةُ سطرٌ يُفتح** (D-194): كانت ثلثَ الرئيسيّة وكلُّها «في موعدها». تُفتح وحدَها حين يتأخّر شيء
    body: bad.length > 0
      ? `<ul class="ax">${rows.filter((_, i) => late[i]).join('')}</ul>
    ${late.every(Boolean) ? '' : `<details class="machine-more"><summary>الدورات الأخرى</summary>
      <ul class="ax mt-3">${rows.filter((_, i) => !late[i]).join('')}</ul></details>`}`
      : `<details class="machine-more"><summary>تفاصيل الدورات</summary><ul class="ax mt-3">${rows.join('')}</ul></details>`,
  })
}


/** ‏ما ترسمه «صحّة صدى» (D-321) — يُحمَّل للمالك وحدَه في «الضبط ← متقدّم ← النظام». */
export interface HealthView {
  readonly slis: readonly Sli[]
  /** ‏أمربوطٌ دلوُ النسخ الخاصّ (`BACKUP`، M-51)؟ */
  readonly bound: boolean
  readonly last: BackupRow | null
  readonly lastOk: BackupRow | null
  /** ‏قُرئ سجلُّ النسخ؟ — قاعدةٌ لم تردّ تُرسم «لم يُقرأ» لا «لا نسخة». */
  readonly read: boolean
}

const SLI_LABEL: Readonly<Record<SliKey, string>> = {
  on_time: 'في موعده',
  success: 'نجاح النشر',
  availability: 'التوافر من الخارج',
}
const SLI_WHAT: Readonly<Record<SliKey, string>> = {
  on_time: 'خرج خلال 16 دقيقة من موعده',
  success: 'آخر محاولة لكلّ منشور',
  availability: 'ردّ /pulse بـ200 على المراقب الخارجيّ',
}
const SLI_NONE: Readonly<Record<SliKey, string>> = {
  on_time: 'لا قياس: لم يحلّ موعد منشور مجدول',
  success: 'لا قياس: لم تُحسم محاولة نشر',
  availability: 'لا قياس: لم يسأل المراقب الخارجيّ بعد',
}
/** ‏الدوراتُ التي تقول «هل يعمل الآن»: الإرسالُ والتجديدُ ومستهلكُ النشر (`/pulse`) والنسخة. */
const HEALTH_JOBS: readonly Job[] = ['dispatch', 'renew', 'publish', 'backup']
/** ‏نسخةٌ أقدمُ من ثمانية أيّام فاتها أسبوعُها. */
const BACKUP_STALE_SECONDS = 8 * 24 * 60 * 60

/** ‏نسبةٌ بمنزلةٍ عشريّة، **تُقصّ ولا تُقرَّب**: ‏99.96٪ لا تُقرأ «100.0٪» وفيها خطأ. */
const percent = (r: number): string => (Math.floor(r * 1000) / 10).toFixed(1) + '٪'
const target = (t: number): string => String(Number((t * 100).toFixed(1))) + '٪'
/** ‏شارةُ الحال موسومةً: `statusBadge` يرسم نصًّا من ثوابته ومن نصٍّ يُهرَّب قبله (`components/badge.ts`). */
const badge = (tone: Tone, g: string, text: string) => raw(statusBadge(tone, g, escapeHtml(text)))

function budgetCell(b: number | null): HtmlValue {
  if (b === null) return '—'
  if (b <= 0) return badge('bad', '▲', 'نفد')
  if (b >= 1) return badge('ok', '●', 'لم يُمسّ')
  return badge(b < 0.5 ? 'warn' : 'ok', b < 0.5 ? '▲' : '●', 'بقي ' + Math.floor(b * 100) + '٪')
}

function backupLine(h: HealthView, now: Date): Html {
  if (!h.read) return html`<p class="hint">${badge('idle', '○', 'سجلّ النسخ لم يُقرأ الآن')}</p>`
  if (!h.bound) {
    return html`<p class="hint">${badge('warn', '▲', 'لا نسخة احتياطيّة')} الدلو الخاصّ لم يُربط بعد — بابُه في <a href="/panel/tasks">ما عليك</a>.</p>`
  }
  const ok = h.lastOk
  const failedAfter = h.last !== null && h.last.status === 'failed' && (ok === null || h.last.id !== ok.id)
    ? html`<p class="hint">وفشلت محاولةٌ ${relativeTime(h.last.at, now)}: ${h.last.detail ?? 'بلا سبب مكتوب'}</p>`
    : ''
  if (ok === null) return html`<p class="hint">${badge('idle', '○', 'لا نسخة بعد')} تُؤخذ الأولى في الدورة اليوميّة التالية.</p>${failedAfter}`
  const at = Date.parse(ok.at.replace(' ', 'T') + 'Z')
  const stale = Number.isFinite(at) && now.getTime() - at > BACKUP_STALE_SECONDS * 1000
  const size = String(Math.max(1, Math.ceil(ok.bytes / 1024))) + 'KB'
  return html`<p class="hint">${badge(stale ? 'warn' : 'ok', stale ? '▲' : '●', 'آخر نسخة احتياطيّة')} ${relativeTime(ok.at, now)} · ${counted(ok.tables, NOUNS.table)} · ${counted(ok.rows, NOUNS.row)} · ${size}</p>${failedAfter}`
}

/**
 * ‏**«صحّة صدى»** (D-321 · `docs/SLO.md`): المؤشّراتُ الثلاثة على ثمانيةٍ وعشرين يومًا بهدفها وما بقي من هامشها، وآخرُ نسخةٍ
 * ‏احتياطيّة، وعمرُ آخر دورةٍ لما يقول «هل يعمل الآن». **ولا زرَّ فيها**: تقرأ ولا تفعل، وما يُفعل بابُه في «ما عليك».
 */
export function healthCard(h: HealthView, pulses: readonly Pulse[], now: Date): string {
  const measured = h.slis.filter((s) => s.ratio !== null)
  const head = h.slis.some((s) => s.budgetLeft !== null && s.budgetLeft <= 0)
    ? badge('bad', '▲', 'نفد هامش مؤشّر')
    : measured.length === 0
      ? badge('idle', '○', 'لا قياس بعد')
      : badge('ok', '●', 'في أهدافها')
  const rows = h.slis.map((s) => {
    const value = s.ratio === null
      ? html`<span class="hint">${SLI_NONE[s.key]}</span>`
      : html`<b>${percent(s.ratio)}</b> <span class="sub">${s.good} من ${s.total}</span>${
          s.excluded > 0 ? html` <span class="sub">· ${s.excluded} ردّتها المنصّة لا تُعدّ</span>` : ''}`
    return html`<tr><th scope="row">${SLI_LABEL[s.key]}<div class="sub">${SLI_WHAT[s.key]}</div></th><td>${value}</td><td>${target(s.target)}</td><td>${budgetCell(s.budgetLeft)}</td></tr>`
  })
  const ages = HEALTH_JOBS.map((job) => {
    const p = pulses.find((x) => x.job === job)
    return (p?.label ?? job) + ' ' + (p?.beat == null ? 'لم تدُر بعد' : relativeTime(p.beat.at, now))
  })
  return card({
    id: 'health',
    title: 'صحّة صدى',
    action: head.value,
    desc: 'آخر 28 يومًا، للحسابات كلّها. والهامش ما يجوز من الخطأ قبل أن يقف الجديد ليُصلَح القديم.',
    body: html`<div class="scroll"><table>
      <thead><tr><th>المؤشّر</th><th>آخر 28 يومًا</th><th>الهدف</th><th>الهامش</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${backupLine(h, now)}
    <p class="hint m-0">آخر دورة: ${ages.join(' · ')}</p>`.value,
  })
}
