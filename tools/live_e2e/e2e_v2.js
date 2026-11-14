// Live UI walk-through of the 9-step wizard incl. language and ONVIF camera step (run against a real HA).
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.argv[2]; const t = JSON.parse(fs.readFileSync('token.json'));
const B = 'http://localhost:8124';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
  await ctx.addInitScript(tok => { if (!localStorage.getItem('hassTokens')) localStorage.setItem('hassTokens', JSON.stringify({ ...tok, hassUrl: 'http://localhost:8124', clientId: 'http://localhost:8124/', expires: Date.now() + 1.5e6 })); }, t);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(B + '/infinitix'); await p.waitForSelector('[data-act="w-lang"]', { timeout: 30000 });
  const font = await p.evaluate(() => document.fonts.check('600 16px Rubik'));
  console.log('step0 language buttons:', await p.locator('[data-act="w-lang"]').count(), 'Rubik loaded:', font);
  await p.screenshot({ path: OUT + '/v2-0-lang-he.png' });
  await p.click('[data-act="w-lang"][data-val="ru"]'); await p.waitForTimeout(400);
  console.log('ru dir:', await p.locator('infinitix-panel').getAttribute('dir'), '| title:', await p.locator('.wiz h1').innerText());
  await p.screenshot({ path: OUT + '/v2-0-lang-ru.png' });
  await p.click('[data-act="w-lang"][data-val="he"]'); await p.waitForTimeout(400);
  console.log('he dir:', await p.locator('infinitix-panel').getAttribute('dir'));
  for (let i = 1; i <= 6; i++) { await p.click('[data-act="w-next"]'); await p.waitForTimeout(1200); }
  console.log('on step 6 cameras? h2:', await p.locator('.wiz h2').first().innerText());
  await p.screenshot({ path: OUT + '/v2-6-cameras.png' });
  await p.click('[data-act="c-manual"]'); await p.waitForTimeout(300);
  await p.fill('#cam-name', 'Front door'); await p.fill('#cam-host', '127.0.0.1'); await p.fill('#cam-port', '9');
  await p.fill('#cam-username', 'admin'); await p.fill('#cam-password', 'secret');
  await p.click('[data-act="c-add"]'); await p.waitForSelector('[role="alert"]', { timeout: 30000 });
  console.log('error shown:', await p.locator('[role="alert"]').innerText());
  console.log('password field cleared:', JSON.stringify(await p.inputValue('#cam-password')));
  await p.screenshot({ path: OUT + '/v2-6-cameras-error.png' });
  await p.click('[data-act="w-next"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/v2-7-customize.png' });
  await p.click('[data-act="w-next"]'); await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/v2-8-preview.png' });
  await p.click('[data-act="w-finish"]'); await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/v2-dashboard.png' });
  console.log('dashboard toggles:', await p.locator('[data-act="toggle"]').count());
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
