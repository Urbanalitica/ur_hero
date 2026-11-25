/* Áreas verdes del Valle de México (77 municipios, 3 estados) — mismo método en todo el valle:
   OSM clasificado + satélite (Sentinel-2) + copa (Meta/WRI) + Censo 2020. Google Maps JavaScript API. */
(function () {
  "use strict";

  var DATA = "data/zmvm/";
  var VER = "?v=20261124a";

  /* Analítica sin cookies (GoatCounter). Sólo cuenta visitas y qué se usa de la página:
     capas, opciones, municipio elegido, descargas. Nunca coordenadas, IP ni datos de la persona.
     Sin código en config.js no se carga nada. GoatCounter no cuenta visitas desde localhost. */
  (function () {
    var cod = window.UR_GOATCOUNTER;
    if (!cod || !/^[a-z0-9-]+$/.test(cod)) return;
    var t = document.createElement("script");
    t.async = true; t.src = "https://gc.zgo.at/count.js";
    t.setAttribute("data-goatcounter", "https://" + cod + ".goatcounter.com/count");
    document.head.appendChild(t);
  })();
  var medir = function (ev) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "areas-verdes/" + ev, title: ev, event: true }); } catch (e) { /* nada */ }
  };
  var C = { verde: "#5A6E3A", negro: "#000000", blanco: "#ffffff", ocre: "#C4933B" };
  var ESTILO = {
    publico: { fillColor: "#5E8C5A", fillOpacity: 0.85, strokeColor: "#D6E8C2", strokeWeight: 1, zIndex: 5 },
    vial: { fillColor: "#A8C686", fillOpacity: 0.9, strokeColor: "#A8C686", strokeWeight: 1, zIndex: 4 },
    restringido: { fillColor: "#C8D3B5", fillOpacity: 0.7, strokeColor: "#5A6E3A", strokeWeight: 0.8, zIndex: 3 },
  };
  var RAMPA_COPA = [[5, "#EDE6CF"], [10, "#D3D9B0"], [20, "#A3BC7E"], [30, "#6E9655"], [101, "#3D6131"]];
  var ROTULO = { publico: "Espacio público verde", vial: "Camellón o glorieta", restringido: "Verde de acceso restringido", naturales: "Cerro, barranca, bosque o campo" };
  var ESTADO_CORTO = { "09": "CDMX", "15": "Edomex", "13": "Hidalgo" };
  var ETIQUETA_UMBRAL = {
    publico: "un espacio público verde",
    publico_05ha: "un espacio público verde de 0.5 ha o más",
    publico_naturales: "un espacio público verde, cerro, barranca, bosque o campo",
    publico_naturales_vial: "un espacio público verde, cerro, barranca, bosque, camellón o glorieta",
    todo_verde: "algo verde (parque, cerro, camellón, arboleda o mancha que ve el satélite)",
  };

  var estado = {
    capas: { publico: false, naturales: false, vial: false, restringido: false, verde: false, inventario: false, copaRaster: false, verdeHex: false, copa: false, delicada: false, hueco: true, estados: true, municipios: true, densidad: false, copaHab: true },
    umbral: "publico_naturales", indicador: "copa_pct", imagen: "carto_claro", filtro: "", munSel: null,
  };
  var ind = null, map = null, capasData = {}, mosaicos = {}, objetivos = { publico: [], vial: [], naturales: [] };
  var nombreMun = {}, marcaUbic = null, circuloUbic = null, atribEsri = null, cargados = {};

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n, d) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("es-MX", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var colorCopa = function (v) { for (var i = 0; i < RAMPA_COPA.length; i++) if (v < RAMPA_COPA[i][0]) return RAMPA_COPA[i][1]; return RAMPA_COPA[RAMPA_COPA.length - 1][1]; };
  var RAMPA_VHEX = [[5, "#E8DFC0"], [10, "#D3D9B0"], [20, "#A3BC7E"], [40, "#6E9655"], [60, "#3D6131"], [1e9, "#24401D"]];
  var colorVHex = function (v) { for (var i = 0; i < RAMPA_VHEX.length; i++) if (v < RAMPA_VHEX[i][0]) return RAMPA_VHEX[i][1]; };
  /* filtros de las leyendas: rango [desde, hasta) en índices de clase de color */
  var binDe = function (rampa, v) { for (var i = 0; i < rampa.length; i++) if (v < rampa[i][0]) return i; return rampa.length - 1; };
  /* m² de copa por habitante en cada hexágono (≥ 50 hab): rojo lo más rezagado, verde lo más alto */
  var RAMPA_COPAHAB = [[1, "#B2182B"], [3, "#EF8A62"], [6, "#FDDBC7"], [12, "#D9F0D3"], [25, "#7FBF7B"], [1e9, "#1B7837"]];
  var BIN = {
    copaHab: function (f) { return binDe(RAMPA_COPAHAB, f.getProperty("copa_hab") || 0); },
    copa: function (f) { return binDe(RAMPA_COPA, f.getProperty("copa") || 0); },
    verdeHex: function (f) { return binDe(RAMPA_VHEX, f.getProperty("verde_pct") || 0); },
    hueco: function (f) { return f.getProperty("banda") || 0; },
    delicada: function (f) { var v = f.getProperty("verde_vec"); return Math.max(0, Math.min(3, Math.floor((10 - (v == null ? 10 : v)) / 2.5))); }
  };
  var filtro = { copa: [0, 5], verdeHex: [0, 6], delicada: [0, 4], hueco: [0, 4], densidad: [0, 6], copaHab: [0, 6] };
  var pasa = function (k, f) { var b = BIN[k](f); return b >= filtro[k][0] && b < filtro[k][1]; };
  /* gravedad: verde en el entorno 10 % (amarillo) → 0 % (rojo) */
  var GRAV = [[0, [179, 29, 24]], [2.5, [214, 64, 28]], [5, [235, 120, 30]], [7.5, [242, 165, 40]], [10, [245, 205, 60]]];
  var colorGravedad = function (v) {
    v = Math.max(0, Math.min(10, v == null ? 10 : v));
    for (var i = 1; i < GRAV.length; i++) if (v <= GRAV[i][0]) {
      var a = GRAV[i - 1], b = GRAV[i], t = (v - a[0]) / (b[0] - a[0]);
      return "rgb(" + a[1].map(function (x, k) { return Math.round(x + t * (b[1][k] - x)); }).join(",") + ")";
    }
    return "rgb(245,205,60)";
  };
  var ha = function (m2hab, pob) { return m2hab == null ? null : m2hab * pob / 1e4; };

  /* ---------------------------------------------------------- indicadores */
  function pintarIndicadores() {
    var t = ind.total;
    ind.municipios.forEach(function (m) { nombreMun[m.cve] = m.municipio; });
    if ($("kMun")) $("kMun").textContent = fmt(t.municipios);
    $("kPob").textContent = fmt(t.pob / 1e6, 1);
    if ($("kSinPct")) $("kSinPct").textContent =fmt(t.pct_sin_publico_naturales, 0) + " %";
    $("kCopa").textContent = fmt(t.copa_pct, 1) + " %";
    $("nVerdeSat").textContent = fmt(t.pct_verde_ciudad, 0) + " % de la ciudad";
    if (t.pob_delicada != null) $("nDelicada").textContent = fmt(t.pob_delicada / 1e6, 2) + " M hab";
    if ($("kSinTodo")) $("kSinTodo").textContent = fmt(t.pct_sin_todo_verde, 1) + " %";
    $("kDelicada").textContent = t.pob_delicada >= 1e6 ? fmt(t.pob_delicada / 1e6, 1) + " millones de" : fmt(t.pob_delicada / 1e3, 0) + " mil";
    var f = ind.fuentes;
    $("fuentes").textContent = "Fuentes: " + Object.keys(f).map(function (k) { return f[k]; }).join(" · ") + ".";
    pintarEstados(); pintarBarras();
  }

  function pintarEstados() {
    var k = "pct_sin_" + estado.umbral, tb = $("tablaEstados").querySelector("tbody");
    tb.innerHTML = "";
    ind.estados.concat([Object.assign({ cve: "", estado: "Valle de México" }, ind.total)]).forEach(function (r) {
      var tr = document.createElement("tr");
      if (!r.cve) tr.className = "tabla__total";
      tr.innerHTML = "<td>" + esc(ESTADO_CORTO[r.cve] || r.estado) + "</td><td>" + fmt(r.m2hab_publico, 1) + "</td><td>" + fmt(r[k], 0) + " %</td>";
      tb.appendChild(tr);
    });
    var tc = $("tablaCopa").querySelector("tbody");
    tc.innerHTML = "";
    ind.estados.concat([Object.assign({ cve: "", estado: "Valle de México" }, ind.total)]).forEach(function (r) {
      var tr = document.createElement("tr");
      if (!r.cve) tr.className = "tabla__total";
      tr.innerHTML = "<td>" + esc(ESTADO_CORTO[r.cve] || r.estado) + "</td><td>" + fmt(r.copa_pct, 1) + " %</td><td>" + fmt(r.m2hab_copa, 1) + "</td><td>" + (r.pob_copa_5 >= 1e6 ? fmt(r.pob_copa_5 / 1e6, 1) + " M" : fmt(r.pob_copa_5 / 1e3, 0) + " mil") + "</td><td>" + fmt(r.pct_copa_5, 1) + " %</td><td>" + fmt(Math.max(0, r.pct_copa_baja - r.pct_copa_5), 1) + " %</td><td>" + fmt(Math.max(0, 100 - r.pct_copa_baja - r.pct_copa_30), 1) + " %</td><td>" + fmt(r.pct_copa_30, 1) + " %</td>";
      tc.appendChild(tr);
    });
    $("notaCopa").textContent = "Árboles de 3 m o más en los hexágonos donde vive gente. «Copa donde vive la gente» promedia cada hexágono según cuánta gente vive ahí. Los m² de copa por habitante suman la copa de esos hexágonos y la dividen entre su población. Las cuatro últimas columnas reparten a toda la gente según la copa de su hexágono y suman 100 %: menos de 5 %, de 5 a 10 %, de 10 a 30 % y 30 % o más, la meta de la regla 3-30-300.";
    $("notaEstados").textContent = "Sólo la parte de cada estado que cae en el valle. «Sin verde a 300 m» cuenta espacio público verde, cerros, barrancas, bosques y el campo que rodea la ciudad.";
  }

  var NOTA_IND = {
    copa_pct: "Superficie con árboles de 3 m o más en los hexágonos donde vive gente, ponderada por población. La meta 3-30-300 es 30 %.",
    m2hab_publico: "Parques, jardines, plazas, juegos y deportivos de acceso público, entre la población del municipio.",
    m2hab_verde_sat: "Todo lo que el satélite ve verde (NDVI ≥ 0.30) dentro de los hexágonos habitados, público o privado, entre la población.",
    pct_sin: "Población cuya manzana queda a más de 300 m en línea recta de un espacio público verde, cerro, barranca, bosque o campo (cultivo o monte fuera de la ciudad).",
    pob_delicada: "Personas que viven donde lo verde no llega a 5 % de su entorno (su hexágono y los seis de alrededor).",
    verde300: "Qué parte del entorno de cada casa es verde (su hexágono y los seis de alrededor, unos 4 minutos a pie), contando todo: parques, camellones, barrancas, arboledas y lo que ve el satélite. Sólo mira alrededor de donde vive la gente, no la superficie total del municipio; cada persona pesa igual.",
  };

  function claveIndicador() { return estado.indicador === "pct_sin" ? "pct_sin_" + estado.umbral : estado.indicador; }

  function pintarBarras() {
    var k = claveIndicador(), unidad = k.indexOf("pct") === 0 || k === "copa_pct" || k === "verde300" ? " %" : "";
    var desc = k === "copa_pct" || k === "verde300" || k.indexOf("m2hab") === 0;
    var filas = ind.municipios.filter(function (r) { return !estado.filtro || r.cve.slice(0, 2) === estado.filtro; })
      .sort(function (a, b) { return desc ? (a[k] || 0) - (b[k] || 0) : (b[k] || 0) - (a[k] || 0); });
    var max = Math.max.apply(null, filas.map(function (r) { return r[k] || 0; })) || 1;
    var ol = $("barras"); ol.innerHTML = "";
    filas.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "barra" + (estado.munSel === r.cve ? " barra--destacada" : "");
      li.tabIndex = 0;
      var v = r[k] || 0, cifra = k === "pob_delicada" ? fmt(v / 1000, 0) + " mil" : fmt(v, v < 10 ? 1 : 0) + unidad;
      var est = estado.filtro ? "" : ' <span class="barra__estado">' + ESTADO_CORTO[r.cve.slice(0, 2)] + "</span>";
      li.innerHTML = '<span class="barra__nombre" title="' + esc(r.municipio) + '">' + esc(r.municipio) + est + '</span><span class="barra__pista"><span class="barra__valor" style="display:block;width:' + (100 * v / max).toFixed(1) + '%"></span></span><span class="barra__cifra">' + cifra + "</span>";
      li.addEventListener("click", function () { irMunicipio(r.cve); });
      li.addEventListener("keydown", function (e) { if (e.key === "Enter") irMunicipio(r.cve); });
      ol.appendChild(li);
    });
    var tot = ind.total[k];
    $("notaIndicador").textContent = NOTA_IND[estado.indicador] + (tot != null ? " Valle de México: " + (k === "pob_delicada" ? fmt(tot / 1e6, 2) + " millones" : fmt(tot, 1) + unidad) + "." : "");
  }

  /* ---------------------------------------------------------- mapa */
  function cargarGoogle(key) {
    return new Promise(function (ok, mal) {
      if (!key) { mal(new Error("sin llave")); return; }
      window.gm_authFailure = function () { avisar("Google Maps rechazó la llave en este dominio. Revisa la restricción por referrer."); };
      window.__urGm = function () { ok(); };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&v=weekly&language=es&region=MX&loading=async&callback=__urGm";
      s.async = true; s.onerror = function () { mal(new Error("no cargó")); };
      document.head.appendChild(s);
    });
  }
  function avisar(txt) { var a = $("mapaAviso"); a.textContent = txt; a.hidden = false; }

  /* Mosaico de teselas propias z 9–14; más allá de 14 reescala la tesela padre. */
  function Mosaico(nombre, opacidad) {
    this.tileSize = new google.maps.Size(256, 256); this.maxZoom = 21; this.minZoom = 9; this.name = nombre; this.op = opacidad;
  }
  Mosaico.prototype.getTile = function (c, z, doc) {
    var d = doc.createElement("div"); d.style.cssText = "width:256px;height:256px;overflow:hidden;position:relative;opacity:" + this.op;
    if (z < 9) return d;
    var zz = Math.min(z, 14), f = Math.pow(2, z - zz), x = Math.floor(c.x / f), y = Math.floor(c.y / f);
    var img = doc.createElement("img");
    img.src = DATA + "teselas/" + this.name + "/" + zz + "/" + x + "/" + y + ".png";
    img.onerror = function () { img.remove(); };
    img.style.cssText = "position:absolute;image-rendering:" + (f > 1 ? "pixelated" : "auto") + ";width:" + 256 * f + "px;height:" + 256 * f + "px;left:" + (-(c.x - x * f) * 256) + "px;top:" + (-(c.y - y * f) * 256) + "px";
    img.alt = "";
    d.appendChild(img);
    return d;
  };
  Mosaico.prototype.releaseTile = function () {};

  /* Densidad de población: hexágonos pintados por tesela, debajo de los mosaicos de verde y copa */
  var DENS = [[25, "#2166AC"], [75, "#67A9CF"], [150, "#D1E5F0"], [225, "#FDDBC7"], [300, "#EF8A62"], [1e9, "#B2182B"]];
  var colorDens = function (v) { for (var i = 0; i < DENS.length; i++) if (v < DENS[i][0]) return DENS[i][1]; };
  var densHex = null;
  function mundo(lat, lng) {
    var s = Math.sin(lat * Math.PI / 180);
    return [(lng + 180) / 360 * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256];
  }
  function CapaDens() { this.tileSize = new google.maps.Size(256, 256); this.name = "densidad"; this.maxZoom = 21; }
  CapaDens.prototype.getTile = function (c, z, doc) {
    var cv = doc.createElement("canvas"); cv.width = cv.height = 256;
    if (!densHex) return cv;
    var k = Math.pow(2, z), x0 = c.x * 256 / k, y0 = c.y * 256 / k, x1 = x0 + 256 / k, y1 = y0 + 256 / k, g = cv.getContext("2d");
    g.globalAlpha = 0.85;
    var fd = filtro.densidad;
    densHex.forEach(function (h) {
      if (h.k < fd[0] || h.k >= fd[1]) return;
      if (h.b[2] < x0 || h.b[0] > x1 || h.b[3] < y0 || h.b[1] > y1) return;
      g.beginPath();
      h.p.forEach(function (q, i) { var px = (q[0] - x0) * k, py = (q[1] - y0) * k; i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.closePath(); g.fillStyle = h.c; g.fill();
    });
    return cv;
  };
  CapaDens.prototype.releaseTile = function () {};
  /* Capas de hexágonos en canvas (copa por hab., copa, verde por hexágono y sin verde a 300 m).
     Antes eran capas de Google con un polígono por hexágono (18,000 a 21,700 cada una) y el
     teléfono se quedaba sin memoria. Cada color va en un solo trazo: sin costuras entre celdas. */
  function CapaCanvas(nombre, items, estilo) { this.tileSize = new google.maps.Size(256, 256); this.name = nombre; this.maxZoom = 21; this.items = items; this.estilo = estilo; }
  CapaCanvas.prototype.getTile = function (c, z, doc) {
    var cv = doc.createElement("canvas"); cv.width = cv.height = 256;
    var its = this.items();
    if (!its) return cv;
    var k = Math.pow(2, z), x0 = c.x * 256 / k, y0 = c.y * 256 / k, x1 = x0 + 256 / k, y1 = y0 + 256 / k, g = cv.getContext("2d");
    var grupos = {}, est = this.estilo;
    its.forEach(function (h) {
      if (h.b[2] < x0 || h.b[0] > x1 || h.b[3] < y0 || h.b[1] > y1) return;
      var e = est(h);
      if (!e) return;
      var key = e.c + "|" + e.a + "|" + (e.s || "");
      (grupos[key] = grupos[key] || { e: e, hs: [] }).hs.push(h);
    });
    Object.keys(grupos).forEach(function (key) {
      var G = grupos[key];
      g.beginPath();
      G.hs.forEach(function (h) { h.p.forEach(function (q, i) { var px = (q[0] - x0) * k, py = (q[1] - y0) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); });
      g.globalAlpha = G.e.a; g.fillStyle = G.e.c; g.fill();
      if (G.e.s && z >= 12) { g.globalAlpha = 0.5; g.strokeStyle = G.e.s; g.lineWidth = 0.6; g.stroke(); }
    });
    return cv;
  };
  CapaCanvas.prototype.releaseTile = function () {};
  var hexGeo = null, huecoGeo = null;
  function shim(p) { return { getProperty: function (k) { return p[k]; } }; }
  function geoDe(anillo) {
    var pts = anillo.map(function (q) { return mundo(q[1], q[0]); });
    var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
    return { p: pts, b: [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)] };
  }
  function prepararHexCanvas(gj) {
    hexGeo = gj.features.map(function (f) { var g = geoDe(f.geometry.coordinates[0]); g.prop = f.properties; g.f = shim(f.properties); return g; });
    ["copaHab", "copa", "verdeHex"].forEach(refrescar);
  }
  function prepararHuecoCanvas() {
    if (!huecoData || huecoGeo) return;
    huecoGeo = [];
    huecoData.celdas.forEach(function (cs, k) {
      window.h3.uncompactCells(cs, huecoData.res).forEach(function (c) {
        var g = geoDe(window.h3.cellToBoundary(c, true)); g.f = shim({ banda: k }); g.banda = k; huecoGeo.push(g);
      });
    });
    refrescar("hueco");
  }
  function refrescar(k) { if (map && estado.capas[k]) { overlay(k, false); overlay(k, true); } }
  function prepararDens(gj) {
    densHex = gj.features.filter(function (f) { return f.properties.pob > 0; }).map(function (f) {
      var p = f.geometry.coordinates[0].map(function (q) { return mundo(q[1], q[0]); });
      var xs = p.map(function (q) { return q[0]; }), ys = p.map(function (q) { return q[1]; });
      var d = f.properties.dens || 0, k = 0;
      while (k < DENS.length - 1 && d >= DENS[k][0]) k++;
      return { p: p, k: k, c: colorDens(d), b: [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)] };
    });
    if (estado.capas.densidad) { overlay("densidad", false); overlay("densidad", true); }
  }

  function iniciarMapa() {
    map = new google.maps.Map($("mapa"), {
      center: { lat: 19.45, lng: -99.1 }, zoom: 10, minZoom: 9, maxZoom: 21,
      mapTypeId: "hybrid", tilt: 0, heading: 0, mapTypeControl: false,
      streetViewControl: true, streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      fullscreenControl: false, rotateControl: false, clickableIcons: false, gestureHandling: "greedy",
      restriction: { latLngBounds: { north: 20.3, south: 18.7, east: -98.3, west: -100.1 }, strictBounds: false },
    });
    map.mapTypes.set("esri", new google.maps.ImageMapType({
      name: "Esri", maxZoom: 19, tileSize: new google.maps.Size(256, 256),
      getTileUrl: function (c, z) { return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + c.y + "/" + c.x; },
    }));
    // Fondos CARTO (OpenStreetMap): claro, oscuro y Voyager. Sin llave CARTO no se ofrecen.
    if (!window.UR_CARTO_KEY) {
      document.querySelectorAll("input[name=imagen][value^=carto_]").forEach(function (i) { i.parentNode.hidden = true; });
      if (estado.imagen.indexOf("carto_") === 0) { estado.imagen = "hybrid"; document.querySelector("input[name=imagen][value=hybrid]").checked = true; }
    }
    else [["carto_claro", "rastertiles/light_all"], ["carto_oscuro", "rastertiles/dark_all"], ["carto_voyager", "rastertiles/voyager"]].forEach(function (b) {
      map.mapTypes.set(b[0], new google.maps.ImageMapType({
        name: b[0], maxZoom: 20, tileSize: new google.maps.Size(256, 256),
        getTileUrl: function (c, z) { return "https://basemaps.cartocdn.com/" + b[1] + "/" + z + "/" + c.x + "/" + c.y + "@2x.png?key=" + encodeURIComponent(window.UR_CARTO_KEY); },
      }));
    });
    atribEsri = document.createElement("div");
    atribEsri.style.cssText = "background:rgba(255,255,255,.85);font:11px Arial,sans-serif;padding:2px 6px;margin:0 0 2px 0;display:none";
    atribEsri.textContent = "Imágenes: Esri, Maxar, Earthstar Geographics";
    map.controls[google.maps.ControlPosition.BOTTOM_RIGHT].push(atribEsri);
    mosaicos.verde = new Mosaico("verde", 0.9);
    mosaicos.copaRaster = new Mosaico("copa", 0.9);
    mosaicos.densidad = new CapaDens();
    mosaicos.copaHab = new CapaCanvas("copaHab", function () { return hexGeo; }, function (h) {
      return h.prop.copa_hab != null && pasa("copaHab", h.f) ? { c: RAMPA_COPAHAB[BIN.copaHab(h.f)][1], a: 0.8, s: "#FFFFFF" } : null;
    });
    mosaicos.copa = new CapaCanvas("copa", function () { return hexGeo; }, function (h) {
      return h.prop.copa != null && pasa("copa", h.f) ? { c: colorCopa(h.prop.copa), a: 0.78 } : null;
    });
    mosaicos.verdeHex = new CapaCanvas("verdeHex", function () { return hexGeo; }, function (h) {
      return h.prop.verde_pct != null && pasa("verdeHex", h.f) ? { c: colorVHex(h.prop.verde_pct), a: 0.8, s: "#FFFFFF" } : null;
    });
    mosaicos.hueco = new CapaCanvas("hueco", function () { return huecoGeo; }, function (h) {
      return pasa("hueco", h.f) ? { c: C.negro, a: HUECO_OPAC[h.banda] || 0.5 } : null;
    });

    ["municipios", "estados", "hueco", "verdeHex", "copa", "copaHab", "delicada", "naturales", "restringido", "verde", "inv"].forEach(function (k) { capasData[k] = new google.maps.Data(); });
    capasData.municipios.setStyle({ fillOpacity: 0, strokeColor: C.blanco, strokeWeight: 1, strokeOpacity: 0.75, clickable: false, zIndex: 0 });
    capasData.estados.setStyle(function (f) {
      var e = f.getProperty("tipo") === "estatal";
      return { strokeColor: C.negro, strokeWeight: e ? 4 : 2, strokeOpacity: 1, clickable: false, zIndex: 9, icons: null };
    });
    capasData.naturales.setStyle({ fillColor: "#2F4A22", fillOpacity: 0.6, strokeColor: "#8FB47A", strokeWeight: 1, clickable: true, zIndex: 1 });
    capasData.restringido.setStyle(Object.assign({ clickable: true }, ESTILO.restringido));
    capasData.inv.setStyle({ fillOpacity: 0, strokeColor: "#D6E8C2", strokeWeight: 1.5, clickable: false, zIndex: 8 });
    capasData.copa.setStyle(function (f) {
      var v = f.getProperty("copa");
      return { visible: v != null && pasa("copa", f), fillColor: colorCopa(v == null ? 0 : v), fillOpacity: 0.78, strokeWeight: 0, clickable: true, zIndex: 0 };
    });
    capasData.copaHab.setStyle(function (f) {
      var v = f.getProperty("copa_hab");
      return { visible: v != null && pasa("copaHab", f), fillColor: RAMPA_COPAHAB[BIN.copaHab(f)][1], fillOpacity: 0.8, strokeColor: "#FFFFFF", strokeWeight: 0.3, strokeOpacity: 0.5, clickable: true, zIndex: 1 };
    });
    capasData.verdeHex.setStyle(function (f) {
      var v = f.getProperty("verde_pct");
      return { visible: v != null && pasa("verdeHex", f), fillColor: colorVHex(v == null ? 0 : v), fillOpacity: 0.8, strokeColor: "#FFFFFF", strokeWeight: 0.3, strokeOpacity: 0.5, clickable: true, zIndex: 0 };
    });
    capasData.delicada.setStyle(function (f) {
      var d = f.getProperty("delicada"), v = f.getProperty("verde_vec");
      var c = colorGravedad(v);
      return { visible: d > 0 && pasa("delicada", f), fillColor: c, fillOpacity: d === 2 ? 0.55 : 0.35, strokeColor: c, strokeWeight: d === 2 ? 2 : 1, strokeOpacity: 1, clickable: true, zIndex: 7 };
    });
    estiloVerde(); estiloHueco();

    capasData.municipios.loadGeoJson(DATA + "municipios.geojson" + VER);
    capasData.estados.loadGeoJson(DATA + "estados.geojson" + VER);
    fetch(DATA + "sin_cobertura_300m_h3.json" + VER).then(function (r) { return r.json(); }).then(function (d) { return conH3(function () { huecoData = d; prepararHuecoCanvas(); }); });
    /* las capas vectoriales (espacio público, cerros, camellones, restringido) ya no se publican:
       las zonas críticas y «Sin verde a 300 m» se midieron con ellas y las resumen */

    capasData.verde.addListener("click", function (e) { abrirFicha(propiedades(e.feature), e.latLng); });
    capasData.restringido.addListener("click", function (e) { abrirFicha(propiedades(e.feature), e.latLng); });
    capasData.naturales.addListener("click", function (e) { var p = propiedades(e.feature); p.cls = "naturales"; abrirFicha(p, e.latLng); });
    capasData.delicada.addListener("click", function (e) { abrirHex(propiedades(e.feature), e.latLng); });
    map.addListener("click", function (e) {
      var s = estado.capas, la = e.latLng.lat(), ln = e.latLng.lng();
      var p = (s.copaHab || s.copa || s.verdeHex) && window.h3 ? hexPorId[window.h3.latLngToCell(la, ln, 9)] : null;
      var f = p && shim(p);
      if (p && ((s.copaHab && p.copa_hab != null && pasa("copaHab", f)) || (s.copa && p.copa != null && pasa("copa", f)) || (s.verdeHex && p.verde_pct != null && pasa("verdeHex", f)))) { abrirHex(p, e.latLng); return; }
      evaluarPunto(la, ln, false);
    });
    aplicarVisibilidad();
    if (/[?&]debug\b/.test(location.search)) window.__av = { map: map, capas: capasData, objetivos: objetivos, estado: estado, evaluarPunto: evaluarPunto, abrirFicha: abrirFicha, aplicar: aplicarVisibilidad };
  }

  // h3-js se baja una sola vez y dibuja los hexágonos a partir de su clave
  var h3Promesa = null;
  function conH3(fn) {
    if (!h3Promesa) h3Promesa = new Promise(function (ok, mal) {
      var t = document.createElement("script");
      t.src = "https://cdn.jsdelivr.net/npm/h3-js@4.1.0/dist/h3-js.umd.js";
      t.onload = function () { ok(window.h3); };
      t.onerror = mal;
      document.head.appendChild(t);
    });
    return h3Promesa.then(fn);
  }
  // «sin verde a 300 m» (espacio público + cerros, barrancas y bosques): celdas res 10 compactadas en bandas de distancia
  // al verde (300–500, 500–750, 750–1000, más de 1000 m); el negro se hace más fuerte mientras más lejos
  var HUECO_OPAC = [0.3, 0.48, 0.66, 0.84];
  var huecoData = null, huecoPintado = false, hexPorId = {}, huecoBanda = null;
  function pintarHueco() {
    if (!huecoData || huecoPintado) return;
    huecoPintado = true;
    (huecoData.celdas || []).forEach(function (celdas, k) {
      if (!celdas.length) return;
      var polys = window.h3.cellsToMultiPolygon(window.h3.uncompactCells(celdas, huecoData.res), true);
      capasData.hueco.addGeoJson({ type: "Feature", properties: { banda: k }, geometry: { type: "MultiPolygon", coordinates: polys } });
    });
  }

  function cargarUnaVez(clave, fn) { if (!cargados[clave]) { cargados[clave] = true; fn(); } }

  function propiedades(f) { var p = {}; f.forEachProperty(function (v, k) { p[k] = v; }); return p; }
  function estiloVerde() {
    capasData.verde.setStyle(function (f) {
      var c = f.getProperty("cls");
      return Object.assign({}, ESTILO[c], { visible: !!estado.capas[c], clickable: true });
    });
  }
  function estiloHueco() {
    capasData.hueco.setStyle(function (f) {
      return { visible: pasa("hueco", f), fillColor: C.negro, fillOpacity: HUECO_OPAC[f.getProperty("banda")] || 0.5, strokeWeight: 0, clickable: false, zIndex: 0 };
    });
  }
  var ORDEN_OV = ["densidad", "verde", "copaRaster", "hueco", "verdeHex", "copa", "copaHab"];
  function claveDe(m) { for (var q in mosaicos) if (mosaicos[q] === m) return q; return null; }
  function overlay(k, on) {
    var arr = map.overlayMapTypes, i = arr.getArray().indexOf(mosaicos[k]);
    if (!on && i >= 0) arr.removeAt(i);
    if (on && i < 0) {
      var r = ORDEN_OV.indexOf(k), pos = 0;
      arr.getArray().forEach(function (m, j) { if (ORDEN_OV.indexOf(claveDe(m)) < r) pos = j + 1; });
      arr.insertAt(pos, mosaicos[k]);
    }
  }
  /* Cada capa de hexágonos recibe sólo lo que dibuja y sólo al prenderse la primera vez:
     antes las cuatro cargaban los 21,700 hexágonos y el teléfono se quedaba sin memoria. */
  var hexGJ = null, hexLleno = {};
  var HEX_FILTRO = { delicada: function (p) { return p.delicada > 0; } };
  function llenarHex() {
    if (!hexGJ) return;
    Object.keys(HEX_FILTRO).forEach(function (k) {
      if (!estado.capas[k] || hexLleno[k]) return;
      hexLleno[k] = true;
      capasData[k].addGeoJson({ type: "FeatureCollection", features: hexGJ.features.filter(function (f) { return HEX_FILTRO[k](f.properties); }) });
    });
  }
  function aplicarVisibilidad() {
    var s = estado.capas;
    llenarHex();
    /* re-estilar obliga a Google a redibujar todos los polígonos: sólo cuando cambia algo que el estilo usa */
    var firmaV = JSON.stringify([s.publico, s.naturales, s.vial, s.restringido]), firmaH = JSON.stringify(filtro.hueco);
    if (firmaV !== aplicarVisibilidad.v) { aplicarVisibilidad.v = firmaV; estiloVerde(); }
    if (firmaH !== aplicarVisibilidad.h) { aplicarVisibilidad.h = firmaH; refrescar("hueco"); }
    cargarUnaVez("hex", function () { // siempre: también alimenta «Tu derecho a 300 metros»
      fetch(DATA + "hex.json" + VER).then(function (r) { return r.json(); }).then(function (d) {
        return conH3(function (h3) {
          var gj = { type: "FeatureCollection", features: d.filas.map(function (r) {
            var p = {};
            d.cols.forEach(function (k, i) { p[k] = r[i]; });
            p.copa_hab = p.pob >= 50 && p.copa != null ? Math.round(p.copa / 100 * 121115 / p.pob * 10) / 10 : null;
            return { type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [h3.cellToBoundary(p.h, true)] } };
          }) };
          gj.features.forEach(function (f) { hexPorId[f.properties.h] = f.properties; });
          hexGJ = gj; llenarHex(); prepararHexCanvas(gj);
          prepararDens(gj);
        });
      });
    });
    if (s.restringido) cargarUnaVez("restringido", function () { capasData.restringido.loadGeoJson(DATA + "restringido.geojson" + VER); });
    if (s.inventario) cargarUnaVez("inv", function () { capasData.inv.loadGeoJson("data/inventario.geojson"); });
    ["naturales", "delicada", "restringido", "estados", "municipios"].forEach(function (k) { capasData[k].setMap(s[k] ? map : null); });
    overlay("hueco", s.hueco); overlay("verdeHex", s.verdeHex); overlay("copa", s.copa); overlay("copaHab", s.copaHab);
    capasData.verde.setMap(s.publico || s.vial ? map : null);
    capasData.inv.setMap(s.inventario ? map : null);
    overlay("densidad", s.densidad); overlay("verde", s.verde); overlay("copaRaster", s.copaRaster);
    $("leyendaCopa").hidden = !(s.copa || s.copaRaster);
    document.querySelector("[data-rango=copa]").hidden = !s.copa; // el filtro sólo aplica a hexágonos
    $("leyendaVerde").hidden = !s.verde;
    $("leyendaVHex").hidden = !s.verdeHex;
    $("leyendaDelicada").hidden = !s.delicada;
    $("leyendaHueco").hidden = !s.hueco;
    $("leyendaDens").hidden = !s.densidad;
    $("leyendaCopaHab").hidden = !s.copaHab;
    $("leyendas").hidden = !document.querySelector("#leyendas > .leyenda-copa:not([hidden])");
    map.setMapTypeId(estado.imagen);
    var carto = estado.imagen.indexOf("carto_") === 0;
    atribEsri.textContent = carto ? "© OpenStreetMap · © CARTO" : "Imágenes: Esri, Maxar, Earthstar Geographics";
    atribEsri.style.display = estado.imagen === "esri" || carto ? "block" : "none";
  }

  function irMunicipio(cve) {
    estado.munSel = cve; medir("municipio/" + cve); pintarBarras();
    if (!map) return;
    var b = new google.maps.LatLngBounds(), hay = false;
    capasData.municipios.forEach(function (f) {
      if (f.getProperty("CVEGEO") !== cve) return;
      f.getGeometry().forEachLatLng(function (ll) { b.extend(ll); hay = true; });
    });
    if (hay) map.fitBounds(b, 40);
  }

  /* ---------------------------------------------------------- regla de 300 m (geometría local en metros) */
  function prepararPoligono(f) {
    var anillos = [], minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    (function rec(geom) {
      var t = geom.getType();
      if (t === "Polygon") geom.getArray().forEach(function (ring) {
        anillos.push(ring.getArray().map(function (ll) {
          var la = ll.lat(), ln = ll.lng();
          if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; if (ln < minLng) minLng = ln; if (ln > maxLng) maxLng = ln;
          return [ln, la];
        }));
      });
      else if (t === "MultiPolygon" || t === "GeometryCollection") geom.getArray().forEach(rec);
    })(f.getGeometry());
    var sub = f.getProperty("subtipo") || "Área verde", col = f.getProperty("col");
    return { m2: f.getProperty("area_m2") || 0, nombre: f.getProperty("name") || (sub.charAt(0).toUpperCase() + sub.slice(1) + (col ? " en " + col : "")), anillos: anillos, bb: [minLng, minLat, maxLng, maxLat] };
  }

  function distanciaM(lat0, lng0, pol) {
    var kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540, dentro = false, best = Infinity;
    pol.anillos.forEach(function (r) {
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        var xi = (r[i][0] - lng0) * kx, yi = (r[i][1] - lat0) * ky, xj = (r[j][0] - lng0) * kx, yj = (r[j][1] - lat0) * ky;
        if ((yi > 0) !== (yj > 0) && 0 < (xj - xi) * (0 - yi) / (yj - yi) + xi) dentro = !dentro;
        var dx = xj - xi, dy = yj - yi, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(xi * dx + yi * dy) / L)) : 0;
        var px = xi + t * dx, py = yi + t * dy, d = Math.sqrt(px * px + py * py);
        if (d < best) best = d;
      }
    });
    return dentro ? 0 : best;
  }

  function listaUmbral() {
    var u = estado.umbral, l = objetivos.publico.slice();
    if (u.indexOf("naturales") >= 0) l = l.concat(objetivos.naturales);
    if (u.indexOf("vial") >= 0 || u === "todo_verde") l = l.concat(objetivos.vial);
    if (u === "todo_verde") l = l.concat(objetivos.naturales);
    return l;
  }

  /* ¿el punto cae en «Sin verde a 300 m»? Se responde con las mismas celdas H3 de la capa negra */
  /* devuelve 0 si hay verde a 300 m, o 1–4 según la banda de distancia; null mientras cargan los datos */
  function sinVerdeEn(lat, lng) {
    var h3 = window.h3;
    if (!h3 || !huecoData) return null;
    if (!huecoBanda) { huecoBanda = new Map(); huecoData.celdas.forEach(function (cs, k) { cs.forEach(function (c) { huecoBanda.set(c, k + 1); }); }); }
    var c = h3.latLngToCell(lat, lng, huecoData.res);
    for (var r = huecoData.res; r >= 0; r--) { var b = huecoBanda.get(r === huecoData.res ? c : h3.cellToParent(c, r)); if (b) return b; }
    return 0;
  }
  function evaluarPunto(lat, lng, centrar) {
    if (marcaUbic) marcaUbic.setMap(null);
    if (circuloUbic) circuloUbic.setMap(null);
    marcaUbic = new google.maps.Marker({ map: map, position: { lat: lat, lng: lng }, clickable: false, zIndex: 1000, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: C.verde, fillOpacity: 1, strokeColor: C.blanco, strokeWeight: 2 } });
    circuloUbic = new google.maps.Circle({ map: map, center: { lat: lat, lng: lng }, radius: 300, clickable: false, zIndex: 1000, fillOpacity: 0, strokeColor: C.blanco, strokeWeight: 3 });
    if (centrar) { map.panTo({ lat: lat, lng: lng }); map.setZoom(16); }
    var r = $("resultadoUbicacion");
    r.hidden = false;
    var sin = sinVerdeEn(lat, lng), hx = window.h3 ? hexPorId[window.h3.latLngToCell(lat, lng, 9)] : null;
    var entorno = hx && hx.pob >= 50 ? " Lo verde ocupa " + fmt(hx.verde_vec, 1) + " % de su entorno" + (hx.delicada === 2 ? ": zona crítica." : hx.delicada === 1 ? ": zona en atención." : ".") : "";
    if (sin === null) {
      r.className = "resultado";
      r.innerHTML = "Cargando los datos, intenta de nuevo en un momento.";
    } else if (hx && !hx.pob) {
      r.className = "resultado";
      r.innerHTML = "<b>Aquí no vive gente.</b><br>La regla se mide desde las manzanas habitadas del Censo 2020. Prueba en una zona con casas.";
    } else if (sin) {
      r.className = "resultado resultado--falta";
      r.innerHTML = "<b>No se cumple.</b><br>El espacio público verde, cerro, barranca, bosque o campo más cercano está a " + ["", "entre 300 y 500 m", "entre 500 y 750 m", "entre 750 m y 1 km", "más de 1 km"][sin] + " en línea recta." + entorno;
    } else {
      r.className = "resultado resultado--cumple";
      r.innerHTML = "<b>Sí se cumple.</b><br>Hay " + ETIQUETA_UMBRAL[estado.umbral] + " a menos de 300 m de este punto." + entorno;
    }
    if (sin !== null) mostrarCercanos(lat, lng);
    if (!$("panel").classList.contains("panel--cerrado")) r.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* espacio público, cerro, barranca o bosque más cercano: teselas de 0.05° que se bajan sólo al hacer clic */
  var teselasCerca = {}, turnoCerca = 0;
  function teselaCerca(i, j) {
    var k = i + "_" + j;
    if (!teselasCerca[k]) teselasCerca[k] = fetch(DATA + "cercania/" + k + ".json" + VER).then(function (r) { return r.ok ? r.json() : { f: [] }; }).catch(function () { return { f: [] }; }).then(function (d) {
      return d.f.map(function (x) {
        var b = [Infinity, Infinity, -Infinity, -Infinity];
        x[4].forEach(function (r) { r.forEach(function (c) { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; }); });
        return { nombre: x[0], sub: x[1], cls: x[2], m2: x[3], anillos: x[4], bb: b };
      });
    });
    return teselasCerca[k];
  }
  function mostrarCercanos(lat, lng) {
    var turno = ++turnoCerca, caja = document.createElement("p");
    caja.className = "resultado__cerca";
    caja.textContent = "Buscando lo más cercano…";
    $("resultadoUbicacion").appendChild(caja);
    teselaCerca(Math.floor(lng / 0.05), Math.floor(lat / 0.05)).then(function (lista) {
      if (turno !== turnoCerca) return;
      var vistos = {}, res = [];
      lista.forEach(function (p) {
        var m = 0.016;
        if (p.bb[2] < lng - m || p.bb[0] > lng + m || p.bb[3] < lat - m || p.bb[1] > lat + m) return;
        var d = distanciaM(lat, lng, p), k = p.nombre + "|" + p.m2;
        if (!(k in vistos) || d < res[vistos[k]].d) { if (k in vistos) res[vistos[k]].d = d; else { vistos[k] = res.length; res.push({ p: p, d: d }); } }
      });
      res.sort(function (a, b) { return a.d - b.d; });
      var desc = function (x) { return "<b>" + esc(x.p.nombre) + "</b> (" + esc(x.p.sub) + ", " + superficie(x.p.m2) + ")"; };
      var dist = function (d) { return d === 0 ? "estás dentro" : "a " + fmt(Math.round(d / 10) * 10) + " m"; };
      if (!res.length || res[0].d > 1500) { caja.innerHTML = "No hay espacio público verde, cerro, barranca ni bosque a 1.5 km."; return; }
      var h = "Lo más cercano: " + desc(res[0]) + ", " + dist(res[0].d) + ".";
      // a 300 m: primero los que tienen nombre propio (sin repetir); los demás sólo se cuentan
      var mas = res.slice(1).filter(function (x) { return x.d <= 300; }), conNombre = [], visto = {}, sinNombre = 0;
      mas.forEach(function (x) {
        if (/ en /.test(x.p.nombre) && x.p.nombre.indexOf(x.p.sub.charAt(0).toUpperCase() + x.p.sub.slice(1)) === 0) sinNombre++;
        else if (!visto[x.p.nombre]) { visto[x.p.nombre] = 1; conNombre.push(x); }
      });
      var partes = conNombre.slice(0, 3).map(function (x) { return esc(x.p.nombre) + " (" + dist(x.d) + ")"; });
      var resto = Math.max(0, conNombre.length - 3) + sinNombre;
      var txtResto = resto ? fmt(resto) + (resto === 1 ? " espacio" : " espacios") + (conNombre.length > 3 ? " más" : " sin nombre") : "";
      if (partes.length) h += " También a menos de 300 m: " + partes.join(", ") + (txtResto ? " y " + txtResto : "") + ".";
      else if (txtResto) h += " También a menos de 300 m: " + txtResto + ".";
      caja.innerHTML = h;
    });
  }

  /* Se llama directo desde el toque (Safari sólo pide permiso dentro del gesto). Si el mapa aún no carga, espera. */
  var MSG_UBIC = {
    1: "Tu navegador bloqueó la ubicación para este sitio. Actívala en los permisos del sitio (el candado junto a la dirección) y vuelve a intentar.",
    2: "El teléfono no pudo ubicarte. Revisa que la ubicación del teléfono esté encendida.",
    3: "Tardó demasiado en ubicarte. Intenta de nuevo, de preferencia con señal o wifi."
  };
  function ubicarme() {
    var bs = [$("btnUbicacion"), $("btnUbicMapa")];
    function txt(t) { bs.forEach(function (b) { if (b) b.textContent = t; }); }
    if (!navigator.geolocation || !window.isSecureContext) { avisoUbic("Este navegador no comparte la ubicación con el sitio. Toca el mapa en el lugar que quieras revisar."); return; }
    txt("Buscando…");
    function listo(pos) {
      txt("Usar mi ubicación"); $("btnUbicMapa").textContent = "Mi ubicación";
      (function esperar() {
        if (!map) { setTimeout(esperar, 200); return; }
        evaluarPunto(pos.coords.latitude, pos.coords.longitude, true);
        if (movil()) {  // el panel tapa la mitad de abajo: sube el punto al hueco visible
          abrirPanel($("resultadoUbicacion"));
          map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); map.setZoom(15);
          google.maps.event.addListenerOnce(map, "idle", function () { map.panBy(0, Math.round($("panel").offsetHeight / 2)); });
        }
      })();
    }
    function fallo(e) {
      if (e && e.code === 3 && !fallo.otra) {  // sin GPS a tiempo: intenta con wifi/antenas
        fallo.otra = true;
        navigator.geolocation.getCurrentPosition(listo, fallo, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
        return;
      }
      fallo.otra = false;
      txt("Usar mi ubicación"); $("btnUbicMapa").textContent = "Mi ubicación";
      avisoUbic(MSG_UBIC[e && e.code] || "No pudimos leer tu ubicación.");
    }
    fallo.otra = false;
    navigator.geolocation.getCurrentPosition(listo, fallo, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  function avisoUbic(t) {
    var r = $("resultadoUbicacion");
    r.hidden = false; r.className = "resultado"; r.textContent = t;
    if (movil()) abrirPanel(r);
  }
  function movil() { return window.matchMedia("(max-width: 760px)").matches; }
  function abrirPanel(el) {
    $("panel").classList.remove("panel--cerrado"); $("panelAsa").setAttribute("aria-expanded", "true");
    if (el) setTimeout(function () { el.scrollIntoView({ block: "start", behavior: "smooth" }); }, 50);
  }

  /* ---------------------------------------------------------- fichas */
  function superficie(m2) { return m2 >= 10000 ? fmt(m2 / 10000, 1) + " ha" : fmt(m2) + " m²"; }
  function botonesRevision(lat, lng) {
    var sv = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + lat + "," + lng;
    var gm = "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng;
    return '<section class="ficha__seccion"><h4>Revísala</h4><div class="ficha__acciones"><a class="boton boton--verde" href="' + sv + '" target="_blank" rel="noopener">Ver en Street View</a><a class="boton boton--gris" href="' + gm + '" target="_blank" rel="noopener">Abrir en Google Maps</a></div></section>';
  }
  function reporte(mun) {
    var nom = nombreMun[mun] || "tu municipio";
    if (mun && mun.slice(0, 2) === "09") return '<section class="ficha__seccion"><h4>Reporta un árbol muerto, basura o daño</h4><p class="nota">Locatel canaliza el reporte a la alcaldía o dependencia que corresponde y te da un folio.</p><div class="ficha__acciones" style="margin-top:10px"><a class="boton boton--negro" href="tel:5556581111">Locatel 55 5658 1111</a><a class="boton boton--gris" href="tel:*0311">*0311 desde celular</a></div><p class="nota" style="margin-top:10px">Si un árbol caído pone a alguien en riesgo, llama al <a href="tel:911">911</a>.</p></section>';
    return '<section class="ficha__seccion"><h4>Reporta un árbol muerto, basura o daño</h4><p class="nota">Repórtalo al ayuntamiento de ' + esc(nom) + ", en su área de servicios públicos o de parques y jardines. Si un árbol caído pone a alguien en riesgo, llama al <a href=\"tel:911\">911</a>.</p></section>";
  }
  function responsable(p) {
    var nom = nombreMun[p.mun] || "", cdmx = p.mun && p.mun.slice(0, 2) === "09";
    if (p.cls === "restringido") return "La institución o el propietario del predio: escuela, hospital, panteón, club o conjunto habitacional.";
    if (p.cls === "naturales") return "Depende del régimen del terreno: ejido, comunidad, propiedad privada, estado o federación. No siempre tiene acceso público.";
    return (cdmx ? "La alcaldía " : "El ayuntamiento de ") + esc(nom) + (p.cls === "vial" ? ". Si el camellón o la glorieta está en una vía primaria, puede ser el gobierno del estado." : ".");
  }

  function abrirFicha(p, ll) {
    var titulo = p.name || ((p.subtipo ? p.subtipo.charAt(0).toUpperCase() + p.subtipo.slice(1) : "Área verde") + (p.col ? " en " + p.col : ""));
    var lugar = (p.col ? p.col + " · " : "") + (nombreMun[p.mun] || "") + (p.mun ? " · " + ESTADO_CORTO[p.mun.slice(0, 2)] : "");
    var cab = p.cls === "publico" || p.cls === "naturales" ? "publico" : "vial";
    var h = '<header class="ficha__cabeza ficha__cabeza--' + cab + '"><h3>' + esc(titulo) + "</h3><p>" + esc(ROTULO[p.cls] || "") + (lugar ? " · " + esc(lugar) : "") + "</p></header>";
    h += '<dl class="ficha__datos"><dt>Tipo</dt><dd>' + esc(p.subtipo) + "</dd><dt>Superficie</dt><dd>" + superficie(p.area_m2 || 0) + "</dd><dt>Fuente</dt><dd>" + (p.subtipo && p.subtipo.indexOf("satélite") >= 0 ? "Sentinel-2" : p.subtipo && p.subtipo.indexOf("INEGI") >= 0 ? "INEGI Serie VII" : "OpenStreetMap") + "</dd></dl>";
    h += '<section class="ficha__seccion"><h4>¿Quién responde por esta área?</h4><p class="nota">' + responsable(p) + " Es el responsable probable por el tipo de área; al reportar te confirman quién la atiende.</p></section>";
    if (p.cls === "naturales") h += '<section class="ficha__seccion"><p class="nota">Cuenta para la regla de 300 m cuando el selector incluye cerros, barrancas, bosques y campo.</p></section>';
    if (p.cls === "vial") h += '<section class="ficha__seccion"><p class="nota">Limpia el aire y da sombra, pero no es espacio para estar. Cuenta para los 300 m sólo en la opción que incluye camellones y glorietas.</p></section>';
    h += botonesRevision(ll.lat().toFixed(6), ll.lng().toFixed(6)) + reporte(p.mun);
    mostrarFicha(h);
  }

  function abrirHex(p, ll) {
    medir("ficha/hexagono");
    var v = p.verde_vec, sin = p["sin_" + estado.umbral];
    var lugar = (p.col ? p.col + " · " : "") + (nombreMun[p.mun] || "") + (p.mun ? " · " + ESTADO_CORTO[p.mun.slice(0, 2)] : "");
    var nivel = p.pob < 50 ? (p.pob > 0 ? "Casi sin habitantes" : "Sin habitantes") : p.delicada === 2 ? "Zona crítica" : p.delicada === 1 ? "Zona en atención" : "Fuera de riesgo";
    var h = '<header class="ficha__cabeza ficha__cabeza--' + (p.delicada > 0 ? "delicada" : "hex") + '"><h3>' + fmt(v, 1) + " % verde a la redonda</h3><p>" + nivel + " · " + esc(lugar) + "</p></header>";
    h += '<dl class="ficha__datos"><dt>Verde en su entorno</dt><dd><b>' + fmt(v, 1) + " %</b> · su hexágono y los 6 de alrededor</dd><dt>Verde en este hexágono</dt><dd>" + fmt(p.verde_pct, 1) + " %</dd><dt>Copa arbórea</dt><dd>" + fmt(p.copa, 1) + " % (meta 30 %)</dd>" + (p.copa_hab != null ? "<dt>Copa por habitante</dt><dd>" + fmt(p.copa_hab, 1) + " m²</dd>" : "") + "<dt>Población 2020</dt><dd>" + fmt(p.pob) + "</dd>" + (p.pob > 0 ? "<dt>Sin verde a 300 m</dt><dd>" + (sin == null ? "—" : fmt(sin) + " % de su gente") + "</dd>" : "") + "</dl>";
    var t;
    if (p.pob < 50) t = "Aquí no vive gente suficiente para calificar la zona. El hexágono se muestra para ver cuánto verde aporta a sus vecinos.";
    else if (p.delicada === 2) t = "Lo verde no llega a 5 % de su entorno: casi no hay árbol, camellón ni parque a la vista.";
    else if (p.delicada === 1) t = "Lo verde ocupa entre 5 y 10 % de su entorno.";
    else t = "Lo verde pasa de 10 % de su entorno.";
    var corte = p.pob >= 50 ? [5, 10].map(function (c) { return Math.abs(v - c); }).sort(function (x, y) { return x - y; })[0] : 99;
    if (corte < 1) t += " Está a menos de un punto del corte.";
    h += '<section class="ficha__seccion"><p class="nota">' + t + " Cada hexágono mide 12 ha.</p></section>";
    h += botonesRevision(ll.lat().toFixed(6), ll.lng().toFixed(6));
    mostrarFicha(h);
  }
  function mostrarFicha(h) { $("fichaCuerpo").innerHTML = h; $("ficha").hidden = false; }

  /* ---------------------------------------------------------- controles */
  function enlazar() {
    /* verde por hexágono, copa por hexágono y copa a detalle se excluyen entre sí; zonas críticas va aparte */
    var EXCLUYENTES = ["verdeHex", "copa", "copaRaster"];
    var ponerCapa = function (k, on) {
      estado.capas[k] = on;
      var i = document.querySelector('input[data-capa="' + k + '"]');
      if (i) i.checked = on;
    };
    var sincronizarRevelar = function () {
      var b = $("btnDelicadas"), on = !!estado.capas.delicada;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "Ocultar zonas críticas" : "Revelar zonas más críticas";
      document.querySelectorAll("details.grupo").forEach(function (d) {
        var n = d.querySelectorAll("input[data-capa]:checked").length, f = d.querySelector("input[name=imagen]:checked");
        d.querySelector(".grupo__n").textContent = f ? f.parentNode.textContent.trim() : n ? n + (n === 1 ? " prendida" : " prendidas") : "";
      });
    };
    document.querySelectorAll("input[data-capa]").forEach(function (i) {
      i.addEventListener("change", function () {
        var k = i.dataset.capa;
        estado.capas[k] = i.checked;
        if (i.checked && EXCLUYENTES.indexOf(k) >= 0) EXCLUYENTES.forEach(function (o) { if (o !== k) ponerCapa(o, false); });
        if (i.checked) medir("capa/" + k);
        sincronizarRevelar();
        if (map) aplicarVisibilidad();
      });
    });
    document.querySelectorAll("[data-apagar]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.closest("fieldset").querySelectorAll("input[data-capa]").forEach(function (i) { ponerCapa(i.dataset.capa, false); });
        sincronizarRevelar();
        if (map) aplicarVisibilidad();
      });
    });
    document.querySelectorAll("input[name=imagen]").forEach(function (i) { i.addEventListener("change", sincronizarRevelar); });
    sincronizarRevelar();
    /* sliders de las leyendas: dos manijas sobre la rampa; tocar un color deja sólo ese (otro toque, todos) */
    document.querySelectorAll(".rango").forEach(function (r) {
      var k = r.dataset.rango, ins = r.querySelectorAll("input"), n = +ins[0].max;
      var rampa = r.previousElementSibling, cuadros = rampa ? rampa.querySelectorAll("i") : [];
      var aplicar = function () {
        var a = +ins[0].value, b = +ins[1].value;
        if (a > b) { var t = a; a = b; b = t; }
        if (a === b) { if (b < n) b++; else a--; }
        filtro[k] = [a, b];
        cuadros.forEach(function (c, i) { c.classList.toggle("fuera", i < a || i >= b); });
        if (rampa && rampa.classList.contains("leyenda-grav")) rampa.style.setProperty("--a", a / n * 100 + "%"), rampa.style.setProperty("--b", b / n * 100 + "%");
        if (capasData[k] && capasData[k].getStyle()) capasData[k].setStyle(capasData[k].getStyle());
        if (mosaicos[k] && map && estado.capas[k]) { overlay(k, false); overlay(k, true); }
      };
      ins.forEach(function (i) { i.addEventListener("input", aplicar); i.addEventListener("change", function () { medir("filtro/" + k); }); });
      cuadros.forEach(function (c, i) {
        c.addEventListener("click", function () {
          var solo = filtro[k][0] === i && filtro[k][1] === i + 1;
          ins[0].value = solo ? 0 : i; ins[1].value = solo ? n : i + 1;
          aplicar(); medir("filtro/" + k);
        });
      });
    });
    $("btnDelicadas").addEventListener("click", function () {
      var on = !estado.capas.delicada;
      ponerCapa("delicada", on);
      if (on) medir("revelar");
      sincronizarRevelar();
      if (map) aplicarVisibilidad();
    });
    document.querySelectorAll("input[name=umbral]").forEach(function (i) {
      i.addEventListener("change", function () { estado.umbral = i.value; medir("umbral/" + i.value); if (map) aplicarVisibilidad(); if (ind) { pintarEstados(); pintarBarras(); } });
    });
    document.querySelectorAll("input[name=indicador]").forEach(function (i) {
      i.addEventListener("change", function () { estado.indicador = i.value; medir("indicador/" + i.value); pintarBarras(); });
    });
    document.querySelectorAll("input[name=filtroEstado]").forEach(function (i) {
      i.addEventListener("change", function () { estado.filtro = i.value; pintarBarras(); });
    });
    document.querySelectorAll("input[name=imagen]").forEach(function (i) {
      i.addEventListener("change", function () { estado.imagen = i.value; medir("imagen/" + i.value); if (map) aplicarVisibilidad(); });
    });
    $("btnUbicacion").addEventListener("click", function () { medir("ubicarme"); ubicarme(); });
    $("btnUbicMapa").addEventListener("click", function () { medir("ubicarme/mapa"); ubicarme(); });
    /* en el teléfono, botones de zonas y leyendas arrancan minimizados, como el panel */
    [["btnAcciones", "acciones", "Zonas"], ["btnLeyendas", "leyendas", "Leyenda"]].forEach(function (a) {
      var b = $(a[0]), el = $(a[1]);
      b.addEventListener("click", function () {
        var abrir = el.classList.toggle("movil-abierto");
        b.setAttribute("aria-expanded", String(abrir));
        b.textContent = abrir ? a[2] + " ×" : a[2];
        if (abrir && a[0] === "btnAcciones") { $("btnLeyendas").setAttribute("aria-expanded", "false"); $("btnLeyendas").textContent = "Leyenda"; $("leyendas").classList.remove("movil-abierto"); }
        if (abrir && a[0] === "btnLeyendas") { $("btnAcciones").setAttribute("aria-expanded", "false"); $("btnAcciones").textContent = "Zonas"; $("acciones").classList.remove("movil-abierto"); }
      });
    });
    document.querySelectorAll("a.descarga").forEach(function (a) { a.addEventListener("click", function () { medir("descarga/" + a.getAttribute("href").split("/").pop()); }); });
    $("fichaCerrar").addEventListener("click", function () { $("ficha").hidden = true; });
    $("panelAsa").addEventListener("click", function () {
      var p = $("panel"), c = p.classList.toggle("panel--cerrado");
      $("panelAsa").setAttribute("aria-expanded", String(!c));
    });
    if (window.matchMedia("(max-width: 760px)").matches) { $("panel").classList.add("panel--cerrado"); $("panelAsa").setAttribute("aria-expanded", "false"); }
  }

  /* ---- las 10 zonas más rezagadas, más verdes y medianas (data/zmvm/<modo>.json): se pueden prender juntas ---- */
  var ZM = {
    rezagadas: { btn: "btnRezagadas", color: "#B31D18", nombre: "Zonas críticas", etq: "Zona crítica", datos: null, capa: null, marcas: [], on: false },
    medianas: { btn: "btnMedianas", color: "#1F4E8C", nombre: "Zonas medianas", etq: "Zona mediana", datos: null, capa: null, marcas: [], on: false },
    verdes: { btn: "btnVerdes", color: "#1F6B3A", nombre: "Zonas verdes", etq: "Zona verde", datos: null, capa: null, marcas: [], on: false },
  };
  /* áreas verdes públicas de 1 ha o más (parques, plazas, deportivos, camellones, glorietas), en gris */
  var capa1ha = null;
  function areas1ha(on) {
    if (!map) return;
    if (!on) { if (capa1ha) capa1ha.setMap(null); return; }
    if (capa1ha) { capa1ha.setMap(map); return; }
    capa1ha = new google.maps.Data();
    capa1ha.setStyle({ fillColor: "#6b6b6b", fillOpacity: 0.55, strokeColor: "#3d3d3d", strokeWeight: 1, zIndex: 8, clickable: true });
    var iw = new google.maps.InfoWindow();
    capa1ha.addListener("click", function (e) {
      iw.setContent("<b>" + esc(e.feature.getProperty("nombre")) + "</b><br>" + fmt(e.feature.getProperty("ha"), 1) + " ha");
      iw.setPosition(e.latLng); iw.open(map);
    });
    fetch(DATA + "areas_1ha.geojson" + VER).then(function (r) { return r.json(); }).then(function (g) {
      capa1ha.addGeoJson(g);
      if ($("btnComparar").getAttribute("aria-pressed") === "true") capa1ha.setMap(map);
    });
  }
  var ORDEN = ["rezagadas", "medianas", "verdes"];
  var zSel = { modo: null, n: 0 };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var NSE_TONO = { "AB": "#1f1f1f", "C+": "#3d3d3d", "C": "#5c5c5c", "C-": "#7a7a7a", "D+": "#9a9a9a", "D": "#bcbcbc", "E": "#dcdcdc" };
  function activos() { return ORDEN.filter(function (k) { return ZM[k].on && ZM[k].datos; }); }
  function cargarZonas(modo) {
    var M = ZM[modo];
    if (M.datos) return Promise.resolve(M.datos);
    return fetch(DATA + modo + ".json" + VER).then(function (r) { return r.json(); }).then(function (j) { M.datos = j; return j; });
  }
  function nombreZona(z) { return z.colonias.slice(0, 2).join(" y "); }
  function recorrerGeom(g, fn) {
    var polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    polys.forEach(function (p) { p[0].forEach(function (c) { fn(c); }); });
  }
  function pintarZonas(modo, on) {
    var M = ZM[modo];
    if (!map || !M.datos) return;
    if (!M.capa) {
      M.capa = new google.maps.Data();
      M.datos.zonas.forEach(function (z) {
        M.capa.addGeoJson({ type: "Feature", properties: { n: z.n }, geometry: z.geom });
        var m = new google.maps.Marker({
          position: { lat: z.centro[1], lng: z.centro[0] }, title: M.nombre + " " + z.n + ". " + nombreZona(z) + ", " + z.mun, zIndex: 60,
          label: { text: String(z.n), color: "#ffffff", fontWeight: "700", fontSize: "12px" },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: M.color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
        });
        m.addListener("click", function () { abrirZona(modo, z.n); });
        M.marcas.push(m);
      });
      M.capa.setStyle(function (f) {
        var sel = zSel.modo === modo && f.getProperty("n") === zSel.n;
        return { fillColor: M.color, fillOpacity: sel ? 0.22 : 0.1, strokeColor: M.color, strokeWeight: sel ? 4 : 2.5, zIndex: 12, clickable: true };
      });
      M.capa.addListener("click", function (e) { abrirZona(modo, e.feature.getProperty("n")); });
    }
    M.capa.setMap(on ? map : null);
    M.marcas.forEach(function (m) { m.setMap(on ? map : null); });
  }
  function restilar() { ORDEN.forEach(function (k) { var c = ZM[k].capa; if (c) c.setStyle(c.getStyle()); }); }
  function encuadrar(bb, caja) {
    var movil = window.innerWidth <= 760;
    var der = caja && !caja.hidden && !caja.classList.contains("rezago--min") ? caja.offsetWidth + 40 : 40;
    map.fitBounds(bb, movil ? 30 : { top: 80, bottom: 40, left: $("panel").classList.contains("panel--cerrado") ? 40 : 420, right: der });
  }
  function bbZonas(zs) { var bb = new google.maps.LatLngBounds(); zs.forEach(function (z) { recorrerGeom(z.geom, function (c) { bb.extend({ lat: c[1], lng: c[0] }); }); }); return bb; }
  function zonaSel() { var M = zSel.modo && ZM[zSel.modo]; return M && M.datos && M.datos.zonas[zSel.n - 1]; }

  /* ventana de la lista: minimizable desde que aparece */
  function minimizarLista(on) {
    var L = $("rezagoLista");
    L.classList.toggle("rezago-lista--min", on);
    var b = $("listaMin");
    if (b) { b.textContent = on ? "Ver lista" : "Minimizar"; b.setAttribute("aria-expanded", on ? "false" : "true"); }
  }
  function pintarLista() {
    var L = $("rezagoLista"), act = activos();
    if (!act.length) { L.hidden = true; return; }
    var min = L.classList.contains("rezago-lista--min");
    L.innerHTML = '<div class="rezago-lista__barra"><b>Zonas en el mapa</b><button type="button" class="rezago__min" id="listaMin" aria-expanded="true">Minimizar</button></div>' +
      '<div class="rezago-lista__cuerpo">' + act.map(function (k) {
        var M = ZM[k], j = M.datos;
        return '<section style="--zona:' + M.color + '"><h3><i></i>' + M.nombre + '</h3><p class="rezago-lista__nota">' + esc(j.criterio) + '.</p><ol>' + j.zonas.map(function (z) {
          return '<li><button type="button" data-modo="' + k + '" data-zona="' + z.n + '"><b>' + esc(nombreZona(z)) + '</b><small>' + esc(z.mun) + " · " + fmt(z.pob) + " personas</small></button></li>";
        }).join("") + "</ol></section>";
      }).join("") + "</div>";
    L.querySelectorAll("[data-zona]").forEach(function (x) { x.addEventListener("click", function () { abrirZona(x.dataset.modo, +x.dataset.zona); }); });
    $("listaMin").addEventListener("click", function () { minimizarLista(!L.classList.contains("rezago-lista--min")); });
    minimizarLista(min);
    L.hidden = false;
  }

  /* comparación en el panel izquierdo: las 10 zonas de cada grupo juntas, con una marca por zona */
  var METRICAS = [
    ["Gente", [["pob", "Personas en las 10 zonas", ""], ["dens", "Densidad", " hab/ha"]]],
    ["Verde", [["verde_vec", "Verde en el entorno", " %"], ["copa", "Copa arbórea", " %"], ["copa_hab", "Copa arbórea por habitante", " m²"], ["pct300", "Con verde público o natural a 300 m", " %"], ["n1", "Áreas verdes públicas de 1 ha o más a 300 m (promedio)", ""],
      ["d_verde", "Espacio verde más cercano (≥ 0.5 ha)", " m"], ["d_grande", "Espacio de 5 ha o más más cercano", " m"]]],
    ["Movilidad", [["sin_auto", "Viviendas sin auto", " %"]]],
    ["Quién vive", [["nse_alto", "Hogares AB y C+ (AMAI)", " %"], ["nse_bajo", "Hogares D y E (AMAI)", " %"], ["graproes", "Escolaridad promedio", " años"],
      ["pder_ss", "Con derechohabiencia a salud", " %"], ["internet", "Viviendas con internet", " %"], ["p_0a14", "Población de 0 a 14 años", " %"], ["p_65", "Población de 65 años o más", " %"]]],
  ];
  function pintarComparar() {
    var S = $("comparar"), act = activos(), R = ZM.medianas.datos, sel = zonaSel();
    if (!act.length || !R) { S.hidden = true; return; }
    var dec = function (k, v) { return k === "pob" || k.indexOf("d_") === 0 ? fmt(v) : fmt(v, 1); };
    var html = '<p class="nota">La línea del centro es el grupo de las 10 zonas medianas. Cada barra sale de ahí: a la derecha si el grupo tiene más, a la izquierda si tiene menos. Los grupos son las 10 zonas juntas, ponderadas por población (las distancias, desde el centro de cada zona). Las marcas son cada zona.</p>' +
      '<div class="comparar__claves">' + act.map(function (k) { return '<span><i style="background:' + ZM[k].color + '"></i>' + ZM[k].nombre + "</span>"; }).join("") + '<span><i style="background:#6b6b6b;border-radius:0"></i>Áreas verdes públicas de 1 ha o más</span></div>';
    METRICAS.forEach(function (g) {
      html += "<h3>" + g[0] + "</h3>";
      g[1].forEach(function (m) {
        var k = m[0], ref = R.resumen[k], dmax = 0;
        if (ref == null) return;
        act.forEach(function (a) {
          var D = ZM[a].datos;
          if (k !== "pob") D.zonas.forEach(function (z) { if (z.num && z.num[k] != null) dmax = Math.max(dmax, Math.abs(z.num[k] - ref)); });
          if (D.resumen[k] != null) dmax = Math.max(dmax, Math.abs(D.resumen[k] - ref));
        });
        dmax = dmax || 1;
        var pos = function (x) { return 50 + (x - ref) / dmax * 50; };
        html += '<div class="comparar__m"><span class="comparar__etq">' + m[1] + ' <em>mediana: ' + dec(k, ref) + m[2] + "</em></span>" + act.map(function (a) {
          var D = ZM[a].datos, v = D.resumen[k], p = v == null ? 50 : pos(v);
          var marcas = k === "pob" ? "" : D.zonas.map(function (z) { var x = z.num && z.num[k]; return x == null ? "" : '<u style="left:' + pos(x) + '%" title="' + esc(z.n + ". " + nombreZona(z)) + ": " + dec(k, x) + m[2] + '"></u>'; }).join("");
          if (k !== "pob" && sel && zSel.modo === a && sel.num && sel.num[k] != null) {
            var xs = sel.num[k];
            marcas += '<s class="comparar__sel" style="left:' + Math.max(0, Math.min(100, pos(xs))) + "%;background:" + ZM[a].color + '" title="' + esc(sel.n + ". " + nombreZona(sel)) + ": " + dec(k, xs) + m[2] + '">' + sel.n + "</s>";
          }
          return '<div class="comparar__fila" style="--zona:' + ZM[a].color + '"><span class="comparar__pista comparar__pista--centro"><i style="left:' + Math.min(50, p) + "%;width:" + Math.abs(p - 50) + '%"></i>' + marcas + '</span><b>' + (v == null ? "—" : dec(k, v) + m[2]) + "</b></div>";
        }).join("") + "</div>";
      });
    });
    html += '<p class="nota">Fuentes: INEGI, Censo 2020 por manzana; AMAI por AGEB; OpenStreetMap; Sentinel-2; Meta (copa). Las zonas medianas son densas (100 hab/ha o más) con la copa arbórea por habitante de la gente de en medio del valle (' + fmt(R.banda_copa_hab[0], 1) + " a " + fmt(R.banda_copa_hab[1], 1) + " m² por persona, percentil 40 a 60).</p>";
    $("compararCuerpo").innerHTML = html;
    S.hidden = false;
  }

  function prender(modo, on) {
    var M = ZM[modo];
    M.on = on;
    $(M.btn).setAttribute("aria-pressed", on ? "true" : "false");
    if (!on) {
      pintarZonas(modo, false);
      if (zSel.modo === modo) cerrarFicha();
      pintarLista(); pintarComparar();
      return;
    }
    medir(modo);
    Promise.all([cargarZonas(modo), cargarZonas("medianas")]).then(function (r) {
      var j = r[0];
      if (!M.on) return;
      pintarZonas(modo, true);
      pintarLista(); pintarComparar();
      var pc = $("panelCuerpo"), cmp = $("comparar");
      pc.scrollTop += cmp.getBoundingClientRect().top - pc.getBoundingClientRect().top - 8;
      if (map && !zSel.modo) encuadrar(bbZonas(j.zonas), null);
    }).catch(function () { M.on = false; $(M.btn).setAttribute("aria-pressed", "false"); });
  }

  /* ficha de zona: minimizable */
  function minimizar(on) {
    var caja = $("rezago");
    caja.classList.toggle("rezago--min", on);
    $("rezagoMin").setAttribute("aria-expanded", on ? "false" : "true");
    $("rezagoMin").textContent = on ? "Ver ficha" : "Minimizar";
    var z = zonaSel();
    if (map && z) encuadrar(bbZonas([z]), caja);
  }
  function cerrarFicha() { $("rezago").hidden = true; $("rezago").classList.remove("rezago--min"); zSel = { modo: null, n: 0 }; restilar(); pintarComparar(); }
  function abrirZona(modo, n) {
    var M = ZM[modo], D = M && M.datos, z = D && D.zonas[n - 1];
    if (!z) return;
    zSel = { modo: modo, n: n };
    medir(modo + "/" + n);
    minimizarLista(true);
    restilar();
    pintarComparar();
    var p = z.perfil || {};
    var pct = function (v) { return v == null ? "—" : fmt(v, 1) + " %"; };
    var filas = [
      ["Población de 0 a 14 años", pct(p.p_0a14)], ["Población de 65 años o más", pct(p.p_65)],
      ["Escolaridad promedio (15 años o más)", p.graproes == null ? "—" : fmt(p.graproes, 1) + " años"],
      ["Con derechohabiencia a servicios de salud", pct(p.pder_ss)],
      ["Viviendas sin auto", p.auto == null ? "—" : fmt(100 - p.auto, 1) + " %"], ["Viviendas con internet", pct(p.internet)],
      ["Ocupantes por vivienda", p.ocup == null ? "—" : fmt(p.ocup, 1)], ["Población con discapacidad", pct(p.disc)],
      ["Viviendas habitadas", fmt(p.viviendas)],
    ];
    var nse = p.nse || {}, niveles = ["AB", "C+", "C", "C-", "D+", "D", "E"];
    var lugar = z.mun + (z.otros_mun && z.otros_mun.length ? " (y " + z.otros_mun.join(", ") + ")" : "") + " · " + z.estado;
    var verde = (z.verde || []).map(function (v) { return "<li><b>" + esc(v.nombre) + "</b>, " + esc(v.sub) + " de " + esc(v.area) + ", a " + esc(v.d) + "</li>"; }).join("");
    var v1 = z.verde_1ha;
    if (v1) verde += "<li>Áreas verdes públicas de 1 ha o más a 300 m (en gris en el mapa): <b>" + (v1.n || "ninguna") + "</b>" +
      (v1.lista.length ? ". " + v1.lista.map(function (a) { return esc(a.nombre) + " (" + esc(a.area) + ")"; }).join(", ") + (v1.n > v1.lista.length ? " y " + (v1.n - v1.lista.length) + " más" : "") : "") + "</li>";
    if (z.verde_grande) verde += "<li>Espacio de 5 ha o más: <b>" + esc(z.verde_grande.nombre) + "</b> (" + esc(z.verde_grande.area) + "), a " + esc(z.verde_grande.d) + "</li>";
    var nav = '<div class="rezago__nav"><button type="button" data-ir="lista">← Lista de zonas</button>' +
      '<button type="button" data-ir="' + (n - 1) + '"' + (n === 1 ? " disabled" : "") + '>‹ Anterior</button>' +
      '<button type="button" data-ir="' + (n + 1) + '"' + (n === D.zonas.length ? " disabled" : "") + '>Siguiente ›</button></div>';
    var nseHtml = !p.nse_pred ? "" :
      '<p style="margin-top:12px">Nivel socioeconómico de los hogares (AMAI): predomina <b>' + esc(p.nse_pred) + "</b>.</p>" +
      '<div class="nse" aria-hidden="true">' + niveles.map(function (k) { return '<i style="width:' + (nse[k] || 0) + "%;background:" + NSE_TONO[k] + '" title="' + k + ": " + fmt(nse[k], 1) + ' %"></i>'; }).join("") + "</div>" +
      '<div class="nse-etq">' + niveles.map(function (k) { return '<span style="width:' + (nse[k] || 0) + '%">' + (nse[k] >= 6 ? k : "") + "</span>"; }).join("") + "</div>";
    $("rezagoTitulo").innerHTML = '<i style="background:' + M.color + '">' + n + "</i>" + esc(nombreZona(z)) + "<small>" + esc(z.mun) + "</small>";
    $("rezagoCuerpo").innerHTML = nav +
      '<p class="rezago__lugar" style="margin-top:12px">' + M.etq + " " + n + " de " + D.zonas.length + "</p>" +
      "<h2>" + esc(z.colonias.join(", ")) + "</h2>" +
      '<p class="rezago__lugar">' + esc(lugar) + "</p>" +
      '<div class="rezago__cifras">' +
        "<div><b>" + fmt(z.pob) + "</b><span>personas</span></div>" +
        "<div><b>" + fmt(z.dens) + "</b><span>habitantes por hectárea</span></div>" +
        "<div><b>" + fmt(z.pct300) + " %</b><span>con verde público o natural a 300 m</span></div>" +
        "<div><b>" + fmt(z.verde_vec, 1) + " %</b><span>de verde en su entorno</span></div>" +
      "</div>" +
      "<h3>Lectura</h3>" + z.lectura.map(function (f) { return "<p>" + esc(f) + "</p>"; }).join("") +
      "<h3>Lo que queda cerca</h3><ul>" + verde + "</ul>" +
      "<h3>Quién vive aquí</h3><table>" + filas.map(function (f) { return "<tr><td>" + f[0] + "</td><td>" + f[1] + "</td></tr>"; }).join("") + "</table>" + nseHtml +
      '<h3>Tres vistas de calle</h3><div class="rezago__vistas">' + [0, 1, 2].map(function (i) { return '<div class="sv" id="sv' + i + '">Buscando imágenes de calle…</div>'; }).join("") + "</div>" +
      '<p class="rezago__fuente">Zona: ' + esc(D.criterio.charAt(0).toLowerCase() + D.criterio.slice(1)) + ". Población y perfil: INEGI, Censo 2020 por manzana; nivel socioeconómico: AMAI por AGEB. Espacios verdes: OpenStreetMap (ago-2026) e INEGI. Distancias en línea recta. La lectura se escribió a partir de estas cifras. Imágenes: Google Street View, en los tres puntos más poblados y separados de la zona.</p>";
    $("rezagoCuerpo").querySelectorAll("[data-ir]").forEach(function (x) {
      x.addEventListener("click", function () {
        if (x.dataset.ir === "lista") { cerrarFicha(); minimizarLista(false); return; }
        abrirZona(modo, +x.dataset.ir);
      });
    });
    var caja = $("rezago");
    caja.hidden = false; caja.scrollTop = 0;
    minimizar(false);
    if (map) vistasCalle(z);
  }
  function vistasCalle(z) {
    var sv = new google.maps.StreetViewService();
    z.vistas.forEach(function (v, i) {
      var div = $("sv" + i);
      sv.getPanorama({ location: { lat: v[1], lng: v[0] }, radius: 250, source: google.maps.StreetViewSource.OUTDOOR, preference: google.maps.StreetViewPreference.NEAREST }, function (d, st) {
        if (!div.isConnected) return;
        if (st !== "OK" || !d) { div.textContent = "No hay imágenes de calle a menos de 250 m de este punto."; return; }
        div.textContent = "";
        var h = d.links && d.links.length ? d.links[0].heading : 0;
        new google.maps.StreetViewPanorama(div, {
          pano: d.location.pano, pov: { heading: h, pitch: 0 }, zoom: 0, addressControl: false, linksControl: false, panControl: false,
          zoomControl: false, enableCloseButton: false, fullscreenControl: true, motionTracking: false, motionTrackingControl: false, showRoadLabels: false,
        });
      });
    });
  }
  ORDEN.forEach(function (k) {
    $(ZM[k].btn).addEventListener("click", function () { prender(k, !ZM[k].on); });
  });
  /* «Comparar zonas» abre los tres grupos; al apagarlo se apagan todos y se van las barras */
  $("btnComparar").addEventListener("click", function () {
    var on = this.getAttribute("aria-pressed") !== "true";
    this.setAttribute("aria-pressed", on ? "true" : "false");
    $("grupoZonas").hidden = !on;
    if (on) minimizarLista(true);
    if (!on) ORDEN.forEach(function (k) { if (ZM[k].on) prender(k, false); });
    areas1ha(on);
    medir(on ? "comparar" : "comparar/apagar");
  });
  $("rezagoCerrar").addEventListener("click", cerrarFicha);
  $("rezagoMin").addEventListener("click", function () { minimizar(!$("rezago").classList.contains("rezago--min")); });
  $("rezagoTitulo").addEventListener("click", function () { if ($("rezago").classList.contains("rezago--min")) minimizar(false); });

  enlazar();
  fetch(DATA + "indicadores.json" + VER).then(function (r) { return r.json(); }).then(function (j) { ind = j; pintarIndicadores(); });
  cargarGoogle(window.UR_GMAPS_KEY).then(iniciarMapa).catch(function (e) {
    avisar("El mapa satelital no cargó (" + e.message + "). Los indicadores por municipio siguen disponibles en el panel.");
  });
})();
