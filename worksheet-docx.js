/* 練習單 → Word (.docx)
   直接組 OOXML，用 JSZip 打包（第一次按「匯出 Word」時才從網路載入 JSZip）。
   用到 index.html 裡的 state、syllables、pyLine、zyLine、toSimp、matchPerm 等；不改動它們。
   拼音／注音用 Word 原生的「注音標示」（ruby），會顯示在漢字上方。 */
(function () {
  'use strict';
  const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const FONT_ZH = 'Microsoft JhengHei', FONT_LAT = 'Calibri';
  const GRAY = '777777', MID = '555555';
  const xe = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NBSP = ' ';

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = JSZIP_URL;
      sc.onload = () => window.JSZip ? res(window.JSZip) : rej(new Error('JSZip 載入失敗'));
      sc.onerror = () => rej(new Error('無法載入 JSZip（需要網路）'));
      document.head.appendChild(sc);
    });
  }

  function build(S) {
    const o = S.opts, m = S.meta;
    const K = (+o.fontPct || 100) / 100, G = (+o.gapPct || 100) / 100;
    const letter = o.paper === 'Letter';
    const PW = letter ? 12240 : 11906, PH = letter ? 15840 : 16838;
    const ML = 794, MR = 794, MT = 737, MB = 907;
    const CW = PW - ML - MR;
    const hp = pt => Math.max(2, Math.round(pt * 2 * K));
    const sp = mm => Math.round(mm * 56.7 * G);

    /* ---------- 基本積木 ---------- */
    function rpr(r) {
      let x = `<w:rPr><w:rFonts w:ascii="${FONT_LAT}" w:hAnsi="${FONT_LAT}" w:eastAsia="${FONT_ZH}" w:cs="${FONT_LAT}"/>`;
      if (r.b) x += '<w:b/>';
      if (r.strike) x += '<w:strike/>';
      if (r.color) x += `<w:color w:val="${r.color}"/>`;
      const z = hp(r.sz || 10.5);
      x += `<w:sz w:val="${z}"/><w:szCs w:val="${z}"/>`;
      if (r.u) x += '<w:u w:val="single"/>';
      return x + '</w:rPr>';
    }
    const run = (t, r = {}) => t === '' ? '' : `<w:r>${rpr(r)}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
    const tabRun = () => '<w:r><w:tab/></w:r>';
    function ruby(base, rt, r) {
      const bz = hp(r.sz || 10.5), rz = Math.max(8, Math.round(bz * 0.46));
      return `<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="center"/><w:hps w:val="${rz}"/><w:hpsRaise w:val="${Math.round(bz * 0.9)}"/><w:hpsBaseText w:val="${bz}"/><w:lid w:val="zh-TW"/></w:rubyPr>` +
        `<w:rt><w:r>${rpr({ sz: (r.sz || 10.5) * 0.46, color: MID })}<w:t xml:space="preserve">${xe(rt)}</w:t></w:r></w:rt>` +
        `<w:rubyBase><w:r>${rpr(r)}<w:t xml:space="preserve">${xe(base)}</w:t></w:r></w:rubyBase></w:ruby></w:r>`;
    }
    function para(inner, p = {}) {
      let x = '<w:p><w:pPr>';
      if (p.keepNext) x += '<w:keepNext/>';
      if (p.keepLines) x += '<w:keepLines/>';
      if (p.pbb) x += '<w:pageBreakBefore/>';
      if (p.box) x += '<w:pBdr><w:top w:val="single" w:sz="4" w:space="3" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="3" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="4" w:color="999999"/></w:pBdr>';
      else if (p.bb) x += `<w:pBdr><w:bottom w:val="single" w:sz="${p.bb === 'thick' ? 8 : 4}" w:space="1" w:color="${p.bb === 'thick' ? '222222' : '999999'}"/></w:pBdr>`;
      if (p.tabR) x += `<w:tabs><w:tab w:val="right" w:pos="${CW}"/></w:tabs>`;
      x += `<w:spacing w:before="${p.before || 0}" w:after="${p.after == null ? sp(2.2) : p.after}" w:line="${p.line || 276}" w:lineRule="${p.exact ? 'exact' : 'auto'}"/>`;
      if (p.ind) x += `<w:ind w:left="${p.ind}"/>`;
      if (p.jc) x += `<w:jc w:val="${p.jc}"/>`;
      return x + '</w:pPr>' + inner + '</w:p>';
    }
    function cell(w, paras, c = {}) {
      let pr = `<w:tcW w:w="${w}" w:type="dxa"/>`;
      if (c.bb) pr += `<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${c.bb}"/></w:tcBorders>`;
      return `<w:tc><w:tcPr>${pr}</w:tcPr>${paras || para('')}</w:tc>`;
    }
    function table(widths, rows, t = {}) {
      const total = widths.reduce((a, b) => a + b, 0);
      const bd = t.border ? `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/></w:tblBorders>` : '';
      return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
        `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
        rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r}</w:tr>`).join('') + '</w:tbl>' + para('', { after: 0, line: 120, exact: true });
    }

    /* ---------- 中文＋拼音／注音 ---------- */
    function zhRuns(text, mode, r) {
      text = String(text || '');
      const syl = mode === 'none' ? null : syllables(text);
      let pos = 0, out = '';
      for (const ch of text) {
        const x = syl && syl[pos];
        const rt = x && x.isZh ? (mode === 'pinyin' ? x.py : x.zy) : '';
        out += rt ? ruby(ch, rt, r) : run(ch, r);
        pos += ch.length;
      }
      return out;
    }
    function partsRuns(parts, mode, blankFn, r) {
      const filled = parts.map(p => p.t === 'txt' ? p.s : p.a).join('');
      const syl = mode === 'none' ? null : syllables(filled);
      let pos = 0, out = '';
      for (const p of parts) {
        if (p.t === 'blank') { out += blankFn(p); pos += p.a.length; continue; }
        for (const ch of p.s) {
          const x = syl && syl[pos];
          const rt = x && x.isZh ? (mode === 'pinyin' ? x.py : x.zy) : '';
          out += rt ? ruby(ch, rt, r) : run(ch, r);
          pos += ch.length;
        }
      }
      return out;
    }
    const blankU = (n, r) => run(NBSP.repeat(n), Object.assign({}, r, { u: true }));
    const lineP = (n = 1) => { let x = ''; for (let i = 0; i < n; i++) x += para('', { bb: true, after: 0, line: Math.round(sp(8) * 1.0), exact: true, ind: 420 }); return x; };
    const noP = i => run(`${i}.  `, { sz: 9.5, color: GRAY });
    const esP = t => t ? para(run(t, { sz: 8.8, color: GRAY }), { ind: 420, after: sp(1.2) }) : '';
    const mode = o.student;
    const ZH = 14, ZHK = 13;
    const rubyLine = mode === 'none' ? 300 : 400;

    function derived(sentence) {
      let x = '';
      const add = t => { x += para(run(t, { sz: 8.8, color: GRAY }), { ind: 420, after: 0 }); };
      if (o.simp) add(toSimp(sentence));
      if (o.pinyin) add(pyLine(sentence));
      if (o.zhuyin) add(zyLine(sentence));
      return x;
    }

    /* ---------- 練習頁 ---------- */
    function secHead(sec, no, pts, es, pbb) {
      return para(run(`${S_NUM[no]}、${S_DEF[sec.type].name}`, { sz: 12.5, b: true }) + run('   ' + es, { sz: 8.8, color: GRAY }) + tabRun() + run(`${pts} pts`, { sz: 8.8, color: GRAY }),
        { bb: true, tabR: true, keepNext: true, pbb, before: sp(5), after: sp(2.5) });
    }
    function sectionStudent(sec, no) {
      const items = sec.items.filter(i => i.enabled);
      let x = secHead(sec, no, S_count(sec), S_secEs(sec), !!sec.pageBreak);
      const uniq = a => new Set(a).size === a.length;
      if (sec.type === 'fill' && sec.bank.length) {
        const rep = !uniq(items.map(i => i.answer));
        x += para(run(sec.bank.join('　'), { sz: 12 }) + run(`   (${rep ? 'se pueden repetir' : 'cada palabra se usa una vez'})`, { sz: 8.5, color: GRAY }), { box: true, after: sp(3) });
      }
      if (sec.type === 'cloze' && sec.bank.length) x += para(run(sec.bank.join('　'), { sz: 12 }), { box: true, after: sp(3) });
      if (sec.type === 'match') {
        const perm = S_matchPerm(items);
        const w = [500, 2300, 1500, CW - 4300];
        x += table(w, items.map((it, r) => cell(w[0], para(run(String(r + 1), { sz: 9.5, color: GRAY }), { after: sp(1.5) })) +
          cell(w[1], para(zhRuns(it.zh, mode, { sz: 14 }), { after: sp(1.5), line: rubyLine })) +
          cell(w[2], para(run('________', { sz: 11, color: GRAY }), { after: sp(1.5) })) +
          cell(w[3], para(run(S_ALPHA[r] + '  ', { sz: 11, b: true, color: MID }) + run(items[perm[r]].es, { sz: 11 }), { after: sp(1.5) }))));
        return x;
      }
      items.forEach((it, i) => {
        const n = noP(i + 1);
        const keep = { keepLines: true };
        switch (sec.type) {
          case 'fill':
            x += para(n + partsRuns(S_partsOf('fill', it), mode, () => blankU(9, { sz: ZH }), { sz: ZH }), Object.assign({ line: rubyLine, after: sp(1) }, keep)) + (o.cueEs ? esP(it.es) : ''); break;
          case 'cloze':
            x += para(partsRuns(S_partsOf('cloze', it), mode, p => run(S_CIRC[p.n - 1] || String(p.n), { sz: 11, color: MID }) + blankU(7, { sz: 11 }), { sz: 12.5 }), { box: true, line: mode === 'none' ? 420 : 500, after: sp(3) }); break;
          case 'order':
            x += para(n + it.tokens.map(t => run('[ ', { sz: 12, color: GRAY }) + zhRuns(t, mode, { sz: 13 }) + run(' ]    ', { sz: 12, color: GRAY })).join(''), Object.assign({ line: rubyLine, after: sp(1) }, keep)) + (o.cueEs ? esP(it.es) : '') + lineP(1); break;
          case 'choice':
            x += para(n + (o.cueEs && it.es ? run(it.es, { sz: 8.8, color: GRAY }) : '') + tabRun() + run('Respuesta: ______', { sz: 8.8, color: GRAY }), { tabR: true, keepNext: true, after: sp(1) }) +
              para(it.options.filter(Boolean).map((t, k) => run(LETTERS[k] + '  ', { sz: 11, b: true, color: MID }) + zhRuns(t, mode, { sz: 12 }) + run('      ', { sz: 12 })).join(''), { ind: 420, line: rubyLine, after: sp(2.6) }); break;
          case 'fix':
            x += para(n + zhRuns(it.wrong, mode, { sz: ZH }), Object.assign({ line: rubyLine, after: sp(1) }, keep)) + lineP(1); break;
          case 'translate':
            x += para(n + run(it.es, { sz: 11 }), { keepNext: true, after: sp(.8) }) + (it.vocab ? para(run(it.vocab, { sz: 8.8, color: GRAY }), { ind: 420, after: sp(.8) }) : '') + lineP(1); break;
          case 'zh2es':
            x += para(n + zhRuns(it.zh, mode, { sz: ZH }), Object.assign({ line: rubyLine, after: sp(.8) }, keep)) + (it.vocab ? para(run(it.vocab, { sz: 8.8, color: GRAY }), { ind: 420, after: sp(.8) }) : '') + lineP(1); break;
          case 'sentence':
            x += para(n + zhRuns(it.cue, mode, { sz: ZH }), Object.assign({ line: rubyLine, after: sp(.8) }, keep)) + esP(it.es) + lineP(2); break;
        }
      });
      return x;
    }

    /* ---------- 答案頁 ---------- */
    function sectionKey(sec, no) {
      const items = sec.items.filter(i => i.enabled);
      let x = para(run(`${S_NUM[no]}、${S_DEF[sec.type].name}`, { sz: 11, b: true }), { bb: true, keepNext: true, before: sp(3.5), after: sp(1.5) });
      const tag = it => (S_isMulti() && it.points && it.points.length) ? run('  〔' + it.points.join('＋') + '〕', { sz: 7.8, color: GRAY }) : '';
      const note = it => (o.teacherNote && it.note) ? para(run(it.note, { sz: 8.8, color: MID }), { ind: 420, after: 0 }) : '';
      const es = t => (o.keyEs && t) ? para(run(t, { sz: 8.8, color: GRAY }), { ind: 420, after: 0 }) : '';
      const sep = { after: sp(2.2), keepLines: true, line: 300 };
      const perm = sec.type === 'match' ? S_matchPerm(items) : null;
      items.forEach((it, i) => {
        const n = noP(i + 1);
        const A = t => run(t, { sz: ZHK, b: true, u: true });
        switch (sec.type) {
          case 'fill': x += para(n + partsRuns(S_partsOf('fill', it), 'none', p => A(NBSP + p.a + NBSP), { sz: ZHK }) + tag(it), { keepNext: true, after: 0 }) + derived(S_answerSentence('fill', it)) + es(it.es) + note(it); break;
          case 'cloze': {
            x += para(it.answers.map((a, k) => run((S_CIRC[k] || k + 1) + ' ', { sz: 11, color: MID }) + run(a + '　', { sz: ZHK, b: true })).join('') + tag(it), { keepNext: true, after: sp(1) });
            x += para(partsRuns(S_partsOf('cloze', it), 'none', p => A(NBSP + p.a + NBSP), { sz: 12 }), { line: 360, after: sp(1) });
            x += derived(S_answerSentence('cloze', it)).replace(/<w:ind w:left="420"\/>/g, '') + (o.keyEs && it.es ? para(run(it.es, { sz: 8.8, color: GRAY }), { after: 0 }) : '') + note(it); break;
          }
          case 'order': x += para(n + run(it.answer, { sz: ZHK }) + tag(it), { keepNext: true, after: 0 }) + derived(it.answer) + es(it.es) + note(it); break;
          case 'choice': x += para(n + run(LETTERS[it.answer] || '?', { sz: ZHK, b: true, u: true }) + run('  ' + (it.options[it.answer] || ''), { sz: ZHK }) + tag(it), { keepNext: true, after: 0 }) + derived(it.options[it.answer] || '') + es(it.es) + note(it); break;
          case 'fix': x += para(n + run(it.wrong, { sz: ZHK, color: '999999', strike: true }) + run('  →  ', { sz: ZHK }) + A(NBSP + it.correct + NBSP) + tag(it), { keepNext: true, after: 0 }) + derived(it.correct) + (it.tip ? para(run(it.tip, { sz: 8.8, color: MID }), { ind: 420, after: 0 }) : '') + note(it); break;
          case 'translate': x += para(n + run(it.answer, { sz: ZHK }) + tag(it), { keepNext: true, after: 0 }) + derived(it.answer) + es(it.es) + note(it); break;
          case 'zh2es': x += para(n + run(it.zh, { sz: ZHK }) + tag(it), { keepNext: true, after: 0 }) + derived(it.zh) + para(run(it.answer, { sz: 9.5, color: MID }), { ind: 420, after: 0 }) + note(it); break;
          case 'match': x += para(n + run(S_ALPHA[perm.indexOf(i)] || '?', { sz: ZHK, b: true, u: true }) + run('  ' + it.zh, { sz: ZHK }), { keepNext: true, after: 0 }) + derived(it.zh) + para(run(it.es, { sz: 9.5, color: MID }), { ind: 420, after: 0 }) + note(it); break;
          case 'sentence': x += para(run('【' + it.cue + '】 ', { sz: 8.8, color: GRAY }) + run(it.answer, { sz: ZHK }) + tag(it), { keepNext: true, after: 0 }) + derived(it.answer) + es(it.es) +
            para(run('示範答案。學生的句子不同也可以，只要用了指定的詞語、句子正確自然就給分。', { sz: 8.8, color: MID }), { ind: 420, after: 0 }) + note(it); break;
        }
        x += para('', sep);
      });
      return x;
    }

    /* ---------- 整份文件 ---------- */
    const secs = S.sections.filter(s => s.enabled && s.items.some(i => i.enabled));
    const total = secs.reduce((a, s) => a + S_count(s), 0);
    const title = m.title || m.grammar || '練習單';
    const sub = m.subtitle || `Ejercicios de gramática china${S_levelEs() ? ' · ' + S_levelEs() : ''}`;
    let body = '';
    if (o.print !== 'key') {
      body += para(run(title, { sz: 22 }), { bb: 'thick', after: sp(1), line: 300 });
      body += para(run(sub, { sz: 9.5, color: GRAY }), { after: sp(3) });
      const wd = [Math.floor(CW / 3), Math.floor(CW / 3), CW - 2 * Math.floor(CW / 3)];
      body += table(wd, [cell(wd[0], para(run('姓名 Nombre:', { sz: 9.5, color: MID }), { bb: true, after: 0 })) + cell(wd[1], para(run('日期 Fecha:', { sz: 9.5, color: MID }), { bb: true, after: 0 })) + cell(wd[2], para(run(`分數 Puntos:      / ${total}`, { sz: 9.5, color: MID }), { bb: true, after: 0 }))]);
      const g = S.grammarBox;
      if (g.points.some(p => p.pattern)) {
        const w = [Math.round(CW * .34), Math.round(CW * .34), CW - 2 * Math.round(CW * .34)];
        body += para(run('Recuerda · 先看一下', { sz: 10, b: true }), { keepNext: true, after: sp(1) });
        body += table(w, g.points.filter(p => p.pattern).map(p => cell(w[0], para(run(p.pattern, { sz: 9.6, b: true }), { after: 0 })) + cell(w[1], para(run(p.es, { sz: 9.6 }), { after: 0 })) + cell(w[2], para(run(p.example, { sz: 11 }), { after: 0 }))), { border: true });
        if (g.warning) body += para(run(g.warning, { sz: 9.2, color: MID }), { after: sp(3) });
      }
      if (o.vocab && S.vocab.some(v => v.zh)) {
        const vs = S.vocab.filter(v => v.zh);
        const w = o.vocabPy ? [Math.round(CW * .26), Math.round(CW * .3), CW - Math.round(CW * .26) - Math.round(CW * .3)] : [Math.round(CW * .4), CW - Math.round(CW * .4)];
        body += para(run('Vocabulario · 生詞', { sz: 10, b: true }), { keepNext: true, after: sp(1) });
        body += table(w, vs.map(v => cell(w[0], para(run(v.zh, { sz: 11 }), { after: 0 }), { bb: 'DDDDDD' }) +
          (o.vocabPy ? cell(w[1], para(run(S_vPy(v.zh), { sz: 9, color: GRAY }), { after: 0 }), { bb: 'DDDDDD' }) : '') +
          cell(w[w.length - 1], para(run(v.es, { sz: 9.6 }), { after: 0 }), { bb: 'DDDDDD' })), { border: true });
      }
      secs.forEach((s, i) => { body += sectionStudent(s, i); });
    }
    if (o.print !== 'student') {
      body += para(run('答案 · Respuestas', { sz: 19 }), { bb: 'thick', pbb: o.print === 'both', after: sp(1), line: 300 });
      body += para(run(title + ((o.pinyin || o.zhuyin) ? '　·　拼音、注音為電腦自動產生，使用前請老師再確認' : ''), { sz: 9.5, color: GRAY }), { after: sp(2) });
      secs.forEach((s, i) => { body += sectionKey(s, i); });
      if (S_isMulti()) { const st = S_pointStats(); body += para(run(`語法點分布（不含段落填空）：${st.names.map(n => `${n} ${st.per[n]} 題`).join('、')}；混合題 ${st.mixed} 題 / 共 ${st.total} 題。`, { sz: 9, color: MID }), { before: sp(3) }); }
      if (o.teacherNote) body += para(run(`全部 ${total} 分，每題 1 分。西翻中、排序的答案不只一種時，語序正確、使用指定句型即可給分。`, { sz: 9, color: MID }), { box: true, before: sp(3) });
    }

    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="${PW}" w:h="${PH}"/><w:pgMar w:top="${MT}" w:right="${MR}" w:bottom="${MB}" w:left="${ML}" w:header="454" w:footer="454" w:gutter="0"/></w:sectPr>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
    const fr = { sz: 7.5, color: '888888' };
    const fld = ins => `<w:r>${rpr(fr)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr(fr)}<w:instrText xml:space="preserve"> ${ins} </w:instrText></w:r><w:r>${rpr(fr)}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr(fr)}<w:t>1</w:t></w:r><w:r>${rpr(fr)}<w:fldChar w:fldCharType="end"/></w:r>`;
    const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${para(run(m.footer || '', fr) + tabRun() + fld('PAGE') + run(' / ', fr) + fld('NUMPAGES'), { tabR: true, after: 0 })}</w:ftr>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT_LAT}" w:hAnsi="${FONT_LAT}" w:eastAsia="${FONT_ZH}" w:cs="${FONT_LAT}"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-ES" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
    return { '[Content_Types].xml': contentTypes, '_rels/.rels': rels, 'word/document.xml': documentXml, 'word/_rels/document.xml.rels': docRels, 'word/styles.xml': stylesXml, 'word/footer1.xml': footerXml };
  }

  // index.html 裡的東西（用函式包起來，等到真的要匯出時才取用）
  const LETTERS = ['A', 'B', 'C', 'D'];
  let S_NUM, S_DEF, S_CIRC, S_ALPHA, S_count, S_secEs, S_matchPerm, S_partsOf, S_answerSentence, S_isMulti, S_pointStats, S_levelEs, S_vPy;
  function bind() {
    S_NUM = NUM; S_DEF = DEF; S_CIRC = CIRC; S_ALPHA = ALPHA; S_count = countPoints; S_secEs = sectionEs; S_matchPerm = matchPerm;
    S_partsOf = partsOf; S_answerSentence = answerSentence; S_isMulti = isMulti; S_pointStats = pointStats; S_levelEs = levelEs; S_vPy = vPy;
  }

  window.exportWord = async function () {
    const secs = state.sections.filter(s => s.enabled && s.items.some(i => i.enabled));
    if (!secs.length) { toast('還沒有題目可以匯出'); return; }
    try {
      toast('正在產生 Word 檔…');
      const JSZip = await loadJSZip();
      bind();
      const files = build(state);
      const zip = new JSZip();
      Object.keys(files).forEach(k => zip.file(k, files[k]));
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName()}.docx`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      toast('已匯出 Word 檔');
    } catch (e) { toast('匯出 Word 失敗：' + e.message); }
  };
  window.__buildDocxParts = function () { bind(); return build(state); }; // 測試用
})();
