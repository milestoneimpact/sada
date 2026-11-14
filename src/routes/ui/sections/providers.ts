/**
 * قسمُ المزوّدين — بطاقاتٌ ورقائقُ جاهزةٌ وجدولُ توجيه.
 *
 * وأُخرج من `panelView` لا تنظيما فحسب: هو أطولُ قسمٍ فيها، وكان يخفي
 * ما حوله. ومنطقُه لم يتبدّل — بناءُ نصٍّ محضٌ من بياناتٍ جاهزة، فلا
 * قاعدةَ يقرأها ولا حارسَ يمرّ به.
 */
import { stamp } from '../../../lib/time/zone'
import { money, relativeTime } from '../../../lib/format'
import { modelName } from '../../../lib/ai/modelName'
import type { PanelData, PanelProvider } from '../../panelView'
import { ICON } from '../icons'
import { escapeHtml } from '../escape'
import { RUNG_MARK, bar, pathArrows } from '../parts'
import { statusBadge } from '../components/badge'

/**
 * **ولكلّ مهمّةٍ في `ROUTES` سطرٌ هنا** (D-091).
 *
 * كانت ثلاثا وفي `ROUTES` أربع، فيُعرَض `plan` بمفتاحه الخام. ومفتاحٌ
 * إنجليزيٌّ في جدولٍ عربيٍّ يُقرأ عطلا لا مهمّة.
 */
const TASK_LABEL: Readonly<Record<string, string>> = {
  analyze: 'الفهم — الحكم على المصدر',
  draft: 'الكتابة — صياغة المنشور',
  plan: 'الخطّة — منطق الأسبوع',
  image: 'الصورة — التوليد البصريّ',
  video: 'الفيديو — تحريك الصورة',
}

/**
 * صنفُ النماذج الذي يُعرَض لكلّ مهمّة — **فلا يُعرَض نصٌّ لتوجيهِ صورة**.
 *
 * وما ليس في الجدول نصٌّ: `analyze` و`draft` و`plan` كلُّها كتابة.
 */
const TASK_MODELS: Readonly<Record<string, 'image' | 'video'>> = {
  image: 'image',
  video: 'video',
}


/**
 * قائمةُ النماذج — **دَرَجٌ يُملأ من عند المزوّد، لا حقلُ نصّ** (D-081).
 *
 * وكان حقلَ نصّ: يُكتب اسمُ النموذج حرفا حرفا. **وحرفٌ خطأ لا يُكتشَف
 * عند الحفظ** — يُكتشَف في أوّل مهمّةٍ حقيقيّة بردٍّ لا يقول إنّ السببَ
 * حرف. وأسوأُ منه نموذجٌ صحيحٌ اليوم يُسحَب بعد شهرين فيبقى مكتوبا.
 *
 * وثلاثةُ قيودٍ حكمت الشكل:
 *
 * ١ · **القيمةُ المحفوظة تبقى أوّلَ خيارٍ ومُختارة** — فالنموذجُ الجاري
 *     لا يضيع لو تعذّر الجلب، والحفظُ بلا جلبٍ يحفظ ما كان.
 * ٢ · **وخيارُ الكتابة اليدويّة باقٍ** — مزوّدٌ لا يخدم فهرسا يبقى
 *     صالحا، ودَرَجٌ يمنع ما لا يعرفه أسوأُ من حقلٍ حرّ.
 * ٣ · **والجلبُ بضغطةٍ لا تلقائيّا** — فتحُ الشاشة لا يوقظ نداءً إلى كلّ
 *     مزوّدٍ عند المالك؛ هو يطلب حين يريد.
 */
function modelPicker(options: {
  readonly id: string
  readonly provider: string
  readonly current: string
  /** يُصفّى الدرجُ إلى صنفِ المهمّة حين تُعرَف — فلا يُعرَض نصٌّ لتوجيهِ صورة. */
  readonly task?: 'text' | 'image' | 'video'
  /** أتُملأ حقولُ السعر ممّا يعطيه الفهرس؟ */
  readonly fillsPrice?: boolean
}): string {
  const id = escapeHtml(options.id)
  const current = escapeHtml(options.current)
  return `<div class="field mp" data-provider="${escapeHtml(options.provider)}"${
    options.task === undefined ? '' : ` data-task="${options.task}"`
  }${options.fillsPrice === true ? ' data-price="1"' : ''}>
    <label for="${id}">النموذج</label>
    <div class="row gap-1 nowrap">
      <select id="${id}" name="model" class="mp-sel w-m">
        ${options.current === ''
          ? '<option value="" selected>— اختر نموذجا —</option>'
          : `<option value="${current}" title="${current}" selected>${escapeHtml(modelName(options.current))}</option>`}
        <option value="__manual__">اكتبه يدويّا…</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm mp-load" data-tip="يجلب القائمة من عند المزوّد الآن">حدّث</button>
    </div>
    <div class="sub mp-note m-0 mt-1"></div>
  </div>`
}

