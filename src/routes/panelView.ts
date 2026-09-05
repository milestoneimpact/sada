/**
 * صفحة اللوحة — HTML خالص يخدمه Worker.
 *
 * بلا إطار ولا خطوة بناء: الحزمة الآن ١٢٤ كيلوبايت، وإطارُ واجهةٍ
 * يضاعفها لأجل ستّ شاشات. وصفحةٌ واحدة تُقرأ كاملةً أسهل مراجعةً من
 * شجرة مكوّنات.
 *
 * **قاعدةٌ ملزمة:** لا زرَّ هنا إلا وله قيدٌ مقابلٌ مُختبَر في الخادم.
 * وما لم يُبنَ يُعرض **بحاله الصريحة** لا كجدولٍ فارغ يُظنّ عطلا.
 *
 * والبيانات تُحقَن كـ JSON في وسمٍ منفصل لا في نصّ JS: `</script>` داخل
 * اسم ملفٍّ يكسر الصفحة، و`JSON.parse` من `<script type="application/json">`
 * لا يُنفّذ شيئا.
 */

/** يهرب ما يُدرَج في HTML. اسمُ ملفٍّ من Drive نصٌّ لا نثق به. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** يهرب `<` داخل JSON المحقون، فلا يُغلق الوسم من داخل البيانات. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

const STYLE = `
:root{
  --bg:#0b0f14; --surface:#111823; --surface-2:#16202e; --line:#22303f;
  --ink:#e8eef6; --ink-dim:#95a6b8; --ink-faint:#6b7f94;
  --accent:#c9a227; --accent-ink:#0b0f14;
  --ok:#3fb27f; --warn:#d9a441; --bad:#d95c5c; --idle:#5b6b7d;
  --radius:14px;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--ink); direction:rtl;
  font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px; line-height:1.7; letter-spacing:0;
}
a{color:var(--accent)}
.wrap{max-width:1120px; margin:0 auto; padding:28px 20px 72px}

header.top{display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:8px}
.brand{font-size:28px; font-weight:700; letter-spacing:-.5px}
.brand span{color:var(--accent)}
.sub{color:var(--ink-faint); font-size:13px}
.grow{flex:1}

.state{
  display:inline-flex; align-items:center; gap:8px; padding:7px 14px;
  border-radius:999px; font-size:13px; font-weight:600; border:1px solid var(--line);
}
.dot{width:8px; height:8px; border-radius:50%; background:var(--idle)}
.state.live{color:var(--ok); border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
.state.live .dot{background:var(--ok); box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 18%,transparent)}
.state.halted{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
.state.halted .dot{background:var(--warn)}

.grid{display:grid; gap:16px; margin-top:22px}
.cols-4{grid-template-columns:repeat(4,1fr)}
.cols-2{grid-template-columns:repeat(2,1fr)}
@media(max-width:860px){.cols-4{grid-template-columns:repeat(2,1fr)} .cols-2{grid-template-columns:1fr}}
@media(max-width:520px){.cols-4{grid-template-columns:1fr}}

.card{background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:18px}
.card h2{margin:0 0 14px; font-size:15px; font-weight:600; color:var(--ink-dim); letter-spacing:.3px}

.metric .label{color:var(--ink-faint); font-size:12px; margin-bottom:6px}
.metric .value{font-size:30px; font-weight:700; line-height:1.15; font-variant-numeric:tabular-nums}
.metric .note{color:var(--ink-faint); font-size:12px; margin-top:6px}

.meter{height:6px; background:var(--surface-2); border-radius:99px; overflow:hidden; margin-top:10px}
.meter i{display:block; height:100%; background:var(--accent); border-radius:99px}
.meter i.hot{background:var(--warn)} .meter i.full{background:var(--bad)}

table{width:100%; border-collapse:collapse; font-size:14px}
th{text-align:right; color:var(--ink-faint); font-weight:600; font-size:12px; padding:0 10px 10px; border-bottom:1px solid var(--line)}
td{padding:12px 10px; border-bottom:1px solid var(--surface-2); vertical-align:top}
tr:last-child td{border-bottom:0}
.name{font-weight:600}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; color:var(--ink-faint); direction:ltr; display:inline-block}

.tag{display:inline-block; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:600; border:1px solid transparent; white-space:nowrap}
.tag.ok{color:var(--ok); background:color-mix(in srgb,var(--ok) 12%,transparent); border-color:color-mix(in srgb,var(--ok) 30%,transparent)}
.tag.warn{color:var(--warn); background:color-mix(in srgb,var(--warn) 12%,transparent); border-color:color-mix(in srgb,var(--warn) 30%,transparent)}
.tag.bad{color:var(--bad); background:color-mix(in srgb,var(--bad) 12%,transparent); border-color:color-mix(in srgb,var(--bad) 30%,transparent)}
.tag.idle{color:var(--ink-faint); background:var(--surface-2); border-color:var(--line)}

.worth{display:flex; align-items:center; gap:9px; min-width:96px}
.worth .bar{flex:1; height:5px; background:var(--surface-2); border-radius:99px; overflow:hidden}
.worth .bar i{display:block; height:100%; border-radius:99px}
.worth .num{font-variant-numeric:tabular-nums; font-size:12px; color:var(--ink-dim); min-width:30px}
.reason{color:var(--ink-faint); font-size:12px; margin-top:5px; max-width:52ch}

.empty{padding:26px; text-align:center; color:var(--ink-faint); font-size:13px;
  border:1px dashed var(--line); border-radius:10px; background:var(--surface-2)}
.empty b{display:block; color:var(--ink-dim); font-size:14px; margin-bottom:6px}

form.row{display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-top:6px}
label{display:block; font-size:12px; color:var(--ink-faint); margin-bottom:6px}
input[type=number],input[type=password]{
  background:var(--bg); border:1px solid var(--line); border-radius:9px;
  color:var(--ink); padding:10px 12px; font:inherit; font-size:14px; width:130px;
}
input:focus{outline:2px solid color-mix(in srgb,var(--accent) 55%,transparent); outline-offset:1px}
button{
  background:var(--accent); color:var(--accent-ink); border:0; border-radius:9px;
  padding:10px 18px; font:inherit; font-weight:700; cursor:pointer;
}
button.ghost{background:transparent; color:var(--ink-dim); border:1px solid var(--line)}
button.danger{background:var(--bad); color:#fff}
button:hover{filter:brightness(1.08)}

.halt{display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap}
.halt p{margin:0; color:var(--ink-faint); font-size:12px; max-width:56ch}

.login{max-width:400px; margin:14vh auto; text-align:center}
.login .card{text-align:right}
.login input{width:100%; margin-bottom:12px; direction:ltr; text-align:left}
.login button{width:100%}
.err{color:var(--bad); font-size:13px; margin-bottom:12px}
footer{margin-top:34px; color:var(--ink-faint); font-size:12px; text-align:center}
`

function shell(title: string, body: string, extra = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body><div class="wrap">${body}</div>${extra}</body></html>`
}

export function loginPage(error?: string): string {
  return shell(
    'صدى — الدخول',
    `<div class="login">
      <div class="brand" style="margin-bottom:20px">صــ<span>دى</span></div>
      <div class="card">
        <h2>رمز الإدارة</h2>
        ${error === undefined ? '' : `<div class="err">${escapeHtml(error)}</div>`}
        <form method="POST" action="/panel/login">
          <input type="password" name="token" autocomplete="current-password"
                 placeholder="ADMIN_TOKEN" required autofocus>
          <button type="submit">دخول</button>
        </form>
      </div>
      <footer>الجلسة ثماني ساعات، ثمّ يُعاد الدخول.</footer>
    </div>`,
  )
}

// ── الصفحة الرئيسة ──────────────────────────────────────────────────

export interface PanelSource {
  readonly id: string
  readonly driveFileId: string
  readonly name: string
  readonly mime: string
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
  readonly configured: boolean
  readonly secretName: string
  readonly howToGet: string
  readonly calls: number
  readonly spend: number
}

export interface PanelData {
  readonly paused: boolean
  readonly analysisCap: number
  readonly spendCap: number
  readonly usedAnalyses: number
  readonly usedSpend: number
  readonly spend30d: number
  readonly sources: PanelSource[]
  readonly providers: PanelProvider[]
  readonly routing: { task: string; model: string; why: string; ready: boolean; implemented: boolean }[]
  readonly postsBuilt: boolean
}

function money(value: number): string {
  return `${value.toFixed(value < 1 ? 4 : 2)}$`
}

/** نسبةٌ محصورة بين ٠ و ١٠٠، وسقفُ صفرٍ يُعدّ ممتلئا لا مقسوما على صفر. */
function pct(used: number, cap: number): number {
  if (cap <= 0) return 100
  return Math.min(100, Math.round((used / cap) * 100))
}

