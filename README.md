# INFINITIX Smart Home for Home Assistant

A custom integration that builds a modern dashboard (Hebrew RTL default, English, Russian) from your areas and
entities, with an in-UI setup wizard. No YAML, no Node.js, runs locally.

- Install: Marketplace "Add from link" (HA 2026.11+), HACS custom repository (older HA), or ZIP → `config/custom_components/infinitix/`, restart HA.
- Add: Settings → Devices & services → Add integration → INFINITIX Smart Home; open **INFINITIX** in the sidebar.
- Hebrew guide: [docs/GUIDE_HE.md](docs/GUIDE_HE.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
  Tests and limitations: [docs/TEST_REPORT.md](docs/TEST_REPORT.md)
- Tested with Home Assistant 2026.2.3 and 2026.11.1 (see docs/TEST_REPORT.md).
- 0.4.0: INFINITIX Smart Control 360° look (logo, side rail, home systems, chips bar), per-device layouts, touch drag editing, personal pages,
  screensaver/forecast/agenda, hardened timed scenarios (sensor mapping, stale/missing skip, catch-up, restore, de-dup, run log),
  Free/Pro mechanism (off), storage schema v4. See docs/TEST_REPORT.md.
- 0.2.0: language choice, ONVIF camera adding (via HA's own ONVIF flow), 4 layouts, scenarios (Shabbat timer, sunrise/sunset,
  Jewish calendar) and a shopping-list card. Real vs. unverified: see docs/TEST_REPORT.md.
- Tests: `pip install -r requirements_test.txt && pytest` and `node --test "tests/js/*.test.mjs"`.
