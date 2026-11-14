# INFINITIX Smart Home – architecture

## Decision: Custom Panel (not a Lovelace dashboard)

Checked against HA 2026.2.3 (`panel_custom`, `websocket_api`, `Store`, config/options flow):

| Requirement | Custom Panel (`panel_custom`) | Lovelace dashboard |
|---|---|---|
| Rich first-run wizard, drag/reorder, entity picker | full control | not possible (cards only) |
| Server-side admin protection | own WS commands with `require_admin` | none for custom logic |
| Per-home mapping + export/import | own versioned `Store` | not designed for it |
| Auto-build from areas/entities | computed at runtime | needs generated YAML/JSON |
| Packaged, no Node/CLI for the user | static files served by the integration | needs resources + cards |

Lovelace custom cards are therefore **not used** (the `home-assistant-card` skill is not applicable).
HA's own `hass` object is used by the panel: the logged-in session authorizes every service call
(`hass.callService`), so no Long-Lived Access Token is ever requested.

## Layout
- `custom_components/infinitix/` – config flow (single entry) + options flow, panel registration,
  versioned storage (`.storage/infinitix.config`, schema v1, pre-migration backup, refuses downgrade),
  `discovery.py`/`classify.py` (areas, devices, entities → card types, capabilities, confidence),
  `portability.py` (export without secrets, import with room/entity re-mapping), `validation.py`,
  `websocket_api.py` (admin-only: scan, save, wizard progress, import/export, registry subscription).
- `frontend/` – plain ES modules (no build step, no Node), served from `/infinitix_static/`, no external requests.
  Design tokens live in `js/styles.js` (`:host` / `:host(.dark)`), strings in `js/i18n.js` (he default, en).
- `frontend/demo/` – clearly marked DEMO page with a fixture (not connected to HA).

## Security model
- Read commands return only entities the user may read; admin commands use `require_admin`.
- Control uses normal HA services → authorized by HA per user/entity.
- Scan and preview never call services (card `inert` in preview).
