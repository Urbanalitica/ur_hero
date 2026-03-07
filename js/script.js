/* ============================================
   URBANALÍTICA — Main Script
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Header scroll effect ---
  const header = document.getElementById('header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    });
  }

  // --- Mobile menu toggle ---
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNav');

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });

    // Close mobile nav on link click
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        mobileNav.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // --- Form submission handler (Agenda) ---
  const agendaForm = document.getElementById('agendaForm');
  if (agendaForm) {
    agendaForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(agendaForm);
      const data = Object.fromEntries(formData);

      // Show confirmation
      const btn = agendaForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = '¡Enviado! Te contactaremos pronto';
      btn.style.background = '#2D8F5E';
      btn.style.borderColor = '#2D8F5E';
      btn.disabled = true;

      // Reset after 3 seconds
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.disabled = false;
        agendaForm.reset();
      }, 3000);

      console.log('Form data:', data);
    });
  }

  // --- Login form handler ---
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const btn = loginForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Iniciando sesión...';
      btn.disabled = true;

      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Plataforma en desarrollo. Próximamente podrás acceder a tu panel de análisis.');
      }, 1500);
    });
  }

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Intersection Observer for animations ---
  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Animate elements on scroll
  const animateElements = document.querySelectorAll(
    '.feature-card, .benefit-card, .territory-card, .section-mission h2, .section-cta h3'
  );

  animateElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });

  // --- "Otro" radio: show/hide text input ---
  const rolRadios = document.querySelectorAll('input[name="rol"]');
  const rolOtroTexto = document.getElementById('rol-otro-texto');
  if (rolRadios.length && rolOtroTexto) {
    rolRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'Otro' && radio.checked) {
          rolOtroTexto.style.display = 'block';
          rolOtroTexto.focus();
        } else {
          rolOtroTexto.style.display = 'none';
          rolOtroTexto.value = '';
        }
      });
    });
  }

});
