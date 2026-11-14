"""Constants for INFINITIX Smart Home."""

from __future__ import annotations

DOMAIN = "infinitix"
NAME = "INFINITIX Smart Home"

STORAGE_KEY = "infinitix.config"
STORAGE_VERSION = 3  # bump + add migration in storage.py when the schema changes
BACKUP_KEY_PREFIX = "infinitix.config.backup"

PANEL_URL_PATH = "infinitix"
PANEL_WEBCOMPONENT = "infinitix-panel"
STATIC_URL = "/infinitix_static"
PANEL_MODULE = "infinitix-panel.js"
# Appended to the module URL so browsers fetch a new bundle after an update.
FRONTEND_VERSION = "0.2.0"

CONF_SHOW_IN_SIDEBAR = "show_in_sidebar"
CONF_SIDEBAR_TITLE = "sidebar_title"
DEFAULT_SIDEBAR_TITLE = "INFINITIX"

EXPORT_FORMAT = "infinitix-config"
EXPORT_FORMAT_VERSION = 1

# Card types the dashboard understands.
CARD_TYPES = (
    "light",
    "switch",
    "outlet",
    "cover",
    "climate",
    "sensor",
    "binary_sensor",
    "scene",
    "script",
    "camera",
    "alarm",
    "lock",
    "media_player",
    "fan",
    "shopping",
    "generic",
)

UNASSIGNED_ROOM = "__unassigned__"
