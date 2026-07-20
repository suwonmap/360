(() => {
  "use strict";
  const params = new URLSearchParams(window.location.search);
  const clean = (value, fallback) => String(value || fallback || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const contents = clean(params.get("contents"), "suwon_tour");
  const tour = clean(params.get("tour"), "namsuheon");

  window.Suwon360 = {
    config: { contents, tour, xmlPath: `${contents}/${tour}.xml`, panoTarget: "pano" },
    krpano: null, scenes: [], currentScene: "", ready: false
  };

  function setStatus(message, isError = false) {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", isError);
    el.hidden = !message;
  }

  function setBusy(value) {
    document.getElementById("app")?.setAttribute("aria-busy", String(Boolean(value)));
  }

  // v96: XML 제목 + 둘러보기
  function setTitle(title, shootingDate = "") {
    const finalTitle = String(title || window.Suwon360.config.tour).trim();
    const browseTitle = `${finalTitle} 둘러보기`;
    const titleEl = document.getElementById("content-title");
    const mobileTitleEl = document.getElementById("mobile-content-title");
    const dateEl = document.getElementById("shooting-date");
    if (titleEl) titleEl.textContent = browseTitle;
    if (mobileTitleEl) mobileTitleEl.textContent = browseTitle;
    if (dateEl) {
      dateEl.textContent = shootingDate ? `촬영일 : ${shootingDate}` : "";
      dateEl.hidden = !shootingDate;
    }
    document.title = `수원360°투어 │ ${finalTitle}`;
  }

  async function shareCurrentLink() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setStatus("링크를 복사했습니다.");
        window.setTimeout(() => setStatus(""), 1500);
      } else window.prompt("아래 링크를 복사하세요.", url);
    } catch (error) {
      if (error?.name !== "AbortError") setStatus("링크 공유에 실패했습니다.", true);
    }
  }

  // v96: 로고 클릭 시 쿼리 없는 초기화면
  function goHome() {
    const homeUrl = new URL(window.location.href);
    homeUrl.search = "";
    homeUrl.hash = "";
    window.location.href = homeUrl.toString();
  }

  function closeViewer() {
    try { window.close(); } catch (_) {}
    window.setTimeout(() => {
      if (!window.closed) {
        if (window.history.length > 1) window.history.back();
        else goHome();
      }
    }, 80);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("home-logo")?.addEventListener("click", goHome);
    document.getElementById("share-btn")?.addEventListener("click", shareCurrentLink);
    document.getElementById("close-btn")?.addEventListener("click", closeViewer);
    setTitle(window.Suwon360.config.tour);
    setStatus("파노라마를 불러오는 중…");
    setBusy(true);
    if (typeof window.Suwon360Panorama?.init === "function") window.Suwon360Panorama.init();
    else setStatus("panorama.js를 불러오지 못했습니다.", true);
  });

  window.Suwon360App = { setStatus, setBusy, setTitle, goHome };
})();
