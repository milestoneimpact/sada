-- عنوانُ قناة التنبيهات خارج سجلّ النشاط (D-318).
--
-- ## ما كان
--
-- كان حفظُ القناة يكتب في `audit_log.detail` العنوانَ كاملًا («← https://hooks.slack.com/services/…»)، وعنوانُ Slack وDiscord
-- وTelegram **يحمل رمزَه في مساره**: من قرأ الصفّ كتب في قناة المالك. وسجلُّ النشاط يُقرأ في اللوحة ويُصدَّر، وD-318 صار يكتب
-- القناعَ وحدَه (البروتوكولُ والمضيفُ وآخرُ أربعة محارف).
--
-- ## ما صار
--
-- الصفوفُ القديمةُ تُكتب بقناعٍ لا يُستخرَج منه شيء: البروتوكولُ والمضيفُ يبقيان (يقولان أيَّ قناةٍ ضُبطت)، وما بعد المضيف
-- يُمحى — المسارُ والسؤالُ (`?`) والمرسى (`#`)، واسمُ الدخول قبل `@` إن كان. **تحديثُ صفوفٍ لا إسقاطٌ ولا إعادةُ بناء**
-- (D-316)، ولا يفشل على صفٍّ قائم: ما لا يطابق الشرطَ لا يُمسّ.
--
-- والتعبيرُ بلا تعابيرَ نمطيّة (SQLite لا يعرفها في D1):
--   rest  = ما بعد «//»
--   hostp = rest حتّى أوّلِ «/» أو «?» أو «#» (يُستبدَل الاثنان بـ «/» قبل البحث)
--   host  = ما بعد آخرِ «@» في hostp — `replace(s, rtrim(s, replace(s, '@', '')), '')`، وبلا «@» يبقى hostp كما هو
UPDATE audit_log
   SET detail = '← ' || substr(detail, 3, instr(detail, '//') - 3) || '//'
                || replace(
                     substr(substr(detail, instr(detail, '//') + 2), 1,
                            instr(replace(replace(substr(detail, instr(detail, '//') + 2), '?', '/'), '#', '/') || '/', '/') - 1),
                     rtrim(
                       substr(substr(detail, instr(detail, '//') + 2), 1,
                              instr(replace(replace(substr(detail, instr(detail, '//') + 2), '?', '/'), '#', '/') || '/', '/') - 1),
                       replace(
                         substr(substr(detail, instr(detail, '//') + 2), 1,
                                instr(replace(replace(substr(detail, instr(detail, '//') + 2), '?', '/'), '#', '/') || '/', '/') - 1),
                         '@', '')),
                     '')
                || '/… (أُخفي المسار في D-318)'
 WHERE action = 'settings.write'
   AND target = 'alert_webhook'
   AND detail LIKE '← http%//%';
