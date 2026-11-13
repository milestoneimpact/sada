/**
 * أنماطُ اللوحة — هيكلُ تطبيقٍ لا صفحة.
 *
 * كلُّ لونٍ هنا `var(--…)` ولا لونَ حرفيّ واحد. وقاعدةٌ تكتب لونا صريحا
 * تكسر أحد الثيمين صامتةً، فلا تُكتب.
 *
 * ## ثلاثةُ مبادئَ تحكم ما يلي
 *
 * ١ · **الهيكلُ طبقتان وحدٌّ وظلّ**: الرافدةُ والشريطُ العلويّ والمحتوى على
 *     `--bg` بخيطٍ يفصلها، والبطاقاتُ على `--surface` بحدٍّ وظلٍّ خفيف
 *     (`--sh-1`، D-187). ولوحةٌ كلُّ شيءٍ فيها على أرضٍ واحدةٍ بلا حدٍّ يُرى
 *     تبدو صفحةً لا نظاما.
 *
 * ٢ · **المسافاتُ من سلّمِ أربعة**: ٤ · ٨ · ١٢ · ١٦ · ٢٠ · ٢٤ · ٣٢.
 *     ورقمٌ خارج السلّم يُرى ولو لم يُعرَف سببُه.
 *
 * ٣ · **قواعدُ اللون من مرجع التصوير لا من الذوق**: ألوانُ الحالة
 *     محجوزة، ولا تعتمد حالةٌ على اللون وحده (معه رمزٌ ونصّ دائما)،
 *     ودرجةُ الاستحقاق مقياسُ مقدارٍ فتدرّجُ هيئةٍ واحدة لا قوس قزح.
 */
import { TOKENS } from './tokens'
import { BASE } from './styles/01-base'
import { SHELL } from './styles/02-shell'
import { HEAD } from './styles/03-head'
import { CARDS } from './styles/04-cards'
import { MOMENT } from './styles/05-moment'
import { TABLES } from './styles/06-tables'
import { CONTROLS } from './styles/07-controls'
import { SECTIONS } from './styles/08-sections'
import { DECISION } from './styles/09-decision'
import { PAGES } from './styles/10-pages'
import { NARROW } from './styles/11-narrow'
import { EXTRAS } from './styles/12-extras'
import { EDITIONS } from './styles/13-editions'
import { TOUCH } from './styles/14-touch'
import { MOTION } from './styles/12-motion'

/**
 * ‏**والورقةُ وحداتٌ بترتيبها** في `styles/` (`scripts/split_styles.mjs`): المتأخّرُ يغلب عند تساوي
 * ‏المحدّدات، فالترتيبُ هنا جزءٌ من المعنى لا تنظيمٌ له. وما يُضاف يُكتب في وحدة قسمه، و«طبقةُ اللمس» آخرًا.
 *
 * ‏**ولا `@layer` بعد**: جُرّبت طبقةٌ لكلّ وحدة فقاست لقطاتُ الأنماط المحسوبة ‏347 تغيّرًا مختلفًا، أوّلُها
 * ‏أزرارٌ تكسب حدًّا وحشوًا. فالطبقةُ تقلب ما كان المحدّدُ الأخصُّ يحسمه بين وحدتين، وكلُّ موضعٍ منها قرارٌ لا نقل.
 */
export const STYLE = TOKENS + BASE + SHELL + HEAD + CARDS + MOMENT + TABLES + CONTROLS + SECTIONS + DECISION + PAGES + NARROW + EXTRAS + MOTION + EDITIONS + TOUCH
