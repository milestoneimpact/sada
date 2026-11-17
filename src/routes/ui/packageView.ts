/**
 * شاشة «حزمة المحتوى» (D-366) — الربط، وحال آخر دفعة، و«زامن الآن»، وبطاقة لكلّ مادّة بمقطعها المعتمد وغلافها والنسخ المستبدَلة
 * مطويّة. نماذج بلا سكربت بالعُدّة نفسِها.
 */
import type { PackageMediaRow, PackageSource } from '../../lib/package/sync'
import { pageHead } from './parts'
import { card } from './components/card'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { field } from './components/field'
import { html, raw, type Html } from './html'
import { escapeHtml } from './escape'
import { localWhen } from '../../lib/time/zone'
import { counted, NOUNS } from '../../lib/format'
import type { RevisionRow } from '../../lib/package/revision'
import { fixFor, type AccessProbe } from '../../lib/package/diagnose'
import { historyMenu, revisionBadge, short as shortSha } from './packageChangesView'

export interface PackageScreen {
  readonly source: PackageSource | null
  readonly media: readonly PackageMediaRow[]
  readonly tokenReady: boolean
  /** آخر الدفعات — الأحدث أوّلًا. */
  readonly revisions?: readonly RevisionRow[]
  /** منشورات في الخطّة بلا نصٍّ جاهز («01 · x»). */
  readonly missing?: readonly string[]
  /** عنوان الويب هوك وسرُّه — مرّة واحدة بعد التوليد، ولا يُحفظ في صفحة غيرها. */
  readonly hook?: { readonly url: string; readonly secret: string }
  readonly flash?: { readonly tone: 'ok' | 'warn' | 'bad'; readonly text: string } | null
  /** نتيجة «اختبر الرمز» (D-376) — تُعرض مرّة بعد الضغط ولا تُحفظ. */
  readonly probe?: AccessProbe
  /** المقاطعُ والأغلفةُ المنقولة إلى صدى من كلّ ما في الحزمة — مؤشّرُ التقدّم. */
  readonly transfer?: { readonly total: number; readonly done: number }
  /** منطقةُ المتصفّح (D-378)، و`null` يعني الرياض. */
  readonly zone?: string | null
}

const short = (sha: string | null): string => (sha === null ? '—' : sha.slice(0, 7))
const label = { dark: 'داكن', light: 'فاتح' } as const

/** مؤشّرُ النقل: «نُقل 12 من 63» بشريطٍ، والصفحةُ تتحدّث وحدها كلَّ ستّ ثوانٍ ما دام النقلُ جاريًا — بلا سكربت. */
function progressLine(s: PackageSource, t: { readonly total: number; readonly done: number } | undefined): Html {
  if (t === undefined || t.total === 0 || (t.done >= t.total && s.status !== 'partial')) return html``
  const live = s.status === 'partial' || (t.done < t.total && s.status !== 'failed')
  return html`<div class="stack pk-prog">
      <p class="m-0">نُقل <b>${String(t.done)}</b> من <b>${String(t.total)}</b> مقطعًا وغلافًا إلى صدى${live ? ' · يُكمل في الخلفيّة' : ''}</p>
      <progress max="${String(t.total)}" value="${String(Math.min(t.done, t.total))}" aria-label="ما نُقل من وسائط الحزمة"></progress>
      ${live ? raw('<meta http-equiv="refresh" content="6">') : ''}</div>`
}

/** وسمُ الحال — في رأس بطاقة «المزامنة» بارزًا (SPEC-v1 §6.6). */
function statusFace(s: PackageSource): string {
  return s.status === 'ok' ? statusBadge('ok', '●', 'متصل')
    : s.status === 'partial' ? statusBadge('warn', '…', 'يُكمل النقل')
      : s.status === 'failed' ? statusBadge('bad', '!', 'تعذّرت المزامنة') : statusBadge('', '○', 'لم يُزامَن بعد')
}

