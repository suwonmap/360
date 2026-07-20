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

    document.getElementById("menu-more-toggle")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOverflow();
    });

    allToggle?.addEventListener("click", () => {
      const collapsed = explorer?.classList.toggle("menu-collapsed") || false;
      allToggle.setAttribute("aria-pressed", String(collapsed));
      allToggle.setAttribute("aria-label", collapsed ? "전체 메뉴 보기" : "전체 메뉴 숨기기");
      closeOverflow();
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#desktop-explorer")) closeOverflow();
    });

    panelToggle?.addEventListener("click", () => {
      const hidden = app?.classList.toggle("panels-hidden") || false;
      panelToggle.textContent = hidden ? "전체 보기" : "전체 숨김";
      panelToggle.setAttribute("aria-expanded", String(!hidden));
      setTimeout(() => window.Suwon360Map?.forceRelayout?.(), 220);
    });

    document.getElementById("mobile-menu-close")?.addEventListener("click", () => {
      app?.classList.add("menu-pane-hidden");
      app?.classList.remove("map-pane-hidden");
      setTimeout(() => window.Suwon360Map?.forceRelayout?.(), 180);
    });

    document.getElementById("map-close")?.addEventListener("click", () => {
      app?.classList.add("map-pane-hidden");
      app?.classList.remove("menu-pane-hidden");
    });

    document.getElementById("map-restore")?.addEventListener("click", () => {
      app?.classList.remove("menu-pane-hidden", "map-pane-hidden");
      setTimeout(() => window.Suwon360Map?.forceRelayout?.(), 180);
    });
  }

  window.Suwon360Menu = {
    render,
    select,
    resolve,
    getActiveScene: () => activeMenuScene,
    getScenes: () => menuScenes.slice()
  };
})();
