"""Camera brand presets (Hikvision, Uniview, Provision-ISR) and the RTSP fallback.

All three brands support ONVIF, which stays the recommended way (cameras.py drives
Home Assistant's own ONVIF flow).  For cameras or recorders where ONVIF is off or
incomplete, the panel can add an RTSP stream through Home Assistant's built-in
"Generic camera" integration.  INFINITIX only builds the stream address from the
brand's documented path and relays it, with the username and password, to HA's
own config flow.  Credentials are never put into the URL, stored or logged here;
HA keeps them in its own config entry as it does for any camera.

Stream paths (verify on site; firmware can differ):
* Hikvision IPC/NVR: /Streaming/Channels/<ch>01 (main), <ch>02 (sub)
* Uniview IPC:       /media/video1 (main), /media/video2 (sub)
  Uniview NVR:       /unicast/c<ch>/s0/live (main), s1 (sub)   (Uniview support doc, 2023)
* Provision-ISR:     ONVIF recommended.  RTSP paths follow the TVT-based firmware
  (NVR ?chID=<ch>&streamType=main|sub, IPC /profile1|/profile2); marked "verify".
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er

from .cameras import CameraError, _clean

_LOGGER = logging.getLogger(__name__)

GENERIC_DOMAIN = "generic"

BRANDS: dict[str, dict[str, Any]] = {
    "hikvision": {
        "name": "Hikvision",
        "onvif_port": 80,
        "rtsp_port": 554,
        "paths": {
            "ipc": {"main": "/Streaming/Channels/{ch}01", "sub": "/Streaming/Channels/{ch}02"},
            "nvr": {"main": "/Streaming/Channels/{ch}01", "sub": "/Streaming/Channels/{ch}02"},
        },
        "verified_paths": True,
        "auth": "digest",
    },
    "uniview": {
        "name": "Uniview (UNV)",
        "onvif_port": 80,
        "rtsp_port": 554,
        "paths": {
            "ipc": {"main": "/media/video1", "sub": "/media/video2"},
            "nvr": {"main": "/unicast/c{ch}/s0/live", "sub": "/unicast/c{ch}/s1/live"},
        },
        "verified_paths": True,
        "auth": "digest",
    },
    "provision": {
        "name": "Provision-ISR",
        "onvif_port": 80,
        "rtsp_port": 554,
        "paths": {
            "ipc": {"main": "/profile1", "sub": "/profile2"},
            "nvr": {"main": "?chID={ch}&streamType=main", "sub": "?chID={ch}&streamType=sub"},
        },
        "verified_paths": False,
        "auth": "digest",
    },
    "other": {
        "name": "ONVIF / RTSP",
        "onvif_port": 80,
        "rtsp_port": 554,
        "paths": {},
        "verified_paths": False,
        "auth": "digest",
    },
}
_PATH_MAX = 200
_ENTITY_WAIT_SECONDS = 15


def brand_list() -> list[dict[str, Any]]:
    return [
        {"id": k, "name": v["name"], "onvif_port": v["onvif_port"], "rtsp_port": v["rtsp_port"],
         "kinds": sorted(v["paths"]), "verified_paths": v["verified_paths"]}
        for k, v in BRANDS.items()
    ]


def build_stream_url(brand: str, kind: str, channel: int, stream: str, host: str, port: int, custom_path: str = "") -> str:
    """rtsp://host:port/<path> without any credentials."""
    if brand not in BRANDS:
        raise CameraError("invalid_brand")
    if not isinstance(channel, int) or isinstance(channel, bool) or not 1 <= channel <= 128:
        raise CameraError("invalid_channel")
    if stream not in ("main", "sub"):
        raise CameraError("invalid_stream")
    if custom_path:
        path = custom_path.strip()
        if len(path) > _PATH_MAX or any(c in path for c in " @\\\n\r\t") or "://" in path:
            raise CameraError("invalid_path")
        if not path.startswith(("/", "?")):
            path = "/" + path
    else:
        paths = BRANDS[brand]["paths"].get(kind)
        if not paths:
            raise CameraError("path_required")
        path = paths[stream].format(ch=channel)
    clean = _clean({"host": host, "port": port})
    host_part = f"[{clean['host']}]" if ":" in clean["host"] else clean["host"]
    return f"rtsp://{host_part}:{clean['port']}{path}"


async def async_add_rtsp(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Add an RTSP camera through HA's Generic camera flow (user -> user_confirm)."""
    brand = data.get("brand", "other")
    url = build_stream_url(
        brand, data.get("kind", "ipc"), data.get("channel", 1), data.get("stream", "main"),
        data.get("host", ""), data.get("port", BRANDS.get(brand, BRANDS["other"])["rtsp_port"]),
        data.get("path", ""),
    )
    conf = _clean({k: data.get(k) for k in ("host", "port", "name", "username", "password")} | {"port": data.get("port", 554)})
    flow = hass.config_entries.flow
    started = await flow.async_init(GENERIC_DOMAIN, context={"source": SOURCE_USER})
    flow_id = started["flow_id"]
    payload: dict[str, Any] = {
        "stream_source": url,
        "advanced": {"framerate": 2, "verify_ssl": False, "rtsp_transport": "tcp", "authentication": BRANDS[brand]["auth"]},
    }
    if conf["username"]:
        payload["username"] = conf["username"]
    if conf["password"]:
        payload["password"] = conf["password"]
    try:
        result = await flow.async_configure(flow_id, payload)
        if result["type"] == FlowResultType.FORM and result.get("step_id") == "user_confirm":
            result = await flow.async_configure(flow_id, {"confirmed_ok": True})
    except Exception as err:  # noqa: BLE001
        flow.async_abort(flow_id)
        _LOGGER.warning("Generic camera flow failed for %s", brand)  # no URL/credentials in logs
        raise CameraError("flow_failed", str(err)) from err

    rtype = result["type"]
    if rtype == FlowResultType.CREATE_ENTRY:
        entry_id = result["result"].entry_id
        if conf["name"] and conf["name"] != conf["host"]:
            entry = hass.config_entries.async_get_entry(entry_id)
            if entry:
                hass.config_entries.async_update_entry(entry, title=conf["name"])
        return {"entry_id": entry_id, "title": conf["name"], "entity_ids": await _wait(hass, entry_id), "stream": url}
    if rtype == FlowResultType.FORM:
        errors = result.get("errors") or {}
        flow.async_abort(flow_id)
        code = str(next(iter(errors.values()), "unknown"))
        # HA returns identifiers (e.g. stream_unauthorised, stream_no_route_to_host) or a raw
        # message; keep identifiers as codes and pass anything else as detail.
        if re.fullmatch(r"[a-z_]{3,60}", code):
            raise CameraError(code)
        raise CameraError("stream_failed", code[:200])
    if rtype == FlowResultType.ABORT:
        raise CameraError(result.get("reason", "unknown"))
    flow.async_abort(flow_id)
    raise CameraError("unexpected_flow", str(rtype))


async def _wait(hass: HomeAssistant, entry_id: str) -> list[str]:
    registry = er.async_get(hass)
    for _ in range(_ENTITY_WAIT_SECONDS * 2):
        found = [e.entity_id for e in er.async_entries_for_config_entry(registry, entry_id) if e.domain == "camera"]
        if found:
            return sorted(found)
        await asyncio.sleep(0.5)
    return []
