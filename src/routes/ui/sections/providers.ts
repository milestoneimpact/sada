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
            <div class="field"><label for="m-${id}">النموذج</label>
              <input id="m-${id}" name="model" value="${escapeHtml(p.model ?? '')}" style="width:150px;direction:ltr"></div>
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

  /** نماذجُ جاهزة تملأ العنوان — والقيم في `data` لا في JS محقون. */
  const PRESETS: readonly { name: string; label: string; url: string; model: string }[] = [
    { name: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { name: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o' },
    { name: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    { name: 'mistral', label: 'Mistral', url: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
    { name: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
    { name: 'xai', label: 'xAI', url: 'https://api.x.ai/v1', model: 'grok-2-latest' },
    /**
     * **Cloudflare — والعنوانُ وحده هو الذي يختلف.**
     *
     * Workers AI يتكلّم لهجة `chat/completions` مثلَ الباقين
     * (D-031: سائقٌ لكلّ لهجة لا لكلّ شركة) — **لكنّ معرّفَ حسابك في
     * المسار**، لا في ترويسةٍ ولا في جسد. فعنوانٌ عامٌّ لا يعمل، وهذا
     * سببُ غيابه عن القائمة حتّى الآن.
     *
     * ويُملأ المعرّفُ من `CF_AI_ACCOUNT_ID` إن كان مضبوطا — **اللوحةُ
     * تعرفه، فلا يُطلَب من المالك أن يبحث عنه**. وإن لم يكن، بقي
     * القالبُ ظاهرا، **وحارسُ العنوان يردّ حفظَه** فلا يُرسَل المفتاح
     * إلى مسارٍ لا وجودَ له.
     */
    {
      name: 'cloudflare',
      label: 'Cloudflare',
      url:
        'https://api.cloudflare.com/client/v4/accounts/' +
        (d.cfAccountId === null ? '{ACCOUNT_ID}' : d.cfAccountId) +
        '/ai/v1',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    },
  ]

  const presetChips = PRESETS.map((preset) =>
    `<button type="button" class="g sm preset" data-name="${escapeHtml(preset.name)}"
       data-label="${escapeHtml(preset.label)}" data-url="${escapeHtml(preset.url)}"
       data-model="${escapeHtml(preset.model)}">${escapeHtml(preset.label)}</button>`,
  ).join('')

  const add = `<div class="card">
    <h2>أضف مزوّدا</h2>
    <p class="hint">أيّ مزوّدٍ يتكلّم لهجة <span class="mono">chat/completions</span> — وهي ما يتكلّمه أكثرهم.</p>
    <div class="row" style="margin-bottom:var(--s-3)">${presetChips}</div>
    ${d.cfAccountId === null
      ? `<div class="outcome warn"><span class="k">Cloudflare</span><span class="v">
          عنوانُه يحمل <b>معرّفَ حسابك</b> في المسار، و<span class="mono">CF_AI_ACCOUNT_ID</span>
          غيرُ مضبوطٍ في هذه البيئة — <b>فالقالبُ يبقى ظاهرا ولن يُحفَظ</b>.
          اضبطه في <span class="mono">wrangler.toml</span> ليُملأ وحده.
          <b>والمفتاحُ</b> رمزُ Cloudflare بصلاحيّة
          <span class="mono">Workers AI · Read</span>.</span></div>`
      : `<div class="sub" style="margin-bottom:var(--s-3)"><b>Cloudflare</b>:
          العنوانُ يحمل معرّفَ حسابك وقد مُلئ وحده.
          <b>والمفتاحُ</b> رمزُ Cloudflare بصلاحيّة
          <span class="mono">Workers AI · Read</span> — لا مفتاحَ مزوّدٍ آخر.</div>`}
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
        <div class="field"><label for="nm">النموذج</label>
          <input id="nm" name="model" placeholder="deepseek-chat" style="width:170px;direction:ltr"></div>
        <div class="field"><label for="ni">سعر الدخول /M</label>
          <input id="ni" type="number" step="0.01" min="0" name="price_in" style="width:100px"></div>
        <div class="field"><label for="no">سعر الخروج /M</label>
          <input id="no" type="number" step="0.01" min="0" name="price_out" style="width:100px"></div>
        <button class="p" type="submit" style="align-self:flex-end">أضف</button>
      </div>
    </form>
    <div class="sub" style="margin-top:var(--s-2)">العنوان يُفحص قبل الحفظ: <b>https</b> وحدها،
      ولا عناوين داخليّة — خطأٌ مطبعيّ في المضيف يرسل مفتاحك إلى حيث لا تريد.</div>
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
          <select name="provider" style="width:130px">${providerOptions(r.provider)}</select>
          <input name="model" value="${escapeHtml(r.model)}" style="width:160px;direction:ltr" required>
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
