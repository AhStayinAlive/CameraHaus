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

const fetchPredictive = async (rawQ) => {
  // optional little normalizer: treat "f1.8" / "f 1.8" as "f/1.8"
  const q = rawQ.replace(/\bf\s*1\.8\b/gi, 'f/1.8');

  const qs = encodeURIComponent(q);

  const urlSuggest =
    `/search/suggest.json?q=${qs}` +
    `&resources[type]=product,collection,article,page` +
    `&resources[limit]=4` +
    `&resources[options][unavailable_products]=last` +
    `&resources[options][fields]=title,product_type,variants.title,vendor`;

  const urlSearch = `/search.json?q=${qs}&type=product`;

  const [resSuggest, resSearch] = await Promise.all([
    fetch(urlSuggest, { headers: { 'Accept':'application/json' } }),
    fetch(urlSearch,  { headers: { 'Accept':'application/json' } })
  ]);

  const dataSuggest = resSuggest.ok ? await resSuggest.json() : null;
  const dataSearch  = resSearch.ok  ? await resSearch.json()  : null;

  const queries = (dataSuggest?.suggestions || []).map(s => s.text);
  const productsSuggest = (dataSuggest?.resources?.results?.products || []);

  // search.json shape: { products: [...] } on modern themes
  const rawSearchProducts = Array.isArray(dataSearch?.products)
    ? dataSearch.products
    : Array.isArray(dataSearch?.results)
      ? dataSearch.results
      : [];

  const seen = new Set();
  const merged = [];

  const add = (p) => {
    if (!p) return;
    const key = p.id || p.handle || p.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(p);
  };

  // 1) predictive products
  productsSuggest.forEach(add);

  // 2) full search products (normalize shape)
  rawSearchProducts.forEach(p => {
    const normalized = {
      id: p.id,
      handle: p.handle,
      title: p.title,
      url: p.url || (p.handle ? `/products/${p.handle}` : '#'),
      price: p.price || p.price_min || 0,
      price_min: p.price_min || p.price || 0,
      image:
        (p.featured_image && (p.featured_image.url || p.featured_image.src)) ||
        (p.image && (p.image.url || p.image.src || p.image)) ||
        '',
      vendor: p.vendor || '',
    };
    add(normalized);
  });

  // keep your existing render API; just cap to 4 results
  render({
    products: merged.slice(0, 4),
    queries
  });
};


const onInput = debounce(async (e) => {
  const q = (e.target.value || '').trim();
  if (q.length < 2) { close(); return; }
  try { await fetchPredictive(q); } catch (e) { close(); }
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
