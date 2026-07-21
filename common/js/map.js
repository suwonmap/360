(() => {
  "use strict";

  /**
   * Suwon360 Map Engine v200
   * ------------------------------------------------------------
   * 안정성 원칙
   *  1. 카카오 Map 객체는 컨테이너 크기가 확정된 뒤 한 번만 생성합니다.
   *  2. PC 지도는 고정 크기이며 사용자가 크기를 변경하지 않습니다.
   *  3. setBounds()를 사용하지 않습니다.
   *  4. 번호 포인트는 카카오 기본 Marker + SVG MarkerImage만 사용합니다.
   *  5. 지도 드래그/확대/축소 중 Marker를 재생성하거나 relayout하지 않습니다.
   */

  const DESKTOP_QUERY = "(min-width: 769px)";
  const DEFAULT_CENTER = { lat: 37.2636, lng: 127.0286 };
  const OUTDOOR_LEVEL = 4;
  const INDOOR_LEVEL = 3;

  const contexts = {
    desktop: createContext("desktop", "desktop-map"),
    mobile: createContext("mobile", "mobile-map")
  };

  let allScenes = [];
  let menuScenes = [];
  let currentSceneName = "";
  let currentXmlFilename = "";
  let latestView = { hlookat: 0, fov: 90 };
  let latestPosition = { lat: NaN, lng: NaN };
  let initToken = 0;

  function createContext(name, elementId) {
    return {
      name,
      elementId,
      map: null,
      markerItems: [],
      indoorOverlay: null,
      indoorElement: null,
      initializedFor: "",
      creating: false,
      lastWidth: 0,
      lastHeight: 0
    };
  }

  function isDesktop() {
    return window.matchMedia(DESKTOP_QUERY).matches;
  }

  function activeContext() {
    return isDesktop() ? contexts.desktop : contexts.mobile;
  }

  function getElement(context) {
    return document.getElementById(context.elementId);
  }

  function normalizeXmlFilename(value) {
    if (!value) return "";
    const raw = String(value).split("?")[0].split("#")[0];
    return raw.substring(raw.lastIndexOf("/") + 1).toLowerCase();
  }

  function getKrpano() {
    return window.Suwon360?.krpano || window.krpano ||
      document.getElementById("krpanoSWFObject") || null;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function validScenes(source) {
    return (Array.isArray(source) ? source : []).filter((scene) =>
      scene && Number.isFinite(Number(scene.lat)) && Number.isFinite(Number(scene.lng))
    );
  }

  function waitForKakao() {
    return new Promise((resolve, reject) => {
      let count = 0;
      const check = () => {
        if (window.kakao?.maps?.load) {
          window.kakao.maps.load(resolve);
          return;
        }
        count += 1;
        if (count > 150) {
          reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
          return;
        }
        window.setTimeout(check, 100);
      };
      check();
    });
  }

  /** 컨테이너가 보이고 크기가 3프레임 연속 동일할 때까지 기다립니다. */
  function waitForStableBox(element, token) {
    return new Promise((resolve, reject) => {
      let previous = "";
      let stableFrames = 0;
      let attempts = 0;

      const inspect = () => {
        if (token !== initToken) {
          reject(new Error("초기화가 취소되었습니다."));
          return;
        }

        const rect = element.getBoundingClientRect();
        const visible = rect.width >= 120 && rect.height >= 120 &&
          getComputedStyle(element).display !== "none";
        const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;

        if (visible && key === previous) stableFrames += 1;
        else stableFrames = 0;

        previous = key;
        attempts += 1;

        if (stableFrames >= 3) {
          resolve({ width: rect.width, height: rect.height });
          return;
        }

        if (attempts > 240) {
          reject(new Error(`지도 컨테이너 크기가 확정되지 않았습니다: ${key}`));
          return;
        }

        requestAnimationFrame(inspect);
      };

      requestAnimationFrame(inspect);
    });
  }

  function sceneCenter(scenes) {
    if (!scenes.length) return DEFAULT_CENTER;
    let lat = 0;
    let lng = 0;
    scenes.forEach((scene) => {
      lat += Number(scene.lat);
      lng += Number(scene.lng);
    });
    return { lat: lat / scenes.length, lng: lng / scenes.length };
  }

  function svgMarkerData(number, active) {
    const size = active ? 30 : 26;
    const fill = active ? "#ef3b24" : "#2f80ed";
    const fontSize = active ? 12 : 11;
    const label = String(number).padStart(2, "0");
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.25}" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
          fill="#ffffff" font-family="Arial,Malgun Gothic,sans-serif" font-size="${fontSize}" font-weight="700">${label}</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
  }

  function markerImage(number, active) {
    const size = active ? 30 : 26;
    return new kakao.maps.MarkerImage(
      svgMarkerData(number, active),
      new kakao.maps.Size(size, size),
      { offset: new kakao.maps.Point(size / 2, size / 2) }
    );
  }

  function clearContext(context) {
    context.markerItems.forEach((item) => item.marker.setMap(null));
    context.markerItems = [];
    if (context.indoorOverlay) context.indoorOverlay.setMap(null);
    context.indoorOverlay = null;
    context.indoorElement = null;
    context.initializedFor = "";
  }

  function buildOutdoorMarkers(context) {
    context.markerItems = menuScenes.map((scene, index) => {
      const number = index + 1;
      const marker = new kakao.maps.Marker({
        map: context.map,
        position: new kakao.maps.LatLng(Number(scene.lat), Number(scene.lng)),
        image: markerImage(number, false),
        title: `${String(number).padStart(2, "0")} ${scene.title || scene.name}`,
        clickable: true,
        zIndex: 2
      });

      kakao.maps.event.addListener(marker, "click", () => {
        selectMenuScene(scene.name);
        window.Suwon360Menu?.select?.(scene.name);
        window.Suwon360Panorama?.loadScene?.(scene.name);
      });

      return { scene, number, marker, active: false };
    });
  }

  function buildIndoorOverlay(context) {
    const source = validScenes(allScenes)[0] || validScenes(menuScenes)[0] ||
      (Number.isFinite(latestPosition.lat) && Number.isFinite(latestPosition.lng) ? latestPosition : DEFAULT_CENTER);

    const root = document.createElement("div");
    root.className = "s360-indoor-marker";
    root.innerHTML = `
      <div class="s360-indoor-fov"></div>
      <div class="s360-indoor-dot"></div>`;

    const overlay = new kakao.maps.CustomOverlay({
      map: context.map,
      position: new kakao.maps.LatLng(Number(source.lat), Number(source.lng)),
      content: root,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 5
    });

    context.indoorOverlay = overlay;
    context.indoorElement = root;
    applyIndoorView(context);
  }

  function applyIndoorView(context) {
    const root = context.indoorElement;
    if (!root) return;
    const hlookat = finiteNumber(latestView.hlookat, 0);
    const fov = Math.max(20, Math.min(130, finiteNumber(latestView.fov, 90)));
    root.style.setProperty("--s360-heading", `${hlookat}deg`);
    root.style.setProperty("--s360-fov", `${fov}deg`);
  }

  function configureMapForContent(context) {
    const outdoor = currentXmlFilename === "yharbor.xml";
    const source = outdoor ? menuScenes : validScenes(allScenes);
    const center = (!outdoor && Number.isFinite(latestPosition.lat) && Number.isFinite(latestPosition.lng))
      ? latestPosition
      : sceneCenter(source);

    context.map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
    context.map.setLevel(outdoor ? OUTDOOR_LEVEL : INDOOR_LEVEL, { animate: false });

    if (outdoor) buildOutdoorMarkers(context);
    else buildIndoorOverlay(context);

    context.initializedFor = currentXmlFilename;
    highlightCurrentScene(currentSceneName);
  }

  async function ensureContext(context) {
    if (context.map && context.initializedFor === currentXmlFilename) return context;
    if (context.creating) return context;

    const element = getElement(context);
    if (!element) return context;

    context.creating = true;
    const token = ++initToken;

    try {
      await waitForKakao();
      const box = await waitForStableBox(element, token);

      if (!context.map) {
        const center = sceneCenter(currentXmlFilename === "yharbor.xml" ? menuScenes : validScenes(allScenes));
        context.map = new kakao.maps.Map(element, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: currentXmlFilename === "yharbor.xml" ? OUTDOOR_LEVEL : INDOOR_LEVEL,
          draggable: true,
          scrollwheel: true,
          disableDoubleClickZoom: false
        });

        context.lastWidth = Math.round(box.width);
        context.lastHeight = Math.round(box.height);
      }

      clearContext(context);
      configureMapForContent(context);
    } catch (error) {
      if (!/취소/.test(error.message)) console.warn("[Suwon360Map v200]", error);
    } finally {
      context.creating = false;
    }

    return context;
  }

  function highlightCurrentScene(sceneName) {
    const resolved = window.Suwon360?.resolveMenuScene?.(sceneName) || sceneName;

    Object.values(contexts).forEach((context) => {
      context.markerItems.forEach((item) => {
        const active = item.scene.name === resolved;
        if (active === item.active) return;
        item.active = active;
        item.marker.setImage(markerImage(item.number, active));
        item.marker.setZIndex(active ? 10 : 2);
      });
    });
  }

  function selectMenuScene(sceneName) {
    if (!sceneName) return;
    currentSceneName = sceneName;
    highlightCurrentScene(sceneName);
  }

  function updateFromScene(sceneName) {
    currentSceneName = String(sceneName || "");
    highlightCurrentScene(currentSceneName);
  }

  function onViewChanged(payload = {}) {
    latestView = {
      hlookat: finiteNumber(payload.hlookat, latestView.hlookat),
      fov: finiteNumber(payload.fov, latestView.fov)
    };
    Object.values(contexts).forEach(applyIndoorView);
  }

  function readViewFromKrpano() {
    const krpano = getKrpano();
    if (!krpano?.get) return latestView;
    return {
      hlookat: finiteNumber(krpano.get("view.hlookat"), latestView.hlookat),
      fov: finiteNumber(krpano.get("view.fov"), latestView.fov)
    };
  }

  /**
   * 모바일 패널 레이아웃 변경에만 사용합니다.
   * PC에서는 컨테이너가 고정 크기이므로 resize/relayout을 실행하지 않습니다.
   */
  async function forceRelayout() {
    const context = activeContext();
    if (context.name === "desktop") return;
    if (!context.map) {
      await ensureContext(context);
      return;
    }

    const element = getElement(context);
    if (!element) return;

    window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width < 120 || height < 120) return;
      if (width === context.lastWidth && height === context.lastHeight) return;

      const center = context.map.getCenter();
      kakao.maps.event.trigger(context.map, "resize");
      context.map.setCenter(center);
      context.lastWidth = width;
      context.lastHeight = height;
    }, 260);
  }

  function setScenes(scenes, menus) {
    allScenes = validScenes(scenes);
    menuScenes = validScenes(menus).filter((scene) => scene.menuShow !== false);
  }

  async function init(filename = "") {
    currentXmlFilename = normalizeXmlFilename(filename) ||
      `${new URLSearchParams(location.search).get("tour") || "namsuheon"}.xml`;

    // 현재 화면에 실제로 보이는 지도만 생성합니다.
    await ensureContext(activeContext());
  }

  function updatePosition(lat, lng, sceneName, hlookat, fov) {
    const nextLat = Number(lat);
    const nextLng = Number(lng);

    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      latestPosition = { lat: nextLat, lng: nextLng };

      Object.values(contexts).forEach((context) => {
        if (!context.map || currentXmlFilename === "yharbor.xml") return;

        const position = new kakao.maps.LatLng(nextLat, nextLng);
        context.map.setCenter(position);

        if (!context.indoorOverlay) {
          buildIndoorOverlay(context);
        } else {
          context.indoorOverlay.setPosition(position);
        }
      });
    }

    if (sceneName) updateFromScene(sceneName);
    onViewChanged({ hlookat, fov });
  }

  window.addEventListener("resize", () => {
    // PC↔모바일 전환 시 새 컨텍스트를 해당 고정 컨테이너에서 생성합니다.
    window.setTimeout(() => ensureContext(activeContext()), 300);
  }, { passive: true });

  window.Suwon360Map = {
    init,
    setScenes,
    updateFromScene,
    selectMenuScene,
    onViewChanged,
    updatePosition,
    forceRelayout
  };

  window.js_initialize_suwon360 = () => init(`${window.Suwon360?.config?.tour || "namsuheon"}.xml`);
  window.js_force_minimap_relayout = forceRelayout;
  window.js_suwon360_on_scene_changed = () => {
    const krpano = getKrpano();
    const sceneName = krpano?.get?.("xml.scene") || window.Suwon360?.currentScene || "";
    updateFromScene(sceneName);
  };
  window.js_suwon360_on_view_changed = (hlookat, fov) => {
    const values = Number.isFinite(Number(hlookat)) || Number.isFinite(Number(fov))
      ? { hlookat, fov }
      : readViewFromKrpano();
    onViewChanged(values);
  };
  window.updateMapPosition = updatePosition;
})();
