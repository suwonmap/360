(() => {
  "use strict";

  function init() {
    const state = window.Suwon360;
    const app = window.Suwon360App;

    if (!state || !app) return;

    if (typeof window.embedpano !== "function") {
      app.setStatus("krpano 로더(common/krpano/tour.js)를 찾을 수 없습니다.", true);
      return;
    }

    window.embedpano({
      xml: state.config.xmlPath,
      target: state.config.panoTarget,
      html5: "only",
      mobilescale: 1.0,
      consolelog: true,
      debugmode: false,
      passQueryParameters: true,
      onready: onKrpanoReady,
      onerror: (error) => {
        console.error("krpano embed error:", error);
        app.setStatus(`파노라마를 불러오지 못했습니다: ${state.config.xmlPath}`, true);
      }
    });
  }

  function onKrpanoReady(krpano) {
    const state = window.Suwon360;
    const app = window.Suwon360App;

    state.krpano = krpano;
    state.ready = true;

    hideDefaultSkin(krpano);
    readScenes(krpano);

    const title = safeGet(krpano, "xml.scene") || state.config.tour;
    app.setTitle(title);
    app.setStatus("");
    app.setBusy(false);

    if (typeof window.Suwon360Menu?.render === "function") {
      window.Suwon360Menu.render(state.scenes);
    }

    bindSceneWatcher(krpano);
  }

  function hideDefaultSkin(krpano) {
    const actions = [
      "set(layer[skin_control_bar].visible,false);",
      "set(layer[skin_control_bar].height,0);",
      "set(layer[skin_layer].visible,false);",
      "set(layer[skin_layer].height,0);"
    ];

    try {
      krpano.call(actions.join(""));
    } catch (error) {
      console.warn("기본 스킨 숨김 처리 중 경고:", error);
    }
  }

  function readScenes(krpano) {
    const scenes = [];
    const count = Number(safeGet(krpano, "scene.count") || 0);

    for (let i = 0; i < count; i += 1) {
      const name = safeGet(krpano, `scene[${i}].name`);
      const title = safeGet(krpano, `scene[${i}].title`) || name;
      if (name) scenes.push({ name, title });
    }

    window.Suwon360.scenes = scenes;
  }

  function bindSceneWatcher(krpano) {
    let previous = "";

    window.setInterval(() => {
      if (!window.Suwon360?.ready) return;

      const current = safeGet(krpano, "xml.scene") || "";
      if (!current || current === previous) return;

      previous = current;
      window.Suwon360.currentScene = current;

      window.Suwon360Menu?.select?.(current);
      window.Suwon360Map?.updateFromScene?.(current);
    }, 250);
  }

  function loadScene(sceneName) {
    const krpano = window.Suwon360?.krpano;
    if (!krpano || !sceneName) return;

    const escaped = String(sceneName).replace(/'/g, "\\'");
    krpano.call(`loadscene('${escaped}', null, MERGE, BLEND(0.5));`);
  }

  function safeGet(krpano, path) {
    try {
      return krpano.get(path);
    } catch {
      return null;
    }
  }

  window.Suwon360Panorama = {
    init,
    loadScene
  };
})();