export interface ProvidersMarkup {
  /** شريطُ الحال — ثلاثةُ أرقامٍ تُقرأ قبل النزول. */
  readonly strip: string
  /** المزوّدون صفوفا مضغوطة، لكلٍّ لوحُ تفصيلٍ ينفتح في مكانه. */
  readonly rows: string
  readonly add: string
  readonly routing: string
}

/**
 * قسمُ المزوّدين — **أُعيد بناؤه بالقياس** (D-082).
 *
 * ## ما قِيس قبل أن يُقترَح
 *
 * ‏٢٩ زرّا و‏١٦ نموذجا و‏٦٧٠ كلمةً في لوحٍ واحد. **وكلُّ بطاقةِ مزوّدٍ
 * تحمل سبعةَ شؤونٍ معا**: الحال · المفتاح · النموذج · السعر · الإنفاق ·
 * ثلاثةُ أفعال · نموذجُ تعديلٍ مطويّ. **وجدولُ التوجيه — وهو القرارُ
 * الذي يقرّر ما يجري فعلا — في آخر الصفحة.**
 *
 * ## والمبدأ الحاكم
 *
 * **ما ينتظر قرارَك أعلى · وما تفعله كثيرا في المتناول · وما تقرؤه
 * مرّةً يُطوى.**
 *
 * فصار: شريطُ حالٍ ثلاثيّ، ثمّ **جدولُ التوجيه صاعدا إلى موضعه**، ثمّ
 * صفوفٌ مضغوطةٌ يفتح كلٌّ منها لوحَه. **ولم يُحذَف فعلٌ واحد** — أُعيد
 * ترتيبُه.
 *
 * ## ولماذا `details` لا زرٌّ بـ JS
 *
 * اللوحُ ينفتح بلا سطرِ سكربت: `details` أصلا كذلك. **وصفحةٌ تحتاج JS
 * لتُقرأ تنكسر صامتةً** حين يسقط السكربت — والمفتاحُ الذي لا يُبدَّل
 * وقتها عطلٌ لا يُفسَّر.
 *
 * وثمنُه ضغطةٌ زائدةٌ على «اختبر». **فعُوّض في الشريط**: عددُ المفاتيح
 * التي لم تُختبر يُعرض أعلى الصفحة — فمن لم يفتح صفّا يعرف أنّ عليه
 * شيئا.
 */
/** ما يقرؤه القسمُ من بيانات اللوحة — **وهذا كلُّه** (D-280): فيُحمَّل له هذا لا الحقيبةُ كلُّها. */
export type ProvidersData = Pick<PanelData, 'providers' | 'routing' | 'knownProviders' | 'cfAccountId' | 'spendCap' | 'now' | 'zone'>

