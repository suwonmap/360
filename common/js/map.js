(() => {
  "use strict";

  let map = null;
  let marker = null;
  let lastView = null;

  function init() {
    const element = document.getElementById("map");
    if (!element) return;

    if (!window.kakao?.maps) {
      element.innerHTML = '<div class="map-placeholder">미니맵을 준비 중입니다.</div>';
      return;
    }

    window.kakao.maps.load(() => {
      const center = new window.kakao.maps.LatLng(37.2636, 127.0286);

      map = new window.kakao.maps.Map(element, {
        center,
        level: 4
      });

      marker = new window.kakao.maps.Marker({
        map,
        position: center
      });
    });
  }

  function updatePosition(lat, lng, sceneName = "") {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!map || !marker || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const position = new window.kakao.maps.LatLng(latitude, longitude);
    marker.setPosition(position);

    if (!window.Suwon360Map.keepCenter) {
      map.setCenter(position);
    }

    if (sceneName) {
      window.Suwon360Menu?.select?.(sceneName);
    }
  }

  function onViewChanged(view) {
    lastView = view;
    // 방향 마커 연동 시 lastView.hlookat / lastView.fov 사용
  }

  function updateFromScene(sceneName) {
    if (sceneName) {
      window.Suwon360Menu?.select?.(sceneName);
    }
  }

  function forceRelayout() {
    if (!map || !window.kakao?.maps?.event) return;

    const center = map.getCenter();
    window.kakao.maps.event.trigger(map, "resize");
    map.setCenter(center);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("resize", () => window.setTimeout(forceRelayout, 100));

  window.Suwon360Map = {
    keepCenter: true,
    init,
    updatePosition,
    onViewChanged,
    updateFromScene,
    forceRelayout,
    getLastView: () => lastView
  };
})();
