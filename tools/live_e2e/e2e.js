const { chromium } = require('playwright'); const fs=require('fs');
const OUT=process.argv[2]; const t=JSON.parse(fs.readFileSync('token.json'));
const B='http://localhost:8124';
const st=async e=>(await (await fetch(B+'/api/states/'+e,{headers:{Authorization:'Bearer '+t.access_token}})).json()).state;
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1024,height:768}});
 await ctx.addInitScript(tok=>{localStorage.setItem('hassTokens',JSON.stringify({...tok,hassUrl:'http://localhost:8124',clientId:'http://localhost:8124/',expires:Date.now()+1.5e6}));},t);
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto(B+'/infinitix'); await p.waitForSelector('[data-act="w-next"]',{timeout:30000});
 console.log('wizard shown; dir=',await p.evaluate(()=>document.documentElement.dir));
 await p.screenshot({path:OUT+'/live-1-welcome.png'});
 for(let i=0;i<6;i++){ await p.click('[data-act="w-next"]'); await p.waitForTimeout(900); await p.screenshot({path:`${OUT}/live-step${i+2}.png`}); }
 await p.click('[data-act="w-finish"]'); await p.waitForTimeout(2000);
 await p.screenshot({path:OUT+'/live-dashboard.png'});
 console.log('after finish, toggles:',await p.locator('[data-act="toggle"]').count());
 console.log('errors:',JSON.stringify(errs));
 await b.close();
})();
