# INFINITIX Smart Home 0.4.0 – test report

Date: 2026-11-19. Baseline before changes: repo already at 0.3.0 (not 0.1.0); 37 tests passed (only with `PYTHONPATH=.`; `pytest.ini` now sets `pythonpath`).

# 0.4.0 (2026-11-19)

**Automated – pytest on HA 2026.2.3 (pytest-homeassistant-custom-component 0.13.316): 59 passed** (37 existing + 22 new in `tests/test_v4.py`):
storage v3→v4 migration keeps all data and is idempotent; real `.storage` v1 file migrates with backup kept; newer schema refused and left untouched;
non-admin gets `unauthorized` for preview/sources/log/licence/import/run; member status contains no entity ids; `save_config` cannot change run log,
licence, scenarios or sensor mapping; layout changes keep rooms/cards and send no service calls; same occurrence never runs twice; time trigger fires once
and logs; missing sensor → skip + warning + log; stale sensor not used; explicit mapping beats auto-discovery; preview runs nothing; restore rules
(latest wins, unknown/tie = ambiguous → no action); catch-up inside window only, not repeated if it already ran; integration reload never runs recovery;
recovery runs on the real `homeassistant_started` event; brightness dropped for on/off-only lights; Free/Pro proposal + legacy grandfathering; downgrade
locks extras without deleting, upgrade unlocks unchanged; **regression: inventory with real devices** (bug found live, see below).
**Node (`node --test tests/js/*.test.mjs`): 5 passed** – screen-type default, per-device choice wins, Rail falls back on narrow screens, plan limits,
storage failures never throw, switching layouts leaves customisations unchanged, drag reorder.

**Live – real Home Assistant 2026.2.3 process + HA demo integration (129 entities) + real Jewish Calendar integration, Chrome 153 headless (Playwright):**
- INFINITIX and Jewish Calendar added through their real config flows; admin + non-admin ("family") users.
- Wizard: all 9 steps walked to "save & open", no panel errors. Scenarios step found the real Jewish Calendar sensors automatically
  (`upcoming_candle_lighting`, `upcoming_havdalah`, `issur_melacha_in_effect`) with status OK and current values.
- Dashboard (reference design), category view: status "0 on · 16 off" → batch "turn on" asked for confirmation, sent `turn_on` per available entity,
  status updated live from HA to "10 on · 6 off".
- Per-device layout: Rows / Stage / Mosaic / Rail switched from the panel → stored only in the browser, server config byte-identical, **0 service calls**.
- Screensaver preview with agenda from real `calendar`/`todo` entities; tap closes it without acting. Forecast modal: 24 h + 7 days from the HA weather entity.
- Light, dark, tablet 1280×800, phone 390×844, desktop 1440×900 screenshots reviewed.
- Household user: no settings/edit; status view works; live WebSocket: scan/export/scenarios list/log/save_config → `unauthorized`, status → OK.
- Performance: 483 configured entities; lighting view with 413 cards fully rendered in 0.31 s; 50 live state changes → 0 long tasks.
- **Real restart:** time scenario due 23:41 while HA was stopped; HA started 23:42 → ran once as `catch-up` (logged), switch turned off; wizard did not re-appear,
  all settings kept.

**Bugs found and fixed in this round**
- `discovery.collect_inventory` iterated `device_registry.devices` (keys), so the panel failed to load ("Unknown error") on any HA with real devices.
  Introduced by the 0.3 deprecation fix; unit tests had no devices. Fixed (`.values()`) + regression test.
- Layout dialog read radio buttons as always checked → a chosen layout silently fell back to the home default. Fixed.
- Negative/unit temperatures rendered reversed in RTL (`24.4°C-`). Fixed with LTR isolation.

**Not verified yet (needs hardware / real home / time)**
- A real Shabbat end-to-end with a physical switch and light (only the mechanism, a real restart and the real sensors were verified; the Jewish Calendar
  instance used the default location, so the times themselves were not checked against a calendar).
- Shopping list against the HA mobile app and Assist (panel side unchanged from 0.3; same `todo` entity).
- Real 11" wall tablet (touch drag, swipe in Stage, kiosk), Safari/iOS, Android WebView.
- HA 2026.11.x this round (only 2026.2.3 live + unit tests; 2026.11.1 was covered in 0.3). Marketplace/HACS/ZIP install flows not re-run.
- Live cameras, alarm with code, locks and media on real devices (demo entities only).
- Russian strings for 0.4 are a draft.
- The HA loading screen ("Loading data" with the HA logo) belongs to Home Assistant and cannot be rebranded without modifying HA; the panel's own
  loading screen now shows the INFINITIX logo.
