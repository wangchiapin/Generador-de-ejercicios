/* 課堂速查（classroom-lookup.html）自動測試：用假的 Google／MyMemory 回應，測方向選單、中英同時顯示、英文冒出來時改用備用來源
   用法：NODE_PATH=<裝了 playwright-core 的 node_modules> CHROME=/usr/bin/google-chrome node tests/classroom-lookup.test.js */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html'); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html;charset=utf-8' : 'application/octet-stream' }); r.end(d); } }); });

// 假的 Google：key = sl|tl|字；值 = [主要翻譯, 英文近義詞…, 偵測到的語言]
const G = {
  'zh-TW|es|我': ['I'], 'zh-TW|en|我': ['I', ['I', 'me', 'myself']],
  'zh-TW|es|醫生': ['doctor'], 'zh-TW|en|醫生': ['doctor'],
  'zh-TW|es|清淡': ['luz'], 'zh-TW|en|清淡': ['light', ['light', 'bland']],
  'zh-TW|es|太鹹': ['demasiado salado'], 'zh-TW|en|太鹹': ['too salty'],
  'auto|zh-TW|hola': ['你好', [], 'es'], 'auto|zh-TW|hello': ['你好', [], 'en'], 'en|zh-TW|hello': ['你好', [], 'en'],
  'zh-TW|en|你好': ['hello'], 'auto|zh-TW|tarea': ['任務', [], 'es']
};
const MM = { '我|zh-TW|es': 'yo', '醫生|zh-TW|es': 'médico' };   // 假的 MyMemory：醫生 有，其他沒有的當作失敗
const gj = (m, alts, lang) => JSON.stringify([[[m, 'x', null, null, 11]], alts && alts.length ? [['pron', alts, []]] : null, lang || 'zh-TW']);

