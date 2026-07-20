(() => {
  "use strict";

  const DESKTOP_VISIBLE_LIMIT = 12;
  let menuScenes = [];
  let activeMenuScene = "";

  function makeButton(scene, index, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.scene = scene.name;
    button.dataset.menuIndex = String(index + 1);
    button.title = scene.title;
    button.textContent = `${String(index + 1).padStart(2, "0")} ${scene.title}`;

    button.addEventListener("click", () => {
      select(scene.name);
      closeOverflow();
      window.Suwon360Map?.selectMenuScene?.(scene.name);
      window.Suwon360Panorama?.loadScene?.(scene.name);
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
      overflow.appendChild(makeButton(
        scene,
        DESKTOP_VISIBLE_LIMIT + offset,
        "menu-chip"
      ));
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
    if (!button) return;
    const container = button.parentElement;
    if (!container) return;

    if (container.id === "mobile-menu-list") {
      const top = button.offsetTop - (container.clientHeight - button.offsetHeight) / 2;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
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

  function bindControls() {
    if (document.body.dataset.menuBound === "true") return;
    document.body.dataset.menuBound = "true";

    const app = document.getElementById("app");
    const panelToggle = document.getElementById("panel-toggle");
    const explorer = document.getElementById("desktop-explorer");
    const allToggle = document.getElementById("menu-all-toggle");
    const menuToggle = document.getElementById("mobile-menu-close");
    const mapClose = document.getElementById("map-close");
    const mapRestore = document.getElementById("map-restore");

    let savedPaneState = {
      menuHidden: false,
      mapHidden: false
    };

    const isLandscape = () =>
      window.matchMedia("(max-width: 768px) and (orientation: landscape)").matches;

    const updateMobileControls = () => {
      if (!app) return;

      const menuHidden = app.classList.contains("menu-pane-hidden");
      const mapHidden = app.classList.contains("map-pane-hidden");
      const panelsHidden = app.classList.contains("panels-hidden");
      const landscape = isLandscape();

      if (menuToggle) {
        const text = landscape
          ? (menuHidden ? "▼" : "▲")
          : (menuHidden ? "›" : "‹");
        const label = menuHidden ? "메뉴 펼치기" : "메뉴 접기";
        menuToggle.textContent = text;
        menuToggle.setAttribute("aria-label", label);
        menuToggle.title = label;
      }

      if (mapClose) {
        const text = landscape
          ? (mapHidden ? "▲" : "▼")
          : (mapHidden ? "‹" : "›");
        const label = mapHidden ? "지도 펼치기" : "지도 접기";
        mapClose.textContent = text;
        mapClose.setAttribute("aria-label", label);
        mapClose.title = label;
      }

      if (mapRestore) {
        mapRestore.hidden = !(menuHidden || mapHidden);
        mapRestore.textContent = landscape ? "↕" : "‹";
        mapRestore.setAttribute("aria-label", "메뉴와 지도 같이 보기");
        mapRestore.title = "메뉴와 지도 같이 보기";
      }

      if (panelToggle) {
        const label = panelsHidden
          ? "메뉴와 미니맵 보기"
          : "메뉴와 미니맵 숨기기";
        panelToggle.setAttribute("aria-expanded", String(!panelsHidden));
        panelToggle.setAttribute("aria-label", label);
        panelToggle.title = label;
      }
    };

    const relayoutMap = (delay = 220) => {
      window.setTimeout(() => window.Suwon360Map?.forceRelayout?.(), delay);
    };

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

    panelToggle?.addEventListener("click", () => {
      if (!app) return;

      const willHide = !app.classList.contains("panels-hidden");
      if (willHide) {
        savedPaneState = {
          menuHidden: app.classList.contains("menu-pane-hidden"),
          mapHidden: app.classList.contains("map-pane-hidden")
        };
        app.classList.add("panels-hidden");
      } else {
        app.classList.remove("panels-hidden");
        app.classList.toggle("menu-pane-hidden", savedPaneState.menuHidden);
        app.classList.toggle("map-pane-hidden", savedPaneState.mapHidden);
      }

      updateMobileControls();
      relayoutMap();
    });

    menuToggle?.addEventListener("click", () => {
      if (!app) return;
      const hidden = app.classList.toggle("menu-pane-hidden");
      if (hidden) app.classList.remove("map-pane-hidden");
      updateMobileControls();
      relayoutMap(180);
    });

    mapClose?.addEventListener("click", () => {
      if (!app) return;
      const hidden = app.classList.toggle("map-pane-hidden");
      if (hidden) app.classList.remove("menu-pane-hidden");
      updateMobileControls();
      relayoutMap(180);
    });

    mapRestore?.addEventListener("click", () => {
      app?.classList.remove("menu-pane-hidden", "map-pane-hidden");
      updateMobileControls();
      relayoutMap(180);
    });

    const syncOnViewportChange = () => {
      updateMobileControls();
      relayoutMap(260);
    };

    window.addEventListener("resize", syncOnViewportChange);
    window.addEventListener("orientationchange", syncOnViewportChange);
    updateMobileControls();
  }

  window.Suwon360Menu = {
    render,
    select,
    resolve,
    getActiveScene: () => activeMenuScene,
    getScenes: () => menuScenes.slice()
  };
})();
