/* DALI AI Systems: progressive enhancement only. The page is complete without this file.
   No network requests, no storage, no tracking. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  doc.classList.add("js");

  /* Header state */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      doc.classList.toggle("is-scrolled", window.scrollY > 40);
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Reveal fallback where CSS view timelines are not supported */
  var supportsView = window.CSS && CSS.supports && CSS.supports("animation-timeline: view()");
  if (!supportsView && !reduce.matches && "IntersectionObserver" in window) {
    var targets = document.querySelectorAll(".reveal, .product-list li");
    doc.classList.add("io-reveal");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach(function (el) { io.observe(el); });
    /* Safety net: never leave content hidden */
    window.setTimeout(function () {
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add("in");
      });
    }, 2500);
  }

  /* No visible play/pause control. Decorative motion still respects
     prefers-reduced-motion, and the canvas ticker already stops while
     the tab is hidden. */
  if (reduce.matches) {
    doc.classList.add("motion-paused");
  }

  /* Background scene. One rAF ticker drives two things:
     1. a smoothed ("gliding") scroll position: the scene layer eases towards
        the real scroll position instead of snapping to it. Native page scroll
        is never touched; only the decorative background is eased.
     2. the particle mesh canvas (drifts, links nearby points, parallaxes).
     All of this writes transform/opacity or canvas pixels only, never
     reads layout inside the loop, and stops when the tab is hidden, the
     motion toggle is on, or (for the glide) once it has settled. */
  var scene = document.querySelector(".scene");
  if (scene && !reduce.matches && window.requestAnimationFrame) {
    var layer = scene.querySelector(".scene-layer");
    var canvas = document.createElement("canvas");
    canvas.className = "scene-mesh";
    canvas.setAttribute("aria-hidden", "true");
    scene.insertBefore(canvas, scene.querySelector(".scene-scrim"));
    var ctx = canvas.getContext("2d", { alpha: true });
    var pts = [];
    var W = 0, H = 0, dpr = 1, link = 140, tickRaf = 0, lastT = 0;
    var scrollMax = 1, target = 0, prog = 0;
    var pointer = { x: -9999, y: -9999 };
    var HUES = 8, ALPHAS = 5;
    var linePaths = [], dotPaths = [];

    /* Same path as the CSS fx-scene-scroll keyframes (used without JS). */
    var KEYS = [
      [0, 0, 0, 0, 1, 0],
      [0.35, -4, -6, 18, 1.08, 0.45],
      [0.7, 5, -10, -12, 1.16, 0.75],
      [1, 0, -14, 30, 1.05, 1]
    ];
    function sceneAt(p) {
      var k = 1;
      while (k < KEYS.length - 1 && p > KEYS[k][0]) k++;
      var a = KEYS[k - 1], b = KEYS[k];
      var f = (p - a[0]) / (b[0] - a[0]);
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      var o = [];
      for (var i = 1; i < 6; i++) o.push(a[i] + (b[i] - a[i]) * f);
      return o;
    }
    function applyScene(p) {
      if (!layer) return;
      var v = sceneAt(p);
      layer.style.transform = "translate3d(" + v[0].toFixed(3) + "%," + v[1].toFixed(3) + "%,0) rotate(" + v[2].toFixed(3) + "deg) scale(" + v[3].toFixed(4) + ")";
      layer.style.setProperty("--tint", v[4].toFixed(3));
    }

    function measure() {
      scrollMax = Math.max(1, doc.scrollHeight - window.innerHeight);
      target = Math.min(1, Math.max(0, window.scrollY / scrollMax));
    }

    function size() {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, W < 640 ? 1 : 1.5);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      link = W < 640 ? 100 : 135;
      var n = Math.round(Math.min(70, Math.max(26, (W * H) / 18000)));
      while (pts.length < n) {
        pts.push({ x: Math.random() * W, y: Math.random() * H * 1.6, z: 0.35 + Math.random() * 0.65,
          vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, h: Math.random(), sy: 0 });
      }
      pts.length = n;
      measure();
    }

    function hueIndex(x) { x = x - Math.floor(x); return Math.min(HUES - 1, Math.floor(x * HUES)); }

    function drawMesh(dt) {
      var i, j, a, b, dx, dy, d2, k, span = H * 1.6, shift = prog * H * 0.6, link2 = link * link;
      for (i = 0; i < pts.length; i++) {
        a = pts[i];
        a.x += a.vx * dt * 0.06 * (1 + a.z);
        a.y += a.vy * dt * 0.06 * (1 + a.z);
        if (a.x < -20) a.x = W + 20; else if (a.x > W + 20) a.x = -20;
        if (a.y < -20) a.y = span; else if (a.y > span) a.y = -20;
        a.sy = ((a.y - shift * a.z) % span + span) % span - H * 0.3;
      }
      ctx.clearRect(0, 0, W, H);
      /* Batch lines into a few hue x alpha buckets: ~40 strokes instead of
         one stroke (and one colour string) per line. */
      for (k = 0; k < HUES * ALPHAS; k++) linePaths[k] = null;
      for (i = 0; i < pts.length; i++) {
        a = pts[i];
        for (j = i + 1; j < pts.length; j++) {
          b = pts[j];
          dx = a.x - b.x; if (dx > link || dx < -link) continue;
          dy = a.sy - b.sy; if (dy > link || dy < -link) continue;
          d2 = dx * dx + dy * dy;
          if (d2 >= link2) continue;
          var al = (1 - Math.sqrt(d2) / link) * Math.min(a.z, b.z);
          var ai = Math.min(ALPHAS - 1, Math.floor(al * ALPHAS));
          k = hueIndex(a.h + prog) * ALPHAS + ai;
          var path = linePaths[k] || (linePaths[k] = []);
          path.push(a.x, a.sy, b.x, b.sy);
        }
      }
      ctx.lineWidth = 1;
      for (k = 0; k < HUES * ALPHAS; k++) {
        var lp = linePaths[k];
        if (!lp) continue;
        var hue = 225 + 60 * Math.sin(((Math.floor(k / ALPHAS) + 0.5) / HUES) * 6.283);
        ctx.strokeStyle = "hsla(" + hue.toFixed(0) + ",95%,72%," + (((k % ALPHAS) + 0.5) / ALPHAS * 0.5).toFixed(3) + ")";
        ctx.beginPath();
        for (i = 0; i < lp.length; i += 4) { ctx.moveTo(lp[i], lp[i + 1]); ctx.lineTo(lp[i + 2], lp[i + 3]); }
        ctx.stroke();
      }
      for (k = 0; k < HUES * 2; k++) dotPaths[k] = null;
      for (i = 0; i < pts.length; i++) {
        a = pts[i];
        var near = Math.abs(a.x - pointer.x) < 120 && Math.abs(a.sy - pointer.y) < 120;
        k = hueIndex(a.h + prog * 1.5) * 2 + (near ? 1 : 0);
        (dotPaths[k] || (dotPaths[k] = [])).push(a);
      }
      for (k = 0; k < HUES * 2; k++) {
        var dp = dotPaths[k];
        if (!dp) continue;
        var nr = k % 2 === 1;
        var hue2 = 215 + 70 * Math.sin(((Math.floor(k / 2) + 0.5) / HUES) * 6.283);
        ctx.fillStyle = "hsla(" + hue2.toFixed(0) + ",100%," + (nr ? 88 : 76) + "%,0.7)";
        ctx.beginPath();
        for (i = 0; i < dp.length; i++) {
          a = dp[i];
          var r = (nr ? 2.2 : 1.1) * (0.6 + a.z);
          ctx.moveTo(a.x + r, a.sy);
          ctx.arc(a.x, a.sy, r, 0, 6.283);
        }
        ctx.fill();
      }
    }

    function paused() { return document.hidden || doc.classList.contains("motion-paused"); }

    function tick(t) {
      tickRaf = 0;
      if (paused()) return;
      var dt = lastT ? Math.min(48, t - lastT) : 16;
      lastT = t;
      /* Frame-rate independent ease towards the real scroll position
         (time constant ~0.16s): the background glides after the page. */
      var diff = target - prog;
      prog = Math.abs(diff) < 0.00005 ? target : prog + diff * (1 - Math.exp(-dt / 160));
      applyScene(prog);
      drawMesh(dt);
      tickRaf = window.requestAnimationFrame(tick);
    }

    function start() {
      if (!tickRaf && !paused()) {
        lastT = 0;
        tickRaf = window.requestAnimationFrame(tick);
      }
    }

    size();
    prog = target;
    applyScene(prog);
    window.addEventListener("scroll", function () {
      target = Math.min(1, Math.max(0, window.scrollY / scrollMax));
    }, { passive: true });
    window.addEventListener("resize", size, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);
    window.addEventListener("pointermove", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    document.addEventListener("visibilitychange", start);
    window.requestAnimationFrame(function () { canvas.classList.add("on"); });
    start();
  }

  if (reduce.matches || !finePointer.matches) return;

  /* Pointer effects: hero glow, lens tilt, card spotlight, magnetic buttons.
     All batched into one rAF; rects are read once per frame at most. */
  var hero = document.querySelector(".hero");
  var tilt = document.querySelector(".lens-tilt");
  var raf = 0;
  var last = null;
  var cardTarget = null, cardEvt = null;
  var magTarget = null, magEvt = null;

  function frame() {
    raf = 0;
    var e = last, r;
    if (e && hero) {
      var hr = hero.getBoundingClientRect();
      if (e.clientY >= hr.top && e.clientY <= hr.bottom) {
        hero.style.setProperty("--px", (e.clientX - hr.left) + "px");
        hero.style.setProperty("--py", (e.clientY - hr.top) + "px");
        doc.classList.add("has-pointer");
        if (tilt && !doc.classList.contains("motion-paused")) {
          var nx = (e.clientX / window.innerWidth) - 0.5;
          var ny = (e.clientY - hr.top) / hr.height - 0.5;
          tilt.style.setProperty("--tilt-x", (ny * -14).toFixed(2) + "deg");
          tilt.style.setProperty("--tilt-y", (nx * 18).toFixed(2) + "deg");
        }
      } else {
        doc.classList.remove("has-pointer");
      }
    }
    if (cardTarget && cardEvt) {
      r = cardTarget.getBoundingClientRect();
      cardTarget.style.setProperty("--mx", (cardEvt.clientX - r.left) + "px");
      cardTarget.style.setProperty("--my", (cardEvt.clientY - r.top) + "px");
      cardEvt = null;
    }
    if (magTarget && magEvt) {
      r = magTarget.getBoundingClientRect();
      var dx = magEvt.clientX - (r.left + r.width / 2);
      var dy = magEvt.clientY - (r.top + r.height / 2);
      magTarget.style.setProperty("--mag-x", (dx * 0.28).toFixed(1) + "px");
      magTarget.style.setProperty("--mag-y", (dy * 0.28).toFixed(1) + "px");
      magEvt = null;
    }
    last = null;
  }
  function queue() { if (!raf) raf = window.requestAnimationFrame(frame); }

  window.addEventListener("pointermove", function (e) {
    last = e;
    queue();
  }, { passive: true });

  document.querySelectorAll(".spot").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      cardTarget = card; cardEvt = e; queue();
    }, { passive: true });
  });

  document.querySelectorAll(".magnetic").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      magTarget = el; magEvt = e; queue();
    }, { passive: true });
    el.addEventListener("pointerleave", function () {
      if (magTarget === el) { magTarget = null; magEvt = null; }
      el.style.setProperty("--mag-x", "0px");
      el.style.setProperty("--mag-y", "0px");
    });
  });
})();
