import requests, json, sys
B="http://localhost:8124"; CID=B+"/"
def token(user="admin", pw="adminpass1"):
    f=requests.post(B+"/auth/login_flow",json={"client_id":CID,"handler":["homeassistant",None],"redirect_uri":CID}).json()
    r=requests.post(B+f"/auth/login_flow/{f['flow_id']}",json={"username":user,"password":pw,"client_id":CID}).json()
    return requests.post(B+"/auth/token",data={"client_id":CID,"grant_type":"authorization_code","code":r["result"]}).json()
if __name__=="__main__":
    t=token(); json.dump(t,open("token.json","w")); H={"Authorization":"Bearer "+t["access_token"]}
    print(sorted(s['entity_id'] for s in requests.get(B+"/api/states",headers=H).json()))
    print([e['domain'] for e in requests.get(B+"/api/config/config_entries/entry",headers=H).json()])
    print(requests.get(B+"/infinitix_static/infinitix-panel.js").status_code)
