/* ============================================================
   URBANALÍTICA — noche.js
   Arte generativo nocturno para páginas secundarias +
   reveal + navegación móvil. Determinista (seed fija).
   Espeja el sistema del flagship index.html sin las salas.
   NB: la lógica de formularios vive en js/script.js.
       El menú móvil lo maneja ESTE archivo (no script.js).
   ============================================================ */
(function () {
  'use strict';
  var LUZ = '#F7F5F1', COB = '#8A96E8', COB2 = '#4856B0';

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function flowAngle(x, y, t) {
    return Math.sin(x * 0.0042 + t) * 1.1 + Math.cos(y * 0.0051 - t * 0.7) * 0.9 + Math.sin((x + y) * 0.0023 + t * 0.3) * 1.4;
  }
  function setup(c) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = c.getBoundingClientRect();
    var w = Math.max(r.width, 40), h = Math.max(r.height, 40);
    c.width = w * dpr; c.height = h * dpr;
    var x = c.getContext('2d'); x.scale(dpr, dpr);
    return { ctx: x, w: w, h: h };
  }

  /* campo de flujo en luz sobre índigo (encabezados de página) */
  function campoNoche(c, seed) {
    var s = setup(c), ctx = s.ctx, w = s.w, h = s.h;
    var rnd = mulberry32(seed || 1350);
    var step = 30;
    for (var x = step / 2; x < w; x += step) {
      for (var y = step / 2; y < h; y += step) {
        var fade = Math.min(1, Math.max(0, (x / w - 0.28) * 1.7));
        if (rnd() > fade) { rnd(); continue; }
        var a = flowAngle(x, y, 0.6), r = rnd(), len = 5 + r * 10;
        var tone = rnd();
        if (tone < 0.62) { ctx.strokeStyle = LUZ; ctx.globalAlpha = 0.09 + r * 0.14; }
        else if (tone < 0.9) { ctx.strokeStyle = COB; ctx.globalAlpha = 0.18 + r * 0.28; }
        else { ctx.strokeStyle = LUZ; ctx.globalAlpha = 0.45; }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
        ctx.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2);
        ctx.stroke();
        if (rnd() > 0.975) { ctx.globalAlpha = 0.85; ctx.fillStyle = LUZ; ctx.fillRect(x - 1.3, y - 1.3, 2.6, 2.6); }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* panel de login: constelación densa hacia una esquina */
  function panelField(c) {
    var s = setup(c), ctx = s.ctx, w = s.w, h = s.h;
    var rnd = mulberry32(4856);
    var cx = w * 0.32, cy = h * 0.22;
    for (var i = 0; i < 460; i++) {
      var ang = rnd() * Math.PI * 2, rad = Math.pow(rnd(), 1.4) * Math.max(w, h) * 0.9;
      var px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
      if (px < 0 || px > w || py < 0 || py > h) continue;
      var near = 1 - Math.min(1, rad / (Math.max(w, h) * 0.9));
      var tone = rnd();
      ctx.globalAlpha = 0.1 + near * 0.5 * rnd();
      ctx.fillStyle = tone < 0.7 ? COB : LUZ;
      var sz = tone > 0.94 ? 2.4 : 1.2;
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
    }
    /* algunas líneas de flujo tenues */
    for (var li = 0; li < 26; li++) {
      var y0 = rnd() * h, amp = 6 + rnd() * 16, ph = rnd() * Math.PI * 2;
      ctx.globalAlpha = 0.05 + rnd() * 0.08; ctx.strokeStyle = COB; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var xx = 0; xx < w; xx += 6) {
        var yy = y0 + Math.sin(xx * 0.012 + ph) * amp;
        if (xx === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawAll() {
    var cn = document.getElementById('campoNoche');
    if (cn) campoNoche(cn, parseInt(cn.getAttribute('data-seed'), 10) || 1350);
    var pf = document.getElementById('panelField');
    if (pf) panelField(pf);
  }

  function init() {
    drawAll();

    /* reveal on scroll */
    var els = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
      }, { threshold: 0.14 });
      els.forEach(function (el) { io.observe(el); });
    } else { els.forEach(function (el) { el.classList.add('visible'); }); }

    /* menú móvil (dueño único de esta lógica) */
    var mt = document.getElementById('menuToggle'), mn = document.getElementById('mobileNav');
    if (mt && mn) {
      mt.addEventListener('click', function () {
        mt.classList.toggle('active');
        mn.classList.toggle('active');
        document.body.style.overflow = mn.classList.contains('active') ? 'hidden' : '';
      });
      mn.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          mt.classList.remove('active'); mn.classList.remove('active'); document.body.style.overflow = '';
        });
      });
    }

    /* redibujo en resize */
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawAll, 180); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
