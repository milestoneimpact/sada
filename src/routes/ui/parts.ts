/**
 * عناصرُ مشتركة بين الأقسام.
 *
 * وُضعت هنا لا في `panelView` لأنّ قسم المزوّدين يستعملها أيضا —
 * واستيرادُها منه يصنع دائرةً بين ملفّين. والدائرةُ تعمل في الأنواع
 * وتنكسر في التشغيل حين يتبدّل ترتيبُ الحزم.
 */
import { escapeHtml } from './escape'
import type { Pulse } from '../../lib/ops/heartbeat'
import { relativeTime } from '../../lib/format'
import type { RungState } from '../../lib/platform/readiness'

/**
 * رقاقةُ الحال — **دالّةٌ واحدةٌ ورموزٌ مرسومة** (D-154).
 *
 * كانت `<span class="st …"><span class="g">●</span>…</span>` تُكتب يدًا
 * ‏٦٥ مرّةً في عشرة ملفّات، ورمزُها حرفٌ (● ○ ▲ ✓ ✕ ◍ ◔ ↑ ◆ !) ليس في أيّ
 * وجهٍ مضمَّن، فيسقط إلى خطّ النظام ويختلف من جهازٍ لآخر (التدقيقُ الثالث).
 * هنا يُرسَم SVG بـ`currentColor` في ‏١٠×‏١٠، **والحرفُ يبقى مفتاحَه** في
 * جداول الحال، فما لا رسمَ له يُطبَع حرفًا كما كان.
 */
const GLYPH: Readonly<Record<string, string>> = {
  '●': '<circle cx="5" cy="5" r="3.6"/>',
  '○': '<circle cx="5" cy="5" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  '◍': '<circle cx="5" cy="5" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 1.9a3.1 3.1 0 0 0 0 6.2z"/>',
  '◔': '<circle cx="5" cy="5" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 5V1.9a3.1 3.1 0 0 1 3.1 3.1z"/>',
  '▲': '<path d="M5 1.5 9.1 8.6H.9z"/>',
  // ‏ونظيرُه للنزول (D-167): سهمُ الفرق عن الأمس كان يكتبه حرفًا خارج هذا الجدول
  '▼': '<path d="M5 8.5 9.1 1.4H.9z"/>',
  '◆': '<path d="M5 1 9 5 5 9 1 5z"/>',
  '✓': '<path d="M1.8 5.3 4.2 7.6 8.4 2.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  '✕': '<path d="M2.3 2.3l5.4 5.4M7.7 2.3 2.3 7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  '↑': '<path d="M5 8.5V1.7M2 4.7 5 1.7l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  '!': '<path d="M5 1.7v4.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="5" cy="8.3" r="1.1"/>',
}

/**
 * الرمزُ وحدَه بلا رقاقة — **لما يقول حالًا أو اتّجاهًا خارج «.st»** (D-167).
 *
 * سهمُ الفرق عن الأمس، وعلامةُ «آخرُ فشل» في شاشة المنصّة: كانا يكتبان الحرفَ
 * في الوسم فيسقط إلى خطّ النظام، والرقاقةُ بجانبهما مرسومة. فالرسمُ من هنا،
 * وحارسُ `audit_classes` يُسقط CI على حرفٍ منها في وسمٍ خارج هذا الملفّ.
 */
export function glyph(g: string): string {
  const drawn = GLYPH[g]
  return drawn === undefined
    ? escapeHtml(g)
    : `<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">${drawn}</svg>`
}

/**
 * `cls` من ok · warn · bad · idle (أو فارغ)، و`g` حرفُ الحال، و`text`
 * HTML جاهزٌ (مهرَّبٌ عند من كتبه)، و`attrs` سِماتٌ تُلحَق بالرقاقة.
 */
export function status(cls: string, g: string, text: string, attrs = ''): string {
  const open = `<span class="st${cls === '' ? '' : ` ${cls}`}"${attrs === '' ? '' : ` ${attrs}`}>`
  return `${open}<span class="g">${glyph(g)}</span>${text}</span>`
}

/**
 * علامةُ الدرجة — مع كلمتها لا وحدَها (D-043).
 *
 * كانت في `platformView.ts` لسلّم المنصّة وحده (D-158). **ونقاطُ الجاهزيّة
 * تحت زرَّي الصورة والمقطع تقرأ الحالَ نفسَها** (D-163)، فنسخةٌ ثانيةٌ هناك
 * كانت تفترق عن الأولى عند أوّل رمزٍ يُبدَّل.
 */
export const RUNG_MARK: Readonly<Record<RungState, { g: string; cls: string; label: string }>> = {
  done: { g: '●', cls: 'ok', label: 'تامّة' },
  now: { g: '◍', cls: 'warn', label: 'تنتظرك' },
  waiting: { g: '○', cls: 'idle', label: 'تنتظر' },
  failed: { g: '▲', cls: 'bad', label: 'ساقطة' },
}

