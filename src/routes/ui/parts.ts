/**
 * عناصرُ مشتركة بين الأقسام.
 *
 * وُضعت هنا لا في `panelView` لأنّ قسم المزوّدين يستعملها أيضا —
 * واستيرادُها منه يصنع دائرةً بين ملفّين. والدائرةُ تعمل في الأنواع
 * وتنكسر في التشغيل حين يتبدّل ترتيبُ الحزم.
 */
import { escapeHtml } from './shell'
import type { Onboarding } from '../../lib/onboard'

export function pct(used: number, cap: number): number {
  if (cap <= 0) return 100
  return Math.min(100, Math.round((used / cap) * 100))
}

/**
 * مقياسُ مقدار: هيئةٌ واحدة تتدرّج بالطول لا بالهيئة.
 * والبلوغ حالةٌ لا مقدار — فيقفز إلى الأحمر **ومعه نصّ**، لأنّ الحالة
 * لا تقع على اللون وحده.
 */
export function bar(used: number, cap: number, label = 'بلغ السقف'): string {
  const p = pct(used, cap)
  const full = p >= 100
  return `<div class="bar"><i class="${full ? 'f' : ''}" style="width:${p}%"></i></div>` +
    (full
      ? `<div class="cap${label === 'بلغ السقف' ? '' : ' done'}"><span aria-hidden="true">■</span>${escapeHtml(label)}</div>`
      : '')
}


/**
 * لوحُ اليوم الأوّل (D-108) — **ويختفي من تلقاء نفسه**.
 *
 * ولا يُعرَض إلّا حين ينقص شيء. **ومعالجٌ يبقى بعد أن يُستغنى عنه
 * يُقرأ عطلا**: من أتمّ الخمسَ ثمّ رآه كلَّ صباحٍ ظنّ أنّ شيئا لم يُحفَظ.
 *
 * **وواحدةٌ تُطلَب لا خمس**: أوّلُ ما لم يتمّ يحمل الزرَّ، والباقياتُ
 * تُعرَض حالا لا دعوة. **وخمسةُ أزرارٍ في شاشةٍ أوّلَ مرّةٍ تُقرأ عبئا.**
 */
export function firstDay(o: Onboarding): string {
  if (o.hidden) return ''
  const rows = o.steps
    .map((s) => {
      /*
       * **ولا علامةَ صحٍّ على ما لم يُتحقَّق منه** (D-061): الدائرةُ
       * الفارغةُ ليست «فشلا» — هي «لم يقع»، وفرقُهما في اللون والنصّ.
       */
      const mark = s.done
        ? '<span class="fd-m done" aria-label="تمّت">✓</span>'
        : '<span class="fd-m" aria-hidden="true"></span>'
      const call = s === o.next
        ? `<a class="btn p sm" href="${escapeHtml(s.go)}">ابدأ</a>`
        : ''
      return `<li class="fd-s${s.done ? ' done' : ''}${s === o.next ? ' now' : ''}">
        ${mark}
        <div class="fd-b"><b>${escapeHtml(s.title)}</b>
          <p>${escapeHtml(s.done ? s.proof : s.why)}</p>
          ${s.done || s === o.next ? '' : `<span class="ago">${escapeHtml(s.proof)}</span>`}
        </div>${call}
      </li>`
    })
    .join('')

  return `<div class="card fd">
    <div class="fd-h">
      <div><div class="eyebrow"><span class="ln"></span>اليومُ الأوّل</div>
        <h2>${o.done} من ${o.steps.length}</h2></div>
      <span class="grow"></span>
      ${bar(o.done, o.steps.length, 'تمّت')}
    </div>
    <p class="hint"><b>وحالُ كلِّ خطوةٍ مشتقٌّ من القاعدة</b> — لا علمَ
      يُخزَّن ولا صحٌّ على ما لم يُتحقَّق منه. <b>ويختفي هذا اللوحُ وحدَه
      حين تتمّ الخمس.</b></p>
    <ol class="fd-l">${rows}</ol>
  </div>`
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
  token: 'رمزٌ يقترب',
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
            <span class="st ${ok ? 'ok' : 'bad'}"><span class="g">${ok ? '↑' : '✕'}</span>${
              escapeHtml(ALERT_KIND[r.kind] ?? r.kind)}</span>
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
    <p>ثلاثةُ أحداثٍ <b>فقط</b> تخرج من هنا: رمزٌ يقترب من الانتهاء، ونشرٌ
      فشل نهائيّا، وبلوغُ سقف الإنفاق. <b>ولا رابع</b> — إشعارٌ يكثر يُطفَأ،
      وحين يُطفَأ تسقط الثلاثةُ معه.</p>
    <p class="hint"><b>ولا يحمل الإشعارُ رمزا ولا سرّا ولا رابطا موقَّعا</b> —
      يقول ما وقع ويُحيلك إلى هذه اللوحة. والقناةُ خارجَ سيطرتنا: سجلُّها
      يُقرأ بعد سنة.</p>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="alert_webhook">
      <div class="field grow"><label for="hook">عنوانُ القناة (Webhook)</label>
        <input id="hook" name="value" type="url" class="mono" inputmode="url"
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
