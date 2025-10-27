
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
  // ⭐ BACKEND API URL - Uses relative URLs (works on Railway and localhost)
  // If frontend and backend are on same domain, use empty string
  // If separate, set to your Railway URL: 'https://your-app.railway.app'
  const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : ''; // Empty = same domain (Railway)
  
  let datepicker = null;
  let selectedService = null;
  let selectedDate = null;
  let selectedTime = null;

  const services = {
    sibo:                  { name: 'Badanie oddechowe SIBO', price: '350 zł', duration: '180 min' },
    consultation:          { name: 'Konsultacja dietetyczna', price: '150 zł', duration: '90 min'  },
    followup:              { name: 'Wizyta kontrolna',        price: '100 zł', duration: '45 min'  },
    sports:                { name: 'Żywienie sportowców',     price: '180 zł', duration: '90 min'  },
    'sibo-test':           { name: 'Test wodorowo-metanowy w kierunku SIBO / IMO', price: '300 zł', duration: '180 min' },
    'sugar-intolerance':   { name: 'Test wodorowy w kierunku nietolerancji cukrów', price: '160 zł', duration: '120 min' },
    'consultation-detailed': { name: 'Konsultacja dietetyczna - szczegółowo', price: '180 zł', duration: '90 min' },
    'consultation-followup': { name: 'Konsultacja dietetyczna kontrolna', price: '150 zł', duration: '45 min' },
    'monthly-package':     { name: 'Pakiet współpracy na miesiąc', price: '450 zł', duration: '90 min' },
    'meal-plan-2weeks':    { name: 'Plan żywieniowy na dwa tygodnie', price: '250 zł', duration: '60 min' },
    'meal-plan-1week':     { name: 'Plan żywieniowy na tydzień', price: '150 zł', duration: '60 min' }
  };

  function openBookingModal(preselectedService = null) {
    const modal = $('#bookingModal');
    if (!modal) return;

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    ScrollLock.lock();

    // If a service is preselected, select it in the form
    if (preselectedService && services[preselectedService]) {
      setTimeout(() => {
        const serviceRadio = $(`input[name="service"][value="${preselectedService}"]`);
        if (serviceRadio) {
          serviceRadio.checked = true;
          selectService(preselectedService);
        }
      }, 100);
    }

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
        onSelect: async ({ date }) => {
          if (!date) return;
          selectedDate = date;
          
          // 🆕 Fetch available times from backend
          await fetchAvailableTimes(date);
          renderTimeSlotsForDate(date);
          checkFormValidity();
        }
      });
    }
  }

  // 🆕 NEW FUNCTION: Fetch available times from backend
  async function fetchAvailableTimes(date) {
    try {
      const dateStr = formatDateForAPI(date);
      const response = await fetch(`${API_URL}/api/available-times?date=${dateStr}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch available times');
      }
      
      const data = await response.json();
      return data.availableTimes || [];
    } catch (error) {
      console.error('Error fetching available times:', error);
      // Return default times if backend is not available
      return ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
    }
  }

  // 🆕 Format date for API (YYYY-MM-DD)
  function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function renderTimeSlotsForDate(date) {
    const container = $('#timeSlots');
    if (!container) return;

    container.innerHTML = '<div class="loading">Ładowanie dostępnych godzin...</div>';

    try {
      const availableTimes = await fetchAvailableTimes(date);
      
      container.innerHTML = '';
      
      if (availableTimes.length === 0) {
        container.innerHTML = '<div class="no-slots">Brak dostępnych terminów na ten dzień</div>';
        return;
      }

      availableTimes.forEach((time) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'time-slot';
        btn.textContent = time;
        btn.addEventListener('click', () => selectTimeSlot(time));
        container.appendChild(btn);
      });
    } catch (error) {
      container.innerHTML = '<div class="error">Błąd ładowania terminów</div>';
      console.error('Error rendering time slots:', error);
    }
  }

  function selectTimeSlot(time) {
    selectedTime = time;
    $$('.time-slot').forEach((btn) => {
      btn.classList.toggle('selected', btn.textContent === time);
    });
    $('#selectedTime').value = time;
    updateSummary();
    checkFormValidity();
  }

  function setupServiceSelection() {
    const serviceOptions = $('#serviceOptions');
    if (!serviceOptions) return;

    serviceOptions.addEventListener('change', (e) => {
      if (e.target.name === 'service') {
        selectedService = e.target.value;
        updateSummary();
        checkFormValidity();
      }
    });
  }

  function updateSummary() {
    const summary = $('#bookingSummary');
    if (!summary) return;

    if (selectedService && selectedDate && selectedTime) {
      const svc = services[selectedService];
      $('#summaryService').textContent = svc.name;
      $('#summaryDate').textContent = selectedDate.toLocaleDateString('pl-PL');
      $('#summaryTime').textContent = selectedTime;
      $('#summaryPrice').textContent = svc.price;
      summary.hidden = false;
    } else {
      summary.hidden = true;
    }
  }

  function checkFormValidity() {
    const firstName = $('#firstName');
    const lastName  = $('#lastName');
    const email     = $('#email');
    const phone     = $('#phone');
    const btn       = $('#submitBtn');

    if (!firstName || !lastName || !email || !phone || !btn) return;

    const valid =
      firstName.value.trim() &&
      lastName.value.trim() &&
      email.value.trim() &&
      phone.value.trim() &&
      selectedService &&
      selectedDate &&
      selectedTime;

    btn.disabled = !valid;
  }

  function resetForm() {
    const form = $('#bookingForm');
    if (form) form.reset();
    
    selectedService = null;
    selectedDate = null;
    selectedTime = null;
    
    const timeSlots = $('#timeSlots');
    if (timeSlots) timeSlots.innerHTML = '';
    
    const summary = $('#bookingSummary');
    if (summary) summary.hidden = true;
    
    const btn = $('#submitBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Potwierdź rezerwację';
    }
  }

  function durationToMinutes(duration) {
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 60;
  }

  function buildGoogleCalendarUrl({ title, details, location, startDate, startTime, durationMin }) {
    const [h, m] = startTime.split(':').map(Number);
    const start = new Date(startDate);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + durationMin * 60000);

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
        // Get preselected service from data attribute
        const preselectedService = btn.dataset.service || null;
        openBookingModal(preselectedService);
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

    // 🆕 NEW BOOKING SUBMIT - Connects to backend
    const bookingForm = $('#bookingForm');
    if (bookingForm) {
      bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!selectedService || !selectedDate || !selectedTime) {
          alert('Proszę wypełnić wszystkie wymagane pola.');
          return;
        }

        const svc = services[selectedService];
        const btn = $('#submitBtn');
        const firstName = $('#firstName').value;
        const lastName = $('#lastName').value;
        const email = $('#email').value;
        const phone = $('#phone').value;
        const notes = $('#notes').value;

        if (btn) { 
          btn.textContent = 'Zapisywanie…'; 
          btn.disabled = true; 
        }

        try {
          // 🆕 Send booking to backend
          const response = await fetch(`${API_URL}/api/bookings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              firstName,
              lastName,
              email,
              phone,
              service: svc.name,
              date: formatDateForAPI(selectedDate),
              time: selectedTime,
              notes,
              price: svc.price
            })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Błąd podczas rezerwacji');
          }

          // Success!
          alert(`Dziękujemy! Rezerwacja potwierdzona:\n${svc.name}\n${selectedDate.toLocaleDateString('pl-PL')} ${selectedTime}\n\nPotwierdzenie wyślemy na ${email}.`);

          // Open Google Calendar
          try {
            const calendarUrl = buildGoogleCalendarUrl({
              title: svc.name,
              details: 'Wizyta w HARMONIA. Prosimy o przybycie 5 minut wcześniej.',
              location: 'ul. Zacisze 16/1, Kraków',
              startDate: selectedDate,
              startTime: selectedTime,
              durationMin: durationToMinutes(svc.duration)
            });
            window.open(calendarUrl, '_blank');
          } catch(e) {
            console.log('Could not open calendar link:', e);
          }

          closeBookingModal();

        } catch (error) {
          console.error('Booking error:', error);
          alert(`Wystąpił błąd: ${error.message}\n\nProszę spróbować ponownie lub skontaktować się telefonicznie: 692 922 926`);
          if (btn) {
            btn.textContent = 'Potwierdź rezerwację';
            btn.disabled = false;
          }
        }
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