export function providersSection(d: ProvidersData): ProvidersMarkup {
  const ready = d.providers.filter((p) => p.configured && p.enabled)
  const untested = ready.filter((p) => p.verifiedAt === null).length
  const spentToday = d.providers.reduce((sum, p) => sum + p.spendToday, 0)
  const tasksReady = d.routing.filter((r) => r.ready).length

  /**
   * الشريطُ — **ثلاثةُ أرقامٍ تجيب «هل أنا بخير؟» قبل النزول**.
   *
   * وكان الجوابُ يحتاج مسحَ ستّ بطاقاتٍ وجدولا في آخر اللوح. **ورقمٌ
   * أعلى الصفحة ليس زينة**: من لا يرى أنّ مفتاحا لم يُختبر لا يختبره.
   */
  const strip = `<div class="card grid tiles c3 mb-3">
    <div class="card tile"><div class="kv-k">مزوّدون جاهزون</div>
      <div class="kv-v">${ready.length}<em> / ${d.providers.length}</em></div>
      ${bar(ready.length, Math.max(1, d.providers.length))}
      <div class="note">${untested === 0
        ? 'وكلّ مفاتيحهم اختُبرت'
        : `<b>${untested}</b> منها لم يُختبر مفتاحُه بعد — افتح صفَّه واضغط «اختبر»`}</div></div>
    <div class="card tile"><div class="kv-k">إنفاق اليوم على الذكاء</div>
      <div class="kv-v">${money(spentToday)}<em> / ${money(d.spendCap)}</em></div>
      ${bar(spentToday, d.spendCap)}
      <div class="note">مجموع ما أنفقته خدمات الكتابة والصور اليوم · يُصفَّر الثالثة فجرًا بتوقيت الرياض</div></div>
    <div class="card tile"><div class="kv-k">مهامّ جاهزة</div>
      <div class="kv-v">${tasksReady}<em> / ${d.routing.length}</em></div>
      ${bar(tasksReady, Math.max(1, d.routing.length))}
      <div class="note">مهمّة بلا مزوّد جاهز تقف عند أوّل نداء</div></div>
  </div>`

  /**
   * صفٌّ واحدٌ لكلّ مزوّد.
   *
   * والمعروضُ في السطر أربعةٌ لا سبعة: **الاسمُ وحالُه ونموذجُه وإنفاقُ
   * يومه**. وما عداها في اللوح — لأنّ العينَ تمسح عمودا واحدا، ولا
   * تمسح ستّ بطاقاتٍ كلٌّ منها سبعةُ حقول.
   */
  const rows = `<div class="plist">${d.providers.map((p: PanelProvider) => {
    const id = escapeHtml(p.name)
    const locked = p.source === 'worker_secret'

    const status = !p.configured
      ? statusBadge('bad', '✕', 'لا مفتاح')
      : !p.enabled
        ? statusBadge('warn', '▲', 'معطَّل')
        : p.verifiedAt === null
          ? statusBadge('idle', '○', 'لم يُختبر')
          : `${statusBadge('ok', '✓', `اختُبر ${escapeHtml(relativeTime(p.verifiedAt, d.now))}`, `tabindex="0" data-tip="${escapeHtml(stamp(p.verifiedAt, d.zone ?? null))}"`)}`

    const priceNote = p.priceIn === null && p.priceOut === null
      ? 'سعر غير مضبوط — تُسجَّل الكلفة صفرا ولا يُخمَّن رقم'
      : `لكلّ مليون وحدة: دخول ${money(p.priceIn ?? 0)} · خروج ${money(p.priceOut ?? 0)}`

    return `<details class="prow">
      <summary>
        <span class="pn">${escapeHtml(p.label)}
          <span class="pk">${p.kind === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'}${
            p.builtin ? ' · مدمَج' : ''}${locked ? ' · سرّ Worker' : ''}</span></span>
        <span class="pm mono">${escapeHtml(p.model ?? '—')}</span>
        <span class="card card-inset pv">${money(p.spendToday)}<i>اليوم</i></span>
        <span class="pst">${status}</span>
        <span class="ptog"><span class="lbl-open">تفاصيل</span><span class="lbl-close">إغلاق</span></span>
      </summary>

      <div class="pbody">
        <div class="row mb-3">
          ${p.configured ? `
          <form class="inline" method="POST" action="/panel/providers/verify" data-busy="جار الاختبار…">
            <input type="hidden" name="provider" value="${id}">
            <button class="btn btn-primary btn-sm" type="submit">اختبر المفتاح</button></form>` : ''}
          ${locked ? '' : `
          <form class="inline" method="POST" action="/panel/providers/toggle">
            <input type="hidden" name="provider" value="${id}">
            <input type="hidden" name="enabled" value="${p.enabled ? 'false' : 'true'}">
            <button class="btn btn-secondary btn-sm" type="submit">${p.enabled ? 'تعطيل' : 'تفعيل'}</button></form>`}
          <div class="grow"></div>
          ${p.builtin ? '' : `
          <form class="inline" method="POST" action="/panel/providers/delete"
                data-confirm="حذف ${escapeHtml(p.label)}؟ لا يُسترجَع.">
            <input type="hidden" name="provider" value="${id}">
            <button class="btn btn-danger btn-sm" type="submit">حذف</button></form>`}
        </div>

        <div class="pgrid">
          <div><div class="kv-k">المفتاح</div>
            ${p.hint === null
              ? p.secretName === null
                ? '<div class="sub m-0">لا مفتاح محفوظ بعد</div>'
                : `<div class="sub m-0">أو ضعه سرّا: <span class="mono">${escapeHtml(p.secretName)}</span><br>${pathArrows(escapeHtml(p.howToGet))}</div>`
              : `<span class="mono">${escapeHtml(p.hint)}</span>`}</div>
          <div><div class="kv-k">العنوان</div>
            <span class="mono">${escapeHtml(p.baseUrl ?? '—')}</span></div>
          <div><div class="kv-k">السعر</div>
            <div class="sub m-0">${priceNote}</div></div>
          <div><div class="kv-k">30 يومًا</div>
            <div class="sub m-0">${money(p.spend)} · ${p.calls} نداء${
              p.dailyCap === null ? '' : ` · سقفُه ${money(p.dailyCap)}`}</div></div>
        </div>

        ${locked
          ? `<div class="outcome"><span class="kv-k">محميّ</span><span class="kv-v">مفتاح هذا المزوّد في
               <b>أسرار Worker</b> — لا يُبدَّل من هنا، وهو أأمن موضع.
               ولتبديله: ${pathArrows('لوحة Cloudflare ← Variables and Secrets')}.</span></div>`
          : `<form class="row mt-3" method="POST" action="/panel/providers/key" data-busy="جار الحفظ…"
                  >
               <input type="hidden" name="provider" value="${id}">
               <div class="field grow-field">
                 <label for="k-${id}">${p.hint === null ? 'أضف المفتاح' : 'استبدل المفتاح'}</label>
                 <input class="w-full" id="k-${id}" type="password" name="key" dir="ltr" required autocomplete="off"
                       ></div>
               <button class="btn btn-primary self-end" type="submit">حفظ المفتاح</button>
             </form>`}

        <form class="row mt-3" method="POST" action="/panel/providers/add">
          <input type="hidden" name="name" value="${id}">
          <input type="hidden" name="label" value="${escapeHtml(p.label)}">
          ${p.builtin ? '' : `<div class="field"><label for="u-${id}">العنوان</label>
            <input class="w-m" id="u-${id}" name="base_url" dir="ltr" value="${escapeHtml(p.baseUrl ?? '')}"
                   required></div>`}
          ${modelPicker({
            id: `m-${p.name}`,
            provider: p.name,
            current: p.model ?? '',
            fillsPrice: true,
          })}
          <div class="field"><label for="pi-${id}">سعر الدخول /M</label>
            <input class="w-xs" id="pi-${id}" type="number" step="0.01" min="0" name="price_in"
                   value="${p.priceIn ?? ''}"></div>
          <div class="field"><label for="po-${id}">سعر الخروج /M</label>
            <input class="w-xs" id="po-${id}" type="number" step="0.01" min="0" name="price_out"
                   value="${p.priceOut ?? ''}"></div>
          <div class="field"><label for="dc-${id}">سقفه اليوميّ ($)</label>
            <input class="w-xs" id="dc-${id}" type="number" step="0.5" min="0" max="100" name="daily_cap"
                   value="${p.dailyCap ?? ''}" placeholder="عامّ"></div>
          <button class="btn btn-secondary btn-sm self-end" type="submit">حفظ</button>
        </form>
      </div>
    </details>`
  }).join('')}</div>`

  /**
   * مزوّدون جاهزون — **والبيانةُ كاملةٌ لا العنوانُ وحده**.
   *
   * وكان فيها العنوانُ والنموذجُ فقط، **فبقي السؤالُ الذي يعطّل فعلا
   * بلا جواب: من أين آتي بالمفتاح؟** فيُبحَث عنه في لوحةٍ لا يعرفها
   * المالك، ويُنسخ من صفحةٍ خطأ، فيُحفَظ مفتاحٌ لا يعمل — **ويبدو
   * العطلُ عندنا وهو عندهم**.
   *
   * فلكلٍّ ثلاثةٌ: أين يُصنَع المفتاح، وأيّ صلاحيّةٍ يحتاج، وما يميّز
   * لهجته إن كان لها ما يميّزها. **والقيم في `data` لا في JS محقون** —
   * فلا نصَّ يُبنى في السكربت.
   */
  const PRESETS: readonly {
    name: string
    label: string
    url: string
    model: string
    keyFrom: string
    note: string
  }[] = [
    {
      name: 'deepseek', label: 'DeepSeek',
      url: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      keyFrom: 'platform.deepseek.com ← API keys',
      note: 'أرخصُهم للنصّ العربيّ الطويل، ويلزمه رصيد مدفوع مسبقا.',
    },
    {
      name: 'openai', label: 'OpenAI',
      url: 'https://api.openai.com/v1', model: 'gpt-4o',
      keyFrom: 'platform.openai.com ← API keys ← Create new secret key',
      note: 'المفتاح يُعرَض مرّةً واحدةً عند إنشائه ولا يُقرأ بعدها.',
    },
    {
      name: 'groq', label: 'Groq',
      url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile',
      keyFrom: 'console.groq.com ← API Keys',
      note: 'أسرعُهم استجابةً، وحدُّه اليوميّ ضيّق في الطبقة المجّانيّة.',
    },
    {
      name: 'mistral', label: 'Mistral',
      url: 'https://api.mistral.ai/v1', model: 'mistral-large-latest',
      keyFrom: 'console.mistral.ai ← API Keys',
      note: 'يلزم تفعيل الحساب بالدفع قبل أن يعمل المفتاح.',
    },
    {
      name: 'openrouter', label: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o',
      keyFrom: 'openrouter.ai/keys',
      note: 'وهو الوحيد الذي يعطي السعر في فهرسه — فيُملأ حقلا السعر وحدَهما بضغطة «حدّث».',
    },
    {
      name: 'xai', label: 'xAI',
      url: 'https://api.x.ai/v1', model: 'grok-2-latest',
      keyFrom: 'console.x.ai ← API Keys',
      note: 'حساب xAI غير حساب X — ومفتاح النشر لا يصلح هنا.',
    },
    /**
     * **Cloudflare — وعنوانُها يحمل معرّفَ حسابك في المسار.**
     *
     * Workers AI يتكلّم لهجة `chat/completions` مثلَ الباقين
     * (D-031: سائقٌ لكلّ لهجة لا لكلّ شركة) — لكنّ المعرّفَ في المسار
     * لا في ترويسةٍ ولا في جسد. فعنوانٌ عامٌّ لا يعمل.
     *
     * ويُملأ المعرّفُ من `CF_AI_ACCOUNT_ID` إن كان مضبوطا — **اللوحةُ
     * تعرفه، فلا يُطلَب من المالك أن يبحث عنه**. وإن لم يكن، بقي
     * القالبُ ظاهرا، **وحارسُ العنوان يردّ حفظَه** فلا يُرسَل المفتاح
     * إلى مسارٍ لا وجودَ له.
     *
     * **وهذا العنوانُ يكفي للثلاثة** (D-081): النصُّ ينادَى عليه كما
     * هو، والصورةُ والفهرسُ يُشتقّان منه — `‎/ai/run/{model}` و
     * `‎/ai/models/search`. وكان الفهرسُ يُنادى على `‎/ai/v1/models`،
     * **وهي نهايةٌ لا يخدمها Workers AI**، فكان المفتاحُ الصحيحُ يُردّ.
     */
    {
      name: 'cloudflare',
      label: 'Cloudflare',
      url:
        'https://api.cloudflare.com/client/v4/accounts/' +
        (d.cfAccountId === null ? '{ACCOUNT_ID}' : d.cfAccountId) +
        '/ai/v1',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      keyFrom: 'dash.cloudflare.com ← My Profile ← API Tokens ← Create Token',
      note: 'الصلاحيّة المطلوبة: Account · Workers AI · Read — ولا تكفي صلاحيّة AI Gateway وحدَها.',
    },
  ]

  const presetChips = PRESETS.map((preset) =>
    `<button type="button" class="btn btn-secondary btn-sm preset" data-name="${escapeHtml(preset.name)}"
       data-label="${escapeHtml(preset.label)}" data-url="${escapeHtml(preset.url)}"
       data-model="${escapeHtml(preset.model)}">${escapeHtml(preset.label)}</button>`,
  ).join('')

  const presetRows = PRESETS.map((preset) =>
    `<tr>
       <td><div class="nm">${escapeHtml(preset.label)}</div>
           <div class="sub m-0">${escapeHtml(preset.note)}</div></td>
       <td><span class="mono">${pathArrows(escapeHtml(preset.keyFrom))}</span></td>
     </tr>`,
  ).join('')


  /**
   * «أضف مزوّدا» — **معالجٌ من ثلاث، والدليلُ داخلَ خطوته**.
   *
   * وكان النموذجُ يسبقه أربعُ فقراتٍ ويتبعه جدولٌ مطويّ: **الجوابُ عن
   * «من أين آتي بالمفتاح؟» بعد الحقل بصفحة**. ومَن قرأ الشرحَ أوّلا نسي
   * موضعَه، ومن ملأ الحقلَ أوّلا لم يقرأه.
   *
   * فصار كلُّ إرشادٍ **في الخطوة التي يُحتاج فيها**: العنوانُ وحارسُه في
   * الثانية، وموضعُ المفتاح عندهم في الثالثة.
   */
  const add = `<details class="card card-inset guide">
    <summary>
      <span class="g-ic">${ICON.add}</span>
      <span class="g-t"><b>أضف مزوّدا</b>
        <span>أيّ مزوّدٍ متوافقٍ مع واجهة OpenAI — ثلاث خطوات بلا نشر ولا شيفرة.</span></span>
      <span class="grow"></span>
      <span class="g-tog"><span class="lbl-open">افتح</span><span class="lbl-close">أغلق</span></span>
    </summary>
    <div class="guide-body">
    <form method="POST" action="/panel/providers/add" id="add-provider"
          data-confirm="سيُرسَل مفتاحك ونصّ مستنداتك إلى هذا العنوان. أتؤكّد؟">
      <ol class="steps mt-4">
        <li><span class="step-n">1</span><span class="body">
          <span class="what">اختر مزوّدا</span>
          <span class="why">تُملأ الحقول وحدَها. ومزوّد ليس هنا: املأها يدويّا —
            وعنوانُه ينتهي بـ <span class="mono">/v1</span> عند أكثرهم.</span>
          <span class="row mt-2">${presetChips}</span></span></li>

        <li><span class="step-n">2</span><span class="body">
          <span class="what">راجع البيانات ثمّ أضف</span>
          <span class="why"><b>العنوان يُفحَص قبل الحفظ</b>: https وحدها، ولا عناوين داخليّة،
            ولا قالب لم يُملأ — خطأ مطبعيّ في المضيف يرسل مفتاحَك إلى حيث لا تريد.</span>
          <span class="row mt-3">
            <span class="field"><label for="np">الاسم (لاتينيّ)</label>
              <input class="w-s" id="np" name="name" dir="ltr" required placeholder="deepseek"></span>
            <span class="field"><label for="nl">الاسم المعروض</label>
              <input class="w-s" id="nl" name="label" placeholder="DeepSeek"></span>
            <span class="field"><label for="nk">النوع</label>
              <select class="w-s" id="nk" name="kind"><option value="openai_compat">OpenAI-compatible</option><option value="anthropic">Anthropic (مفتاحٌ آخر)</option></select></span>
            <span class="field grow-field"><label for="nu">العنوان (https)</label>
              <input class="w-full" id="nu" name="base_url" dir="ltr" placeholder="https://api.deepseek.com/v1" aria-describedby="nu-h">
              <span class="field-hint" id="nu-h">لـ OpenAI-compatible وحدَه. ونوعُ Anthropic بلا عنوان: يُنادى Anthropic نفسُه بمفتاح هذا الصفّ.</span></span>
          </span>
          <span class="row mt-2">
            <span class="field"><label for="nm">النموذج (مبدئيّ)</label>
              <input class="w-m" id="nm" name="model" dir="ltr" placeholder="deepseek-chat"></span>
            <span class="field"><label for="ni">سعر الدخول /M</label>
              <input class="w-xs" id="ni" type="number" step="0.01" min="0" name="price_in"></span>
            <span class="field"><label for="no">سعر الخروج /M</label>
              <input class="w-xs" id="no" type="number" step="0.01" min="0" name="price_out"></span>
            <button class="btn btn-primary self-end" type="submit">أضف</button>
          </span>
          ${d.cfAccountId === null
            ? `<span class="outcome warn"><span class="kv-k">Cloudflare</span><span class="kv-v">
                عنوانُه يحمل <b>معرّف حسابك</b> في المسار، و<span class="mono">CF_AI_ACCOUNT_ID</span>
                غير مضبوط في هذه البيئة — <b>فالقالب يبقى ظاهرا ولن يُحفَظ</b>.
                اضبطه في <span class="mono">wrangler.toml</span> ليُملأ وحده.</span></span>`
            : `<span class="outcome"><span class="kv-k">Cloudflare</span><span class="kv-v">
                عنوانُه مُلئ بمعرّف حسابك وحدَه، <b>وهو يكفي للثلاثة</b>: النصّ يُنادى عليه،
                <b>والصورة والفهرس يُشتقّان منه</b>
                (<span class="mono">/ai/run</span> و <span class="mono">/ai/models/search</span>)
                — فلا تُدخِل عنوانا ثانيا.</span></span>`}</span></li>

        <li><span class="step-n">3</span><span class="body">
          <span class="what">ضع المفتاح في صفّه، ثمّ «اختبر» و«حدّث»</span>
          <span class="why">بعد الإضافة يظهر صفُّه في القائمة أعلاه. <b>«اختبر»</b> يقول أيعمل المفتاح،
            <b>و«حدّث»</b> يجلب قائمة نماذجه الآن فتختار منها بدل أن تكتب اسما —
            <b>والفهرس لا يُجلَب قبل حفظ المفتاح</b>: هو نداء باسمك عندهم.</span>
          <span class="scroll mt-3"><table>
            <thead><tr><th>المزوّد</th><th>موضع المفتاح عندهم</th></tr></thead>
            <tbody>${presetRows}</tbody></table></span>
          <span class="why">وصلاحيّة مفتاح Cloudflare: <span class="mono">Account · Workers AI · Read</span>
            — ولا تكفي صلاحيّة AI Gateway وحدَها.</span></span></li>
      </ol>
    </form>
    </div>
  </details>`

  // ‏الاحتياطُ (D-348): الكتابةُ وحدَها اليوم — يُجرَّب مرّةً حين يردّ الأوّلُ بخطأ مفتاحٍ أو حدٍّ أو انشغال، أو يبلغ سقفَه
  const fallbackPick = (task: string, primary: string, current: string | null): string =>
    '<label class="vh" for="rf-' + escapeHtml(task) + '">المزوّد الاحتياطيّ</label>'
    + '<select id="rf-' + escapeHtml(task) + '" name="fallback" class="w-s"><option value="">بلا احتياط</option>'
    + d.knownProviders.filter((p) => p.name !== primary)
      .map((p) => '<option value="' + escapeHtml(p.name) + '"' + (p.name === current ? ' selected' : '') + '>احتياط: ' + escapeHtml(p.label) + '</option>').join('')
    + '</select>'

  const providerOptions = (selected: string): string =>
    d.knownProviders
      .map((p) => `<option value="${escapeHtml(p.name)}"${p.name === selected ? ' selected' : ''}>${escapeHtml(p.label)}</option>`)
      .join('')

  const routing = d.routing.map((r) => `<tr>
      <td><div class="nm">${escapeHtml(TASK_LABEL[r.task] ?? r.task)}</div>
          <div class="sub">${pathArrows(escapeHtml(r.why))}</div></td>
      <td data-label="المزوّد والنموذج">
        <form class="row gap-2" method="POST" action="/panel/routes">
          <input type="hidden" name="task" value="${escapeHtml(r.task)}">
          <select name="provider" class="mp-provider w-s">${providerOptions(r.provider)}</select>
          ${r.task === 'draft' ? fallbackPick(r.task, r.provider, r.fallback ?? null) : ''}
          ${modelPicker({
            id: `rm-${r.task}`,
            provider: r.provider,
            current: r.model,
            task: TASK_MODELS[r.task] ?? ('text' as const),
          })}
          <button class="btn btn-secondary btn-sm" type="submit">حفظ</button>
        </form>
      </td>
      <td data-label="الحال">${r.ready
        ? statusBadge('ok', '●', 'جاهز')
        : r.pending !== undefined
          // ينتظرك ولا يسقط — بعلامة النقطة وكلمتها، فيقول الجدولُ ما يقوله الزرّ
          ? statusBadge('warn', RUNG_MARK.now.g, `${escapeHtml(r.pending)}: ${RUNG_MARK.now.label}`)
          : r.implemented
            ? statusBadge('bad', '✕', 'مزوّده غير جاهز')
            : statusBadge('idle', '○', 'لم تُبن')}</td></tr>`).join('')

  return { strip, rows, add, routing }
}