let passed = 0, failed = 0;
async function test(name, f) { try { await f(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }

(async () => {
  await new Promise(r => srv.listen(8793, r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  async function open(opts) {
    opts = opts || {};
    const pg = await b.newPage(); const opened = [];
    await pg.exposeFunction('__opened', u => opened.push(u));
    await pg.addInitScript(() => { window.open = u => { window.__opened(u); return {}; }; });
    await pg.route('**/*', rt => {
      const u = new URL(rt.request().url());
      if (u.host === 'translate.googleapis.com') {
        if (opts.googleDown) return rt.fulfill({ status: 500, body: 'x' });
        const k = u.searchParams.get('sl') + '|' + u.searchParams.get('tl') + '|' + u.searchParams.get('q'), v = G[k];
        return rt.fulfill({ status: v ? 200 : 500, contentType: 'application/json', body: v ? gj(v[0], v[1], v[2]) : 'x' });
      }
      if (u.host === 'api.mymemory.translated.net') {
        const q = u.searchParams.get('q'), lp = u.searchParams.get('langpair'), t = MM[q + '|' + lp];
        return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ responseData: { translatedText: t || 'MYMEMORY WARNING: x' } }) });
      }
      if (u.hostname === 'localhost') return rt.continue();
      return rt.abort();
    });
    await pg.goto('http://localhost:8793/classroom-lookup.html');
    const ask = async (t, mode) => {
      await pg.selectOption('#inlineHost .mode', mode || 'auto');
      await pg.fill('#inlineHost .q', t); await pg.click('#inlineHost .go');
      await pg.waitForFunction(() => !/翻譯中/.test(document.querySelector('#inlineHost .res').innerText), null, { timeout: 8000 });
      return pg.$eval('#inlineHost .res', e => e.innerText.replace(/\n+/g, ' | ').replace(/ \| 複製/g, ''));   // 複製鍵的字不算進結果
    };
    return { pg, ask, opened };
  }

  console.log('\n課堂速查');
  await test('方向選單有五項（含中文→英語、英語→中文）', async () => {
    const { pg } = await open();
    const v = await pg.$$eval('#inlineHost .mode option', o => o.map(x => x.value));
    assert.deepStrictEqual(v, ['auto', 'zh2es', 'es2zh', 'zh2en', 'en2zh']);
    await pg.close();
  });
  await test('自動判斷：輸入中文，同時顯示西語和英語；英語有近義詞', async () => {
    const { pg, ask } = await open();
    const t = await ask('太鹹');
    assert.ok(/西語 \| demasiado salado/.test(t) && /英語 \| too salty/.test(t), t);
    const t2 = await ask('清淡');
    assert.ok(/西語 \| luz/.test(t2) && /英語 \| light \| 其他：bland/.test(t2), t2);
    await pg.close();
  });
  await test('Google 把「我」翻成英文 I：改用備用來源得到 yo，並標示原因；英語那行照常', async () => {
    const { pg, ask } = await open();
    const t = await ask('我');
    assert.ok(/西語 \| yo \| 來源：MyMemory（備用）：Google 這次回的是英文/.test(t), t);
    assert.ok(/英語 \| I \| 其他：me、myself/.test(t), t);
    await pg.close();
  });
  await test('醫生：Google 回 doctor（和英文一樣），備用有 médico 就換；備用查不到就維持 doctor', async () => {
    const a = await open(); const t = await a.ask('醫生'); assert.ok(/西語 \| médico/.test(t), t); await a.pg.close();
    const saved = MM['醫生|zh-TW|es']; delete MM['醫生|zh-TW|es'];
    try { const c = await open(); const t2 = await c.ask('醫生'); assert.ok(/西語 \| doctor \| 來源：Google 翻譯/.test(t2), t2); await c.pg.close(); }
    finally { MM['醫生|zh-TW|es'] = saved; }
  });
  await test('輸入西語或英語：只翻成中文，不顯示方向標題', async () => {
    const { pg, ask } = await open();
    const t = await ask('hola'); assert.ok(/^你好 \| 來源：Google 翻譯$/.test(t), t);
    assert.ok(!/西語|英語/.test(await ask('hello')));
    await pg.close();
  });
  await test('固定方向：英語→中文、中文→英語，各只有一行', async () => {
    const { pg, ask } = await open();
    assert.ok(/^你好 \| 來源/.test(await ask('hello', 'en2zh')));
    const t = await ask('你好', 'zh2en'); assert.ok(/^hello \| 來源/.test(t), t);
    await pg.close();
  });
  await test('Google 整個掛掉：改用備用來源；備用也沒有就顯示查不到', async () => {
    const { pg, ask } = await open({ googleDown: true });
    assert.ok(/MyMemory/.test(await ask('醫生', 'zh2es')));
    assert.ok(/暫時查不到/.test(await ask('太鹹', 'zh2es')));
    await pg.close();
  });
  await test('開網頁按鈕跟著方向：中英開 translate 的 tl=en、reverso 用 chinese-english；西→中用 spanish-chinese；英→中用 english-chinese', async () => {
    const { pg, ask, opened } = await open();
    const click = async (k) => { await pg.click('#inlineHost .webrow [data-k="' + k + '"]'); await pg.waitForTimeout(100); return opened[opened.length - 1]; };
    await ask('你好', 'zh2en');
    assert.ok(/tl=en/.test(await click('google')) && /chinese-english/.test(await click('reverso')));
    await ask('你好', 'zh2es'); assert.ok(/tl=es/.test(await click('google')) && /chinese-spanish/.test(await click('reverso')));
    await ask('hola', 'auto'); assert.ok(/tl=zh-TW/.test(await click('google')) && /spanish-chinese/.test(await click('reverso')));
    await ask('hello', 'auto'); assert.ok(/english-chinese/.test(await click('reverso')));
    await ask('hello', 'en2zh'); assert.ok(/english-chinese/.test(await click('reverso')));
    await pg.close();
  });
  await test('複製鍵：每行翻譯各一個，按下去剪貼簿是那一行的翻譯，並顯示「已複製」', async () => {
    const { pg, ask } = await open();
    await pg.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await ask('太鹹');
    assert.strictEqual(await pg.$$eval('#inlineHost .cp', e => e.length), 2);
    await pg.click('#inlineHost .cp[data-i="1"]'); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.evaluate(() => navigator.clipboard.readText()), 'too salty');
    assert.strictEqual(await pg.$eval('#inlineHost .cp[data-i="1"]', e => e.textContent), '已複製');
    await pg.click('#inlineHost .cp[data-i="0"]'); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.evaluate(() => navigator.clipboard.readText()), 'demasiado salado');
    await pg.close();
  });
  await b.close(); srv.close();
  console.log('\n' + (failed ? '有 ' + failed + ' 項沒通過（通過 ' + passed + ' 項）' : '全部通過（' + passed + ' 項）') + '\n');
  process.exit(failed ? 1 : 0);
})();
