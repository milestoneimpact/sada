/**
 * **أبوابُ المنشور الواحد** — «منشور جديد ▾» (D-216 · D-326)، في مكانٍ واحدٍ لترويسة اللوحة ولرأس التيّار (D-388).
 *
 * كانت البنودُ في `panelView` وحدَه، والتيّارُ صفحةٌ مستقلّةٌ لا ترويسةَ لوحٍ لها، فلم يكن فيه بابُ المنشور الواحد وهو
 * المحور. فالقائمةُ تُبنى هنا بمساراتها إلى «/panel» لتصل من أيّ صفحة، والمستوردان يرسمانها بزيّها.
 */
import { menu, menuItem } from './components/menu'
import { ICON } from './icons'
import { panelHref } from '../../lib/nav/panes'

/** ‏أبوابُ الكتابة الأربعة (و«خطّة من ملفّ» في قائمة الخطّة برأس التيّار، D-417) بمساراتها إلى «/panel» — لتصل من أيّ لوحٍ أو صفحة. */
export function newItems(): string[] {
  return [
    menuItem({ label: 'من فكرة', note: 'جملة أو كلمات', href: '/panel#idea' }),
    menuItem({ label: 'من مصدر', note: 'ملفّ محلَّل من Drive', href: '/panel#write' }),
    // ‏ونصُّك كما كتبته، بلا نموذج ولا كلفة (D-324)
    menuItem({ label: 'بنفسي', note: 'نصّك كما تكتبه', href: '/panel#own' }),
    menuItem({ label: 'فيديو', note: 'يُرفع ثمّ يُكتب نصُّه', href: panelHref('videos') }),
  ]
}

/** «منشور جديد ▾» بزيّه: أوّليٌّ في الترويسة وسطر التحيّة، وثانويٌّ في رأس التيّار حيث الأوّليُّ واحدٌ غيرُه (D-388). */
export function newPostMenu(attrs: string, variant: 'primary' | 'secondary' = 'primary'): string {
  return menu({ label: 'منشور جديد', variant, size: 'sm', icon: ICON.add, attrs, items: newItems() })
}
