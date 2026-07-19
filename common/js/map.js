(() => {
  "use strict";

  let map = null;
  let currentMarker = null;

  function init() {
    const mapElement = document.getElementById("map");
    if (!mapElement) return;

    if (!window.kakao?.maps) {
      mapElement.innerHTML = '<div class="map-placeholder">미니맵 SDK를 불러오면 여기에 표시됩니다.</div>';
      return;
    }

    window.kakao.maps.load(() => {
      const center = new window.kakao.maps.LatLng(37.2636, 127.0286);
      map = new window.kakao.maps.Map(mapElement, {
        center,
        level: 4
      });

      currentMarker = new window.kakao.maps.Marker({
        position: center,
        map
      });
    });
  }

  function updateFromScene(sceneName) {
    // XML의 씬별 위·경도 연동 규칙을 추가할 자리입니다.
    // 현재는 지도 확대/중심을 유지하고 메뉴 연동만 수행합니다.
    if (!map || !currentMarker || !sceneName) return;
  }

  document.addEventListener("DOMContentLoaded", init);

  window.Suwon360Map = {
    init,
    updateFromScene
  };
})();
