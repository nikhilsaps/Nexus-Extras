const app = document.getElementById('app');
const crumbs = document.getElementById('crumbs');
const foot = document.getElementById('foot');
let DB = null;

const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const bySlug = slug => DB.series.find(s => s.slug === slug);

async function boot(){
  try{
    DB = await (await fetch('data/catalog.json')).json();
  }catch(e){
    app.innerHTML = '<div class="err">Could not load catalog.json.</div>'; return;
  }
  foot.innerHTML = `${esc(DB.source)} &middot; snapshot ${esc((DB.generated||'').slice(0,10))} &middot; ${DB.note?esc(DB.note):''}`;
  window.addEventListener('hashchange', route);
  route();
}

function setCrumbs(parts){
  crumbs.innerHTML = parts.map((p,i)=> p.href
    ? `<a href="${p.href}">${esc(p.label)}</a>` : esc(p.label)
  ).join(' <span style="opacity:.4">/</span> ');
}

function route(){
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.split('/').filter(Boolean);
  window.scrollTo(0,0);
  if(m[0]==='series' && m[1]) return viewSeries(decodeURIComponent(m[1]));
  if(m[0]==='read' && m[1] && m[2]) return viewReader(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  return viewHome();
}

function viewHome(){
  setCrumbs([{label:'Library'}]);
  const cards = DB.series.map(s=>`
    <div class="card" onclick="location.hash='#/series/${encodeURIComponent(s.slug)}'">
      <span class="cov" style="background-image:url('${esc(s.cover)}')"></span>
      <div class="meta"><div class="t">${esc(s.title)}</div>
        <div class="s">${esc(s.type)} &middot; ${esc(s.status)} &middot; ${s.chapters.length} ch</div></div>
    </div>`).join('');
  app.innerHTML = `<h1>Library</h1><div class="sub">${DB.series.length} series in this snapshot</div><div class="grid">${cards}</div>`;
}

function viewSeries(slug){
  const s = bySlug(slug);
  if(!s){ app.innerHTML='<div class="err">Series not found.</div>'; return; }
  setCrumbs([{label:'Library',href:'#/'},{label:s.title}]);
  const tags = (s.genres||[]).map(g=>`<span class="tag">${esc(g)}</span>`).join('');
  const chs = s.chapters.map(c=>`
    <div class="ch" onclick="location.hash='#/read/${encodeURIComponent(s.slug)}/${encodeURIComponent(c.ns)}'">
      <span class="n">${esc(c.title)}</span><span class="p">${c.pages.length} pages &rsaquo;</span>
    </div>`).join('');
  app.innerHTML = `
    <div class="series-head">
      <span class="cov" style="background-image:url('${esc(s.cover)}')"></span>
      <div class="info">
        <h1>${esc(s.title)}</h1>
        <div class="sub">${esc(s.type)} &middot; ${esc(s.status)}${s.author?' &middot; '+esc(s.author):''}</div>
        <div class="tags">${tags}</div>
        <div class="desc">${esc(s.description)||'<em>No description.</em>'}</div>
      </div>
    </div>
    <h1 style="font-size:17px">Chapters</h1>
    <div class="chlist">${chs}</div>`;
}

function viewReader(slug, ns){
  const s = bySlug(slug);
  if(!s){ app.innerHTML='<div class="err">Series not found.</div>'; return; }
  const idx = s.chapters.findIndex(c=>c.ns===ns);
  const c = s.chapters[idx];
  if(!c){ app.innerHTML='<div class="err">Chapter not in snapshot.</div>'; return; }
  setCrumbs([{label:'Library',href:'#/'},{label:s.title,href:'#/series/'+encodeURIComponent(s.slug)},{label:c.title}]);
  const prev = s.chapters[idx-1], next = s.chapters[idx+1];
  const nav = p => `<div class="navbar">
    <button class="btn ghost" ${prev?'':'disabled'} onclick="location.hash='#/read/${encodeURIComponent(s.slug)}/${prev?encodeURIComponent(prev.ns):''}'">&lsaquo; Prev</button>
    <button class="btn ghost" onclick="location.hash='#/series/${encodeURIComponent(s.slug)}'">Chapters</button>
    <button class="btn" ${next?'':'disabled'} onclick="location.hash='#/read/${encodeURIComponent(s.slug)}/${next?encodeURIComponent(next.ns):''}'">Next &rsaquo;</button>
  </div>`;
  const imgs = c.pages.map(p=>`<img loading="lazy" src="${esc(p)}" alt="">`).join('');
  app.innerHTML = `<div class="reader"><h1 style="font-size:17px">${esc(s.title)} &middot; ${esc(c.title)}</h1>${nav()}${imgs}${nav()}</div>`;
}

boot();
