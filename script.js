
(() => {
  'use strict';

  /* ------------------ Small DOM helpers ------------------ */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ------------------ Utils ------------------ */
  const rafThrottle = (fn) => {
    let ticking = false;
    return (...args) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        fn(...args);
        ticking = false;
      });
    };
  };

  // Focus trap for overlays/menus
  function trapFocus(container) {
    const selector = [
      'a[href]',
      'area[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const getFocusable = () =>
      $$(selector, container).filter((el) => el.offsetParent !== null || el === document.activeElement);

    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      const focusables = getFocusable();
      if (!focusables.length) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', onKeydown);
    return () => container.removeEventListener('keydown', onKeydown);
  }

  // Body scroll lock
  const ScrollLock = (() => {
    let lockCount = 0;
    const original = { overflow: '', paddingRight: '' };

    function getScrollbarWidth() {
      return window.innerWidth - document.documentElement.clientWidth;
    }

    return {
      lock() {
        lockCount += 1;
        if (lockCount > 1) return;
        original.overflow = document.documentElement.style.overflow;
        original.paddingRight = document.documentElement.style.paddingRight;
        const sw = getScrollbarWidth();
        document.documentElement.style.overflow = 'hidden';
        if (sw > 0) {
          document.documentElement.style.paddingRight = `${sw}px`;
        }
      },
      unlock() {
        lockCount = Math.max(0, lockCount - 1);
        if (lockCount > 0) return;
        document.documentElement.style.overflow = original.overflow || '';
        document.documentElement.style.paddingRight = original.paddingRight || '';
      }
    };
  })();

  /* ------------------ Sticky nav + burger ------------------ */
  function initNav() {
    const nav     = $('.main-nav');
    const burger  = $('#hamburger');
    const menu    = $('#navLinks');

    if (!nav || !burger || !menu) return;

    // Sticky
    const stick = rafThrottle(() => {
      nav.classList.toggle('is-stuck', window.scrollY > 12);
    });
    stick();
    window.addEventListener('scroll', stick, { passive: true });

    // Initial state/ARIA
    burger.setAttribute('aria-controls', menu.id || 'navLinks');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Otwórz menu');
    menu.classList.remove('active');
    burger.classList.remove('is-open');
    document.body.classList.remove('menu-open');

    let untrapFocus = () => {};

    function openMenu() {
      menu.classList.add('active');
      burger.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Zamknij menu');
      document.body.classList.add('menu-open');
      ScrollLock.lock();

      // Focus handling
      untrapFocus = trapFocus(menu);
      const first = menu.querySelector('a,button');
      if (first) first.focus();
    }

    function closeMenu() {
      menu.classList.remove('active');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Otwórz menu');
      document.body.classList.remove('menu-open');
      untrapFocus();
      ScrollLock.unlock();
      burger.focus();
    }

    burger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('active');
      isOpen ? closeMenu() : openMenu();
    });

    // Close on link click
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        closeMenu();
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('active') && !menu.contains(e.target) && !burger.contains(e.target)) {
        closeMenu();
      }
    });

    // Close on Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('active')) {
        closeMenu();
      }
    });

    // Collapse on desktop
    const mq = window.matchMedia('(min-width: 993px)');
    const handleMQ = () => { if (mq.matches) closeMenu(); };
    mq.addEventListener ? mq.addEventListener('change', handleMQ) : mq.addListener(handleMQ);
  }

  /* ------------------ Booking ------------------ */
  let datepicker = null;
  let selectedService = null;
  let selectedDate = null;
  let selectedTime = null;

  const services = {
    sibo:         { name: 'Badanie oddechowe SIBO', price: '350 zł', duration: '180 min' },
    consultation: { name: 'Konsultacja dietetyczna', price: '150 zł', duration: '90 min'  },
    followup:     { name: 'Wizyta kontrolna',        price: '100 zł', duration: '45 min'  },
    sports:       { name: 'Żywienie sportowców',     price: '180 zł', duration: '90 min'  }
  };

  const availableTimes = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
  const bookedAppointments = { '2025-07-29':['09:00','14:00','16:00'] };

  function openBookingModal() {
    const modal = $('#bookingModal');
    if (!modal) return;

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    ScrollLock.lock();

    // Init datepicker after paint
    setTimeout(initializeDatepicker, 50);
  }

  function closeBookingModal() {
    const modal = $('#bookingModal');
    if (!modal) return;

    if (datepicker && typeof datepicker.destroy === 'function') {
      try { datepicker.destroy(); } catch(_) {}
      datepicker = null;
    }
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    resetForm();
    ScrollLock.unlock();
  }

  function initializeDatepicker() {
    const input = $('#appointmentDate');
    if (!input) return;

    // Destroy just in case
    if (datepicker && typeof datepicker.destroy === 'function') {
      try { datepicker.destroy(); } catch(_) {}
      datepicker = null;
    }

    if (typeof AirDatepicker !== 'undefined') {
      const container = $('.modal-content') || document.body;

      datepicker = new AirDatepicker(input, {
        minDate: new Date(),
        maxDate: new Date(Date.now() + 90*24*60*60*1000),
        isMobile: window.innerWidth <= 768,
        autoClose: true,
        dateFormat: 'dd.MM.yyyy',
        container,
        position: 'bottom left',
        onRenderCell: ({ date }) => {
          // disable Sundays
          if (date.getDay() === 0) return { disabled: true, classes: 'disabled-date' };
          return {};
        },
        onSelect: ({ date }) => {
          if (date) {
            selectedDate = date;
            updateTimeSlots(date);
            updateSummary();
            checkFormValidity();
          }
        }
      });

      const showPicker = () => { if (datepicker && !datepicker.visible) datepicker.show(); };
      input.addEventListener('focus', showPicker);
      input.addEventListener('click', showPicker);
    } else {
      // Fallback
      input.type = 'date';
      input.removeAttribute('readonly');
      const today = new Date();
      const maxDate = new Date(today.getTime() + 90*24*60*60*1000);
      input.min = today.toISOString().split('T')[0];
      input.max = maxDate.toISOString().split('T')[0];
      input.addEventListener('change', (e) => {
        if (e.target.value) {
          selectedDate = new Date(e.target.value);
          updateTimeSlots(selectedDate);
          updateSummary();
          checkFormValidity();
        }
      });
    }
  }

  function setupServiceSelection() {
    const container = $('#serviceOptions');
    if (!container) return;

    container.addEventListener('change', (e) => {
      if (e.target.name === 'service') {
        selectedService = e.target.value;
        $$('.service-option').forEach((l) => l.classList.remove('selected'));
        e.target.closest('.service-option')?.classList.add('selected');
        updateSummary();
        checkFormValidity();
      }
    });
  }

  function updateTimeSlots(date) {
    const wrap = $('#timeSlots');
    if (!wrap || !date) return;
    const dateStr = date.toISOString().split('T')[0];
    const booked  = bookedAppointments[dateStr] || [];
    wrap.innerHTML = '';

    availableTimes.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-slot';
      btn.textContent = t;
      if (booked.includes(t)) {
        btn.classList.add('unavailable');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => selectTime(t, btn));
      }
      wrap.appendChild(btn);
    });
  }

  function selectTime(time, el) {
    $$('.time-slot').forEach((b) => b.classList.remove('selected'));
    el?.classList.add('selected');
    selectedTime = time;
    const hidden = $('#selectedTime');
    if (hidden) hidden.value = time;
    updateSummary();
    checkFormValidity();
  }

  function updateSummary() {
    const s = $('#bookingSummary');
    if (!s) return;

    if (selectedService && selectedDate && selectedTime) {
      const svc = services[selectedService] || {};
      $('#summaryService') && ($('#summaryService').textContent = svc.name || '');
      $('#summaryDate')   && ($('#summaryDate').textContent   = selectedDate.toLocaleDateString('pl-PL'));
      $('#summaryTime')   && ($('#summaryTime').textContent   = selectedTime);
      $('#summaryPrice')  && ($('#summaryPrice').textContent  = svc.price || '');
      s.hidden = false;
    } else {
      s.hidden = true;
    }
  }

  function checkFormValidity() {
    const firstName = $('#firstName');
    const lastName  = $('#lastName');
    const email     = $('#email');
    const phone     = $('#phone');
    const submitBtn = $('#submitBtn');

    const ok = (firstName?.value?.trim())
            && (lastName?.value?.trim())
            && (email?.value?.trim())
            && (phone?.value?.trim())
            && selectedService && selectedDate && selectedTime;

    if (submitBtn) submitBtn.disabled = !ok;
  }

  function resetForm() {
    const form = $('#bookingForm');
    if (form) form.reset();
    $$('.service-option').forEach((o) => o.classList.remove('selected'));
    $$('.time-slot').forEach((s) => s.classList.remove('selected'));
    const summary = $('#bookingSummary');
    if (summary) summary.hidden = true;
    const submitBtn = $('#submitBtn');
    if (submitBtn) submitBtn.disabled = true;
    selectedService = selectedDate = selectedTime = null;
  }

  function durationToMinutes(durationStr) {
    const m = durationStr?.match(/(\d+)\s*min/);
    return m ? parseInt(m[1], 10) : 60;
  }

  function buildGoogleCalendarUrl({
    title, details, location, startDate, startTime, durationMin
  }) {
    const [h, m] = (startTime || '09:00').split(':').map(Number);
    const start = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
      h, m
    );
    const end   = new Date(start.getTime() + (durationMin || 60) * 60000);

    const pad = (n) => String(n).padStart(2, '0');
    const toGoogle = (dt) =>
      dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) +
      'T' + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00Z';

    const dates = `${toGoogle(start)}/${toGoogle(end)}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&dates=${dates}`;
  }

  /* ------------------ Articles slider ------------------ */
  function initArticlesSlider() {
    const wrap = document.getElementById('newsSlider');
    if (!wrap) return;

    const prev = document.querySelector('.articles-prev');
    const next = document.querySelector('.articles-next');

    const step = () => {
      const card = wrap.querySelector('.post-slide');
      const w = card ? card.getBoundingClientRect().width + 20 : wrap.clientWidth * 0.9;
      return Math.max(240, Math.min(w * 1.1, 520));
    };

    const scrollLeft  = () => wrap.scrollBy({ left: -step(), behavior: 'smooth' });
    const scrollRight = () => wrap.scrollBy({ left:  step(), behavior: 'smooth' });

    prev && prev.addEventListener('click', scrollLeft);
    next && next.addEventListener('click', scrollRight);

    let timer = setInterval(scrollRight, 4500);
    wrap.addEventListener('pointerenter', () => clearInterval(timer));
    wrap.addEventListener('pointerleave', () => (timer = setInterval(scrollRight, 4500)));

    // wrap-around
    wrap.addEventListener('scroll', rafThrottle(() => {
      if (wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 2) {
        wrap.scrollTo({ left: 0, behavior: 'smooth' });
      }
    }));
  }

  /* ------------------ Form helpers ------------------ */
  function addFormValidation() {
    ['#firstName', '#lastName', '#email', '#phone'].forEach((selector) => {
      const input = $(selector);
      if (input) {
        input.addEventListener('input', checkFormValidity);
        input.addEventListener('blur',  checkFormValidity);
      }
    });
  }

  /* ------------------ Boot ------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    // Nav + burger
    initNav();

    // Slider
    initArticlesSlider();

    // Booking triggers
    $$('.js-open-booking').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openBookingModal();
      });
    });

    // Modal backdrop click
    const modal = $('#bookingModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeBookingModal();
      });
    }
    const closeBtn = $('.close');
    closeBtn && closeBtn.addEventListener('click', closeBookingModal);

    // Service selection + form + validation
    setupServiceSelection();
    addFormValidation();

    // Booking submit
    const bookingForm = $('#bookingForm');
    if (bookingForm) {
      bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!selectedService || !selectedDate || !selectedTime) {
          alert('Proszę wypełnić wszystkie wymagane pola.');
          return;
        }

        const svc = services[selectedService];
        const btn = $('#submitBtn');
        const email = $('#email');

        if (btn) { btn.textContent = 'Zapisywanie…'; btn.disabled = true; }

        setTimeout(() => {
          if (email) {
            alert(`Dziękujemy! Rezerwacja: ${svc.name} — ${selectedDate.toLocaleDateString('pl-PL')} ${selectedTime}. Potwierdzenie wyślemy na ${email.value}.`);
          }
          if (btn) btn.textContent = 'Potwierdź rezerwację';

          try {
            const url = buildGoogleCalendarUrl({
              title: svc.name,
              details: 'Wizyta w NutriMedic. Prosimy o przybycie 5 minut wcześniej.',
              location: 'ul. Na Gródku 2/8, Kraków',
              startDate: selectedDate,
              startTime: selectedTime,
              durationMin: durationToMinutes(svc.duration)
            });
            window.open(url, '_blank');
          } catch(e) {
            console.log('Could not open calendar link:', e);
          }

          closeBookingModal();
        }, 600);
      });
    }

    // Newsletter
    const newsletterForm = $('#newsletterForm');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const emailInput = e.currentTarget.querySelector('input[type="email"]');
        if (emailInput) {
          alert(`Dziękujemy za zapis: ${emailInput.value}`);
          e.currentTarget.reset();
        }
      });
    }
  });

  // Global Escape (modal + menu)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    // Close modal
    const modal = $('#bookingModal');
    if (modal && modal.classList.contains('show')) {
      closeBookingModal();
    }

    // Close burger
    const menu   = $('#navLinks');
    const burger = $('#hamburger');
    if (menu && menu.classList.contains('active')) {
      menu.classList.remove('active');
      burger?.classList.remove('is-open');
      burger?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      ScrollLock.unlock();
      burger?.focus();
    }
  });
})();

// === Mobile Menu Redesign JS — clean build ===
(function() {
  'use strict';
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const mobileCloseBtn = document.querySelector('.mobile-menu-close');
  const mobileLinks = document.querySelectorAll('.mobile-nav-links a');
  let isMenuOpen = false;
  let focusableElements = [];
  let firstFocusableElement = null;
  let lastFocusableElement = null;

  function updateFocusableElements() {
    const focusableSelectors = ['a[href]','button:not([disabled])','input:not([disabled])','select:not([disabled])','textarea:not([disabled])','[tabindex]:not([tabindex="-1"])'];
    focusableElements = Array.from(mobileMenu.querySelectorAll(focusableSelectors.join(','))).filter(el => el.offsetParent !== null);
    firstFocusableElement = focusableElements[0];
    lastFocusableElement = focusableElements[focusableElements.length - 1];
  }

  function openMenu() {
    if (isMenuOpen) return;
    isMenuOpen = true;
    document.body.classList.add('menu-open');
    mobileOverlay.classList.add('active');
    mobileMenu.classList.add('active');
    hamburger.setAttribute('aria-expanded','true');
    hamburger.setAttribute('aria-label','Zamknij menu');
    mobileMenu.setAttribute('aria-hidden','false');
    hamburger.classList.add('is-open');
    updateFocusableElements();
    if (firstFocusableElement) firstFocusableElement.focus();
  }

  function closeMenu() {
    if (!isMenuOpen) return;
    isMenuOpen = false;
    document.body.classList.remove('menu-open');
    mobileOverlay.classList.remove('active');
    mobileMenu.classList.remove('active');
    hamburger.setAttribute('aria-expanded','false');
    hamburger.setAttribute('aria-label','Otwórz menu');
    mobileMenu.setAttribute('aria-hidden','true');
    hamburger.classList.remove('is-open');
    hamburger.focus();
  }

  function toggleMenu(){ isMenuOpen ? closeMenu() : openMenu(); }

  if (hamburger) hamburger.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleMenu(); });
  if (mobileCloseBtn) mobileCloseBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeMenu(); });
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMenu);
  mobileLinks.forEach(link => { link.addEventListener('click', ()=>{ setTimeout(closeMenu, 120); }); });

  document.addEventListener('keydown', (e)=>{
    if (!isMenuOpen) return;
    if (e.key === 'Escape'){ e.preventDefault(); closeMenu(); }
    if (e.key === 'Tab'){
      if (e.shiftKey){
        if (document.activeElement === firstFocusableElement){ e.preventDefault(); if (lastFocusableElement) lastFocusableElement.focus(); }
      } else {
        if (document.activeElement === lastFocusableElement){ e.preventDefault(); if (firstFocusableElement) firstFocusableElement.focus(); }
      }
    }
  });

  let resizeTimer=null;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{ if (window.innerWidth>992 && isMenuOpen) closeMenu(); },150);
  });

  window.addEventListener('pageshow', ()=>{ if (isMenuOpen) closeMenu(); });
})();
