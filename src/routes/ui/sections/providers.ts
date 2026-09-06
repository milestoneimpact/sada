/**
 * قسمُ المزوّدين — بطاقاتٌ ورقائقُ جاهزةٌ وجدولُ توجيه.
 *
 * وأُخرج من `panelView` لا تنظيما فحسب: هو أطولُ قسمٍ فيها، وكان يخفي
 * ما حوله. ومنطقُه لم يتبدّل — بناءُ نصٍّ محضٌ من بياناتٍ جاهزة، فلا
 * قاعدةَ يقرأها ولا حارسَ يمرّ به.
 */
import { money, relativeTime } from '../../../lib/format'
import type { PanelData, PanelProvider } from '../../panelView'
import { escapeHtml } from '../shell'
import { bar } from '../parts'

const TASK_LABEL: Readonly<Record<string, string>> = {
  analyze: 'الفهم — الحكم على المصدر',
  draft: 'الكتابة — صياغة المنشور',
  image: 'الصورة — التوليد البصريّ',
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
  readonly task?: 'text' | 'image'
  /** أتُملأ حقولُ السعر ممّا يعطيه الفهرس؟ */
  readonly fillsPrice?: boolean
  readonly width?: string
}): string {
  const id = escapeHtml(options.id)
  const current = escapeHtml(options.current)
  return `<div class="field mp" data-provider="${escapeHtml(options.provider)}"${
    options.task === undefined ? '' : ` data-task="${options.task}"`
  }${options.fillsPrice === true ? ' data-price="1"' : ''}>
    <label for="${id}">النموذج</label>
    <div class="row" style="gap:var(--s-1);flex-wrap:nowrap">
      <select id="${id}" name="model" class="mp-sel"
              style="width:${options.width ?? '190px'};direction:ltr">
        ${options.current === ''
          ? '<option value="" selected>— اختر نموذجا —</option>'
          : `<option value="${current}" selected>${current}</option>`}
        <option value="__manual__">اكتبه يدويّا…</option>
      </select>
      <button type="button" class="g sm mp-load" title="يجلب القائمةَ من عند المزوّد الآن">حدّث</button>
    </div>
    <div class="sub mp-note" style="margin:var(--s-1) 0 0;min-height:1em"></div>
  </div>`
}

export interface ProvidersMarkup {
  readonly cards: string
  readonly add: string
  readonly routing: string
}

