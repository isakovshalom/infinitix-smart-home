"""Managed persistent storage with schema versioning and migrations.

The configuration lives in `.storage/infinitix.config` (HA's Store helper).
Layout (schema version 4; v2 renamed theme.layout grid->mosaic, list->rows;
v3 added the server-run "scenarios" list; v4 added the scenario sensor mapping,
the run log, display (screensaver), personal pages and the licence tier):

{
  "home":   {"name": str, "language": "he"|"en", "screen": "mobile"|"tablet"|"desktop"},
  "mode":   "auto"|"manual"|"hybrid",
  "theme":  {"mode": "auto"|"light"|"dark", "accent": str|None, "layout": "mosaic"|"rows"|"rail"|"stage"},
  "wizard": {"completed": bool, "step": int, "draft": dict},
  "rooms":  [{"id","area_id","name","icon","order","visible"}],
  "entities": {entity_id: {"card","name","icon","room","hidden","favorite","size","order"}},
  "room_temp_sensor": {room_id: entity_id},
  "weather_entity": str|None,
  "tablet": {"hide_nav": bool},
  "seen_entities": [entity_id, ...],  # entities already offered to the user
  "scenarios": [{"id","name","enabled","trigger","days","shabbat","actions","last_run",
                 "catchup_min", "restore", "last_fire"}],
  "scenario_sources": {"candle_lighting"|"havdalah"|"issur_melacha": entity_id},  # explicit mapping
  "scenario_log": [{"id","name","at","scheduled","reason","ok","ran","note"}],     # newest last, capped
  "display": {"saver": {"enabled","idle_min","weather","agenda","calendars":[...]}},
  "pages": [{"id","name","icon","order","entities":[entity_id]}],
  "license": {"tier": "free"|"pro"}
}

theme.layout is the *home default* only.  Each browser/device keeps its own layout
choice locally (see frontend/js/logic.js resolveLayout); room/card order, hidden,
favourites and sizes live in rooms/entities and are shared by all layouts.

Design rules:
* user choices are never overwritten by automatic discovery;
* every schema change bumps STORAGE_VERSION and adds a migration step;
* before a migration runs, HA's Store keeps the old file untouched until the new
  one is written; we additionally keep a backup copy of the pre-migration data.
"""

from __future__ import annotations

import copy
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import BACKUP_KEY_PREFIX, STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)

LAYOUT_RENAMES = {"grid": "mosaic", "list": "rows"}


def default_config() -> dict[str, Any]:
    return {
        "home": {"name": "", "language": "he", "screen": "tablet"},
        "mode": "auto",
        "theme": {"mode": "auto", "accent": None, "layout": "mosaic"},
        "wizard": {"completed": False, "step": 0, "draft": {}},
        "rooms": [],
        "entities": {},
        "room_temp_sensor": {},
        "weather_entity": None,
        "tablet": {"hide_nav": False},
        "seen_entities": [],
        "scenarios": [],
        "scenario_sources": {},
        "scenario_log": [],
        "display": default_display(),
        "pages": [],
        "license": {"tier": "free"},
        "music_accounts": {},  # HA user id -> that user's own music player (entity id only)
    }


def default_display() -> dict[str, Any]:
    return {"saver": {"enabled": False, "idle_min": 5, "weather": True, "agenda": True, "calendars": []}}


def migrate_data(data: dict[str, Any], from_version: int) -> dict[str, Any]:
    """Pure migration function (testable without Home Assistant).

    Add a new `if from_version < N:` block for each schema bump.
    """
    data = copy.deepcopy(data)
    # Fill any missing top-level keys so older partial files still load.
    base = default_config()
    for key, value in base.items():
        data.setdefault(key, value)
    if from_version < 2:
        # v2: the two original layouts were renamed when the four-layout engine arrived.
        theme = data.get("theme")
        if isinstance(theme, dict):
            theme["layout"] = LAYOUT_RENAMES.get(theme.get("layout"), theme.get("layout"))
    # v3 only adds "scenarios", which the setdefault loop above already filled with [].
    if from_version < 4:
        # v4: scenarios gain catch-up/restore settings (off = the 0.3 behaviour) and a
        # de-duplication key.  Existing values are kept, so running this twice is harmless.
        for sc in data.get("scenarios") or []:
            if isinstance(sc, dict):
                sc.setdefault("catchup_min", 0)
                sc.setdefault("restore", False)
                sc.setdefault("last_fire", None)
        # Installations that existed before licensing keep everything they already use.
        if "license" not in data or not isinstance(data.get("license"), dict):
            data["license"] = {"tier": "free"}
        data["license"].setdefault("legacy", from_version < 4 and from_version > 0)
    return data


class InfinitixStore(Store[dict[str, Any]]):
    """Store with migration support and a pre-migration backup."""

    async def _async_migrate_func(
        self,
        old_major_version: int,
        old_minor_version: int,
        old_data: dict[str, Any],
    ) -> dict[str, Any]:
        if old_major_version > STORAGE_VERSION:
            # Downgrade: refuse to guess.  HA keeps the file; raising makes the
            # integration fail to load instead of silently dropping settings.
            raise ValueError(
                f"Stored INFINITIX config is version {old_major_version}, "
                f"newer than supported {STORAGE_VERSION}"
            )
        backup = Store(
            self.hass,
            1,
            f"{BACKUP_KEY_PREFIX}.v{old_major_version}",
        )
        await backup.async_save(old_data)
        _LOGGER.info(
            "Migrating INFINITIX config from v%s to v%s (backup saved)",
            old_major_version,
            STORAGE_VERSION,
        )
        return migrate_data(old_data, old_major_version)


class ConfigManager:
    """Holds the in-memory config and persists changes."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = InfinitixStore(hass, STORAGE_VERSION, STORAGE_KEY)
        self.data: dict[str, Any] = default_config()

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored is None:
            self.data = default_config()
        else:
            self.data = migrate_data(stored, STORAGE_VERSION)

    async def async_save(self) -> None:
        await self._store.async_save(self.data)

    async def async_replace(self, new_data: dict[str, Any]) -> None:
        merged = migrate_data(new_data, STORAGE_VERSION)
        self.data = merged
        await self.async_save()

    async def async_remove(self) -> None:
        await self._store.async_remove()
