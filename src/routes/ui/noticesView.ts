/**
 * شاشةُ **الإشعارات** (D-294 · D-352): ما يحتاج يدَك ولم تره، ثمّ ما قرأته. كلُّ سطرٍ من صفٍّ في القاعدة
 * (`lib/notices.ts`)، وبجانبه فعلُه. و«علّمها مقروءةً» تُطفئ العدّادَ في الترويسة، ولا تمحو السبب:
 * منشورٌ فاشل يبقى في المنشورات حتّى يُصلَح.
 *
 * D-352 (رونق): رأسٌ بنقش الصدى وثلاثة أرقام (عاجل · تنبيه · مقروء)، وكلُّ سطرٍ بطاقةٌ بأيقونة نوعه واسمِه،
 * وشريطِ نبرته، وفعلٍ واحدٍ ظاهر. الفراغُ لحظةُ طمأنينة لا سطرٌ رماديّ.
 */
import { html, raw, type Html } from './html'
import { relativeTime } from '../../lib/format'
import type { Notice, NoticeKind, NoticeRead } from '../../lib/notices'
import { ICON } from './icons'
import { button } from './components/button'
import { cardClass } from './components/card'
import { echo } from './echo'

export interface NoticesScreenData {
  readonly notices: readonly Notice[]
  readonly reads: readonly NoticeRead[]
  readonly now: Date
}

/** اسمُ النوع كما يعرفه المالك، وأيقونتُه من قسمه. */
const KIND: Readonly<Record<NoticeKind, { readonly label: string; readonly icon: string }>> = {
  publish: { label: 'نشر', icon: ICON.posts },
  reauth: { label: 'ربط حساب', icon: ICON.channels },
  token: { label: 'صلاحيّة الربط', icon: ICON.channels },
  quota: { label: 'حصّة', icon: ICON.report },
  budget: { label: 'ميزانيّة', icon: ICON.report },
  pulse: { label: 'نبض', icon: ICON.overview },
  security: { label: 'أمان', icon: ICON.account },
  provider: { label: 'مفتاح نموذج', icon: ICON.providers },
  review: { label: 'رأي العميل', icon: ICON.plan },
}

function row(n: Notice, read: NoticeRead | undefined, now: Date): Html {
  const k = KIND[n.kind]
  return html`<li class="${cardClass()} nt-row" data-kind="${n.kind}" data-tone="${n.tone}"${read === undefined ? '' : raw(' data-read')}>
    <span class="nt-ico" aria-hidden="true">${raw(k.icon)}</span>
    <span class="nt-body">
      <span class="nt-meta"><span class="nt-kind">${k.label}</span><span class="ago">${relativeTime(n.at, now)}</span></span>
      <span class="nt-text">${n.text}</span>
      ${read === undefined ? html`` : html`<span class="ago">قرأها ${read.byEmail ?? 'أحدٌ'} ${relativeTime(read.readAt, now)}</span>`}
    </span>
    <span class="nt-act">${n.form === undefined ? html`` : html`<form class="inline" method="POST" action="${n.form.action}" data-busy="جار…"><input type="hidden" name="id" value="${n.form.id}">${raw(button({ label: n.form.label, type: 'submit', variant: read === undefined && n.tone === 'bad' ? 'primary' : 'secondary', size: 'sm' }))}</form>`}${raw(button({ label: n.action, href: n.href, variant: read === undefined && n.tone === 'bad' && n.form === undefined ? 'primary' : 'secondary', size: 'sm' }))}</span>
  </li>`
}

export function noticesScreen(d: NoticesScreenData): string {
  const reads = new Map(d.reads.map((r) => [r.ref, r]))
  const unread = d.notices.filter((n) => !reads.has(n.ref))
  const seen = d.notices.filter((n) => reads.has(n.ref))
  const bad = unread.filter((n) => n.tone === 'bad').length
  const lede = unread.length === 0
    ? seen.length === 0
      ? 'لا شيء يحتاج يدَك الآن. ما يفشل أو ينقطع أو ينتظر حصّةً يظهر هنا في دورته.'
      : 'لا جديد. ما قرأته وسببُه قائم محفوظٌ تحت.'
    : 'ما يحتاج يدَك، بالأحدث أوّلًا. والإشعارُ يختفي وحدَه حين يزول سببُه.'
  const refs = unread.map((n) => html`<input type="hidden" name="ref" value="${n.ref}">`)
  return html`<header class="ph-hero">
    <span class="ph-echo" aria-hidden="true">${raw(echo({ width: 1200, height: 360, tone: 'light', crest: 0.2, level: 0.5, scale: 1.1, density: 3, hairline: false, align: 'xMinYMid' }))}</span>
    <span class="ph-eyebrow">ما يحتاج يدَك</span>
    <h1 class="ph-title">الإشعارات</h1>
    <p class="ph-lede m-0">${lede}</p>
    <div class="ph-kpis">
      <div class="ph-kpi"><b>${bad}</b><span>عاجل</span></div>
      <div class="ph-kpi"><b>${unread.length - bad}</b><span>تنبيه</span></div>
      <div class="ph-kpi"><b>${seen.length}</b><span>مقروء وسببُه قائم</span></div>
    </div>
    ${unread.length === 0 ? html`` : html`<div class="ph-acts"><form method="POST" action="/panel/notices/read" class="inline" data-busy="جار…">${refs}
      ${raw(button({ label: 'علّمها مقروءةً', variant: 'secondary', type: 'submit' }))}</form></div>`}
  </header>

  ${unread.length === 0
    ? html`<div class="${cardClass()} nt-calm"><span class="nt-ico" aria-hidden="true">${raw(ICON.bell)}</span>
        <div><h2 class="m-0">كلُّ شيءٍ في مكانه</h2><p class="hint m-0">لا عطلَ ولا انقطاعَ ينتظرك.</p></div></div>`
    : html`<ul class="nt-list">${unread.map((n) => row(n, undefined, d.now))}</ul>`}

  ${seen.length === 0 ? html`` : html`<details class="card">
    <summary><h2>ما قُرئ وسببُه قائم</h2><span class="grow"></span><span class="ago">${seen.length}</span></summary>
    <ul class="nt-list">${seen.map((n) => row(n, reads.get(n.ref), d.now))}</ul>
  </details>`}`.value
}
