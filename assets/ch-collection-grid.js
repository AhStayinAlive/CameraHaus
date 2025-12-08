/**
 * ch-collection-grid.js
 * Shared logic for Collection and Search grids.
 * Handles pagination, sorting, filtering, and history state.
 */

window.ChCollectionGrid = (function () {
    const MEMORY_CACHE = new Map();
    const SS_KEY = 'chCollectionGridCache_v1';

    function ssRead(key) {
        try {
            const obj = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
            return obj[key] || null;
        } catch (e) {
            return null;
        }
    }

    function ssWrite(key, payload) {
        try {
            const obj = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
            obj[key] = payload;
            const entries = Object.entries(obj);
            if (entries.length > 8) {
                const [firstKey] = entries[0];
                delete obj[firstKey];
            }
            sessionStorage.setItem(SS_KEY, JSON.stringify(obj));
        } catch (e) { }
    }

    function normalizeUrl(url) {
        return new URL(url, window.location.origin).toString();
    }

    return {
        init: function (rootEl, config) {
            console.log('[ChCollectionGrid] init called', { rootEl, config });
            if (!rootEl) return;

            const {
                sid,
                gridSelector = '#CollectionProductGrid',
                paginationSelector = 'nav.pagination',
                chipsBarSelector,
                sorter = {},
                fetch: fetchConfig = {}
            } = config;

            const gridEl = () => rootEl.querySelector(gridSelector);
            let controller = null;
            let isLoading = false;

            // --- Helpers ---

            function setLoading(state) {
                isLoading = state;
                const pag = rootEl.querySelector(paginationSelector);
                if (!pag) return;
                pag.setAttribute('aria-busy', state ? 'true' : 'false');
                pag.classList.toggle('is-loading', !!state);
            }

            function getHeaderOffset() {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue('--ch-header-h').trim().replace('px', '');
                const n = parseInt(raw || '0', 10);
                return isNaN(n) ? 0 : n;
            }

            function scrollToControls() {
                const headerH = getHeaderOffset() || 0;
                const extraOffset = 12;
                const rect = rootEl.getBoundingClientRect();
                let y = rect.top + window.scrollY - headerH - extraOffset;
                if (y < 0) y = 0;
                const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                try {
                    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
                } catch (e) {
                    window.scrollTo(0, y);
                }
            }

            function floatIn(container) {
                if (!container) return;
                const kids = Array.from(container.children);
                kids.forEach((el, i) => {
                    el.classList.add('ch-float-in');
                    el.style.animationDelay = (i * 30) + 'ms';
                    setTimeout(() => {
                        el.classList.remove('ch-float-in');
                        el.style.animationDelay = '';
                    }, 650);
                });
            }

            // --- Fetching ---

            async function fetchPage(url) {
                const key = normalizeUrl(url);
                if (MEMORY_CACHE.has(key)) return MEMORY_CACHE.get(key);

                const ssHit = ssRead(key);
                if (ssHit) {
                    MEMORY_CACHE.set(key, ssHit);
                    return ssHit;
                }

                if (controller) controller.abort();
                controller = new AbortController();

                const res = await fetch(key, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/html' },
                    signal: controller.signal,
                    credentials: 'same-origin',
                    cache: 'no-store'
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);

                const html = await res.text();
                const tpl = document.createElement('template');
                tpl.innerHTML = html.trim();
                const frag = tpl.content;

                const sectionRoot = fetchConfig.resolveSectionRoot ? fetchConfig.resolveSectionRoot(frag) : frag;
                const freshGrid = sectionRoot.querySelector(gridSelector);
                if (!freshGrid) throw new Error('Grid not found in response');

                const freshPag = sectionRoot.querySelector(paginationSelector);
                const payload = {
                    gridHTML: freshGrid.innerHTML,
                    pagHTML: freshPag ? freshPag.outerHTML : ''
                };
                MEMORY_CACHE.set(key, payload);
                ssWrite(key, payload);
                return payload;
            }

            function updateGridAndPagination(payload, animate = true) {
                const grid = gridEl();
                if (grid && payload.gridHTML != null) {
                    grid.innerHTML = payload.gridHTML;

                    const imgs = grid.querySelectorAll('img');
                    imgs.forEach((img, i) => {
                        if (!img.hasAttribute('loading')) img.loading = 'lazy';
                        img.decoding = 'async';
                        if (i < 6) img.fetchPriority = 'high';
                    });

                    if (animate) floatIn(grid);
                }

                const oldPag = rootEl.querySelector(paginationSelector);
                if (oldPag && payload.pagHTML) {
                    oldPag.outerHTML = payload.pagHTML;
                } else if (!oldPag && payload.pagHTML) {
                    const wrap = rootEl.querySelector('.ch-grid-wrap');
                    if (wrap) wrap.insertAdjacentHTML('beforeend', payload.pagHTML);
                }
            }

            async function swapFrom(url, opts = {}) {
                const { animate = true, scroll = true } = opts;
                setLoading(true);
                try {
                    const payload = await fetchPage(url);
                    if (!payload) throw new Error('No payload');
                    updateGridAndPagination(payload, animate);
                    if (scroll) scrollToControls();

                    // Re-sync sorter label from URL
                    if (typeof window.chSyncSorterFromURL === 'function') {
                        window.chSyncSorterFromURL();
                    }
                } catch (err) {
                    console.error('Grid swap failed', err);
                    window.location.href = url;
                } finally {
                    setLoading(false);
                }
            }

            // --- Pagination ---

            function onPaginationClick(e) {
                const a = e.target.closest(paginationSelector + ' a[href]');
                if (!a) return;
                if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();

                if (isLoading && controller) controller.abort();

                const href = a.href;
                history.pushState({ ch: true }, '', href);
                swapFrom(href, { animate: true, scroll: true });
            }

            function bindPagination() {
                rootEl.removeEventListener('click', onPaginationClick, true);
                rootEl.addEventListener('click', onPaginationClick, true);
            }

            function prefetchNext() {
                const list = rootEl.querySelector(paginationSelector + ' .pag-list');
                if (!list) return;
                const current = list.querySelector('.is-current span');
                const nextLi = current && current.parentElement.nextElementSibling;
                const nextA = nextLi && nextLi.querySelector('a[href]');
                const nextUrl = nextA && nextA.href;
                if (!nextUrl) return;

                const key = normalizeUrl(nextUrl);
                if (MEMORY_CACHE.has(key) || ssRead(key)) return;

                const doPrefetch = () => { fetchPage(nextUrl).catch(() => { }); };
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(doPrefetch, { timeout: 1000 });
                } else {
                    setTimeout(doPrefetch, 250);
                }

                try {
                    const hint = document.createElement('link');
                    hint.rel = 'prefetch';
                    hint.href = nextUrl;
                    hint.as = 'fetch';
                    hint.crossOrigin = 'anonymous';
                    document.head.appendChild(hint);
                } catch (e) { }
            }

            // --- Sorter ---

            function initSorter() {
                const sorterEl = rootEl.querySelector(sorter.containerSelector || '[data-ch-sorter]');
                if (!sorterEl) return;

                const btn = sorterEl.querySelector('.ch-sorter-btn');
                const list = sorterEl.querySelector('.ch-sorter-list');
                const labelEl = sorterEl.querySelector(sorter.labelSelector || '.ch-sorter-label');
                const items = sorterEl.querySelectorAll(sorter.itemSelector || '.ch-sorter-item');

                const sortSelect = rootEl.querySelector(sorter.selectSelector);

                const open = () => { sorterEl.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); };
                const close = () => { sorterEl.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); };

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sorterEl.classList.contains('is-open') ? close() : open();
                });

                if (list) {
                    list.addEventListener('click', (e) => {
                        const item = e.target.closest(sorter.itemSelector || '.ch-sorter-item');
                        if (!item) return;
                        e.preventDefault();
                        e.stopPropagation();

                        const val = item.dataset.value;
                        if (!val || !sortSelect) return;

                        if (labelEl) labelEl.textContent = item.textContent.trim();
                        items.forEach((li) => {
                            const on = li === item;
                            li.classList.toggle('is-active', on);
                            li.setAttribute('aria-selected', on ? 'true' : 'false');
                        });

                        sortSelect.value = val;
                        const evt = new Event('change', { bubbles: true });
                        sortSelect.dispatchEvent(evt);
                        close();
                    });
                }

                document.addEventListener('click', (e) => {
                    if (!sorterEl.contains(e.target)) close();
                });

                function syncSorterFromURL() {
                    if (!sorterEl) return;
                    const sv = sorter.getSortFromUrl ? sorter.getSortFromUrl() : new URL(window.location.href).searchParams.get('sort_by');

                    let activeLabel = '';
                    items.forEach((li) => {
                        const on = li.dataset.value === sv;
                        li.classList.toggle('is-active', on);
                        li.setAttribute('aria-selected', on ? 'true' : 'false');
                        if (on) activeLabel = li.textContent.trim();
                    });

                    if (labelEl && activeLabel) labelEl.textContent = activeLabel;
                    if (sortSelect) sortSelect.value = sv;
                }

                syncSorterFromURL();
                window.chSyncSorterFromURL = syncSorterFromURL;
                window.addEventListener('popstate', syncSorterFromURL);
            }

            // --- Filter Toggle ---

            function initFilterToggle() {
                const btn = rootEl.querySelector('[data-ch-toolbar-filter]');
                if (btn) {
                    btn.addEventListener('click', () => {
                        rootEl.classList.toggle('is-filter-collapsed');
                        window.dispatchEvent(new CustomEvent('ch:toggle-filters', { detail: { id: sid } }));
                    });
                }
            }

            // --- Header Chips ---

            function initHeaderChips() {
                const bar = document.querySelector(chipsBarSelector);
                if (!bar) return;

                function renderHeaderChips(chips) {
                    bar.innerHTML = '';
                    if (!chips || !chips.length) return;

                    chips.forEach((ch) => {
                        const el = document.createElement('span');
                        el.className = 'chip';
                        el.textContent = ch.label;

                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.setAttribute('aria-label', 'Remove ' + ch.label);
                        btn.textContent = '×';

                        btn.addEventListener('click', () => {
                            if (ch.name && ch.value) {
                                document.querySelectorAll('.ch-form input[name="' + CSS.escape(ch.name) + '"][value="' + CSS.escape(ch.value) + '"]')
                                    .forEach((cb) => (cb.checked = false));
                                if (window.applyFilters) window.applyFilters();
                            } else {
                                document.dispatchEvent(new CustomEvent('ch:reset-price'));
                            }
                        });

                        el.appendChild(btn);
                        bar.appendChild(el);
                    });

                    const clear = document.createElement('button');
                    clear.type = 'button';
                    clear.className = 'chip chip--clear';
                    clear.innerHTML = '<span style="font-size:14px;line-height:1">×</span> Clear all';
                    clear.addEventListener('click', () => {
                        document.dispatchEvent(new CustomEvent('ch:clear-all'));
                    });
                    bar.appendChild(clear);
                }

                window.renderHeaderChips = renderHeaderChips;
                document.addEventListener('ch:filters-change', (ev) => {
                    renderHeaderChips((ev.detail && ev.detail.chips) || []);
                });
            }

            // --- Initialization ---

            bindPagination();
            prefetchNext();
            initSorter();
            initFilterToggle();
            initHeaderChips();

            // Seed cache
            (function seedCache() {
                try {
                    const key = normalizeUrl(window.location.href);
                    const payload = {
                        gridHTML: gridEl() ? gridEl().innerHTML : '',
                        pagHTML: rootEl.querySelector(paginationSelector) ? rootEl.querySelector(paginationSelector).outerHTML : ''
                    };
                    MEMORY_CACHE.set(key, payload);
                    ssWrite(key, payload);
                } catch (e) { }
            })();

            // History popstate
            window.addEventListener('popstate', (ev) => {
                if (!ev.state || !ev.state.ch) return;
                swapFrom(window.location.href, { animate: false, scroll: true });
            });
        }
    };
})();
