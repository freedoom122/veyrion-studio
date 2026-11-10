(function () {
  'use strict';

  var ENDPOINT = 'https://translate.veyrionstudios.com/translate';
  var SOURCE_LANGUAGE = (document.documentElement.lang || 'en').split('-')[0].toLowerCase();
  var RAW_LANGUAGES = '🇿🇦|South Africa|Afrikaans|af;🇪🇹|Ethiopia|አማርኛ|am;🇸🇦|Saudi Arabia|العربية|ar;🇪🇸|Asturias|Asturianu|ast;🇦🇿|Azerbaijan|Azərbaycanca|az;🇷🇺|Russia|Башҡортса|ba;🇧🇾|Belarus|Беларуская|be;🇧🇬|Bulgaria|Български|bg;🇧🇩|Bangladesh|বাংলা|bn;🇫🇷|France|Brezhoneg|br;🇧🇦|Bosnia and Herzegovina|Bosanski|bs;🇪🇸|Catalonia|Català|ca;🇵🇭|Philippines|Cebuano|ceb;🇨🇿|Czechia|Čeština|cs;🇷🇺|Russia|Чӑвашла|cv;🏴|Wales|Cymraeg|cy;🇩🇰|Denmark|Dansk|da;🇩🇪|Germany|Deutsch|de;🇬🇷|Greece|Ελληνικά|el;🇺🇸|United States|English|en;🇪🇸|Spain|Español|es;🇪🇪|Estonia|Eesti|et;🇮🇷|Iran|فارسی|fa;🇬🇳|Guinea|Fulfulde|ff;🇫🇮|Finland|Suomi|fi;🇫🇷|France|Français|fr;🇳🇱|Netherlands|Frysk|fy;🇮🇪|Ireland|Gaeilge|ga;🏴|Scotland|Gàidhlig|gd;🇪🇸|Galicia|Galego|gl;🇵🇾|Paraguay|Avañe’ẽ|gn;🇮🇳|India|ગુજરાતી|gu;🇳🇬|Nigeria|Hausa|ha;🇮🇱|Israel|עברית|he;🇮🇳|India|हिन्दी|hi;🇭🇷|Croatia|Hrvatski|hr;🇭🇹|Haiti|Kreyòl ayisyen|ht;🇭🇺|Hungary|Magyar|hu;🇦🇲|Armenia|Հայերեն|hy;🇮🇩|Indonesia|Bahasa Indonesia|id;🇳🇬|Nigeria|Igbo|ig;🇵🇭|Philippines|Ilokano|ilo;🇮🇸|Iceland|Íslenska|is;🇮🇹|Italy|Italiano|it;🇯🇵|Japan|日本語|ja;🇮🇩|Indonesia|Basa Jawa|jv;🇬🇪|Georgia|ქართული|ka;🇰🇿|Kazakhstan|Қазақша|kk;🇰🇭|Cambodia|ខ្មែរ|km;🇮🇳|India|ಕನ್ನಡ|kn;🇰🇷|South Korea|한국어|ko;🇱🇺|Luxembourg|Lëtzebuergesch|lb;🇺🇬|Uganda|Luganda|lg;🇨🇩|DR Congo|Lingála|ln;🇱🇦|Laos|ລາວ|lo;🇱🇹|Lithuania|Lietuvių|lt;🇱🇻|Latvia|Latviešu|lv;🇲🇬|Madagascar|Malagasy|mg;🇲🇰|North Macedonia|Македонски|mk;🇮🇳|India|മലയാളം|ml;🇲🇳|Mongolia|Монгол|mn;🇮🇳|India|मराठी|mr;🇲🇾|Malaysia|Bahasa Melayu|ms;🇲🇲|Myanmar|မြန်မာ|my;🇳🇵|Nepal|नेपाली|ne;🇳🇱|Netherlands|Nederlands|nl;🇳🇴|Norway|Norsk|no;🇿🇦|South Africa|Sepedi|ns;🇫🇷|France|Occitan|oc;🇮🇳|India|ଓଡ଼ିଆ|or;🇮🇳|India|ਪੰਜਾਬੀ|pa;🇵🇱|Poland|Polski|pl;🇦🇫|Afghanistan|پښتو|ps;🇵🇹|Portugal|Português|pt;🇷🇴|Romania|Română|ro;🇷🇺|Russia|Русский|ru;🇵🇰|Pakistan|سنڌي|sd;🇱🇰|Sri Lanka|සිංහල|si;🇸🇰|Slovakia|Slovenčina|sk;🇸🇮|Slovenia|Slovenščina|sl;🇸🇴|Somalia|Soomaali|so;🇦🇱|Albania|Shqip|sq;🇷🇸|Serbia|Српски|sr;🇸🇿|Eswatini|SiSwati|ss;🇮🇩|Indonesia|Basa Sunda|su;🇸🇪|Sweden|Svenska|sv;🇰🇪|Kenya|Kiswahili|sw;🇮🇳|India|தமிழ்|ta;🇮🇳|India|తెలుగు|te;🇹🇭|Thailand|ไทย|th;🇵🇭|Philippines|Tagalog|tl;🇧🇼|Botswana|Setswana|tn;🇹🇷|Türkiye|Türkçe|tr;🇺🇦|Ukraine|Українська|uk;🇵🇰|Pakistan|اردو|ur;🇺🇿|Uzbekistan|Oʻzbekcha|uz;🇻🇳|Vietnam|Tiếng Việt|vi;🇸🇳|Senegal|Wolof|wo;🇿🇦|South Africa|isiXhosa|xh;🇮🇱|Israel|ייִדיש|yi;🇳🇬|Nigeria|Yorùbá|yo;🇨🇳|China|中文|zh';
  var LANGUAGES = RAW_LANGUAGES.split(';').map(function (row) { return row.split('|'); });
  var saved = '';
  try { saved = localStorage.getItem('veyrion.language') || ''; } catch (_) {}
  var locale = (navigator.language || 'en-US').split('-');
  var browserCode = locale[0].toLowerCase();
  var region = (locale[1] || 'US').toUpperCase();
  var flag = String.fromCodePoint.apply(null, Array.from(region).map(function (c) { return 127397 + c.charCodeAt(0); }));
  var active = LANGUAGES.find(function (x) { return x[3] === saved; }) ||
    LANGUAGES.find(function (x) { return x[3] === browserCode && x[0] === flag; }) ||
    LANGUAGES.find(function (x) { return x[3] === browserCode; }) || LANGUAGES.find(function (x) { return x[3] === 'en'; });
  var root;
  var originals = [];
  var originalMap = new WeakMap();
  var currentRun = 0;

  function updateLabel() {
    if (!root || !active) return;
    root.querySelector('.v-language__flag').textContent = active[0];
    root.querySelector('.v-language__label').textContent = active[1] + ' · ' + active[2];
    root.querySelector('.v-language__trigger').setAttribute('aria-label', 'Language: ' + active[1] + ', ' + active[2]);
  }

  function showStatus(message, isError) {
    var toast = document.getElementById('v-language-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'v-language-toast';
      toast.className = 'v-language__toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('is-visible');
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(function () { toast.classList.remove('is-visible'); }, 3200);
  }

  function collectOriginals() {
    var skip = 'SCRIPT,STYLE,NOSCRIPT,TEXTAREA,INPUT,SELECT,OPTION,PRE,CODE,SVG,IFRAME';
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (parent.closest(skip + ',.v-language,[data-no-translate],[translate="no"],[aria-hidden="true"],[contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
        if (node.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      if (!originalMap.has(node)) {
        var record = { node: node, value: node.nodeValue };
        originalMap.set(node, record);
        originals.push(record);
      }
    }
  }

  function restoreOriginals() {
    originals.forEach(function (record) {
      if (record.node.isConnected) record.node.nodeValue = record.value;
    });
  }

  function makeChunks() {
    var chunks = [];
    var group = [];
    var size = 0;
    originals.forEach(function (record, index) {
      if (!record.node.isConnected) return;
      var value = record.value;
      var leading = (value.match(/^\s*/) || [''])[0];
      var trailing = (value.match(/\s*$/) || [''])[0];
      var core = value.slice(leading.length, value.length - trailing.length);
      if (!core.trim()) return;
      var marker = 'QZXVYR' + String(index).padStart(5, '0') + 'XQZ';
      var part = { record: record, marker: marker, leading: leading, trailing: trailing, core: core };
      if (group.length && (group.length >= 12 || size + core.length > 3600)) {
        chunks.push(group); group = []; size = 0;
      }
      group.push(part);
      size += core.length + marker.length + 2;
    });
    if (group.length) chunks.push(group);
    return chunks;
  }

  async function translateChunk(group, language, runId) {
    var payload = group.map(function (part) { return part.marker + ' ' + part.core; }).join(' ');
    var response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: payload, source_lang: SOURCE_LANGUAGE, target_lang: language }),
      cache: 'no-store',
      credentials: 'omit'
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.translated_text) throw new Error(data.error || 'Translation request failed.');
    if (runId !== currentRun) return;
    var translated = data.translated_text;
    group.forEach(function (part) {
      var start = translated.indexOf(part.marker);
      if (start < 0) return;
      start += part.marker.length;
      var next = translated.indexOf('QZXVYR', start);
      var segment = translated.slice(start, next < 0 ? translated.length : next).trim();
      if (segment) part.record.node.nodeValue = part.leading + segment + part.trailing;
    });
  }

  async function translatePage(language) {
    var runId = ++currentRun;
    restoreOriginals();
    collectOriginals();
    if (language === SOURCE_LANGUAGE) {
      document.documentElement.lang = SOURCE_LANGUAGE;
      showStatus('Original language restored.');
      return;
    }
    showStatus('Translating page…');
    var chunks = makeChunks();
    try {
      for (var i = 0; i < chunks.length; i += 3) {
        if (runId !== currentRun) return;
        await Promise.all(chunks.slice(i, i + 3).map(function (chunk) { return translateChunk(chunk, language, runId); }));
      }
      if (runId !== currentRun) return;
      document.documentElement.lang = language;
      showStatus('Page translated to ' + active[2] + '.');
    } catch (error) {
      if (runId === currentRun) {
        restoreOriginals();
        document.documentElement.lang = SOURCE_LANGUAGE;
        showStatus('Translation is temporarily unavailable. Please try again.', true);
      }
    }
  }

  function choose(item) {
    active = item;
    updateLabel();
    try { localStorage.setItem('veyrion.language', item[3]); } catch (_) {}
    translatePage(item[3]);
  }

  function boot() {
    if (document.getElementById('veyrion-language-control')) return;
    var style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'language.css';
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'veyrion-language-control';
    root.className = 'v-language';
    root.innerHTML = '<button class="v-language__trigger" type="button" aria-expanded="false" aria-controls="v-language-panel"><span class="v-language__flag" aria-hidden="true"></span><span class="v-language__label"></span><span class="v-language__chevron" aria-hidden="true">⌄</span></button><div class="v-language__panel" id="v-language-panel" hidden><div class="v-language__heading"><span>REGION & LANGUAGE</span><span>100 LANGUAGES</span></div><label class="v-language__search-label" for="v-language-search">Find a country or language</label><input class="v-language__search" id="v-language-search" type="search" placeholder="Search languages…" autocomplete="off"><div class="v-language__options" role="listbox" aria-label="Available languages"></div><p class="v-language__note">Powered by Cloudflare Workers AI. Machine translations may not be perfect.</p></div>';

    var inner = document.querySelector('.header__inner');
    var toggle = inner && inner.querySelector('.header__toggle');
    if (toggle) inner.insertBefore(root, toggle);
    else if (inner) inner.appendChild(root);
    else if (document.querySelector('.header')) document.querySelector('.header').appendChild(root);
    else document.body.appendChild(root);

    var trigger = root.querySelector('.v-language__trigger');
    var panel = root.querySelector('.v-language__panel');
    var search = root.querySelector('.v-language__search');
    var list = root.querySelector('.v-language__options');

    function render(query) {
      list.textContent = '';
      var q = (query || '').toLowerCase();
      LANGUAGES.filter(function (x) { return (x[1] + ' ' + x[2] + ' ' + x[3]).toLowerCase().indexOf(q) !== -1; }).forEach(function (item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'v-language__option' + (item[3] === active[3] ? ' is-active' : '');
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', item[3] === active[3] ? 'true' : 'false');
        button.innerHTML = '<span class="v-language__option-flag"></span><span class="v-language__option-copy"><strong></strong><small></small></span><span class="v-language__option-check">✓</span>';
        button.querySelector('.v-language__option-flag').textContent = item[0];
        button.querySelector('strong').textContent = item[1];
        button.querySelector('small').textContent = item[2];
        button.addEventListener('click', function () {
          choose(item);
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
        });
        list.appendChild(button);
      });
    }

    trigger.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      trigger.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) search.focus();
    });
    search.addEventListener('input', function () { render(search.value); });
    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    collectOriginals();
    render('');
    updateLabel();
    if (saved && saved !== SOURCE_LANGUAGE && LANGUAGES.some(function (x) { return x[3] === saved; })) translatePage(saved);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();