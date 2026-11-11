"""「發布給學生頁」按鈕的畫面測試（Playwright + Chrome；雲端登入與發布換成假的，不會碰任何真的資料）。
用法：python3 tests/publish-to-portal.py"""
import http.server, socketserver, threading, os, json
from playwright.sync_api import sync_playwright
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
H = http.server.SimpleHTTPRequestHandler; H.log_message = lambda *a, **k: None
srv = socketserver.TCPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/' % srv.server_address[1]
TID = 'T' * 28
ok = bad = 0
def check(n, c, x=''):
    global ok, bad
    if c: ok += 1; print('  ✓', n)
    else: bad += 1; print('  ✗', n, x)
STUB = """
window.__pub = [];
window.__pjAdapter = { _cb: null,
  async init(cb){ this._cb = cb; if(!this.u) setTimeout(() => { if(!this.u) cb(null); }, 0); },
  async login(){ this.u = { uid: 'G'.repeat(28), email: 'a@b.c' }; this._cb(this.u); },
  async logout(){ this._cb(null); },
  async list(){ return []; }, async put(r){}, async remove(id){},
  async publishHw(tid, r){ if(window.__deny){ const e = new Error('denied'); e.code = 'permission-denied'; throw e; } window.__pub.push([tid, r]); } };
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1000, 'height': 900})
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.add_init_script(STUB)
    pg.goto(base + 'index.html'); pg.wait_for_timeout(500)
    pg.evaluate("document.getElementById('projPanel').hidden = false"); pg.wait_for_timeout(200)
    check('沒登入：發布按鈕不能按、提示先登入', pg.is_disabled('#hwPublish') and '登入' in pg.inner_text('#hwMsg'))
    pg.click('#pjLogin'); pg.wait_for_timeout(300)
    check('登入後顯示這個帳號的代碼', pg.inner_text('#hwUid') == 'G' * 28 and not pg.is_hidden('#hwUidLine'))
    pg.fill('#hwTid', 'abc'); pg.click('#hwPublish'); pg.wait_for_timeout(100)
    check('老師代號格式不對：擋下來', '格式不對' in pg.inner_text('#hwMsg'))
    pg.fill('#hwTid', TID); pg.click('#hwPublish'); pg.wait_for_timeout(100)
    check('沒有題目：擋下來', '還沒有題目' in pg.inner_text('#hwMsg'))
    pg.evaluate("state.sections.push({ id: 's1', type: 'fill', enabled: true, bank: [], items: [{ id: 'f1', enabled: true, zh: '我__書放好', answer: '把', es: '', note: '', points: [] }] }); state.meta.grammar = '把字句';")
    pg.fill('#pjName', '把字句練習'); pg.click('#hwPublish'); pg.wait_for_timeout(200)
    pub = pg.evaluate('window.__pub')
    check('發布：寫到老師代號底下，名稱與題數正確', len(pub) == 1 and pub[0][0] == TID and pub[0][1]['name'] == '把字句練習' and pub[0][1]['count'] == 1, pub)
    check('發布內容包含整份練習單（含答案，只有老師看得到）', json.loads(pub[0][1]['data'])['sections'][0]['items'][0]['answer'] == '把')
    check('發布成功訊息', '已發布' in pg.inner_text('#hwMsg'))
    check('老師代號記在瀏覽器，下次不用再貼', pg.evaluate("localStorage.getItem('gwm.portal.tid')") == TID)
    pg.evaluate('window.__deny = true'); pg.click('#hwPublish'); pg.wait_for_timeout(200)
    check('沒有權限：說明要到後台允許帳號', '沒有權限' in pg.inner_text('#hwMsg') and '發布帳號' in pg.inner_text('#hwMsg'))
    check('沒有錯誤訊息', not errs, errs)
    b.close()
print('全部通過（%d）' % ok if not bad else '有 %d 項沒過' % bad)
