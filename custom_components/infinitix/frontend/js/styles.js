// Design tokens + styles.  To re-brand, change only the token block (":host" and ".dark").
// Logical properties are used throughout so RTL (Hebrew) and LTR (English) both work.

export const CSS = `
:host {
  /* ---- brand: INFINITIX Smart Control 360° reference design (v1.6.3) ---- */
  --ix-brand-name: "INFINITIX";
  --ix-accent: #22c1e3;              /* brand cyan  (reference: oklch(77% .14 215)) */
  --ix-accent-strong: #0e7c99;       /* text/links/states in accent, AA on white */
  --ix-accent-contrast: #052631;     /* text on brand cyan */
  --ix-navy: #101e25;

  /* ---- typography: Rubik (bundled locally, SIL OFL) ---- */
  --ix-font: "Rubik", system-ui, -apple-system, "Segoe UI", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
  --ix-fs-xs: 0.75rem; --ix-fs-sm: 0.875rem; --ix-fs-md: 0.95rem; --ix-fs-lg: 1.15rem; --ix-fs-xl: 1.7rem; --ix-fs-xxl: 2.75rem;
  --ix-fw-regular: 400; --ix-fw-medium: 600; --ix-fw-bold: 700; --ix-tracking-brand: 0.22em;

  /* ---- spacing / radius / sizing ---- */
  --ix-sp-1: 4px; --ix-sp-2: 8px; --ix-sp-3: 12px; --ix-sp-4: 16px; --ix-sp-5: 22px; --ix-sp-6: 32px;
  --ix-radius-sm: 10px; --ix-radius-md: 13px; --ix-radius-lg: 15px; --ix-radius-xl: 21px; --ix-radius-pill: 999px;
  --ix-touch: 44px;
  --ix-card-min: 225px;
  --ix-side-w: clamp(250px, 21vw, 320px);

  /* ---- light theme (default) ---- */
  --ix-bg: #f4f7f8; --ix-surface: #ffffff; --ix-surface-2: #f4f7f8; --ix-text: #101b23; --ix-muted: #4b616c;
  --ix-border: #dce6eb; --ix-ok: #0b7a43; --ix-warn: #87601a; --ix-danger: #b3261e;
  --ix-on: #e9f7fa;                  /* "soft" */
  --ix-shadow: 0 8px 24px rgba(20, 46, 57, .063);
  display: block; height: 100%; min-height: 100vh;
}
:host(.dark) {
  --ix-accent-strong: #5fd4ee; --ix-accent-contrast: #052631;
  --ix-bg: #0b141a; --ix-surface: #121f27; --ix-surface-2: #182a34; --ix-text: #eaf3f6; --ix-muted: #9db2bc;
  --ix-border: #24363f; --ix-ok: #4cd38a; --ix-warn: #f0c060; --ix-danger: #ff7b72;
  --ix-on: #10323d;
  --ix-shadow: 0 8px 24px rgba(0, 0, 0, .35);
}

* { box-sizing: border-box; }
.app { font-family: var(--ix-font); color: var(--ix-text); background: var(--ix-bg); min-height: 100vh; height: 100%;
  display: flex; flex-direction: column; font-size: var(--ix-fs-md); -webkit-tap-highlight-color: transparent; }
[hidden] { display: none !important; }
button, select, input { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--ix-accent-strong); outline-offset: 3px; }

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
.ico { --mdc-icon-size: 22px; width: 22px; height: 22px; flex: none; color: var(--ix-accent-strong); display: inline-block; text-align: center; line-height: 24px; }
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
.weather { font: inherit; color: inherit; cursor: pointer; min-height: 44px; }
.drag-handle { cursor: grab; touch-action: none; user-select: none; display: inline-grid; place-items: center; }
.ix-card.dragging { opacity: .55; outline: 2px dashed var(--ix-accent); }
.ix-card.drop-target { outline: 3px solid var(--ix-accent); outline-offset: 2px; }
.fc-row { display: flex; gap: var(--ix-sp-2); overflow-x: auto; padding-block-end: var(--ix-sp-2); }
.fc { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; padding: var(--ix-sp-2); border-radius: 12px; background: var(--ix-surface-2, var(--ix-surface)); border: 1px solid var(--ix-border); }
.saver { position: fixed; inset: 0; z-index: 50; background: #05121c; color: #eaf6ff; display: grid; place-items: center; cursor: pointer; }
.saver .sv-inner { transform: translate(var(--dx, 0), var(--dy, 0)); transition: transform 2s ease; text-align: center; padding: var(--ix-sp-4); max-width: 1100px; width: 100%; }
.saver .brand { justify-content: center; opacity: .8; }
.sv-clock { font-size: clamp(4rem, 14vw, 10rem); font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.sv-date { font-size: clamp(1.1rem, 2.6vw, 1.8rem); margin-block: var(--ix-sp-2) var(--ix-sp-4); opacity: .9; }
.sv-cols { display: flex; gap: var(--ix-sp-4); justify-content: center; flex-wrap: wrap; text-align: start; }
.sv-weather, .sv-agenda { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 18px; padding: var(--ix-sp-4); min-width: 280px; flex: 1; }
.saver .fc { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
.saver .muted { color: #a9c4d6; }
.ag-item { display: flex; flex-direction: column; padding-block: 6px; border-block-end: 1px solid rgba(127,127,127,.25); }
.pg-list { max-height: 50vh; overflow: auto; }
.pg-room { border: 1px solid var(--ix-border); border-radius: 12px; margin-block-end: var(--ix-sp-2); }
.badge.err { background: #b3261e; color: #fff; }
.src-row { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(180px, 2fr) auto; gap: var(--ix-sp-2); align-items: center; margin-block-end: var(--ix-sp-2); }
@media (max-width: 600px) { .src-row { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .saver .sv-inner { transform: none !important; } }

/* =================== 0.4 shell (reference design) =================== */
.shell { display: grid; grid-template-columns: var(--ix-side-w) minmax(0, 1fr); flex: 1; min-height: 0; }
.shell.no-side { grid-template-columns: minmax(0, 1fr); }
.main { min-width: 0; padding: var(--ix-sp-4) clamp(14px, 2.2vw, 32px) 40px; }
.side { position: sticky; top: 0; align-self: start; height: 100vh; overflow: auto; background: var(--ix-surface); border-inline-end: 1px solid var(--ix-border);
  padding: 20px 14px 14px; display: flex; flex-direction: column; gap: 12px; scrollbar-color: var(--ix-border) var(--ix-surface); }
.side-brand { display: flex; flex-direction: column; gap: 4px; padding: 0 10px 14px; border-block-end: 1px solid var(--ix-border); }
.side-brand ha-menu-button { margin-inline-start: -8px; }
.logo { display: block; width: 176px; max-width: 100%; height: auto; }
.logo-dark { display: none; } :host(.dark) .logo-light { display: none; } :host(.dark) .logo-dark { display: block; }
.side-sub { color: var(--ix-muted); font-size: .78rem; font-weight: 500; text-align: start; }
.side-nav { display: flex; flex-direction: column; gap: 6px; }
.side-home { width: 100%; min-height: 60px; display: flex; align-items: center; gap: 12px; padding: 9px 11px; border: 1px solid var(--ix-border);
  border-radius: 14px; background: var(--ix-surface); color: var(--ix-text); font-size: 1rem; text-align: start; }
.side-home[aria-current="page"], .side-cat[aria-current="page"] { background: var(--ix-on); border-color: var(--ix-accent-strong); }
.side-label { font-size: .8rem; color: var(--ix-muted); font-weight: 500; margin: 12px 10px 4px; }
.side-group { display: flex; flex-direction: column; gap: 4px; }
.side-cat { display: grid; grid-template-columns: 36px minmax(0, 1fr) 26px; align-items: center; gap: 10px; min-height: 54px; padding: 8px 10px;
  border: 1px solid transparent; border-radius: 13px; background: transparent; color: var(--ix-text); text-align: start; }
.side-cat strong { font-weight: 600; font-size: .94rem; line-height: 1.3; }
.side-cat:not([aria-current="page"]):hover, .side-link:not([aria-current="page"]):hover { background: var(--ix-bg); }
.side-count { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--ix-border); border-radius: 50%;
  color: var(--ix-muted); font-size: .75rem; font-variant-numeric: tabular-nums; justify-self: end; }
.side-link { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 10px; border: 1px solid transparent; border-radius: 11px;
  background: transparent; color: var(--ix-text); text-align: start; }
.side-link span:first-of-type { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.side-link[aria-current="page"] { background: var(--ix-on); border-color: color-mix(in srgb, var(--ix-accent-strong) 55%, transparent); color: var(--ix-text); }
.side-meta { color: var(--ix-muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
.side-foot { margin-block-start: auto; display: grid; gap: 4px; padding-block-start: 10px; border-block-start: 1px solid var(--ix-border); }
.side-tool { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 6px 10px; border: 1px solid var(--ix-border); border-radius: 11px;
  background: var(--ix-surface); color: var(--ix-text); text-align: start; font-size: .88rem; }
.side-tool[aria-pressed="true"], .side-tool[aria-current="page"] { background: var(--ix-on); border-color: var(--ix-accent-strong); }
.side-clock { padding: 4px 10px; display: grid; } .side-clock time { font-size: 2.6rem; font-weight: 300; line-height: 1.1; font-variant-numeric: tabular-nums; }
.side-clock span { color: var(--ix-muted); font-size: .85rem; }
.tile-ico { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 11px; background: var(--ix-on); color: var(--ix-accent-strong); flex: none; }
.tile-ico .ico { color: var(--ix-accent-strong); --mdc-icon-size: 20px; width: 20px; height: 20px; line-height: 20px; }
.tile-ico.big { width: 48px; height: 48px; border-radius: 13px; } .tile-ico.big .ico { --mdc-icon-size: 26px; width: 26px; height: 26px; }
.wiz-brand { max-width: 1100px; margin: 0 auto var(--ix-sp-3); }

/* chips bar */
.chips-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
.chip-info { display: grid; gap: 3px; align-content: center; justify-items: start; min-width: 120px; min-height: 52px; padding: 8px 12px;
  background: var(--ix-surface); border: 1px solid var(--ix-border); border-radius: 11px; color: var(--ix-text); text-align: start; line-height: 1.15; }
.chip-info small { font-size: .7rem; color: var(--ix-muted); }
.chip-info time, .chip-info strong { font-size: 1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.chip-sub { color: var(--ix-muted); font-size: .72rem; }
.chip-btn { cursor: pointer; } .chip-btn:hover { border-color: var(--ix-accent-strong); }
.tag { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 9px; background: var(--ix-on); color: var(--ix-accent-strong); font-size: .82rem; font-weight: 500; }
.tag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.tag-warn { background: color-mix(in srgb, var(--ix-warn) 14%, var(--ix-surface)); color: var(--ix-warn); }

/* dashboard home */
.dash-heading { margin: 6px 0 14px; padding-block-end: 12px; border-block-end: 1px solid var(--ix-border); }
.dash-heading h1 { font-size: clamp(1.8rem, 4vw, 2.8rem); letter-spacing: -.02em; line-height: 1.15; margin: 0 0 2px; font-weight: 700; }
.dash-heading p { color: var(--ix-muted); margin: 0; }
.dash-hero-grid { display: grid; grid-template-columns: minmax(0, 2.5fr) minmax(190px, 1fr); gap: 14px; margin-block: 12px; }
.dash-hero, .dash-clock { padding: clamp(15px, 2.2vw, 26px); min-width: 0; background: var(--ix-surface); border: 1px solid var(--ix-border); border-radius: var(--ix-radius-xl); box-shadow: var(--ix-shadow); }
.dash-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(160px, .8fr); align-items: center; gap: 14px;
  background: radial-gradient(ellipse at 9% 25%, var(--ix-on) 0%, var(--ix-surface) 60%); }
.dash-hero h2 { font-size: clamp(1.4rem, 3vw, 2.4rem); line-height: 1.1; margin: 7px 0 10px; font-weight: 700; }
.dash-hero p { color: var(--ix-muted); margin: 0; } .warn-text { color: var(--ix-warn) !important; }
.dash-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--ix-border); background: var(--ix-on); color: var(--ix-accent-strong); font-size: .83rem; }
.dash-shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.dash-shortcut { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; border: 1px solid var(--ix-border); border-radius: 11px;
  background: var(--ix-surface); color: var(--ix-text); text-align: start; font-size: .85rem; }
.dash-shortcut:hover, .dash-metric:hover, .room-tile:hover { border-color: var(--ix-accent-strong); }
.dash-clock { display: grid; gap: 4px; align-content: center; justify-items: start; }
.dash-clock > span, .dash-clock small { color: var(--ix-muted); font-size: .82rem; }
.dash-clock time { font-size: clamp(2.2rem, 4.7vw, 4.2rem); font-variant-numeric: tabular-nums; line-height: 1.12; font-weight: 400; }
.dash-clock strong { color: var(--ix-accent-strong); font-size: .9rem; font-weight: 500; }
.dash-clock .weather { margin-block-start: 6px; }
.dash-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 10px; margin-block: 4px 6px; }
.dash-metric { display: flex; align-items: center; gap: 10px; min-height: 68px; width: 100%; padding: 10px; border: 1px solid var(--ix-border); border-radius: var(--ix-radius-md);
  background: var(--ix-surface); color: var(--ix-text); box-shadow: var(--ix-shadow); text-align: start; }
.dash-metric strong, .dash-metric small { display: block; overflow-wrap: anywhere; }
.live-scope { display: block; color: var(--ix-muted); font-size: .8rem; }
.dash-section { margin-block: 22px; } .dash-section h2 { font-size: 1.05rem; margin: 0 0 8px; }
.linkbtn { border: 0; background: transparent; color: var(--ix-accent-strong); font-weight: 600; min-height: 36px; padding: 4px 6px; }

/* category view */
.crumbs ol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px; list-style: none; padding: 0; margin: 0 0 10px; }
.crumbs li { display: inline-flex; align-items: center; gap: 7px; color: var(--ix-muted); font-size: .9rem; }
.crumbs li + li::before { content: "›"; color: var(--ix-accent-strong); }
:host([dir="rtl"]) .crumbs li + li::before { content: "‹"; }
.crumbs [aria-current="page"] { font-weight: 700; color: var(--ix-text); }
.flow-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-block-end: 12px; }
.flow-heading h1 { font-size: clamp(1.7rem, 4vw, 2.6rem); margin: 0; font-weight: 700; letter-spacing: -.02em; }
.overview { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: var(--ix-on); border: 1px solid color-mix(in srgb, var(--ix-accent) 40%, var(--ix-border));
  border-radius: var(--ix-radius-lg); padding: 14px; margin: 6px 0 14px; }
.overview .ov-data { flex: 1; min-width: 150px; } .overview h2 { margin: 0 0 2px; font-size: 1.15rem; }
.overview .live-scope { color: var(--ix-text); font-size: .9rem; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 12px; }
.chip { border-radius: 999px; min-height: 38px; padding: 6px 12px; font-size: .89rem; border: 1px solid var(--ix-border); background: var(--ix-surface); color: var(--ix-text); }
.chip[aria-pressed="true"] { background: var(--ix-on); border-color: var(--ix-accent-strong); color: var(--ix-text); font-weight: 600; }

/* cards in the reference look */
.ix-card { border-radius: var(--ix-radius-md); padding: 13px; gap: 9px; }
.ix-card .card-head > .ico { box-sizing: content-box; padding: 8px; border-radius: 10px; background: var(--ix-on); color: var(--ix-accent-strong); }
.ix-card:not(.is-on) .card-head > .ico { background: var(--ix-surface-2); color: var(--ix-muted); }
.ix-card.is-on { background: var(--ix-surface); border-color: color-mix(in srgb, var(--ix-accent-strong) 45%, var(--ix-border)); }
.ix-card.is-on .card-state { color: var(--ix-accent-strong); font-weight: 600; }
.btn { border-radius: var(--ix-radius-sm); background: var(--ix-surface); font-weight: 600; }
.btn:not(:disabled):hover { border-color: var(--ix-accent-strong); }
.btn.primary { background: var(--ix-accent); border-color: transparent; color: var(--ix-accent-contrast); }
.panel { border-radius: var(--ix-radius-lg); }
.room-tile { border-radius: var(--ix-radius-md); min-height: 104px; color: var(--ix-text); }
.weather { background: var(--ix-surface); }

/* narrow screens: side bar becomes a top bar with a scrolling row (reference ≤675px) */
@media (max-width: 760px) {
  .shell { display: block; }
  .side { position: static; height: auto; overflow: visible; border-inline-end: 0; border-block-end: 1px solid var(--ix-border); padding: 10px 12px; gap: 8px; }
  .side-brand { flex-direction: row; align-items: center; gap: 8px; padding: 0 0 8px; }
  .logo { width: 132px; } .side-sub, .side-label, .side-clock, .side-count, .side-meta { display: none; }
  .side-nav { flex-direction: row; overflow-x: auto; scrollbar-width: none; gap: 6px; }
  .side-nav::-webkit-scrollbar { display: none; }
  .side-group { display: contents; }
  .side-home, .side-cat, .side-link { flex: none; min-height: 44px; width: auto; display: inline-flex; gap: 6px; padding: 6px 10px; border: 1px solid var(--ix-border); border-radius: 999px; font-size: .85rem; }
  .side-home .tile-ico, .side-cat .tile-ico { width: 26px; height: 26px; border-radius: 8px; }
  .side-foot { display: flex; overflow-x: auto; border: 0; padding: 0; margin: 0; }
  .side-tool { flex: none; } .side-tool span { display: none; }
  .dash-hero-grid { grid-template-columns: 1fr; } .dash-hero { grid-template-columns: 1fr; }
  .chip-info { min-width: 0; flex: 1 1 40%; }
}
@media (max-width: 1000px) and (min-width: 761px) { .dash-hero { grid-template-columns: 1fr; } }

.splash { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: var(--ix-bg); }
.splash .logo { width: 220px; }
.splash-bar { width: 160px; height: 4px; border-radius: 4px; background: var(--ix-border); overflow: hidden; position: relative; }
.splash-bar::after { content: ""; position: absolute; inset-block: 0; inset-inline-start: 0; width: 40%; border-radius: 4px; background: var(--ix-accent); animation: ix-load 1.1s ease-in-out infinite; }
@keyframes ix-load { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
:host([dir="rtl"]) .splash-bar::after { animation-name: ix-load-rtl; }
@keyframes ix-load-rtl { 0% { transform: translateX(100%); } 100% { transform: translateX(-250%); } }
@media (prefers-reduced-motion: reduce) { .splash-bar::after { animation: none; width: 100%; } }

/* numbers with signs/units stay left-to-right inside Hebrew text */
[data-room-temp], .side-meta, output { unicode-bidi: isolate; direction: ltr; }
.card-value, .stepper .val { unicode-bidi: plaintext; }
.sv-logo { display: block; width: 200px; height: auto; margin: 0 auto 8px; opacity: .9; }
.lay-stage { --ix-card-min: 300px; }
.floating-nav { inset-inline-end: auto; inset-inline-start: var(--ix-sp-4); }
.steps-list { padding-inline-start: 22px; line-height: 1.7; } .steps-list bdi { font-family: monospace; font-size: .85em; overflow-wrap: anywhere; }
.choice .badge { align-self: flex-start; margin-block-start: 4px; }
a.btn { text-decoration: none; color: var(--ix-text); }
.panel h3 { margin-block: 18px 6px; font-size: 1.02rem; }
`;
