# INFINITIX Smart Home 0.2.0 – test report

Date: 2026-11-14. HA versions tested: **2026.2.3** (Python 3.13) and **2026.11.1** (Python 3.14, live instance only). Unit tests: 2026.2.3 and 2026.10.4.

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
