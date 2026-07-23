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

  let shareLastFocusedElement = null;
  let shareQrUrl = "";

  function getShareData() {
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

    return {
      url,
      title: `수원360°투어 | ${rawContentTitle}`,
      text: `${rawContentTitle}의 360° 공간을 둘러보세요.`
    };
  }

  function setShareMessage(message, isError = false) {
    const element = document.getElementById("share-layer-message");
    if (!element) return;
    element.textContent = message || "";
    element.style.color = isError ? "#fca5a5" : "#bfdbfe";
  }

  function openShareLayer(event) {
    event?.currentTarget?.blur();

    const layer = document.getElementById("share-layer");
    if (!layer) return;

    const data = getShareData();
    shareLastFocusedElement = event?.currentTarget || document.activeElement;

    document.getElementById("share-dialog-subtitle").textContent = data.title;
    document.getElementById("share-url-text").textContent = data.url;
    document.getElementById("share-url-text").title = data.url;
    setShareMessage("");

    layer.hidden = false;
    layer.setAttribute("aria-hidden", "false");
    document.body.classList.add("share-layer-open");
    document.getElementById("share-layer-close")?.focus();
  }

  function closeShareLayer() {
    const layer = document.getElementById("share-layer");
    if (!layer || layer.hidden) return;

    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("share-layer-open");
    setShareMessage("");
    shareLastFocusedElement?.focus?.();
  }

  async function copyShareLink() {
    const data = getShareData();
    const copyText = `${data.title}\n\n${data.url}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = copyText;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setShareMessage("제목과 링크를 복사했습니다.");
    } catch (_) {
      window.prompt("아래 내용을 복사하세요.", copyText);
    }
  }

  function openShareWindow(url, name) {
    const width = 640;
    const height = 680;
    const left = Math.max(0, (screen.width - width) / 2);
    const top = Math.max(0, (screen.height - height) / 2);

    window.open(
      url,
      name,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  }

  function shareFacebook() {
    const data = getShareData();
    openShareWindow(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.url)}`,
      "suwon360-facebook-share"
    );
  }

  function shareTwitter() {
    const data = getShareData();
    openShareWindow(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(data.title)}&url=${encodeURIComponent(data.url)}`,
      "suwon360-twitter-share"
    );
  }

  function kakaoJavascriptKey() {
    const script = Array.from(document.scripts).find((item) =>
      item.src.includes("dapi.kakao.com/v2/maps/sdk.js")
    );
    if (!script) return "";
    return new URL(script.src).searchParams.get("appkey") || "";
  }

  function shareKakao() {
    const data = getShareData();
    const key = kakaoJavascriptKey();

    try {
      if (!window.Kakao) throw new Error("Kakao SDK unavailable");
      if (!window.Kakao.isInitialized()) {
        if (!key) throw new Error("Kakao JavaScript key unavailable");
        window.Kakao.init(key);
      }

      window.Kakao.Share.sendDefault({
        objectType: "text",
        text: `${data.title}\n${data.text}`,
        link: {
          mobileWebUrl: data.url,
          webUrl: data.url
        },
        buttonTitle: "360°투어 보기"
      });
    } catch (_) {
      setShareMessage("카카오톡 공유 설정을 확인해 주세요.", true);
    }
  }

  function toggleShareQr() {
    const panel = document.getElementById("share-qr-panel");
    const button = document.getElementById("share-qr-btn");
    const container = document.getElementById("share-qr-code");
    if (!panel || !button || !container) return;

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));

    if (!willOpen) return;

    const url = getShareData().url;
    if (shareQrUrl === url && container.childElementCount) return;

    container.innerHTML = "";
    shareQrUrl = url;

    if (typeof window.QRCode === "function") {
      new window.QRCode(container, {
        text: url,
        width: 180,
        height: 180,
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      setShareMessage("QR코드 라이브러리를 불러오지 못했습니다.", true);
    }
  }


  async function handleShareButton(event) {
    const shareButton = event?.currentTarget || document.getElementById("share-btn");
    shareButton?.blur();
    const data = getShareData();
    const isMobile =
      window.matchMedia("(max-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;

    if (isMobile && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: data.title,
          text: data.text,
          url: data.url
        });
      } catch (error) {
        if (error?.name !== "AbortError") {
          setShareMessage("공유 기능을 실행하지 못했습니다.", true);
        }
      }
      return;
    }

    openShareLayer(event);
  }

  function bindShareLayer() {
    document.getElementById("share-btn")?.addEventListener("click", handleShareButton);
    document.getElementById("share-layer-close")?.addEventListener("click", closeShareLayer);
    document.querySelectorAll("[data-share-close]").forEach((element) => {
      element.addEventListener("click", closeShareLayer);
    });
    document.getElementById("share-copy-btn")?.addEventListener("click", copyShareLink);
    document.getElementById("share-kakao-btn")?.addEventListener("click", shareKakao);
    document.getElementById("share-facebook-btn")?.addEventListener("click", shareFacebook);
    document.getElementById("share-twitter-btn")?.addEventListener("click", shareTwitter);
    document.getElementById("share-qr-btn")?.addEventListener("click", toggleShareQr);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeShareLayer();
    });
  }

  function closeTour(event) {
    const closeButton = event?.currentTarget || document.getElementById("close-btn");

    // v122: 모바일에서 종료 버튼을 누른 뒤 파란색 상태가 남지 않도록 즉시 해제
    closeButton?.blur();
    if (document.activeElement === closeButton) {
      document.activeElement.blur();
    }

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
    bindShareLayer();
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
    // v121: 정상 로딩 중에는 문구를 표시하지 않고 검은 배경 뒤에서 파노라마를 준비합니다.
    setStatus("");
    setBusy(true);

    if (typeof window.Suwon360Panorama?.init === "function") {
      window.Suwon360Panorama.init();
    } else {
      setStatus("panorama.js를 불러오지 못했습니다.", true);
    }
  });

  window.Suwon360App = { setStatus, setBusy, setTitle };
})();
