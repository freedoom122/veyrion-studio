/* ============================================================
   VEYRION — APP.JS
   Canvas, Terminal, Estimator, GSAP, Cursor, Form, Nav, Clock
   ============================================================ */

(function () {
  "use strict";

  /* ---- guards ---- */
  var hasGSAP = typeof gsap !== "undefined";
  var hasST = hasGSAP && typeof ScrollTrigger !== "undefined";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;

  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };

  /* ============================================================
     PAGE LOADER
     ============================================================ */
  function initLoader() {
    var loader = $(".page-loader");
    if (!loader) return;
    document.body.classList.add("is-loading");
    window.addEventListener("load", function () {
      setTimeout(function () {
        loader.classList.add("is-hidden");
        document.body.classList.remove("is-loading");
      }, 400);
    });
    setTimeout(function () {
      loader.classList.add("is-hidden");
      document.body.classList.remove("is-loading");
    }, 3000);
  }

  /* ============================================================
     SCROLL PROGRESS
     ============================================================ */
  function initScrollProgress() {
    var bar = $(".scroll-progress");
    if (!bar) return;
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var h = document.documentElement;
          var pct = h.scrollTop / (h.scrollHeight - h.clientHeight);
          bar.style.transform = "scaleX(" + Math.min(pct, 1) + ")";
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ============================================================
     BACK TO TOP
     ============================================================ */
  function initBackToTop() {
    var btn = $("#back-to-top");
    if (!btn) return;
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          btn.classList.toggle("is-visible", window.scrollY > 600);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ============================================================
     MOBILE NAV
     ============================================================ */
  function initMobileNav() {
    var toggle = $(".header__toggle");
    var menu = $("#mobile-menu");
    var closeBtn = menu ? $(".mobile-nav__close", menu) : null;

    function openMenu() {
      if (!menu || !toggle) return;
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      document.body.style.overflow = "hidden";
      var first = $("a", menu);
      if (first) first.focus();
    }
    function closeMenu() {
      if (!menu || !toggle) return;
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      document.body.style.overflow = "";
      toggle.focus();
    }

    if (toggle) toggle.addEventListener("click", function () { menu.hidden ? openMenu() : closeMenu(); });
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    if (menu) $$("a", menu).forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu && !menu.hidden) closeMenu();
    });
  }

  /* ============================================================
     SMOOTH SCROLL
     ============================================================ */
  function initSmoothScroll() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (!id || id === "#") return;
        var target = $(id);
        if (!target) return;
        e.preventDefault();
        var rect = target.getBoundingClientRect();
        var top = rect.top + window.pageYOffset - 72;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
        history.pushState(null, "", id);
      });
    });
  }

  /* ============================================================
     CUSTOM CURSOR
     ============================================================ */
  function initCursor() {
    if (coarse || reduceMotion) return;
    document.body.classList.add("has-custom-cursor");
    var dot = $(".cursor-dot");
    var ring = $(".cursor-ring");
    if (!dot || !ring) return;
    var mx = 0, my = 0, rx = 0, ry = 0;
    window.addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    function loop() {
      rx += (mx - rx) * 0.15;
      ry += (my - ry) * 0.15;
      dot.style.left = mx + "px";
      dot.style.top = my + "px";
      ring.style.left = rx + "px";
      ring.style.top = ry + "px";
      requestAnimationFrame(loop);
    }
    loop();
    document.addEventListener("mouseover", function (e) {
      var hot = e.target.closest("a, button, input, select, textarea, [role=button]");
      ring.classList.toggle("is-hot", !!hot);
    });
  }

  /* ============================================================
     CANVAS — grid + node network with mouse attraction
     ============================================================ */
  function initCanvas() {
    if (reduceMotion) return;
    var canvas = $("#hero-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) { canvas.style.display = "none"; return; }

    var nodes = [];
    var count = 70;
    var mouse = { x: -1000, y: -1000 };
    var dpr = window.devicePixelRatio || 1;
    var w, h, raf;
    var time = 0;

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createNodes() {
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.8 + 0.4,
          pulse: Math.random() * Math.PI * 2
        });
      }
    }

    function draw() {
      time += 0.005;
      ctx.clearRect(0, 0, w, h);

      /* subtle grid */
      ctx.strokeStyle = "rgba(255,255,255,0.018)";
      ctx.lineWidth = 0.5;
      var gridSize = 80;
      for (var gx = 0; gx < w; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (var gy = 0; gy < h; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      /* update positions */
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += 0.02;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        /* mouse attraction (gentle pull) */
        var dx = mouse.x - n.x;
        var dy = mouse.y - n.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 10) {
          var force = (200 - dist) / 200 * 0.08;
          n.x += (dx / dist) * force;
          n.y += (dy / dist) * force;
        }
      }

      /* draw edges */
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            var alpha = (1 - dist / 160) * 0.35;
            /* mouse proximity brightens edges */
            var midX = (nodes[i].x + nodes[j].x) / 2;
            var midY = (nodes[i].y + nodes[j].y) / 2;
            var mDist = Math.sqrt((midX - mouse.x) * (midX - mouse.x) + (midY - mouse.y) * (midY - mouse.y));
            if (mDist < 200) alpha += (1 - mDist / 200) * 0.2;

            ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      /* draw nodes with pulse */
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var pulseAlpha = 0.2 + Math.sin(n.pulse) * 0.1;
        var pulseR = n.r + Math.sin(n.pulse) * 0.3;

        /* node glow near mouse */
        var mDist = Math.sqrt((n.x - mouse.x) * (n.x - mouse.x) + (n.y - mouse.y) * (n.y - mouse.y));
        if (mDist < 150) {
          var glow = (1 - mDist / 150) * 0.15;
          ctx.fillStyle = "rgba(16,185,129," + glow + ")";
          ctx.beginPath();
          ctx.arc(n.x, n.y, pulseR + 6, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = "rgba(255,255,255," + pulseAlpha + ")";
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    createNodes();
    draw();

    window.addEventListener("resize", function () { resize(); createNodes(); }, { passive: true });
    canvas.parentElement.addEventListener("mousemove", function (e) {
      var rect = canvas.parentElement.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }, { passive: true });
    canvas.parentElement.addEventListener("mouseleave", function () { mouse.x = -1000; mouse.y = -1000; }, { passive: true });

    /* pause offscreen */
    var hero = $("#hero");
    if (hero && typeof IntersectionObserver !== "undefined") {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            if (!raf) draw();
          } else {
            cancelAnimationFrame(raf);
            raf = null;
          }
        });
      }, { threshold: 0.1 });
      obs.observe(hero);
    }
  }

  /* ============================================================
     TERMINAL — with typewriter startup
     ============================================================ */
  function initTerminal() {
    var log = $("#terminal-log");
    var form = $("#terminal-form");
    var input = $("#terminal-input");
    var chips = $$(".chip");
    if (!log || !form || !input) return;

    var history = [];
    var historyIdx = -1;

    var commands = {
      "--show-stack": function () {
        return [
          '<span class="t-key">languages</span>    Rust, Go, C++, TypeScript, Python',
          '<span class="t-key">data</span>          PostgreSQL, Redis, Kafka, ClickHouse',
          '<span class="t-key">infra</span>         Kubernetes, Terraform, Docker',
          '<span class="t-key">protocols</span>     gRPC, GraphQL, REST',
          '<span class="t-key">observability</span> OpenTelemetry, Grafana, PagerDuty'
        ].join("\n");
      },
      "--benchmarks": function () {
        return [
          '<span class="t-key">p50_latency</span>   <span class="t-num">38ms</span>',
          '<span class="t-key">p99_latency</span>   <span class="t-num">142ms</span>',
          '<span class="t-key">throughput</span>    <span class="t-num">24,000 ops/sec</span> sustained',
          '<span class="t-key">uptime</span>        <span class="t-num">99.99%</span> across 147 systems',
          '<span class="t-key">mttr</span>          <span class="t-num">&lt;4 min</span> median',
          '<span class="t-key">deploy_freq</span>   <span class="t-num">daily</span> per service'
        ].join("\n");
      },
      "--architecture": function () {
        return [
          '<span class="t-dim">L6</span> Client        Interfaces, consoles, portals',
          '<span class="t-dim">L5</span> API           Versioned contracts, auth, rate limits',
          '<span class="t-dim">L4</span> Orchestration Workflows, sagas, schedulers',
          '<span class="t-dim">L3</span> Services      Domain boundaries, SLAs',
          '<span class="t-dim">L2</span> Data          Stores, streams, schemas',
          '<span class="t-dim">L1</span> Infrastructure  Compute, network, secrets'
        ].join("\n");
      },
      "--security": function () {
        return [
          '<span class="t-key">zero_trust</span>     every request authenticated, no implicit trust',
          '<span class="t-key">secrets</span>        injected at runtime, never in code or logs',
          '<span class="t-key">audit</span>          immutable log of every write operation',
          '<span class="t-key">rotation</span>       automated key rotation, zero-downtime',
          '<span class="t-key">encryption</span>     at rest (AES-256) + in transit (TLS 1.3)'
        ].join("\n");
      },
      "--contact": function () {
        return '<span class="t-str">admin@example.com</span>  \u2014  2 business day response  \u2014  New York, remote-first';
      },
      "help": function () {
        return "available commands:\n  --show-stack\n  --benchmarks\n  --architecture\n  --security\n  --contact\n  clear";
      },
      "clear": function () {
        log.innerHTML = "";
        return null;
      }
    };

    function stamp() {
      var d = new Date();
      var hh = String(d.getHours()).padStart(2, "0");
      var mm = String(d.getMinutes()).padStart(2, "0");
      var ss = String(d.getSeconds()).padStart(2, "0");
      return '<span class="t-dim">[' + hh + ":" + mm + ":" + ss + ']</span> ';
    }

    function run(cmd) {
      var trimmed = cmd.trim();
      if (!trimmed) return;
      history.push(trimmed);
      historyIdx = history.length;

      log.innerHTML += stamp() + '<span class="t-prompt">&gt;</span> ' + escaped(trimmed) + "\n";

      var fn = commands[trimmed.toLowerCase()];
      if (fn) {
        var out = fn();
        if (out !== null) log.innerHTML += out + "\n";
      } else {
        log.innerHTML += '<span class="t-dim">unknown command: ' + escaped(trimmed) + '  (try "help")</span>\n';
      }
      log.scrollTop = log.scrollHeight;
    }

    function escaped(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      run(input.value);
      input.value = "";
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIdx > 0) { historyIdx--; input.value = history[historyIdx]; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx < history.length - 1) { historyIdx++; input.value = history[historyIdx]; }
        else { historyIdx = history.length; input.value = ""; }
      } else if (e.key === "Escape") {
        input.value = "";
        input.blur();
      }
    });

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cmd = chip.getAttribute("data-cmd");
        if (cmd) {
          chips.forEach(function (c) { c.classList.remove("is-active"); });
          chip.classList.add("is-active");
          run(cmd);
          input.focus();
        }
      });
    });

    /* typewriter startup */
    var lines = [
      '<span class="t-str">VEYRION ARCHITECTURE CONSOLE</span>',
      'System ready. 147 systems online.',
      'Type a command or click a chip below.',
      'Type <span class="t-dim">"help"</span> for available commands.',
      ''
    ];
    var lineIdx = 0;
    function typeLine() {
      if (lineIdx >= lines.length) return;
      log.innerHTML += stamp() + lines[lineIdx] + "\n";
      log.scrollTop = log.scrollHeight;
      lineIdx++;
      setTimeout(typeLine, reduceMotion ? 0 : 120);
    }
    typeLine();
  }

  /* ============================================================
     ARCHITECTURE DIAGRAM
     ============================================================ */
  function initArchDiagram() {
    var diagram = $("#arch-diagram");
    if (!diagram) return;
    var layers = $$(".arch-layer", diagram);
    var detail = $("#arch-detail");
    if (!detail) return;

    var data = {
      "L6": { label: "L6 / CLIENT", title: "Interfaces, operator consoles, partner portals", body: "Browser and native clients talk only to versioned APIs. No direct datastore access. Offline-tolerant where the domain requires it." },
      "L5": { label: "L5 / API", title: "Versioned contracts, auth, rate limits", body: "Every external contract is versioned. Breaking changes ship behind a new path. Auth is a gateway concern, not a per-service afterthought." },
      "L4": { label: "L4 / ORCHESTRATION", title: "Workflows, sagas, schedulers, compensation", body: "Long-running work is a workflow with a name, a history, and a compensating action. Cron jobs are not an architecture." },
      "L3": { label: "L3 / SERVICES", title: "Domain services with explicit boundaries", body: "Services own a domain. They do not reach into each other's tables. Failures are isolated; latency budgets are explicit." },
      "L2": { label: "L2 / DATA", title: "Stores, streams, caches, schemas", body: "Data is modeled once. Streams carry facts. Caches are disposable. Migrations are forward-only and reversible in rehearsal." },
      "L1": { label: "L1 / INFRASTRUCTURE", title: "Compute, network, secrets, observability", body: "Infrastructure is code. Secrets are injected, never baked. Telemetry is a product requirement, not a dashboard you add later." }
    };

    layers.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-layer");
        var d = data[key];
        if (!d) return;
        layers.forEach(function (l) {
          l.classList.remove("is-active");
          l.classList.add("is-dimmed");
          l.setAttribute("aria-pressed", "false");
        });
        btn.classList.remove("is-dimmed");
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
        detail.innerHTML =
          '<span class="arch__detail-label">' + d.label + '</span>' +
          '<h3 class="arch__detail-title">' + d.title + '</h3>' +
          '<p class="arch__detail-body">' + d.body + '</p>';
      });
    });
  }

  /* ============================================================
     ESTIMATOR
     ============================================================ */
  function initEstimator() {
    var form = $("#estimator");
    if (!form) return;

    var typeScore = {
      "Custom Application": 2, "Backend Platform": 3, "Automation": 2,
      "AI System": 3, "Data Infrastructure": 3, "Legacy Modernization": 4
    };
    var cxScore = {
      "Contained (one team, one domain)": 1,
      "Cross-cutting (several services, shared data)": 2,
      "Systemic (platform-level, multiple teams)": 3
    };
    var timeScore = {
      "8\u201312 weeks": 1, "8-12 weeks": 1,
      "3\u20136 months": 2, "3-6 months": 2,
      "6\u201312 months": 3, "6-12 months": 3,
      "12+ months": 4
    };
    var ratingLabels = ["", "Focused", "Substantial", "Demanding", "Severe", "Flagship"];

    function update() {
      var t = typeScore[$("#est-type").value] || 2;
      var c = cxScore[$("#est-cx").value] || 1;
      var tm = timeScore[$("#est-time").value] || 1;
      var modelVal = $("#est-model").value;
      var total = t + c + tm;
      var rating = Math.min(5, Math.max(1, Math.round(total / 2)));

      var scope;
      if (total <= 5) scope = "A tightly scoped system with a single primary surface.";
      else if (total <= 8) scope = "A multi-service system with explicit integration risk.";
      else scope = "A platform engagement. Architecture is the product.";

      var windowBase = $("#est-time").value;
      var windowSuffix = "";
      if (modelVal.indexOf("Advisory") !== -1) windowSuffix = " Discovery-heavy; delivery owned by your team.";
      else if (modelVal.indexOf("Embedded") !== -1) windowSuffix = " We staff the critical path.";
      else if (modelVal.indexOf("Joint") !== -1) windowSuffix = " Shared cadence, shared review.";

      var modelText;
      if (modelVal.indexOf("Advisory") !== -1) modelText = "Architecture partnership. We design, your team builds.";
      else if (modelVal.indexOf("Embedded") !== -1) modelText = "Core team from Veyrion, integrated with yours.";
      else modelText = "Paired delivery. Your engineers, our technical lead.";

      var estScope = $("#est-scope");
      var estWindow = $("#est-window");
      var estLabel = $("#est-rating-label");
      var bars = $$(".estimator__rating-bar");
      var estModel = $("#est-model-out");

      if (estScope) estScope.textContent = scope;
      if (estWindow) estWindow.innerHTML = windowBase + windowSuffix;
      if (estLabel) estLabel.textContent = ratingLabels[rating];
      if (estModel) estModel.textContent = modelText;
      bars.forEach(function (bar, i) { bar.classList.toggle("is-filled", i < rating); });
    }

    $$(".estimator__select", form).forEach(function (sel) {
      sel.addEventListener("change", update);
    });
    update();
  }

  /* ============================================================
     BENTO CARD TILT
     ============================================================ */
  function initBentoTilt() {
    if (coarse || reduceMotion) return;
    $$(".bento-card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var rect = card.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty("--mouse-x", x + "%");
        card.style.setProperty("--mouse-y", y + "%");
      });
    });
  }

  /* ============================================================
     CONTACT FORM
     ============================================================ */
  function initContactForm() {
    var form = $("#contact-form");
    var success = $("#form-success");
    if (!form || !success) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      $$(".is-invalid", form).forEach(function (n) { n.classList.remove("is-invalid"); });
      $$(".field-error", form).forEach(function (n) { n.textContent = ""; });

      var name = form.elements.name;
      var email = form.elements.email;
      var company = form.elements.company;
      var type = form.elements.type;
      var brief = form.elements.brief;
      var firstBad = null;

      function fail(el, msg) {
        el.classList.add("is-invalid");
        var err = el.parentElement.querySelector(".field-error");
        if (err) err.textContent = msg;
        if (!firstBad) firstBad = el;
      }

      if (!name.value.trim() || name.value.trim().length < 2) fail(name, "Enter your name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) fail(email, "Use a work email.");
      if (!company.value.trim() || company.value.trim().length < 2) fail(company, "Enter your company name.");
      if (!type.value) fail(type, "Select a project type.");
      if (!brief.value.trim() || brief.value.trim().length < 40) fail(brief, "Give us at least 40 characters so we can prepare.");

      if (firstBad) { firstBad.focus(); return; }

      var submitBtn = form.querySelector("button[type=submit]");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending..."; }

      var payload = {
        name: name.value.trim(),
        email: email.value.trim(),
        company: company.value.trim(),
        type: type.value,
        brief: brief.value.trim()
      };

      fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function () { return res; });
      }).then(function () {
        form.hidden = true;
        success.hidden = false;
        var heading = success.querySelector("h3, p");
        if (heading && heading.focus) heading.focus();
      }).catch(function () {
        form.hidden = true;
        success.hidden = false;
        var heading = success.querySelector("h3, p");
        if (heading && heading.focus) heading.focus();
      }).finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Request architecture call"; }
      });
    });

    var resetBtn = $("[data-reset-form]");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        success.hidden = true;
        form.hidden = false;
        form.reset();
        form.elements.name.focus();
      });
    }

    $$(".field input, .field textarea, .field select", form).forEach(function (el) {
      el.addEventListener("input", function () {
        el.classList.remove("is-invalid");
        var err = el.parentElement.querySelector(".field-error");
        if (err) err.textContent = "";
      });
    });
  }

  /* ============================================================
     COPY EMAIL
     ============================================================ */
  function initCopyEmail() {
    var btn = $("#copy-email");
    var toast = $("#toast") || $("#toast-global");
    if (!btn) return;
    var EMAIL = "admin@example.com";

    function showCopied() {
      btn.textContent = "Copied";
      if (toast) {
        toast.textContent = "Email copied \u2014 " + EMAIL;
        toast.classList.add("is-on");
        setTimeout(function () { toast.classList.remove("is-on"); }, 2000);
      }
      setTimeout(function () { btn.textContent = "Copy direct email"; }, 2000);
    }

    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = EMAIL;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showCopied(); }
      catch (_) { btn.textContent = EMAIL; }
      ta.remove();
    }

    btn.addEventListener("click", function () {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(EMAIL).then(showCopied).catch(fallback);
      } else fallback();
    });
  }

  /* ============================================================
     STUDIO CLOCK
     ============================================================ */
  function initClock() {
    var el = $("#studio-clock");
    if (!el) return;
    var CITY = "New York";
    var TZ = "America/New_York";
    var fmt = null;
    try {
      fmt = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: TZ, timeZoneName: "short"
      });
    } catch (_) { return; }

    function tick() {
      var parts = {};
      fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      el.textContent = CITY + " \u00B7 " + parts.hour + ":" + parts.minute + ":" + parts.second + " \u00B7 " + parts.timeZoneName;
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ============================================================
     GSAP — scroll reveals + parallax + stagger
     ============================================================ */
  function initScrollReveals() {
    if (!hasST || reduceMotion) return;
    gsap.registerPlugin(ScrollTrigger);

    /* section inner children stagger */
    $$(".section__inner").forEach(function (el) {
      gsap.from(el.children, {
        opacity: 0, y: 24, duration: 0.6, stagger: 0.04,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 85%", once: true }
      });
    });

    /* bento cards stagger */
    var bentoCards = $$(".bento-card");
    if (bentoCards.length) {
      gsap.from(bentoCards, {
        opacity: 0, y: 30, duration: 0.5, stagger: 0.07,
        ease: "power2.out",
        scrollTrigger: { trigger: ".bento", start: "top 80%", once: true }
      });
    }

    /* build cards stagger */
    var buildCards = $$(".build");
    if (buildCards.length) {
      gsap.from(buildCards, {
        opacity: 0, y: 24, duration: 0.5, stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: ".builds-grid", start: "top 80%", once: true }
      });
    }

    /* timeline steps stagger */
    var steps = $$(".timeline-step");
    if (steps.length) {
      gsap.from(steps, {
        opacity: 0, x: -16, duration: 0.4, stagger: 0.06,
        ease: "power2.out",
        scrollTrigger: { trigger: ".timeline", start: "top 80%", once: true }
      });
    }

    /* principles stagger */
    var principles = $$(".principle");
    if (principles.length) {
      gsap.from(principles, {
        opacity: 0, y: 20, duration: 0.5, stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: ".principles-grid", start: "top 80%", once: true }
      });
    }

    /* arch layers stagger */
    var archLayers = $$(".arch-layer");
    if (archLayers.length) {
      gsap.from(archLayers, {
        opacity: 0, x: -12, duration: 0.35, stagger: 0.04,
        ease: "power2.out",
        scrollTrigger: { trigger: ".arch", start: "top 80%", once: true }
      });
    }
  }

  /* ============================================================
     HERO GSAP ENTRANCE — coordinated sequence
     ============================================================ */
  function initHeroAnimation() {
    if (!hasGSAP || reduceMotion) return;
    var tl = gsap.timeline({ delay: 0.4 });
    tl.from(".hero__eyebrow", { opacity: 0, y: 12, duration: 0.4, ease: "power3.out" })
      .from(".hero__title span", { opacity: 0, y: 20, duration: 0.45, stagger: 0.08, ease: "power3.out" }, "-=0.15")
      .from(".hero__body", { opacity: 0, y: 12, duration: 0.4, ease: "power2.out" }, "-=0.15")
      .from(".hero__actions", { opacity: 0, y: 10, duration: 0.35, ease: "power2.out" }, "-=0.1")
      .from(".hero__metrics li", { opacity: 0, y: 10, duration: 0.3, stagger: 0.05, ease: "power2.out" }, "-=0.15")
      .from(".terminal", { opacity: 0, y: 16, duration: 0.5, ease: "power2.out" }, "-=0.2");
  }

  /* ============================================================
     KEYBOARD SHORTCUTS
     ============================================================ */
  function initKeyboard() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        var ti = $("#terminal-input");
        if (ti) ti.focus();
      }
    });
  }

  /* ============================================================
     DOCS SEARCH
     ============================================================ */
  function initDocsSearch() {
    var nav = $(".docs-nav");
    if (!nav) return;
    var links = $$(".docs-nav__link", nav);
    var sections = $$(".docs-section");
    if (!links.length || !sections.length) return;

    /* filter on click */
    links.forEach(function (link) {
      link.addEventListener("click", function () {
        links.forEach(function (l) { l.classList.remove("is-active"); });
        link.classList.add("is-active");
      });
    });

    /* highlight on scroll */
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var scrollY = window.scrollY + 100;
          for (var i = sections.length - 1; i >= 0; i--) {
            if (sections[i].offsetTop <= scrollY) {
              links.forEach(function (l) { l.classList.remove("is-active"); });
              var target = $(".docs-nav__link[href='#" + sections[i].id + "']");
              if (target) target.classList.add("is-active");
              break;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ============================================================
     READING PROGRESS (blog)
     ============================================================ */
  function initReadingProgress() {
    var bar = $(".scroll-progress");
    if (!bar || !$(".blog-card")) return;
    /* reuse scroll progress for blog pages */
  }

  /* ============================================================
     STATUS DASHBOARD
     ============================================================ */
  function initStatusDashboard() {
    var dash = $(".status-dash");
    if (!dash) return;
    /* dashboard is static, just animate in */
    if (!hasST || reduceMotion) return;
    var cards = $$(".status-card", dash);
    gsap.from(cards, {
      opacity: 0, y: 16, duration: 0.4, stagger: 0.06,
      ease: "power2.out",
      scrollTrigger: { trigger: dash, start: "top 85%", once: true }
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  function safe(fn) { try { fn(); } catch (e) { /* silent */ } }

  document.addEventListener("DOMContentLoaded", function () {
    safe(initLoader);
    safe(initScrollProgress);
    safe(initBackToTop);
    safe(initMobileNav);
    safe(initSmoothScroll);
    safe(initCursor);
    safe(initCanvas);
    safe(initTerminal);
    safe(initArchDiagram);
    safe(initEstimator);
    safe(initBentoTilt);
    safe(initContactForm);
    safe(initCopyEmail);
    safe(initClock);
    safe(initScrollReveals);
    safe(initHeroAnimation);
    safe(initKeyboard);
    safe(initDocsSearch);
    safe(initReadingProgress);
    safe(initStatusDashboard);
  });

})();
