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
  // Sends via AJAX to FormSubmit so the page doesn't redirect
  const agendaForm = document.getElementById('agendaForm');
  if (agendaForm) {
    agendaForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btn = agendaForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Enviando...';
      btn.disabled = true;

      try {
        const formData = new FormData(agendaForm);
        await fetch('https://formsubmit.co/ajax/hola@urbanalitica.com', {
          method: 'POST',
          body: formData
        });

        btn.textContent = '¡Enviado! Te contactaremos pronto';
        btn.style.background = '#2D8F5E';
        btn.style.borderColor = '#2D8F5E';
      } catch (err) {
        console.warn('FormSubmit error:', err);
        btn.textContent = 'Error — intenta de nuevo';
        btn.style.background = '#c0392b';
        btn.style.borderColor = '#c0392b';
      }

      // Reset after 4 seconds
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.disabled = false;
        agendaForm.reset();
      }, 4000);
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

  // ==========================================================
  // --- Helper: submit to Google Forms via hidden iframe ---
  // This is MUCH more reliable than fetch with mode:'no-cors'
  // because form submissions are not subject to CORS policy.
  // ==========================================================
  function submitToGoogleForms(formURL, fields) {
    // Create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.name = 'gf-iframe-' + Date.now();
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    // Create hidden form targeting the iframe
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = formURL;
    form.target = iframe.name;

    // Add all fields
    fields.forEach(({ name, value }) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();

    // Clean up after 5 seconds
    setTimeout(() => {
      if (form.parentNode) form.parentNode.removeChild(form);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 5000);
  }

  // --- Evaluación form: dual submit to Google Forms + FormSubmit ---
  const evaluacionForm = document.getElementById('evaluacionForm');
  if (evaluacionForm) {
    evaluacionForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btn = evaluacionForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Enviando...';
      btn.disabled = true;

      // Gather values
      const rol = evaluacionForm.querySelector('input[name="rol"]:checked');
      let rolValue = rol ? rol.value : '';
      if (rolValue === 'Otro') {
        const otroText = document.getElementById('rol-otro-texto');
        if (otroText && otroText.value.trim()) {
          rolValue = otroText.value.trim();
        }
      }
      const unidades = evaluacionForm.querySelector('[name="unidades"]').value;
      const seguridad = evaluacionForm.querySelector('[name="seguridad_ubicaciones"]').value;
      const tiempoEval = evaluacionForm.querySelector('input[name="tiempo_evaluacion"]:checked');
      const tiempoValue = tiempoEval ? tiempoEval.value : '';
      const herramientas = [...evaluacionForm.querySelectorAll('input[name="herramientas"]:checked')].map(cb => cb.value);
      const valorScore = evaluacionForm.querySelector('[name="valor_score"]').value;
      const nombre = evaluacionForm.querySelector('[name="nombre"]').value;
      const email = evaluacionForm.querySelector('[name="email"]').value;
      const giro = evaluacionForm.querySelector('[name="giro_negocio"]').value;
      const franquicia = evaluacionForm.querySelector('[name="nombre_franquicia"]').value;

      // --- 1) Google Forms submission (hidden iframe — reliable) ---
      const googleFormURL = 'https://docs.google.com/forms/d/e/1FAIpQLSc5y5VO5MPRpC2fNoM1mhrtXFfv2_4Q3LpKhtuzV_W34URAIQ/formResponse';
      const gfFields = [
        { name: 'entry.1777455602', value: rolValue },
        { name: 'entry.1954725010', value: unidades },
        { name: 'entry.1212940379', value: seguridad },
        { name: 'entry.674795550',  value: tiempoValue },
        { name: 'entry.690297100',  value: valorScore },
        { name: 'entry.366589416',  value: nombre },
        { name: 'entry.1513591299', value: email },
        { name: 'entry.907161128',  value: giro },
        { name: 'entry.512627142',  value: franquicia }
      ];
      // Checkboxes: append each selected value as a separate field with same entry ID
      herramientas.forEach(h => {
        gfFields.push({ name: 'entry.1724548844', value: h });
      });

      try {
        submitToGoogleForms(googleFormURL, gfFields);
      } catch (err) {
        console.warn('Google Forms submit error:', err);
      }

      // --- 2) FormSubmit email notification ---
      const fsData = new FormData();
      fsData.append('_subject', 'Nueva evaluación de potencial retail');
      fsData.append('_captcha', 'false');
      fsData.append('_template', 'table');
      fsData.append('_autoresponse', '¡Gracias por completar tu evaluación! Nuestro equipo revisará tus respuestas y te enviaremos tu análisis inicial en las próximas 24 horas. — Equipo Urbanalítica');
      fsData.append('Rol', rolValue);
      fsData.append('Unidades', unidades);
      fsData.append('Seguridad ubicaciones (1-10)', seguridad);
      fsData.append('Tiempo evaluación', tiempoValue);
      fsData.append('Herramientas', herramientas.join(', '));
      fsData.append('Valor score (1-5)', valorScore);
      fsData.append('Nombre', nombre);
      fsData.append('Email', email);
      fsData.append('Giro de negocio', giro);
      fsData.append('Nombre franquicia', franquicia);

      try {
        await fetch('https://formsubmit.co/ajax/hola@urbanalitica.com', {
          method: 'POST',
          body: fsData
        });
      } catch (err) {
        console.warn('FormSubmit error:', err);
      }

      // --- Success message ---
      btn.textContent = '¡Enviado! Te contactaremos pronto';
      btn.style.background = '#2D8F5E';
      btn.style.borderColor = '#2D8F5E';

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.disabled = false;
        evaluacionForm.reset();
        // Reset range display values
        const segVal = document.getElementById('seguridad-val');
        const scoreVal = document.getElementById('score-val');
        if (segVal) segVal.textContent = '5';
        if (scoreVal) scoreVal.textContent = '3';
        if (rolOtroTexto) rolOtroTexto.style.display = 'none';
      }, 4000);
    });
  }

});
