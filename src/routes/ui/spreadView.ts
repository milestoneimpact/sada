/**
 * شاشةُ التوزيع — **جدولٌ يُقرأ قبل أن يقع** (D-089).
 *
 * ## ولماذا شاشةٌ لا رسالةُ تأكيد
 *
 * «أتوزّع عشرةَ منشورات؟ نعم / لا» سؤالٌ لا يُجاب: لا يقول أيَّ منشورٍ
 * ولا إلى أيّ حساب ولا في أيّ ساعة. **والمالكُ يوافق على ما لا يرى**،
 * ثمّ يكتشف الجدولَ بعد وقوعه — فيسحب عشرةَ مواعيد واحدا واحدا.
 *
 * فالشاشةُ تعرض **الخانةَ كاملة**: النصَّ والوجهةَ والموعدَ بالـ UTC
 * وبتوقيت المالك معا. وما لا يصلح يُعرَض تحتها بسببه، **فمن اعتمد عشرا
 * ورأى ثمانيا يعرف أين ذهب الاثنان**.
 *
 * ## والمدخلاتُ تُحمَل كما هي
 *
 * الخطّةُ دالّةٌ خالصةٌ من (المسوّدات · الوجهات · البداية · الفاصل).
 * فالنموذجُ يحمل البدايةَ والفاصلَ **ومعرّفاتِ المنشورات بترتيبها** —
 * ويُنفَّذ على تلك وحدها. فمسوّدةٌ اعتُمدت بين المعاينة والتنفيذ لا
 * تدخل الجدولَ خِلسةً، **ومسوّدةٌ خرجت منه تُردّ بسببها**.
 */
import { counted, NOUNS } from '../../lib/format'
import { stamp } from '../../lib/time/zone'
import { escapeHtml } from './shell'
import { ICON } from './icons'
import { whenTag } from './time'
import { pageHead } from './parts'
import type { SpreadPlan } from '../../lib/schedule/spread'

export interface SpreadScreenData {
  readonly plan: SpreadPlan
  readonly start: string
  readonly gap: number
  readonly csrf: string
  /** منطقةُ المالك من كعكته (D-173)، و`null` الرياض. */
  readonly zone?: string | null
}

function row(index: number, when: string, label: string, preview: string, zone: string | null): string {
  return `<tr>
    <td class="mono">${index + 1}</td>
    <td><div class="nm">${escapeHtml(preview)}</div></td>
    <td><span class="chip">${escapeHtml(label)}</span></td>
    <td class="when">${whenTag(when.replace('T', ' '), { zone })}</td>
  </tr>`
}

export function spreadScreen(d: SpreadScreenData): string {
  const { slots, skipped } = d.plan
  // ‏رأسُ الصفحة كبقيّة الصفحات المستقلّة: أين أنا قبل ما سيقع (Krug · axe «page-has-heading-one»)
  const head = pageHead('المنشورات', 'توزيع المعتمَد', 'معاينة المواعيد قبل أن يقع منها شيء.')

  if (slots.length === 0) {
    return `${head}<section class="card">
      <h2>لا شيء يُوزَّع</h2>
      <p class="hint">لا مسوّدة معتمَدةً لها قناة مربوطة. والاعتماد وحدَه لا يكفي
        — تُربَط قناة المنصّة أوّلا.</p>
      ${skipped.length === 0
        ? ''
        : `<ul class="plain">${skipped
            .map((s) => `<li><b>${escapeHtml(s.preview)}</b> — ${escapeHtml(s.reason)}</li>`)
            .join('')}</ul>`}
      <p><a class="btn btn-secondary" href="/panel#posts">${ICON.back}عُد إلى المسوّدات</a></p>
    </section>`
  }

  return `${head}<section class="card">
    <h2>هذا ما سيقع — ${counted(slots.length, NOUNS.post)}</h2>
    <p class="hint">كلّ ${d.gap} ساعةً منشور، ابتداءً من
      <b class="mono">${escapeHtml(stamp(d.start.replace('T', ' '), null))}</b>.
      <b>ولا يقع منه شيء حتّى تضغط «اعتمد التوزيع»</b>.</p>

    <div class="scroll"><table>
      <thead><tr><th>#</th><th>المنشور</th><th>الحساب</th><th>الموعد</th></tr></thead>
      <tbody>${slots
        .map((s, i) => row(i, s.when, s.accountLabel, s.preview, d.zone ?? null))
        .join('')}</tbody>
    </table></div>

    ${skipped.length === 0
      ? ''
      /*
       * **وعنوانٌ عارٍ يرث قياسَ المتصفّح** (D-124): `h3` بلا صنفٍ ‏١٦٫٤px —
       * خارجَ السلّم، ولم يُمسَك لأنّ الشاشةَ لم تكن تُرسَم. فيلبس صنفَ
       * عنوان القسم كأخواته.
       */
      : `<h3 class="sec">وخارج الجدول — ${skipped.length}</h3>
         <p class="hint">تبقى معتمَدةً كما هي، ولا يضيع منها شيء.</p>
         <ul class="plain">${skipped
           .map((s) => `<li><b>${escapeHtml(s.preview)}</b> — ${escapeHtml(s.reason)}</li>`)
           .join('')}</ul>`}

    <form method="POST" action="/panel/drafts/spread/apply" data-busy="جار الجدولة…">
      <input type="hidden" name="_csrf" value="${escapeHtml(d.csrf)}">
      <input type="hidden" name="start" value="${escapeHtml(d.start)}">
      <input type="hidden" name="gap" value="${String(d.gap)}">
      ${slots.map((s) => `<input type="hidden" name="post" value="${escapeHtml(s.postId)}">`).join('')}
      <div class="row">
        <button class="btn btn-primary" type="submit">اعتمد التوزيع</button>
        <a class="btn btn-secondary" href="/panel#posts">تراجَع</a>
      </div>
    </form>
  </section>`
}
