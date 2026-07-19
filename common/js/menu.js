(() => {
  "use strict";

  let menuScenes = [];
  let activeMenuScene = "";
  let hoverFrame = 0;
  let hoverDirection = 0;

  function render(scenes = []) {
    menuScenes = Array.isArray(scenes)
      ? scenes.filter((scene) => scene && scene.menuShow === true)
      : [];

    renderInto("menu-track", "menu-chip");
    renderInto("mobile-menu-list", "mobile-menu-item");
    bindControls();

    if (window.Suwon360?.currentScene) {
      select(window.Suwon360.currentScene, false);
    }
  }

  function renderInto(containerId, className) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    menuScenes.forEach((scene, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.dataset.scene = scene.name;
      button.dataset.menuIndex = String(index + 1);
      button.textContent = `${String(index + 1).padStart(2, "0")} ${scene.title}`;

      button.addEventListener("click", () => {
        select(scene.name);
        window.Suwon360Map?.selectMenuScene?.(scene.name);
        window.Suwon360Panorama?.loadScene?.(scene.name);
      });

      container.appendChild(button);
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

    if (container.id === "menu-track") {
      const left = button.offsetLeft - (container.clientWidth - button.offsetWidth) / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    } else {
      const top = button.offsetTop - (container.clientHeight - button.offsetHeight) / 2;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }

  function select(sceneName, scroll = true) {
    const resolvedName = resolve(sceneName);
    if (!resolvedName) return "";

    activeMenuScene = resolvedName;
    if (window.Suwon360) window.Suwon360.activeMenuScene = resolvedName;

    document.querySelectorAll("#menu-track [data-scene], #mobile-menu-list [data-scene]")
      .forEach((button) => {
        const active = button.dataset.scene === resolvedName;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-current", active ? "true" : "false");
        if (active && scroll) scrollToButton(button);
      });

    return resolvedName;
  }

  function stopHoverScroll() {
    hoverDirection = 0;
    if (hoverFrame) cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
  }

  function runHoverScroll() {
    const track = document.getElementById("menu-track");
    if (!track || !hoverDirection) return stopHoverScroll();
    track.scrollLeft += hoverDirection * 5;
    hoverFrame = requestAnimationFrame(runHoverScroll);
  }

  function startHoverScroll(direction) {
    hoverDirection = direction;
    if (!hoverFrame) hoverFrame = requestAnimationFrame(runHoverScroll);
  }

  function bindScrollButton(button, direction) {
    if (!button || button.dataset.s360Bound === "true") return;
    button.dataset.s360Bound = "true";
    button.addEventListener("pointerenter", () => startHoverScroll(direction));
    button.addEventListener("pointerleave", stopHoverScroll);
    button.addEventListener("pointercancel", stopHoverScroll);
    button.addEventListener("blur", stopHoverScroll);
    button.addEventListener("click", () => {
      document.getElementById("menu-track")?.scrollBy({ left: direction * 240, behavior: "smooth" });
    });
  }

  function bindControls() {
    if (document.body.dataset.menuBound === "true") return;
    document.body.dataset.menuBound = "true";

    const app = document.getElementById("app");
    const panelToggle = document.getElementById("panel-toggle");

    bindScrollButton(document.getElementById("menu-prev"), -1);
    bindScrollButton(document.getElementById("menu-next"), 1);

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

    window.addEventListener("pointerup", stopHoverScroll, { passive: true });
    window.addEventListener("blur", stopHoverScroll);
  }

  window.Suwon360Menu = {
    render,
    select,
    resolve,
    getActiveScene: () => activeMenuScene,
    getScenes: () => menuScenes.slice()
  };
})();
