/**
 * ch-quick-view-api.js
 * Handles fetching and rendering of Quick View modals.
 * Extracted from ch-product-card.liquid to reduce code duplication.
 */

(function () {
    if (window.StandaloneShopifyQVPDP) return; // Deduplication check

    // --- Helper to execute scripts from fetched HTML ---
    function runScripts(container) {
        const scripts = container.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    }

    // --- Main Open Function ---
    function openQV(handle) {
        if (!handle) return;

        // Close any existing
        const existing = document.querySelector('.ch-qv');
        if (existing) existing.remove();

        return fetch('/products/' + encodeURIComponent(handle) + '?view=quick-view')
            .then(r => {
                if (!r.ok) throw new Error('Product not found');
                return r.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // 2. Extract critical parts
                const styles = doc.querySelectorAll('style');
                const scripts = doc.querySelectorAll('script');
                let templates = doc.querySelectorAll('script[type="text/template"][id^="qv-template-"]');

                if (!templates.length) {
                    // DEBUG LOGIC
                    console.error('QV Template not found. HTML Length:', html.length);
                    console.log('Preview:', html.substring(0, 500));

                    // Fallback: check for direct div
                    const directDiv = doc.querySelector('.stand-qv');
                    if (directDiv) {
                        const mock = document.createElement('script');
                        mock.id = directDiv.id ? directDiv.id.replace('qv-', 'qv-template-') : 'qv-template-fallback';
                        mock.type = 'text/template';
                        mock.innerHTML = directDiv.outerHTML;
                        templates = [mock];
                    } else {
                        alert('Could not load quick view (template missing).\nCheck console for details.');
                        return;
                    }
                }

                // Append styles
                styles.forEach(style => document.head.appendChild(style));

                // Execute scripts
                scripts.forEach(s => {
                    if (s.type === 'text/template') return;
                    const scriptEl = document.createElement('script');
                    scriptEl.textContent = s.textContent;
                    document.body.appendChild(scriptEl);
                });

                // 3. Render
                const tmpl = templates[0];
                const tmplId = tmpl.id; // "qv-template-12345"
                const qvId = tmplId.replace('qv-template-', 'qv-'); // "qv-12345"

                const div = document.createElement('div');
                div.innerHTML = tmpl.innerHTML;
                const root = div.firstElementChild;

                if (!root) return;
                document.body.appendChild(root);

                // Lock body scroll (both html and body for robustness)
                // Save current scroll position to prevent jump
                const scrollY = window.scrollY;
                document.body.style.setProperty('--scroll-y', `-${scrollY}px`);
                document.documentElement.classList.add('ch-qv-open');
                document.body.classList.add('ch-qv-open');

                // 4. Init
                if (window.CHQV_SNIPPETS && typeof window.CHQV_SNIPPETS[qvId] === 'function') {
                    window.CHQV_SNIPPETS[qvId](root);
                }

                // 5. Close bind
                const closeBtns = root.querySelectorAll('[data-ch-qv-close]');
                closeBtns.forEach(b => b.addEventListener('click', () => {
                    // Unlock body scroll and restore position
                    document.documentElement.classList.remove('ch-qv-open');
                    document.body.classList.remove('ch-qv-open');
                    document.body.style.removeProperty('--scroll-y');
                    window.scrollTo(0, scrollY);
                    root.remove();
                }));

                return root;
            })
            .catch(err => {
                console.error(err);
                alert('Sorry, could not load quick view.');
            });
    }

    // --- Global Click Listener ---
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-standalone-qv]');
        if (!btn) return;

        const isMobile = window.matchMedia('(hover:none)').matches || window.innerWidth < 768;
        const card = btn.closest('.ch-card');
        const handle = btn.getAttribute('data-product-handle');

        if (isMobile) {
            const url = card?.dataset.productUrl || (handle ? '/products/' + handle : '#');
            window.location.href = url;
            return;
        }

        e.preventDefault();

        // Loading State
        if (card) card.classList.add('is-loading');
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');

        openQV(handle)
            .finally(() => {
                if (card) card.classList.remove('is-loading');
                btn.classList.remove('is-loading');
                btn.removeAttribute('aria-busy');
            });
    }, false);

    window.StandaloneShopifyQVPDP = { open: openQV };
})();