/**
 * رأسُ اللوح — **واحدٌ لكلّ لوحٍ سوى «نظرة عامّة»** (D-137): كان لوحُ
 * الجدول المحوريّ وحدَه بلا رأس، فقُرئ ناقصًا بين ألواحٍ لكلٍّ منها اسمٌ
 * وسطرٌ. ونظرةٌ عامّة تُفتَح كلَّ صباحٍ فتحمل السطرَ وحدَه قصدًا.
 */
export function pageHead(eyebrow: string, title: string, lede: string, aside = ''): string {
  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${lede}</p>
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
  return `<div class="bar"><i class="${full ? (done ? 'done' : 'f') : ''}" style="width:${p}%"></i></div>` +
    (full
      ? `<div class="cap${done ? ' done' : ''}"><span aria-hidden="true">■</span>${escapeHtml(label)}</div>`
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
  token: 'إذنٌ يقترب',
  publish: 'نشرٌ فشل',
  budget: 'سقفُ الإنفاق',
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
export function alertChannel(webhook: string, rows: readonly OutboxRow[]): string {
  const list = rows.length === 0
    ? `<p class="hint">${webhook === ''
        ? 'ولا قناةَ مضبوطة — فالتنبيهاتُ تُسجَّل في القاعدة ولا تخرج.'
        : 'لم يخرج شيءٌ بعد. <b>وهذا خبرٌ جيّد</b> — الثلاثةُ لا تقع كلَّ يوم.'}</p>`
    : `<ul class="ax">${rows
        .map((r) => {
          const ok = r.status !== null && r.status >= 200 && r.status < 300
          return `<li class="ax-r">
            ${status(ok ? 'ok' : 'bad', ok ? '↑' : '✕', escapeHtml(ALERT_KIND[r.kind] ?? r.kind))}
            <span class="ax-b">${escapeHtml(r.body.slice(0, 70))}${r.body.length > 70 ? '…' : ''}</span>
            <span class="grow"></span>
            ${r.error === null
              ? `<span class="chip mono">${r.status ?? '—'}</span>`
              : `<span class="chip bad" title="${escapeHtml(r.error)}">${escapeHtml(
                  r.error.slice(0, 28))}</span>`}
          </li>`
        })
        .join('')}</ul>`

  return `<div class="card"><h2>قناةُ التنبيهات</h2>
    <p>ثلاثةُ أحداثٍ <b>فقط</b> تخرج من هنا: إذنٌ يقترب من الانتهاء، ونشرٌ
      فشل نهائيّا، وبلوغُ سقف الإنفاق. <b>ولا رابع</b> — إشعارٌ يكثر يُطفَأ،
      وحين يُطفَأ تسقط الثلاثةُ معه.</p>
    <p class="hint"><b>ولا يحمل الإشعارُ إذنا ولا سرّا ولا رابطا موقَّعا</b> —
      يقول ما وقع ويُحيلك إلى هذه اللوحة. والقناةُ خارجَ سيطرتنا: سجلُّها
      يُقرأ بعد سنة.</p>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="alert_webhook">
      <div class="field grow"><label for="hook">عنوانُ القناة (Webhook)</label>
        <input id="hook" name="value" type="url" class="mono" dir="ltr" inputmode="url"
          placeholder="https://hooks.slack.com/services/…"
          value="${escapeHtml(webhook)}"></div>
      <button class="g" type="submit">احفظ</button>
    </form>
    <p class="hint">يعمل مع Slack و Discord و Telegram وأيِّ عنوانٍ يقبل
      <span class="mono">POST</span> بحقل <span class="mono">text</span>.
      <b>والعناوينُ الداخليّةُ تُردّ عند الحفظ</b> — لا عند الإرسال وحدَه.</p>
    <h3 class="sec">آخرُ ما خرج</h3>
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
      ? status('bad', '▲', `${bad.length} دورةٌ متأخّرة أو ساقطة`)
      : never.length === pulses.length
        ? status('idle', '○', 'لم تدُر دورةٌ بعد')
        : status('ok', '●', 'الدوراتُ في مواعيدها')
  const rows = pulses
    .map((p) => {
      const mark =
        p.state === 'ok' ? status('ok', '●', 'في موعدها')
        : p.state === 'late' ? status('bad', '▲', `تأخّرت ${Math.round(p.lateBy / 60)} دقيقة`)
        : p.state === 'failed' ? status('bad', '✕', 'سقطت')
        : status('idle', '○', 'لم تدُر بعد')
      const when = p.beat === null ? '' : `<span class="ago">${escapeHtml(relativeTime(p.beat.at, now))}</span>`
      const detail = p.beat?.detail == null ? '' : `<span class="ax-b">${escapeHtml(p.beat.detail)}</span>`
      return `<li class="ax-r">${mark}<span>${escapeHtml(p.label)} ${when}</span>${detail}</li>`
    })
    .join('')
  return `<div class="card"><div class="card-head"><h2>هل الآلةُ تعمل؟</h2><div class="grow"></div>${head}</div>
    <p class="hint">كلُّ دورةٍ تكتب نبضةً بعد أن تدور — ولو لم تجد شيئا. والتأخّرُ دورةٌ كاملةٌ تغيب،
      لا دقائقُ cron.</p>
    <ul class="ax">${rows}</ul></div>`
}

