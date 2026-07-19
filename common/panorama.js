(() => {
  'use strict';

  let krpano = null;
  const readyCallbacks = [];
  const sceneCallbacks = [];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`krpano 실행 파일을 불러오지 못했습니다: ${src}`));
      document.head.appendChild(script);
    });
  }

  function get(path) {
    try { return krpano?.get(path); } catch { return undefined; }
  }

  function call(action) {
    if (!krpano || !action) return;
    krpano.call(action);
  }

  function loadScene(sceneName) {
    if (!sceneName) return;
    call(`loadscene(${sceneName}, null, MERGE, BLEND(0.5));`);
  }

  function readTourMetadata() {
    const title = get('tour_title') || get('title') || window.Suwon360.config.tour;
    const date = get('shooting_date') || '';
    document.getElementById('content-title').textContent = String(title);
    document.getElementById('shooting-date').textContent = date ? `촬영일 : ${date}` : '';
    document.title = `수원360° │ ${title}`;
  }

  function collectScenes() {
    if (!krpano) return [];
    const count = Number(get('scene.count') || 0);
    const scenes = [];
    for (let i = 0; i < count; i += 1) {
      const prefix = `scene[${i}]`;
      const name = get(`${prefix}.name`);
      if (!name) continue;
      scenes.push({
        name,
        title: get(`${prefix}.title`) || name,
        menuTitle: get(`${prefix}.menu_title`) || get(`${prefix}.title`) || name,
        menuOrder: Number(get(`${prefix}.menu_order`) || 0),
        menuVisible: String(get(`${prefix}.menu_visible`) ?? 'true') !== 'false',
        lat: Number(get(`${prefix}.lat`)),
        lng: Number(get(`${prefix}.lng`))
      });
    }
    return scenes
      .filter(scene => scene.menuVisible)
      .sort((a, b) => (a.menuOrder || 9999) - (b.menuOrder || 9999));
  }

  function notifySceneChanged() {
    const sceneName = get('xml.scene') || '';
    const hlookat = Number(get('view.hlookat') || 0);
    sceneCallbacks.forEach(callback => callback({ sceneName, hlookat }));
  }

  function attachPollingBridge() {
    let previousScene = '';
    let previousHeading = Number.NaN;
    window.setInterval(() => {
      if (!krpano) return;
      const sceneName = get('xml.scene') || '';
      const hlookat = Math.round(Number(get('view.hlookat') || 0) * 10) / 10;
      if (sceneName !== previousScene || Math.abs(hlookat - previousHeading) >= 1) {
        previousScene = sceneName;
        previousHeading = hlookat;
        notifySceneChanged();
      }
    }, 200);
  }

  async function start(config) {
    await loadScript(config.viewerScript);
    if (typeof window.embedpano !== 'function') {
      throw new Error('tour.js는 불러왔지만 embedpano 함수를 찾지 못했습니다.');
    }

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('krpano 초기화 시간이 초과되었습니다.')), 15000);

      window.embedpano({
        target: 'pano',
        id: 'krpanoSWFObject',
        xml: './common_layout.xml',
        bgcolor: '#000000',
        html5: 'only',
        consolelog: true,
        passQueryParameters: false,
        initvars: {
          project_xml: config.projectXml,
          project_root: config.projectRoot,
          project_name: config.project,
          tour_name: config.tour
        },
        onready(instance) {
          window.clearTimeout(timeout);
          krpano = instance;
          readTourMetadata();
          attachPollingBridge();
          readyCallbacks.splice(0).forEach(callback => callback(instance));
          resolve(instance);
        }
      });
    });
  }

  window.Suwon360Panorama = {
    start,
    get,
    call,
    loadScene,
    collectScenes,
    onReady(callback) {
      if (krpano) callback(krpano);
      else readyCallbacks.push(callback);
    },
    onSceneChange(callback) {
      sceneCallbacks.push(callback);
    }
  };
})();
