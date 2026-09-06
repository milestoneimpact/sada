/**
 * «هل غيّرت هذه الكتابةُ صفّا؟» — **وشكلُ الجواب ليس واحدا.**
 *
 * D1 يعيد `{ meta: { changes } }`، و`node:sqlite` — الذي تُشغَّل عليه
 * الاختبارات — يعيد `{ changes }` مسطّحا. **وقراءةُ أحدِهما وحده تعطي
 * خُضرةً كاذبة**: `undefined` تُقرأ «لم يتغيّر شيء» فينقلب معنى
 * `ON CONFLICT DO NOTHING` بين البيئتين.
 *
 * وقد كُتب هذا الفرزُ مرّةً في `factors.ts` ثمّ لزم في ثلاثة مواضعَ
 * أخرى — **وقاعدةٌ تُكتب ولا تُستعمَل هي علّةُ D-057 نفسُها**. فيُوضَع
 * في موضعٍ واحدٍ يُستورَد.
 *
 * **وما لا يُعرَف يُعدّ تغييرا**: مشغّلٌ لا يبلّغ العددَ أصلا يجعل كلَّ
 * كتابةٍ تبدو ساقطة، فتُعاد بلا داعٍ أو يُقال للمالك «لم يُحفَظ» وقد
 * حُفظ. والخطأُ في هذا الاتّجاه أرحم.
 */
export function changedRows(result: unknown): boolean {
  const shaped = result as { meta?: { changes?: number }; changes?: number }
  const changes = shaped?.meta?.changes ?? shaped?.changes
  return changes === undefined ? true : changes > 0
}
