/* Unified controller for Search, Cart, Wishlist panels */
(function(){
const root = document.getElementById('ch-header-{{ section.id }}');
if(!root) return;


const $$ = (sel,sc=document) => Array.from(sc.querySelectorAll(sel));
const $ = (sel,sc=document) => sc.querySelector(sel);


const PANELS = new Map();
$$('.ch-panel', root).forEach(p => PANELS.set(p.getAttribute('data-ch-panel'), p));


let lastFocus = null;


function focusTrap(panel, enable){
if(!panel) return;
const pn = $('.ch-panel__pn', panel);
const FOCUSABLE = 'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
function trap(e){
if(e.key !== 'Tab') return;
const nodes = $$(FOCUSABLE, pn).filter(x => x.offsetParent !== null);
if(nodes.length === 0) return;
const first = nodes[0], last = nodes[nodes.length-1];
if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
panel.__trap = trap;
(enable?document.addEventListener:document.removeEventListener)('keydown', trap, true);
}


function setOpen(id, open){
const panel = PANELS.get(id);
if(!panel) return;


// exclusivity: close others
PANELS.forEach((p, key)=>{ if(key!==id) close(key); });


panel.classList.toggle('is-open', !!open);
panel.setAttribute('aria-hidden', open ? 'false' : 'true');
document.documentElement.style.overflow = open ? 'hidden' : '';


if(open){
lastFocus = document.activeElement;
const first = $('.ch-panel__pn', panel).querySelector('button, a, input, [tabindex]:not([tabindex="-1"])');
setTimeout(()=>{ try{ (first||$('.ch-panel__pn', panel)).focus(); }catch(_){} }, 10);
focusTrap(panel, true);
}else{
focusTrap(panel, false);
if(lastFocus){ try{ lastFocus.focus(); }catch(_){} }
}


// broadcast to existing listeners
document.dispatchEvent(new CustomEvent('ch:panel', { detail:{ name:id, open:!!open } }));
}


function open(id){ setOpen(id, true); }
function close(id){ setOpen(id, false); }


// Delegated triggers
document.addEventListener('click', (e)=>{
const t = e.target.closest('[data-panel-open]');
if(t){ e.preventDefault(); open(t.getAttribute('data-panel-open')); }
if(e.target.closest('[data-ch-panel-close]')){
const shell = e.target.closest('.ch-panel');
if(shell) close(shell.getAttribute('data-ch-panel'));
}
// close when clicking overlay
if(e.target.classList.contains('ch-panel__ov')){
const shell = e.target.closest('.ch-panel');
if(shell) close(shell.getAttribute('data-ch-panel'));
}
// close if an internal link navigates away
const link = e.target.closest('.ch-panel a[href]');
if(link && !link.getAttribute('href').startsWith('#')){
const shell = link.closest('.ch-panel');
if(shell) close(shell.getAttribute('data-ch-panel'));
}
}, true);


document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ PANELS.forEach((_, id)=>close(id)); } }, true);


// Open cart on common theme events
['cart:open','cart-drawer:open','ajaxcart:open','cart:drawer:open','open-mini-cart'].forEach(ev=>{
document.addEventListener(ev, ()=> open('cart'), { passive:true });
});


// Export minimal API
})();