/**
 * عناصرُ مشتركة بين الأقسام.
 *
 * وُضعت هنا لا في `panelView` لأنّ قسم المزوّدين يستعملها أيضا —
 * واستيرادُها منه يصنع دائرةً بين ملفّين. والدائرةُ تعمل في الأنواع
 * وتنكسر في التشغيل حين يتبدّل ترتيبُ الحزم.
 */
import { escapeHtml } from './escape'
import { GLYPH_ICON, ICON } from './icons'
import type { Pulse } from '../../lib/ops/heartbeat'
import { relativeTime } from '../../lib/format'
import type { RungState } from '../../lib/platform/readiness'
import { counted, NOUNS } from '../../lib/format'

/**
 * رقاقةُ الحال — **دالّةٌ واحدةٌ ورموزٌ مرسومة** (D-154).
 *
 * كانت `<span class="st …"><span class="g">●</span>…</span>` تُكتب يدًا
 * ‏٦٥ مرّةً في عشرة ملفّات، ورمزُها حرفٌ (● ○ ▲ ✓ ✕ ◍ ◔ ↑ ◆ !) ليس في أيّ
 * وجهٍ مضمَّن، فيسقط إلى خطّ النظام ويختلف من جهازٍ لآخر (التدقيقُ الثالث).
 * هنا يُرسَم SVG بـ`currentColor`، **والحرفُ يبقى مفتاحَه** في جداول الحال، فما
 * لا رسمَ له يُطبَع حرفًا كما كان. **والرسمُ من `icon()` في `icons.ts`** (D-185):
 * شبكةُ ‏٢٤ وثخانةُ ‏١٫٨ كسائر الأيقونات، لا جدولٌ ثانٍ بثخاناتٍ أربع.
 */
/**
 * الرمزُ وحدَه بلا رقاقة — **لما يقول حالًا أو اتّجاهًا خارج «.st»** (D-167).
 *
 * سهمُ الفرق عن الأمس، وعلامةُ «آخرُ فشل» في شاشة المنصّة: كانا يكتبان الحرفَ
 * في الوسم فيسقط إلى خطّ النظام، والرقاقةُ بجانبهما مرسومة. فالرسمُ من هنا،
 * وحارسُ `audit_classes` يُسقط CI على حرفٍ منها في وسمٍ خارج هذا الملفّ.
 */
export function glyph(g: string): string {
  return GLYPH_ICON[g] ?? escapeHtml(g)
}

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
  return `<bdi title="${escapeHtml(name)}">${escapeHtml(stem === '' ? name : stem)}</bdi>`
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
 * `cls` من ok · warn · bad · idle (أو فارغ)، و`g` حرفُ الحال، و`text`
 * HTML جاهزٌ (مهرَّبٌ عند من كتبه)، و`attrs` سِماتٌ تُلحَق بالرقاقة.
 *
 * **وصنفُ الرمز «st-ic» لا «g»** (D-183): «.g» صنفُ الزرّ الشبحيّ، فكان الرمزُ
 * يلبس أرضَ الزرّ البيضاءَ وحبرَه داخل كلّ حبّةٍ ملوّنة — مربّعٌ أبيضُ في حبّةٍ
 * برتقاليّة، ‏٩٦ مرّةً في الرئيسيّة.
 */
export function status(cls: string, g: string, text: string, attrs = ''): string {
  const open = `<span class="st${cls === '' ? '' : ` ${cls}`}"${attrs === '' ? '' : ` ${attrs}`}>`
  return `${open}<span class="st-ic">${glyph(g)}</span>${text}</span>`
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
      // ‏والفعلُ قبل المعدود فلا يُطابَق مثنّاه (D-177): «تأخّرت أو سقطت دورتان» لا «2 دورةٌ متأخّرة»
      ? status('bad', '▲', `تأخّرت أو سقطت ${counted(bad.length, NOUNS.cycle)}`)
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
  // ‏و`id` مرساةُ حبّة النظام في الرأس و«افحص الآلة» في «خطوتك التالية»
  return `<div class="card" id="machine"><div class="card-head"><h2>هل الآلةُ تعمل؟</h2><div class="grow"></div>${head}</div>
    <p class="hint">كلُّ دورةٍ تكتب نبضةً بعد أن تدور — ولو لم تجد شيئا. والتأخّرُ دورةٌ كاملةٌ تغيب،
      لا دقائقُ cron.</p>
    <ul class="ax">${rows}</ul></div>`
}

