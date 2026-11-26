/** شاشة المنصّة وصفحتا الدخول والهبوط — الوحدةُ 10 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
export const PAGES = `/* ══ شاشةُ المنصّة ═══════════════════════════════════════════════════
   بطاقة القناة تجيب «أمربوطة أم لا» — وهو سؤال الضبط، يُسأل مرّةً.
   وهذه تجيب ما يُسأل كلّ يوم: ماذا نُشر، وأين رابطُه، وما فشل ولماذا.
   ولا موضع لأيّ من ذلك في بطاقة عرضُها نصف شاشة. */
.plat-logo{width:var(--s-12); height:var(--s-12); border-radius:var(--r-control); flex:none; display:grid; place-items:center;
  background:var(--surface); border:var(--bd); color:var(--ink);
  box-shadow:var(--sh-1)}
.plat-logo svg{width:50%; height:50%; display:block}
.plat-logo.lg{width:var(--s-16); height:var(--s-16)}

/* النصُّ كما نُشر: يحفظ أسطرَه — منشورٌ بفقرتين يُقرأ فقرةً واحدة إن
   طُويت أسطرُه، فيُحكَم عليه بغير ما ظهر عليه. */
.post-text{margin:0; white-space:pre-wrap; word-break:break-word;
  font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink); max-width:var(--measure)}
/* ── صفُّ الأرقام ─────────────────────────────────────────────────────
   والشرطة تختلف عن الصفر: الصفر «قِيس فكان لا شيء»، والشرطة «لا يُقاس
   أصلا» — و LinkedIn لا يعطي الظهور لمنشور عضو. فتُعطى الشرطة لونا
   خافتا وعنوانا يُقرأ بالتحويم، ولا تُعرَض رقما. */
.stats{display:flex; align-items:center; gap:var(--s-5); flex-wrap:wrap;
  margin-top:var(--s-3); padding-top:var(--s-3); border-top:var(--bd-soft)}
.stats.none{border-top:var(--bd-dash); gap:var(--s-2)}
.stat{display:inline-flex; align-items:baseline; gap:var(--s-2);
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.stat b{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; color:var(--ink);
  font-variant-numeric:tabular-nums}
.stat .na{color:var(--ink-2); font-weight:400; cursor:help}

/* سببُ الفشل بنصّه: «فشل» وحدها لا تُعالَج، والسببُ يُعالَج */
.why{display:flex; gap:var(--s-3); align-items:flex-start; margin-top:var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-card);
  font-size:var(--t-small); line-height:var(--lh-small); max-width:var(--measure)}
.why.bad{background:var(--bad-wash); color:var(--ink-2);
  border:1px solid color-mix(in srgb,var(--bad) 20%,transparent)}
/* ورمزُ الفشل مرسومٌ (D-167) بقياس الشارة (‏١٤، D-185)، ووسطُه على وسط السطر الأوّل (‏٢٤) */
.why-ic{flex:none; color:var(--bad); padding-top:var(--s-1)}
.why-ic svg{width:var(--icon-xs); height:var(--icon-xs); display:block; margin-top:var(--s-0)}
.why b{color:var(--ink)}
.why-t{min-width:0}
/* الموعدُ لاتينيُّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.ago.when{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ══ صفحتا الدخول والعامل الثاني ═════════════════════════════ */
/* ‏**وعرضُه عرضُ حاويته لا عرضُ محتواه** (D-185): داخل «.main» المرنة كان يُحسَب
   «fit-content»، فسطر لا ينكسر (رأس «لم تُبن بعد» بحرف الأزرار ‏١٥) مدّه ‏٣٤٥px
   على شاشة ‏٣٢٠ — والصفحة كلُّها تُسحَب جانبًا */
.wrap{width:100%; max-width:73.75rem; margin:0 auto; padding:var(--s-6) var(--s-5) var(--s-16)}
.auth{max-width:25rem; margin:12vh auto}
.auth .glyph{margin:0 auto var(--s-4); width:var(--s-16); height:var(--s-16); border-radius:var(--r-card);
  box-shadow:var(--sh-2), 0 0 0 1px var(--mark-ring)}
.auth h1{text-align:center; font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600; margin:0 0 var(--s-1)}
.auth .lede{text-align:center; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); margin:0 0 var(--s-5)}
.auth .card{padding:var(--s-5); box-shadow:var(--sh-2)}
/* ── الموقعُ العامّ (D-416): رأسٌ يتنقّل، وبطاقاتُ مزايا، وأسئلة، وتذييلٌ بالوثيقتين ── */
.site-head{display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--s-3);
  padding-bottom:var(--s-4); margin-bottom:var(--s-6); border-bottom:var(--bd)}
.site-brand{display:flex; align-items:center; gap:var(--s-2); color:var(--ink); text-decoration:none; font-size:var(--t-h3); line-height:var(--lh-h3)}
.site-mark svg{display:block; width:var(--icon-lg); height:var(--icon-lg); border-radius:var(--r-control)}
.site-nav{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-4); font-size:var(--t-small); line-height:var(--lh-small)}
.site-enter{padding:var(--s-1) var(--s-3); border:var(--bd); border-radius:var(--r-pill)}
.site-hero{padding:var(--s-4) 0 var(--s-2)}
.site-grid{list-style:none; display:grid; grid-template-columns:repeat(auto-fill,minmax(15rem,1fr)); gap:var(--s-3)}
.doc .site-grid{padding:0}
.site-grid li{display:flex; flex-direction:column; gap:var(--s-1); margin:0; padding:var(--s-4)}
.site-grid span{font-size:var(--t-small); line-height:var(--lh-small)}
.site-pfs{list-style:none; display:flex; flex-wrap:wrap; gap:var(--s-4)}
.doc .site-pfs{padding:0}
.site-pfs li{display:flex; align-items:center; gap:var(--s-2); margin:0}
.site-pfs svg{width:var(--icon-lg); height:var(--icon-lg)}
.site-steps{padding-inline-start:var(--s-5)}
.site-steps li{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2); margin-bottom:var(--s-2)}
.site-faq{border-bottom:var(--bd-soft); padding:var(--s-3) 0}
.site-faq summary{cursor:pointer; font-weight:600; color:var(--ink)}
.site-faq p{margin:var(--s-2) 0 0}
.site-foot nav{display:flex; flex-wrap:wrap; gap:var(--s-4)}
.site-foot p{font-size:var(--t-small); line-height:var(--lh-small); margin:var(--s-3) 0 0}
.auth input{width:100%; direction:ltr; text-align:start; margin-bottom:var(--s-3)}
.auth button{width:100%; justify-content:center; padding:var(--s-3)}
.auth .card form + form{margin-top:var(--s-3)}
.or{display:flex; align-items:center; gap:var(--s-2); color:var(--ink-2); font-size:var(--t-small);
  line-height:var(--lh-small); margin:var(--s-4) 0}
.or::before,.or::after{content:''; flex:1; height:1px; background:var(--line)}
.rec{margin-top:var(--s-4); border:var(--bd); border-radius:var(--r-card); padding:var(--s-3) var(--s-3);
  background:var(--surface)}
.rec summary{cursor:pointer; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.rec form{margin-top:var(--s-3)}
.cancel{margin-top:var(--s-4); text-align:center}
/* ‏وذيلُ الدخول سطرٌ في الوسط بلا خيط — كان «style» في وسمَي الدخول والعامل الثاني */
.auth footer{border:0; justify-content:center}
.note{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); margin-top:var(--s-2)}

`
