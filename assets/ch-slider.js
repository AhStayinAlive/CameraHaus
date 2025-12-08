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
        this.mqMobile = window.matchMedia('(max-width:739.98px)');

        if (!this.track) return;

        this.init();
    }

    init() {
        this.track.addEventListener('scroll', () => this.onScroll(), { passive: true });

        if (this.btnPrev) this.btnPrev.addEventListener('click', () => this.scrollToPage(this.currentPage - 1));
        if (this.btnNext) this.btnNext.addEventListener('click', () => this.scrollToPage(this.currentPage + 1));

        window.addEventListener('resize', () => this.refresh());

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

    pageWidth() {
        return this.track ? this.track.clientWidth : 1;
    }

    pagesCount() {
        if (!this.track) return 1;
        return Math.max(1, Math.ceil((this.track.scrollWidth || 1) / (this.track.clientWidth || 1)));
    }

    refresh() {
        const needPages = this.pagesCount() > 1;
        if (!needPages) {
            this.track.scrollLeft = 0;
            this.currentPage = 0;
        }
        this.buildDots();
        this.updateDots();
        this.updateArrows();
    }

    updateArrows() {
        if (!this.btnPrev || !this.btnNext) return;

        // Desktop check (can be overridden if component is always-arrows)
        // For now, mirroring the logic: if not desktop, hide arrows? 
        // Actually, let's make it smarter: check computed style or option?
        // The original code hid arrows on mobile via media query check.
        if (!this.mqDesktop.matches) {
            // logic from original: hidden on mobile/tablet usually
            // but let's check if the button is actually visible via CSS
        }

        // Rely on CSS to hide if needed, but here we set disabled state
        const n = this.pagesCount();
        this.btnPrev.disabled = this.track.scrollLeft <= 10;
        this.btnNext.disabled = (this.currentPage >= n - 1);

        // If logic specific to desktop-only display is required:
        if (!this.mqDesktop.matches) {
            this.btnPrev.style.display = 'none';
            this.btnNext.style.display = 'none';
        } else {
            const need = n > 1;
            this.btnPrev.style.display = need ? 'grid' : 'none';
            this.btnNext.style.display = need ? 'grid' : 'none';
        }
    }

    scrollToPage(idx) {
        const total = this.pagesCount();
        if (idx < 0) idx = 0;
        if (idx > total - 1) idx = total - 1;

        const left = idx * this.pageWidth();
        this.track.scrollTo({ left: left, behavior: 'smooth' });
        this.currentPage = idx;

        this.updateDots();

        // Poll for scroll end to update arrows correctly
        let polled = 0;
        const poll = () => {
            this.updateArrows();
            polled++;
            if (polled < 20) requestAnimationFrame(poll);
        };
        poll();
    }

    onScroll() {
        this.updateDots(); // simple update
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
        const total = this.pagesCount();
        this.dotsWrap.innerHTML = '';

        if (total <= 1) {
            this.dotsWrap.style.display = 'none';
            return;
        }
        this.dotsWrap.style.display = 'flex';

        // Windowed dots
        const start = this.windowStartFor(this.currentPage, total);
        const count = Math.min(total, this.maxDots);

        for (let i = 0; i < count; i++) {
            const real = start + i;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chpc__dot'; // reusing existing class
            b.dataset.page = String(real);
            b.ariaLabel = 'Go to page ' + (real + 1);
            b.addEventListener('click', (e) => {
                const p = parseInt(e.currentTarget.dataset.page, 10);
                this.scrollToPage(p);
            });
            this.dotsWrap.appendChild(b);
        }
        this.updateDots();
    }

    updateDots() {
        if (!this.dotsWrap) return;
        const total = this.pagesCount();
        if (total <= 1) {
            this.dotsWrap.style.display = 'none';
            return;
        }

        const start = this.windowStartFor(this.currentPage, total);
        const dots = this.dotsWrap.querySelectorAll('.chpc__dot');

        // accessing existing dots vs rebuilding if window changed?
        // Simpler to rebuild if length mismatch, but let's try to update attributes if same window
        // Actually, "windowing" usually implies rebuilding content if indices shift.
        // The original code rebuilt if length mismatch. 
        // Let's just rebuild if the start index implies we need different numbers.
        // To be efficient: check if first dot's page matches start.
        if (dots.length > 0) {
            const firstPage = parseInt(dots[0].dataset.page, 10);
            if (firstPage !== start || dots.length !== Math.min(total, this.maxDots)) {
                this.buildDots();
                return;
            }
        } else {
            this.buildDots();
            return;
        }

        dots.forEach((b, i) => {
            const real = start + i;
            b.setAttribute('aria-current', real === this.currentPage ? 'true' : 'false');
        });
    }

    runIntro() {
        if (this.hasIntro) return;
        this.hasIntro = true;

        if (typeof this.onIntro === 'function') {
            this.onIntro(this); // Allow custom animation logic
        } else {
            // Default fade-up logic
            this.defaultIntro();
        }
    }

    defaultIntro() {
        // Find tiles
        const tiles = this.root.querySelectorAll('[data-tile], .chpc__slide');
        const visible = Array.from(tiles).filter(t => !t.hidden && t.offsetParent !== null); // check visibility

        if (!visible.length) {
            this.root.classList.remove('chb--pre', 'chpc--pre');
            this.root.classList.add('chb--done', 'chpc--done');
            return;
        }

        // Reset
        visible.forEach(t => {
            t.classList.remove('chb-tile--intro', 'chpc-slide--intro');
            t.style.animationDelay = '';
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                visible.forEach((t, i) => {
                    // Mobile check for delay? 
                    const isMobile = this.mqMobile.matches;
                    t.style.animationDelay = isMobile ? '0ms' : (i * 70) + 'ms';
                    // Assuming unified class or dual classes
                    t.classList.add(t.hasAttribute('data-tile') ? 'chb-tile--intro' : 'chpc-slide--intro'); // heuristics
                });

                const last = visible[visible.length - 1];
                const onDone = () => {
                    this.root.classList.remove('chb--pre', 'chpc--pre');
                    this.root.classList.add('chb--done', 'chpc--done');
                    visible.forEach(t => {
                        t.classList.remove('chb-tile--intro', 'chpc-slide--intro');
                        t.style.animationDelay = '';
                    });
                };

                if (last) {
                    last.addEventListener('animationend', onDone, { once: true });
                    setTimeout(() => onDone(), 1000); // safety
                } else {
                    onDone();
                }
            });
        });
    }
}

// Expose
window.ChHorizontalSlider = ChHorizontalSlider;
