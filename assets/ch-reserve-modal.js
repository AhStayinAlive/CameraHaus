/**
 * ch-reserve-modal.js
 * Opens / closes the Reserve modal and handles Shopify /contact form submission via AJAX.
 */
(function () {
  if (window.__CH_RSV_INIT) return;
  window.__CH_RSV_INIT = true;

  var modal = document.getElementById('ch-reserve-modal');
  if (!modal) return;

  var form = modal.querySelector('[data-rsv-form]');
  var productName = modal.querySelector('[data-rsv-product-name]');
  var fieldTitle = modal.querySelector('[data-rsv-field-title]');
  var fieldUrl = modal.querySelector('[data-rsv-field-url]');
  var fieldVariant = modal.querySelector('[data-rsv-field-variant]');
  var fieldSubject = modal.querySelector('[data-rsv-field-subject]');
  var bodyField = modal.querySelector('[data-rsv-body]');
  var successMsg = modal.querySelector('[data-rsv-success]');
  var errorMsg = modal.querySelector('[data-rsv-error]');
  var prevFocus = null;

  /* ---------- OPEN ---------- */
  function open(data) {
    prevFocus = document.activeElement;
    var title = data.title || '';
    var url = data.url || '';
    var variant = data.variant || '';

    // Reset form first (clears all fields including hidden ones)
    form.reset();

    // Then populate hidden fields after reset
    fieldTitle.value = title;
    fieldUrl.value = url ? window.location.origin + url : '';
    fieldVariant.value = variant;
    if (fieldSubject) fieldSubject.value = 'Reserve Request: ' + title;
    productName.textContent = title;
    successMsg.hidden = true;
    errorMsg.hidden = true;
    form.querySelectorAll('.ch-rsv__field, .ch-rsv__submit').forEach(function (el) {
      el.style.display = '';
    });

    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(function () {
      var first = form.querySelector('input:not([type=hidden])');
      if (first) first.focus();
    }, 80);
  }

  /* ---------- CLOSE ---------- */
  function close() {
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    if (prevFocus) prevFocus.focus();
  }

  /* ---------- EVENT: click delegation for [data-rsv-open] ---------- */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-rsv-open]');
    if (trigger) {
      e.preventDefault();
      open({
        title: trigger.getAttribute('data-rsv-title') || '',
        url: trigger.getAttribute('data-rsv-url') || '',
        variant: trigger.getAttribute('data-rsv-variant') || '',
        handle: trigger.getAttribute('data-rsv-handle') || ''
      });
      return;
    }

    // Close triggers
    if (e.target.closest('[data-rsv-close]')) {
      e.preventDefault();
      close();
    }
  });

  /* ESC key */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      close();
    }
  });

  /* ---------- FOCUS TRAP ---------- */
  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var focusable = modal.querySelectorAll(
      'button, [href], input:not([type=hidden]), textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- SUBMIT via AJAX ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var btn = form.querySelector('.ch-rsv__submit');
    btn.disabled = true;
    btn.querySelector('.ch-rsv__submit-txt').textContent = 'Sending…';

    // Append product context into the body so the email is self-contained
    var userMsg = bodyField.value.trim();
    var fullBody =
      '--- Product Reserve Request ---\n' +
      'Product: ' + fieldTitle.value + '\n' +
      'URL: ' + fieldUrl.value + '\n' +
      (fieldVariant.value ? 'Variant: ' + fieldVariant.value + '\n' : '') +
      '---\n' +
      (userMsg ? '\nCustomer note:\n' + userMsg : '');
    bodyField.value = fullBody;

    var fd = new FormData(form);

    fetch('/contact', {
      method: 'POST',
      body: fd,
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        // Show success
        form.querySelectorAll('.ch-rsv__field, .ch-rsv__submit').forEach(function (el) {
          el.style.display = 'none';
        });
        successMsg.hidden = false;
        errorMsg.hidden = true;
      })
      .catch(function () {
        errorMsg.hidden = false;
        btn.disabled = false;
        btn.querySelector('.ch-rsv__submit-txt').textContent = 'Submit Reserve Request';
        // Restore user-only message in textarea
        bodyField.value = userMsg;
      });
  });

  /* Expose globally for programmatic use */
  window.chReserveModal = { open: open, close: close };
})();
