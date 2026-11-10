/* ============================================================
   VEYRION — APP.JS
   Canvas, Terminal, Estimator, GSAP, Cursor, Form, Nav, Clock
   ============================================================ */

(function () {
  "use strict";

  /* ---- API base (GitHub Pages -> Render backend, or relative on Render) ---- */
  var RENDER_BACKEND = 'https://veyrion-studio.onrender.com';
  var API_BASE = (location.hostname.indexOf('github.io') !== -1) ? RENDER_BACKEND : '';

  /* ---- guards ---- */
  var hasGSAP = typeof gsap !== "undefined";
  var hasST = hasGSAP && typeof ScrollTrigger !== "undefined";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var SUPABASE_URL = "https://dhqtzbagyvsoooyjqauh.supabase.co";
  var SUPABASE_PUBLIC_KEY = "sb_publishable_1zqs825S2m9GA1lIgTkzIA_IYdxO7p6";
  var AUTH_SESSION_KEY = "veyrion.auth.session.v1";
  var currentAccessToken = "";

  function authHeaders(headers) {
    headers = headers || {};
    if (currentAccessToken) headers.Authorization = "Bearer " + currentAccessToken;
    return headers;
  }
  function authRequest(path, body, token) {
    var headers = { apikey:SUPABASE_PUBLIC_KEY, "Content-Type":"application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(SUPABASE_URL + path, { method:"POST", headers:headers, body:JSON.stringify(body || {}), cache:"no-store" })
      .then(function(response){ return response.json().catch(function(){return {};}).then(function(data){ if(!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Account request failed."); return data; }); });
  }
  function setCustomerSession(data) {
    var session = data && data.session ? data.session : data;
    if (!session || !session.access_token) return false;
    var stored = { access_token:session.access_token, refresh_token:session.refresh_token || "", expires_at:session.expires_at || (Math.floor(Date.now()/1000) + (session.expires_in || 3600)) };
    currentAccessToken = stored.access_token;
    try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(stored)); } catch (_) {}
    updateAuthNav(); return true;
  }
  function clearCustomerSession() {
    currentAccessToken = "";
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch (_) {}
    updateAuthNav();
  }
  function restoreCustomerSession() {
    var stored;
    try { stored = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null"); } catch (_) { stored = null; }
    if (!stored || !stored.access_token) { updateAuthNav(); return; }
    if (stored.expires_at > Math.floor(Date.now()/1000) + 60) { currentAccessToken = stored.access_token; updateAuthNav(); return; }
    if (!stored.refresh_token) { clearCustomerSession(); return; }
    authRequest("/auth/v1/token?grant_type=refresh_token", {refresh_token:stored.refresh_token})
      .then(setCustomerSession).catch(clearCustomerSession);
  }
  function ensureAuthUI() {
    if (!$("#auth-modal")) {
      var modal = document.createElement("div");
      modal.className = "auth-modal"; modal.id = "auth-modal"; modal.hidden = true;
      modal.innerHTML = '<div class="auth-modal__backdrop" data-auth-close></div><section class="auth-modal__card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title"><button class="auth-modal__close" type="button" data-auth-close aria-label="Close">×</button><p class="section__label" id="auth-modal-mode">ACCOUNT ACCESS</p><h2 id="auth-modal-title">Welcome back.</h2><p class="auth-modal__sub" id="auth-modal-sub">Sign in to continue.</p><form id="auth-login-form" class="auth-form"><div class="field"><label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="email" required></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" autocomplete="current-password" required></div><button class="btn btn--primary" type="submit">Sign in</button><p class="auth-error" id="auth-login-error" role="alert"></p></form><form id="auth-signup-form" class="auth-form" hidden><div class="field"><label for="auth-name">Name</label><input id="auth-name" type="text" autocomplete="name" minlength="2" required></div><div class="field"><label for="auth-signup-email">Email</label><input id="auth-signup-email" type="email" autocomplete="email" required></div><div class="field"><label for="auth-company">Company</label><input id="auth-company" type="text" autocomplete="organization" minlength="2" required></div><div class="field"><label for="auth-signup-password">Password</label><input id="auth-signup-password" type="password" autocomplete="new-password" minlength="14" required><p class="field-help">At least 14 characters.</p></div><button class="btn btn--primary" type="submit">Create account</button><p class="auth-error" id="auth-signup-error" role="status"></p></form><button class="auth-switch" id="auth-switch" type="button">Need an account? Create one</button><p class="auth-modal__note">Your account keeps enquiries and call requests attached to you.</p></section>';
      document.body.appendChild(modal);
    }
    var headerRight = $(".header__right");
    if (headerRight && !$("#auth-nav")) {
      var nav = document.createElement("div"); nav.className = "auth-nav"; nav.id = "auth-nav";
      nav.innerHTML = '<button class="header__auth" id="auth-open" type="button">Sign in</button><button class="header__auth header__auth--primary" id="signup-open" type="button">Create account</button><button class="header__auth" id="auth-logout" type="button" hidden>Sign out</button>';
      headerRight.insertBefore(nav, headerRight.firstChild);
    }
    var mobile = $("#mobile-menu");
    if (mobile && !$(".mobile-nav__account", mobile)) {
      var account = document.createElement("div"); account.className = "mobile-nav__account";
      account.innerHTML = '<button type="button" data-auth-open>Sign in</button><button type="button" data-auth-signup>Create account</button><button type="button" data-auth-logout hidden>Sign out</button>';
      mobile.appendChild(account);
    }
    var currentPage = location.pathname.split('/').pop() || 'index.html';
    $$(".header__nav a, .mobile-nav a").forEach(function(link){
      var href = link.getAttribute("href") || "";
      if (href === "#contact" && currentPage !== "index.html") link.setAttribute("href", "contact.html");
      else if (href.charAt(0) === "#" && currentPage !== "index.html") link.setAttribute("href", "index.html" + href);
      var target = link.getAttribute("href") || "";
      if (target === currentPage) link.classList.add("is-active");
    });
  }
  function openAuth(mode) {
    var modal = $("#auth-modal"); if (!modal) return;
    var signup = mode === "signup";
    $("#auth-login-form").hidden = signup; $("#auth-signup-form").hidden = !signup;
    $("#auth-modal-mode").textContent = signup ? "CREATE ACCOUNT" : "ACCOUNT ACCESS";
    $("#auth-modal-title").textContent = signup ? "A better way to work starts here." : "Welcome back.";
    $("#auth-modal-sub").textContent = signup ? "Create an account to send a project brief or request a call." : "Sign in to continue to your project workspace.";
    $("#auth-switch").textContent = signup ? "Already have an account? Sign in" : "New to Veyrion? Create an account";
    $("#auth-login-error").textContent = ""; $("#auth-signup-error").textContent = "";
    modal.hidden = false; document.body.classList.add("auth-open");
    window.setTimeout(function(){ (signup ? $("#auth-name") : $("#auth-email")).focus(); },40);
  }
  function closeAuth() { var modal=$("#auth-modal"); if(modal) modal.hidden=true; document.body.classList.remove("auth-open"); }
  function updateAuthNav() {
    var signedIn = Boolean(currentAccessToken);
    ["#auth-open","[data-auth-open]"].forEach(function(sel){ $$(sel).forEach(function(el){el.hidden=signedIn;}); });
    ["#signup-open","[data-auth-signup]"].forEach(function(sel){ $$(sel).forEach(function(el){el.hidden=signedIn;}); });
    ["#auth-logout","[data-auth-logout]"].forEach(function(sel){ $$(sel).forEach(function(el){el.hidden=!signedIn;}); });
  }
  function requireCustomerAuth() { if (currentAccessToken) return true; openAuth("login"); return false; }
  function initCustomerAuth() {
    ensureAuthUI(); restoreCustomerSession();
    $("#auth-open") && $("#auth-open").addEventListener("click",function(){openAuth("login");});
    $("#signup-open") && $("#signup-open").addEventListener("click",function(){openAuth("signup");});
    $$("[data-auth-open]").forEach(function(el){el.addEventListener("click",function(){openAuth("login");});});
    $$("[data-auth-signup]").forEach(function(el){el.addEventListener("click",function(){openAuth("signup");});});
    ["#auth-logout","[data-auth-logout]"].forEach(function(sel){$$(sel).forEach(function(el){el.addEventListener("click",function(){authRequest("/auth/v1/logout",{},currentAccessToken).catch(function(){}).finally(function(){clearCustomerSession();closeAuth();});});});});
    $$("#auth-modal [data-auth-close]").forEach(function(el){el.addEventListener("click",closeAuth);});
    $("#auth-switch").addEventListener("click",function(){openAuth($("#auth-signup-form").hidden?"signup":"login");});
    $("#auth-login-form").addEventListener("submit",function(event){
      event.preventDefault(); var button=$("button[type=submit]",event.currentTarget); var error=$("#auth-login-error"); error.textContent=""; if(button){button.disabled=true;button.textContent="Signing in…";}
      authRequest("/auth/v1/token?grant_type=password",{email:$("#auth-email").value.trim(),password:$("#auth-password").value})
        .then(function(data){if(!setCustomerSession(data))throw new Error("No session was returned. Please try again.");closeAuth();})
        .catch(function(err){error.textContent=err.message||"We could not sign you in.";})
        .finally(function(){if(button){button.disabled=false;button.textContent="Sign in";}});
    });
    $("#auth-signup-form").addEventListener("submit",function(event){
      event.preventDefault(); var button=$("button[type=submit]",event.currentTarget); var error=$("#auth-signup-error"); error.textContent=""; if(button){button.disabled=true;button.textContent="Creating account…";}
      var redirect="/auth/v1/signup?redirect_to="+encodeURIComponent(location.origin+"/");
      authRequest(redirect,{email:$("#auth-signup-email").value.trim(),password:$("#auth-signup-password").value,data:{full_name:$("#auth-name").value.trim(),company:$("#auth-company").value.trim()}})
        .then(function(data){if(!setCustomerSession(data))throw new Error("Your account was created. Please sign in to continue.");closeAuth();})
        .catch(function(err){error.textContent=err.message||"We could not create your account.";})
        .finally(function(){if(button){button.disabled=false;button.textContent="Create account";}});
    });
    document.addEventListener("keydown",function(event){if(event.key==="Escape" && !$("#auth-modal").hidden)closeAuth();});
  }

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
    if (menu) $$(".mobile-nav__account button", menu).forEach(function (button) { button.addEventListener("click", closeMenu); });
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
        return '<span class="t-str">Contact via form</span>  \u2014  2 business day response  \u2014  Bucharest, remote-first';
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

    form.dataset.startedAt = String(Date.now());
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

    var dateInput = form.elements.preferredDate;
    var timeInput = form.elements.preferredTime;
    var timezoneInput = form.elements.timezone;
    var errorBox = $("#form-error", form);
    form.dataset.startedAt = String(Date.now());

    if (timezoneInput) {
      try { timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
      catch (_) { timezoneInput.value = "UTC"; }
    }
    if (dateInput) {
      var now = new Date();
      dateInput.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      $$(".is-invalid", form).forEach(function (n) { n.classList.remove("is-invalid"); });
      $$(".field-error", form).forEach(function (n) { n.textContent = ""; });
      if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }

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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) fail(email, "Enter a valid email address.");
      if (!company.value.trim() || company.value.trim().length < 2) fail(company, "Enter your company name.");
      if (!type.value) fail(type, "Select a project type.");
      var isBooking = Boolean(dateInput && timeInput);
      if (isBooking && !dateInput.value) fail(dateInput, "Choose a preferred date.");
      if (isBooking && !timeInput.value) fail(timeInput, "Choose a preferred time.");
      if (!brief.value.trim() || brief.value.trim().length < 40) fail(brief, "Give us at least 40 characters so we can prepare.");

      if (firstBad) { firstBad.focus(); return; }

      var submitBtn = form.querySelector("button[type=submit]");
      var originalLabel = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending request..."; }

      var payload = {
        name: name.value.trim(),
        email: email.value.trim(),
        company: company.value.trim(),
        type: type.value,
        brief: brief.value.trim(),
        website: form.elements.website ? form.elements.website.value : ""
      };
      if (isBooking) {
        payload.preferredDate = dateInput.value;
        payload.preferredTime = timeInput.value;
        payload.timezone = timezoneInput && timezoneInput.value ? timezoneInput.value : "UTC";
      }

      if (!requireCustomerAuth()) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
        return;
      }

      fetch(API_BASE + (isBooking ? "/api/v1/bookings" : "/api/v1/contact"), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", "X-Form-Started-At": String(form.dataset.startedAt || Date.now()) }),
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.success) {
            if (res.status === 401) { clearCustomerSession(); openAuth("login"); }
            throw new Error((data.error && data.error.message) || data.message || "We could not send your request. Please try again.");
          }
          return data;
        });
      }).then(function () {
        form.hidden = true;
        success.hidden = false;
        var heading = success.querySelector("h3");
        if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus(); }
      }).catch(function (err) {
        if (errorBox) {
          errorBox.textContent = err.message || "Something went wrong. Please try again.";
          errorBox.hidden = false;
        }
      }).finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
      });
    });

    var resetBtn = $("[data-reset-form]");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        success.hidden = true;
        form.hidden = false;
        form.reset();
        form.dataset.startedAt = String(Date.now());
        if (timezoneInput) {
          try { timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
          catch (_) { timezoneInput.value = "UTC"; }
        }
        if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }
        form.elements.name.focus();
      });
    }

    $$(".field input, .field textarea, .field select", form).forEach(function (el) {
      el.addEventListener("input", function () {
        el.classList.remove("is-invalid");
        var err = el.parentElement.querySelector(".field-error");
        if (err) err.textContent = "";
        if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }
      });
    });
  }

  /* ============================================================
     COPY EMAIL
     ============================================================ */
  function initCopyEmail() {
    var btn = $("#copy-email");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.location.href = "mailto:contact@veyrionstudios.com";
    });
  }

  /* ============================================================
     STUDIO CLOCK
     ============================================================ */
  function initClock() {
    var el = $("#studio-clock");
    if (!el) return;
    var CITY = "Bucharest";
    var TZ = "Europe/Bucharest";
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
     CINEMATIC SYSTEM STUDY / INTERACTION
     ============================================================ */
  function initCinematicExperience() {
    var art = $(".hero-art");
    var orbit = $("[data-hero-orbit]");
    if (!art || !orbit || reduceMotion) return;

    var frame = 0;
    var targetX = 0, targetY = 0;
    var currentX = 0, currentY = 0;
    var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    function renderTilt() {
      frame = 0;
      currentX += (targetX - currentX) * 0.085;
      currentY += (targetY - currentY) * 0.085;
      art.style.setProperty("--scene-y", (currentX * 5.5).toFixed(2) + "deg");
      art.style.setProperty("--scene-x", (-currentY * 4.5).toFixed(2) + "deg");
      if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) frame = requestAnimationFrame(renderTilt);
    }

    if (finePointer) {
      art.addEventListener("pointermove", function (event) {
        var rect = art.getBoundingClientRect();
        targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        if (!frame) frame = requestAnimationFrame(renderTilt);
      }, { passive:true });
      art.addEventListener("pointerleave", function () {
        targetX = 0; targetY = 0;
        if (!frame) frame = requestAnimationFrame(renderTilt);
      }, { passive:true });
    }

    if (hasGSAP && hasST) {
      gsap.to(orbit, {
        rotateZ: 13,
        scale: 0.94,
        ease: "none",
        scrollTrigger: { trigger: art, start: "top bottom", end: "bottom top", scrub: 1.2 }
      });
      gsap.to(".hero-art__drawing", {
        yPercent: 8,
        opacity: 0.24,
        ease: "none",
        scrollTrigger: { trigger: art, start: "top bottom", end: "bottom top", scrub: 1.5 }
      });
    }
  }



  /* ============================================================
     SPATIAL INTERACTIONS / motion layer 02
     ============================================================ */
  function initSpatialInteractions() {
    if (reduceMotion) return;
    var fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    if (fine) {
      $$('.bento-card, .build, .principle').forEach(function (card) {
        card.addEventListener('pointermove', function (event) {
          var r = card.getBoundingClientRect();
          var x = (event.clientX - r.left) / r.width;
          var y = (event.clientY - r.top) / r.height;
          card.style.setProperty('--pointer-x', (x * 100) + '%');
          card.style.setProperty('--pointer-y', (y * 100) + '%');
          if (card.classList.contains('bento-card')) {
            card.style.transform = 'perspective(900px) rotateX(' + ((.5-y)*5).toFixed(2) + 'deg) rotateY(' + ((x-.5)*6).toFixed(2) + 'deg) translateY(-4px)';
          }
        }, { passive:true });
        card.addEventListener('pointerleave', function () { card.style.transform = ''; }, { passive:true });
      });
      $$('.btn, .footer__nav a').forEach(function (el) {
        el.addEventListener('pointermove', function (event) {
          var r = el.getBoundingClientRect();
          var dx = (event.clientX - r.left - r.width/2) / r.width;
          var dy = (event.clientY - r.top - r.height/2) / r.height;
          el.style.transform = 'translate3d(' + (dx*7).toFixed(1) + 'px,' + (dy*5).toFixed(1) + 'px,0)';
        }, { passive:true });
        el.addEventListener('pointerleave', function () { el.style.transform = ''; }, { passive:true });
      });
    }
    if (hasGSAP && hasST) {
      gsap.utils.toArray('.section__label').forEach(function (label) {
        gsap.fromTo(label, { opacity:0, x:-24, letterSpacing:'0.24em' }, {
          opacity:1, x:0, letterSpacing:'0.08em', duration:.8, ease:'power3.out',
          scrollTrigger:{ trigger:label, start:'top 88%', once:true }
        });
      });
      gsap.utils.toArray('.service-item').forEach(function (item, index) {
        gsap.from(item, { opacity:0, x:index%2 ? 22 : -22, duration:.7, ease:'power3.out',
          scrollTrigger:{ trigger:item, start:'top 92%', once:true } });
      });
      gsap.utils.toArray('.timeline-step').forEach(function (step) {
        gsap.fromTo(step, { x:-18, opacity:.35 }, { x:0, opacity:1, ease:'none',
          scrollTrigger:{ trigger:step, start:'top 88%', end:'top 52%', scrub:.7 } });
      });
      var art = $('.hero-art');
      if (art) gsap.to(art, { yPercent:10, ease:'none', scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:1.2 } });
    }
  }

  /* ============================================================
     INIT
     ============================================================ */
  function safe(fn) { try { fn(); } catch (e) { /* silent */ } }

  document.addEventListener("DOMContentLoaded", function () {
    safe(initCustomerAuth);
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
    safe(initCinematicExperience);
    safe(initKeyboard);
    safe(initDocsSearch);
    safe(initReadingProgress);
    safe(initStatusDashboard);
    safe(initPremiumInteractions);
    safe(initSpatialInteractions);
  });

})();