function statusLine(s: PackageSource, zone: string | null): Html {
  return html`<p class="m-0">آخر دفعة <bdi dir="ltr">${short(s.lastCommit)}</bdi>${s.lastCheckedAt === null ? '' : html` · فُحص <bdi>${localWhen(s.lastCheckedAt, zone)}</bdi>`}</p>
    ${s.error === null ? html`` : html`<p class="hint m-0">${s.error}</p>${fixList(fixFor(s.error))}`}`
}

/** خطوات الإصلاح مرقّمة — لا تُرسم إن لم نعرف السبب. */
function fixList(fix: readonly string[]): Html {
  return fix.length === 0 ? html`` : html`<ol class="stack m-0">${fix.map((f) => html`<li>${f}</li>`)}</ol>`
}

const STEP = { repo: 'المستودع', branch: 'الفرع' } as const

/** نتيجة «اختبر الرمز»: أيُّ الخطوتين نجحت، والسبب الدقيق، وخطوات إصلاحه. */
function probeCard(p: AccessProbe): string {
  const ok = p.verdict === 'ok'
  const steps = (['repo', 'branch'] as const).map((k) => html`<li>${p.passed.includes(k) ? raw(statusBadge('ok', '✓', STEP[k] + ': نجح'))
    : raw(statusBadge(p.passed.length === 0 && k === 'branch' ? '' : 'bad', p.passed.length === 0 && k === 'branch' ? '○' : '!', STEP[k] + (p.passed.length === 0 && k === 'branch' ? ': لم يُجرَّب' : ': لم ينجح')))}</li>`)
  return card({ variant: 'alert', tone: ok ? 'ok' : 'warn', title: ok ? 'الرمز يعمل' : 'اختبار الرمز: ما يلزم إصلاحه', level: 2,
    body: html`<ul class="plain">${steps}</ul><p class="m-0">${p.reason}</p>${p.identity === undefined ? html`` : html`<p class="hint m-0">${p.identity}</p>`}${fixList(p.fix)}`.value })
}

function input(id: string, label: string, name: string, value: string, required: boolean): string {
  return field({ id, label, ...(required ? {} : { optional: true }),
    control: '<input name="' + name + '" dir="ltr" value="' + escapeHtml(value) + '"' + (required ? ' required' : '') + '>' })
}

function connectForm(s: PackageSource | null): string {
  const v = (k: 'owner' | 'repo' | 'branch' | 'root', d: string): string => (s === null ? d : s[k])
  return card({ title: s === null ? 'اربط مستودع الحزمة' : 'المستودع', level: 2, body: html`<form method="post" action="/panel/package" class="stack">
    <input type="hidden" name="do" value="connect">
    ${raw(input('pkg-owner', 'صاحب المستودع', 'owner', v('owner', 'mooryali95'), true))}
    ${raw(input('pkg-repo', 'المستودع', 'repo', v('repo', 'MI-private'), true))}
    ${raw(input('pkg-branch', 'الفرع', 'branch', v('branch', 'social-media-video'), true))}
    ${raw(input('pkg-root', 'المجلّد', 'root', v('root', 'social-media'), false))}
    ${raw(button({ label: s === null ? 'اربط' : 'احفظ', variant: s === null ? 'primary' : 'secondary', type: 'submit' }))}
  </form>`.value })
}

