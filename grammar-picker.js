/* 語法點選單：在輸入框打字時，從速查表（grammar-data.js）的文法點中挑選。
   用法：GrammarPicker.attach(容器元素, 'input 的選擇器')；容器會在輸入框重畫後繼續有效。 */
(function(){
  var css=document.createElement('style');
  css.textContent='.gp-list{position:fixed;z-index:9999;background:#efece6;border:1px solid #161616;max-height:260px;overflow:auto;box-shadow:0 4px 14px rgba(0,0,0,.15);font-size:.92rem}'+
    '.gp-list div{padding:8px 12px;border-bottom:1px solid #d9d5cc;cursor:pointer;line-height:1.35}'+
    '.gp-list div:last-child{border-bottom:0}.gp-list div.on,.gp-list div:hover{background:#d9d5cc}'+
    '.gp-list small{display:block;color:#6b6b6b;font-size:.78rem}';
  document.head.appendChild(css);
  var list=document.createElement('div'); list.className='gp-list'; list.hidden=true; document.body.appendChild(list);
  var cur=null, items=[], sel=-1;
  function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}
  function G(){return window.GRAMMAR}
  function hay(p){
    if(p._h) return p._h;
    return p._h=norm([p.t.tc,p.t.sc,p.t.es,p.t.en,p.t.ens,p.k||''].join(' '));
  }
  function tok(tk,h){
    if(!/^[a-z0-9]+$/.test(tk)) return h.indexOf(tk)>=0;
    var rx=tk.length<=3? new RegExp('(^|[^a-z0-9])'+tk+'([^a-z0-9]|$)') : new RegExp('(^|[^a-z0-9])'+tk);
    return rx.test(h);
  }
  function find(q){
    var g=G(); if(!g) return [];
    var ts=norm(q).split(/\s+/).filter(Boolean); if(!ts.length) return [];
    var out=[];
    g.points.forEach(function(p,i){
      var h=hay(p), ok=true, s=0, t=norm(p.t.tc+' '+p.t.sc);
      for(var j=0;j<ts.length;j++){ if(!tok(ts[j],h)){ok=false;break} if(t.indexOf(ts[j])>=0) s+=10; else s+=1; }
      if(ok) out.push({p:p,s:s,i:i});
    });
    out.sort(function(a,b){return b.s-a.s||a.i-b.i});
    return out.slice(0,8).map(function(x){return x.p});
  }
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function hide(){list.hidden=true; items=[]; sel=-1}
  function show(inp){
    cur=inp; items=find(inp.value);
    if(!items.length){hide();return}
    var g=G();
    list.innerHTML=items.map(function(p,i){
      var L=g.lessons[p.b+'-'+p.l]; 
      return '<div data-i="'+i+'">'+esc(p.t.tc)+'<small>第 '+p.b+' 冊 第 '+p.l+' 課'+(L?' · '+esc(L.tc):'')+' · '+esc(p.t.es||'')+'</small></div>';
    }).join('');
    var r=inp.getBoundingClientRect();
    list.style.left=r.left+'px'; list.style.width=r.width+'px';
    var below=window.innerHeight-r.bottom;
    if(below<200 && r.top>below){ list.style.top='auto'; list.style.bottom=(window.innerHeight-r.top)+'px'; }
    else { list.style.bottom='auto'; list.style.top=r.bottom+'px'; }
    list.hidden=false; sel=-1;
  }
  function pick(i){
    var p=items[i]; if(!p||!cur) return;
    cur.value=p.t.tc;
    cur.dispatchEvent(new Event('input',{bubbles:true}));
    cur.dispatchEvent(new Event('change',{bubbles:true}));
    hide();
  }
  list.addEventListener('mousedown',function(e){ e.preventDefault(); var d=e.target.closest('[data-i]'); if(d) pick(+d.dataset.i); });
  function mark(){ Array.prototype.forEach.call(list.children,function(c,i){c.classList.toggle('on',i===sel)}); }
  /* 依語法點名稱，回傳要附進指令的「教材參考資料」（名稱要和速查表完全一樣才會帶入；沒有就回傳空字串） */
  function ref(titles){
    var g=G(); if(!g) return '';
    var lines=[];
    (titles||[]).forEach(function(t){
      t=String(t||'').trim(); if(!t) return;
      var p=null; for(var i=0;i<g.points.length;i++){ if(g.points[i].t.tc===t){p=g.points[i];break;} }
      if(!p) return;
      var ex=p.ex.slice(0,3).map(function(e){return e.c}).join('／');
      lines.push('  〔'+t+'〕（第 '+p.b+' 冊第 '+p.l+' 課）說明：'+p.d.tc+(ex?' 教材例句：'+ex:''));
    });
    return lines.length? '- 語法點參考資料（來自《當代中文課程》，用來掌握這個語法點在教材裡的用法範圍，不必照抄）：\n'+lines.join('\n') : '';
  }
  window.GrammarPicker={
    ref:ref,
    attach:function(box,selector){
      box.addEventListener('input',function(e){ if(e.target.matches(selector)) show(e.target); });
      box.addEventListener('focusin',function(e){ if(e.target.matches(selector) && e.target.value.trim()) show(e.target); });
      box.addEventListener('focusout',function(e){ if(e.target.matches(selector)) setTimeout(hide,150); });
      box.addEventListener('keydown',function(e){
        if(!e.target.matches(selector)||list.hidden) return;
        if(e.key==='ArrowDown'){e.preventDefault(); sel=Math.min(items.length-1,sel+1); mark();}
        else if(e.key==='ArrowUp'){e.preventDefault(); sel=Math.max(0,sel-1); mark();}
        else if(e.key==='Enter' && sel>=0){e.preventDefault(); pick(sel);}
        else if(e.key==='Escape'){hide();}
      });
    }
  };
  window.addEventListener('scroll',function(e){ if(!list.hidden && !list.contains(e.target)) hide(); },true);
})();
