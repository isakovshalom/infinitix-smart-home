import asyncio, json, sys, aiohttp
sys.path.insert(0, "/home/claude/ha-live2")
from tok import token
B = "ws://localhost:8124/api/websocket"
async def call(ws, i, msg):
    await ws.send_json({"id": i, **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == i and r["type"] == "result": return r
def sc(i, name, trig, **kw):
    d = {"id": i, "name": name, "enabled": True, "trigger": trig, "days": [], "shabbat": "any", "actions": [{"entity_id": "light.living_room_lamp" if False else LIGHT, "state": "off"}]}
    d.update(kw); return d
async def main():
    global LIGHT
    t = token()
    async with aiohttp.ClientSession() as s, s.ws_connect(B) as ws:
        await ws.receive_json(); await ws.send_json({"type": "auth", "access_token": t["access_token"]}); await ws.receive_json()
        inv = (await call(ws, 1, {"type": "infinitix/get_inventory"}))["result"]
        LIGHT = next(e["entity_id"] for e in inv["entities"] if e["entity_id"].startswith("light."))
        print("light:", LIGHT)
        items = [
          sc("a", "shabbat out", {"type": "jewish", "event": "havdalah", "offset_min": 0}),
          sc("b", "candle -20", {"type": "jewish", "event": "candle_lighting", "offset_min": -20}),
          sc("c", "sunset", {"type": "sun", "event": "sunset", "offset_min": 15}),
          sc("d", "time", {"type": "time", "at": "23:30"}, days=[4], shabbat="not"),
        ]
        r = await call(ws, 2, {"type": "infinitix/scenarios/save", "scenarios": items})
        print("save:", r); print("sources:", r["result"]["sources"])
        for x in r["result"]["scenarios"]: print(x["name"], "->", x["next_run"])
        # bad payloads
        for i,(n,bad) in enumerate([("lock", sc("e","x",{"type":"time","at":"10:00"},actions=[{"entity_id":"lock.front","state":"on"}])), ("offset", sc("f","x",{"type":"sun","event":"sunset","offset_min":9999}))], start=10):
            r = await call(ws, i, {"type": "infinitix/scenarios/save", "scenarios": [bad]}); print("reject", n, r["success"], r.get("error",{}).get("code"))
        # conditional run: scenario with shabbat=not must be skipped while issur is on
        await call(ws, 20, {"type": "infinitix/scenarios/save", "scenarios": [sc("g","not shabbat",{"type":"time","at":"23:59"},shabbat="not")]})
        r = await call(ws, 21, {"type": "infinitix/scenarios/run", "scenario_id": "g"}); print("forced run:", r["result"])
        r = await call(ws, 22, {"type": "infinitix/scenarios/list"}); print("last_run persisted:", r["result"]["scenarios"][0]["last_run"])
asyncio.run(main())
