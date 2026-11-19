# جردُ مسارات `/panel` بعد المرحلة ٣ (D-388)

قبلُ: ‏187 مسارًا، منها ‏56 للخطّة، والمنشورُ يظهر في ثماني شاشات، والرافدةُ عشرُ وجهات. بعدُ: المساراتُ نفسُها (**لا حُذف مسارٌ يَرِد إليه نموذج**)، منها ثلاثةٌ صارت تحويلًا، وشاشاتُ المنشور ستٌّ (التيّارُ محورٌ، والمراجعةُ ورشة، والشهرُ ثانويّ، واللوحُ مطويّ، والحزمةُ من الإعدادات، والنتائج)، والرافدةُ سبع. وعمودُ «يُبلَغ من» لصفحات `GET` التي لها بابٌ مرئيّ؛ وما سواه نموذجٌ أو ملفٌّ أو JSON تَرِد إليه الصفحةُ التي تخدمه.

| المسار | الحال | يُبلَغ من |
|---|---|---|
| **الهيكلُ والتيّار** | | |
| `GET /panel` | باقٍ | الرافدة «الرئيسيّة» — وفيه لوحُ المنشورات `#posts` مطويًّا (من «المزيد» ومن «افتح» في التيّار) |
| `GET /panel/feed` | باقٍ | الرافدة «التيّار» وشريطُ الهاتف — **المحور** |
| `GET /panel/help` | باقٍ | قائمةُ الحساب ولوحةُ الأوامر |
| `GET /panel/new` | باقٍ | رأسُ التيّار «منشورات جديدة»، وبطاقةُ «خطّةُ الشهر» في الرئيسيّة، ولوحةُ الأوامر |
| `GET /panel/notices` | باقٍ | الجرس |
| `GET /panel/routes/pick` | باقٍ | — |
| `POST /panel/notices/read` | باقٍ | — |
| `POST /panel/routes` | باقٍ | — |
| `POST /panel/vitals` | باقٍ | — |
| **الخطّة** | | |
| `GET /panel/plan` | تحويل 303 ← `/panel/plan/review` (D-388: غلافُ الورشة؛ وبناءٌ يجري ← `/panel/plan/building`) | — |
| `GET /panel/plan-import/:id` | باقٍ | — |
| `GET /panel/plan-import/template.csv` | باقٍ | — |
| `GET /panel/plan-rules` | باقٍ | الإعدادات «المصادر والقواعد»، وبطاقةُ «من GitHub»، وشريطُ الفحص |
| `GET /panel/plan/build.json` | باقٍ | — |
| `GET /panel/plan/building` | باقٍ | — |
| `GET /panel/plan/follow` | تحويل 303 ← `/panel/feed` (D-388: المتابعةُ صارت التيّار) | — |
| `GET /panel/plan/import` | باقٍ | «منشورات جديدة» ← «من ملفّ» |
| `GET /panel/plan/import/preview` | باقٍ | — |
| `GET /panel/plan/imports` | باقٍ | الإعدادات «المصادر والقواعد»، وبطاقةُ «من GitHub»، وشاشةُ الشهر |
| `GET /panel/plan/month` | باقٍ | رأسُ التيّار «تقويم الشهر»، ولوحةُ الأوامر — عرضٌ ثانٍ (شاراتُ الحمل و«اعتمد الشهر») |
| `GET /panel/plan/new` | باقٍ | «منشورات جديدة» ← «يكتبها المساعد»، و«أعد بناء الخطّة» في أفعال الخطّة |
| `GET /panel/plan/package` | باقٍ | — |
| `GET /panel/plan/package/schedule` | باقٍ | — |
| `GET /panel/plan/post/:id` | باقٍ | «افتح» على منشور الخطّة في التيّار |
| `GET /panel/plan/review` | باقٍ | رأسُ التيّار «ورشة الخطّة»، و«افتح الخطّة» على ما يُكتب، و«راجع واعتمد» في الرئيسيّة — **الورشة** |
| `GET /panel/plan/review/card` | باقٍ | — |
| `GET /panel/plan/view` | باقٍ | أفعالُ الخطّة «اعرض واطبع» |
| `POST /panel/plan-import` | باقٍ | — |
| `POST /panel/plan-import/:id/approve` | باقٍ | — |
| `POST /panel/plan-import/p1/approve` | باقٍ | — |
| `POST /panel/plan-rules` | باقٍ | — |
| `POST /panel/plan/approve` | باقٍ | — |
| `POST /panel/plan/approve-all` | باقٍ | — |
| `POST /panel/plan/cancel` | باقٍ | — |
| `POST /panel/plan/check/fix` | باقٍ | — |
| `POST /panel/plan/generate` | باقٍ | — |
| `POST /panel/plan/import` | باقٍ | — |
| `POST /panel/plan/import/confirm` | باقٍ | — |
| `POST /panel/plan/item` | باقٍ | — |
| `POST /panel/plan/item/add` | باقٍ | — |
| `POST /panel/plan/item/remove` | باقٍ | — |
| `POST /panel/plan/month/approve` | باقٍ | — |
| `POST /panel/plan/month/reopen` | باقٍ | — |
| `POST /panel/plan/month/unschedule` | باقٍ | — |
| `POST /panel/plan/package` | باقٍ | — |
| `POST /panel/plan/package/schedule` | باقٍ | — |
| `POST /panel/plan/pin` | باقٍ | — |
| `POST /panel/plan/post/copy` | باقٍ | — |
| `POST /panel/plan/post/hold` | باقٍ | — |
| `POST /panel/plan/post/restore` | باقٍ | — |
| `POST /panel/plan/post/revise` | باقٍ | — |
| `POST /panel/plan/review/add` | باقٍ | — |
| `POST /panel/plan/review/approve` | باقٍ | — |
| `POST /panel/plan/review/bulk` | باقٍ | — |
| `POST /panel/plan/review/delay` | باقٍ | — |
| `POST /panel/plan/review/drop` | باقٍ | — |
| `POST /panel/plan/review/image` | باقٍ | — |
| `POST /panel/plan/review/move` | باقٍ | — |
| `POST /panel/plan/review/redraft` | باقٍ | — |
| `POST /panel/plan/review/text` | باقٍ | — |
| `POST /panel/plan/review/undo` | باقٍ | — |
| `POST /panel/plan/schedule` | باقٍ | — |
| `POST /panel/plan/share` | باقٍ | — |
| `POST /panel/plan/share/revoke` | باقٍ | — |
| `POST /panel/plan/start` | باقٍ | — |
| **الحزمة** | | |
| `GET /panel/package` | باقٍ | الإعدادات «المصادر والقواعد»، و«منشورات جديدة» ← «من GitHub»، ولوحةُ الأوامر |
| `GET /panel/package/changes/:rev` | باقٍ | — |
| `POST /panel/package` | باقٍ | — |
| `POST /panel/package/changes/:rev/decide` | باقٍ | — |
| **المسوّداتُ والمنشورات** | | |
| `GET /panel/assets` | باقٍ | — |
| `GET /panel/assets/raw/:ref` | باقٍ | — |
| `GET /panel/drafts/spread` | باقٍ | — |
| `GET /panel/journey/:id` | باقٍ | «النتائج» و«افتح» على المنشور والفاشل في التيّار، ولوحةُ الأوامر |
| `GET /panel/library` | باقٍ | الرافدة «المكتبة» |
| `GET /panel/media/:id` | باقٍ | — |
| `GET /panel/sources/:id/file` | باقٍ | — |
| `GET /panel/timeline` | تحويل 301 ← `/panel/feed` (D-388: الخطُّ الزمنيّ صار التيّار) | — |
| `POST /panel/analyze` | باقٍ | — |
| `POST /panel/assets/delete` | باقٍ | — |
| `POST /panel/assets/mark` | باقٍ | — |
| `POST /panel/assets/upload` | باقٍ | — |
| `POST /panel/drafts/approve-many` | باقٍ | — |
| `POST /panel/drafts/decide` | باقٍ | — |
| `POST /panel/drafts/delete` | باقٍ | — |
| `POST /panel/drafts/idea` | باقٍ | — |
| `POST /panel/drafts/own` | باقٍ | — |
| `POST /panel/drafts/requeue` | باقٍ | — |
| `POST /panel/drafts/reschedule` | باقٍ | — |
| `POST /panel/drafts/schedule` | باقٍ | — |
| `POST /panel/drafts/spread` | باقٍ | — |
| `POST /panel/drafts/spread/apply` | باقٍ | — |
| `POST /panel/drafts/thread-check` | باقٍ | — |
| `POST /panel/drafts/undo-approve` | باقٍ | — |
| `POST /panel/drafts/undo-reject` | باقٍ | — |
| `POST /panel/drafts/undo-schedule` | باقٍ | — |
| `POST /panel/drafts/undo-unschedule` | باقٍ | — |
| `POST /panel/drafts/unschedule` | باقٍ | — |
| `POST /panel/drafts/write` | باقٍ | — |
| `POST /panel/images/quota` | باقٍ | — |
| `POST /panel/media/animate` | باقٍ | — |
| `POST /panel/media/generate` | باقٍ | — |
| `POST /panel/media/regenerate` | باقٍ | — |
| `POST /panel/media/reject` | باقٍ | — |
| `POST /panel/scan` | باقٍ | — |
| `POST /panel/scan/media` | باقٍ | — |
| `POST /panel/scan/media-folder` | باقٍ | — |
| `POST /panel/sources/delete` | باقٍ | — |
| `POST /panel/sources/link` | باقٍ | — |
| `POST /panel/sources/upload` | باقٍ | — |
| **النتائجُ والتقارير** | | |
| `GET /panel/analysis` | باقٍ | عائلةُ النتائج «الأداء» |
| `GET /panel/insights` | باقٍ | عائلةُ النتائج «ما ينجح» |
| `GET /panel/insights.csv` | باقٍ | — |
| `GET /panel/pivot.csv` | باقٍ | — |
| `GET /panel/portfolio` | باقٍ | — |
| `GET /panel/report` | باقٍ | الرافدة «النتائج» |
| `GET /panel/report/:week` | باقٍ | — |
| `POST /panel/report/promote` | باقٍ | — |
| **الحساباتُ والمنصّات** | | |
| `GET /panel/accounts` | باقٍ | الرافدة «الحسابات» |
| `GET /panel/channels/:platform` | باقٍ | — |
| `GET /panel/providers/models` | باقٍ | — |
| `POST /panel/channels/app` | باقٍ | — |
| `POST /panel/channels/app/delete` | باقٍ | — |
| `POST /panel/channels/app/verify` | باقٍ | — |
| `POST /panel/channels/disconnect` | باقٍ | — |
| `POST /panel/providers/add` | باقٍ | — |
| `POST /panel/providers/delete` | باقٍ | — |
| `POST /panel/providers/key` | باقٍ | — |
| `POST /panel/providers/models` | باقٍ | — |
| `POST /panel/providers/recommend` | باقٍ | — |
| `POST /panel/providers/toggle` | باقٍ | — |
| `POST /panel/providers/verify` | باقٍ | — |
| `POST /panel/providers/verify-all` | باقٍ | — |
| **العميلُ والفريقُ والمنظّمات** | | |
| `GET /panel/client` | باقٍ | لوحةُ الأوامر «رحلة العميل» |
| `GET /panel/client/report` | باقٍ | — |
| `GET /panel/orgs/export` | باقٍ | — |
| `GET /panel/orgs/exported` | باقٍ | — |
| `GET /panel/share` | باقٍ | — |
| `GET /panel/team` | باقٍ | — |
| `POST /panel/client/brief` | باقٍ | — |
| `POST /panel/client/limits` | باقٍ | — |
| `POST /panel/client/report/send` | باقٍ | — |
| `POST /panel/orgs` | باقٍ | — |
| `POST /panel/orgs/delete` | باقٍ | — |
| `POST /panel/orgs/switch` | باقٍ | — |
| `POST /panel/team/invite` | باقٍ | — |
| `POST /panel/team/revoke` | باقٍ | — |
| **الإعداداتُ والدخولُ والأمان** | | |
| `GET /panel/2fa` | باقٍ | — |
| `GET /panel/enrol` | باقٍ | — |
| `GET /panel/gates` | باقٍ | — |
| `GET /panel/login` | باقٍ | — |
| `GET /panel/settings` | باقٍ | ذيلُ الرافدة «الإعدادات» |
| `GET /panel/stepup` | باقٍ | — |
| `GET /panel/stepup/resume` | باقٍ | — |
| `GET /panel/tasks` | باقٍ | الرافدة «ما عليك» |
| `GET /panel/tasks/later` | باقٍ | — |
| `POST /panel/2fa/cancel` | باقٍ | — |
| `POST /panel/2fa/passkey` | باقٍ | — |
| `POST /panel/2fa/recovery` | باقٍ | — |
| `POST /panel/2fa/totp` | باقٍ | — |
| `POST /panel/login` | باقٍ | — |
| `POST /panel/login/code` | باقٍ | — |
| `POST /panel/logout` | باقٍ | — |
| `POST /panel/passkey/challenge` | باقٍ | — |
| `POST /panel/passkey/login` | باقٍ | — |
| `POST /panel/security/passkey/challenge` | باقٍ | — |
| `POST /panel/security/passkey/delete` | باقٍ | — |
| `POST /panel/security/passkey/register` | باقٍ | — |
| `POST /panel/security/recovery/issue` | باقٍ | — |
| `POST /panel/security/totp/confirm` | باقٍ | — |
| `POST /panel/security/totp/remove` | باقٍ | — |
| `POST /panel/security/totp/start` | باقٍ | — |
| `POST /panel/sessions/revoke` | باقٍ | — |
| `POST /panel/sessions/revoke-all` | باقٍ | — |
| `POST /panel/settings` | باقٍ | — |
| `POST /panel/stepup/code` | باقٍ | — |
| `POST /panel/stepup/code/send` | باقٍ | — |
| `POST /panel/stepup/passkey` | باقٍ | — |
| `POST /panel/stepup/totp` | باقٍ | — |
| `POST /panel/trash/restore` | باقٍ | — |
| `POST /panel/uploads/:id/abort` | باقٍ | — |
| `POST /panel/uploads/:id/captions` | باقٍ | — |
| `POST /panel/uploads/:id/complete` | باقٍ | — |
| `POST /panel/uploads/:id/delete` | باقٍ | — |
| `POST /panel/uploads/:id/part` | باقٍ | — |
| `POST /panel/uploads/:id/posts` | باقٍ | — |
| `POST /panel/uploads/:id/schedule` | باقٍ | — |
| `POST /panel/uploads/start` | باقٍ | — |

**ما حُذف من الواجهة** (لا من المسارات): `timelineView` و`planFollowView` وعيّنةُ `screen-timeline` و`lib/gantt` و`lib/ganttStore`، ومدخلا «الخطّة» و«المنشورات» و«حزمة المحتوى» من الرافدة، و«الخطّ الزمنيّ» من عائلة النتائج ولوحة الأوامر، وسحبُ `from=timeline` في `drafts/reschedule`.

