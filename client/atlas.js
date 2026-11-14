(function () {
  'use strict';

  var pages = [
    ['Home', 'index.html'],
    ['About', 'about.html'],
    ['Backend', 'backend.html'],
    ['Frontend', 'frontend.html'],
    ['SaaS', 'saas.html'],
    ['Games', 'games.html'],
    ['Security', 'security.html'],
    ['Services', 'services.html'],
    ['Case Studies', 'case-studies.html'],
    ['Process', 'process.html'],
    ['Blog', 'blog.html'],
    ['Contact', 'contact.html'],
    ['Account', 'account.html']
  ];

  var path = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  if (path === 'reset-password.html') return;
  var activePath = path === 'blog-post.html' ? 'blog.html' : path;
  if (!pages.some(function (item) { return item[1] === activePath; })) {
    activePath = path === 'index.html' ? 'index.html' : activePath;
  }

  function buildIndex() {
    if (document.querySelector('.atlas-index')) return;

    var nav = document.createElement('nav');
    nav.className = 'atlas-index';
    nav.setAttribute('aria-label', 'Site pages');

    var label = document.createElement('span');
    label.className = 'atlas-index__label';
    label.textContent = 'EXPLORE';

    var links = document.createElement('div');
    links.className = 'atlas-index__links';

    pages.forEach(function (item) {
      var link = document.createElement('a');
      link.href = item[1];
      link.textContent = item[0];
      if (item[1] === activePath) {
        link.className = 'is-active';
        link.setAttribute('aria-current', 'page');
      }
      links.appendChild(link);
    });

    nav.appendChild(label);
    nav.appendChild(links);

    var header = document.querySelector('.header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(nav, header.nextSibling);
      return;
    }

    nav.classList.add('atlas-index--standalone');
    var main = document.querySelector('main');
    if (main && main.parentNode) {
      main.parentNode.insertBefore(nav, main);
      return;
    }

    document.body.insertBefore(nav, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildIndex, { once: true });
  } else {
    buildIndex();
  }
})();