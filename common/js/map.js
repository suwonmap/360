(() => {
  "use strict";

  /**
   * Suwon360 Universal Map Engine v210
   * ------------------------------------------------------------
   * 콘텐츠명을 코드에 등록하지 않습니다.
   * krpano XML의 mapmode와 scene 좌표를 읽어 자동으로 동작합니다.
   *
   * XML 권장값
   *   mapmode="multi"  : menu_show="true" 씬들을 번호 포인트로 표시
   *   mapmode="single" : 현재 씬 위치 1개와 시선 방향을 표시
   *   mapmode="auto"   : 좌표가 있는 메뉴 씬이 2개 이상이면 multi, 아니면 single
   *   mapmode="off"    : 미니맵 사용 안 함
   *   maplat / maplng   : 초기 중심 좌표(선택)
   *   maplevel          : 초기 확대 단계(선택)
   */

  const DESKTOP_QUERY = "(min-width: 769px)";
  const DEFAULT_CENTER = { lat: 37.2636, lng: 127.0286 };
  const DEFAULT_MULTI_LEVEL = 4;
  const DEFAULT_SINGLE_LEVEL = 3;

  const contexts = {
    desktop: createContext("desktop", "desktop-map"),
    mobile: createContext("mobile", "mobile-map")
  };

  let allScenes = [];
  let menuScenes = [];
  let sceneByName = new Map();
  let mapConfig = { mode: "auto", lat: NaN, lng: NaN, level: NaN };
  let resolvedMode = "single";
  let currentSceneName = "";
  let latestView = { hlookat: 0, fov: 90 };
  let latestPosition = { lat: NaN, lng: NaN };
  let initGeneration = 0;
  let headingPaintQueued = false;
  let sceneRevision = 0;
  let refreshTimer = 0;

  function createContext(name, elementId) {
    return {
      name,
      elementId,
      map: null,
      markerItems: [],
      currentMarker: null,
      currentMarkerHeading: NaN,
      initializedSignature: "",
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

  function elementFor(context) {
    return document.getElementById(context.elementId);
  }

  function finite(value, fallback = NaN) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function hasPosition(value) {
    return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng));
  }

  function validScenes(source) {
    return (Array.isArray(source) ? source : []).filter(hasPosition);
  }

  function normalizeMode(value) {
    const mode = String(value || "auto").trim().toLowerCase();
    if (["multi", "multiple", "scene", "scenes", "outdoor", "outside"].includes(mode)) return "multi";
    if (["single", "current", "position", "indoor", "inside"].includes(mode)) return "single";
    if (["off", "none", "false", "0"].includes(mode)) return "off";
    return "auto";
  }

  function determineMode() {
    const configured = normalizeMode(mapConfig.mode);
    if (configured !== "auto") return configured;

    // menu_show 씬 좌표가 있으면 우선 다중 포인트로 판단합니다.
    // 구형 XML처럼 menu_show 속성 인식이 늦거나 누락된 경우에는
    // 전체 좌표 씬을 보조 기준으로 사용합니다.
    const menuCount = validScenes(menuScenes).length;
    const allCount = validScenes(allScenes).length;
    return menuCount >= 2 || allCount >= 2 ? "multi" : "single";
  }

  function multiScenes() {
    const menus = validScenes(menuScenes);
    if (menus.length) return menus;

    // 기존 XML 호환용 안전장치: 메뉴 배열이 비어 있어도
    // 좌표가 입력된 씬이 있으면 지도를 빈 화면으로 두지 않습니다.
    return validScenes(allScenes);
  }

  function currentSignature() {
    // 단순 개수뿐 아니라 데이터 갱신 순서까지 반영합니다.
    // init()이 먼저 실행되고 setScenes()가 나중에 호출되는 경우에도
    // 기존 지도를 반드시 다시 구성하도록 sceneRevision을 포함합니다.
    return `${resolvedMode}|${sceneRevision}|${allScenes.length}|${menuScenes.length}`;
  }

  function scheduleRefresh(delay = 0) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      ensureContext(activeContext());
    }, delay);
  }

  function invalidateContexts() {
    Object.values(contexts).forEach((context) => {
      context.initializedSignature = "";
    });
  }

  function waitForKakao() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const check = () => {
        if (window.kakao?.maps?.load) {
          window.kakao.maps.load(resolve);
          return;
        }
        tries += 1;
        if (tries > 150) {
          reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
          return;
        }
        window.setTimeout(check, 100);
      };
      check();
    });
  }

  function waitForVisibleBox(element, generation) {
    return new Promise((resolve, reject) => {
      let stable = 0;
      let previous = "";
      let attempts = 0;

      const inspect = () => {
        if (generation !== initGeneration) {
          reject(new Error("지도 초기화 취소"));
          return;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
        const visible = style.display !== "none" && style.visibility !== "hidden" &&
          rect.width >= 120 && rect.height >= 120;

        stable = visible && key === previous ? stable + 1 : 0;
        previous = key;
        attempts += 1;

        if (stable >= 2) {
          resolve({ width: Math.round(rect.width), height: Math.round(rect.height) });
          return;
        }
        if (attempts > 240) {
          reject(new Error(`지도 컨테이너 크기 확인 실패: ${key}`));
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }

  function averageCenter(scenes) {
    const valid = validScenes(scenes);
    if (!valid.length) return null;
    const sum = valid.reduce((acc, scene) => ({
      lat: acc.lat + Number(scene.lat),
      lng: acc.lng + Number(scene.lng)
    }), { lat: 0, lng: 0 });
    return { lat: sum.lat / valid.length, lng: sum.lng / valid.length };
  }

  function configuredCenter() {
    return hasPosition(mapConfig) ? { lat: Number(mapConfig.lat), lng: Number(mapConfig.lng) } : null;
  }

  function currentScene() {
    return sceneByName.get(currentSceneName) || null;
  }

  function singlePosition() {
    const scene = currentScene();
    if (hasPosition(scene)) return { lat: Number(scene.lat), lng: Number(scene.lng) };
    if (hasPosition(latestPosition)) return latestPosition;
    return configuredCenter() || averageCenter(allScenes) || DEFAULT_CENTER;
  }

  function initialCenter() {
    if (resolvedMode === "multi") {
      return configuredCenter() || averageCenter(multiScenes()) || averageCenter(allScenes) || DEFAULT_CENTER;
    }
    return singlePosition();
  }

  function mapLevel() {
    const configured = finite(mapConfig.level);
    if (Number.isFinite(configured)) return Math.max(1, Math.min(14, configured));
    return resolvedMode === "multi" ? DEFAULT_MULTI_LEVEL : DEFAULT_SINGLE_LEVEL;
  }

  function circleSvg(number, active) {
    const size = active ? 26 : 22;
    const fill = active ? "#ef3b24" : "#2f80ed";
    const fontSize = active ? 11 : 10;
    const label = String(number).padStart(2, "0");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.25}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#fff"
        font-family="Arial,Malgun Gothic,sans-serif" font-size="${fontSize}" font-weight="700">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
  }

  function circleImage(number, active) {
    const size = active ? 26 : 22;
    return new kakao.maps.MarkerImage(
      circleSvg(number, active),
      new kakao.maps.Size(size, size),
      { offset: new kakao.maps.Point(size / 2, size / 2) }
    );
  }

  // PC 미니맵 포인트 툴팁용 표시명입니다.
  // XML이나 메뉴 데이터는 바꾸지 않고, 화면에 보일 때만 앞 번호를 제거합니다.
  function tooltipLabel(scene) {
    return String(scene?.title || scene?.name || "")
      .replace(/^\s*\d{1,3}\s*[.·:_-]?\s*/, "")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createMarkerTooltip(scene, position) {
    const label = tooltipLabel(scene);
    if (!label) return null;

    return new kakao.maps.CustomOverlay({
      position,
      content: `<div class="suwon360-map-tooltip"><span class="suwon360-map-info">${escapeHtml(label)}</span></div>`,
      xAnchor: 0.5,
      yAnchor: 1.42,
      zIndex: 30,
      clickable: false
    });
  }

  function directionSvg(degrees) {
    const angle = ((finite(degrees, 0) % 360) + 360) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <g transform="rotate(${angle} 24 24)">
        <path d="M24 3 L33 24 L27.5 21 L27.5 34 L20.5 34 L20.5 21 L15 24 Z"
          fill="#2f80ed" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
      </g>
      <circle cx="24" cy="31" r="7" fill="#fff" stroke="#2f80ed" stroke-width="3"/>
      <circle cx="24" cy="31" r="3.5" fill="#2f80ed"/>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
  }

  function directionImage(degrees) {
    return new kakao.maps.MarkerImage(
      directionSvg(degrees),
      new kakao.maps.Size(48, 48),
      { offset: new kakao.maps.Point(24, 31) }
    );
  }

  function clearMarkers(context) {
    context.markerItems.forEach((item) => {
      item.marker.setMap(null);
      item.tooltip?.setMap(null);
    });
    context.markerItems = [];
    if (context.currentMarker) context.currentMarker.setMap(null);
    context.currentMarker = null;
    context.currentMarkerHeading = NaN;
  }

  function buildMultiMarkers(context) {
    const source = multiScenes();
    context.markerItems = source.map((scene, index) => {
      const number = index + 1;
      const position = new kakao.maps.LatLng(Number(scene.lat), Number(scene.lng));
      const marker = new kakao.maps.Marker({
        map: context.map,
        position,
        image: circleImage(number, false),
        clickable: true,
        zIndex: 2
      });
      const tooltip = context.name === "desktop" ? createMarkerTooltip(scene, position) : null;

      if (tooltip) {
        kakao.maps.event.addListener(marker, "mouseover", () => {
          tooltip.setPosition(marker.getPosition());
          tooltip.setMap(context.map);
        });
        kakao.maps.event.addListener(marker, "mouseout", () => tooltip.setMap(null));
      }

      kakao.maps.event.addListener(marker, "click", () => {
        tooltip?.setMap(null);
        currentSceneName = scene.name;
        highlightCurrentScene(scene.name);
        window.Suwon360Menu?.select?.(scene.name);
        window.Suwon360Panorama?.loadScene?.(scene.name);
      });

      return { scene, number, marker, tooltip, active: false };
    });
  }

  function effectiveHeading() {
    const sceneHeading = finite(currentScene()?.heading, 0);
    return sceneHeading + finite(latestView.hlookat, 0);
  }

  function createSingleMarker(context) {
    const position = singlePosition();
    const heading = effectiveHeading();
    context.currentMarker = new kakao.maps.Marker({
      map: context.map,
      position: new kakao.maps.LatLng(position.lat, position.lng),
      image: directionImage(heading),
      clickable: false,
      zIndex: 10
    });
    context.currentMarkerHeading = heading;
  }

  function configureContext(context) {
    clearMarkers(context);
    const center = initialCenter();
    context.map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
    context.map.setLevel(mapLevel(), { animate: false });

    if (resolvedMode === "multi") buildMultiMarkers(context);
    else if (resolvedMode === "single") createSingleMarker(context);

    context.initializedSignature = currentSignature();
    highlightCurrentScene(currentSceneName);
  }

  async function ensureContext(context) {
    if (resolvedMode === "off") {
      setMapVisibility(false);
      return context;
    }
    setMapVisibility(true);

    if (context.creating) return context;
    const element = elementFor(context);
    if (!element) return context;

    context.creating = true;
    const generation = ++initGeneration;

    try {
      await waitForKakao();
      const box = await waitForVisibleBox(element, generation);
      const center = initialCenter();

      if (!context.map) {
        context.map = new kakao.maps.Map(element, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: mapLevel(),
          draggable: true,
          scrollwheel: true,
          disableDoubleClickZoom: false
        });
        context.lastWidth = box.width;
        context.lastHeight = box.height;
      }

      if (context.initializedSignature !== currentSignature()) configureContext(context);
      else syncCurrentMarker(context, true);
    } catch (error) {
      if (!/취소/.test(String(error?.message))) console.warn("[Suwon360Map v210]", error);
    } finally {
      context.creating = false;
    }
    return context;
  }

  function setMapVisibility(visible) {
    document.getElementById("suwon360-desktop-map-wrapper")?.toggleAttribute("hidden", !visible);
    document.getElementById("map-pane")?.toggleAttribute("hidden", !visible);
    document.getElementById("mobile-map-pill")?.toggleAttribute("hidden", !visible);
  }

  function resolvedMenuScene(sceneName) {
    return window.Suwon360?.resolveMenuScene?.(sceneName) || sceneName;
  }

  function highlightCurrentScene(sceneName) {
    const target = resolvedMenuScene(sceneName);
    Object.values(contexts).forEach((context) => {
      context.markerItems.forEach((item) => {
        const active = item.scene.name === target;
        if (active === item.active) return;
        item.active = active;
        item.marker.setImage(circleImage(item.number, active));
        item.marker.setZIndex(active ? 10 : 2);
      });
    });
  }

  function syncCurrentMarker(context, recenter = false) {
    if (!context.map || resolvedMode !== "single") return;
    const position = singlePosition();
    const latLng = new kakao.maps.LatLng(position.lat, position.lng);

    if (!context.currentMarker) createSingleMarker(context);
    else context.currentMarker.setPosition(latLng);

    if (recenter) context.map.setCenter(latLng);
    paintHeading(context);
  }

  function paintHeading(context) {
    if (!context.currentMarker || resolvedMode !== "single") return;
    const heading = effectiveHeading();
    if (Number.isFinite(context.currentMarkerHeading) &&
        Math.abs(heading - context.currentMarkerHeading) < 0.5) return;
    context.currentMarkerHeading = heading;
    context.currentMarker.setImage(directionImage(heading));
  }

  function queueHeadingPaint() {
    if (headingPaintQueued) return;
    headingPaintQueued = true;
    requestAnimationFrame(() => {
      headingPaintQueued = false;
      Object.values(contexts).forEach(paintHeading);
    });
  }

  function setConfig(config = {}) {
    mapConfig = {
      mode: normalizeMode(config.mode ?? config.mapmode ?? mapConfig.mode),
      lat: finite(config.lat ?? config.maplat, mapConfig.lat),
      lng: finite(config.lng ?? config.maplng, mapConfig.lng),
      level: finite(config.level ?? config.maplevel, mapConfig.level)
    };
    resolvedMode = determineMode();
    invalidateContexts();

    // app.js에서 init()보다 setConfig()가 늦게 호출되어도 즉시 재구성합니다.
    scheduleRefresh(0);
  }

  function setScenes(scenes, menus) {
    allScenes = Array.isArray(scenes) ? scenes.slice() : [];
    menuScenes = Array.isArray(menus) ? menus.slice() : [];
    sceneByName = new Map(allScenes.map((scene) => [scene.name, scene]));
    sceneRevision += 1;
    resolvedMode = determineMode();
    invalidateContexts();

    // 핵심 수정:
    // 영흥수목원처럼 scene 목록이 비동기로 전달되는 multi 콘텐츠는
    // setScenes() 완료 시점에 지도를 다시 초기화해야 번호 마커가 표시됩니다.
    scheduleRefresh(0);
  }

  async function init() {
    resolvedMode = determineMode();
    await ensureContext(activeContext());

    // 초기 호출 당시 scene 데이터가 아직 없었던 경우를 위한 안전 재시도입니다.
    // 콘텐츠명을 검사하지 않고 mapmode와 좌표 데이터만 사용합니다.
    if (resolvedMode === "multi" && multiScenes().length === 0) {
      scheduleRefresh(120);
    }
  }

  function updateFromScene(sceneName) {
    currentSceneName = String(sceneName || "");
    highlightCurrentScene(currentSceneName);
    if (resolvedMode === "single") {
      Object.values(contexts).forEach((context) => syncCurrentMarker(context, true));
    }
  }

  function selectMenuScene(sceneName) {
    updateFromScene(sceneName);
  }

  function onViewChanged(payload = {}) {
    latestView = {
      hlookat: finite(payload.hlookat, latestView.hlookat),
      fov: finite(payload.fov, latestView.fov)
    };
    queueHeadingPaint();
  }

  function updatePosition(lat, lng, sceneName, hlookat, fov) {
    const next = { lat: finite(lat), lng: finite(lng) };
    if (hasPosition(next)) latestPosition = next;
    if (sceneName) currentSceneName = String(sceneName);
    onViewChanged({ hlookat, fov });

    if (resolvedMode === "single") {
      Object.values(contexts).forEach((context) => syncCurrentMarker(context, true));
    }
  }

  async function forceRelayout() {
    const context = activeContext();
    if (!context.map) {
      await ensureContext(context);
      return;
    }
    const element = elementFor(context);
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
    }, 220);
  }

  const DESKTOP_MAP_SIZES = [
    { key: "small", width: 260, height: 180, nextLabel: "지도 보통" },
    { key: "normal", width: 340, height: 240, nextLabel: "지도 크게" },
    { key: "large", width: 420, height: 300, nextLabel: "지도 작게" }
  ];

  function stabilizeMarkersAfterResize(context, center) {
    if (!context?.map) return;

    context.map.setCenter(center);

    if (resolvedMode === "multi") {
      context.markerItems.forEach((item) => {
        item.marker.setPosition(new kakao.maps.LatLng(Number(item.scene.lat), Number(item.scene.lng)));
        item.marker.setImage(circleImage(item.number, item.active));
        item.marker.setZIndex(item.active ? 10 : 2);
      });
      highlightCurrentScene(currentSceneName);
    } else if (resolvedMode === "single") {
      syncCurrentMarker(context, false);
    }
  }

  function applyDesktopMapSize(wrapper, size) {
    const context = contexts.desktop;
    wrapper.dataset.mapSize = size.key;
    wrapper.style.setProperty("--desktop-map-width", `${size.width}px`);
    wrapper.style.setProperty("--desktop-map-height", `${size.height}px`);

    if (!context.map) {
      window.setTimeout(() => ensureContext(context), 0);
      return;
    }

    const center = context.map.getCenter();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        kakao.maps.event.trigger(context.map, "resize");
        stabilizeMarkersAfterResize(context, center);
        const rect = elementFor(context)?.getBoundingClientRect();
        if (rect) {
          context.lastWidth = Math.round(rect.width);
          context.lastHeight = Math.round(rect.height);
        }
        window.setTimeout(() => stabilizeMarkersAfterResize(context, center), 80);
      });
    });
  }

  function initDesktopMapSizeToggle() {
    const wrapper = document.getElementById("suwon360-desktop-map-wrapper");
    const button = wrapper?.querySelector(".suwon360-map-size-toggle");
    if (!wrapper || !button || button.dataset.bound === "true") return;

    button.dataset.bound = "true";
    let index = Math.max(0, DESKTOP_MAP_SIZES.findIndex((item) => item.key === wrapper.dataset.mapSize));
    if (index < 0) index = 1;
    applyDesktopMapSize(wrapper, DESKTOP_MAP_SIZES[index]);
    button.dataset.tooltip = DESKTOP_MAP_SIZES[index].nextLabel;

    button.addEventListener("click", (event) => {
      if (!isDesktop()) return;
      event.preventDefault();
      event.stopPropagation();
      index = (index + 1) % DESKTOP_MAP_SIZES.length;
      const size = DESKTOP_MAP_SIZES[index];
      applyDesktopMapSize(wrapper, size);
      button.dataset.tooltip = size.nextLabel;
      button.setAttribute("aria-label", `미니맵 크기 변경: ${size.key}`);
    });
  }

  window.addEventListener("resize", () => {
    window.setTimeout(() => ensureContext(activeContext()), 280);
  }, { passive: true });

  initDesktopMapSizeToggle();

  window.Suwon360Map = {
    setConfig,
    setScenes,
    init,
    updateFromScene,
    selectMenuScene,
    onViewChanged,
    updatePosition,
    forceRelayout
  };

  window.js_initialize_suwon360 = () => init();
  window.js_force_minimap_relayout = forceRelayout;
  window.js_suwon360_on_scene_changed = () => {
    const krpano = window.Suwon360?.krpano;
    updateFromScene(krpano?.get?.("xml.scene") || window.Suwon360?.currentScene || "");
  };
  window.js_suwon360_on_view_changed = () => {
    const krpano = window.Suwon360?.krpano;
    if (!krpano?.get) return;
    onViewChanged({
      hlookat: krpano.get("view.hlookat"),
      fov: krpano.get("view.fov")
    });
  };
  window.updateMapPosition = updatePosition;
})();
