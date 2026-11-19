"""Free / Pro capability configuration.

This module is the *mechanism* only.  Price, quotas, payment provider, licence
server and installer licences are business decisions that have not been made; the
table below is a proposal and ``ENFORCEMENT_ENABLED`` stays False until they are.
While enforcement is off every installation gets the Pro entitlements.

Rules that hold whatever the table says:
* a tier change never deletes rooms, cards, scenarios, pages or any other user data;
* items above a limit stay stored and visible as "locked"; they come back unchanged
  when the tier allows them again;
* installations upgraded from 0.3 or earlier (``license.legacy``) keep every feature
  they could already use.
"""

from __future__ import annotations

from typing import Any

ENFORCEMENT_ENABLED = False  # flip only after the business decision

TIERS: dict[str, dict[str, Any]] = {
    # PROPOSAL - to be confirmed against the product spec's feature split.
    "free": {
        "layouts": ["mosaic", "rows"],
        "max_scenarios": 3,
        "max_pages": 1,
        "jewish_calendar": True,      # Shabbat clock is core for the target market
        "screensaver": True,
        "custom_themes": False,
        "shopping_history": False,
        "special_dates": False,
    },
    "pro": {
        "layouts": ["mosaic", "rows", "rail", "stage"],
        "max_scenarios": 100,
        "max_pages": 20,
        "jewish_calendar": True,
        "screensaver": True,
        "custom_themes": True,
        "shopping_history": True,
        "special_dates": True,
    },
}
LEGACY_FEATURES = {"layouts": ["mosaic", "rows", "rail", "stage"], "max_scenarios": 100}


def entitlements(license_cfg: dict[str, Any] | None, *, enforce: bool | None = None) -> dict[str, Any]:
    enforce = ENFORCEMENT_ENABLED if enforce is None else enforce
    lic = license_cfg or {}
    tier = lic.get("tier") if lic.get("tier") in TIERS else "free"
    if not enforce:
        return {**TIERS["pro"], "tier": tier, "enforced": False}
    ent = dict(TIERS[tier])
    if lic.get("legacy"):
        for key, value in LEGACY_FEATURES.items():
            ent[key] = max(ent[key], value) if isinstance(value, int) else sorted(set(ent[key]) | set(value), key=value.index)
    return {**ent, "tier": tier, "enforced": True}


def locked_scenarios(scenarios: list[dict[str, Any]], ent: dict[str, Any]) -> set[str]:
    """Scenario ids above the tier limit (kept in storage, not armed)."""
    if not ent.get("jewish_calendar"):
        over = {s["id"] for s in scenarios if s.get("trigger", {}).get("type") == "jewish"}
    else:
        over = set()
    allowed = [s for s in scenarios if s["id"] not in over]
    over |= {s["id"] for s in allowed[ent["max_scenarios"]:]}
    return over


def allowed_layout(layout: str, ent: dict[str, Any]) -> str:
    return layout if layout in ent["layouts"] else ent["layouts"][0]
