// Debounce helper
const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

const money = (cents) => {
  try { return (cents/100).toLocaleString(undefined,{style:'currency',currency:Shopify?.currency?.active||'PHP'}); }
  catch(e){ return '₱' + (cents/100).toFixed(2); }
};

function attachPredictive(inputId){
  const input = document.getElementById(inputId);
  if(!input) return;
  const panel = input.parentElement.querySelector(`.predictive-wrapper[data-for="${inputId}"]`);
  if(!panel) return;

  const ulProducts = panel.querySelector('[data-kind="products"] ul');
  const ulQueries  = panel.querySelector('[data-kind="queries"] ul');
  const viewAll    = panel.querySelector('.view-all');

  const open = ()=>{ panel.hidden=false; input.setAttribute('aria-expanded','true'); };
  const close= ()=>{ panel.hidden=true; input.setAttribute('aria-expanded','false'); };

  const render = ({products=[], queries=[]})=>{
    // Queries
    ulQueries.innerHTML = '';
    queries.forEach(q=>{
      const li = document.createElement('li');
      li.role='option';
      li.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-4.2-4.2" stroke="#6b7280" stroke-width="2" stroke-linecap="round"/><circle cx="11" cy="11" r="7" stroke="#6b7280" stroke-width="2"/></svg><span>${q}</span>`;
      li.addEventListener('mousedown',()=>{ window.location = `/search?q=${encodeURIComponent(q)}`; });
      ulQueries.appendChild(li);
    });

    // Products
    ulProducts.innerHTML = '';
    products.forEach(p=>{
      const li = document.createElement('li');
      li.role='option';
      const img = p.image ? `<img src="${p.image}" alt="${p.title}">` : '';
      const price = (p.price_min || p.price) ? `<span class="price">${money(p.price_min || p.price)}</span>` : '';
      li.innerHTML = `${img}<a href="${p.url}" style="flex:1;display:flex;gap:.5rem;align-items:center"><div><div>${p.title}</div><div style="font-size:.8rem;color:#6b7280">${p.vendor||''}</div></div></a>${price}`;
      li.addEventListener('mousedown',()=>{ window.location = p.url; });
      ulProducts.appendChild(li);
    });

    const hasAny = (products.length + queries.length) > 0;
    viewAll.href = `/search?q=${encodeURIComponent((input.value||'').trim())}`;
    hasAny ? open() : close();
  };

  const fetchPredictive = async (q)=>{
    const url = `/search/suggest.json?q=${encodeURIComponent(q)}`
      + `&resources[type]=product,collection,article,page`
      + `&resources[limit]=4`
      + `&resources[options][unavailable_products]=last`
      + `&resources[options][fields]=title,product_type,variants.title,vendor`;
    const res = await fetch(url,{headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('Network');
    const data = await res.json();
    const queries = (data?.suggestions || []).map(s=>s.text);
    const products = (data?.resources?.results?.products || []);
    render({products,queries});
  };

  const onInput = debounce(async (e)=>{
    const q = (e.target.value||'').trim();
    if(q.length < 2){ close(); return; }
    try { await fetchPredictive(q); } catch(e){ close(); }
  });

  input.addEventListener('input', onInput);
  input.addEventListener('focus', ()=>{ const q=(input.value||'').trim(); if(q.length>=2) fetchPredictive(q); });
  document.addEventListener('click',(ev)=>{ if(!panel.contains(ev.target) && ev.target!==input) close(); });
  input.addEventListener('keydown',(e)=>{ if(e.key==='Escape') close(); });
}

document.addEventListener('DOMContentLoaded', ()=>{
  attachPredictive('SiteNavSearch');
  attachPredictive('DrawerSearchInput');
});
