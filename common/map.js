(() => {
  'use strict';

  const KAKAO_APP_KEY = 'YOUR_KAKAO_JAVASCRIPT_KEY';
  let map = null;
  let markers = new Map();
  let currentScene = '';

  function loadKakaoSdk() {
    if (window.kakao?.maps) return Promise.resolve();
    if (KAKAO_APP_KEY === 'YOUR_KAKAO_JAVASCRIPT_KEY') {
      return Promise.reject(new Error('common/map.js의 KAKAO_APP_KEY를 실제 JavaScript 키로 변경하세요.'));
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_APP_KEY)}&autoload=false`;
      script.onload = () => window.kakao.maps.load(resolve);
      script.onerror = () => reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });
  }

  function markerContent(index, active = false) {
    return `<button class="map-marker${active ? ' is-active' : ''}" type="button" aria-label="${index + 1}번 위치">${String(index + 1).padStart(2, '0')}</button>`;
  }

  function drawMarkers() {
    const scenes = window.Suwon360Menu.getScenes().filter(scene => Number.isFinite(scene.lat) && Number.isFinite(scene.lng));
    if (!scenes.length || !map) return;

    const bounds = new window.kakao.maps.LatLngBounds();
    scenes.forEach((scene, index) => {
      const position = new window.kakao.maps.LatLng(scene.lat, scene.lng);
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: markerContent(index, scene.name === currentScene),
        yAnchor: 0.5,
        xAnchor: 0.5,
        clickable: true
      });
      overlay.setMap(map);
      markers.set(scene.name, { overlay, index, position });
      bounds.extend(position);

      const node = overlay.getContent();
      const attach = () => {
        const element = typeof node === 'string' ? null : node;
        element?.addEventListener('click', () => {
          window.Suwon360Panorama.loadScene(scene.name);
          window.Suwon360Menu.setActive(scene.name);
        });
      };
      setTimeout(attach, 0);
    });
    if (scenes.length > 1) map.setBounds(bounds, 40, 40, 40, 40);
    else map.setCenter(scenes[0] && new window.kakao.maps.LatLng(scenes[0].lat, scenes[0].lng));
  }

  function highlightScene(sceneName) {
    currentScene = sceneName;
    markers.forEach(({ overlay, index, position }, name) => {
      overlay.setContent(markerContent(index, name === sceneName));
      if (name === sceneName && map) map.panTo(position);
    });
  }

  async function init() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    try {
      await loadKakaoSdk();
      const scenes = window.Suwon360Menu.getScenes().filter(scene => Number.isFinite(scene.lat) && Number.isFinite(scene.lng));
      const center = scenes[0]
        ? new window.kakao.maps.LatLng(scenes[0].lat, scenes[0].lng)
        : new window.kakao.maps.LatLng(37.2636, 127.0286);
      map = new window.kakao.maps.Map(mapElement, { center, level: 4 });
      drawMarkers();
      window.Suwon360Panorama.onSceneChange(({ sceneName }) => highlightScene(sceneName));
    } catch (error) {
      console.warn(error.message);
      mapElement.innerHTML = `<div class="map-message">${error.message}</div>`;
    }
  }

  function relayout() {
    if (!map) return;
    map.relayout();
  }

  window.Suwon360Map = { init, highlightScene, relayout };
})();