- Free/Pro split is a proposal (the spec document's own split was not available in this session); enforcement is off.
- Open-Meteo fallback and external licence check: not implemented (need explicit consent / business decision).

# (history) INFINITIX Smart Home 0.2.0 – test report

Date: 2026-11-14. HA versions tested: **2026.2.3** (Python 3.13) and **2026.11.1** (Python 3.14, live instance only). Unit tests: 2026.2.3 and 2026.10.4.

# 0.3.0 – wizard reordered, pairing, media (2026-11-19)
New wizard order: 1 home name (+ language, screen type), 2 rooms (creating a room also creates a real HA area through
`config/area_registry/create`), 3 add Matter / Zigbee devices, 4 media players with network discovery, 5 scenarios with the
Hebrew date, then device review, cameras, customize, preview. The same pages (devices, media, scenarios, cameras) are in
the dashboard under Settings. The old "mode" and "welcome" steps were removed (mode defaults to automatic proposal).

**Verified**
- pytest on 2026.10.4: **37 passed** (+4: permit via fake `zha.permit` / `mqtt.publish`, topic/duration validation, foreign-flow
  refusal, admin-only commands).
- Live HA 2026.11.1 + Chromium: all 9 steps walked; a real HA area was created from step 2; pairing page reports that
  Matter/ZHA/MQTT are not set up (true on the test instance) and offers the HA setup link; media: Denon with an empty host
  runs HA's own network search (found nothing: no receiver in the sandbox) and shows the localized message; Samsung to a
  closed address returns HA's `cannot_connect`; foreign flow ids are refused; Hebrew date shown (9 Kislev 5787 on 19 Nov 2026,
  midnight-based); the new Settings buttons open the pages.

**Not verified (no hardware here)**
- Adding an actual Matter device (`matter/commission` is forwarded to HA as-is), actual ZHA joining (`zha.permit`) and
  Zigbee2MQTT joining (publishes `{"time": N}` to `<base>/bridge/request/permit_join`; unverified against a real Z2M).
- Adding a real TV / Denon receiver; follow-up steps (TV codes) are relayed generically; a step with fields the panel cannot
  render sends the user to HA's own screen. Network discovery depends on HA's own SSDP/zeroconf finding the device.
- "New devices" detection in the pairing page compares HA's device registry before/after (polled every 4 s).

## 0.2.0 additions (2026-11-14) – what was and was not tested
Added: palette from infinitix.co.il (values extracted earlier; the site was not re-fetched), language choice (he/en/ru) as
the first wizard step, ONVIF camera adding, four layouts (Mosaic/Rows/Rail/Stage), storage schema v3 (v1→v2 layout rename,
v3 scenarios; pre-migration backup kept), server-side scenarios (Shabbat timer, sunrise/sunset, Jewish-calendar times),
shopping-list card on HA `todo` entities.

**Verified on real Home Assistant**
- pytest on 2026.10.4: **33 passed** (22 earlier + 11 new: scenario validation, Shabbat condition never guesses when the sensor
  is unavailable, migration v1→v3, `ru` language, camera input checks, time/Jewish-calendar triggers firing through HA's
  scheduler, admin-only scenario commands, general config save not wiping scenarios).
  pytest cannot be imported on 2026.11.1 (no harness release yet), so unit tests run on 2026.10.4.
- Live HA **2026.11.1** (real process, Chromium): wizard with 3 languages (RTL/LTR switch), Rubik font loaded, 9-step flow,
  four layouts rendered, v1→v2 migration ran with backup, camera WS endpoints (discover, add to a closed port returns HA's own
  `onvif_error`, bad host/port rejected, non-admin gets `unauthorized`).
- Live 2026.11.1 with HA's real **Jewish Calendar** integration added: entity keys and unique-id pattern match what the
  runner resolves (`upcoming_candle_lighting`, `upcoming_havdalah`, `issur_melacha_in_effect`); scenarios saved over WS,
  next-run computed from the real havdalah sensor (18:20 UTC on the test day), conditional scenario ran with `force`, last
  run persisted, bad payloads (lock domain, offset 9999) rejected. UI: template → editor → save → list → run now.
- Live shopping list (`todo.shopping_list`, classified as the `shopping` card with high confidence): multi-item add (comma /
  new line / semicolon, duplicates dropped), grouping by section, tick, remove, clear completed – all through HA todo services.
- Fixed this round: `device_registry.devices` deprecation warning (iterating the registry).

**Not verified (do not rely on these yet)**
- **A real ONVIF camera**: adding, entity creation, discovery on a real LAN. Only error paths were exercised.
- **A scenario firing on its real schedule on a real device**: firing was tested with HA's time-travel test helper and a
  forced run on the live instance, not by waiting for a real sunset/candle-lighting. Whether the Jewish Calendar sensors
  roll over to the next event exactly when expected was not observed (on the test day `upcoming_candle_lighting` was a
  past time; the runner then waits for the sensor to change).
