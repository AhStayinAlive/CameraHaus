/**
 * ChHorizontalSlider
 * Reusable class for horizontal scrolling sections (Brands, Product Carousel, etc.)
 * Handles:
 * - Next/Prev arrows (with state)
 * - Dot pagination
 * - Smooth scrolling
 * - IntersectionObserver for "intro" animations (optional)
 * - Refresh on resize/filter changes
 */

class ChHorizontalSlider {
    constructor(root, options = {}) {
        this.root = root;
        this.track = root.querySelector(options.trackSel || '[data-track]');
        this.btnPrev = root.querySelector(options.prevSel || '[data-ch-media-prev], .chpc__arrow--prev');
        this.btnNext = root.querySelector(options.nextSel || '[data-ch-media-next], .chpc__arrow--next');
        this.dotsWrap = root.querySelector(options.dotsSel || '[data-dots]');

        // Config
        this.maxDots = options.maxDots || 5;
        this.onIntro = options.onIntro || null; // callback for intro animation logic

        // State
        this.currentPage = 0;
        this.hasIntro = false;
        this.mqDesktop = window.matchMedia('(min-width:1100px)');

        // Caches for metrics to avoid reflows
        this.cachedPageWidth = 1;
        this.cachedTotalPages = 1;
        this.isScrolling = false;

        this.mqMobile = window.matchMedia('(max-width:739.98px)');

        if (!this.track) return;

        this.init();
    }

    init() {
        // Debounce/Throttle scroll
        this.track.addEventListener('scroll', () => {
            if (!this.isScrolling) {
                window.requestAnimationFrame(() => {
                    this.onScroll();
                    this.isScrolling = false;
                });
                this.isScrolling = true;
            }
        }, { passive: true });

        if (this.btnPrev) this.btnPrev.addEventListener('click', () => this.scrollToPage(this.currentPage - 1));
        if (this.btnNext) this.btnNext.addEventListener('click', () => this.scrollToPage(this.currentPage + 1));

        window.addEventListener('resize', () => {
            // Debounce resize
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.refresh(), 150);
        });

        if (this.mqDesktop.addEventListener) {
            this.mqDesktop.addEventListener('change', () => this.updateArrows());
        } else {
            this.mqDesktop.addListener(() => this.updateArrows());
        }

