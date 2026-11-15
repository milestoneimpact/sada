/**
 * **الفريق** (D-272) — من يدخل صدى، وبأيّ دور، وعلى أيّ شركة. صفحةٌ تُقرأ في ثلاث ثوانٍ: الأعضاءُ صفوفًا (البريد · الدور
 * وما يملكه · الشركات · آخرُ دخول · إلغاء)، ثمّ نموذجُ دعوةٍ بثلاثة حقول.
 *
 * **والبريدُ يصل بعد التحقّق منه عند Cloudflare** (M-33): الصفحةُ تقول ذلك عند الدعوة، ولا تدّعي إرسالًا لم يقع.
 */
import { escapeHtml } from './escape'
import { pageHead } from './parts'
import { notice, toastRegion } from './components/toast'
import { MEMBER_ROLES, ROLE_LABEL, type Member } from '../../lib/team'
import type { OrgRow } from '../../lib/tenancy'
import { OWNER_EMAIL } from '../../lib/ownerEmail'

export interface TeamData {
  readonly members: readonly Member[]
  readonly orgs: readonly OrgRow[]
  readonly flash: { readonly kind: 'ok' | 'warn' | 'bad'; readonly text: string } | null
}

function orgNames(m: Member, orgs: readonly OrgRow[]): string {
  if (m.orgs === '*') return 'كلّ الشركات'
  return m.orgs.map((id) => orgs.find((o) => o.id === id)?.name ?? id).map(escapeHtml).join('، ')
}

export function teamScreen(d: TeamData): string {
  const rows = [
    `<tr><td data-label="البريد"><bdi dir="ltr">${escapeHtml(OWNER_EMAIL)}</bdi></td>
      <td data-label="الدور"><b>${ROLE_LABEL.owner.name}</b><div class="note">${ROLE_LABEL.owner.can}</div></td>
      <td data-label="الشركات">كلّ الشركات</td><td data-label="آخرُ دخول">أنت</td><td></td></tr>`,
    ...d.members.map((m) => `<tr><td data-label="البريد"><bdi dir="ltr">${escapeHtml(m.email)}</bdi></td>
      <td data-label="الدور"><b>${ROLE_LABEL[m.role].name}</b><div class="note">${ROLE_LABEL[m.role].can}</div></td>
      <td data-label="الشركات">${orgNames(m, d.orgs)}</td>
      <td data-label="آخرُ دخول">${m.lastSeenAt === null ? '<span class="ago">لم يدخل بعد</span>' : `<bdi dir="ltr">${escapeHtml(m.lastSeenAt.slice(0, 16))}</bdi>`}</td>
      <td><form class="inline" method="POST" action="/panel/team/revoke" data-confirm="${escapeHtml(`ألغِ دخول ${m.email}؟ تسقط جلستُه في طلبه التالي.`)}">
        <input type="hidden" name="email" value="${escapeHtml(m.email)}">
        <button class="btn btn-danger btn-sm" type="submit">ألغِ</button></form></td></tr>`),
  ].join('')
  const roles = MEMBER_ROLES.map((r, i) => `<label class="vpf"><input type="radio" name="role" value="${r}"${i === 2 ? ' checked' : ''}>
      <span class="vpf-b"><b>${ROLE_LABEL[r].name}</b><span class="note">${ROLE_LABEL[r].can}</span></span></label>`).join('')
  const orgs = d.orgs.map((o) => `<label class="vpf"><input type="checkbox" name="org" value="${escapeHtml(o.id)}">
      <span class="vpf-b"><b>${escapeHtml(o.name)}</b></span></label>`).join('')

  return `${d.flash === null ? '' : toastRegion(notice({ tone: d.flash.kind, html: escapeHtml(d.flash.text), alert: d.flash.kind === 'bad' }))}
  ${pageHead('الفريق', 'الفريقُ والصلاحيّات', 'من يدخل صدى، وبأيّ دور، وعلى أيّ شركة. <b>والدورُ يُفحَص على الخادم في كلّ طلب</b>، لا في الشاشة وحدها.')}
  <div class="card mb-4"><h2>الأعضاء <span class="count">${d.members.length + 1}</span></h2>
    <div class="scroll"><table><thead><tr><th>البريد</th><th>الدور</th><th>الشركات</th><th>آخرُ دخول</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
  <div class="card" id="invite"><h2>ادعُ عضوًا</h2>
    <p class="hint">يدخل برمزٍ إلى بريده كما تدخل. <b>والرمزُ يصله بعد أن يتحقّق من بريده عند Cloudflare</b> (M-33)، ودعوةُ بريدٍ مدعوٍّ تعدّل دورَه وشركاتِه — <b>ومن صار مديرًا أو ناشرًا بلا عاملٍ ثانٍ يُعاد إلى الدخول ليسجّله</b>.</p>
    <form method="POST" action="/panel/team/invite" class="stack">
      <div class="field"><label for="tm-email">البريد</label><input id="tm-email" type="email" name="email" dir="ltr" required></div>
      <fieldset class="field"><legend>الدور</legend><div class="role-grid">${roles}</div></fieldset>
      <fieldset class="field"><legend>الشركات</legend><div class="row gap-2">
        <label class="vpf"><input type="checkbox" name="all" value="1" checked><span class="vpf-b"><b>كلّ الشركات</b></span></label>${orgs}</div>
        <p class="hint">«كلّ الشركات» تشمل ما يُنشأ لاحقًا. أزلها واختر شركاتٍ بعينها لتقصره عليها.</p></fieldset>
      <div class="row"><button class="btn btn-primary" type="submit">ادعُ</button></div>
    </form></div>`
}
