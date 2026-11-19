import asyncio, sys, aiohttp, json
sys.path.insert(0,"/home/claude/ha-live2")
from tok import token
async def main():
    t=token()
    async with aiohttp.ClientSession() as s, s.ws_connect("ws://localhost:8124/api/websocket") as ws:
        await ws.receive_json(); await ws.send_json({"type":"auth","access_token":t["access_token"]}); await ws.receive_json()
        n=[0]
        async def call(m):
            n[0]+=1; await ws.send_json({"id":n[0],**m})
            while True:
                r=await ws.receive_json()
                if r.get("id")==n[0] and r["type"]=="result": return r
        def show(l,r): print(l, "OK" if r["success"] else "ERR", json.dumps(r.get("result") or r.get("error"),ensure_ascii=False)[:300])
        show("pair status", await call({"type":"infinitix/pairing/status"}))
        show("permit zha (no ZHA)", await call({"type":"infinitix/pairing/permit","protocol":"zha"}))
        show("permit z2m (no mqtt)", await call({"type":"infinitix/pairing/permit","protocol":"z2m"}))
        show("permit bad", await call({"type":"infinitix/pairing/permit","protocol":"zha","duration":9999}))
        show("media list", await call({"type":"infinitix/media/list"}))
        show("bad domain", await call({"type":"infinitix/media/start","domain":"hue","host":"1.2.3.4"}))
        show("bad host", await call({"type":"infinitix/media/start","domain":"samsungtv","host":"a b"}))
        show("samsung empty host", await call({"type":"infinitix/media/start","domain":"samsungtv","host":""}))
        show("samsung closed port host", await call({"type":"infinitix/media/start","domain":"samsungtv","host":"127.0.0.1"}))
        show("denon auto-search", await call({"type":"infinitix/media/start","domain":"denonavr","host":""}))
        show("foreign flow refused", await call({"type":"infinitix/media/continue","flow_id":"nope","data":{}}))
asyncio.run(main())
