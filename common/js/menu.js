(() => {
  "use strict";

  function render(scenes = []) {
    renderInto("menu-track", scenes, "menu-chip");
    renderInto("mobile-menu-list", scenes, "mobile-menu-item");
    bindControls();
  }

  function renderInto(containerId, scenes, className) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    scenes.forEach((scene, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.dataset.scene = scene.name;
      button.textContent = `${String(index + 1).padStart(2, "0")} ${scene.title}`;

      button.addEventListener("click", () => {
        window.Suwon360Panorama?.loadScene?.(scene.name);
        select(scene.name);
      });

      container.appendChild(button);
    });
  }

  function select(sceneName) {
    document.querySelectorAll("[data-scene]").forEach((button) => {
      const active = button.dataset.scene === sceneName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");

      if (active) {
        button.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center"
        });
      }
    });
  }

  function bindControls() {
    if (document.body.dataset.menuBound === "true") return;
    document.body.dataset.menuBound = "true";

    const app = document.getElementById("app");
    const track = document.getElementById("menu-track");
    const panelToggle = document.getElementById("panel-toggle");

    document.getElementById("menu-prev")?.addEventListener("click", () => {
      track?.scrollBy({ left: -320, behavior: "smooth" });
    });

    document.getElementById("menu-next")?.addEventListener("click", () => {
      track?.scrollBy({ left: 320, behavior: "smooth" });
    });

    panelToggle?.addEventListener("click", () => {
      const hidden = app?.classList.toggle("panels-hidden") || false;
      panelToggle.textContent = hidden ? "전체 보기" : "전체 숨김";
      panelToggle.setAttribute("aria-expanded", String(!hidden));
    });

    document.getElementById("mobile-menu-close")?.addEventListener("click", () => {
      app?.classList.add("menu-pane-hidden");
    });

    document.getElementById("map-close")?.addEventListener("click", () => {
      app?.classList.add("map-pane-hidden");
    });

    document.getElementById("map-restore")?.addEventListener("click", () => {
      app?.classList.remove("menu-pane-hidden", "map-pane-hidden");
    });
  }

  window.Suwon360Menu = {
    render,
    select
  };
})();
