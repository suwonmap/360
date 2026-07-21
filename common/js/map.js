(() => {
  "use strict";

  /**
   * Suwon360 Kakao minimap module
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
        height: 30px;
        min-width: 76px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
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
    const desktop = isDesktopMapMode();

    if (desktop) {
      wrapper.hidden = false;
      if (mapElement.parentNode !== wrapper) wrapper.appendChild(mapElement);
    } else {
      wrapper.hidden = true;
      restoreMapToMobilePane(mapElement);
    }

    window.setTimeout(() => {
      if (typeof forceRelayout === "function") forceRelayout();
    }, 40);
  }

  function initializeDesktopMapResize(wrapper) {
    const handle = wrapper.querySelector(".suwon360-map-resize-handle");
    if (!handle || handle.dataset.bound === "true") return;
    handle.dataset.bound = "true";

    const stopResize = () => {
      if (!desktopResizeState) return;
      desktopResizeState = null;
      document.body.style.userSelect = "";
      forceRelayout();
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
      forceRelayout();
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
      item.overlay?.setMap(null);
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

  function createNumberMarkerElement(number, sceneName, sceneTitle) {
    const root = document.createElement("div");
    root.className = "suwon360-map-marker";
    root.dataset.scene = sceneName;
    root.title = sceneTitle;
    root.setAttribute("role", "button");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", `${number}. ${sceneTitle}`);

    const circle = document.createElement("div");
    circle.className = "suwon360-map-marker-circle";
    circle.textContent = String(number).padStart(2, "0");
    root.appendChild(circle);

    return root;
  }

  function applyMarkerStyle(element, selected) {
    const circle = element?.querySelector(".suwon360-map-marker-circle");
    if (!circle) return;

    element.classList.toggle("is-active", Boolean(selected));

    Object.assign(circle.style, {
      width: selected ? "28px" : "22px",
      height: selected ? "28px" : "22px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      background: selected ? "#ff3d00" : "#2f8cff",
      color: "#ffffff",
      border: "2px solid #ffffff",
      boxShadow: "0 2px 7px rgba(0,0,0,.42)",
      fontSize: selected ? "11px" : "10px",
      fontWeight: "800",
      lineHeight: "1",
      cursor: "pointer",
      userSelect: "none",
      transition: "all .16s ease"
    });
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
    if (!map || !infoWindow || !item?.overlay || !canShowInfoWindow()) return;

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
    const { element } = item;

    const activate = () => {
      loadScene(item.name);
      if (state.showInfoWindowOnClick) openInfoWindow(item);
    };

    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    });

    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });

    if (state.showInfoWindowOnHover) {
      element.addEventListener("mouseenter", () => openInfoWindow(item));
      element.addEventListener("mouseleave", closeInfoWindow);
      element.addEventListener("focus", () => openInfoWindow(item));
      element.addEventListener("blur", closeInfoWindow);
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
      const element = createNumberMarkerElement(number, scene.name, scene.title);
      applyMarkerStyle(element, scene.name === resolveMenuSceneName(currentSceneName));

      const overlay = new window.kakao.maps.CustomOverlay({
        map,
        position,
        content: element,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: scene.name === currentSceneName ? 15 : 10
      });

      const item = {
        ...scene,
        number,
        element,
        overlay
      };

      bindMarkerEvents(item);
      sceneMarkers.push(item);
      bounds.extend(position);
    });

    if (!preservedCenter && sceneMarkers.length > 1) {
      map.setBounds(bounds, 35, 35, 35, 35);
    }

    if (preservedCenter && state.keepCenter) map.setCenter(preservedCenter);
    if (preservedLevel !== null && state.keepLevel) map.setLevel(preservedLevel);
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
      applyMarkerStyle(item.element, selected);
      item.overlay.setZIndex(selected ? 15 : 10);
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

    if (Number.isFinite(heading)) lastView.hlookat = heading;
    if (Number.isFinite(fieldOfView)) lastView.fov = fieldOfView;

    const direction = indoorOverlayElement?.querySelector("#rvDirection");
    const cone = indoorOverlayElement?.querySelector("#fovCone");
    if (!direction) return;

    direction.style.transform = `translate(-50%, -50%) rotate(${lastView.hlookat}deg)`;

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

  function forceRelayout() {
    if (!map || !window.kakao?.maps?.event) return;

    preserveViewState();
    window.kakao.maps.event.trigger(map, "resize");

    window.setTimeout(() => {
      if (!map) return;
      if (preservedCenter) map.setCenter(preservedCenter);
      if (preservedLevel !== null) map.setLevel(preservedLevel);
    }, 30);
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

      forceRelayout();
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
    onViewChanged({ hlookat, fov });
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
