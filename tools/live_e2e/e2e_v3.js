const { chromium } = require('playwright'); const fs=require('fs');
const t=JSON.parse(fs.readFileSync('token.json')); const B='http://localhost:8124'; const out='/tmp/claude-0/shots';
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 await ctx.addInitScript(tok=>{ if(!localStorage.getItem('hassTokens')) localStorage.setItem('hassTokens',JSON.stringify({...tok,hassUrl:'http://localhost:8124',clientId:'http://localhost:8124/',expires:Date.now()+1.5e6}));},t);
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.goto(B+'/infinitix'); await p.waitForTimeout(3500);
 const sh=(s)=>p.locator('infinitix-panel').locator(s);
 // shopping card lives in the first room
 const room=await sh('.tab').nth(1).textContent(); await sh('.tab').nth(1).click(); await p.waitForTimeout(800);
 console.log('room',room,'shopping card:',await sh('.ix-card[data-card="shopping"]').count());
 await sh('[data-act="shop-open"]').first().click(); await p.waitForTimeout(1500);
 await sh('#sh-in').fill('חלב, לחם\nעגבניות; סבון כלים, חלב'); await sh('#sh-in').press('Enter'); await p.waitForTimeout(1800);
 console.log('items:',await sh('.shop-item .shop-name').allTextContents(), 'sections:',await sh('.shop-sec').allTextContents());
 await p.screenshot({path:out+'/v3-shop.png'});
 await sh('.shop-item [data-act="sh-toggle"]').first().click(); await p.waitForTimeout(1500);
 console.log('done count heading:',await sh('.panel h3').allTextContents());
 await sh('[data-act="sh-clear"]').click(); await p.waitForTimeout(1500);
 console.log('after clear:',await sh('.shop-item .shop-name').allTextContents());
 await sh('[data-act="sh-back"]').click(); await p.waitForTimeout(500);
 // scenarios
 await sh('[data-act="open-settings"]').click(); await p.waitForTimeout(800);
 await sh('[data-act="s-scenarios"]').click(); await p.waitForTimeout(1500);
 await sh('[data-act="sc-tpl"][data-tpl="shabbat_off"]').click(); await p.waitForTimeout(500);
 const opts=await sh('#sc-ent option').count(); await sh('#sc-ent').selectOption({index:1}); await sh('[data-act="sc-act-add"]').click(); await p.waitForTimeout(400);
 await sh('#sc-shabbat').selectOption('any'); await sh('[data-sc-day="4"]').check();
 await p.screenshot({path:out+'/v3-sc-editor.png'});
 await sh('[data-act="sc-save"]').click(); await p.waitForTimeout(1500); console.log('editor err:',await sh('#sc-editor .note').allTextContents());
 console.log('scenario rows:',await sh('.erow .nm').allTextContents(), await sh('.erow .id').allTextContents());
 await p.screenshot({path:out+'/v3-sc-list.png'});
 // invalid: save without a device
 await sh('[data-act="sc-new"]').click(); await sh('[data-act="sc-save"]').click(); await p.waitForTimeout(400);
 console.log('no-device error:',await sh('#sc-editor .note').textContent());
 await sh('[data-act="sc-cancel"]').click();
 // run now (modal confirm)
 await sh('[data-act="sc-run"]').first().click(); await p.waitForTimeout(400);
 await sh('[data-ma="ok"], .overlay .btn.danger, .overlay .btn.primary').first().click(); await p.waitForTimeout(2000);
 console.log('after run:',await sh('.erow .id').allTextContents());
 // language switch -> ru strings on scenario page
 console.log('page errors:',errs); await b.close();})();
