(() => {
  "use strict";
  const VISIBLE_LIMIT = 14;
  let menuScenes = [];
  let activeMenuScene = "";
  let controlsBound = false;

  function createMenuButton(scene, index, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.scene = scene.name;
    const number = document.createElement("span");
    number.className = "menu-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("span");
    title.className = "menu-title";
    title.textContent = scene.title || scene.name;
    button.append(number, title);
    button.addEventListener("click", () => {
      select(scene.name);
      window.Suwon360Map?.selectMenuScene?.(scene.name);
      window.Suwon360Panorama?.loadScene?.(scene.name);
      closeMoreMenu();
    });
    return button;
  }

  function render(scenes = []) {
    menuScenes = Array.isArray(scenes) ? scenes.filter(scene => scene && scene.menuShow === true) : [];
    renderDesktop();
    renderMobile();
    bindControls();
    if (window.Suwon360?.currentScene) select(window.Suwon360.currentScene, false);
  }

  function renderDesktop() {
    const track = document.getElementById("menu-track");
    const moreWrap = document.getElementById("menu-more-wrap");
    const moreList = document.getElementById("menu-more-list");
    if (!track || !moreWrap || !moreList) return;
    track.innerHTML = "";
    moreList.innerHTML = "";
    menuScenes.slice(0, VISIBLE_LIMIT).forEach((scene, index) => track.appendChild(createMenuButton(scene, index, "menu-chip")));
    const remaining = menuScenes.slice(VISIBLE_LIMIT);
    moreWrap.hidden = remaining.length === 0;
    remaining.forEach((scene, offset) => moreList.appendChild(createMenuButton(scene, VISIBLE_LIMIT + offset, "menu-chip")));
  }

  function renderMobile() {
    const container = document.getElementById("mobile-menu-list");
    if (!container) return;
    container.innerHTML = "";
    menuScenes.forEach((scene, index) => container.appendChild(createMenuButton(scene, index, "mobile-menu-item")));
  }

  function resolve(sceneName) {
    const resolved = window.Suwon360?.resolveMenuScene?.(sceneName);
    if (resolved) return resolved;
    if (menuScenes.some(scene => scene.name === sceneName)) return sceneName;
    return activeMenuScene || menuScenes[0]?.name || "";
  }

  function select(sceneName, scroll = true) {
    const resolvedName = resolve(sceneName);
    if (!resolvedName) return "";
    activeMenuScene = resolvedName;
    if (window.Suwon360) window.Suwon360.activeMenuScene = resolvedName;
    document.querySelectorAll("[data-scene]").forEach(button => {
      const active = button.dataset.scene === resolvedName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");
      if (active && scroll) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
    return resolvedName;
  }

  function closeMoreMenu() {
    const button = document.getElementById("menu-more");
    const list = document.getElementById("menu-more-list");
    if (!button || !list) return;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    const app = document.getElementById("app");
    const panel = document.getElementById("desktop-menu-panel");
    const toggle = document.getElementById("menu-toggle");
    const moreButton = document.getElementById("menu-more");
    const moreList = document.getElementById("menu-more-list");
    const panelToggle = document.getElementById("panel-toggle");

    // v96: ◫ 아이콘 메뉴 접기/펼치기 안내 자동 변경
    toggle?.addEventListener("click", () => {
      const collapsed = panel?.classList.toggle("is-collapsed") || false;
      const guide = collapsed ? "메뉴 펼치기" : "메뉴 접기";
      toggle.title = guide;
      toggle.setAttribute("aria-label", guide);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      closeMoreMenu();
    });

    moreButton?.addEventListener("click", event => {
      event.stopPropagation();
      const willOpen = Boolean(moreList?.hidden);
      if (moreList) moreList.hidden = !willOpen;
      moreButton.setAttribute("aria-expanded", String(willOpen));
    });
    document.addEventListener("click", event => {
      if (!event.target.closest("#menu-more-wrap")) closeMoreMenu();
    });
    panelToggle?.addEventListener("click", () => {
      const hidden = app?.classList.toggle("panels-hidden") || false;
      panelToggle.textContent = hidden ? "전체 보기" : "전체 숨김";
      panelToggle.setAttribute("aria-expanded", String(!hidden));
    });
    document.getElementById("mobile-menu-close")?.addEventListener("click", () => app?.classList.add("menu-pane-hidden"));
    document.getElementById("map-close")?.addEventListener("click", () => app?.classList.add("map-pane-hidden"));
    document.getElementById("map-restore")?.addEventListener("click", () => app?.classList.remove("menu-pane-hidden", "map-pane-hidden"));
  }

  window.Suwon360Menu = { render, select };
})();
