// Entry module loaded by Home Assistant (custom panel).  Everything is served locally
// from /infinitix_static/ so the dashboard works without internet access.
import { InfinitixPanel } from "./js/app.js";

// @font-face is not applied from inside a shadow root in every browser, so the bundled
// Rubik font (local files, SIL OFL) is declared once on the document.
if (!document.getElementById("infinitix-fonts")) {
  const link = document.createElement("link");
  link.id = "infinitix-fonts";
  link.rel = "stylesheet";
  link.href = new URL("./fonts/fonts.css", import.meta.url).href;
  document.head.appendChild(link);
}

if (!customElements.get("infinitix-panel")) {
  customElements.define("infinitix-panel", InfinitixPanel);
}
