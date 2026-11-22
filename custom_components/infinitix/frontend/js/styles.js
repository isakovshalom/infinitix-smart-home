// Design tokens + styles.  To re-brand, change only the token block (":host" and ".dark").
// Logical properties are used throughout so RTL (Hebrew) and LTR (English) both work.

export const CSS = `
:host {
  /* ---- brand: palette read from infinitix.co.il (computed styles): navy #0f172b, ink #020618, cyan #00caec / #00b6fe ---- */
  --ix-brand-name: "INFINITIX";
  --ix-accent: #00caec;
  --ix-accent-strong: #00b6fe;
  --ix-accent-contrast: #020618;
  --ix-navy: #0f172b;

  /* ---- typography: Rubik (bundled locally, SIL OFL) like the website ---- */
  --ix-font: "Rubik", system-ui, -apple-system, "Segoe UI", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
  --ix-fs-xs: 0.75rem; --ix-fs-sm: 0.875rem; --ix-fs-md: 1rem; --ix-fs-lg: 1.25rem; --ix-fs-xl: 1.75rem; --ix-fs-xxl: 2.75rem;
  --ix-fw-regular: 400; --ix-fw-medium: 600; --ix-fw-bold: 900; --ix-tracking-brand: 0.22em;

  /* ---- spacing / radius / sizing ---- */
  --ix-sp-1: 4px; --ix-sp-2: 8px; --ix-sp-3: 12px; --ix-sp-4: 16px; --ix-sp-5: 24px; --ix-sp-6: 32px;
  --ix-radius-sm: 8px; --ix-radius-md: 12px; --ix-radius-lg: 16px; --ix-radius-pill: 999px;
  --ix-touch: 48px;
  --ix-card-min: 170px;

  /* ---- light theme ---- */
  --ix-bg: #f1f5f9; --ix-surface: #ffffff; --ix-surface-2: #f1f5f9; --ix-text: #020618; --ix-muted: #62748e;
  --ix-border: #e2e8f0; --ix-ok: #00a63e; --ix-warn: #d08700; --ix-danger: #e7000b;
  --ix-on: color-mix(in srgb, var(--ix-accent) 14%, var(--ix-surface));
  --ix-shadow: 0 1px 2px rgba(2, 6, 24, .05), 0 6px 20px rgba(2, 6, 24, .06);
  display: block; height: 100%; min-height: 100vh;
}
:host(.dark) {
  --ix-bg: #020618; --ix-surface: #0f172b; --ix-surface-2: #1d293d; --ix-text: #f4f9ff; --ix-muted: #90a1b9;
  --ix-border: #1d293d; --ix-ok: #05df72; --ix-warn: #fdc700; --ix-danger: #ff6467;
  --ix-shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px rgba(0, 0, 0, .35);
}

* { box-sizing: border-box; }
.app { font-family: var(--ix-font); color: var(--ix-text); background: var(--ix-bg); min-height: 100vh; height: 100%;
  display: flex; flex-direction: column; font-size: var(--ix-fs-md); -webkit-tap-highlight-color: transparent; }
[hidden] { display: none !important; }
button, select, input { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--ix-accent); outline-offset: 2px; }

/* ---------- top bar / nav ---------- */
.topbar { display: flex; align-items: center; gap: var(--ix-sp-3); padding: var(--ix-sp-3) var(--ix-sp-4);
  background: var(--ix-surface); border-block-end: 1px solid var(--ix-border); position: sticky; top: 0; z-index: 5; }
.brand { font-weight: var(--ix-fw-bold); letter-spacing: var(--ix-tracking-brand); font-size: var(--ix-fs-md); color: var(--ix-text);
  display: inline-flex; align-items: center; gap: var(--ix-sp-2); white-space: nowrap; }
.brand .mark { color: var(--ix-accent); font-size: 1.4em; line-height: 1; letter-spacing: 0; }
.brand .word { font-weight: 300; }
.nav { display: flex; gap: var(--ix-sp-2); overflow-x: auto; flex: 1; scrollbar-width: none; padding-block: 2px; }
.nav::-webkit-scrollbar { display: none; }
.tab { min-height: var(--ix-touch); padding-inline: var(--ix-sp-4); border: 1px solid transparent; background: transparent;
  border-radius: var(--ix-radius-pill); color: var(--ix-muted); white-space: nowrap; display: inline-flex; align-items: center; gap: var(--ix-sp-2); }
.tab[aria-current="page"] { background: var(--ix-on); color: var(--ix-text); border-color: color-mix(in srgb, var(--ix-accent) 40%, transparent); font-weight: var(--ix-fw-medium); }
.iconbtn { width: var(--ix-touch); height: var(--ix-touch); border-radius: var(--ix-radius-pill); border: 1px solid var(--ix-border);
  background: var(--ix-surface); display: inline-grid; place-items: center; flex: none; }
.iconbtn[aria-pressed="true"] { background: var(--ix-accent); color: var(--ix-accent-contrast); border-color: var(--ix-accent); }
.floating-nav { position: fixed; inset-block-end: var(--ix-sp-4); inset-inline-end: var(--ix-sp-4); z-index: 6; box-shadow: var(--ix-shadow); }
.banner { padding: var(--ix-sp-2) var(--ix-sp-4); font-size: var(--ix-fs-sm); text-align: center; background: var(--ix-warn); color: #fff; font-weight: var(--ix-fw-medium); }

.content { flex: 1; overflow: auto; padding: var(--ix-sp-5) var(--ix-sp-4) calc(var(--ix-sp-6) + 24px); }
.page { max-width: 1280px; margin-inline: auto; }
h1, h2, h3 { margin: 0; font-weight: var(--ix-fw-medium); }
h1 { margin-block-end: var(--ix-sp-4); }
.row h1, .row.spread h1 { margin-block-end: 0; }
.field select, .field .input[type="text"], .field input.input:not([type="color"]) { max-width: 480px; }
h2 { font-size: var(--ix-fs-lg); margin-block: var(--ix-sp-5) var(--ix-sp-3); }
.muted { color: var(--ix-muted); }
.small { font-size: var(--ix-fs-sm); }

/* ---------- home header ---------- */
.hero { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: var(--ix-sp-4); margin-block-end: var(--ix-sp-4); }
.hero .greet { font-size: var(--ix-fs-xl); font-weight: var(--ix-fw-bold); letter-spacing: -0.01em; }
.hero .clock { font-size: var(--ix-fs-xxl); font-weight: 300; line-height: 1; font-variant-numeric: tabular-nums; }
.hero .date { color: var(--ix-muted); margin-block-start: var(--ix-sp-1); }
.weather { display: inline-flex; align-items: center; gap: var(--ix-sp-2); padding: var(--ix-sp-2) var(--ix-sp-4); border-radius: var(--ix-radius-pill); background: var(--ix-surface); border: 1px solid var(--ix-border); }

/* ---------- grids ---------- */
.grid { display: grid; gap: var(--ix-sp-3); grid-template-columns: repeat(auto-fill, minmax(var(--ix-card-min), 1fr)); }
.size-l { grid-column: span 2; }

/* ---- layout: Rows (one row per device, grouped by room) ---- */
.layout-rows .grid, .layout-rows .grid.room-grid { grid-template-columns: 1fr; gap: var(--ix-sp-2); }
.layout-rows .size-l { grid-column: auto; }
.layout-rows .room-tile { min-height: 64px; flex-direction: row; align-items: center; }
.layout-rows .room-tile .rt-top { order: 2; gap: var(--ix-sp-3); }
.layout-rows .ix-card { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; padding-block: var(--ix-sp-3); }
.layout-rows .ix-card > .card-head { flex: 1 1 200px; }
.layout-rows .ix-card .cam-wrap, .layout-rows .ix-card[data-card="camera"] { flex-direction: column; align-items: stretch; }

/* ---- layout: Rail (fixed side column with clock, summary and rooms) ---- */
.rail-wrap { display: flex; flex: 1; min-height: 0; }
.rail { width: 280px; flex: none; background: var(--ix-navy); color: #f4f9ff; padding: var(--ix-sp-5) var(--ix-sp-4); display: flex; flex-direction: column; gap: var(--ix-sp-3); overflow: auto; }
.dark .rail, :host(.dark) .rail { background: var(--ix-surface); }
.rail .brand { color: #f4f9ff; margin-block-end: var(--ix-sp-4); }
.rail-clock { font-size: 3.25rem; font-weight: 300; line-height: 1; font-variant-numeric: tabular-nums; }
.rail-date { color: #b6c6d7; }
.rail .weather { background: rgba(255, 255, 255, .08); border-color: rgba(255, 255, 255, .14); color: #f4f9ff; align-self: flex-start; }
.rail .weather .muted { color: #b6c6d7; }
.rail-nav { display: flex; flex-direction: column; gap: 4px; margin-block-start: var(--ix-sp-4); flex: 1; }
.rail-nav .tab { color: #b6c6d7; justify-content: flex-start; border-radius: var(--ix-radius-sm); }
.rail-nav .tab[aria-current="page"] { background: rgba(0, 202, 236, .16); color: #fff; border-color: rgba(0, 202, 236, .5); }
.rail-admin { display: flex; gap: var(--ix-sp-2); }
.rail-admin .iconbtn { background: rgba(255, 255, 255, .08); border-color: rgba(255, 255, 255, .14); color: #f4f9ff; }
.rail-admin .iconbtn[aria-pressed="true"] { background: var(--ix-accent); color: var(--ix-accent-contrast); }
.rail-wrap > .content { flex: 1; min-width: 0; }

/* ---- layout: Stage (one room per screen, big type, swipe between rooms) ---- */
.lay-stage .nav { display: none; }
.lay-stage .topbar { background: transparent; border-block-end: 0; justify-content: space-between; }
.stage-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ix-sp-4); max-width: 1280px; margin-inline: auto; margin-block-end: var(--ix-sp-2); }
.stage-title { font-size: clamp(2.25rem, 7vw, 4.5rem); font-weight: var(--ix-fw-bold); letter-spacing: -0.02em; line-height: 1.05; margin: 0; text-align: center; flex: 1; }
.stage-dots { display: flex; justify-content: center; gap: 8px; margin-block-end: var(--ix-sp-5); }
.stage-dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--ix-border); }
.stage-dots i.on { background: var(--ix-accent); width: 24px; border-radius: 4px; }
@media (max-width: 420px) { .size-l { grid-column: span 1; } }

.room-tile { text-align: start; border: 1px solid var(--ix-border); background: var(--ix-surface); border-radius: var(--ix-radius-lg);
  padding: var(--ix-sp-4); min-height: 112px; display: flex; flex-direction: column; justify-content: space-between; gap: var(--ix-sp-3); box-shadow: var(--ix-shadow); }
.room-tile .rt-top { display: flex; justify-content: space-between; align-items: center; }
.room-tile .rt-name { font-size: var(--ix-fs-lg); font-weight: var(--ix-fw-medium); }
.room-tile .rt-meta { color: var(--ix-muted); font-size: var(--ix-fs-sm); }

/* ---------- cards ---------- */
.ix-card { position: relative; background: var(--ix-surface); border: 1px solid var(--ix-border); border-radius: var(--ix-radius-md);
  padding: var(--ix-sp-4); display: flex; flex-direction: column; gap: var(--ix-sp-3); box-shadow: var(--ix-shadow); min-width: 0; }
.ix-card.is-on { background: var(--ix-on); border-color: color-mix(in srgb, var(--ix-accent) 45%, var(--ix-border)); }
.ix-card.unavail { opacity: .62; }
.ix-card.busy { opacity: .75; }
.ix-card.flash-ok { outline: 2px solid var(--ix-ok); }
.ix-card.flash-err { outline: 2px solid var(--ix-danger); }
.card-head { display: flex; align-items: center; gap: var(--ix-sp-3); min-width: 0; }
.ico { --mdc-icon-size: 24px; width: 24px; height: 24px; flex: none; color: var(--ix-accent); display: inline-block; text-align: center; line-height: 24px; }
.ix-card:not(.is-on) .ico { color: var(--ix-muted); }
.card-title { font-weight: var(--ix-fw-medium); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-clamp: 2; flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
.card-state { color: var(--ix-muted); font-size: var(--ix-fs-sm); }
.card-state.err { color: var(--ix-danger); }
.card-value { font-size: var(--ix-fs-xl); font-weight: 300; font-variant-numeric: tabular-nums; }
.card-value small { font-size: var(--ix-fs-md); color: var(--ix-muted); margin-inline-start: 4px; }
.controls { display: flex; flex-wrap: wrap; gap: var(--ix-sp-2); align-items: center; }
.btn { min-height: var(--ix-touch); min-width: var(--ix-touch); padding-inline: var(--ix-sp-4); border-radius: var(--ix-radius-sm);
  border: 1px solid var(--ix-border); background: var(--ix-surface-2); display: inline-flex; align-items: center; justify-content: center; gap: var(--ix-sp-2); }
.btn.primary { background: var(--ix-accent); color: var(--ix-accent-contrast); border-color: var(--ix-accent); font-weight: var(--ix-fw-medium); }
.btn.danger { color: var(--ix-danger); }
.btn:disabled, .ix-card.unavail .btn, .ix-card.unavail input { opacity: .5; pointer-events: none; }
.ix-card.inert { pointer-events: none; }
.switch { position: relative; width: 56px; height: 32px; border-radius: var(--ix-radius-pill); border: 1px solid var(--ix-border); background: var(--ix-surface-2); padding: 0; flex: none; }
.switch::after { content: ""; position: absolute; inset-block-start: 3px; inset-inline-start: 3px; width: 24px; height: 24px; border-radius: 50%; background: var(--ix-muted); transition: inset-inline-start .15s, background .15s; }
.switch[aria-checked="true"] { background: var(--ix-accent); border-color: var(--ix-accent); }
.switch[aria-checked="true"]::after { inset-inline-start: 27px; background: var(--ix-accent-contrast); }
.switch-hit { min-width: var(--ix-touch); min-height: var(--ix-touch); display: grid; place-items: center; background: none; border: 0; padding: 0; }
.slider-row { display: grid; grid-template-columns: auto 1fr auto; gap: var(--ix-sp-3); align-items: center; font-size: var(--ix-fs-sm); color: var(--ix-muted); }
input[type="range"] { width: 100%; min-height: var(--ix-touch); accent-color: var(--ix-accent); margin: 0; }
output { min-width: 3ch; text-align: end; font-variant-numeric: tabular-nums; color: var(--ix-text); }
.stepper { display: flex; align-items: center; gap: var(--ix-sp-3); }
.stepper .val { font-size: var(--ix-fs-xl); font-weight: 300; min-width: 4ch; text-align: center; font-variant-numeric: tabular-nums; }
select, .input { min-height: var(--ix-touch); border: 1px solid var(--ix-border); background: var(--ix-surface); border-radius: var(--ix-radius-sm); padding-inline: var(--ix-sp-3); max-width: 100%; }
.cam { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: var(--ix-radius-sm); object-fit: cover; display: block; }
.cam-wrap { position: relative; }
.edit-row { display: flex; flex-wrap: wrap; gap: 4px; padding-block-start: var(--ix-sp-2); border-block-start: 1px dashed var(--ix-border); }
.edit-row .iconbtn { width: 40px; height: 40px; font-size: var(--ix-fs-sm); }
.badge { font-size: var(--ix-fs-xs); padding: 2px 8px; border-radius: var(--ix-radius-pill); background: var(--ix-surface-2); color: var(--ix-muted); white-space: nowrap; }
.badge.warn { background: color-mix(in srgb, var(--ix-warn) 20%, transparent); color: var(--ix-warn); }
.badge.ok { background: color-mix(in srgb, var(--ix-ok) 18%, transparent); color: var(--ix-ok); }
.empty { padding: var(--ix-sp-6); text-align: center; color: var(--ix-muted); border: 1px dashed var(--ix-border); border-radius: var(--ix-radius-md); }

/* ---------- forms / panels ---------- */
.panel { background: var(--ix-surface); border: 1px solid var(--ix-border); border-radius: var(--ix-radius-lg); padding: var(--ix-sp-5); box-shadow: var(--ix-shadow); margin-block-end: var(--ix-sp-4); }
.field { display: flex; flex-direction: column; gap: var(--ix-sp-1); margin-block-end: var(--ix-sp-4); }
.field > label, .label { font-size: var(--ix-fs-sm); color: var(--ix-muted); }
.row { display: flex; flex-wrap: wrap; gap: var(--ix-sp-3); align-items: center; }
.row.spread { justify-content: space-between; }
.choice-grid { display: grid; gap: var(--ix-sp-3); grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.choice { text-align: start; border: 2px solid var(--ix-border); background: var(--ix-surface); border-radius: var(--ix-radius-md); padding: var(--ix-sp-4); min-height: var(--ix-touch); display: flex; flex-direction: column; gap: var(--ix-sp-1); }
.choice[aria-pressed="true"] { border-color: var(--ix-accent); background: var(--ix-on); }
.choice b { font-weight: var(--ix-fw-medium); }
.stats { display: grid; gap: var(--ix-sp-3); grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.stat { background: var(--ix-surface-2); border-radius: var(--ix-radius-md); padding: var(--ix-sp-3) var(--ix-sp-4); }
.stat b { display: block; font-size: var(--ix-fs-xl); font-weight: 300; }
.stat span { font-size: var(--ix-fs-sm); color: var(--ix-muted); }

/* ---------- wizard ---------- */
.wiz { max-width: 1100px; margin-inline: auto; }
.progress { display: flex; gap: 6px; margin-block: var(--ix-sp-3) var(--ix-sp-4); }
.progress i { flex: 1; height: 6px; border-radius: 3px; background: var(--ix-border); }
.progress i.done { background: var(--ix-accent); }
.progress i.now { background: color-mix(in srgb, var(--ix-accent) 55%, var(--ix-border)); }
.wiz-foot { position: sticky; inset-block-end: 0; display: flex; justify-content: space-between; gap: var(--ix-sp-3); padding: var(--ix-sp-3) 0; background: linear-gradient(transparent, var(--ix-bg) 30%); }

/* ---------- entity list ---------- */
.filters { display: flex; flex-wrap: wrap; gap: var(--ix-sp-2); margin-block-end: var(--ix-sp-3); align-items: center; }
.filters .input { flex: 1 1 200px; }
.elist { display: flex; flex-direction: column; gap: var(--ix-sp-2); }
.erow { display: grid; grid-template-columns: auto 1fr auto; gap: var(--ix-sp-3); align-items: center; padding: var(--ix-sp-3); border: 1px solid var(--ix-border); border-radius: var(--ix-radius-md); background: var(--ix-surface); }
.erow.off { opacity: .6; }
.erow .meta { min-width: 0; }
.erow .nm { font-weight: var(--ix-fw-medium); overflow: hidden; text-overflow: ellipsis; }
.erow .id { font-size: var(--ix-fs-xs); color: var(--ix-muted); text-align: start; unicode-bidi: isolate; overflow-wrap: anywhere; }
.erow .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-block-start: 4px; }
.erow .acts { display: flex; flex-wrap: wrap; gap: var(--ix-sp-2); align-items: center; justify-content: flex-end; }
.chk { width: 26px; height: 26px; accent-color: var(--ix-accent); }
.note { font-size: var(--ix-fs-sm); color: var(--ix-warn); margin-block-start: 4px; }
.iconpick { display: flex; flex-wrap: wrap; gap: 6px; }
.iconpick button { width: 44px; height: 44px; border-radius: var(--ix-radius-sm); border: 1px solid var(--ix-border); background: var(--ix-surface); display: grid; place-items: center; }
.iconpick button[aria-pressed="true"] { border-color: var(--ix-accent); background: var(--ix-on); }

/* ---------- modal / toast ---------- */
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: grid; place-items: center; z-index: 20; padding: var(--ix-sp-4); }
.modal { background: var(--ix-surface); color: var(--ix-text); border-radius: var(--ix-radius-lg); padding: var(--ix-sp-5); width: min(520px, 100%); max-height: 90vh; overflow: auto; box-shadow: var(--ix-shadow); }
.modal h3 { font-size: var(--ix-fs-lg); margin-block-end: var(--ix-sp-3); }
.modal .row { justify-content: flex-end; margin-block-start: var(--ix-sp-4); }
.toast { position: fixed; inset-inline: var(--ix-sp-4); inset-block-end: var(--ix-sp-4); margin-inline: auto; width: fit-content; max-width: 92vw; z-index: 30;
  padding: var(--ix-sp-3) var(--ix-sp-5); border-radius: var(--ix-radius-pill); background: var(--ix-text); color: var(--ix-bg); box-shadow: var(--ix-shadow); }
.toast.err { background: var(--ix-danger); color: #fff; }

/* ---------- responsive ---------- */
@media (max-width: 640px) {
  .hero .clock { font-size: 2.1rem; } .hero .greet { font-size: var(--ix-fs-lg); }
  .erow { grid-template-columns: auto 1fr; } .erow .acts { grid-column: 1 / -1; justify-content: flex-start; }
  .brand .word { display: none; }
  .rail { display: none; }
}
@media (min-width: 1024px) { :host { --ix-card-min: 200px; } }
@media (max-width: 520px) { :host { --ix-card-min: 260px; } }
.grid.room-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
@media (orientation: landscape) and (max-height: 520px) { .content { padding-block-start: var(--ix-sp-3); } .hero .clock { font-size: 2rem; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
.shop-sec { margin: var(--ix-sp-4) 0 var(--ix-sp-2); font-size: var(--ix-fs-sm); color: var(--ix-muted); }
.shop-item { display: flex; align-items: center; gap: var(--ix-sp-3); min-height: 56px; border-block-end: 1px solid var(--ix-border); }
.shop-item .shop-name { flex: 1; font-size: 1.1rem; overflow-wrap: anywhere; }
.shop-item.done .shop-name { text-decoration: line-through; color: var(--ix-muted); }
.shop-check { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 2px solid var(--ix-border); background: var(--ix-surface); color: var(--ix-accent-contrast); font-size: 1.4rem; display: grid; place-items: center; cursor: pointer; }
.shop-item.done .shop-check { background: var(--ix-accent); border-color: var(--ix-accent); }
.erow .acts { display: flex; gap: var(--ix-sp-2); flex-wrap: wrap; }
.panel a { color: var(--ix-accent-strong); }

/* scenarios: gallery, builder, home buttons */
.tpl-grid { display: grid; gap: var(--ix-sp-3); grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.tpl { text-align: start; display: flex; flex-direction: column; gap: 4px; padding: var(--ix-sp-4); min-height: 112px; border: 1px solid var(--ix-border); background: var(--ix-surface); border-radius: var(--ix-radius-md); }
.tpl:hover, .tpl:focus-visible { border-color: var(--ix-accent); }
.tpl .tpl-ic { font-size: 1.6em; line-height: 1; }
.tpl.scratch { border-style: dashed; }
.sc-steps { list-style: none; display: flex; gap: var(--ix-sp-2); padding: 0; margin: 0 0 var(--ix-sp-4); flex-wrap: wrap; }
.sc-steps li { display: flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 999px; background: var(--ix-bg-soft, transparent); border: 1px solid var(--ix-border); color: var(--ix-muted); font-size: var(--ix-fs-sm); }
.sc-steps li span { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--ix-border); color: var(--ix-text, inherit); font-weight: var(--ix-fw-medium); }
.sc-steps li[aria-current="step"] { color: var(--ix-text, inherit); border-color: var(--ix-accent); }
.sc-steps li[aria-current="step"] span, .sc-steps li.done span { background: var(--ix-accent); color: var(--ix-accent-contrast); }
.sc-room { border: 1px solid var(--ix-border); border-radius: var(--ix-radius-md); margin-block-end: var(--ix-sp-2); background: var(--ix-surface); }
.sc-room > summary { cursor: pointer; padding: var(--ix-sp-3) var(--ix-sp-4); min-height: var(--ix-touch); display: flex; align-items: center; gap: 8px; font-weight: var(--ix-fw-medium); }
.sc-dev { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ix-sp-2) var(--ix-sp-4); padding: var(--ix-sp-2) var(--ix-sp-4); border-top: 1px solid var(--ix-border); min-height: var(--ix-touch); }
.sc-dev.on { background: var(--ix-on); }
.sc-dev > .row { flex: 1 1 200px; min-width: 0; } .sc-dn { overflow-wrap: anywhere; }
.sc-ops { display: flex; flex-wrap: wrap; gap: 6px; }
.sc-val { display: flex; align-items: center; gap: 6px; } .sc-val .input { width: 84px; }
.chip { min-height: 40px; padding-inline: 14px; border-radius: 999px; border: 1px solid var(--ix-border); background: var(--ix-surface); }
.chip[aria-pressed="true"] { background: var(--ix-accent); border-color: var(--ix-accent); color: var(--ix-accent-contrast); }
.chip.ic { min-width: 44px; font-size: 1.15em; padding-inline: 8px; }
.sc-more { margin-block-start: var(--ix-sp-4); } .sc-more > summary { cursor: pointer; min-height: var(--ix-touch); display: flex; align-items: center; font-weight: var(--ix-fw-medium); }
.sc-dashrow { gap: var(--ix-sp-3); align-items: flex-start; margin-block-end: var(--ix-sp-4); }
.sc-summary { padding: var(--ix-sp-4); border-radius: var(--ix-radius-md); background: var(--ix-on); } .sc-summary p { margin: 4px 0; } .sc-summary ul { margin: 4px 0 0; padding-inline-start: 20px; }
.sc-nav { justify-content: space-between; margin-block-start: var(--ix-sp-4); }
.scn-row { display: flex; flex-wrap: wrap; gap: var(--ix-sp-3); }
.scn-tile { display: flex; align-items: center; gap: var(--ix-sp-3); min-height: 64px; padding: 0 var(--ix-sp-5); border-radius: var(--ix-radius-lg); border: 1px solid var(--ix-border); background: var(--ix-surface); box-shadow: var(--ix-shadow); position: relative; font-weight: var(--ix-fw-medium); }
.scn-tile:hover, .scn-tile:focus-visible { border-color: var(--ix-accent); }
.scn-tile:active, .scn-tile.busy { background: var(--ix-on); }
.scn-tile.add { border-style: dashed; color: var(--ix-muted); box-shadow: none; }
.scn-ic { font-size: 1.5em; line-height: 1; }
.scn-bad { position: absolute; inset-block-start: 6px; inset-inline-end: 8px; width: 18px; height: 18px; border-radius: 50%; background: var(--ix-danger); color: #fff; font-size: 12px; display: grid; place-items: center; }
.scn-empty { display: flex; align-items: center; gap: var(--ix-sp-4); text-align: start; padding: var(--ix-sp-4) var(--ix-sp-5); border: 1px dashed var(--ix-border); border-radius: var(--ix-radius-lg); background: var(--ix-surface); min-height: 72px; }
@media (prefers-reduced-motion: no-preference) { .scn-tile:active { transform: scale(.98); transition: transform .08s; } }
`;
