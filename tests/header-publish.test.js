/* 練習單產生器（index.html）自動測試：「練習單」浮動視窗、「＋ 新練習單」、第 3 步的輸出 PDF／輸出 Word／存檔／傳給學生日誌（用假的發布函式，不會真的寫雲端）。
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
  // 1) 標題右上角：「練習單」「＋ 新練習單」兩個按鈕，沒有「專案」選單，也沒有檔案存取
  assert.ok(await pg.$('header .proj > #btnProjList') && await pg.$('header .proj > #btnNew'));
  assert.strictEqual(await pg.$('#projMenu'), null); assert.strictEqual(await pg.$('#btnSaveProj'), null); assert.strictEqual(await pg.$('#fileOpen'), null);
  assert.strictEqual((await pg.textContent('#btnProjList')).trim(), '練習單');
  // 2) 練習單 = 浮動視窗：只有搜尋和清單；Esc、關閉、點背景都能關
  assert.ok(await pg.isHidden('#projPanel'));
  await pg.click('#btnProjList'); await pg.waitForTimeout(200);
  assert.ok(await pg.isVisible('#projPanel') && await pg.isVisible('#pjFilter') && await pg.isVisible('#pjList'));
  assert.strictEqual(await pg.$('#projPanel #hwTid'), null, '發布設定不在清單視窗裡');
  await pg.keyboard.press('Escape'); assert.ok(await pg.isHidden('#projPanel'));
  await pg.click('#btnProjList'); await pg.click('#pjClose'); assert.ok(await pg.isHidden('#projPanel'));
  await pg.click('#btnProjList'); await pg.mouse.click(5, 5); assert.ok(await pg.isHidden('#projPanel'));
  // 3) 第 3 步：輸出 PDF、輸出 Word、標題＋存檔、傳給學生日誌
  await pg.evaluate(() => { state.sections = [{ id: 's1', type: 'fill', enabled: true, bank: ['比'], items: [{ id: 'a', enabled: true, zh: '我__你高', answer: '比', es: 'x' }] }]; state.meta.grammar = '比較句'; save(); goStep(3); });
  await pg.waitForTimeout(400);
  const names = await pg.evaluate(() => ['btnPrint', 'btnWord', 'btnSaveList', 'btnHwQuick'].map(i => document.getElementById(i).textContent.trim()));
  assert.deepStrictEqual(names, ['輸出 PDF', '輸出 Word', '存檔', '傳給學生日誌']);
  // 存檔：沒填標題 → 用語法點；再存一次（標題沒改）→ 更新同一份，不會變兩份
  await pg.click('#btnSaveList'); await pg.waitForTimeout(150);
  let list = await pg.evaluate(() => PL.map(x => x.name)); assert.deepStrictEqual(list, ['比較句']);
  await pg.click('#btnSaveList'); list = await pg.evaluate(() => PL.map(x => x.name)); assert.deepStrictEqual(list, ['比較句']);
  assert.strictEqual(await pg.inputValue('#pjName'), '比較句', '存檔後標題欄顯示名稱');
  // 改了標題再存 → 另存新的一份
  await pg.fill('#pjName', '比較句 第二版'); await pg.click('#btnSaveList');
  list = await pg.evaluate(() => PL.map(x => x.name)); assert.deepStrictEqual(list.sort(), ['比較句', '比較句 第二版']);
  // 切到別的選項重畫第 3 步，標題欄的字還在
  await pg.fill('#pjName', '暫存標題'); await pg.selectOption('[data-m="opts.script"]', 'simp'); await pg.waitForTimeout(200);
  assert.strictEqual(await pg.inputValue('#pjName'), '暫存標題');
  // 清單視窗：搜尋、開啟舊的那份會把標題填回去
  await pg.click('#btnProjList'); await pg.fill('#pjFilter', '第二版'); assert.strictEqual(await pg.locator('#pjList .pjitem').count(), 1); await pg.fill('#pjFilter', '');
  pg.once('dialog', d => d.accept());   // 目前這份還沒存的話會先問一下
  await pg.locator('#pjList .pjitem', { hasText: '比較句' }).first().locator('[data-a="open"]').click(); await pg.waitForTimeout(200);
  assert.ok(await pg.isHidden('#projPanel'));
  assert.strictEqual(await pg.inputValue('#pjName'), await pg.evaluate(() => PL.find(x => x.id === currentPid).name), '開啟舊的那份，標題欄跟著換');
  await pg.evaluate(() => goStep(3)); await pg.waitForTimeout(300);   // 開啟舊份後會回到檢查頁，再回輸出頁
  // 傳給學生日誌：沒老師代號 → 打開發布設定並提示；有代號沒登入 → 提示登入
  await pg.evaluate(() => { document.querySelector('#hwTid').value = ''; });
  assert.ok(await pg.isHidden('#hwSetBox'));
  await pg.click('#btnHwQuick'); await pg.waitForTimeout(200);
  assert.ok((await pg.textContent('#hwQMsg')).includes('老師代號')); assert.ok(await pg.isVisible('#hwSetBox') && await pg.isVisible('#hwTid'));
  await pg.evaluate(() => { document.querySelector('#hwTid').value = 'A'.repeat(28); });
  await pg.click('#btnHwQuick'); await pg.waitForTimeout(150); assert.ok((await pg.textContent('#hwQMsg')).includes('登入'));
  // 假裝已登入：送出的是目前這份、名稱用標題欄
  const got = await pg.evaluate(async () => { let rec = null; pjCloud.state = 'in'; pjCloud.user = { uid: 'u', email: 'x@y' }; pjAdapter.publishHw = async (tid, r) => { rec = { tid, name: r.name, hasData: !!JSON.parse(r.data).sections.length }; }; document.querySelector('#btnHwQuick').click(); await new Promise(r => setTimeout(r, 300)); return { rec, msg: document.querySelector('#hwQMsg').textContent }; });
  assert.ok(got.rec && got.rec.tid === 'A'.repeat(28) && got.rec.hasData && got.rec.name, JSON.stringify(got));
  assert.ok(got.msg.startsWith('✓ 已發布'), got.msg);
  // 發布設定：點「發布設定」可以收起來
  await pg.click('#btnHwSet'); assert.ok(await pg.isHidden('#hwSetBox'));
  // ＋ 新練習單：清空並把標題欄清掉
  pg.once('dialog', d => d.accept()); await pg.click('#btnNew'); await pg.waitForTimeout(300);
  assert.strictEqual(await pg.evaluate(() => state.sections.length), 0); assert.strictEqual(await pg.evaluate(() => pjNameVal), '');
  assert.deepStrictEqual(errs, [], errs.join('\n'));
  console.log('全部通過'); await b.close(); srv.close();
})().catch(e => { console.error('失敗：', e.message); process.exit(1); });