function itemCards(media: readonly PackageMediaRow[]): Html {
  const items = [...new Set(media.filter((m) => m.itemNo !== null).map((m) => m.itemNo!))].sort()
  return html`${items.map((item) => {
    const own = media.filter((m) => m.itemNo === item)
    const lines = (['dark', 'light'] as const).map((v) => {
      const video = own.find((m) => m.variant === v && m.kind === 'video' && m.isCurrent)
      const cover = own.find((m) => m.variant === v && m.kind === 'image' && m.isCurrent)
      if (video === undefined && cover === undefined) return html``
      return html`<li>${label[v]}: <bdi dir="ltr">${video?.path.split('/').pop() ?? 'بلا مقطع'}</bdi>
        ${video?.hasSound === true ? raw(statusBadge('ok', '♪', 'بالصوت')) : ''}
        ${video !== undefined && video.r2Key === null ? raw(statusBadge('warn', '…', 'يُنقل')) : ''}
        · الغلاف <bdi dir="ltr">${cover?.path.split('/').pop() ?? '—'}</bdi></li>`
    })
    const old = own.filter((m) => !m.isCurrent)
    return raw(card({ title: 'المادّة ' + item, level: 3, body: html`<ul class="plain">${lines}</ul>
      <p class="hint m-0">لـ X ولـ LinkedIn الغلاف باللون المختار في الإعدادات — والمقطع جاهز ولم تُفتح المنصّتان له بعد.</p>
      ${old.length === 0 ? html`` : html`<details><summary>${String(old.length)} نسخة مستبدَلة</summary><ul class="plain">${old.map((m) =>
        html`<li><bdi dir="ltr">${m.path.split('/').pop() ?? ''}</bdi></li>`)}</ul></details>`}
      ${item === '15' ? html`<p class="hint m-0">${raw(statusBadge('warn', '!', 'قبل النشر'))} يُضاف رابط التسجيل إلى نصّ هذه المادّة.</p>` : html``}`.value }))
  })}`
}

function choice(name: string, label: string, value: 'dark' | 'light'): string {
  const opt = (v: 'dark' | 'light', t: string): string => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + t + '</option>'
  return field({ id: 'pkg-' + name, label, control: '<select name="' + name + '">' + opt('dark', 'داكن') + opt('light', 'فاتح') + '</select>' })
}

/** بطاقة الإعدادات: لون كلّ منصّة، وما تفعله صدى عند كلّ دفع — بلغة المالك. */
function settingsCard(s: PackageSource): string {
  return card({ title: 'إعدادات الحزمة', level: 2, body: html`<form method="post" action="/panel/package" class="stack">
    <input type="hidden" name="do" value="settings">
    ${raw(choice('x_variant', 'لون X', s.variants.x))}
    ${raw(choice('linkedin_variant', 'لون LinkedIn', s.variants.linkedin))}
    <ul class="plain">
      <li>${raw(statusBadge('ok', '✓', 'المسوّدة'))} تُحدَّث وحدها عند كلّ دفع.</li>
      <li>${raw(statusBadge('warn', '!', 'المعتمد والمجدول'))} لا يتغيّر إلا بقرارك في «ما تغيّر في حزمتك».</li>
      <li>${raw(statusBadge('', '■', 'المنشور'))} لا يتغيّر أبدًا.</li>
      <li>${raw(statusBadge('', '✎', 'نصٌّ عدّلتِه بيدك'))} لا يُستبدل بصمت.</li>
    </ul>
    ${raw(button({ label: 'احفظ الإعدادات', type: 'submit' }))}
  </form>`.value })
}

function revisionsCard(revs: readonly RevisionRow[], missing: readonly string[], zone: string | null): string {
  const last = revs[0]
  const waiting = revs.reduce((n, r) => n + r.counts.awaiting, 0)
  // ‏الزرُّ إلى الدفعة التي فيها القرار — قد تكون أقدم من الأخيرة
  const target = revs.find((r) => r.counts.awaiting > 0) ?? last
  const body = last === undefined
    ? html`<p class="m-0">لم تُقرأ دفعة بعد. اضغط «زامن الآن» فتُبنى الخطّة من الحزمة: النصُّ الجاهز كما هو، والفيديو أو الغلاف لكلّ منشور.</p>`
    : html`<p class="m-0">آخر دفعة <bdi dir="ltr">${shortSha(last.commit)}</bdi> ${raw(revisionBadge(last))}${last.message === '' ? '' : ' · ' + last.message}</p>
      ${waiting === 0 ? html`` : html`<p class="m-0">${raw(statusBadge('warn', '!', 'ينتظر قرارك ' + counted(waiting, NOUNS.update)))}</p>`}
      <div class="pk-acts">${raw(button({ label: 'ما تغيّر في حزمتك', variant: waiting > 0 ? 'primary' : 'secondary', href: '/panel/package/changes/' + (target ?? last).id }))}${raw(historyMenu(revs.slice(1), zone))}</div>`
  const write = missing.length === 0 ? html`` : html`<form method="post" action="/panel/package" class="stack">
    <input type="hidden" name="do" value="write">
    <p class="m-0">${counted(missing.length, NOUNS.post)} بلا نصٍّ جاهز (<bdi dir="ltr">${missing.join('، ')}</bdi>) — يُكتب من فكرته وفق الإرشادات، وترى العدد قبل الكتابة.</p>
    ${raw(button({ label: 'اكتب الناقص من أفكارها', type: 'submit' }))}</form>`
  return card({ title: 'الخطّة من الحزمة', level: 2, body: html`${body}${write}`.value })
}

