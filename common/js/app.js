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
    const dateEl = document.getElementById("shooting-date");
    const finalTitle = title || window.Suwon360.config.tour;
    const explorerTitle = `${finalTitle} 둘러보기`;

    // v117
    // PC 중앙 메뉴 제목: "남수헌 둘러보기"
    // 모바일 로고 제목: "남수헌"만 표시되도록 menu.js에서 분리 처리
    window.Suwon360.contentTitle = finalTitle;

    if (titleEl) {
      titleEl.textContent = explorerTitle;
      titleEl.title = explorerTitle;
      titleEl.dataset.contentTitle = finalTitle;
    }

    if (dateEl) {
      dateEl.textContent = shootingDate ? `촬영일 : ${shootingDate}` : "";
      dateEl.hidden = !shootingDate;
    }

    document.title = `수원360투어 | ${finalTitle}`;
  }

  async function shareCurrentLink(event) {
    const shareButton = event?.currentTarget || document.getElementById("share-btn");
    const url = window.location.href;

    const rawContentTitle =
      window.Suwon360?.contentTitle ||
      document.getElementById("content-title")?.dataset.contentTitle ||
      document.getElementById("brand-content-title")?.textContent?.trim() ||
      document.getElementById("content-title")?.textContent
        ?.replace(/\s*둘러보기\s*$/, "")
        .trim() ||
      window.Suwon360?.config?.tour ||
      "수원360투어";

    const shareTitle = `수원360투어 | ${rawContentTitle}`;
    const shareText = `수원360투어에서 ${rawContentTitle}을(를) 둘러보세요.`;
    const copyText = `${shareTitle}\n\n${shareText}\n\n${url}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(copyText);
        setStatus("제목과 링크를 복사했습니다.");
        window.setTimeout(() => setStatus(""), 1500);
      } else {
        window.prompt("아래 내용을 복사하세요.", copyText);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setStatus("링크 공유에 실패했습니다.", true);
      }
    } finally {
      // v119: 모바일에서 공유 후 파란 포커스 상태가 남지 않도록 즉시 해제
      window.setTimeout(() => shareButton?.blur(), 0);
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
