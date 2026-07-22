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
      onready: onReady,
      onerror: () => app.setStatus(`파노라마를 불러오지 못했습니다: ${state.config.xmlPath}`, true)
    });
  }

  function onReady(krpano) {
    const state = window.Suwon360;
    const app = window.Suwon360App;

    state.krpano = krpano;
    window.krpano = krpano;
    state.ready = true;

    hideKrpanoConsole(krpano);
    hideDefaultSkin(krpano);
    readScenes(krpano);
    readMapConfig(krpano);
    syncHotspotSceneLabels(krpano);

    const title = String(get(krpano, "title") || state.config.tour);
    const shootingDate = String(get(krpano, "capturedate") || get(krpano, "shooting_date") || "");
    app.setTitle(title, shootingDate);
    app.setStatus("");
    app.setBusy(false);

    window.Suwon360Menu?.render?.(state.menuScenes);
    window.Suwon360Map?.setScenes?.(state.scenes, state.menuScenes);
    const firstScene = String(get(krpano, "xml.scene") || state.scenes[0]?.name || "");
    if (firstScene) window.Suwon360Map?.updateFromScene?.(firstScene);
    window.Suwon360Map?.init?.();
    watchScene(krpano);
  }

  function truthy(value) {
    return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
  }

  function numberOrNaN(value) {
    // krpano 속성이 없을 때 null 또는 빈 문자열이 반환될 수 있습니다.
    // Number(null), Number("")는 0이 되므로 좌표가 (0, 0)으로 잘못 인식됩니다.
    // 값이 실제로 입력된 경우에만 숫자로 변환합니다.
    if (value === null || value === undefined || String(value).trim() === "") {
      return NaN;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function readScenes(krpano) {
    const state = window.Suwon360;
    const scenes = [];
    const count = Number(get(krpano, "scene.count") || 0);

    for (let index = 0; index < count; index += 1) {
      const base = `scene[${index}]`;
      const name = String(get(krpano, `${base}.name`) || "").trim();
      if (!name) continue;

      const title = String(get(krpano, `${base}.title`) || name).trim();
      const menuShow = truthy(get(krpano, `${base}.menu_show`));
      const menuParent = String(get(krpano, `${base}.menu_parent`) || "").trim();
      const lat = numberOrNaN(
        get(krpano, `${base}.lat`) ?? get(krpano, `${base}.latitude`) ?? get(krpano, `${base}.map_lat`)
      );
      const lng = numberOrNaN(
        get(krpano, `${base}.lng`) ?? get(krpano, `${base}.lon`) ??
        get(krpano, `${base}.longitude`) ?? get(krpano, `${base}.map_lng`)
      );
      const heading = numberOrNaN(
        get(krpano, `${base}.heading`) ?? get(krpano, `${base}.map_heading`)
      );

      scenes.push({ index, name, title, menuShow, menuParent, lat, lng, heading });
    }

    const menuScenes = scenes.filter((scene) => scene.menuShow);
    const menuNames = new Set(menuScenes.map((scene) => scene.name));
    const sceneMap = new Map(scenes.map((scene) => [scene.name, scene]));

    function resolveMenuScene(sceneName) {
      const scene = sceneMap.get(sceneName);
      if (!scene) return state.activeMenuScene || menuScenes[0]?.name || "";
      if (scene.menuShow) return scene.name;
      if (scene.menuParent && menuNames.has(scene.menuParent)) return scene.menuParent;

      // menu_parent가 없는 구형 XML은 XML 순서상 직전 메인씬을 부모로 사용합니다.
      let nearest = "";
      for (const menuScene of menuScenes) {
        if (menuScene.index <= scene.index) nearest = menuScene.name;
        else break;
      }
      return nearest || state.activeMenuScene || menuScenes[0]?.name || "";
    }

    state.scenes = scenes;
    state.menuScenes = menuScenes;
    state.resolveMenuScene = resolveMenuScene;
    state.mainSceneNames = menuScenes.map((scene) => scene.name);
  }

  function readMapConfig(krpano) {
    const state = window.Suwon360;
    const config = {
      mode: String(get(krpano, "mapmode") || get(krpano, "map_mode") || "auto"),
      lat: numberOrNaN(get(krpano, "maplat") ?? get(krpano, "map_lat")),
      lng: numberOrNaN(get(krpano, "maplng") ?? get(krpano, "map_lng")),
      level: numberOrNaN(get(krpano, "maplevel") ?? get(krpano, "map_level"))
    };
    state.mapConfig = config;
    window.Suwon360Map?.setConfig?.(config);
  }


  // v215: 이동 화살표 위에 연결 대상 씬명을 알약형으로 표시합니다.
  function syncHotspotSceneLabels(krpano) {
    if (!krpano) return;

    // 이전 씬에서 생성했던 라벨이 남아 있으면 먼저 정리합니다.
    const previousCount = Number(get(krpano, "hotspot.count") || 0);
    const oldLabels = [];
    for (let index = 0; index < previousCount; index += 1) {
      const name = String(get(krpano, `hotspot[${index}].name`) || "");
      if (name.startsWith("s360_scene_label_")) oldLabels.push(name);
    }
    oldLabels.forEach((name) => {
      try { krpano.call(`removehotspot('${escapeKrpanoString(name)}');`); } catch { /* 무시 */ }
    });

    const sceneTitles = new Map(
      (window.Suwon360?.scenes || []).map((scene) => [scene.name, scene.title || scene.name])
    );

    const hotspotCount = Number(get(krpano, "hotspot.count") || 0);
    const sourceHotspots = [];

    for (let index = 0; index < hotspotCount; index += 1) {
      const base = `hotspot[${index}]`;
      const name = String(get(krpano, `${base}.name`) || "");
      const linkedScene = String(get(krpano, `${base}.linkedscene`) || "").trim();
      if (!name || !linkedScene || name.startsWith("s360_scene_label_")) continue;

      const ath = Number(get(krpano, `${base}.ath`));
      const atv = Number(get(krpano, `${base}.atv`));
      if (!Number.isFinite(ath) || !Number.isFinite(atv)) continue;

      sourceHotspots.push({ name, linkedScene, ath, atv });
    }

    sourceHotspots.forEach((spot, index) => {
      const title = String(sceneTitles.get(spot.linkedScene) || spot.linkedScene).trim();
      if (!title) return;

      const labelName = `s360_scene_label_${index}`;
      try {
        krpano.call(`addhotspot('${labelName}');`);
        krpano.set(`hotspot[${labelName}].type`, "text");
        krpano.set(`hotspot[${labelName}].ath`, spot.ath);
        krpano.set(`hotspot[${labelName}].atv`, spot.atv - 8);
        krpano.set(`hotspot[${labelName}].html`, escapeHtml(title));
        krpano.set(`hotspot[${labelName}].css`, "font-family:Arial,'Noto Sans KR',sans-serif;font-size:13px;font-weight:700;color:#FFFFFF;white-space:nowrap;text-align:center;max-width:180px;overflow:hidden;text-overflow:ellipsis;");
        krpano.set(`hotspot[${labelName}].bg`, true);
        krpano.set(`hotspot[${labelName}].bgcolor`, "0x111827");
        krpano.set(`hotspot[${labelName}].bgalpha`, 0.82);
        krpano.set(`hotspot[${labelName}].bgborder`, "1 0xFFFFFF 0.24");
        krpano.set(`hotspot[${labelName}].bgroundedge`, 18);
        krpano.set(`hotspot[${labelName}].padding`, "7 12");
        krpano.set(`hotspot[${labelName}].enabled`, false);
        krpano.set(`hotspot[${labelName}].capture`, false);
        krpano.set(`hotspot[${labelName}].handcursor`, false);
        krpano.set(`hotspot[${labelName}].renderer`, "webgl");
        krpano.set(`hotspot[${labelName}].mipmapping`, true);
        krpano.set(`hotspot[${labelName}].oversampling`, 2);
        krpano.set(`hotspot[${labelName}].alpha`, 0);
        krpano.set(`hotspot[${labelName}].zorder`, 20);
        krpano.set(`hotspot[${labelName}].keep`, false);
        krpano.call(`tween(hotspot[${labelName}].alpha,1.0,0.25);`);
      } catch (error) {
        console.warn("씬명 알약 생성 경고:", spot.name, error);
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeKrpanoString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function watchScene(krpano) {
    if (sceneWatcher) clearInterval(sceneWatcher);

    let previousScene = "";
    let previousHlookat = NaN;
    let previousFov = NaN;

    sceneWatcher = setInterval(() => {
      const currentScene = String(get(krpano, "xml.scene") || "");
      const hlookat = Number(get(krpano, "view.hlookat"));
      const fov = Number(get(krpano, "view.fov"));

      if (currentScene && currentScene !== previousScene) {
        previousScene = currentScene;

        const state = window.Suwon360;
        state.currentScene = currentScene;
        state.activeMenuScene = state.resolveMenuScene?.(currentScene) || currentScene;

        window.Suwon360Menu?.select?.(currentScene);
        window.Suwon360Map?.updateFromScene?.(currentScene);
        window.setTimeout(() => syncHotspotSceneLabels(krpano), 120);
      }

      // v125: 일부 모바일 환경에서 krpano onviewchange 이벤트가
      // 누락되더라도 남수헌 방향 마커가 시선을 계속 따라가도록 보정합니다.
      const headingChanged =
        Number.isFinite(hlookat) &&
        (!Number.isFinite(previousHlookat) ||
         Math.abs(hlookat - previousHlookat) >= 0.15);

      const fovChanged =
        Number.isFinite(fov) &&
        (!Number.isFinite(previousFov) ||
         Math.abs(fov - previousFov) >= 0.15);

      if (headingChanged || fovChanged) {
        previousHlookat = hlookat;
        previousFov = fov;

        window.Suwon360Map?.onViewChanged?.({
          sceneName: currentScene,
          hlookat,
          fov
        });
      }
    }, 60);
  }

  function loadScene(sceneName) {
    const krpano = window.Suwon360?.krpano;
    if (!krpano || !sceneName) return;
    const escaped = String(sceneName).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    krpano.call(`loadscene('${escaped}', null, MERGE, BLEND(0.5));`);
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
    ["skin_control_bar", "skin_layer", "skin_scroll_layer", "skin_scroll_window",
      "skin_splitter_bottom", "skin_btn_show", "skin_map", "skin_thumbs", "skin_title"]
      .forEach((name) => {
        try {
          if (krpano.get(`layer[${name}]`)) {
            krpano.set(`layer[${name}].visible`, false);
            krpano.set(`layer[${name}].enabled`, false);
            krpano.set(`layer[${name}].height`, 0);
            krpano.set(`layer[${name}].alpha`, 0);
          }
        } catch { /* 없는 레이어는 무시 */ }
      });
  }

  function get(krpano, path) {
    try { return krpano.get(path); } catch { return null; }
  }

  window.js_initialize_suwon360 = function () {
    if (!window.Suwon360?.ready) return;
    window.Suwon360Map?.setScenes?.(window.Suwon360.scenes, window.Suwon360.menuScenes);
    window.Suwon360Map?.setConfig?.(window.Suwon360.mapConfig || {});
    window.Suwon360Map?.init?.();
  };

  window.js_suwon360_on_scene_changed = function () {
    const krpano = window.Suwon360?.krpano;
    const sceneName = krpano ? String(get(krpano, "xml.scene") || "") : "";
    if (!sceneName) return;
    window.Suwon360Menu?.select?.(sceneName);
    window.Suwon360Map?.updateFromScene?.(sceneName);
    window.setTimeout(() => syncHotspotSceneLabels(krpano), 120);
  };

  window.js_suwon360_on_view_changed = function () {
    const krpano = window.Suwon360?.krpano;
    if (!krpano) return;
    window.Suwon360Map?.onViewChanged?.({
      sceneName: String(get(krpano, "xml.scene") || ""),
      hlookat: Number(get(krpano, "view.hlookat") || 0),
      vlookat: Number(get(krpano, "view.vlookat") || 0),
      fov: Number(get(krpano, "view.fov") || 0)
    });
  };

  window.js_force_minimap_relayout = () => window.Suwon360Map?.forceRelayout?.();
  window.js_update_minimap_position = (lat, lng, sceneName, hlookat, fov) =>
    window.Suwon360Map?.updatePosition?.(lat, lng, sceneName, hlookat, fov);
  window.updateMapPosition = window.js_update_minimap_position;

  window.Suwon360Panorama = { init, loadScene, hideKrpanoConsole, hideDefaultSkin };
})();
