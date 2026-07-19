(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const contents = sanitizePathPart(params.get("contents") || "suwon_tour");
  const tour = sanitizePathPart(params.get("tour") || "namsuheon");

  const config = {
    contents,
    tour,
    xmlPath: `${contents}/${tour}.xml`,
    panoTarget: "pano"
  };

  window.Suwon360 = {
    config,
    krpano: null,
    scenes: [],
    currentScene: "",
    ready: false
  };

  function sanitizePathPart(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById("status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", isError);
    status.hidden = !message;
  }

  function setBusy(isBusy) {
    const app = document.getElementById("app");
    if (app) app.setAttribute("aria-busy", String(Boolean(isBusy)));
  }

  function setTitle(title, shootingDate = "") {
    const titleEl = document.getElementById("content-title");
    const dateEl = document.getElementById("shooting-date");

    if (titleEl) titleEl.textContent = title || config.tour;
    if (dateEl) {
      dateEl.textContent = shootingDate ? `촬영일 : ${shootingDate}` : "";
      dateEl.hidden = !shootingDate;
    }
    document.title = title ? `수원360° │ ${title}` : "수원360°";
  }

  async function shareCurrentLink() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("링크를 복사했습니다.");
        window.setTimeout(() => setStatus(""), 1600);
      }
    } catch (error) {
      if (error && error.name !== "AbortError") {
        setStatus("링크 공유에 실패했습니다.", true);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("share-btn")?.addEventListener("click", shareCurrentLink);
    setTitle(config.tour);
    setStatus("파노라마를 불러오는 중…");
    setBusy(true);

    if (typeof window.Suwon360Panorama?.init === "function") {
      window.Suwon360Panorama.init();
    } else {
      setStatus("panorama.js를 불러오지 못했습니다.", true);
    }
  });

  window.Suwon360App = {
    setStatus,
    setBusy,
    setTitle
  };
})();
