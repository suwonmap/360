(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);

  function clean(value, fallback) {
    const text = String(value || fallback || "");
    return text.replace(/[^a-zA-Z0-9_-]/g, "");
  }

  const contents = clean(params.get("contents"), "suwon_tour");
  const tour = clean(params.get("tour"), "namsuheon");

  window.Suwon360 = {
    config: {
      contents,
      tour,
      xmlPath: `${contents}/${tour}.xml`,
      panoTarget: "pano"
    },
    krpano: null,
    scenes: [],
    currentScene: "",
    ready: false
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

  function setTitle(title, shootingDate = "") {
    const titleEl = document.getElementById("content-title");
    const brandNameEl = document.getElementById("brand-name");
    const dateEl = document.getElementById("shooting-date");
    const finalTitle = title || window.Suwon360.config.tour;

    // v96: 콘텐츠명은 최대 10자로 표시하고 뒤에 ""를 붙임
    const shortTitle = Array.from(finalTitle).slice(0, 10).join("");
    const explorerTitle = `${shortTitle}`;

    if (titleEl) {
      titleEl.textContent = finalTitle;
      titleEl.title = finalTitle;
    }

    if (brandNameEl) {
      brandNameEl.textContent = `수원360투어 | ${finalTitle}`;
      brandNameEl.title = `수원360투어 | ${finalTitle}`;
    }

    if (dateEl) {
      dateEl.textContent = shootingDate ? `촬영일 : ${shootingDate}` : "";
      dateEl.hidden = !shootingDate;
    }

    document.title = `수원360투어 | ${finalTitle}`;
  }

  async function shareCurrentLink() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setStatus("링크를 복사했습니다.");
        window.setTimeout(() => setStatus(""), 1500);
      } else {
        window.prompt("아래 링크를 복사하세요.", url);
      }
    } catch (error) {
      if (error?.name !== "AbortError") setStatus("링크 공유에 실패했습니다.", true);
    }
  }

  function closeTour() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    try {
      window.close();
    } catch (_) {
      window.location.href = "./";
    }

    window.setTimeout(() => {
      if (!document.hidden) window.location.href = "./";
    }, 250);
  }

  // v96: 현재 viewer.html의 쿼리스트링을 제거하여 메인화면으로 이동
  function goHome() {
    window.location.href = window.location.pathname;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("share-btn")?.addEventListener("click", shareCurrentLink);
    document.getElementById("close-btn")?.addEventListener("click", closeTour);

    const homeLogo = document.getElementById("home-logo");
    homeLogo?.addEventListener("click", goHome);
    homeLogo?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goHome();
      }
    });

    setTitle(window.Suwon360.config.tour);
    setStatus("파노라마를 불러오는 중…");
    setBusy(true);

    if (typeof window.Suwon360Panorama?.init === "function") {
      window.Suwon360Panorama.init();
    } else {
      setStatus("panorama.js를 불러오지 못했습니다.", true);
    }
  });

  window.Suwon360App = { setStatus, setBusy, setTitle };
})();
