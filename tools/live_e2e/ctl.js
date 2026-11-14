const { chromium } = require('playwright'); const fs=require('fs');
const t=JSON.parse(fs.readFileSync('token.json')); const B='http://localhost:8124';
const get=async e=>(await (await fetch(B+'/api/states/'+e,{headers:{Authorization:'Bearer '+t.access_token}})).json()).state;
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 await ctx.addInitScript(tok=>{ if(!localStorage.getItem('hassTokens')) localStorage.setItem('hassTokens',JSON.stringify({...tok,hassUrl:'http://localhost:8124',clientId:'http://localhost:8124/',expires:Date.now()+1.5e6}));},t);
 const p=await ctx.newPage(); const calls=[];
 p.on('websocket',ws=>ws.on('framesent',f=>{try{const m=JSON.parse(f.payload); if(m.type==='call_service'&&m.domain!=='system_log')calls.push(m)}catch{}}));
 await p.goto(B+'/infinitix'); await p.waitForTimeout(4000);
 await p.locator('.tab',{hasText:'סלון'}).click(); await p.waitForTimeout(800);
 const ids=await p.locator('.ix-card').evaluateAll(els=>els.map(e=>e.dataset.eid)); console.log('cards in סלון:',ids);
 for (const eid of ids.filter(e=>/^(light|cover)\./.test(e))) {
   const card=p.locator(`.ix-card[data-eid="${eid}"]`); const before=await get(eid);
   const tg=card.locator('[data-act="toggle"]'); const btn=(await tg.count())?tg:card.locator('[data-svc]').first();
   await btn.first().click(); await p.waitForTimeout(1800);
   console.log(eid,before,'->',await get(eid));
 }
 console.log('service calls sent by panel:',JSON.stringify(calls.map(c=>[c.domain,c.service,c.target||c.service_data])));
 await p.screenshot({path:process.argv[2]+'/live-room-after.png'}); await b.close();})();
