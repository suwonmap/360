(() => {
  "use strict";

  const DESKTOP_VISIBLE_LIMIT = 12;
  const MOBILE_LAYOUT = Object.freeze({
    SPLIT: "split",
    MENU: "menu",
    MAP: "map",
    HIDDEN: "hidden"
  });

  let menuScenes = [];
  let activeMenuScene = "";
  let lastVisibleLayout = MOBILE_LAYOUT.SPLIT;

  function makeButton(scene, index, className) {
    const button = document.createElement("button");
    const numberText = String(index + 1).padStart(2, "0");

    button.type = "button";
    button.className = className;
    button.dataset.scene = scene.name;
    button.dataset.menuIndex = String(index + 1);
    button.title = scene.title;

    if (className === "mobile-menu-item") {
      const number = document.createElement("span");
      number.className = "mobile-menu-number";
      number.textContent = numberText;

      const title = document.createElement("span");
      title.className = "mobile-menu-title";
      title.textContent = scene.title;

      button.append(number, title);
    } else {
      button.textContent = `${numberText} ${scene.title}`;
    }

    button.addEventListener("click", () => {
      select(scene.name);
      closeOverflow();
      window.Suwon360Map?.selectMenuScene?.(scene.name);
      window.Suwon360Panorama?.loadScene?.(scene.name);
      // 모바일 메뉴 선택 시 현재 레이아웃을 유지합니다.
      requestMapRelayout(80);
    });

    return button;
  }

  function render(scenes = []) {
    menuScenes = Array.isArray(scenes)
      ? scenes.filter((scene) => scene && scene.menuShow === true)
      : [];

    renderDesktop();
    renderMobile();
    bindControls();

    if (window.Suwon360?.currentScene) {
      select(window.Suwon360.currentScene, false);
    }
  }

  function renderDesktop() {
    const track = document.getElementById("menu-track");
    const overflow = document.getElementById("menu-overflow");
    const more = document.getElementById("menu-more-toggle");
    if (!track || !overflow || !more) return;

    track.innerHTML = "";
    overflow.innerHTML = "";

    menuScenes.slice(0, DESKTOP_VISIBLE_LIMIT).forEach((scene, index) => {
      track.appendChild(makeButton(scene, index, "menu-chip"));
    });

    menuScenes.slice(DESKTOP_VISIBLE_LIMIT).forEach((scene, offset) => {
      overflow.appendChild(
        makeButton(scene, DESKTOP_VISIBLE_LIMIT + offset, "menu-chip")
      );
    });

    const hasOverflow = menuScenes.length > DESKTOP_VISIBLE_LIMIT;
    more.hidden = !hasOverflow;
    if (!hasOverflow) closeOverflow();
  }

  function renderMobile() {
    const container = document.getElementById("mobile-menu-list");
    if (!container) return;
    container.innerHTML = "";

    menuScenes.forEach((scene, index) => {
      container.appendChild(makeButton(scene, index, "mobile-menu-item"));
    });
  }

  function resolve(sceneName) {
    const resolved = window.Suwon360?.resolveMenuScene?.(sceneName);
    if (resolved) return resolved;
    if (menuScenes.some((scene) => scene.name === sceneName)) return sceneName;
    return activeMenuScene || menuScenes[0]?.name || "";
  }

  function scrollToButton(button) {
    if (!button || button.parentElement?.id !== "mobile-menu-list") return;
    const container = button.parentElement;
    const top = button.offsetTop - (container.clientHeight - button.offsetHeight) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  function select(sceneName, scroll = true) {
    const resolvedName = resolve(sceneName);
    if (!resolvedName) return "";

    activeMenuScene = resolvedName;
    if (window.Suwon360) window.Suwon360.activeMenuScene = resolvedName;

    document.querySelectorAll(
      "#menu-track [data-scene], #menu-overflow [data-scene], #mobile-menu-list [data-scene]"
    ).forEach((button) => {
      const active = button.dataset.scene === resolvedName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");
      if (active && scroll) scrollToButton(button);
    });

    return resolvedName;
  }

  function closeOverflow() {
    const overflow = document.getElementById("menu-overflow");
    const more = document.getElementById("menu-more-toggle");
    if (overflow) overflow.hidden = true;
    if (more) more.setAttribute("aria-expanded", "false");
  }

  function toggleOverflow() {
    const overflow = document.getElementById("menu-overflow");
    const more = document.getElementById("menu-more-toggle");
    if (!overflow || !more) return;
    const willOpen = overflow.hidden;
    overflow.hidden = !willOpen;
    more.setAttribute("aria-expanded", String(willOpen));
  }

  function getLayout() {
    const app = document.getElementById("app");
    const value = app?.dataset.mobileLayout;
    return Object.values(MOBILE_LAYOUT).includes(value) ? value : MOBILE_LAYOUT.SPLIT;
  }

  function requestMapRelayout(delay = 180) {
    window.setTimeout(() => {
      window.Suwon360Map?.forceRelayout?.();
      window.js_force_minimap_relayout?.();
    }, delay);
  }

  function updatePanelToggle(hidden) {
    const panelToggle = document.getElementById("panel-toggle");
    if (!panelToggle) return;

    panelToggle.classList.toggle("is-restore", hidden);
    panelToggle.setAttribute("aria-expanded", String(!hidden));
    panelToggle.setAttribute(
      "aria-label",
      hidden ? "메뉴와 지도 전체 보기" : "메뉴와 지도 전체 숨김"
    );
    panelToggle.title = hidden ? "메뉴·지도 보기" : "숨기기";

    const arrow = panelToggle.querySelector(".panel-toggle-arrow");
    const label = panelToggle.querySelector(".panel-toggle-label");

    if (arrow) arrow.textContent = hidden ? "⌃" : "⌄";
    if (label) label.textContent = hidden ? "메뉴·지도 보기" : "숨기기";
  }

  function updateMobilePills(layout) {
    const menuPill = document.getElementById("mobile-menu-pill");
    const mapPill = document.getElementById("mobile-map-pill");

    const menuHidden = layout === MOBILE_LAYOUT.MAP;
    const mapHidden = layout === MOBILE_LAYOUT.MENU;
    const allHidden = layout === MOBILE_LAYOUT.HIDDEN;

    if (menuPill) {
      menuPill.setAttribute("aria-pressed", String(menuHidden));
      menuPill.setAttribute(
        "aria-label",
        menuHidden ? "메뉴 나타내기" : "메뉴 감추기"
      );
      menuPill.title = menuHidden ? "메뉴 나타내기" : "메뉴 감추기";
      menuPill.disabled = allHidden;
    }

    if (mapPill) {
      mapPill.setAttribute("aria-pressed", String(mapHidden));
      mapPill.setAttribute(
        "aria-label",
        mapHidden ? "미니맵 나타내기" : "미니맵 감추기"
      );
      mapPill.title = mapHidden ? "미니맵 나타내기" : "미니맵 감추기";
      mapPill.disabled = allHidden;
    }
  }

  function applyLayout(nextLayout) {
    const app = document.getElementById("app");
    if (!app || !Object.values(MOBILE_LAYOUT).includes(nextLayout)) return;

    if (nextLayout !== MOBILE_LAYOUT.HIDDEN) {
      lastVisibleLayout = nextLayout;
    }

    app.dataset.mobileLayout = nextLayout;
    const hidden = nextLayout === MOBILE_LAYOUT.HIDDEN;
    updatePanelToggle(hidden);
    updateMobilePills(nextLayout);
    requestMapRelayout(hidden ? 240 : 80);
  }

  function syncBrandContentTitle() {
    const source = document.getElementById("content-title");
    const target = document.getElementById("brand-content-title");
    if (!source || !target) return;

    const title = (source.textContent || "").trim();
    target.textContent =
      title && title !== "불러오는 중…" ? title : "";
  }

  function bindBrandTitleSync() {
    const source = document.getElementById("content-title");
    if (!source || source.dataset.brandTitleBound === "true") {
      syncBrandContentTitle();
      return;
    }

    source.dataset.brandTitleBound = "true";
    syncBrandContentTitle();

    const observer = new MutationObserver(syncBrandContentTitle);
    observer.observe(source, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function bindControls() {
    bindBrandTitleSync();

    if (document.body.dataset.menuBound === "true") return;
    document.body.dataset.menuBound = "true";

    const explorer = document.getElementById("desktop-explorer");
    const allToggle = document.getElementById("menu-all-toggle");

    document.getElementById("menu-more-toggle")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOverflow();
    });

    allToggle?.addEventListener("click", () => {
      const collapsed = explorer?.classList.toggle("menu-collapsed") || false;
      const label = collapsed ? "메뉴 펼치기" : "메뉴 접기";
      allToggle.textContent = "☰";
      allToggle.title = label;
      allToggle.setAttribute("aria-pressed", String(collapsed));
      allToggle.setAttribute("aria-label", label);
      closeOverflow();
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#desktop-explorer")) closeOverflow();
    });

    document.getElementById("panel-toggle")?.addEventListener("click", () => {
      applyLayout(
        getLayout() === MOBILE_LAYOUT.HIDDEN
          ? lastVisibleLayout
          : MOBILE_LAYOUT.HIDDEN
      );
    });

    document.getElementById("mobile-menu-pill")?.addEventListener("click", () => {
      const layout = getLayout();

      if (layout === MOBILE_LAYOUT.HIDDEN) return;

      applyLayout(
        layout === MOBILE_LAYOUT.MAP
          ? MOBILE_LAYOUT.SPLIT
          : MOBILE_LAYOUT.MAP
      );
    });

    document.getElementById("mobile-map-pill")?.addEventListener("click", () => {
      const layout = getLayout();

      if (layout === MOBILE_LAYOUT.HIDDEN) return;

      applyLayout(
        layout === MOBILE_LAYOUT.MENU
          ? MOBILE_LAYOUT.SPLIT
          : MOBILE_LAYOUT.MENU
      );
    });

    window.addEventListener("orientationchange", () => {
      updatePanelToggle(getLayout() === MOBILE_LAYOUT.HIDDEN);
      requestMapRelayout(280);
    }, { passive: true });
    window.addEventListener("resize", () => {
      updatePanelToggle(getLayout() === MOBILE_LAYOUT.HIDDEN);
      requestMapRelayout(120);
    }, { passive: true });

    const initialLayout = getLayout();
    updatePanelToggle(initialLayout === MOBILE_LAYOUT.HIDDEN);
    updateMobilePills(initialLayout);
  }

  window.Suwon360MobileLayout = {
    apply: applyLayout,
    get: getLayout,
    split: () => applyLayout(MOBILE_LAYOUT.SPLIT),
    menu: () => applyLayout(MOBILE_LAYOUT.MENU),
    map: () => applyLayout(MOBILE_LAYOUT.MAP),
    hide: () => applyLayout(MOBILE_LAYOUT.HIDDEN)
  };

  window.Suwon360Menu = {
    render,
    select,
    resolve,
    getActiveScene: () => activeMenuScene,
    getScenes: () => menuScenes.slice()
  };
})();
