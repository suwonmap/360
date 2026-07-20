(() => {
  "use strict";
  const DESKTOP_VISIBLE_LIMIT = 12;
  const MOBILE_LAYOUT = Object.freeze({ SPLIT:"split", MENU:"menu", MAP:"map", HIDDEN:"hidden" });
  let menuScenes=[], activeMenuScene="", lastVisibleLayout=MOBILE_LAYOUT.SPLIT;

  function makeButton(scene,index,className){
    const button=document.createElement("button");
    const numberText=String(index+1).padStart(2,"0");
    button.type="button"; button.className=className; button.dataset.scene=scene.name;
    button.dataset.menuIndex=String(index+1); button.title=scene.title;
    if(className==="mobile-menu-item"){
      const number=document.createElement("span"); number.className="mobile-menu-number"; number.textContent=numberText;
      const title=document.createElement("span"); title.className="mobile-menu-title"; title.textContent=scene.title;
      button.append(number,title);
    }else button.textContent=`${numberText} ${scene.title}`;
    button.addEventListener("click",()=>{
      select(scene.name); closeOverflow();
      window.Suwon360Map?.selectMenuScene?.(scene.name);
      window.Suwon360Panorama?.loadScene?.(scene.name);
      requestMapRelayout(80);
    });
    return button;
  }
  function render(scenes=[]){
    menuScenes=Array.isArray(scenes)?scenes.filter(s=>s&&s.menuShow===true):[];
    renderDesktop(); renderMobile(); bindControls();
    if(window.Suwon360?.currentScene) select(window.Suwon360.currentScene,false);
  }
  function renderDesktop(){
    const track=document.getElementById("menu-track"), overflow=document.getElementById("menu-overflow"),
          more=document.getElementById("menu-more-toggle");
    if(!track||!overflow||!more)return;
    track.innerHTML=""; overflow.innerHTML="";
    menuScenes.slice(0,DESKTOP_VISIBLE_LIMIT).forEach((s,i)=>track.appendChild(makeButton(s,i,"menu-chip")));
    menuScenes.slice(DESKTOP_VISIBLE_LIMIT).forEach((s,o)=>overflow.appendChild(makeButton(s,DESKTOP_VISIBLE_LIMIT+o,"menu-chip")));
    more.hidden=menuScenes.length<=DESKTOP_VISIBLE_LIMIT; if(more.hidden)closeOverflow();
  }
  function renderMobile(){
    const c=document.getElementById("mobile-menu-list"); if(!c)return; c.innerHTML="";
    menuScenes.forEach((s,i)=>c.appendChild(makeButton(s,i,"mobile-menu-item")));
  }
  function resolve(name){
    const r=window.Suwon360?.resolveMenuScene?.(name); if(r)return r;
    if(menuScenes.some(s=>s.name===name))return name;
    return activeMenuScene||menuScenes[0]?.name||"";
  }
  function scrollToButton(button){
    if(!button||button.parentElement?.id!=="mobile-menu-list")return;
    const c=button.parentElement, top=button.offsetTop-(c.clientHeight-button.offsetHeight)/2;
    c.scrollTo({top:Math.max(0,top),behavior:"smooth"});
  }
  function select(name,scroll=true){
    const resolved=resolve(name); if(!resolved)return "";
    activeMenuScene=resolved; if(window.Suwon360)window.Suwon360.activeMenuScene=resolved;
    document.querySelectorAll("#menu-track [data-scene],#menu-overflow [data-scene],#mobile-menu-list [data-scene]").forEach(b=>{
      const active=b.dataset.scene===resolved; b.classList.toggle("is-active",active);
      b.setAttribute("aria-current",active?"true":"false"); if(active&&scroll)scrollToButton(b);
    });
    return resolved;
  }
  function closeOverflow(){
    const o=document.getElementById("menu-overflow"),m=document.getElementById("menu-more-toggle");
    if(o)o.hidden=true; if(m)m.setAttribute("aria-expanded","false");
  }
  function toggleOverflow(){
    const o=document.getElementById("menu-overflow"),m=document.getElementById("menu-more-toggle");
    if(!o||!m)return; const open=o.hidden; o.hidden=!open; m.setAttribute("aria-expanded",String(open));
  }
  function getLayout(){
    const v=document.getElementById("app")?.dataset.mobileLayout;
    return Object.values(MOBILE_LAYOUT).includes(v)?v:MOBILE_LAYOUT.SPLIT;
  }
  function requestMapRelayout(delay=180){
    window.setTimeout(()=>{window.Suwon360Map?.forceRelayout?.();window.js_force_minimap_relayout?.();},delay);
  }
  function updatePanelToggle(hidden){
    const b=document.getElementById("panel-toggle"); if(!b)return;
    b.setAttribute("aria-expanded",String(!hidden));
    b.setAttribute("aria-label",hidden?"메뉴와 지도 전체 보기":"메뉴와 지도 전체 숨김");
    b.title=hidden?"메뉴·지도 전체보기":"메뉴·지도 숨기기";
    b.classList.toggle("is-restore",hidden);
  }
  function applyLayout(next){
    const app=document.getElementById("app");
    if(!app||!Object.values(MOBILE_LAYOUT).includes(next))return;
    if(next!==MOBILE_LAYOUT.HIDDEN)lastVisibleLayout=next;
    app.dataset.mobileLayout=next;
    const hidden=next===MOBILE_LAYOUT.HIDDEN;
    updatePanelToggle(hidden);
    requestMapRelayout(hidden?240:80);
  }
  function bindControls(){
    if(document.body.dataset.menuBound==="true")return;
    document.body.dataset.menuBound="true";
    const explorer=document.getElementById("desktop-explorer"),all=document.getElementById("menu-all-toggle");
    document.getElementById("menu-more-toggle")?.addEventListener("click",e=>{e.stopPropagation();toggleOverflow();});
    all?.addEventListener("click",()=>{
      const collapsed=explorer?.classList.toggle("menu-collapsed")||false;
      const label=collapsed?"메뉴 펼치기":"메뉴 접기";
      all.textContent="☰"; all.title=label; all.setAttribute("aria-pressed",String(collapsed));
      all.setAttribute("aria-label",label); closeOverflow();
    });
    document.addEventListener("click",e=>{if(!e.target.closest("#desktop-explorer"))closeOverflow();});
    document.getElementById("panel-toggle")?.addEventListener("click",()=>applyLayout(
      getLayout()===MOBILE_LAYOUT.HIDDEN?lastVisibleLayout:MOBILE_LAYOUT.HIDDEN
    ));
    document.getElementById("mobile-menu-hide")?.addEventListener("click",()=>applyLayout(MOBILE_LAYOUT.MAP));
    document.getElementById("mobile-menu-show")?.addEventListener("click",()=>applyLayout(MOBILE_LAYOUT.SPLIT));
    document.getElementById("mobile-map-hide")?.addEventListener("click",()=>applyLayout(MOBILE_LAYOUT.MENU));
    document.getElementById("mobile-map-show")?.addEventListener("click",()=>applyLayout(MOBILE_LAYOUT.SPLIT));
    window.addEventListener("orientationchange",()=>{updatePanelToggle(getLayout()===MOBILE_LAYOUT.HIDDEN);requestMapRelayout(280);},{passive:true});
    window.addEventListener("resize",()=>{updatePanelToggle(getLayout()===MOBILE_LAYOUT.HIDDEN);requestMapRelayout(120);},{passive:true});
    updatePanelToggle(getLayout()===MOBILE_LAYOUT.HIDDEN);
  }
  window.Suwon360MobileLayout={apply:applyLayout,get:getLayout,split:()=>applyLayout(MOBILE_LAYOUT.SPLIT),
    menu:()=>applyLayout(MOBILE_LAYOUT.MENU),map:()=>applyLayout(MOBILE_LAYOUT.MAP),hide:()=>applyLayout(MOBILE_LAYOUT.HIDDEN)};
  window.Suwon360Menu={render,select,resolve,getActiveScene:()=>activeMenuScene,getScenes:()=>menuScenes.slice()};
})();