        // Intro Observer
        if ('IntersectionObserver' in window && (this.root.classList.contains('chb--pre') || this.root.classList.contains('chpc--pre'))) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.runIntro();
                        io.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
            io.observe(this.root);
        } else {
            // Fallback if no IO or not needed
            this.root.classList.remove('chb--pre');
            this.root.classList.add('chb--done');
        }

        this.refresh();
    }

    // Read DOM once
    measure() {
        if (!this.track) return;
        const cw = this.track.clientWidth || 1;
        const sw = this.track.scrollWidth || 1;

        this.cachedPageWidth = cw;
        this.cachedTotalPages = Math.max(1, Math.ceil(sw / cw));
    }

    refresh() {
        this.measure();

        const needPages = this.cachedTotalPages > 1;
        if (!needPages) {
            // Only write if changed (though simple assignment is cheap)
            if (this.track.scrollLeft !== 0) this.track.scrollLeft = 0;
            this.currentPage = 0;
        }

        this.buildDots();
        this.updateDots();
        this.updateArrows();
    }

    updateArrows() {
        if (!this.btnPrev || !this.btnNext) return;

        // Desktop check
        // if (!this.mqDesktop.matches) { ... }

        const n = this.cachedTotalPages;

        // Read scrollLeft is a reflow if dirty, but often necessary for arrows.
        // We can use currentPage as a proxy if we trust it, but scrollLeft is truth.
        // To minimize, we only check this inside the throttled/RAF loop.
        const sl = this.track.scrollLeft;

        const isAtStart = sl <= 10;
        const isAtEnd = this.currentPage >= n - 1; // logical check

        if (this.btnPrev.disabled !== isAtStart) this.btnPrev.disabled = isAtStart;
        if (this.btnNext.disabled !== isAtEnd) this.btnNext.disabled = isAtEnd;

        // Visibility
        // Logic: hide if only 1 page
        const need = n > 1;
        const display = need ? 'grid' : 'none';

        // Optimization: checking style before setting
        if (this.btnPrev.style.display !== display) this.btnPrev.style.display = display;
        if (this.btnNext.style.display !== display) this.btnNext.style.display = display;
    }

    scrollToPage(idx) {
        const total = this.cachedTotalPages;
        if (idx < 0) idx = 0;
        if (idx > total - 1) idx = total - 1;

        const left = idx * this.cachedPageWidth;
        this.track.scrollTo({ left: left, behavior: 'smooth' });
        this.currentPage = idx;

        this.updateDots();

        // Arrow update handled by scroll listener
    }

    onScroll() {
        // Recalculate current page based on scroll position
        if (this.cachedPageWidth > 0) {
            const page = Math.round(this.track.scrollLeft / this.cachedPageWidth);
            if (page !== this.currentPage) {
                this.currentPage = page;
                this.updateDots();
            }
        }
        this.updateArrows();
    }

    // Dots
    windowStartFor(page, total) {
        if (total <= this.maxDots) return 0;
        let half = Math.floor(this.maxDots / 2);
        let start = page - half;
        if (start < 0) start = 0;
        if (start > total - this.maxDots) start = total - this.maxDots;
        return start;
    }

    buildDots() {
        if (!this.dotsWrap) return;
        const total = this.cachedTotalPages;

        if (total <= 1) {
            this.dotsWrap.style.display = 'none';
            this.dotsWrap.innerHTML = ''; // Clear
            return;
        }
        this.dotsWrap.style.display = 'flex';

        // Windowed dots logic...
        // For performance, doing a full rebuild only if number of dots changes 
        // or window shifts massively is safer.
        // But the original logic was simple. Let's stick to simple but use cached total.

        this.renderDots(total);
    }

    renderDots(total) {
        // We need to implement the windowing logic here during build? 
        // Or just build the visible window.
        // Original code built "count" dots based on window start.

        // Let's rebuild every time the window start changes in updateDots.
        // So buildDots just clears and calls updateDots essentially if we treat it that way.
        // But original separate build/update.

        // Let's rely on updateDots to manage the DOM to keep it simple and correct.
        this.dotsWrap.innerHTML = '';
        this.updateDots();
    }

    updateDots() {
        if (!this.dotsWrap) return;
        const total = this.cachedTotalPages;
        if (total <= 1) {
            this.dotsWrap.style.display = 'none';
            return;
        }

        const start = this.windowStartFor(this.currentPage, total);
        const count = Math.min(total, this.maxDots);

        // Check if we need to rebuild (if start index changed or count changed)
        const currentDots = this.dotsWrap.querySelectorAll('.chpc__dot');
        let needRebuild = false;

        if (currentDots.length !== count) {
            needRebuild = true;
        } else if (currentDots.length > 0) {
            const firstPage = parseInt(currentDots[0].dataset.page, 10);
            if (firstPage !== start) needRebuild = true;
        } else {
            needRebuild = true;
        }

        if (needRebuild) {
            const frag = document.createDocumentFragment();
            for (let i = 0; i < count; i++) {
                const real = start + i;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'chpc__dot';
                b.dataset.page = String(real);
                b.ariaLabel = 'Go to page ' + (real + 1);
                b.addEventListener('click', (e) => {
                    const p = parseInt(e.currentTarget.dataset.page, 10);
                    this.scrollToPage(p);
                });
                frag.appendChild(b);
            }
            this.dotsWrap.innerHTML = '';
            this.dotsWrap.appendChild(frag);
        }

        // Active state
        const all = this.dotsWrap.querySelectorAll('.chpc__dot');
        all.forEach(b => {
            const real = parseInt(b.dataset.page, 10);
            const isCurrent = real === this.currentPage;
            if (b.getAttribute('aria-current') !== String(isCurrent)) {
                b.setAttribute('aria-current', isCurrent ? 'true' : 'false');
            }
        });
    }

    runIntro() {
        if (this.hasIntro) return;
        this.hasIntro = true;

        if (typeof this.onIntro === 'function') {
            this.onIntro(this);
        } else {
            this.defaultIntro();
        }
    }

    defaultIntro() {
        const tiles = this.root.querySelectorAll('[data-tile], .chpc__slide');
        // Filter visible - this causes reflow (offsetParent).
        // Since this runs once on intro, it's acceptable.
        const visible = Array.from(tiles).filter(t => !t.hidden && t.offsetParent !== null);

        if (!visible.length) {
            this.root.classList.remove('chb--pre', 'chpc--pre');
            this.root.classList.add('chb--done', 'chpc--done');
            return;
        }

        visible.forEach(t => {
            t.classList.remove('chb-tile--intro', 'chpc-slide--intro');
            t.style.animationDelay = '';
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.root.classList.add('is-animating'); // Trigger CSS visibility change
                visible.forEach((t, i) => {
                    const isMobile = this.mqMobile.matches;
                    t.style.animationDelay = isMobile ? '0ms' : (i * 70) + 'ms';
                    t.classList.add(t.hasAttribute('data-tile') ? 'chb-tile--intro' : 'chpc-slide--intro');
                });

                const last = visible[visible.length - 1];
                const onDone = () => {
                    this.root.classList.remove('chb--pre', 'chpc--pre', 'is-animating');
                    this.root.classList.add('chb--done', 'chpc--done');
                    visible.forEach(t => {
                        t.classList.remove('chb-tile--intro', 'chpc-slide--intro');
                        t.style.animationDelay = '';
                    });
                };

                if (last) {
                    last.addEventListener('animationend', onDone, { once: true });
                    setTimeout(() => onDone(), 1000);
                } else {
                    onDone();
                }
            });
        });
    }
}

// Expose
window.ChHorizontalSlider = ChHorizontalSlider;
