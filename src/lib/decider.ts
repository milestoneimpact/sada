/**
 * مَن قرّر — **«أنت» لا «panel:passkey»** (D-198): المعرّفُ كان يُطبع على البطاقة كما هو.
 * وفي `lib` لا في القسم (D-213): رحلةُ المنشور تقوله أيضًا، وكانت تُلصق المعرّفَ خامًا.
 */
export function deciderText(by: string | null): string {
  if (by === null) return ''
  if (by === 'panel:passkey') return 'أنت بمفتاح المرور'
  if (by === 'panel:email') return 'أنت برمز البريد'
  if (by === 'panel:token') return 'أنت بكلمة الإدارة'
  if (by.startsWith('panel')) return 'أنت'
  if (by.startsWith('plan')) return 'أنت باعتماد الخطّة'
  return 'غيرُك'
}
