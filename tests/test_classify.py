from custom_components.infinitix.classify import classify_entity


def c(entity_id, **kw):
    return classify_entity({"entity_id": entity_id, **kw})


def test_light_capabilities_from_color_modes():
    assert c("light.a", supported_color_modes=["onoff"])["capabilities"] == ["on_off"]
    caps = c("light.a", supported_color_modes=["color_temp", "xy"])["capabilities"]
    assert {"on_off", "brightness", "color_temp", "color"} <= set(caps)
    caps = c("light.a", supported_color_modes=["brightness"])["capabilities"]
    assert "color" not in caps and "brightness" in caps


def test_switch_is_never_assumed_to_be_a_light():
    r = c("switch.x", name="Kitchen")
    assert r["card"] == "switch" and r["confidence"] == "medium"
    r = c("switch.x", name="Living room lamp")
    assert r["card"] == "switch" and r["suggestion"] == "light" and r["confidence"] == "low"
    assert c("switch.x", device_class="outlet")["card"] == "outlet"


def test_cover_controls_follow_features():
    r = c("cover.a", supported_features=1 | 2)  # open/close only
    assert "position" not in r["capabilities"] and "stop" not in r["capabilities"]
    r = c("cover.a", supported_features=1 | 2 | 4 | 8)
    assert {"position", "stop"} <= set(r["capabilities"])


def test_diagnostic_and_disabled_hidden_by_default():
    assert c("sensor.x", entity_category="diagnostic")["default_hidden"]
    assert c("sensor.x", entity_category="config")["hidden_reason"] == "config"
    r = c("light.x", disabled=True)
    assert r["default_hidden"] and r["hidden_reason"] == "disabled" and r["card"] is None


def test_unknown_domain_is_low_confidence_generic():
    r = c("vacuum.x")
    assert r["card"] == "generic" and r["confidence"] == "low"


def test_alarm_and_media_features():
    r = c("alarm_control_panel.a", supported_features=1 | 2)
    assert "arm_home" in r["capabilities"] and "arm_night" not in r["capabilities"]
    r = c("media_player.m", supported_features=16384 | 4)
    assert "play" in r["capabilities"] and "volume_set" in r["capabilities"] and "next" not in r["capabilities"]


def test_climate_modes():
    r = c("climate.a", supported_features=1, hvac_modes=["off", "cool"])
    assert {"target_temperature", "hvac_mode"} <= set(r["capabilities"])
