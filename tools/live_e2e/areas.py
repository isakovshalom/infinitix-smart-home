import asyncio, json, aiohttp
from tok import token
async def main():
    t=token()
    async with aiohttp.ClientSession() as s, s.ws_connect("http://localhost:8124/api/websocket") as ws:
        await ws.receive_json(); await ws.send_json({"type":"auth","access_token":t["access_token"]}); await ws.receive_json()
        n=[0]
        async def call(**m):
            n[0]+=1; await ws.send_json({"id":n[0],**m})
            while True:
                r=await ws.receive_json()
                if r.get("id")==n[0]: return r
        ids={}
        for name in ("סלון","חדר שינה","מטבח"):
            r=await call(type="config/area_registry/create",name=name); ids[name]=r["result"]["area_id"]
        # light.* demo entities have unique ids -> registry; assign a few
        plan={"light.living_room_rgbww_lights":"סלון","light.living_dimmer":"סלון","sensor.living_temp":"סלון","cover.living_room_window":"סלון","climate.hvac":"סלון",
              "light.bed_light":"חדר שינה","cover.bedroom_shutter":"חדר שינה","light.kitchen_lights":"מטבח","switch.boiler":"מטבח"}
        for eid,a in plan.items():
            r=await call(type="config/entity_registry/update",entity_id=eid,area_id=ids[a]); print(eid, r.get("success"), r.get("error",{}).get("message",""))
asyncio.run(main())
