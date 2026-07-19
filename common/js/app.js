(() => {
  'use strict';

  const ALLOWED_PROJECTS = new Set(['suwon_tour', 'suwon_public', 'suwon_safety']);
  const SAFE_FILE = /^[a-zA-Z0-9_-]+$/;

  function readParams() {
    const params = new URLSearchParams(location.search);
    const project = params.get('project') || 'suwon_tour';
    const tour = params.get('tour') || 'tour';

    if (!ALLOWED_PROJECTS.has(project)) {
      throw new Error(`허용되지 않은 project 값입니다: ${project}`);
    }
    if (!SAFE_FILE.test(tour)) {
      throw new Error(`tour 값에는 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다: ${tour}`);
    }

    return {
      project,
      tour,
      projectRoot: `../${project}/`,
      viewerScript: `../${project}/tour.js`,
      projectXml: `../${project}/${tour}.xml`,
      shareUrl: `${location.origin}${location.pathname}?project=${encodeURIComponent(project)}&tour=${encodeURIComponent(tour)}`
    };
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById('status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.hidden = !message;
  }

  function installLayoutControls() {
    const app = document.getElementById('app');
    const panelToggle = document.getElementById('panel-toggle');
    const menuClose = document.getElementById('mobile-menu-close');
    const mapClose = document.getElementById('map-close');
    const mapRestore = document.getElementById('map-restore');

    panelToggle?.addEventListener('click', () => {
      const hidden = app.classList.toggle('panel-hidden');
      panelToggle.textContent = hidden ? '전체 보기' : '전체 숨김';
      panelToggle.setAttribute('aria-expanded', String(!hidden));
      setTimeout(() => window.Suwon360Map?.relayout(), 250);
    });

    menuClose?.addEventListener('click', () => {
      app.classList.remove('map-hidden');
      app.classList.toggle('menu-hidden');
      setTimeout(() => window.Suwon360Map?.relayout(), 250);
    });

    mapClose?.addEventListener('click', () => {
      app.classList.remove('menu-hidden');
      app.classList.toggle('map-hidden');
    });

    mapRestore?.addEventListener('click', () => {
      app.classList.remove('menu-hidden', 'map-hidden');
      setTimeout(() => window.Suwon360Map?.relayout(), 250);
    });
  }

  async function shareCurrentUrl() {
    const url = window.Suwon360.config.shareUrl;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus('링크를 복사했습니다.');
        setTimeout(() => setStatus(''), 1600);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setStatus('링크 공유에 실패했습니다.', true);
      }
    }
  }

  async function boot() {
    try {
      const config = readParams();
      window.Suwon360 = { config, setStatus };

      installLayoutControls();
      document.getElementById('share-btn')?.addEventListener('click', shareCurrentUrl);

      await window.Suwon360Panorama.start(config);
      window.Suwon360Menu.init();
      window.Suwon360Map.init();

      document.getElementById('app').setAttribute('aria-busy', 'false');
      setStatus('');
    } catch (error) {
      console.error(error);
      setStatus(error.message || '초기화 중 오류가 발생했습니다.', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
