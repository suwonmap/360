(() => {
  'use strict';

  let scenes = [];
  let activeScene = '';

  function createButton(scene, index, mobile = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = mobile ? 'mobile-menu-item' : 'menu-chip';
    button.dataset.scene = scene.name;
    button.innerHTML = `<span class="menu-number">${String(index + 1).padStart(2, '0')}</span><span>${scene.menuTitle}</span>`;
    button.addEventListener('click', () => {
      window.Suwon360Panorama.loadScene(scene.name);
      setActive(scene.name);
    });
    return button;
  }

  function render() {
    scenes = window.Suwon360Panorama.collectScenes();
    const desktop = document.getElementById('menu-track');
    const mobile = document.getElementById('mobile-menu-list');
    desktop.replaceChildren();
    mobile.replaceChildren();

    scenes.forEach((scene, index) => {
      desktop.appendChild(createButton(scene, index, false));
      mobile.appendChild(createButton(scene, index, true));
    });

    if (!scenes.length) {
      desktop.textContent = 'XML에 scene이 없습니다.';
      mobile.textContent = 'XML에 scene이 없습니다.';
    }
  }

  function setActive(sceneName) {
    activeScene = sceneName;
    document.querySelectorAll('[data-scene]').forEach(button => {
      const active = button.dataset.scene === sceneName;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      if (active) button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    window.Suwon360Map?.highlightScene(sceneName);
  }

  function initScrollButtons() {
    const track = document.getElementById('menu-track');
    document.getElementById('menu-prev')?.addEventListener('click', () => track.scrollBy({ left: -320, behavior: 'smooth' }));
    document.getElementById('menu-next')?.addEventListener('click', () => track.scrollBy({ left: 320, behavior: 'smooth' }));
  }

  function init() {
    render();
    initScrollButtons();
    window.Suwon360Panorama.onSceneChange(({ sceneName }) => {
      if (sceneName && sceneName !== activeScene) setActive(sceneName);
    });
    const first = window.Suwon360Panorama.get('xml.scene');
    if (first) setActive(first);
  }

  window.Suwon360Menu = { init, setActive, getScenes: () => scenes.slice() };
})();
