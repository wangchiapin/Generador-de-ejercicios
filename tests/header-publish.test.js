/* 練習單產生器（index.html）自動測試：「我的練習單」在外面一按就開、第 3 步的「發布給學生頁」按鈕（用假的發布函式，不會真的寫雲端）。
   用法：NODE_PATH=<裝了 playwright-core 的 node_modules> CHROME=/usr/bin/google-chrome node tests/header-publish.test.js */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html'); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html;charset=utf-8' : f.endsWith('.js') ? 'application/javascript;charset=utf-8' : 'application/json' }); r.end(d); } }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', rt => { const u = rt.request().url(); if (u.startsWith('http://localhost')) return rt.continue(); return rt.abort(); });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForTimeout(800);
  // 1) 我的練習單 在外面，一下就開
  assert.ok(await pg.$('header .proj > #btnProjList'), '按鈕在 header 外面');
  assert.strictEqual(await pg.$('#projMenu #btnProjList'), null, '選單裡沒有了');
  assert.ok(await pg.isHidden('#projPanel'));
  await pg.click('#btnProjList'); await pg.waitForTimeout(300);
  assert.ok(await pg.isVisible('#projPanel'), '一按就打開');
  await pg.click('#btnProjList'); assert.ok(await pg.isHidden('#projPanel'), '再按收起來');
  // 選單其他三項還在
  await pg.click('#projMenu summary'); assert.ok(await pg.isVisible('#btnNew') && await pg.isVisible('#btnSaveProj')); await pg.click('body', { position: { x: 5, y: 5 } });
  // 2) 第 3 步的發布按鈕
  await pg.evaluate(() => { state.sections = [{ id: 's1', type: 'fill', enabled: true, bank: ['比'], items: [{ id: 'a', enabled: true, zh: '我__你高', answer: '比', es: 'x' }] }]; save(); goStep(3); });
  await pg.waitForTimeout(500);
  assert.ok(await pg.isVisible('#btnHwQuick'), '第3步有發布按鈕');
  // 沒設老師代號 → 提示並打開我的練習單
  await pg.evaluate(() => { document.querySelector('#hwTid').value = ''; });
  await pg.click('#btnHwQuick'); await pg.waitForTimeout(300);
  assert.ok((await pg.textContent('#hwQMsg')).includes('老師代號'), '提示沒設代號');
  assert.ok(await pg.isVisible('#projPanel'), '自動打開我的練習單');
  // 有代號但沒登入 → 提示登入，不發布
  await pg.evaluate(() => { document.querySelector('#hwTid').value = 'A'.repeat(28); });
  await pg.click('#btnHwQuick'); await pg.waitForTimeout(200);
  assert.ok((await pg.textContent('#hwQMsg')).includes('登入'), '提示登入');
  // 假裝已登入 → 呼叫 publishHw，內容是目前這份
  const got = await pg.evaluate(async () => { let rec = null; pjCloud.state = 'in'; pjCloud.user = { uid: 'u', email: 'x@y' }; pjAdapter.publishHw = async (tid, r) => { rec = { tid, name: r.name, hasData: !!JSON.parse(r.data).sections.length }; }; document.querySelector('#btnHwQuick').click(); await new Promise(r => setTimeout(r, 300)); return { rec, msg: document.querySelector('#hwQMsg').textContent, msg2: document.querySelector('#hwMsg').textContent }; });
  assert.ok(got.rec && got.rec.tid === 'A'.repeat(28) && got.rec.hasData, JSON.stringify(got));
  assert.ok(got.msg.startsWith('✓ 已發布'), got.msg); assert.ok(got.msg2.startsWith('✓ 已發布'));
  // 原本清單裡的發布按鈕還能用
  const got2 = await pg.evaluate(async () => { let n = 0; renderHwBox(); pjAdapter.publishHw = async () => { n++; }; document.querySelector('#hwPublish').click(); await new Promise(r => setTimeout(r, 300)); return n; });
  assert.strictEqual(got2, 1);
  assert.deepStrictEqual(errs, [], errs.join('\n'));
  console.log('全部通過'); await b.close(); srv.close();
})().catch(e => { console.error('失敗：', e.message); process.exit(1); });