export function providersSection(d: PanelData): ProvidersMarkup {
  const cards = d.providers.map((p: PanelProvider) => {
    const status = !p.configured
      ? '<span class="st bad"><span class="g">✕</span>لا مفتاح</span>'
      : !p.enabled
        ? '<span class="st warn"><span class="g">▲</span>معطَّل</span>'
        : p.source === 'worker_secret'
          ? '<span class="st ok"><span class="g">●</span>سرّ Worker</span>'
          : '<span class="st ok"><span class="g">●</span>مفتاح محفوظ</span>'

    const verified = p.verifiedAt === null
      ? p.configured
        ? '<span class="st idle"><span class="g">○</span>لم يُختبر</span>'
        : ''
      : `<span class="st ok" title="${escapeHtml(p.verifiedAt)} UTC"><span class="g">✓</span>اختُبر ${escapeHtml(relativeTime(p.verifiedAt, d.now))}</span>`

    const locked = p.source === 'worker_secret'
    const id = escapeHtml(p.name)

    const priceNote = p.priceIn === null && p.priceOut === null
      ? '<div class="sub" style="margin:0">سعرٌ غير مضبوط — تُسجَّل الكلفة صفرا ولا يُخمَّن رقم</div>'
      : `<div class="sub" style="margin:0">لكلّ مليون رمز: دخول ${money(p.priceIn ?? 0)} · خروج ${money(p.priceOut ?? 0)}</div>`

    return `<div class="card">
      <div class="card-head">
        <h2 style="font-size:var(--t-base);color:var(--ink)">${escapeHtml(p.label)}</h2>
        <span class="st idle">${p.kind === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'}</span>
        ${p.builtin ? '<span class="st idle">مدمَج</span>' : ''}
        <div class="grow"></div>${status}
      </div>

      <div class="row" style="margin-bottom:var(--s-3)">
        ${p.hint === null
          ? p.secretName === null
            ? '<div class="sub" style="margin:0">لا مفتاح محفوظ بعد</div>'
            : `<div class="sub" style="margin:0">أو ضعه سرّا: <span class="mono">${escapeHtml(p.secretName)}</span><br>${escapeHtml(p.howToGet)}</div>`
          : `<div><div class="k" style="font-size:var(--t-xs);color:var(--ink-3)">المفتاح المحفوظ</div>
               <span class="mono" style="font-size:var(--t-sm)">${escapeHtml(p.hint)}</span></div>`}
        <div class="grow"></div>${verified}
      </div>

      <div class="sub" style="margin:0 0 var(--s-1)">
        النموذج <span class="mono">${escapeHtml(p.model ?? '—')}</span>
        ${p.baseUrl === null ? '' : ` · <span class="mono">${escapeHtml(p.baseUrl)}</span>`}
      </div>
      ${priceNote}

      <div class="row" style="gap:var(--s-4);margin:var(--s-3) 0">
        <div><div class="k" style="font-size:var(--t-xs);color:var(--ink-3)">إنفاق اليوم</div>
          <div class="num" style="font-size:var(--t-lg);font-weight:700">${money(p.spendToday)}${
            p.dailyCap === null ? '' : `<span style="font-size:var(--t-sm);color:var(--ink-3)"> / ${money(p.dailyCap)}</span>`
          }</div>
          ${p.dailyCap === null ? '' : bar(p.spendToday, p.dailyCap)}</div>
        <div><div class="k" style="font-size:var(--t-xs);color:var(--ink-3)">٣٠ يوما</div>
          <div class="num" style="font-size:var(--t-lg);font-weight:700">${money(p.spend)}</div>
          <div class="n">${p.calls} نداء</div></div>
      </div>

      ${locked
        ? `<div class="sub" style="margin:0">مفتاح هذا المزوّد في <b>أسرار Worker</b> — لا يُبدَّل من هنا،
             وهو أأمن موضع. ولتبديله: لوحة Cloudflare ← Variables and Secrets.</div>`
        : `<form class="row" method="POST" action="/panel/providers/key" data-busy="جارٍ الحفظ…">
             <input type="hidden" name="provider" value="${id}">
             <div class="field" style="flex:1;min-width:180px">
               <label for="k-${id}">${p.hint === null ? 'أضف المفتاح' : 'استبدل المفتاح'}</label>
               <input id="k-${id}" type="password" name="key" required autocomplete="off"
                      style="width:100%;direction:ltr;text-align:left"></div>
             <button class="p" type="submit">حفظ</button>
           </form>`}

      <div class="row" style="margin-top:var(--s-2)">
        ${p.configured ? `
        <form class="inline" method="POST" action="/panel/providers/verify" data-busy="جارٍ الاختبار…">
          <input type="hidden" name="provider" value="${id}">
          <button class="g sm" type="submit">اختبر</button></form>` : ''}
        ${locked ? '' : `
        <form class="inline" method="POST" action="/panel/providers/toggle">
          <input type="hidden" name="provider" value="${id}">
          <input type="hidden" name="enabled" value="${p.enabled ? 'false' : 'true'}">
          <button class="g sm" type="submit">${p.enabled ? 'تعطيل' : 'تفعيل'}</button></form>`}
        ${p.builtin ? '' : `
        <form class="inline" method="POST" action="/panel/providers/delete"
              data-confirm="حذف ${escapeHtml(p.label)}؟ لا يُسترجَع.">
          <input type="hidden" name="provider" value="${id}">
          <button class="d sm" type="submit">حذف</button></form>`}
        <div class="grow"></div>
        <details style="width:100%;margin-top:var(--s-2)">
          <summary style="cursor:pointer;font-size:var(--t-sm);color:var(--ink-3)">تعديل النموذج والسعر والسقف</summary>
          <form class="row" method="POST" action="/panel/providers/add" style="margin-top:var(--s-2)">
            <input type="hidden" name="name" value="${id}">
            <input type="hidden" name="label" value="${escapeHtml(p.label)}">
            ${p.builtin ? '' : `<div class="field"><label for="u-${id}">العنوان</label>
              <input id="u-${id}" name="base_url" value="${escapeHtml(p.baseUrl ?? '')}"
                     style="width:220px;direction:ltr" required></div>`}
            ${modelPicker({
              id: `m-${p.name}`,
              provider: p.name,
              current: p.model ?? '',
              fillsPrice: true,
              width: '190px',
            })}
            <div class="field"><label for="pi-${id}">سعر الدخول /M</label>
              <input id="pi-${id}" type="number" step="0.01" min="0" name="price_in"
                     value="${p.priceIn ?? ''}" style="width:90px"></div>
            <div class="field"><label for="po-${id}">سعر الخروج /M</label>
              <input id="po-${id}" type="number" step="0.01" min="0" name="price_out"
                     value="${p.priceOut ?? ''}" style="width:90px"></div>
            <div class="field"><label for="dc-${id}">سقفه اليوميّ ($)</label>
              <input id="dc-${id}" type="number" step="0.5" min="0" max="100" name="daily_cap"
                     value="${p.dailyCap ?? ''}" placeholder="عامّ" style="width:90px"></div>
            <button class="g sm" type="submit" style="align-self:flex-end">حفظ</button>
          </form>
        </details>
      </div>
    </div>`
  }).join('')

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
      note: 'أرخصُهم للنصّ العربيّ الطويل، ويلزمه رصيدٌ مدفوعٌ مسبقا.',
    },
    {
      name: 'openai', label: 'OpenAI',
      url: 'https://api.openai.com/v1', model: 'gpt-4o',
      keyFrom: 'platform.openai.com ← API keys ← Create new secret key',
      note: 'المفتاحُ يُعرَض مرّةً واحدةً عند إنشائه ولا يُقرأ بعدها.',
    },
    {
      name: 'groq', label: 'Groq',
      url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile',
      keyFrom: 'console.groq.com ← API Keys',
      note: 'أسرعُهم استجابةً، وحدُّه اليوميّ ضيّقٌ في الطبقة المجّانيّة.',
    },
    {
      name: 'mistral', label: 'Mistral',
      url: 'https://api.mistral.ai/v1', model: 'mistral-large-latest',
      keyFrom: 'console.mistral.ai ← API Keys',
      note: 'يلزم تفعيلُ الحساب بالدفع قبل أن يعمل المفتاح.',
    },
    {
      name: 'openrouter', label: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o',
      keyFrom: 'openrouter.ai/keys',
      note: 'وهو الوحيدُ الذي يعطي السعرَ في فهرسه — فيُملأ حقلا السعر وحدَهما بضغطة «حدّث».',
    },
    {
      name: 'xai', label: 'xAI',
      url: 'https://api.x.ai/v1', model: 'grok-2-latest',
      keyFrom: 'console.x.ai ← API Keys',
      note: 'حسابُ xAI غيرُ حساب X — ومفتاحُ النشر لا يصلح هنا.',
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
      note: 'الصلاحيّة المطلوبة: Account · Workers AI · Read — ولا تكفي صلاحيّةُ AI Gateway وحدَها.',
    },
  ]

  const presetChips = PRESETS.map((preset) =>
    `<button type="button" class="g sm preset" data-name="${escapeHtml(preset.name)}"
       data-label="${escapeHtml(preset.label)}" data-url="${escapeHtml(preset.url)}"
       data-model="${escapeHtml(preset.model)}">${escapeHtml(preset.label)}</button>`,
  ).join('')

  const presetRows = PRESETS.map((preset) =>
    `<tr>
       <td><div class="nm">${escapeHtml(preset.label)}</div>
           <div class="sub" style="margin:0">${escapeHtml(preset.note)}</div></td>
       <td class="mono" style="font-size:var(--t-xs);direction:ltr">${escapeHtml(preset.keyFrom)}</td>
     </tr>`,
  ).join('')

  const add = `<div class="card">
    <h2>أضف مزوّدا</h2>
    <p class="hint">أيّ مزوّدٍ يتكلّم لهجة <span class="mono">chat/completions</span> — وهي ما يتكلّمه أكثرهم.
      ولا يلزم نشرٌ ولا شيفرة: أربعُ خطواتٍ من هذه الشاشة.</p>

    <ol class="steps">
      <li><span class="n">١</span><span class="body">
        <span class="what">اضغط رقاقةَ المزوّد</span>
        <span class="why">يُملأ الاسمُ والعنوانُ ونموذجٌ أوّليّ. ومزوّدٌ ليس في الرقائق
          يُكتب عنوانُه يدويّا — وينتهي بـ <span class="mono">/v1</span> عند أكثرهم.</span></span></li>
      <li><span class="n">٢</span><span class="body">
        <span class="what">اضغط «أضف»</span>
        <span class="why">يُحفَظ المزوّد بلا مفتاح. <b>والعنوانُ يُفحَص هنا</b>:
          https وحدها، ولا عناوين داخليّة، ولا قالبٌ لم يُملأ — خطأٌ مطبعيّ في المضيف
          يرسل مفتاحَك إلى حيث لا تريد.</span></span></li>
      <li><span class="n">٣</span><span class="body">
        <span class="what">ضع المفتاح في بطاقته</span>
        <span class="why">يُشفَّر في الخزانة، ولا يُعرَض بعدها إلّا أوّلُه وآخرُه.
          والجدولُ في آخر هذه البطاقة يقول من أين يُؤخَذ مفتاحُ كلٍّ منهم.</span></span></li>
      <li><span class="n">٤</span><span class="body">
        <span class="what">اضغط «اختبر» ثمّ «حدّث»</span>
        <span class="why">الأوّلُ يقول أيعمل المفتاح، والثاني <b>يجلب قائمةَ نماذجه الآن</b>
          فتختار منها بدل أن تكتب اسما. وما سُحب من عندهم لا يظهر، وما نزل أمسِ يظهر.</span></span></li>
    </ol>

    <div class="row" style="margin:var(--s-3) 0">${presetChips}</div>

    ${d.cfAccountId === null
      ? `<div class="outcome warn"><span class="k">Cloudflare</span><span class="v">
          عنوانُه يحمل <b>معرّفَ حسابك</b> في المسار، و<span class="mono">CF_AI_ACCOUNT_ID</span>
          غيرُ مضبوطٍ في هذه البيئة — <b>فالقالبُ يبقى ظاهرا ولن يُحفَظ</b>.
          اضبطه في <span class="mono">wrangler.toml</span> ليُملأ وحده.</span></div>`
      : `<div class="outcome ok"><span class="k">Cloudflare</span><span class="v">
          العنوانُ يحمل معرّفَ حسابك وقد مُلئ وحده. <b>وهو يكفي للثلاثة</b>:
          النصُّ يُنادى عليه، و<b>الصورةُ والفهرسُ يُشتقّان منه</b>
          (<span class="mono">/ai/run</span> و <span class="mono">/ai/models/search</span>)
          — فلا تُدخِل عنوانا ثانيا.</span></div>`}

    <form method="POST" action="/panel/providers/add" id="add-provider"
          data-confirm="سيُرسَل مفتاحك ونصّ مستنداتك إلى هذا العنوان. أتؤكّد؟">
      <div class="row">
        <div class="field"><label for="np">الاسم (لاتينيّ)</label>
          <input id="np" name="name" required placeholder="deepseek" style="width:140px;direction:ltr"></div>
        <div class="field"><label for="nl">الاسم المعروض</label>
          <input id="nl" name="label" placeholder="DeepSeek" style="width:140px"></div>
        <div class="field" style="flex:1;min-width:220px"><label for="nu">العنوان (https)</label>
          <input id="nu" name="base_url" required placeholder="https://api.deepseek.com/v1"
                 style="width:100%;direction:ltr"></div>
      </div>
      <div class="row" style="margin-top:var(--s-2)">
        <div class="field"><label for="nm">النموذج (مبدئيّ)</label>
          <input id="nm" name="model" placeholder="deepseek-chat" style="width:170px;direction:ltr"></div>
        <div class="field"><label for="ni">سعر الدخول /M</label>
          <input id="ni" type="number" step="0.01" min="0" name="price_in" style="width:100px"></div>
        <div class="field"><label for="no">سعر الخروج /M</label>
          <input id="no" type="number" step="0.01" min="0" name="price_out" style="width:100px"></div>
        <button class="p" type="submit" style="align-self:flex-end">أضف</button>
      </div>
    </form>
    <div class="sub" style="margin-top:var(--s-2)">النموذجُ هنا مبدئيٌّ ويُبدَّل من بطاقته
      بعد الحفظ — <b>هناك دَرَجٌ يُملأ من عند المزوّد</b>، ولا يُطلَب منك أن تكتبه ثانية.
      والفهرسُ لا يُجلَب قبل حفظ المفتاح: هو نداءٌ باسمك عندهم.</div>

    <details style="margin-top:var(--s-3)">
      <summary style="cursor:pointer;font-size:var(--t-sm);color:var(--ink-3)">من أين مفتاحُ كلّ مزوّد؟</summary>
      <div class="scroll" style="margin-top:var(--s-2)"><table>
        <thead><tr><th>المزوّد</th><th>موضعُ المفتاح عندهم</th></tr></thead>
        <tbody>${presetRows}</tbody></table></div>
      <div class="sub">والمفتاحُ يُلصَق في بطاقة المزوّد أعلاه، لا هنا.
        وسرُّ Worker — إن وُضع — يغلب المحفوظ دائما.</div>
    </details>
  </div>`

  const providerOptions = (selected: string): string =>
    d.knownProviders
      .map((p) => `<option value="${escapeHtml(p.name)}"${p.name === selected ? ' selected' : ''}>${escapeHtml(p.label)}</option>`)
      .join('')

  const routing = d.routing.map((r) => `<tr>
      <td><div class="nm">${escapeHtml(TASK_LABEL[r.task] ?? r.task)}</div>
          <div class="sub">${escapeHtml(r.why)}</div></td>
      <td>
        <form class="row" method="POST" action="/panel/routes" style="gap:var(--s-2)">
          <input type="hidden" name="task" value="${escapeHtml(r.task)}">
          <select name="provider" class="mp-provider" style="width:130px">${providerOptions(r.provider)}</select>
          ${modelPicker({
            id: `rm-${r.task}`,
            provider: r.provider,
            current: r.model,
            ...(r.task === 'image' ? { task: 'image' as const } : { task: 'text' as const }),
            width: '190px',
          })}
          <button class="g sm" type="submit">حفظ</button>
        </form>
      </td>
      <td>${r.ready
        ? '<span class="st ok"><span class="g">●</span>جاهز</span>'
        : r.implemented
          ? '<span class="st bad"><span class="g">✕</span>مزوّده غير جاهز</span>'
          : '<span class="st idle"><span class="g">○</span>لم تُبنَ</span>'}</td></tr>`).join('')

  return { cards, add, routing }
}
