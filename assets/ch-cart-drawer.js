
(() => {
    const cartPanelSel = '.ch-panel[data-ch-panel="cart"]';
    // Use window.chRoutes or fallback
    const cartUrl = (window.chRoutes && window.chRoutes.cartUrl) ? window.chRoutes.cartUrl : '/cart';
    const IS_CART_PAGE = window.location.pathname.replace(/\/+$/, '') === cartUrl.replace(/\/+$/, '');

    const autoInventoryFixSeen = new Set();
    let inventoryCheckInFlight = null;

    let cartPanel = document.querySelector(cartPanelSel);
    if (!cartPanel) {
        const root = document.querySelector('[data-cart-root]');
        if (root) {
            const shell = document.createElement('div');
            shell.className = 'ch-panel';
            shell.setAttribute('data-ch-panel', 'cart');

            const ov = document.createElement('div');
            ov.className = 'ch-panel__ov';
            ov.setAttribute('aria-hidden', 'true');

            const pn = document.createElement('div');
            pn.className = 'ch-panel__pn';

            shell.appendChild(ov);
            shell.appendChild(pn);
            pn.appendChild(root);
            document.body.appendChild(shell);
            shell.dataset.teleported = 'true';
            cartPanel = shell;
        }
    }

    if (cartPanel && !cartPanel.dataset.teleported) {
        document.body.appendChild(cartPanel);
        cartPanel.dataset.teleported = 'true';
    }

    const panel = cartPanel || document.querySelector(cartPanelSel);
    if (!panel) return;

    const itemsEl = panel.querySelector('[data-cart-items]');
    const subEl = panel.querySelector('[data-cart-subtotal]');
    let agree = null;

    function getAgreeCheckbox() {
        if (agree && panel.contains(agree)) return agree;

        const boxes = panel.querySelectorAll(
            '.cart-ft input[type="checkbox"], .cart__footer input[type="checkbox"], .cart__policies input[type="checkbox"], .ajaxcart__agree input[type="checkbox"]'
        );
        for (const cb of boxes) {
            const label = cb.closest('label') || panel.querySelector(`label[for="${cb.id}"]`);
            const txt = (label?.innerText || label?.textContent || '').toLowerCase();
            // Broader check for terms/agree/accept
            if (
                txt.includes('terms of service') ||
                txt.includes('terms and conditions') ||
                txt.includes('terms of use') ||
                txt.includes('i agree') ||
                txt.includes('agree to') ||
                txt.includes('accept')
            ) {
                agree = cb;
                if (label) label.classList.add('terms');
                return agree;
            }
        }

        agree = panel.querySelector('#agree-terms');
        return agree;
    }

    const closeBtn = panel.querySelector('[data-cart-close]');
    const alertBar = panel.querySelector('[data-cart-alert]');
    const alertMsgEl = panel.querySelector('[data-cart-alert-msg]');
    const alertClose = panel.querySelector('[data-cart-alert-close]');
    const overlayEl = panel.querySelector('.ch-panel__ov');

    let warnUntilTs = 0;
    const inflightByKey = new Map();
    let keepOpenInterval = 0;

    function needTerms() {
        const cb = getAgreeCheckbox();
        return !!cb && !cb.checked;
    }

    const startKeepOpen = () => {
        clearInterval(keepOpenInterval);
        keepOpenInterval = setInterval(() => {
            if (Date.now() < warnUntilTs && needTerms()) {
                panel.setAttribute('data-open', '');
            } else {
                clearInterval(keepOpenInterval);
            }
        }, 150);
    };

    new MutationObserver(() => {
        if (Date.now() < warnUntilTs && needTerms() && !panel.hasAttribute('data-open')) {
            panel.setAttribute('data-open', '');
        }
    }).observe(panel, { attributes: true, attributeFilter: ['data-open', 'class', 'style'] });

    const locale = (window.chRoutes && window.chRoutes.locale) ? window.chRoutes.locale : 'en-PH';
    const currency = (window.chRoutes && window.chRoutes.currency) ? window.chRoutes.currency : 'PHP';

    const nf = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
    });
    const money = c => nf.format((Number(c) || 0) / 100);
    const esc = s => (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    function showAlert(msg, durMs = 3500, opts) {
        if (!alertBar) return;
        const ms = durMs || 3500;
        const sticky = !!(opts && opts.sticky);

        if (alertMsgEl && msg) alertMsgEl.textContent = msg;

        let timer = alertBar.querySelector('.cart-alert__timer');
        if (!timer) {
            timer = document.createElement('div');
            timer.className = 'cart-alert__timer';
            timer.innerHTML = '<span class="bar"></span>';
            alertBar.appendChild(timer);
        } else {
            const bar = timer.querySelector('.bar');
            if (bar) {
                bar.replaceWith(bar.cloneNode(true));
            } else {
                timer.innerHTML = '<span class="bar"></span>';
            }
        }

        alertBar.style.setProperty('--durMs', String(ms) + 'ms');
        alertBar.classList.add('is-shown');
        // STRICT: Never show drawer alerts or open drawer on /cart
        if (window.location.pathname === '/cart') return;

        alertBar.classList.add('is-shown');
        panel.setAttribute('data-open', '');
        alertBar.scrollIntoView({ block: 'start', behavior: 'smooth' });

        clearTimeout(showAlert._t);

        if (sticky) {
            warnUntilTs = Date.now() + ms;
            startKeepOpen();
            showAlert._t = setTimeout(() => {
                warnUntilTs = 0;
                clearInterval(keepOpenInterval);
                alertBar.classList.remove('is-shown');
            }, ms);
        } else {
            showAlert._t = setTimeout(() => {
                alertBar.classList.remove('is-shown');
            }, ms);
        }
    }

    alertClose && alertClose.addEventListener('click', () => {
        alertBar && alertBar.classList.remove('is-shown'); warnUntilTs = 0; clearInterval(keepOpenInterval);
    });

    document.addEventListener('cart:inventory-warning', (e) => {
        // Show in drawer regardless of page type if the drawer is present
        const detail = e && e.detail;
        if (!detail || !detail.message) return;
        showAlert(detail.message, 6000);
        panel.setAttribute('data-open', '');
    });

    function updateHeaderCount(n) {
        document.querySelectorAll('[data-cart-count]').forEach(b => { b.textContent = String(n || 0); });
    }

    function rowTpl(line, idx) {
        const cp = Number(line.compare_at_price || 0);
        const img = (line.image || (line.featured_image && (line.featured_image.url || line.featured_image))) || '';
        const img224 = img.replace(/(\.(?:jpe?g|png|webp|gif))(?:\?.*)?$/i, '_224x$1');
        const variant = (line.variant_title && line.variant_title !== 'Default Title')
            ? `<div class="it-variant">${esc(line.variant_title)}</div>` : '';
        return `
      <div class="it"
           data-line="${idx + 1}"
           data-key="${esc(line.key || '')}"
           data-unit="${Number(line.final_price) || 0}"
           data-qty="${Number(line.quantity) || 1}">
        <img class="it-img" src="${img224}" alt="${esc(line.product_title || '')}">
        <div>
          <h4 class="it-title">${esc(line.product_title || line.title || '')}</h4>
          ${variant}
          <div>${cp > line.final_price ? `<span class="it-compare">${money(cp)}</span>` : ''}<span class="it-price">${money(line.final_price)}</span></div>
          <div class="it-bar">
            <div class="stepper">
              <button type="button" data-dec aria-label="Decrease">−</button>
              <input type="text" value="${line.quantity}" inputmode="numeric" data-qty-input>
              <button type="button" data-inc aria-label="Increase">+</button>
            </div>
            <button class="icon-btn" type="button" title="Remove" data-remove>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6 7h12v2H6zm1 3h10l-1 10H8L7 10zm3-5h4l1 2H9l1-2z"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }

    function setRowLoading(row, on) {
        if (!row) return;
        row.classList.toggle('is-loading', !!on);
    }

    function showLoadingPlaceholder() {
        if (!itemsEl) return;
        if (itemsEl.children.length > 0) return;
        itemsEl.innerHTML = `
      <div class="cart-loading">
        <div class="cart-loading-row">
          <div class="cart-loading-thumb"></div>
          <div>
            <div class="cart-loading-line" style="width:70%;"></div>
            <div class="cart-loading-line" style="width:45%;"></div>
          </div>
        </div>
        <div class="cart-loading-row">
          <div class="cart-loading-thumb"></div>
          <div>
            <div class="cart-loading-line" style="width:80%;"></div>
            <div class="cart-loading-line" style="width:50%;"></div>
          </div>
        </div>
      </div>
    `;
    }

    function paint(cart) {
        itemsEl.innerHTML = '';

        if (!cart || !cart.items || !cart.items.length) {
            itemsEl.innerHTML = `
        <div class="cart-empty">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
            <line x1="9" x2="9.01" y1="9" y2="9"/>
            <line x1="15" x2="15.01" y1="9" y2="9"/>
          </svg>
          <p>Your cart is empty.</p>
          <a class="empty-btn" href="/">Continue shopping</a>
        </div>
      `;
            subEl.textContent = nf.format(0);
            updateHeaderCount(0);
            panel.classList.add('is-empty');

            document.dispatchEvent(new CustomEvent('cart:refreshed', { detail: cart }));
            return;
        }

        cart.items.forEach((l, i) => itemsEl.insertAdjacentHTML('beforeend', rowTpl(l, i)));
        itemsEl.querySelectorAll('.it').forEach(bindRow);

        subEl.textContent = nf.format((cart.items_subtotal_price || 0) / 100);
        updateHeaderCount(cart.item_count || cart.items.length || 0);
        panel.classList.remove('is-empty');
        document.dispatchEvent(new CustomEvent('cart:refreshed', { detail: cart }));

        // Immediately enforce inventory after any cart refresh
        checkCartInventory(cart);
    }

    // VALIDATE LINES VIA /cart/change.js (no more relying on /variants)
    function checkCartInventory(cart) {
        if (!cart || !Array.isArray(cart.items) || !cart.items.length) return;
        if (inventoryCheckInFlight) return;

        const fixes = [];

        inventoryCheckInFlight = Promise.all(
            cart.items.map((item, idx) => {
                const line = idx + 1;
                const currentQty = Number(item.quantity) || 0;
                const key = String(item.key || item.id || line);
                const cacheKey = `${key}:${currentQty}`;

                if (autoInventoryFixSeen.has(cacheKey)) {
                    return Promise.resolve();
                }

                return fetch('/cart/change.js', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ line, quantity: currentQty })
                })
                    .then((r) => {
                        const status = r.status;
                        return r.json().catch(() => null).then((data) => ({ status, data }));
                    })
                    .then(({ status, data }) => {
                        if (status === 422 && data && data.status === 422) {
                            const rawMsg = String(data.description || data.message || '');
                            const m = rawMsg.match(/only\s+(\d+)\s+items?/i);
                            const left = m && m[1] ? Number(m[1]) : null;

                            let allowed = left;
                            if (allowed == null && typeof data.available === 'number') allowed = data.available;
                            if (allowed == null && typeof data.quantity === 'number') allowed = data.quantity;

                            if (allowed != null && allowed !== currentQty) {
                                autoInventoryFixSeen.add(cacheKey);
                                fixes.push({
                                    line,
                                    quantity: Math.max(0, allowed),
                                    available: allowed,
                                    title: item.product_title || item.title || ''
                                });
                            }
                        }
                    })
                    .catch(() => { });
            })
        ).then(() => {
            if (!fixes.length) return;

            const first = fixes[0];
            if (typeof showAlert === 'function') {
                const msg =
                    first.available > 0
                        ? `Unfortunately we only have ${first.available} of "${first.title}" available right now. We've updated your cart.`
                        : `Unfortunately "${first.title}" is now out of stock and has been removed from your cart.`;
                showAlert(msg, 6000);
            }

            return Promise.allSettled(
                fixes.map(fix =>
                    fetch('/cart/change.js', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ line: fix.line, quantity: fix.quantity })
                    }).catch(() => { })
                )
            ).then(() => {
                refresh();
            });
        }).finally(() => {
            inventoryCheckInFlight = null;
        });
    }

    function refresh() {
        showLoadingPlaceholder();
        fetch('/cart.js', { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
            .then(r => r.json()).then(paint).catch(() => { });
    }

    function setQtyForRow(row, nextQ, showLoader) {
        const key = row.getAttribute('data-key');
        const line = Number(row.getAttribute('data-line')) || 1;
        const input = row.querySelector('[data-qty-input]');
        const prevQ = Number(row.getAttribute('data-qty')) || 0;

        nextQ = Math.max(0, Number(nextQ) || 0);
        if (nextQ === prevQ) return;

        row.setAttribute('data-qty', nextQ);
        if (input) input.value = nextQ;

        const id = key || `line:${line}`;
        if (inflightByKey.get(id)) return;

        const isDelete = nextQ === 0 && !!showLoader;

        inflightByKey.set(id, true);
        if (showLoader) setRowLoading(row, true);

        const payload = key
            ? { id: key, quantity: nextQ }
            : { line, quantity: nextQ };

        fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then((r) => {
                const status = r.status;
                return r.json().catch(() => null).then((data) => ({ status, data }));
            })
            .then(({ status, data }) => {
                inflightByKey.delete(id);
                if (showLoader) setRowLoading(row, false);

                if (status === 422 && data && data.status === 422) {
                    const rawMsg = String(data.description || data.message || '');
                    const titleEl = row.querySelector('.it-title');
                    const title = titleEl ? titleEl.textContent.trim() : '';
                    const m = rawMsg.match(/only\s+(\d+)\s+items?/i);
                    const left = m && m[1] ? m[1] : null;

                    let msg;
                    if (left && title) {
                        msg = `Unfortunately we only have ${left} of "${title}" available right now.`;
                    } else if (title) {
                        msg = `Unfortunately we don't have enough "${title}" in stock for that quantity.`;
                    } else {
                        msg = rawMsg || 'Unfortunately we don\u2019t have enough stock for that quantity.';
                    }

                    showAlert(msg, 6000);
                    refresh();
                    return;
                }

                if (isDelete && status >= 200 && status < 300) {
                    row.classList.add('is-removing');
                    row.addEventListener('animationend', () => {
                        refresh();
                    }, { once: true });
                } else {
                    refresh();
                }
            })
            .catch(() => {
                inflightByKey.delete(id);
                if (showLoader) setRowLoading(row, false);
                refresh();
            });
    }

    function bindRow(row) {
        const input = row.querySelector('[data-qty-input]');
        const dec = row.querySelector('[data-dec]');
        const inc = row.querySelector('[data-inc]');
        const rmv = row.querySelector('[data-remove]');

        dec && dec.addEventListener('click', () => {
            const curr = Number(row.getAttribute('data-qty')) || 0;
            setQtyForRow(row, curr - 1);
        });

        inc && inc.addEventListener('click', () => {
            const curr = Number(row.getAttribute('data-qty')) || 0;
            setQtyForRow(row, curr + 1);
        });

        rmv && rmv.addEventListener('click', () => {
            setQtyForRow(row, 0, true);
        });

        input && input.addEventListener('change', () => {
            const val = parseInt(input.value, 10);
            if (isNaN(val)) return;
            setQtyForRow(row, val, true);
        });

        input && input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') input.blur();
        });
    }

    closeBtn && closeBtn.addEventListener('click', () => {
        panel.classList.add('is-closing');
        panel.removeAttribute('data-open');
        panel.classList.remove('is-open'); // Force removal of conflicting class
        panel.setAttribute('aria-hidden', 'true');
        setTimeout(() => panel.classList.remove('is-closing'), 300);
    });

    overlayEl && overlayEl.addEventListener('click', () => {
        closeBtn.click();
    });

    // Checkout validation
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-checkout], [name="checkout"], .cart__checkout-button');
        if (!btn || !panel.contains(btn)) return;

        const cb = getAgreeCheckbox();
        if (cb && !cb.checked) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Pulse the checkbox
            cb.style.outline = '2px solid #e03a2f';
            setTimeout(() => cb.style.outline = '', 400);

            // Show yellow warning
            showAlert('You must agree to the Terms of Service to check out.', 4000, { sticky: true });
            return;
        }
    }, true); // USE CAPTURE PHASE

    // SCROLL LOCK MANAGER
    // Restored to ensure body scroll is unlocked when drawer closes
    function syncScrollLock() {
        if (panel.hasAttribute('data-open')) {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        } else {
            // ONLY unlock if we are the ones who locked it (or if we want to be aggressive about unlocking)
            // Ideally, we check if other panels are open, but for now we prioritize clearing our own mess.
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.body.classList.remove('no-scroll', 'overflow-hidden', 'ch-panel-open');
        }
    }

    new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.attributeName === 'data-open') {
                syncScrollLock();
            }
        }
    }).observe(panel, { attributes: true });

    // Global open
    document.addEventListener('cart:open', () => {
        if (window.location.pathname === '/cart') return;
        panel.setAttribute('data-open', '');
        refresh();
    });

    // Global refresh
    document.addEventListener('cart:refresh', refresh);

    // CRITICAL FIX: Sync data-open with the generic ch:panel controller
    document.addEventListener('ch:panel', (e) => {
        const d = e.detail || {};
        if (d.name === 'cart') {
            if (d.open) {
                panel.setAttribute('data-open', '');
                refresh();
            } else {
                panel.removeAttribute('data-open');
                // Force immediate unlock in case mutation observer is too slow or misses
                syncScrollLock();
            }
        }
    });

    // Initial load
    refresh();
    syncScrollLock();

})();