function meter(used: number, cap: number): string {
  const p = pct(used, cap)
  const cls = p >= 100 ? 'full' : p >= 70 ? 'hot' : ''
  return `<div class="meter"><i class="${cls}" style="width:${p}%"></i></div>`
}

function worthCell(worth: number | null): string {
  if (worth === null) return '<span class="tag idle">لم يُحلَّل</span>'
  const p = Math.round(worth * 100)
  const color = worth >= 0.6 ? 'var(--ok)' : worth >= 0.4 ? 'var(--warn)' : 'var(--bad)'
  return `<div class="worth">
    <div class="bar"><i style="width:${p}%;background:${color}"></i></div>
    <div class="num">${worth.toFixed(2)}</div>
  </div>`
}

function sourceRow(s: PanelSource): string {
  const status = s.stale
    ? '<span class="tag warn">تغيّر بعد التحليل</span>'
    : s.analyzed
      ? '<span class="tag ok">محلَّل</span>'
      : '<span class="tag idle">ينتظر</span>'
  const themes = s.themes.slice(0, 4).map((t) => `<span class="tag idle">${escapeHtml(t)}</span>`).join(' ')
  const detail = s.summary === null
    ? ''
    : `<div class="reason">${escapeHtml(s.summary)}</div>` +
      (s.reason === null ? '' : `<div class="reason">— ${escapeHtml(s.reason)}</div>`) +
      (themes.length === 0 ? '' : `<div style="margin-top:7px">${themes}</div>`)

  return `<tr>
    <td><div class="name">${escapeHtml(s.name)}</div>
        <div class="mono">${escapeHtml(s.driveFileId)}</div>${detail}</td>
    <td>${status}</td>
    <td>${worthCell(s.worth)}</td>
    <td class="mono">${escapeHtml(s.lastSeenAt)}</td>
  </tr>`
}

