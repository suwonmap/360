(() => {
  "use strict";

  /**
   * Suwon360 Kakao minimap module v129
   * ------------------------------------------------------------
   * 지원 대상
   *  - namsuheon.xml : 현재 위치 1개 + 방향(FOV) 표시
   *  - yharbor.xml   : 주요 메뉴 씬 24개 번호 마커 + 말풍선
   *
   * 전제
   *  - Kakao Maps SDK가 autoload=false 로 로드되어 있어야 합니다.
   *  - 지도 컨테이너 id는 #map 입니다.
   *  - krpano 객체는 window.krpano 또는 document.getElementById('krpanoSWFObject')로 접근합니다.
   *  - XML scene 태그에 lat/lng 또는 latitude/longitude 속성이 있어야 합니다.
   *  - 영흥수목원 씬명 형식: yharbor_1, yharbor_5 ... (괄호 없음)
   */

  /* ==========================================================
   * PC / 모바일 미니맵 컨테이너 호환 레이어
   * ----------------------------------------------------------
   * 모바일 : viewer.html의 #map-pane 내부 #map 사용
   * PC     : 예전 정상 구조처럼 우측 하단 고정 프레임을 생성하고
   *          동일한 #map 요소를 그 안으로 이동하여 사용
   * ========================================================== */
  const DESKTOP_BREAKPOINT = 769;
  let mobileMapAnchor = null;
  let desktopMapWrapper = null;
  let desktopResizeState = null;
  let lockedMapHostMode = "";
  let resizeAnimationFrame = 0;

  function injectResponsiveMapCss() {
    if (document.getElementById("suwon360-responsive-map-css")) return;

    const style = document.createElement("style");
    style.id = "suwon360-responsive-map-css";
    style.textContent = `
      #suwon360-desktop-map-wrapper {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 6500;
        width: 300px;
        height: 205px;
        min-width: 235px;
        min-height: 160px;
        overflow: hidden;
        background: transparent;
        border: 1px solid rgba(255,255,255,.30);
        border-radius: 15px;
        box-shadow: 0 5px 18px rgba(0,0,0,.42);
      }
      #suwon360-desktop-map-wrapper[hidden] {
        display: none !important;
      }
      #suwon360-desktop-map-wrapper .suwon360-desktop-map-title {
        position: absolute;
        top: 10px;
        right: 10px;
        left: auto;
        z-index: 120;
        height: 28px;
        width: max-content;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 7px;
        color: #fff;
        background: rgba(0,0,0,.62);
        border: 1px solid rgba(255,255,255,.24);
        border-radius: 999px;
        box-shadow: 0 3px 10px rgba(0,0,0,.25);
        -webkit-backdrop-filter: blur(7px);
        backdrop-filter: blur(7px);
        font: 800 11px/1 "Malgun Gothic", sans-serif;
        pointer-events: none;
      }
      #suwon360-desktop-map-wrapper .suwon360-map-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        z-index: 130;
        width: 26px;
        height: 26px;
        cursor: nwse-resize;
        touch-action: none;
        background: linear-gradient(315deg, transparent 0, transparent 45%, rgba(15,23,42,.88) 46%, rgba(15,23,42,.88) 100%);
      }
      #suwon360-desktop-map-wrapper .suwon360-map-resize-handle::after {
        content: "";
        position: absolute;
        left: 4px;
        top: 4px;
        width: 9px;
        height: 9px;
        border-left: 2px solid #fff;
        border-top: 2px solid #fff;
      }
      #suwon360-desktop-map-wrapper > #map {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 1px !important;
        min-height: 1px !important;
      }
      #map-pane > #map {
        width: 100%;
        height: 100%;
        min-width: 1px;
        min-height: 1px;
      }
      #map .suwon360-map-marker {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }
      #map .suwon360-map-marker-circle {
        flex: 0 0 auto;
        transition: none !important;
        transform: none !important;
        backface-visibility: visible !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: geometricPrecision;
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 768px) {
        #suwon360-desktop-map-wrapper {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isDesktopMapMode() {
    return window.innerWidth >= DESKTOP_BREAKPOINT &&
      !document.documentElement.classList.contains("s360-mobile");
  }

  function ensureMobileMapAnchor() {
    const mapElement = document.getElementById("map");
    if (!mapElement) return null;

    if (!mobileMapAnchor) {
      mobileMapAnchor = document.createComment("suwon360-map-mobile-anchor");
      mapElement.parentNode?.insertBefore(mobileMapAnchor, mapElement);
    }
    return mapElement;
  }

  function ensureDesktopMapWrapper() {
    if (desktopMapWrapper?.isConnected) return desktopMapWrapper;

    desktopMapWrapper = document.createElement("section");
    desktopMapWrapper.id = "suwon360-desktop-map-wrapper";
    desktopMapWrapper.setAttribute("aria-label", "PC 카카오 미니맵");
    desktopMapWrapper.innerHTML = `
      <div class="suwon360-desktop-map-title">⌖&nbsp; 미니맵</div>
      <div class="suwon360-map-resize-handle" title="드래그하여 지도 크기 조절"></div>
    `;
    document.body.appendChild(desktopMapWrapper);
    initializeDesktopMapResize(desktopMapWrapper);
    return desktopMapWrapper;
  }

  function restoreMapToMobilePane(mapElement) {
    if (!mapElement || !mobileMapAnchor?.parentNode) return;
    mobileMapAnchor.parentNode.insertBefore(mapElement, mobileMapAnchor.nextSibling);
  }

  function syncResponsiveMapHost() {
    injectResponsiveMapCss();
    const mapElement = ensureMobileMapAnchor();
    if (!mapElement) return;

    const wrapper = ensureDesktopMapWrapper();
    const requestedMode = isDesktopMapMode() ? "desktop" : "mobile";

    // v129: Kakao Map 객체가 만들어진 뒤에는 #map의 부모 DOM을 절대 바꾸지 않습니다.
    // 생성 후 reparent하면 타일 좌표계와 Marker 좌표계가 서로 달라져
    // 지도 이동 시 포인트가 밀리거나 일부 타일이 비는 현상이 발생할 수 있습니다.
    if (!lockedMapHostMode) lockedMapHostMode = requestedMode;
    const activeMode = map ? lockedMapHostMode : requestedMode;

    if (activeMode === "desktop") {
      wrapper.hidden = false;
      if (!map && mapElement.parentNode !== wrapper) wrapper.appendChild(mapElement);
    } else {
      wrapper.hidden = true;
      if (!map) restoreMapToMobilePane(mapElement);
    }
  }

  function initializeDesktopMapResize(wrapper) {
    const handle = wrapper.querySelector(".suwon360-map-resize-handle");
    if (!handle || handle.dataset.bound === "true") return;
    handle.dataset.bound = "true";

    const stopResize = () => {
      if (!desktopResizeState) return;
      desktopResizeState = null;
      document.body.style.userSelect = "";
      if (resizeAnimationFrame) {
        window.cancelAnimationFrame(resizeAnimationFrame);
        resizeAnimationFrame = 0;
      }
      forceRelayout({ force: true });
    };

    handle.addEventListener("pointerdown", (event) => {
      if (!isDesktopMapMode()) return;
      event.preventDefault();
      handle.setPointerCapture?.(event.pointerId);
      const rect = wrapper.getBoundingClientRect();
      desktopResizeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height
      };
      document.body.style.userSelect = "none";
    });

    handle.addEventListener("pointermove", (event) => {
      if (!desktopResizeState || desktopResizeState.pointerId !== event.pointerId) return;
      event.preventDefault();

      const width = Math.max(235, Math.min(window.innerWidth * 0.72,
        desktopResizeState.startWidth + (desktopResizeState.startX - event.clientX)));
      const height = Math.max(160, Math.min(window.innerHeight * 0.72,
        desktopResizeState.startHeight + (desktopResizeState.startY - event.clientY)));

      wrapper.style.width = `${Math.round(width)}px`;
      wrapper.style.height = `${Math.round(height)}px`;

      // v129: 크기 조절 중 debounce relayout을 누적하지 않고
      // 프레임당 한 번만 Kakao resize를 수행합니다.
      if (resizeAnimationFrame) window.cancelAnimationFrame(resizeAnimationFrame);
      resizeAnimationFrame = window.requestAnimationFrame(() => {
        resizeAnimationFrame = 0;
        if (!map || isMapDragging) return;
        preserveViewState();
        window.kakao.maps.event.trigger(map, "resize");
        if (preservedCenter) map.setCenter(preservedCenter);
      });
    });

    handle.addEventListener("pointerup", stopResize);
    handle.addEventListener("pointercancel", stopResize);
  }

  const DEFAULT_CENTER = { lat: 37.2636, lng: 127.0286 };
  const DEFAULT_LEVEL = 4;

  const ALLOWED_MAP_XML = ["namsuheon.xml", "yharbor.xml"];

  // 메뉴와 지도 포인트는 XML scene의 menu_show="true" 기준으로 생성합니다.


  let map = null;
  let currentXmlFilename = "";
  let currentSceneName = "";
  let sceneCoords = [];
  let menuSceneCoords = [];
  let sceneMarkers = [];
  let indoorOverlay = null;
  let indoorOverlayElement = null;
  let infoWindow = null;
  let sdkLoadStarted = false;
  let mapInitStarted = false;
  let lastView = { hlookat: 0, fov: 90 };
  let preservedCenter = null;
  let preservedLevel = null;

  // v123: 영흥수목원 최초 진입 시 전체 메뉴 포인트가 보이도록
  // setBounds()를 한 번만 적용합니다.
  let initialOutdoorBoundsApplied = false;

  // v128: 지도 드래그 중 resize/relayout이 겹치지 않도록 상태를 분리합니다.
  let isMapDragging = false;
  let pendingRelayout = false;
  let relayoutTimer = null;
  let lastMapWidth = 0;
  let lastMapHeight = 0;

  const state = {
    keepCenter: true,
    keepLevel: true,
    showInfoWindowOnHover: true,
    showInfoWindowOnClick: true
  };

  function log(...args) {
    if (window.SUWON360_MAP_DEBUG) {
      console.log("[Suwon360Map]", ...args);
    }
  }

  function warn(...args) {
    console.warn("[Suwon360Map]", ...args);
  }

  function getMapElement() {
    return document.getElementById("map");
  }

  function getKrpano() {
    return (
      window.krpano ||
      document.getElementById("krpanoSWFObject") ||
      document.querySelector("embed[name='krpanoSWFObject']") ||
      null
    );
  }

  function getQueryParams() {
    return new URLSearchParams(window.location.search);
  }

  function normalizeXmlFilename(value) {
    if (!value) return "";
    const raw = String(value).split("?")[0].split("#")[0];
    return raw.substring(raw.lastIndexOf("/") + 1).toLowerCase();
  }

  function resolveXmlFilename(explicitFilename = "") {
    const normalizedExplicit = normalizeXmlFilename(explicitFilename);
    if (normalizedExplicit) return normalizedExplicit;

    const params = getQueryParams();
    const tour = (params.get("tour") || "").trim();
    if (tour) return normalizeXmlFilename(`${tour}.xml`);

    return currentXmlFilename;
  }

  function resolveXmlUrls(filename) {
    const params = getQueryParams();
    const contents = (params.get("contents") || "suwon_tour").trim().replace(/^\/+|\/+$/g, "");

    if (window.Suwon360Config?.xmlUrl) {
      return [window.Suwon360Config.xmlUrl];
    }

    if (window.Suwon360Config?.resolveXmlUrl) {
      const resolved = window.Suwon360Config.resolveXmlUrl(filename, contents);
      return Array.isArray(resolved) ? resolved : [resolved];
    }

    // 현재 권장 구조: /suwon_tour/yharbor.xml
    // 기존 구조도 자동 호환: /suwon_tour/xml/yharbor.xml
    return [
      `${contents}/${filename}`,
      `${contents}/xml/${filename}`
    ];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseNumber(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(String(value).trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  function readSceneCoordinate(sceneElement) {
    const lat = parseNumber(
      sceneElement.getAttribute("lat"),
      sceneElement.getAttribute("latitude"),
      sceneElement.getAttribute("map_lat"),
      sceneElement.getAttribute("gpslat"),
      sceneElement.querySelector("view")?.getAttribute("lat"),
      sceneElement.querySelector("view")?.getAttribute("latitude")
    );

    const lng = parseNumber(
      sceneElement.getAttribute("lng"),
      sceneElement.getAttribute("lon"),
      sceneElement.getAttribute("longitude"),
      sceneElement.getAttribute("map_lng"),
      sceneElement.getAttribute("gpslng"),
      sceneElement.querySelector("view")?.getAttribute("lng"),
      sceneElement.querySelector("view")?.getAttribute("longitude")
    );

    return { lat, lng };
  }

  function readSceneTitle(sceneElement, fallbackName) {
    return (
      sceneElement.getAttribute("title") ||
      sceneElement.getAttribute("caption") ||
      sceneElement.getAttribute("label") ||
      fallbackName
    );
  }

  function ensureKakaoMaps(callback) {
    if (window.kakao?.maps?.load) {
      window.kakao.maps.load(callback);
      return;
    }

    if (sdkLoadStarted) {
      let retry = 0;
      const timer = window.setInterval(() => {
        retry += 1;
        if (window.kakao?.maps?.load) {
          window.clearInterval(timer);
          window.kakao.maps.load(callback);
        } else if (retry > 100) {
          window.clearInterval(timer);
          showPlaceholder("카카오 지도 SDK를 불러오지 못했습니다.");
        }
      }, 100);
      return;
    }

    sdkLoadStarted = true;
    showPlaceholder("미니맵을 준비 중입니다.");

    let retry = 0;
    const timer = window.setInterval(() => {
      retry += 1;
      if (window.kakao?.maps?.load) {
        window.clearInterval(timer);
        window.kakao.maps.load(callback);
      } else if (retry > 100) {
        window.clearInterval(timer);
        showPlaceholder("카카오 지도 SDK를 불러오지 못했습니다.");
      }
    }, 100);
  }

  function showPlaceholder(message) {
    const element = getMapElement();
    if (!element) return;
    element.innerHTML = `<div class="map-placeholder">${escapeHtml(message)}</div>`;
  }

  function clearPlaceholder() {
    const element = getMapElement();
    if (!element) return;
    const placeholder = element.querySelector(".map-placeholder");
    if (placeholder) placeholder.remove();
  }

  function createMap(center = DEFAULT_CENTER) {
    const element = getMapElement();
    if (!element || map) return;

    clearPlaceholder();

    const centerLatLng = new window.kakao.maps.LatLng(center.lat, center.lng);
    map = new window.kakao.maps.Map(element, {
      center: centerLatLng,
      level: preservedLevel ?? DEFAULT_LEVEL
    });

    infoWindow = new window.kakao.maps.CustomOverlay({
      zIndex: 20,
      xAnchor: 0.5,
      yAnchor: 1.35
    });

    window.kakao.maps.event.addListener(map, "center_changed", () => {
      if (map) preservedCenter = map.getCenter();
    });

    window.kakao.maps.event.addListener(map, "zoom_changed", () => {
      if (map) preservedLevel = map.getLevel();
    });

    // v127: 지도 자체를 끌고 있는 동안에는 resize/relayout을 실행하지 않습니다.
    // CustomOverlay의 CSS 전환도 잠시 끄므로 번호 원형이 밀리는 느낌을 줄입니다.
    window.kakao.maps.event.addListener(map, "dragstart", () => {
      isMapDragging = true;
      if (relayoutTimer) {
        window.clearTimeout(relayoutTimer);
        relayoutTimer = null;
      }
      if (resizeAnimationFrame) {
        window.cancelAnimationFrame(resizeAnimationFrame);
        resizeAnimationFrame = 0;
      }
      pendingRelayout = false;
      getMapElement()?.classList.add("suwon360-map-dragging");
      closeInfoWindow();
    });

    window.kakao.maps.event.addListener(map, "dragend", () => {
      isMapDragging = false;
      pendingRelayout = false;
      getMapElement()?.classList.remove("suwon360-map-dragging");
      preserveViewState();
      // v127: 일반 지도 이동 종료 시 resize/relayout을 절대 호출하지 않습니다.
      // Kakao Maps가 이동 중 CustomOverlay 좌표를 자체 갱신하도록 그대로 둡니다.
    });

    window.kakao.maps.event.addListener(map, "idle", () => {
      if (!map || isMapDragging) return;
      preserveViewState();
      // v127: idle마다 마커 스타일/크기를 다시 적용하지 않습니다.
    });

    log("map created");
  }

  async function fetchXml(xmlUrls) {
    const candidates = Array.isArray(xmlUrls) ? xmlUrls : [xmlUrls];
    let lastError = null;

    for (const xmlUrl of candidates) {
      try {
        const response = await fetch(xmlUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`XML 요청 실패 (${response.status}): ${xmlUrl}`);
        }

        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, "application/xml");
        const parserError = doc.querySelector("parsererror");
        if (parserError) {
          throw new Error(`XML 파싱 오류: ${xmlUrl}`);
        }

        return { doc, url: xmlUrl };
      } catch (error) {
        lastError = error;
        log("XML 경로 재시도", xmlUrl, error.message);
      }
    }

    throw lastError || new Error("XML을 불러오지 못했습니다.");
  }

  function extractScenes(xmlDoc) {
    const result = [];

    xmlDoc.querySelectorAll("scene").forEach((sceneElement) => {
      const name = sceneElement.getAttribute("name") || "";
      if (!name) return;

      const { lat, lng } = readSceneCoordinate(sceneElement);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const menuShow = ["true", "1", "yes", "on"].includes(
        String(sceneElement.getAttribute("menu_show") || "").trim().toLowerCase()
      );
      const menuParent = String(sceneElement.getAttribute("menu_parent") || "").trim();

      result.push({
        name,
        title: readSceneTitle(sceneElement, name),
        menuShow,
        menuParent,
        lat,
        lng
      });
    });

    return result;
  }

  function clearSceneMarkers() {
    sceneMarkers.forEach((item) => {
      item.marker?.setMap(null);
    });
    sceneMarkers = [];

    if (infoWindow) infoWindow.setMap?.(null);
  }

  function clearIndoorOverlay() {
    if (indoorOverlay) indoorOverlay.setMap(null);
    indoorOverlay = null;
    indoorOverlayElement = null;
  }

  function clearAllOverlays() {
    clearSceneMarkers();
    clearIndoorOverlay();
  }

  function getMainSceneOrder() {
    return menuSceneCoords.map((scene) => scene.name);
  }

  // v128: 영흥수목원 번호 포인트는 HTML CustomOverlay 대신
  // 카카오 기본 Marker + 고정 크기 SVG MarkerImage를 사용합니다.
  // 지도 드래그 중 카카오 내부 overlay DOM 재배치로 포인트가
  // 사라지거나 밀리는 현상을 구조적으로 방지합니다.
  const markerImageCache = new Map();

  function createMarkerImage(number, selected = false) {
    const cacheKey = `${number}:${selected ? 1 : 0}`;
    if (markerImageCache.has(cacheKey)) return markerImageCache.get(cacheKey);

    // 이전 모바일 원형 느낌을 유지하되, 선택 여부와 관계없이
    // 40×40 고정 캔버스를 사용하여 중심점이 절대 바뀌지 않게 합니다.
    const diameter = selected ? 34 : 28;
    const radius = diameter / 2;
    const fill = selected ? "#ff3d00" : "#2f8cff";
    const fontSize = selected ? 13 : 11;
    const label = String(number).padStart(2, "0");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="${radius - 1}"
                fill="${fill}" stroke="rgba(255,255,255,.72)" stroke-width="1"/>
        <text x="20" y="20.5" text-anchor="middle" dominant-baseline="middle"
              fill="#ffffff" font-family="Arial, Malgun Gothic, sans-serif"
              font-size="${fontSize}" font-weight="800">${label}</text>
      </svg>`;

    const imageUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    const image = new window.kakao.maps.MarkerImage(
      imageUrl,
      new window.kakao.maps.Size(40, 40),
      { offset: new window.kakao.maps.Point(20, 20) }
    );

    markerImageCache.set(cacheKey, image);
    return image;
  }

  function applyMarkerStyle(item, selected) {
    if (!item?.marker) return;
    item.selected = Boolean(selected);
    item.marker.setImage(createMarkerImage(item.number, item.selected));
    item.marker.setZIndex(item.selected ? 15 : 10);
  }

  function makeInfoContent(item) {
    return `
      <div class="suwon360-map-tooltip">
        <div class="suwon360-map-info"
             style="padding:6px 9px;white-space:nowrap;font-size:12px;line-height:1.25;color:#fff;background:rgba(0,0,0,.45);border:0;border-radius:7px;box-shadow:0 4px 12px rgba(0,0,0,.20);">
          ${escapeHtml(item.title)}
        </div>
      </div>
    `;
  }

  function canShowInfoWindow() {
    return window.matchMedia("(min-width: 769px)").matches;
  }

  function openInfoWindow(item) {
    if (!map || !infoWindow || !item?.marker || !canShowInfoWindow()) return;

    infoWindow.setContent(makeInfoContent(item));
    infoWindow.setPosition(new window.kakao.maps.LatLng(item.lat, item.lng));
    infoWindow.setMap(map);
  }

  function closeInfoWindow() {
    infoWindow?.setMap?.(null);
  }

  function loadScene(sceneName) {
    if (!sceneName) return;

    const krpano = getKrpano();
    if (krpano?.call) {
      try {
        krpano.call(`loadscene(${sceneName}, null, MERGE, BLEND(0.5));`);
      } catch (error) {
        warn("krpano loadscene 실패", error);
      }
    }

    window.Suwon360Menu?.select?.(sceneName);
    highlightCurrentScene(sceneName);
  }

  function bindMarkerEvents(item) {
    if (!item?.marker || !window.kakao?.maps?.event) return;

    window.kakao.maps.event.addListener(item.marker, "click", () => {
      loadScene(item.name);
      if (state.showInfoWindowOnClick) openInfoWindow(item);
    });

    if (state.showInfoWindowOnHover) {
      window.kakao.maps.event.addListener(item.marker, "mouseover", () => openInfoWindow(item));
      window.kakao.maps.event.addListener(item.marker, "mouseout", closeInfoWindow);
    }
  }

  function drawOutdoorMarkers(xmlFilename) {
    clearAllOverlays();

    const mainOrder = getMainSceneOrder();
    if (!mainOrder.length) return;

    const sceneByName = new Map(sceneCoords.map((scene) => [scene.name, scene]));
    const bounds = new window.kakao.maps.LatLngBounds();

    mainOrder.forEach((sceneName, index) => {
      const scene = sceneByName.get(sceneName);
      if (!scene) {
        warn(`좌표가 없는 주요 씬: ${sceneName}`);
        return;
      }

      const number = index + 1;
      const position = new window.kakao.maps.LatLng(scene.lat, scene.lng);
      const selected = scene.name === resolveMenuSceneName(currentSceneName);

      const marker = new window.kakao.maps.Marker({
        map,
        position,
        image: createMarkerImage(number, selected),
        clickable: true,
        zIndex: selected ? 15 : 10,
        title: scene.title
      });

      const item = {
        ...scene,
        number,
        marker,
        selected
      };

      bindMarkerEvents(item);
      sceneMarkers.push(item);
      bounds.extend(position);
    });

    const shouldFitAllMarkers =
      !initialOutdoorBoundsApplied &&
      sceneMarkers.length > 1;

    if (shouldFitAllMarkers) {
      initialOutdoorBoundsApplied = true;

      // v129: setBounds는 컨테이너 크기가 확정된 뒤 최초 1회만 실행합니다.
      // 반복 setBounds가 지도 투영 좌표와 Marker 위치를 연속 재계산하던 문제를 제거합니다.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!map || currentXmlFilename !== "yharbor.xml") return;
          fitOutdoorMarkers(bounds);
        });
      });
    } else {
      // 최초 전체 맞춤 이후에는 사용자가 조정한 중심과 확대 수준을 유지합니다.
      if (preservedCenter && state.keepCenter) map.setCenter(preservedCenter);
      if (preservedLevel !== null && state.keepLevel) map.setLevel(preservedLevel);
    }
  }

  function createIndoorMarkerElement() {
    const root = document.createElement("div");
    root.id = "rvMarker";
    root.className = "suwon360-indoor-marker";

    Object.assign(root.style, {
      position: "relative",
      width: "70px",
      height: "70px",
      pointerEvents: "none",
      zIndex: "12"
    });

    const direction = document.createElement("div");
    direction.id = "rvDirection";
    Object.assign(direction.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "0",
      height: "0",
      transform: "translate(-50%, -50%) rotate(0deg)",
      transformOrigin: "center center",
      pointerEvents: "none"
    });

    const cone = document.createElement("div");
    cone.id = "fovCone";
    Object.assign(cone.style, {
      position: "absolute",
      left: "-28px",
      top: "-44px",
      width: "0",
      height: "0",
      borderLeft: "28px solid transparent",
      borderRight: "28px solid transparent",
      borderBottom: "55px solid rgba(0,140,255,0.28)",
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,.2))",
      pointerEvents: "none"
    });

    const arrow = document.createElement("div");
    arrow.id = "rvArrow";
    Object.assign(arrow.style, {
      position: "absolute",
      left: "-8px",
      top: "-17px",
      width: "0",
      height: "0",
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderBottom: "20px solid #087cff",
      filter: "drop-shadow(0 1px 2px rgba(0,0,0,.4))",
      pointerEvents: "none"
    });

    const centerDot = document.createElement("div");
    Object.assign(centerDot.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "14px",
      height: "14px",
      transform: "translate(-50%, -50%)",
      borderRadius: "50%",
      background: "#087cff",
      border: "3px solid #fff",
      boxShadow: "0 2px 6px rgba(0,0,0,.45)",
      boxSizing: "border-box"
    });

    direction.append(cone, arrow);
    root.append(direction, centerDot);
    return root;
  }

  function drawIndoorMarker(scene) {
    if (!scene || !map) return;

    clearAllOverlays();

    indoorOverlayElement = createIndoorMarkerElement();
    indoorOverlay = new window.kakao.maps.CustomOverlay({
      map,
      position: new window.kakao.maps.LatLng(scene.lat, scene.lng),
      content: indoorOverlayElement,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 20
    });

    if (!state.keepCenter || !preservedCenter) {
      map.setCenter(new window.kakao.maps.LatLng(scene.lat, scene.lng));
    } else {
      map.setCenter(preservedCenter);
    }

    updateDirection(lastView.hlookat, lastView.fov);

    // CustomOverlay DOM 장착 직후 한 번 더 적용하여 모바일 렌더링 지연을 보정합니다.
    window.requestAnimationFrame(() => {
      updateDirection(lastView.hlookat, lastView.fov);
    });
  }

  function findScene(sceneName) {
    return sceneCoords.find((item) => item.name === sceneName) || null;
  }

  function resolveMenuSceneName(sceneName) {
    return window.Suwon360?.resolveMenuScene?.(sceneName) || sceneName || "";
  }

  function highlightCurrentScene(sceneName) {
    currentSceneName = sceneName || currentSceneName;
    const activeMenuScene = resolveMenuSceneName(currentSceneName);

    sceneMarkers.forEach((item) => {
      const selected = item.name === activeMenuScene;
      if (item.selected !== selected) applyMarkerStyle(item, selected);
    });
  }

  function selectMenuScene(sceneName) {
    const resolved = resolveMenuSceneName(sceneName);
    if (!resolved) return;
    currentSceneName = resolved;
    highlightCurrentScene(resolved);
    window.Suwon360Menu?.select?.(resolved);
  }

  function updateDirection(hlookat, fov) {
    const heading = Number(hlookat);
    const fieldOfView = Number(fov);

    if (Number.isFinite(heading)) {
      // v125: 음수 및 360도를 넘는 krpano hlookat 값을 정규화합니다.
      lastView.hlookat = ((heading % 360) + 360) % 360;
    }

    if (Number.isFinite(fieldOfView)) lastView.fov = fieldOfView;

    const direction = indoorOverlayElement?.querySelector("#rvDirection");
    const cone = indoorOverlayElement?.querySelector("#fovCone");
    if (!direction) return;

    // 지도 북쪽(위쪽)을 0도로 보고 krpano hlookat을 시계방향으로 적용합니다.
    // 콘텐츠별 보정값이 필요하면 window.SUWON360_HEADING_OFFSET에 각도를 지정할 수 있습니다.
    const headingOffset = Number(window.SUWON360_HEADING_OFFSET || 0);
    const mapHeading = ((lastView.hlookat + headingOffset) % 360 + 360) % 360;
    direction.style.transform = `translate(-50%, -50%) rotateZ(${mapHeading}deg)`;

    if (cone && Number.isFinite(lastView.fov)) {
      const clamped = Math.max(30, Math.min(120, lastView.fov));
      const halfWidth = Math.round(16 + (clamped - 30) * 0.22);
      cone.style.left = `${-halfWidth}px`;
      cone.style.borderLeftWidth = `${halfWidth}px`;
      cone.style.borderRightWidth = `${halfWidth}px`;
    }
  }

  function updatePosition(lat, lng, sceneName = "", hlookat = null, fov = null) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (sceneName) currentSceneName = sceneName;

    if (Number.isFinite(hlookat) || Number.isFinite(fov)) {
      updateDirection(hlookat, fov);
    }

    if (!map || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      highlightCurrentScene(currentSceneName);
      window.Suwon360Menu?.select?.(currentSceneName);
      return;
    }

    const position = new window.kakao.maps.LatLng(latitude, longitude);

    if (currentXmlFilename === "namsuheon.xml") {
      if (!indoorOverlay) {
        drawIndoorMarker({ lat: latitude, lng: longitude, name: currentSceneName });
      } else {
        indoorOverlay.setPosition(position);
      }

      if (!state.keepCenter) map.setCenter(position);
    } else {
      highlightCurrentScene(currentSceneName);
    }

    window.Suwon360Menu?.select?.(currentSceneName);
  }

  function updateFromScene(sceneName) {
    if (!sceneName) return;

    currentSceneName = sceneName;
    highlightCurrentScene(sceneName);
    window.Suwon360Menu?.select?.(sceneName);

    if (currentXmlFilename === "namsuheon.xml") {
      const scene = findScene(sceneName);
      if (scene) {
        updatePosition(scene.lat, scene.lng, sceneName, lastView.hlookat, lastView.fov);
      }
    }
  }

  function onViewChanged(view = {}) {
    updateDirection(view.hlookat, view.fov);
  }

  function preserveViewState() {
    if (!map) return;
    preservedCenter = map.getCenter();
    preservedLevel = map.getLevel();
  }

  function forceRelayout(options = {}) {
    if (!map || !window.kakao?.maps?.event) return;

    // v127: relayout은 지도 컨테이너의 실제 크기가 바뀐 경우에만 실행합니다.
    // 일반 마우스 드래그/지도 이동 중에는 호출하지 않습니다.
    if (isMapDragging) return;

    const element = getMapElement();
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width < 2 || height < 2) return;

    const force = options.force === true;
    const sizeChanged = width !== lastMapWidth || height !== lastMapHeight;
    if (!force && !sizeChanged) return;

    const preserveView = options.preserveView !== false;
    if (preserveView) preserveViewState();

    if (relayoutTimer) window.clearTimeout(relayoutTimer);
    relayoutTimer = window.setTimeout(() => {
      relayoutTimer = null;
      if (!map || isMapDragging) return;

      const latest = getMapElement()?.getBoundingClientRect();
      if (!latest || latest.width < 2 || latest.height < 2) return;
      lastMapWidth = Math.round(latest.width);
      lastMapHeight = Math.round(latest.height);

      window.kakao.maps.event.trigger(map, "resize");

      if (!preserveView) return;
      window.requestAnimationFrame(() => {
        if (!map || isMapDragging) return;
        if (preservedCenter) map.setCenter(preservedCenter);
        if (preservedLevel !== null) map.setLevel(preservedLevel, { animate: false });
      });
    }, 40);
  }

  function fitOutdoorMarkers(bounds) {
    if (!map || !bounds || currentXmlFilename !== "yharbor.xml" || isMapDragging) return;

    const element = getMapElement();
    const rect = element?.getBoundingClientRect();
    if (!rect || rect.width < 2 || rect.height < 2) return;

    // v129: 현재 실제 크기를 Kakao 내부 좌표계에 먼저 반영한 뒤
    // setBounds를 정확히 한 번만 실행합니다. 이후 별도 resize/center 복원을 하지 않습니다.
    lastMapWidth = Math.round(rect.width);
    lastMapHeight = Math.round(rect.height);
    window.kakao.maps.event.trigger(map, "resize");
    map.setBounds(bounds, 18, 18, 18, 18);

    preservedCenter = map.getCenter();
    preservedLevel = map.getLevel();
  }

  async function loadXmlAndDrawMarkers(xmlFilename = "") {
    const filename = resolveXmlFilename(xmlFilename);
    if (!filename) {
      showPlaceholder("지도 XML을 확인할 수 없습니다.");
      return;
    }

    if (!ALLOWED_MAP_XML.includes(filename)) {
      showPlaceholder("이 콘텐츠는 미니맵을 제공하지 않습니다.");
      return;
    }

    if (currentXmlFilename !== filename) {
      initialOutdoorBoundsApplied = false;
      preservedCenter = null;
      preservedLevel = null;
    }

    currentXmlFilename = filename;
    const xmlUrls = resolveXmlUrls(filename);

    try {
      const loaded = await fetchXml(xmlUrls);
      const xmlDoc = loaded.doc;
      const xmlUrl = loaded.url;
      if (!sceneCoords.length) sceneCoords = extractScenes(xmlDoc);

      if (!menuSceneCoords.length) {
        // XML의 scene 속성 menu_show="true"를 직접 기준으로 사용합니다.
        // krpano API에서 사용자 정의 scene 속성을 늦게 반환하는 경우에도 동작합니다.
        menuSceneCoords = sceneCoords.filter((scene) => scene.menuShow === true);

        // 기존 공유 데이터가 정상적으로 준비된 경우에는 이름 기준 결과도 병합합니다.
        const menuNames = new Set(window.Suwon360?.menuScenes?.map((scene) => scene.name) || []);
        if (menuNames.size) {
          const merged = new Map(menuSceneCoords.map((scene) => [scene.name, scene]));
          sceneCoords.forEach((scene) => {
            if (menuNames.has(scene.name)) merged.set(scene.name, scene);
          });
          menuSceneCoords = Array.from(merged.values());
        }
      }

      if (!sceneCoords.length) {
        showPlaceholder("XML에서 위·경도 좌표를 찾지 못했습니다.");
        return;
      }

      if (!map) {
        createMap(sceneCoords[0]);
      }

      if (filename === "yharbor.xml") {
        if (!menuSceneCoords.length) {
          showPlaceholder("menu_show=\"true\"인 좌표 Scene을 찾지 못했습니다.");
          return;
        }
        drawOutdoorMarkers(filename);
      } else if (filename === "namsuheon.xml") {
        const target = findScene(currentSceneName) || sceneCoords[0];
        drawIndoorMarker(target);
      }

      // 영흥수목원 최초 setBounds 직후에는 일반 relayout의 기존 시점 복원을
      // 실행하지 않습니다. 실내 지도와 이후 갱신에서만 기존 화면을 유지합니다.
      if (filename !== "yharbor.xml" || !initialOutdoorBoundsApplied) {
        forceRelayout();
      }
      log("XML loaded", xmlUrl, sceneCoords.length);
    } catch (error) {
      warn(error);
      showPlaceholder("미니맵 데이터를 불러오지 못했습니다.");
    }
  }

  function setScenes(allScenes = [], visibleMenuScenes = []) {
    sceneCoords = Array.isArray(allScenes)
      ? allScenes.filter((scene) => Number.isFinite(scene.lat) && Number.isFinite(scene.lng))
      : [];

    menuSceneCoords = Array.isArray(visibleMenuScenes)
      ? visibleMenuScenes.filter((scene) => Number.isFinite(scene.lat) && Number.isFinite(scene.lng))
      : [];

    if (map && currentXmlFilename === "yharbor.xml" && menuSceneCoords.length) {
      drawOutdoorMarkers(currentXmlFilename);
      highlightCurrentScene(currentSceneName);
      forceRelayout();
    }
  }

  function init(xmlFilename = "") {
    syncResponsiveMapHost();

    if (mapInitStarted && map) {
      forceRelayout();
      return;
    }

    mapInitStarted = true;
    const element = getMapElement();
    if (!element) {
      mapInitStarted = false;
      return;
    }

    ensureKakaoMaps(() => {
      const filename = resolveXmlFilename(xmlFilename);

      if (currentXmlFilename !== filename) {
        initialOutdoorBoundsApplied = false;
        preservedCenter = null;
        preservedLevel = null;
      }

      currentXmlFilename = filename;

      if (sceneCoords.length) {
        if (!map) createMap(sceneCoords[0]);
        if (filename === "yharbor.xml" && menuSceneCoords.length) {
          drawOutdoorMarkers(filename);
        } else if (filename === "namsuheon.xml") {
          const target = findScene(currentSceneName) || sceneCoords[0];
          drawIndoorMarker(target);
        }
        forceRelayout();
        return;
      }

      loadXmlAndDrawMarkers(filename);
    });
  }

  function setKeepCenter(value) {
    state.keepCenter = Boolean(value);
  }

  function setKeepLevel(value) {
    state.keepLevel = Boolean(value);
  }

  function resetView() {
    preservedCenter = null;
    preservedLevel = null;

    if (!map) return;

    if (sceneCoords.length) {
      map.setCenter(new window.kakao.maps.LatLng(sceneCoords[0].lat, sceneCoords[0].lng));
    } else {
      map.setCenter(new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng));
    }
    map.setLevel(DEFAULT_LEVEL);
  }

  // krpano XML에서 직접 호출할 수 있는 전역 함수
  window.initKakaoMap = function initKakaoMap(xmlFilename) {
    init(xmlFilename);
  };

  window.loadXmlAndDrawMarkers = function loadXmlAndDrawMarkersGlobal(xmlFilename) {
    ensureKakaoMaps(() => loadXmlAndDrawMarkers(xmlFilename));
  };

  window.updateMapPosition = function updateMapPositionGlobal(
    lat,
    lng,
    sceneName = "",
    hlookat = null,
    fov = null
  ) {
    updatePosition(lat, lng, sceneName, hlookat, fov);
  };

  window.highlightCurrentScene = highlightCurrentScene;

  // 새 프레임워크 panorama.js 호환 함수
  window.js_update_minimap_position = function jsUpdateMinimapPosition(
    lat,
    lng,
    sceneName = "",
    hlookat = null,
    fov = null
  ) {
    updatePosition(lat, lng, sceneName, hlookat, fov);
  };

  window.js_force_minimap_relayout = forceRelayout;

  window.js_suwon360_on_view_changed = function jsSuwon360OnViewChanged(hlookat, fov) {
    // v127: common_layout.xml은 인수 없이 이 함수를 호출합니다.
    // map.js가 panorama.js의 동일 전역 함수를 덮어쓰더라도 krpano에서
    // 현재 시선값을 직접 읽어 남수헌 방향마커가 계속 회전하게 합니다.
    let heading = Number(hlookat);
    let fieldOfView = Number(fov);

    if (!Number.isFinite(heading) || !Number.isFinite(fieldOfView)) {
      const krpano = getKrpano();
      if (krpano) {
        if (!Number.isFinite(heading)) {
          heading = Number(krpano.get?.("view.hlookat"));
        }
        if (!Number.isFinite(fieldOfView)) {
          fieldOfView = Number(krpano.get?.("view.fov"));
        }
      }
    }

    onViewChanged({
      sceneName: currentSceneName,
      hlookat: heading,
      fov: fieldOfView
    });
  };

  window.Suwon360Map = {
    init,
    setScenes,
    loadXmlAndDrawMarkers,
    updatePosition,
    updateMapPosition: updatePosition,
    updateFromScene,
    highlightCurrentScene,
    selectMenuScene,
    onViewChanged,
    forceRelayout,
    resetView,
    setKeepCenter,
    setKeepLevel,
    get keepCenter() {
      return state.keepCenter;
    },
    set keepCenter(value) {
      setKeepCenter(value);
    },
    get keepLevel() {
      return state.keepLevel;
    },
    set keepLevel(value) {
      setKeepLevel(value);
    },
    getCurrentXml: () => currentXmlFilename,
    getCurrentScene: () => currentSceneName,
    getSceneCoords: () => [...sceneCoords],
    getLastView: () => ({ ...lastView })
  };

  function initWhenReady(retry = 0) {
    if (getMapElement()) {
      init();
      return;
    }

    if (retry < 50) {
      window.setTimeout(() => initWhenReady(retry + 1), 100);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initWhenReady());
  } else {
    initWhenReady();
  }
  window.addEventListener("resize", () => {
    window.setTimeout(() => {
      syncResponsiveMapHost();
      forceRelayout();
    }, 120);
  });

  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => {
      syncResponsiveMapHost();
      forceRelayout();
    }, 250);
  });
})();