- Catch-up after an HA restart (a scenario due while HA was down is skipped, not replayed).
- Sunrise/sunset triggers: `next_run` computed live; firing at the real sun event not observed.
- Stage swipe on a touch device; Rail/Stage on narrow phones; layout choice inside the wizard preview (shows Mosaic content).
- Russian text is a machine-assisted draft and needs native review.
- Not built: Pro/licence gating of layouts, purchase-history suggestions for the shopping list, scenarios beyond
  light/switch/fan/input_boolean on/off (+ light brightness).
- Camera passwords are passed to HA's own ONVIF flow and are not stored by INFINITIX (code review + UI state cleared), not
  audited beyond that.

# 0.1.0 baseline

## A. Verified against real Home Assistant
**A1. pytest with the HA test harness (pytest-homeassistant-custom-component 0.13.316) – 22 passed.**
Config flow (single entry), options flow, panel registered/removed, scan is read-only, admin commands rejected
for a non-admin token, inventory filtered by user permission, save persists across reload and re-discovery keeps
user choices, invalid config rejected, classification, import/export with re-mapping, migration defaults.

**A2. Live HA 2026.2.3 instance (real `hass` process, real HTTP/WebSocket, Chromium via Playwright).**
Entities: HA `template` sensor/light/cover/switch + HA's built-in `demo` integration (lights, covers, climate,
locks, alarm, media players, cameras, weather); 3 areas created via the registry API.
- INFINITIX added through the real REST config flow; `/infinitix_static/infinitix-panel.js` served (200).
- Panel loads inside the real HA frontend; wizard appears; real areas (סלון, חדר שינה, מטבח) and an
  "unassigned" group (72 entities) were discovered; wizard finished; dashboard rendered with real temperatures/weather.
- Saved config in `.storage/infinitix.config` (`wizard.completed: true`); after a full HA restart the wizard did not
  re-appear and the dashboard loaded.
- Real control: clicking the cards sent `light.turn_off` (×2) and `cover.open_cover` via `hass.callService`; HA states
  changed `on→off`, `on→off`, `open→opening`.
- Scripts: `tools/live_e2e/` (configuration.yaml, tok.py, areas.py, e2e.js, ctl.js).

**A3. HA 2026.11.1 (the user's version; real `hass` process + Chromium).**
- pytest could NOT be run on 2026.11.1: `pytest-homeassistant-custom-component` has no release for it yet (0.13.375 targets 2026.10.4 and fails to import on 2026.11.1). Instead the same 22 unit tests passed on **2026.10.4**.
- Live on 2026.11.1: config flow adds INFINITIX, static files served, panel loads in the new frontend, wizard (RTL) completes, rooms (סלון/חדר שינה/מטבח) discovered from areas, dashboard renders, and a card tap sent `light.turn_on/turn_off`; HA state changed each time.
- **Bug found and fixed on this run (affects all versions):** after tapping a card's button the card stayed stale because live refresh was skipped while the tapped button kept focus. Fixed in `js/app.js` (skip only for input/select/textarea; keyboard focus restored). Re-verified: card text follows HA state (פעיל ↔ כבוי) after each tap. The earlier 2026.2.3 run only checked HA's state, not the card refresh.
- 2026.11 changes noted: entity naming change (cards show `friendly_name` when present, still available in 2026.11.1; HA plans to deprecate it – not yet adapted); HA now shows a "Confirm new HTTP server configuration" dialog when the port changes (test config only).
- Not re-run on 2026.11.1: restart persistence, demo-integration entities (cameras, locks, alarm, media), Marketplace installation.

## B. Demo only (not connected to HA)
`frontend/demo/index.html` (banner "DEMO MODE"): RTL layout at 390×844, 1024×768, 1440×900 – no console errors.

## C. Not tested / known limitations
- Brand assets: (0.1.0 note, partly superseded in 0.2.0: the palette was later extracted; the logo is still a text wordmark "INFINITIX" + ∞, no official logo/imagery/favicon.)
- Not tested: real devices/hardware, HA versions other than those above, Safari/iOS/Android, wall-tablet kiosk hardware, light/dark/auto
  visually on live HA, landscape/portrait on real devices, camera streaming (demo cameras only exist; stream playback
  was not exercised), alarm/lock confirmation flow and media player controls on live HA, edit mode drag/reorder,
  export/import UI on live HA (covered by unit tests of the pure logic only), a few hundred entities performance.
- Offline: no external URLs in the frontend code (grep); not tested with the network physically cut.
- Narrow phones (<~400px) hide the "INFINITIX" word in the top bar and show only ∞.
- No bundler: the frontend is plain ES modules (works without Node; no minification).
- `manifest.json` documentation/issue URLs are placeholders (`github.com/infinitix/infinitix-smart-home`) – replace.
- Marketplace/HACS: `hacs.json` provided and layout follows HACS conventions; installing through the 2026.11 Marketplace (or HACS) itself was not tested.
- Inline `ha-icon` shows as a plain glyph on the demo page only.
