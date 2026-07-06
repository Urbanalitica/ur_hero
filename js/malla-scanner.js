/* Urbanalítica — sala 01: la malla nacional recorrida por un barrido de lectura.
   Panal hexagonal (esquina→región) que una onda "lee" de izquierda a derecha,
   resolviendo cada celda a escala fina al pasar. Canvas 2D, sin dependencias.
   Pausa cuando no está a la vista y respeta prefers-reduced-motion. */
(function () {
  var NOCHE = [11, 15, 42], COB = [72, 86, 176], COBL = [138, 150, 232], LUZ = [247, 245, 241];
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function field(x, y, t) {
    var a = Math.sin(x * 0.0026 + Math.cos(y * 0.0021 + t * 0.35) * 1.6 + t * 0.5);
    var b = Math.cos(y * 0.0029 - x * 0.0015 + t * 0.28);
    return 0.5 + 0.5 * a * b;
  }

  function initMallaScanner(cv) {
    var ctx = cv.getContext('2d'), W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
    var R = 46, CR = R / 2.645, GR = CR / 2.645, colStep = 1.5 * R, rowStep = Math.sqrt(3) * R;
    var stars = [];
    function reseed() {
      var n = Math.round(W * H / 14000); stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, p: Math.random() * 6.28, s: Math.random() * 0.6 + 0.2 });
    }
    function resize() {
      var r = cv.getBoundingClientRect();
      W = Math.max(r.width, 40); H = Math.max(r.height, 40);
      cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      R = Math.max(30, Math.min(52, W / 9)); CR = R / 2.645; GR = CR / 2.645; colStep = 1.5 * R; rowStep = Math.sqrt(3) * R;
      reseed();
    }
    resize();

    function hexPath(cx, cy, r) { ctx.beginPath(); for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i), px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
    function lattice(cx, cy, r, stroke, lw) {
      var cs = 1.5 * r, rs = Math.sqrt(3) * r, n = 3; ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      for (var c = -n; c <= n; c++) for (var rr = -n; rr <= n; rr++) { var x = cx + c * cs, y = cy + rr * rs + (((c % 2) + 2) % 2 ? rs / 2 : 0); hexPath(x, y, r - 0.6); ctx.stroke(); }
    }

    function render(t) {
      ctx.fillStyle = rgba(NOCHE, 1); ctx.fillRect(0, 0, W, H);
      for (var si = 0; si < stars.length; si++) { var s = stars[si], tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p)); ctx.fillStyle = rgba(COBL, 0.16 * tw); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill(); }

      var period = 8.5, band = W * 0.19, waveX = ((t / period) % 1) * (W + 2 * band) - band;
      var bg = ctx.createLinearGradient(waveX - band, 0, waveX + band * 0.7, 0);
      bg.addColorStop(0, rgba(COB, 0)); bg.addColorStop(0.6, rgba(COB, 0.06)); bg.addColorStop(0.86, rgba(COBL, 0.10)); bg.addColorStop(1, rgba(COBL, 0));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      var cx0 = W * 0.5, cy0 = H * 0.5, cols = Math.ceil(W / colStep) + 2, rows = Math.ceil(H / rowStep) + 2;
      ctx.globalCompositeOperation = 'lighter';
      for (var c = -1; c < cols; c++) {
        for (var r = -1; r < rows; r++) {
          var cx = c * colStep, cy = r * rowStep + (c % 2 ? rowStep / 2 : 0);
          if (cx < -R || cx > W + R || cy < -R || cy > H + R) continue;
          var dx = (cx - cx0) / (W * 0.72), dy = (cy - cy0) / (H * 0.72), vign = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 0.8);
          if (vign <= 0.02) continue;
          var fv = field(cx, cy, t), dd = (cx - waveX) / band, wave = Math.exp(-dd * dd * 2.0);
          var seam = Math.exp(-Math.pow((cx - (waveX + band * 0.35)) / (band * 0.18), 2)) * 0.9;
          var lit = Math.min(1, (wave * (0.5 + 0.5 * fv) + seam * 0.4) * vign);
          hexPath(cx, cy, R - 1); ctx.strokeStyle = rgba(mix(COB, COBL, lit), (0.10 + 0.85 * lit) * vign); ctx.lineWidth = 1.1; ctx.stroke();
          if (lit > 0.4) { ctx.fillStyle = rgba(COBL, (lit - 0.4) * 0.14); ctx.fill(); }
          if (lit > 0.20) {
            var res = Math.min(1, (lit - 0.20) / 0.45);
            ctx.save(); hexPath(cx, cy, R - 1); ctx.clip();
            lattice(cx, cy, CR, rgba(mix(COB, COBL, 0.85), 0.55 * res * vign), 0.9);
            if (res > 0.5) { var g = (res - 0.5) / 0.5; lattice(cx, cy, GR, rgba(COBL, 0.34 * g * vign), 0.6); }
            ctx.restore();
          }
          if (lit > 0.7) { ctx.fillStyle = rgba(LUZ, (lit - 0.7) * 1.6 * vign); ctx.beginPath(); ctx.arc(cx, cy, 2.0, 0, 6.283); ctx.fill(); }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    var q = new URLSearchParams(location.search).get('scanT');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var FIXED = q !== null ? parseFloat(q) : (reduce ? 2.6 : null);
    window.addEventListener('resize', function () { resize(); if (FIXED !== null) render(FIXED); });
    if (FIXED !== null) { render(FIXED); return; }

    var t0 = null, raf = 0, running = false;
    function loop(now) { if (!running) return; if (t0 === null) t0 = now; render((now - t0) / 1000); raf = requestAnimationFrame(loop); }
    function start() { if (running) return; running = true; t0 = null; raf = requestAnimationFrame(loop); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }
    if ('IntersectionObserver' in window) { new IntersectionObserver(function (es) { es.forEach(function (e) { e.isIntersecting ? start() : stop(); }); }, { threshold: 0.05 }).observe(cv); } else start();
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  }
  window.initMallaScanner = initMallaScanner;
})();
