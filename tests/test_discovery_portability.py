from custom_components.infinitix.discovery import (
    build_inventory, find_missing_entities, find_new_entities, propose_config,
)
from custom_components.infinitix.portability import apply_import, export_config, plan_import, validate_export
from custom_components.infinitix.storage import default_config, migrate_data
from custom_components.infinitix.validation import ConfigError, validate_config
import pytest

AREAS = [{"id": "living", "name": "Living room", "icon": None}, {"id": "kitchen", "name": "Kitchen", "icon": None}]
DEVICES = [{"id": "d1", "name": "Lamp dev", "area_id": "living"}]
REG = [
    {"entity_id": "light.lamp", "device_id": "d1", "area_id": None, "platform": "x"},
    # explicit entity area beats the device area
    {"entity_id": "light.kitchen_spot", "device_id": "d1", "area_id": "kitchen", "platform": "x"},
    {"entity_id": "sensor.temp", "device_id": None, "area_id": "living", "platform": "x", "device_class": "temperature"},
    {"entity_id": "sensor.rssi", "device_id": None, "area_id": "living", "platform": "x", "entity_category": "diagnostic"},
    {"entity_id": "light.off", "device_id": None, "area_id": None, "platform": "x", "disabled_by": "user"},
]
STATES = [
    {"entity_id": "light.lamp", "state": "on", "attributes": {"friendly_name": "Lamp", "supported_color_modes": ["brightness"]}},
    {"entity_id": "light.kitchen_spot", "state": "off", "attributes": {"friendly_name": "Spot"}},
    {"entity_id": "sensor.temp", "state": "22", "attributes": {"friendly_name": "Temp", "device_class": "temperature", "unit_of_measurement": "°C"}},
    {"entity_id": "switch.yaml_only", "state": "unavailable", "attributes": {}},  # not in registry
    {"entity_id": "weather.home", "state": "sunny", "attributes": {}},
]


def inv():
    return build_inventory(AREAS, DEVICES, REG, STATES)


def test_area_resolution_and_dedupe():
    items = {e["entity_id"]: e for e in inv()["entities"]}
    assert items["light.lamp"]["area_id"] == "living" and items["light.lamp"]["area_source"] == "device"
    assert items["light.kitchen_spot"]["area_id"] == "kitchen" and items["light.kitchen_spot"]["area_source"] == "entity"
    assert len(inv()["entities"]) == len(set(items))
    assert items["switch.yaml_only"]["in_registry"] is False and items["switch.yaml_only"]["area_id"] is None
    assert inv()["summary"]["without_registry"] == 2  # switch.yaml_only + weather.home


def test_proposal_hides_diagnostics_and_creates_unassigned_group():
    p = propose_config(inv())
    assert "sensor.rssi" not in p["entities"] and "light.off" not in p["entities"]
    assert "weather.home" not in p["entities"]
    assert p["weather_entity"] == "weather.home"
    ids = [r["id"] for r in p["rooms"]]
    assert "__unassigned__" in ids and "room_living" in ids
    assert p["entities"]["switch.yaml_only"]["room"] == "__unassigned__"
    assert p["room_temp_sensor"]["room_living"] == "sensor.temp"


def test_rediscovery_never_overrides_user_choices():
    cfg = default_config()
    cfg["entities"] = {"light.lamp": {"card": "switch", "hidden": True}}
    cfg["seen_entities"] = ["sensor.temp"]
    new = {e["entity_id"] for e in find_new_entities(cfg, inv())}
    assert "light.lamp" not in new and "sensor.temp" not in new and "light.kitchen_spot" in new
    assert find_missing_entities({"entities": {"light.gone": {}}}, inv()) == ["light.gone"]


def full_config():
    cfg = default_config()
    p = propose_config(inv())
    cfg.update(p)
    cfg["home"]["name"] = "Home A"
    cfg["entities"]["light.lamp"]["favorite"] = True
    return validate_config(cfg)


def test_export_has_no_home_secrets_and_roundtrip_to_other_home():
    doc = export_config(full_config(), inv())
    assert validate_export(doc) is None
    assert "Home A" not in str(doc) and "token" not in str(doc).lower()
    # other home: different entity ids, same area names
    areas2 = [{"id": "a_liv", "name": "living room", "icon": None}]
    reg2 = [{"entity_id": "light.salon_lamp", "device_id": None, "area_id": "a_liv", "platform": "y"}]
    st2 = [{"entity_id": "light.salon_lamp", "state": "on", "attributes": {"friendly_name": "Lamp"}}]
    inv2 = build_inventory(areas2, [], reg2, st2)
    plan = plan_import(doc, inv2)
    living = next(r for r in plan["rooms"] if r["room"]["id"] == "room_living")
    assert living["action"] == "map" and living["area_id"] == "a_liv"
    lamp = next(e for e in plan["entities"] if e["entity"]["entity_id"] == "light.lamp")
    assert lamp["target"] == "light.salon_lamp" and lamp["match"] == "same_name"
    room_map = {r["room"]["id"]: {"action": r["action"], "area_id": r["area_id"]} for r in plan["rooms"]}
    entity_map = {e["entity"]["entity_id"]: e["target"] for e in plan["entities"]}
    cfg2 = validate_config(apply_import(default_config(), doc, room_map, entity_map, import_structure=True))
    assert cfg2["entities"]["light.salon_lamp"]["favorite"] is True
    assert cfg2["entities"]["light.salon_lamp"]["room"] == "room_a_liv"
    assert "light.lamp" not in cfg2["entities"]  # exported ids are not blindly reused


def test_import_rejects_foreign_or_newer_documents():
    assert validate_export({"format": "other"}) == "not_an_infinitix_export"
    assert validate_export({"format": "infinitix-config", "format_version": 99, "design": {}}) == "unsupported_version"


def test_validation_drops_garbage():
    with pytest.raises(ConfigError):
        validate_config({"entities": {"NotAnEntity": {}}})
    cfg = validate_config({"entities": {"light.a": {"card": "evil", "icon": "http://x", "size": "xl", "room": "nope"}}, "theme": {"accent": "javascript:1"}})
    e = cfg["entities"]["light.a"]
    assert e["card"] == "generic" and e["icon"] is None and e["size"] == "m" and e["room"] is None
    assert cfg["theme"]["accent"] is None


def test_migrate_fills_missing_keys():
    assert migrate_data({"home": {"name": "x", "language": "he", "screen": "tablet"}}, 1)["rooms"] == []
