import asyncio, json, sys, time, aiohttp
sys.path.insert(0, "/home/claude/ha-live2")
from tok import token
B = "ws://localhost:8124/api/websocket"

async def call(ws, i, msg):
    await ws.send_json({"id": i, **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == i and r["type"] == "result":
            return r

async def main(user, pw):
    t = token(user, pw)
    async with aiohttp.ClientSession() as s, s.ws_connect(B) as ws:
        await ws.receive_json()
        await ws.send_json({"type": "auth", "access_token": t["access_token"]})
        print("auth:", (await ws.receive_json())["type"])
        i = 1
        for name, msg in [
            ("discover", {"type": "infinitix/camera/discover"}),
            ("add closed port", {"type": "infinitix/camera/add", "host": "127.0.0.1", "port": 9, "name": "Test", "username": "u", "password": "p"}),
            ("add bad host", {"type": "infinitix/camera/add", "host": "bad host/x", "port": 80}),
            ("add bad port", {"type": "infinitix/camera/add", "host": "10.0.0.5", "port": 70000}),
        ]:
            i += 1; t0 = time.time()
            r = await call(ws, i, msg)
            print(f"{name}: success={r['success']} {json.dumps(r.get('result') or r.get('error'))[:300]} ({time.time()-t0:.1f}s)")

asyncio.run(main(*(sys.argv[1:3] or ["admin", "adminpass1"])))
