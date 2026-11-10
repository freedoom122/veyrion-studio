(function () {
  'use strict';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function bindDrag(surface) {
    if (!surface || surface.dataset.dragReady === 'true') return;
    surface.dataset.dragReady = 'true';
    var dragging = false, pointerId = null, startX = 0, startY = 0, baseX = 0, baseY = 0, angleX = 0, angleY = 0;
    function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
    function paint(){surface.style.setProperty('--drag-x',angleX.toFixed(2)+'deg');surface.style.setProperty('--drag-y',angleY.toFixed(2)+'deg');}
    surface.addEventListener('pointerdown',function(event){if(event.button!==undefined&&event.button!==0)return;if(event.target.closest('button,a,input,select,textarea'))return;dragging=true;pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;baseX=angleX;baseY=angleY;surface.classList.add('is-dragging');try{surface.setPointerCapture(pointerId);}catch(_){}});
    surface.addEventListener('pointermove',function(event){if(!dragging||(pointerId!==null&&event.pointerId!==pointerId))return;angleX=clamp(baseX+(event.clientX-startX)*.28,-38,38);angleY=clamp(baseY-(event.clientY-startY)*.22,-25,25);paint();});
    function release(event){if(!dragging||(event&&pointerId!==null&&event.pointerId!==pointerId))return;dragging=false;pointerId=null;surface.classList.remove('is-dragging');}
    surface.addEventListener('pointerup',release);surface.addEventListener('pointercancel',release);surface.addEventListener('lostpointercapture',release);
    surface.addEventListener('keydown',function(event){var keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];if(keys.indexOf(event.key)===-1)return;event.preventDefault();if(event.key==='ArrowLeft')angleX=clamp(angleX-5,-38,38);if(event.key==='ArrowRight')angleX=clamp(angleX+5,-38,38);if(event.key==='ArrowUp')angleY=clamp(angleY+4,-25,25);if(event.key==='ArrowDown')angleY=clamp(angleY-4,-25,25);paint();});
    surface.addEventListener('dblclick',function(){angleX=0;angleY=0;paint();});
  }
  function initArchitecture(){
    var diagram=document.getElementById('arch-diagram');if(!diagram)return;var model=diagram.querySelector('.arch-model__stage');bindDrag(model);
    var plates=Array.prototype.slice.call(diagram.querySelectorAll('.arch-model__plate'));
    function select(key){plates.forEach(function(plate){var active=plate.dataset.layer===key;plate.classList.toggle('is-active',active);plate.setAttribute('aria-pressed',active?'true':'false');});}
    diagram.addEventListener('click',function(event){var plate=event.target.closest('.arch-model__plate');var layer=event.target.closest('.arch-layer');if(plate){var key=plate.dataset.layer;select(key);var control=diagram.querySelector('.arch-layer[data-layer="'+key+'"]');if(control)control.click();}else if(layer)select(layer.dataset.layer);});
    plates.forEach(function(plate){plate.setAttribute('aria-label','Inspect '+plate.textContent.replace(/\s+/g,' ').trim());plate.setAttribute('aria-pressed',plate.classList.contains('is-active')?'true':'false');});
  }
  function initSystemLab(){
    var lab=document.querySelector('[data-system-lab]');if(!lab)return;
    var scenarios={
      automation:{nodes:[['Trigger','Incoming event'],['Validate','Rules & permissions'],['Orchestrate','Reliable workflow'],['Deliver','Traceable outcome']],caption:'RETRY-SAFE WORKFLOW',description:'Events move through validation, orchestration and delivery. Failed steps can retry safely without duplicating the outcome.',behaviour:'Retry-safe · Traceable · Resilient',priority:'Reliability over fragile shortcuts'},
      operations:{nodes:[['Sense','Live system signals'],['Prioritise','Capacity & constraints'],['Coordinate','People and services'],['Resolve','Audited action']],caption:'CONNECTED OPERATIONS',description:'Operational signals become a shared picture. Teams can see capacity, coordinate action and keep an audit trail from one place.',behaviour:'Visible · Coordinated · Auditable',priority:'Clarity at the point of action'},
      data:{nodes:[['Collect','Events and sources'],['Validate','Quality & schema'],['Transform','Reliable pipelines'],['Explore','Useful decisions']],caption:'TRUSTED DATA PIPELINE',description:'Data is checked at the edge, transformed through explicit contracts and delivered with enough context to trust the result.',behaviour:'Consistent · Observable · Governed',priority:'Trust before dashboards'}
    };
    var buttons=Array.prototype.slice.call(lab.querySelectorAll('[data-lab-mode]'));
    buttons.forEach(function(button){button.addEventListener('click',function(){var key=button.dataset.labMode,item=scenarios[key];if(!item)return;lab.dataset.mode=key;buttons.forEach(function(other){var active=other===button;other.classList.toggle('is-active',active);other.setAttribute('aria-selected',active?'true':'false');});item.nodes.forEach(function(node,index){var suffix=['one','two','three','four'][index];var strong=lab.querySelector('[data-lab-node="'+suffix+'"]');var small=lab.querySelector('[data-lab-sub="'+suffix+'"]');if(strong)strong.textContent=node[0];if(small)small.textContent=node[1];});lab.querySelector('[data-lab-caption]').textContent=item.caption;lab.querySelector('[data-lab-description]').textContent=item.description;lab.querySelector('[data-lab-readout]').textContent=item.behaviour;lab.querySelector('[data-lab-priority]').textContent=item.priority;});});
  }
  function initReveal(){var targets=document.querySelectorAll('.status-card,.bento-card,.build,.principle,.timeline-step,.service-item,.system-lab');if(!targets.length||reduced||(window.gsap&&window.ScrollTrigger)||!('IntersectionObserver'in window))return;var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-in-view');observer.unobserve(entry.target);}});},{threshold:.12,rootMargin:'0px 0px -32px 0px'});targets.forEach(function(target){target.classList.add('v-reveal');observer.observe(target);});}
  function init(){bindDrag(document.querySelector('[data-hero-orbit]'));initArchitecture();initSystemLab();initReveal();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