function providerRow(p: PanelProvider): string {
  const tag = p.configured
    ? '<span class="tag ok">مضبوط</span>'
    : '<span class="tag bad">مفتاحه ناقص</span>'
  const hint = p.configured
    ? ''
    : `<div class="reason"><span class="mono">${escapeHtml(p.secretName)}</span> — ${escapeHtml(p.howToGet)}</div>`
  return `<tr>
    <td><div class="name">${escapeHtml(p.label)}</div>${hint}</td>
    <td>${tag}</td>
    <td class="mono">${p.calls}</td>
    <td class="mono">${money(p.spend)}</td>
  </tr>`
}

export function panelPage(data: PanelData): string {
  const pending = data.sources.filter((s) => !s.analyzed || s.stale).length
  const analyzed = data.sources.filter((s) => s.analyzed && !s.stale).length

  const state = data.paused
    ? '<span class="state halted"><i class="dot"></i> موقوف مؤقتا</span>'
    : '<span class="state live"><i class="dot"></i> يعمل</span>'

  const sourcesBody = data.sources.length === 0
    ? `<div class="empty"><b>لا مصادر بعد</b>شغّل المسح ليقرأ صدى مجلد Drive.</div>`
    : `<table><thead><tr><th>المصدر</th><th>الحال</th><th>الاستحقاق</th><th>آخر مسح</th></tr></thead>
       <tbody>${data.sources.map(sourceRow).join('')}</tbody></table>`

  const postsBody = data.postsBuilt
    ? '<div class="empty">لا منشورات بعد.</div>'
    : `<div class="empty"><b>طبقة الكتابة لم تُبنَ بعد</b>
        الجدول قائم بقيوده — ولا يُنشر منشورٌ بلا موافقةٍ مسجّلة (D-009).
        وحين تُبنى، يظهر هنا نصُّ كلّ منشور ومنصّته وتاريخ نشره وحالته.</div>`

  const routingBody = data.routing.map((r) => {
    const tag = r.ready
      ? '<span class="tag ok">جاهز</span>'
      : r.implemented
        ? '<span class="tag bad">مفتاحه ناقص</span>'
        : '<span class="tag idle">لم تُبنَ</span>'
    return `<tr><td><div class="name">${escapeHtml(r.task)}</div>
      <div class="reason">${escapeHtml(r.why)}</div></td>
      <td class="mono">${escapeHtml(r.model)}</td><td>${tag}</td></tr>`
  }).join('')

  const body = `
<header class="top">
  <div><div class="brand">صــ<span>دى</span></div>
       <div class="sub">لوحة التحكّم — staging</div></div>
  <div class="grow"></div>
  ${state}
  <form method="POST" action="/panel/logout" style="margin:0">
    <button class="ghost" type="submit">خروج</button>
  </form>
</header>

<div class="grid cols-4">
  <div class="card metric">
    <div class="label">تحليلات اليوم</div>
    <div class="value">${data.usedAnalyses}<span style="font-size:16px;color:var(--ink-faint)"> / ${data.analysisCap}</span></div>
    ${meter(data.usedAnalyses, data.analysisCap)}
    <div class="note">يُعاد الصفر عند منتصف الليل UTC</div>
  </div>
  <div class="card metric">
    <div class="label">إنفاق اليوم</div>
    <div class="value">${money(data.usedSpend)}<span style="font-size:16px;color:var(--ink-faint)"> / ${money(data.spendCap)}</span></div>
    ${meter(data.usedSpend, data.spendCap)}
    <div class="note">من دفتر الكلفة نفسه</div>
  </div>
  <div class="card metric">
    <div class="label">إنفاق ٣٠ يوما</div>
    <div class="value">${money(data.spend30d)}</div>
    <div class="note">كلّ المزوّدين</div>
  </div>
  <div class="card metric">
    <div class="label">المصادر</div>
    <div class="value">${analyzed}<span style="font-size:16px;color:var(--ink-faint)"> / ${data.sources.length}</span></div>
    <div class="note">${pending === 0 ? 'لا شيء ينتظر' : `${pending} تنتظر تحليلا`}</div>
  </div>
</div>

<div class="grid" style="margin-top:16px">
  <div class="card">
    <h2>التحكّم</h2>
    <div class="halt">
      <p>${data.paused
        ? 'النظام موقوف: لا نداء مدفوع ولا مسح ولا نشر. والقيد في الشيفرة لا في هذه الصفحة.'
        : 'الإيقاف يمنع كلّ نداء مدفوع فورا — قبل أن يُلمس Drive أو Claude.'}</p>
      <form method="POST" action="/panel/settings" style="margin:0">
        <input type="hidden" name="key" value="paused">
        <input type="hidden" name="value" value="${data.paused ? 'false' : 'true'}">
        <button class="${data.paused ? '' : 'danger'}" type="submit">
          ${data.paused ? 'استئناف العمل' : 'إيقاف مؤقت'}
        </button>
      </form>
    </div>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="daily_analysis_cap">
      <div><label for="cap1">سقف التحليل اليوميّ</label>
        <input id="cap1" type="number" name="value" min="0" max="500" step="1" value="${data.analysisCap}"></div>
      <button type="submit">حفظ</button>
    </form>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="daily_spend_cap_usd">
      <div><label for="cap2">سقف الإنفاق اليوميّ (دولار)</label>
        <input id="cap2" type="number" name="value" min="0" max="100" step="0.5" value="${data.spendCap}"></div>
      <button type="submit">حفظ</button>
    </form>
    <div class="reason">سقفان لا واحد: مستندٌ ضخم قد يكلّف أكثر من عشرة صغار.</div>
  </div>
</div>

<div class="grid cols-2" style="margin-top:16px">
  <div class="card">
    <h2>المزوّدون</h2>
    <table><thead><tr><th>المزوّد</th><th>الحال</th><th>نداءات ٣٠ يوما</th><th>الإنفاق</th></tr></thead>
    <tbody>${data.providers.map(providerRow).join('')}</tbody></table>
  </div>
  <div class="card">
    <h2>توجيه المهامّ</h2>
    <table><thead><tr><th>المهمّة</th><th>النموذج</th><th>الحال</th></tr></thead>
    <tbody>${routingBody}</tbody></table>
  </div>
</div>

<div class="grid" style="margin-top:16px">
  <div class="card"><h2>المصادر والتحليل</h2>${sourcesBody}</div>
  <div class="card"><h2>المنشورات وتواريخ النشر</h2>${postsBody}</div>
</div>

<footer>صدى — كلّ زرٍّ هنا يحرسه قيدٌ مُختبَر في الخادم.</footer>`

  return shell('صدى — لوحة التحكّم', body)
}
