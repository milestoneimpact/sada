/**
 * تشخيصُ وصول الرمز إلى الحزمة (D-376) — **قراءتان مجّانيّتان بالترتيب، ولا ثالثة**:
 *
 * ١. `GET /repos/{owner}/{repo}`: الـ404 هنا يعني أنّ الرمزَ لا يشمل المستودع (رمزٌ دقيقٌ لم يُختر فيه المستودع، أو صاحبُ الموارد
 *    فيه غيرُ صاحب المستودع) — فـGitHub يُخفي المستودعَ الخاصَّ عمّن لا يراه بـ404 لا بـ403.
 * ٢. `GET /repos/{owner}/{repo}/branches/{branch}`: الـ404 هنا بعد نجاح الأولى يعني أنّ **اسمَ الفرع** خاطئ.
 *
 * والنتيجةُ سببٌ دقيق وخطواتُ إصلاحٍ مرقَّمة تُعرض على البطاقة، وأيُّ خطوةٍ نجحت. **والرمزُ في الترويسة وحدها**: لا يدخل سببًا ولا سجلًّا.
 */
import { withTimeout } from '../net/timeout'
import { failure, GitHubError, RATE_LIMITED, statusReason, type RepoRef } from './github'

export type ProbeVerdict = 'ok' | 'token' | 'repo' | 'branch' | 'rate' | 'network' | 'other'

export interface AccessProbe {
  readonly verdict: ProbeVerdict
  /** ما نجح من الخطوتين بالترتيب. */
  readonly passed: readonly ('repo' | 'branch')[]
  readonly reason: string
  readonly fix: readonly string[]
  /** لمن المفتاح وما شكلُه — اسمُ الحساب من `GET /user`، وبادئةُ المفتاح وطولُه، لا حرفَ منه بعد البادئة. */
  readonly identity?: string
}

