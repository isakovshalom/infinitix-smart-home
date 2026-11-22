"""Managed persistent storage with schema versioning and migrations.

The configuration lives in `.storage/infinitix.config` (HA's Store helper).
Layout (schema version 4; v2 renamed theme.layout grid->mosaic, list->rows;
v3 added the server-run "scenarios" list; v4 changed scenario actions to op/value):

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
  "scenarios": [{"id","name","enabled","trigger","days","shabbat","actions","last_run"}]
}

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
    }


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
        # v4: scenario actions use {"op", "value"} instead of {"state", "brightness_pct"};
        # scenarios gain "dashboard" and "icon".
        for sc in data.get("scenarios") or []:
            for act in sc.get("actions") or []:
                if "state" in act:
                    act["op"] = act.pop("state")
                if "brightness_pct" in act:
                    act["value"] = act.pop("brightness_pct")
            sc.setdefault("dashboard", False)
            sc.setdefault("icon", "")
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