export function packageScreen(m: PackageScreen): string {
  const s = m.source
  const current = m.media.filter((x) => x.isCurrent && x.kind === 'video').length
  const head = pageHead('المكتبة', 'حزمة المحتوى', s === null
    ? 'مستودعك هو المصدر، وصدى تنفّذ: تقرأ المقاطع والأغلفة من الفرع عند كلّ دفع.'
    : String(current) + ' مقطعًا معتمدًا من <bdi dir="ltr">' + escapeHtml(s.owner + '/' + s.repo + '@' + s.branch) + '</bdi>')
  const flash = m.flash === undefined || m.flash === null ? html`` : html`<p class="m-0">${raw(statusBadge(m.flash.tone, m.flash.tone === 'ok' ? '✓' : '!', m.flash.text))}</p>`
  const token = m.tokenReady ? html`` : raw(card({ variant: 'alert', tone: 'warn', title: 'ينقص رمز القراءة', level: 2,
    body: html`<p class="m-0">صدى لا تقرأ المستودع الخاصّ بلا رمز قراءة. خطواتُه في «ما عليك».</p>`.value }))
  const hook = m.hook === undefined ? html`` : raw(card({ variant: 'alert', tone: 'ok', title: 'انسخ هذين الآن — لا يُعرضان ثانية', level: 2,
    body: html`<p class="m-0">Payload URL: <code dir="ltr">${m.hook.url}</code></p><p class="m-0">Secret: <code dir="ltr">${m.hook.secret}</code></p>`.value }))
  // ‏صفُّ الأفعال بعرضٍ متساوٍ: الأوّليّ ثمّ الثانويّان، والفصلُ وحده في التذييل بخطرٍ هادئ (SPEC-v1 §6.6)
  const act = (verb: string, b: string): Html => html`<form method="post" action="/panel/package"><input type="hidden" name="do" value="${verb}">${raw(b)}</form>`
  const acts = s === null ? [] : [
    act('sync', button({ label: 'زامن الآن', variant: 'primary', type: 'submit' })),
    act('test', button({ label: 'اختبر الرمز', type: 'submit' })),
    act('hook', button({ label: s.hasHook ? 'أعد توليد سرّ التحديث الفوري' : 'اربط التحديث الفوري', type: 'submit' })),
    act('disconnect', button({ label: 'افصل المستودع', variant: 'danger', type: 'submit' })),
  ]
  const actions = s === null ? html`` : raw(card({ title: 'المزامنة', level: 2, action: statusFace(s), body: html`${statusLine(s, m.zone ?? null)}${progressLine(s, m.transfer)}
    <div class="pk-sync">${acts.slice(0, 3)}</div>
    <p class="hint m-0">قراءتان مجّانيّتان: المستودع ثمّ الفرع.</p>
    <div class="pk-foot">${acts[3]}</div>`.value }))
  const probe = m.probe === undefined ? html`` : raw(probeCard(m.probe))
  return html`${raw(head)}<div class="stack">${flash}${probe}${hook}${token}${actions}${s === null ? '' : raw(revisionsCard(m.revisions ?? [], m.missing ?? [], m.zone ?? null))}${s === null ? '' : raw(settingsCard(s))}${raw(connectForm(s))}${itemCards(m.media)}</div>`.value
}