/** شكلُ المفتاح بلا كشفه: بادئتُه المعروفة وطولُه وما يشوبه من مسافةٍ أو علامة تنصيص. */
export function tokenShape(token: string): string {
  const prefix = (/^(github_pat_|ghp_|gho_|ghs_|ghu_)/.exec(token.trim())?.[1]) ?? 'بادئةٌ غير معروفة'
  const flaws = [token !== token.trim() ? 'مسافةٌ قبله أو بعده' : '', /["'«»]/.test(token) ? 'علامةُ تنصيص' : '', /\s/.test(token.trim()) ? 'مسافةٌ في وسطه' : ''].filter((x) => x !== '')
  return 'يبدأ بـ ' + prefix + ' وطوله ' + String(token.length) + (flaws.length === 0 ? '' : ' · فيه ' + flaws.join(' و'))
}

/** الأسبابُ بنصوصها — البطاقةُ تعرف منها خطواتِ الإصلاح لصفٍّ مكتوبٍ قبل الآن. */
export const REASONS = {
  token: 'GitHub ردّ 401: رمز القراءة خاطئٌ أو انتهى',
  repo: 'الرمزُ لا يرى هذا المستودع: GitHub ردّ 404 على المستودع نفسِه',
  branch: 'المستودعُ مقروء، والفرعُ بهذا الاسم غيرُ موجود: GitHub ردّ 404 على الفرع',
  rate: RATE_LIMITED,
} as const

const FIXES: Readonly<Record<'token' | 'repo' | 'branch' | 'rate', readonly string[]>> = {
  token: [
    'افتح GitHub ← Settings ← Developer settings ← Personal access tokens ← Fine-grained tokens.',
    'أنشئ رمزًا جديدًا (Generate new token) أو جدّد المنتهي (Regenerate token).',
    'ضعه في سرّ Worker ‏GITHUB_CONTENT_TOKEN كما في «ما عليك»، ثمّ اضغط «اختبر الرمز».',
  ],
  repo: [
    'افتح الرمزَ في GitHub ← Settings ← Developer settings ← Fine-grained tokens.',
    'تأكّد أنّ Resource owner هو صاحبُ المستودع نفسُه (المكتوبُ في حقل «صاحب المستودع» هنا)، لا حسابٌ آخر.',
    'في Repository access اختر Only select repositories وأضف المستودع باسمه، ثمّ Update.',
    'في Permissions ← Repository permissions اجعل Contents ‏Read-only، ثمّ اضغط «اختبر الرمز» هنا.',
  ],
  branch: [
    'افتح المستودعَ في GitHub واضغط قائمة الفروع فوق الملفّات.',
    'انسخ اسمَ الفرع كما هو (حروفُه الكبيرة والصغيرة والشرطات تفرق).',
    'ألصقه في حقل «الفرع» في بطاقة «المستودع» هنا، واضغط «احفظ» ثمّ «اختبر الرمز».',
  ],
  rate: [
    'لا تفعل شيئًا الآن: الحدُّ يُرفع وحده خلال ساعة.',
    'إن تكرّر كلَّ يوم فأرسل لي وقتَه — قد يكون رمزٌ آخر يقرأ بالرمز نفسِه.',
  ],
}

/** خطواتُ الإصلاح لسببٍ مكتوب — وفارغةٌ لما لا نعرفه. */
export function fixFor(reason: string | null): readonly string[] {
  for (const k of ['token', 'repo', 'branch', 'rate'] as const) if (reason === REASONS[k]) return FIXES[k]
  return []
}

function verdictOf(e: GitHubError, step: 'repo' | 'branch'): ProbeVerdict {
  if (e.status === 401) return 'token'
  if (e.status === 429) return 'rate'
  if (e.status === 404) return step
  return 'other'
}

function result(verdict: ProbeVerdict, passed: ('repo' | 'branch')[], other = ''): AccessProbe {
  if (verdict === 'ok') return { verdict, passed, reason: 'الرمزُ يرى المستودعَ والفرع.', fix: [] }
  if (verdict === 'network') return { verdict, passed, reason: 'GitHub لم يردّ في المهلة', fix: ['اضغط «اختبر الرمز» ثانيةً بعد دقيقة.'] }
  if (verdict === 'other') return { verdict, passed, reason: other, fix: [] }
  return { verdict, passed, reason: REASONS[verdict], fix: FIXES[verdict] }
}

/** يجرّب الخطوتين بالترتيب ويقف عند أوّل فشل — قراءتان لا تكلّفان شيئًا. */
export async function probeAccess(r: RepoRef, fetchImpl: typeof fetch = withTimeout(fetch, 15_000)): Promise<AccessProbe> {
  const call = withTimeout(fetchImpl, 15_000)
  const h = { Authorization: `Bearer ${r.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sada-package-sync' }
  const base = `https://api.github.com/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`
  const passed: ('repo' | 'branch')[] = []
  // ‏لمن المفتاح: قراءةٌ مجّانيّةٌ ثالثة تحسم «المفتاحُ سليمٌ من جهازي و404 من صدى»
  let who = 'لم يُعرف الحساب'
  try {
    const u = await call('https://api.github.com/user', { headers: h })
    if (u.ok) { const j = (await u.json()) as { login?: unknown }; if (typeof j.login === 'string') who = 'لحساب ' + j.login.slice(0, 40) }
    else who = 'GitHub ردّ ' + String(u.status) + ' على «من أنا»'
  } catch { /* المهلةُ تُقال في الخطوتين */ }
  const identity = 'المفتاحُ ' + who + ' · ' + tokenShape(r.token)
  const withId = (a: AccessProbe): AccessProbe => ({ ...a, identity })
  for (const [step, url] of [['repo', base], ['branch', `${base}/branches/${encodeURIComponent(r.branch)}`]] as const) {
    let res: Response
    try {
      res = await call(url, { headers: h })
    } catch {
      return withId(result('network', passed))
    }
    if (!res.ok) {
      const e = failure(res)
      return withId(result(verdictOf(e, step), passed, e.status === 429 ? RATE_LIMITED : statusReason(res.status)))
    }
    passed.push(step)
  }
  return withId(result('ok', passed))
}
