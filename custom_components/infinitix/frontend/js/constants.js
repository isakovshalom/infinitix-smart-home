// Shared constants.
export const CARD_TYPES_UI = [
  "light", "switch", "outlet", "cover", "climate", "sensor", "binary_sensor",
  "scene", "script", "camera", "alarm", "lock", "media_player", "fan", "shopping", "generic",
];

export const ROOM_ICONS = [
  "mdi:sofa", "mdi:bed", "mdi:silverware-fork-knife", "mdi:shower", "mdi:desk", "mdi:door", "mdi:stairs",
  "mdi:garage", "mdi:flower", "mdi:baby-carriage", "mdi:washing-machine", "mdi:balcony", "mdi:television", "mdi:home",
];

export const DEFAULT_CONFIG = () => ({
  home: { name: "", language: "he", screen: "tablet" },
  mode: "auto",
  theme: { mode: "auto", accent: null, layout: "mosaic" },
  wizard: { completed: false, step: 0, draft: {} },
  rooms: [], entities: {}, room_temp_sensor: {}, weather_entity: null,
  tablet: { hide_nav: false }, seen_entities: [],
  display: { saver: { enabled: false, idle_min: 5, weather: true, agenda: true, calendars: [] } },
  pages: [], scenario_sources: {},
});
