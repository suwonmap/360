(() => {
  "use strict";

  let sceneWatcher = null;

  function init() {
    const state = window.Suwon360;
    const app = window.Suwon360App;

    if (!state || !app) return;

    if (typeof window.embedpano !== "function") {
      app.setStatus("common/krpano/tour.js를 찾을 수 없습니다.", true);
      return;
    }

    window.embedpano({
      xml: state.config.xmlPath,
      target: state.config.panoTarget,
      html5: "only",
      mobilescale: 1.0,
      consolelog: false,
      debugmode: false,
      showerrors: false,
      passQueryParameters: true,
      onready: onReady,
      onerror: () => {
        app.setStatus(`파노라마를 불러오지 못했습니다: ${state.config.xmlPath}`, true);
      }
    });
  }

  function onReady(krpano) {
    const state = window.Suwon360;
    const app = window.Suwon360App;

    state.krpano = krpano;
    state.ready = true;

    hideKrpanoConsole(krpano);
    hideDefaultSkin(krpano);
    readScenes(krpano);

    const title = get(krpano, "xml.scene") || state.config.tour;
    app.setTitle(title);
    app.setStatus("");
    app.setBusy(false);

    window.Suwon360Menu?.render?.(state.scenes);
    watchScene(krpano);
  }

  function hideKrpanoConsole(krpano) {
    try {
      krpano.set("debugmode", false);
      krpano.set("showerrors", false);
      krpano.call("showlog(false);");
    } catch (error) {
      console.warn("krpano 콘솔 숨김 처리 경고:", error);
    }
  }

  function hideDefaultSkin(krpano) {
    const layerNames = [
      "skin_control_bar",
      "skin_layer",
      "skin_scroll_layer",
      "skin_map",
      "skin_thumbs",
      "skin_title"
    ];

    layerNames.forEach((name) => {
      try {
        if (krpano.get(`layer[${name}]`)) {
          krpano.set(`layer[${name}].visible`, false);
          krpano.set(`layer[${name}].height`, 0);
          krpano.set(`layer[${name}].alpha`, 0);
        }
      } catch {
        // 해당 레이어가 없는 경우 무시
      }
    });
  }

  function readScenes(krpano) {
    const scenes = [];
    const count = Number(get(krpano, "scene.count") || 0);

    for (let index = 0; index < count; index += 1) {
      const name = get(krpano, `scene[${index}].name`);
      const title = get(krpano, `scene[${index}].title`) || name;

      if (name) {
        scenes.push({ name, title });
      }
    }

    window.Suwon360.scenes = scenes;
  }

  function watchScene(krpano) {
    if (sceneWatcher) {
      window.clearInterval(sceneWatcher);
    }

    let previousScene = "";

    sceneWatcher = window.setInterval(() => {
      const currentScene = get(krpano, "xml.scene") || "";
      if (!currentScene || currentScene === previousScene) return;

      previousScene = currentScene;
      window.Suwon360.currentScene = currentScene;

      window.Suwon360Menu?.select?.(currentScene);
      window.Suwon360Map?.updateFromScene?.(currentScene);
    }, 250);
  }

  function loadScene(sceneName) {
    const krpano = window.Suwon360?.krpano;
    if (!krpano || !sceneName) return;

    const escaped = String(sceneName).replace(/'/g, "\\'");
    krpano.call(`loadscene('${escaped}', null, MERGE, BLEND(0.5));`);
  }

  function get(krpano, path) {
    try {
      return krpano.get(path);
    } catch {
      return null;
    }
  }

  /* 기존 XML 호환 함수 */
  window.js_suwon360_on_view_changed = function () {
    const krpano = window.Suwon360?.krpano;
    if (!krpano) return;

    const sceneName = get(krpano, "xml.scene") || "";
    const hlookat = Number(get(krpano, "view.hlookat") || 0);
    const vlookat = Number(get(krpano, "view.vlookat") || 0);
    const fov = Number(get(krpano, "view.fov") || 0);

    window.Suwon360Map?.onViewChanged?.({
      sceneName,
      hlookat,
      vlookat,
      fov
    });
  };

  window.js_force_minimap_relayout = function () {
    window.Suwon360Map?.forceRelayout?.();
  };

  window.js_update_minimap_position = function (lat, lng, sceneName) {
    window.Suwon360Map?.updatePosition?.(lat, lng, sceneName);
  };

  window.updateMapPosition = function (lat, lng, sceneName) {
    window.Suwon360Map?.updatePosition?.(lat, lng, sceneName);
  };

  window.Suwon360Panorama = {
    init,
    loadScene,
    hideKrpanoConsole,
    hideDefaultSkin
  };
})();
