/**
 * 수원360°투어 map.js
 * - 메뉴 Scene만 지도 마커
 * - 남수헌은 대표 포인트 1개
 * - PC/모바일 모두 사용자가 변경한 지도 확대 레벨 유지
 */

const S360_CFG={
    mobileBreakpoint:768,
    blend:0.7,
    defaultCenter:{lat:37.2635,lng:127.0286},
    singleLevel:3,
    multiLevel:4,
    headingSign:1,
    headingOffset:0,
    desktopMap:{minWidth:235,minHeight:160,maxRatio:.72}
};

const S360={
    initialized:false,
    initializing:false,
    krpano:null,
    scenes:[],
    menuScenes:[],
    markerScenes:[],
    firstScene:"",
    currentScene:"",
    activeMenuScene:"",
    requestedMode:"auto",
    mode:"none",
    rootLat:NaN,
    rootLng:NaN,
    map:null,
    canvas:null,
    overlays:[],
    singleOverlay:null,
    markersBuilt:false,
    initialBoundsApplied:false,
    userMapLevel:null,
    userMapCenter:null,
    internalMapMove:false,
    headingFrame:false,
    resizeReady:false,
    retryCount:0,
    retryTimer:null
};

(function injectMapCss(){
    if(document.getElementById("s360-map-css"))return;
    const style=document.createElement("style");
    style.id="s360-map-css";
    style.textContent=`
        #kakao-map-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:1;background:#eef2f7}
        .s360-marker{position:relative;width:34px;height:34px;cursor:pointer;user-select:none}
        .s360-direction{position:absolute;left:50%;top:50%;width:54px;height:54px;transform:translate(-50%,-50%) rotate(0deg);transform-origin:center;pointer-events:none}
        .s360-cone{position:absolute;left:50%;top:0;width:0;height:0;transform:translateX(-50%);border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:28px solid rgba(0,91,172,.25)}
        .s360-arrow{position:absolute;left:50%;top:4px;width:0;height:0;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:14px solid #005bac}
        .s360-point{position:absolute;left:50%;top:50%;width:21px;height:21px;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;color:#fff;background:#2f8cff;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.40);font:700 9px Arial,sans-serif}
        .s360-marker.is-active .s360-point{width:26px;height:26px;background:#ff3d00;font-size:10px}
        .s360-marker.is-single .s360-point{width:24px;height:24px;background:#005bac}
        .s360-label{position:absolute;left:50%;top:33px;transform:translateX(-50%);max-width:140px;padding:3px 6px;overflow:hidden;color:#111827;background:rgba(255,255,255,.95);border:1px solid rgba(17,24,39,.18);border-radius:5px;font:600 11px "Malgun Gothic",sans-serif;text-overflow:ellipsis;white-space:nowrap;opacity:0;pointer-events:none}
        .s360-marker:hover .s360-label,.s360-marker.is-active .s360-label{opacity:1}
        .s360-map-message{position:absolute;left:50%;top:50%;z-index:50;transform:translate(-50%,-50%);padding:9px 13px;color:#374151;background:rgba(255,255,255,.94);border:1px solid #d1d5db;border-radius:7px;font-size:12px;white-space:nowrap}
        @media(max-width:${S360_CFG.mobileBreakpoint}px){.s360-label{display:none}}
    `;
    document.head.appendChild(style);
})();

function getKrpano(){
    return window.krpanoObj||document.getElementById("pano")?.krpano||null;
}
function readBoolean(value,defaultValue=false){
    if(value===undefined||value===null||value==="")return defaultValue;
    return ["true","1","yes","on"].includes(String(value).toLowerCase());
}
function readNumber(values,fallback=NaN){
    for(const value of values){
        if(value===undefined||value===null||value==="")continue;
        const number=Number(value);
        if(Number.isFinite(number))return number;
    }
    return fallback;
}
function findScene(sceneName){
    return S360.scenes.find(function(scene){return scene.name===sceneName;})||null;
}
function isMobile(){
    return (
        document.documentElement.classList.contains("s360-mobile") ||
        window.innerWidth<=S360_CFG.mobileBreakpoint
    );
}

window.js_initialize_suwon360=function(){
    if(S360.initialized){
        updateCurrentScene();
        window.js_force_minimap_relayout();
        return;
    }
    if(S360.initializing)return;

    S360.krpano=getKrpano();
    if(!S360.krpano||Number(S360.krpano.get("scene.count")||0)<1){
        scheduleInitialization();
        return;
    }

    S360.initializing=true;
    try{
        readTourMetadata();
        readScenes();
        buildMenus();
        syncMinimapHost();
        ensureMapCanvas();
        startKakaoMap();
        initializeMapResize();
        S360.initialized=true;
        updateCurrentScene();
    }catch(error){
        console.error("[수원360 초기화 오류]",error);
    }finally{
        S360.initializing=false;
    }
};

window.js_start_kakao_map=window.js_initialize_suwon360;

function scheduleInitialization(){
    clearTimeout(S360.retryTimer);
    if(S360.retryCount>60)return;
    S360.retryCount+=1;
    S360.retryTimer=setTimeout(window.js_initialize_suwon360,120);
}

window.js_suwon360_on_scene_changed=function(){
    window.dispatchEvent(
        new CustomEvent("s360-scene-changed")
    );

    if(!S360.initialized){
        window.js_initialize_suwon360();
        return;
    }
    updateCurrentScene();
};

window.js_suwon360_on_view_changed=function(){
    requestHeadingUpdate();
};

function readTourMetadata(){
    const krpano=S360.krpano;
    const tourKey=window.SUWON360_TOUR_KEY||"";
    const knownTitles={namsuheon:"남수헌",yharbor:"영흥수목원"};

    let title=String(krpano.get("title")||"").trim();
    let captureDate=String(krpano.get("capturedate")||"").trim();

    if(!title)title=knownTitles[tourKey]||tourKey||"콘텐츠";
    if(!captureDate)captureDate="-";

    document.getElementById("tour-content-title").textContent=title;
    document.getElementById("tour-capture-date").textContent="촬영일 : "+captureDate;
    document.title="수원360°투어 │ "+title;

    let requestedMode=String(
        krpano.get("mapmode")||
        krpano.get("maptype")||
        ""
    ).trim().toLowerCase();

    if(!["single","multi","none"].includes(requestedMode)){
        if(tourKey==="namsuheon")requestedMode="single";
        else if(tourKey==="yharbor")requestedMode="multi";
        else requestedMode="auto";
    }

    S360.requestedMode=requestedMode;
    S360.rootLat=readNumber([krpano.get("maplat"),krpano.get("map_lat"),krpano.get("lat")]);
    S360.rootLng=readNumber([krpano.get("maplng"),krpano.get("map_lng"),krpano.get("lng"),krpano.get("lon")]);
}

function readScenes(){
    const krpano=S360.krpano;
    const sceneCount=Number(krpano.get("scene.count")||0);
    const scenes=[];

    for(let index=0;index<sceneCount;index+=1){
        const prefix="scene["+index+"]";
        const name=String(krpano.get(prefix+".name")||"").trim();
        if(!name)continue;

        const title=String(krpano.get(prefix+".title")||"").trim()||
            name.replace(/^scene[_-]?/i,"").replace(/[_-]+/g," ");

        const menuShow=readBoolean(krpano.get(prefix+".menu_show"),false);
        const mapShow=readBoolean(krpano.get(prefix+".map_show"),menuShow);

        /*
         * 보조 Scene에서 유지할 상위 메뉴 Scene.
         * XML 예: menu_parent="scene_yharbor_(5)"
         */
        const menuParent=String(
            krpano.get(prefix+".menu_parent")||""
        ).trim();

        const lat=readNumber([
            krpano.get(prefix+".lat"),
            krpano.get(prefix+".latitude"),
            krpano.get(prefix+".map_lat")
        ]);

        const lng=readNumber([
            krpano.get(prefix+".lng"),
            krpano.get(prefix+".lon"),
            krpano.get(prefix+".longitude"),
            krpano.get(prefix+".map_lng")
        ]);

        const heading=readNumber([
            krpano.get(prefix+".mapheading"),
            krpano.get(prefix+".map_heading"),
            krpano.get(prefix+".north"),
            krpano.get(prefix+".heading")
        ],0);

        scenes.push({
            index,name,title,menuShow,mapShow,menuParent,lat,lng,heading,
            hasCoordinate:Number.isFinite(lat)&&Number.isFinite(lng),
            menuElements:[],
            overlayRecord:null
        });
    }

    S360.scenes=scenes;
    S360.menuScenes=scenes.filter(function(scene){return scene.menuShow;});
    S360.firstScene=
        (S360.menuScenes[0]&&S360.menuScenes[0].name)||
        (scenes[0]&&scenes[0].name)||
        "";

    S360.markerScenes=S360.menuScenes.filter(function(scene){
        return scene.mapShow&&scene.hasCoordinate;
    });

    determineMapMode();
}

function getSingleCoordinate(){
    if(Number.isFinite(S360.rootLat)&&Number.isFinite(S360.rootLng)){
        return {
            lat:S360.rootLat,
            lng:S360.rootLng,
            title:document.getElementById("tour-content-title").textContent||""
        };
    }

    const scene=
        S360.menuScenes.find(function(item){return item.hasCoordinate;})||
        S360.scenes.find(function(item){return item.hasCoordinate;});

    if(!scene)return null;
    return {lat:scene.lat,lng:scene.lng,title:scene.title};
}

function determineMapMode(){
    if(S360.requestedMode==="none"){
        S360.mode="none";
        return;
    }
    if(S360.requestedMode==="single"){
        S360.mode=getSingleCoordinate()?"single":"none";
        return;
    }
    if(S360.requestedMode==="multi"){
        S360.mode=S360.markerScenes.length?"multi":"none";
        return;
    }

    const uniqueCoordinates=new Set(
        S360.markerScenes.map(function(scene){
            return scene.lat.toFixed(5)+","+scene.lng.toFixed(5);
        })
    );

    if(uniqueCoordinates.size===0)S360.mode="none";
    else if(uniqueCoordinates.size===1)S360.mode="single";
    else S360.mode="multi";
}

function buildMenus(){
    const pcMenu=document.getElementById("pc-menu");
    const mobileMenu=document.getElementById("bottom-menu-view");

    pcMenu.innerHTML="";
    mobileMenu.innerHTML="";

    S360.scenes.forEach(function(scene){scene.menuElements=[];});

    S360.menuScenes.forEach(function(scene,index){
        const pcButton=createMenuButton(scene,index);
        const mobileButton=createMenuButton(scene,index);

        pcMenu.appendChild(pcButton);
        mobileMenu.appendChild(mobileButton);

        scene.menuElements=[pcButton,mobileButton];
    });
}

function createMenuButton(scene,index){
    const button=document.createElement("button");
    button.type="button";
    button.className="tour-menu-item";
    button.dataset.sceneName=scene.name;

    const number=document.createElement("span");
    number.className="tour-menu-number";
    number.textContent=String(index+1).padStart(2,"0");

    const title=document.createElement("span");
    title.className="tour-menu-title";
    title.textContent=scene.title;

    button.appendChild(number);
    button.appendChild(title);

    button.addEventListener("click",function(){
        highlightMenu(scene.name);
        loadScene(scene.name);

        /*
         * 모바일에서는 메뉴 선택 직후
         * 하단 전체 폭을 카카오맵으로 전환합니다.
         */
        if(typeof window.js_expand_mobile_map_after_scene_select==="function"){
            window.js_expand_mobile_map_after_scene_select();
        }
    });

    return button;
}

/*
 * 현재 Scene에 대응하는 메뉴 Scene을 찾습니다.
 * 우선순위:
 * 1. 현재 Scene 자체가 menu_show=true
 * 2. menu_parent 속성
 * 3. XML 순서상 현재 Scene보다 앞에 있는 가장 가까운 메뉴 Scene
 * 4. 기존 선택 메뉴 유지
 */
function resolveActiveMenuSceneName(sceneName){
    const current=findScene(sceneName);

    if(!current){
        return S360.activeMenuScene||"";
    }

    if(current.menuShow){
        return current.name;
    }

    if(current.menuParent){
        const parent=findScene(current.menuParent);

        if(parent&&parent.menuShow){
            return parent.name;
        }
    }

    let nearest="";

    S360.menuScenes.forEach(function(menuScene){
        if(menuScene.index<=current.index){
            nearest=menuScene.name;
        }
    });

    return nearest||S360.activeMenuScene||"";
}


/*
 * 선택된 메뉴가 긴 목록 아래쪽에 있더라도
 * PC 메뉴와 모바일 메뉴에서 자동으로 가운데쯤 보이도록 스크롤합니다.
 */
function scrollSelectedMenuIntoView(sceneName){
    const scene=findScene(sceneName);
    if(!scene||!Array.isArray(scene.menuElements))return;

    function scrollElement(element){
        if(!element)return;

        const container=element.closest(
            "#pc-menu, #bottom-menu-view"
        );

        if(!container||container.clientHeight<=0)return;

        const containerRect=container.getBoundingClientRect();
        const elementRect=element.getBoundingClientRect();
        const margin=12;

        /* PC 상단 가로 메뉴는 선택 항목을 가운데로 이동 */
        if(container.id==="pc-menu"){
            const fullyVisible=
                elementRect.left>=containerRect.left+margin &&
                elementRect.right<=containerRect.right-margin;

            if(fullyVisible)return;

            const targetLeft=
                container.scrollLeft+
                (elementRect.left-containerRect.left)-
                (container.clientWidth-element.offsetWidth)/2;

            container.scrollTo({
                left:Math.max(0,targetLeft),
                behavior:"smooth"
            });
            return;
        }

        /* 모바일 하단 메뉴는 기존 세로 스크롤 유지 */
        const fullyVisible=
            elementRect.top>=containerRect.top+margin &&
            elementRect.bottom<=containerRect.bottom-margin;

        if(fullyVisible)return;

        const targetTop=
            container.scrollTop+
            (elementRect.top-containerRect.top)-
            (container.clientHeight-element.offsetHeight)/2;

        container.scrollTo({
            top:Math.max(0,targetTop),
            behavior:"smooth"
        });
    }

    /*
     * 모바일은 Scene 전환·지도 리레이아웃 직후 높이가 바뀔 수 있으므로
     * 여러 시점에 한 번씩 확인하여 선택 메뉴를 반드시 보이게 합니다.
     */
    [0,120,320].forEach(function(delay){
        window.setTimeout(function(){
            scene.menuElements.forEach(scrollElement);
        },delay);
    });
}

function highlightMenu(sceneName){
    if(sceneName){
        S360.activeMenuScene=sceneName;
    }

    S360.scenes.forEach(function(scene){
        const active=scene.name===sceneName;
        scene.menuElements.forEach(function(element){
            element.classList.toggle("is-active",active);
            element.setAttribute("aria-current",active?"true":"false");
        });
    });

    scrollSelectedMenuIntoView(sceneName);
}

function loadScene(sceneName){
    if(!sceneName||!S360.krpano)return;

    const safeSceneName=sceneName
        .replace(/\\/g,"\\\\")
        .replace(/'/g,"\\'");

    S360.krpano.call(
        "loadscene('"+
        safeSceneName+
        "',null,MERGE,BLEND("+
        S360_CFG.blend+
        "));"
    );
}

window.js_load_first_scene=function(){
    if(S360.firstScene){
        highlightMenu(S360.firstScene);
        loadScene(S360.firstScene);
    }
};


/* ==========================================================
   v77 PC 미니맵 표시 보정
   - PC에서는 숨겨지는 모바일 bottom-panel 밖으로 미니맵을 이동
   - 모바일에서는 원래 bottom-map-view 안으로 복귀
   - 모바일 토글/가로·세로 레이아웃 로직은 변경하지 않음
========================================================== */
function syncMinimapHost(){
    const wrapper=document.getElementById("krpano-minimap-wrapper");
    const uiContainer=document.getElementById("ui-container");
    const mobileHost=document.getElementById("bottom-map-view");

    if(!wrapper||!uiContainer||!mobileHost)return false;

    const mobileLayout=(
        window.innerWidth<=S360_CFG.mobileBreakpoint ||
        (document.documentElement.classList.contains("s360-mobile") &&
         window.matchMedia("(pointer:coarse)").matches)
    );

    const targetHost=mobileLayout?mobileHost:uiContainer;

    if(wrapper.parentElement!==targetHost){
        targetHost.appendChild(wrapper);
    }

    return true;
}

function ensureMapCanvas(){
    const wrapper=document.getElementById("krpano-minimap-wrapper");
    if(!wrapper)return;

    let canvas=document.getElementById("kakao-map-canvas");
    if(!canvas){
        canvas=document.createElement("div");
        canvas.id="kakao-map-canvas";
        wrapper.insertBefore(canvas,document.getElementById("map-resize-handle"));
    }
    S360.canvas=canvas;
}

function startKakaoMap(){
    if(!window.kakao||!window.kakao.maps){
        setTimeout(startKakaoMap,100);
        return;
    }

    window.kakao.maps.load(function(){
        syncMinimapHost();
        ensureMapCanvas();

        const wrapper=document.getElementById("krpano-minimap-wrapper");
        const rect=wrapper?wrapper.getBoundingClientRect():null;

        /*
         * 숨겨진 부모 안에서 크기 0으로 지도가 생성되는 것을 방지합니다.
         * PC에서는 wrapper가 ui-container로 이동한 뒤 실제 크기가 확보됩니다.
         */
        if(!wrapper||!rect||rect.width<10||rect.height<10){
            window.setTimeout(startKakaoMap,120);
            return;
        }

        if(!S360.map){
            createMap();
        }

        /*
         * Scene 변경이나 common_layout.xml 이벤트가 반복되어도
         * 마커와 지도 범위를 다시 만들지 않습니다.
         * 지도 포인트는 최초 한 번만 생성합니다.
         */
        if(!S360.markersBuilt){
            rebuildMarkers();
            S360.markersBuilt=true;
        }else{
            updateCurrentScene();
        }
    });
}

function createMap(){
    const initialPosition=
        S360.mode==="single"
            ? getSingleCoordinate()
            : (S360.markerScenes[0]||S360_CFG.defaultCenter);

    S360.map=new kakao.maps.Map(
        S360.canvas,
        {
            center:new kakao.maps.LatLng(initialPosition.lat,initialPosition.lng),
            level:S360.mode==="multi"?S360_CFG.multiLevel:S360_CFG.singleLevel
        }
    );

    window.kakaoMap=S360.map;

    /*
     * PC에서는 확대/축소 컨트롤을 표시하고,
     * 모바일에서는 화면을 가리는 긴 세로 바를 표시하지 않습니다.
     * 모바일은 손가락 확대/축소를 사용합니다.
     */
    if(!isMobile()){
        S360.map.addControl(
            new kakao.maps.ZoomControl(),
            kakao.maps.ControlPosition.RIGHT
        );
    }

    /*
     * 사용자가 확대·축소하거나 지도를 이동한 최종 상태를 저장합니다.
     * idle 이벤트는 지도 조작이 완전히 끝난 뒤 호출되므로
     * PC와 모바일에서 모두 안정적입니다.
     */
    kakao.maps.event.addListener(S360.map,"idle",function(){
        if(S360.internalMapMove)return;

        S360.userMapLevel=S360.map.getLevel();
        S360.userMapCenter=S360.map.getCenter();
    });
}

function clearMarkers(){
    S360.overlays.forEach(function(record){record.overlay.setMap(null);});
    S360.overlays=[];

    if(S360.singleOverlay){
        S360.singleOverlay.overlay.setMap(null);
    }
    S360.singleOverlay=null;

    S360.scenes.forEach(function(scene){scene.overlayRecord=null;});

    const message=document.getElementById("s360-map-message");
    if(message)message.remove();
}

function rebuildMarkers(){
    clearMarkers();
    if(!S360.map)return;

    if(S360.mode==="none"){
        const message=document.createElement("div");
        message.id="s360-map-message";
        message.className="s360-map-message";
        message.textContent="등록된 위치 정보가 없습니다.";
        document.getElementById("krpano-minimap-wrapper").appendChild(message);
        return;
    }

    if(S360.mode==="single"){
        createSingleMarker();
        return;
    }

    createMultiMarkers();

    /* 전체 범위 맞춤은 최초 한 번만 */
    if(!S360.initialBoundsApplied){
        fitMultiBounds();
        S360.initialBoundsApplied=true;
    }

    updateCurrentScene();
}

function createMarkerElement(number,title,single=false){
    const root=document.createElement("div");
    root.className="s360-marker"+(single?" is-single":"");

    root.innerHTML=
        '<div class="s360-direction">'+
            '<div class="s360-cone"></div>'+
            '<div class="s360-arrow"></div>'+
        '</div>'+
        '<div class="s360-point">'+(number||"●")+'</div>'+
        '<div class="s360-label"></div>';

    root.querySelector(".s360-label").textContent=title||"";

    return {
        root:root,
        direction:root.querySelector(".s360-direction")
    };
}

function createSingleMarker(){
    const coordinate=getSingleCoordinate();
    if(!coordinate)return;

    const element=createMarkerElement("",coordinate.title,true);
    const position=new kakao.maps.LatLng(coordinate.lat,coordinate.lng);

    const overlay=new kakao.maps.CustomOverlay({
        position:position,
        content:element.root,
        xAnchor:.5,
        yAnchor:.5,
        zIndex:20
    });

    overlay.setMap(S360.map);

    S360.singleOverlay={
        overlay:overlay,
        direction:element.direction,
        position:position
    };

    S360.internalMapMove=true;
    S360.map.setCenter(position);
    S360.map.setLevel(
        S360.userMapLevel!==null
            ? S360.userMapLevel
            : S360_CFG.singleLevel
    );
    S360.internalMapMove=false;

    requestHeadingUpdate();
}

function createMultiMarkers(){
    S360.markerScenes.forEach(function(scene,index){
        const element=createMarkerElement(String(index+1),scene.title,false);
        const position=new kakao.maps.LatLng(scene.lat,scene.lng);

        const overlay=new kakao.maps.CustomOverlay({
            position:position,
            content:element.root,
            xAnchor:.5,
            yAnchor:.5,
            zIndex:10
        });

        element.root.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();

            highlightMenu(scene.name);
            loadScene(scene.name);
        });

        overlay.setMap(S360.map);

        const record={
            scene:scene,
            overlay:overlay,
            root:element.root,
            direction:element.direction,
            position:position
        };

        scene.overlayRecord=record;
        S360.overlays.push(record);
    });
}

function fitMultiBounds(){
    if(S360.markerScenes.length<2)return;

    const bounds=new kakao.maps.LatLngBounds();

    S360.markerScenes.forEach(function(scene){
        bounds.extend(new kakao.maps.LatLng(scene.lat,scene.lng));
    });

    S360.internalMapMove=true;
    S360.map.setBounds(bounds,45,45,45,45);

    /*
     * setBounds 애니메이션이 끝난 뒤 최초 축척을 저장합니다.
     * 이후 Scene 이동에서는 이 함수를 다시 호출하지 않습니다.
     */
    window.setTimeout(function(){
        S360.internalMapMove=false;
        S360.userMapLevel=S360.map.getLevel();
        S360.userMapCenter=S360.map.getCenter();
    },350);
}

function updateCurrentScene(){
    const sceneName=String(S360.krpano?.get("xml.scene")||"").trim();
    if(!sceneName)return;

    S360.currentScene=sceneName;

    /*
     * 메뉴 클릭뿐 아니라 krpano 화살표/핫스팟 이동도
     * 현재 Scene 또는 menu_parent에 맞춰 선택색을 유지합니다.
     */
    const activeMenuSceneName=
        resolveActiveMenuSceneName(sceneName);

    highlightMenu(activeMenuSceneName);

    if(S360.mode==="multi"){
        S360.overlays.forEach(function(record){
            const active=record.scene.name===activeMenuSceneName;

            record.root.classList.toggle("is-active",active);
            record.direction.style.display=active?"block":"none";
            record.overlay.setZIndex(active?30:10);
        });

        const scene=findScene(activeMenuSceneName);

        if(scene&&scene.overlayRecord){
            /*
             * 핵심:
             * 포인트 선택 시 setBounds()와 setLevel()을 호출하지 않습니다.
             * panTo()는 현재 확대 수준을 그대로 유지한 채
             * 선택 포인트로 중심만 이동합니다.
             */
            const keepLevel=S360.map.getLevel();

            S360.internalMapMove=true;
            S360.map.panTo(scene.overlayRecord.position);

            window.setTimeout(function(){
                /*
                 * 일부 모바일 브라우저에서 panTo 애니메이션 중
                 * 레벨이 변경되는 경우만 원래 값으로 복구합니다.
                 */
                if(S360.map.getLevel()!==keepLevel){
                    S360.map.setLevel(keepLevel);
                }

                S360.internalMapMove=false;
                S360.userMapLevel=keepLevel;
                S360.userMapCenter=S360.map.getCenter();
            },350);
        }
    }

    requestHeadingUpdate();
}

function requestHeadingUpdate(){
    if(S360.headingFrame)return;

    S360.headingFrame=true;

    requestAnimationFrame(function(){
        S360.headingFrame=false;
        updateHeading();
    });
}

function updateHeading(){
    const hlookat=Number(S360.krpano?.get("view.hlookat")||0);
    const scene=findScene(S360.currentScene);

    let degree=
        (hlookat*S360_CFG.headingSign)+
        (scene?scene.heading:0)+
        S360_CFG.headingOffset;

    degree%=360;
    if(degree<0)degree+=360;

    const transform=
        "translate(-50%,-50%) rotate("+
        degree+
        "deg)";

    if(S360.mode==="single"&&S360.singleOverlay){
        S360.singleOverlay.direction.style.transform=transform;
    }

    if(S360.mode==="multi"&&scene&&scene.overlayRecord){
        scene.overlayRecord.direction.style.transform=transform;
    }
}

function initializeMapResize(){
    if(S360.resizeReady)return;

    const wrapper=document.getElementById("krpano-minimap-wrapper");
    const handle=document.getElementById("map-resize-handle");

    if(!wrapper||!handle)return;

    S360.resizeReady=true;

    let active=false;
    let startX=0;
    let startY=0;
    let startWidth=0;
    let startHeight=0;

    handle.addEventListener("pointerdown",function(event){
        if(isMobile())return;

        event.preventDefault();
        active=true;
        startX=event.clientX;
        startY=event.clientY;

        const rect=wrapper.getBoundingClientRect();
        startWidth=rect.width;
        startHeight=rect.height;

        if(handle.setPointerCapture){
            handle.setPointerCapture(event.pointerId);
        }
    });

    window.addEventListener("pointermove",function(event){
        if(!active||isMobile())return;

        const nextWidth=Math.min(
            Math.max(
                startWidth-(event.clientX-startX),
                S360_CFG.desktopMap.minWidth
            ),
            window.innerWidth*S360_CFG.desktopMap.maxRatio
        );

        const nextHeight=Math.min(
            Math.max(
                startHeight-(event.clientY-startY),
                S360_CFG.desktopMap.minHeight
            ),
            window.innerHeight*S360_CFG.desktopMap.maxRatio
        );

        wrapper.style.width=Math.round(nextWidth)+"px";
        wrapper.style.height=Math.round(nextHeight)+"px";

        window.js_force_minimap_relayout();
    });

    function stopResize(){active=false}
    window.addEventListener("pointerup",stopResize);
    window.addEventListener("pointercancel",stopResize);
}

window.js_force_minimap_relayout=function(){
    if(!S360.map)return;

    /*
     * 패널 크기만 다시 계산하고 사용자가 설정한 확대 수준과
     * 중심 위치는 그대로 복원합니다.
     */
    const keepLevel=S360.map.getLevel();
    const keepCenter=S360.map.getCenter();

    requestAnimationFrame(function(){
        S360.internalMapMove=true;

        S360.map.relayout();
        S360.map.setCenter(keepCenter);

        if(S360.map.getLevel()!==keepLevel){
            S360.map.setLevel(keepLevel);
        }

        window.setTimeout(function(){
            S360.internalMapMove=false;
            S360.userMapLevel=S360.map.getLevel();
            S360.userMapCenter=S360.map.getCenter();
        },80);
    });
};

function bootstrapSuwon360(){
    syncMinimapHost();
    ensureMapCanvas();
    initializeMapResize();
    window.js_initialize_suwon360();
}

if(document.readyState==="loading"){
    document.addEventListener(
        "DOMContentLoaded",
        bootstrapSuwon360,
        {once:true}
    );
}else{
    bootstrapSuwon360();
}

window.addEventListener("resize",function(){
    syncMinimapHost();

    [0,120,320].forEach(function(delay){
        window.setTimeout(function(){
            window.js_force_minimap_relayout();
        },delay);
    });
});


/* 모바일 방향 전환 후 파노라마·지도 크기 재계산 */
window.addEventListener(
    "orientationchange",
    function(){
        [180,420,700].forEach(function(delay){
            window.setTimeout(function(){
                syncMinimapHost();

                if(typeof window.js_force_minimap_relayout==="function"){
                    window.js_force_minimap_relayout();
                }

                if(window.krpanoObj){
                    window.krpanoObj.call("updatescreen();");
                }

                /*
                 * 현재 선택 메뉴도 새 레이아웃에서 다시 보이도록 맞춤
                 */
                if(
                    typeof S360!=="undefined" &&
                    S360.activeMenuScene
                ){
                    scrollSelectedMenuIntoView(
                        S360.activeMenuScene
                    );
                }
            },delay);
        });
    },
    {passive:true}
);



/* ==========================================================
   PC 이동 화살표 Scene 제목 툴팁
========================================================== */
let s360TooltipMouseX=0;
let s360TooltipMouseY=0;
let s360TooltipLastHotspot="";
let s360TooltipFrame=0;

function getSceneTitleByName(sceneName){
    if(!sceneName||!window.krpanoObj)return "";

    const krpano=window.krpanoObj;
    const count=Number(krpano.get("scene.count"))||0;

    for(let i=0;i<count;i+=1){
        const prefix="scene["+i+"]";
        const name=String(krpano.get(prefix+".name")||"");

        if(name===sceneName){
            return String(
                krpano.get(prefix+".title")||
                sceneName
            ).trim();
        }
    }

    return sceneName;
}

function hideHotspotSceneTooltip(){
    const tooltip=document.getElementById(
        "hotspot-scene-tooltip"
    );

    if(!tooltip)return;

    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden","true");
    s360TooltipLastHotspot="";
}

function showHotspotSceneTooltip(
    hotspotName,
    linkedScene
){
    const tooltip=document.getElementById(
        "hotspot-scene-tooltip"
    );

    if(!tooltip)return;

    const title=getSceneTitleByName(linkedScene);

    if(!title){
        hideHotspotSceneTooltip();
        return;
    }

    if(s360TooltipLastHotspot!==hotspotName){
        tooltip.textContent=title;
        s360TooltipLastHotspot=hotspotName;
    }

    const margin=14;
    const width=tooltip.offsetWidth||120;
    const height=tooltip.offsetHeight||32;

    let left=s360TooltipMouseX+12;
    let top=s360TooltipMouseY+12;

    if(left+width+margin>window.innerWidth){
        left=s360TooltipMouseX-width-12;
    }

    if(top+height+margin>window.innerHeight){
        top=s360TooltipMouseY-height-12;
    }

    tooltip.style.left=Math.max(
        margin,
        left
    )+"px";

    tooltip.style.top=Math.max(
        margin,
        top
    )+"px";

    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden","false");
}

function watchHoveredKrpanoHotspot(){
    const krpano=window.krpanoObj;

    if(!krpano){
        s360TooltipFrame=requestAnimationFrame(
            watchHoveredKrpanoHotspot
        );
        return;
    }

    const count=Number(
        krpano.get("hotspot.count")
    )||0;

    let hoveredName="";
    let linkedScene="";

    for(let i=0;i<count;i+=1){
        const prefix="hotspot["+i+"]";
        const hovering=Boolean(
            krpano.get(prefix+".hovering")
        );

        if(!hovering)continue;

        const linked=String(
            krpano.get(prefix+".linkedscene")||""
        ).trim();

        /*
         * linkedscene이 있는 이동 화살표만 툴팁 표시
         */
        if(linked){
            hoveredName=String(
                krpano.get(prefix+".name")||i
            );
            linkedScene=linked;
            break;
        }
    }

    if(hoveredName&&linkedScene){
        showHotspotSceneTooltip(
            hoveredName,
            linkedScene
        );
    }else{
        hideHotspotSceneTooltip();
    }

    s360TooltipFrame=requestAnimationFrame(
        watchHoveredKrpanoHotspot
    );
}

document.addEventListener(
    "mousemove",
    function(event){
        s360TooltipMouseX=event.clientX;
        s360TooltipMouseY=event.clientY;
    },
    {passive:true}
);

window.addEventListener(
    "blur",
    hideHotspotSceneTooltip
);

document.addEventListener(
    "mouseleave",
    hideHotspotSceneTooltip
);

/* v49: PC도 상시 라벨을 사용하므로 hover 감시 루프는 실행하지 않습니다. */
if(s360TooltipFrame){
    cancelAnimationFrame(s360TooltipFrame);
    s360TooltipFrame=0;
}



/* ==========================================================
   모바일 화살표 터치 Scene 이름 표시
   - 기존 Scene 이동은 그대로 실행
   - 터치한 순간 이동 대상 이름을 약 1.4초 표시
========================================================== */
let s360MobileTooltipTimer=0;

function findTouchedLinkedScene(){
    const krpano=window.krpanoObj;
    if(!krpano)return null;

    const count=Number(
        krpano.get("hotspot.count")
    )||0;

    for(let i=0;i<count;i+=1){
        const prefix="hotspot["+i+"]";
        const hovering=Boolean(
            krpano.get(prefix+".hovering")
        );

        if(!hovering)continue;

        const linkedScene=String(
            krpano.get(prefix+".linkedscene")||""
        ).trim();

        if(!linkedScene)continue;

        return {
            hotspotName:String(
                krpano.get(prefix+".name")||i
            ),
            linkedScene:linkedScene
        };
    }

    return null;
}

function showMobileHotspotSceneTitle(
    clientX,
    clientY
){
    const result=findTouchedLinkedScene();
    if(!result)return false;

    s360TooltipMouseX=clientX;
    s360TooltipMouseY=clientY;

    showHotspotSceneTooltip(
        result.hotspotName,
        result.linkedScene
    );

    window.clearTimeout(
        s360MobileTooltipTimer
    );

    s360MobileTooltipTimer=
        window.setTimeout(
            hideHotspotSceneTooltip,
            1400
        );

    return true;
}

function handleMobileHotspotTouch(event){
    if(
        !window.matchMedia("(pointer:coarse)").matches &&
        window.innerWidth>768
    ){
        return;
    }

    const touch=
        event.touches&&event.touches[0]
            ? event.touches[0]
            : event.changedTouches&&event.changedTouches[0]
                ? event.changedTouches[0]
                : null;

    if(!touch)return;

    /*
     * krpano가 hovering 값을 설정하는 시간차를 고려해
     * 터치 직후 세 차례 확인합니다.
     */
    [0,35,90].forEach(function(delay){
        window.setTimeout(function(){
            showMobileHotspotSceneTitle(
                touch.clientX,
                touch.clientY
            );
        },delay);
    });
}

document.addEventListener(
    "touchstart",
    handleMobileHotspotTouch,
    {passive:true}
);



/* ==========================================================
   v44 모바일 이동 화살표 Scene 이름 상시 표시
   - 화살표가 화면에 보이는 동안 이름도 계속 표시
   - 화살표를 클릭해 Scene이 바뀌면 새 Scene 기준으로 자동 재생성
========================================================== */
let s360MobileLabelFrame=0;
let s360MobileLabelScene="";
const s360MobileLabelElements=new Map();

function isS360HotspotLabelEnabled(){
    return true;
}

function clearMobileHotspotLabels(){
    const layer=document.getElementById(
        "mobile-hotspot-label-layer"
    );

    if(layer){
        layer.replaceChildren();
    }

    s360MobileLabelElements.clear();
    s360MobileLabelScene="";
}

function buildMobileHotspotLabels(){
    if(!isS360HotspotLabelEnabled())return;

    const krpano=window.krpanoObj;
    const layer=document.getElementById(
        "mobile-hotspot-label-layer"
    );

    if(!krpano||!layer)return;

    const sceneName=String(
        krpano.get("xml.scene")||""
    );

    if(sceneName===s360MobileLabelScene &&
       s360MobileLabelElements.size>0){
        return;
    }

    clearMobileHotspotLabels();
    s360MobileLabelScene=sceneName;

    const count=Number(
        krpano.get("hotspot.count")
    )||0;

    for(let i=0;i<count;i+=1){
        const prefix="hotspot["+i+"]";
        const linkedScene=String(
            krpano.get(prefix+".linkedscene")||""
        ).trim();

        if(!linkedScene)continue;

        const hotspotName=String(
            krpano.get(prefix+".name")||i
        );

        const title=getSceneTitleByName(
            linkedScene
        );

        if(!title)continue;

        const label=document.createElement("div");
        label.className="mobile-hotspot-scene-label";
        label.textContent=title;
        label.dataset.hotspotName=hotspotName;

        layer.appendChild(label);

        s360MobileLabelElements.set(
            hotspotName,
            {
                element:label,
                index:i,
                missedFrames:0
            }
        );
    }
}

function getHotspotScreenPoint(
    krpano,
    ath,
    atv
){
    if(
        !krpano ||
        typeof krpano.spheretoscreen!=="function"
    ){
        return null;
    }

    try{
        const point=krpano.spheretoscreen(
            Number(ath),
            Number(atv)
        );

        if(
            point &&
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))
        ){
            return {
                x:Number(point.x),
                y:Number(point.y)
            };
        }
    }catch(error){
        return null;
    }

    return null;
}

function updateMobileHotspotLabels(){
    if(!isS360HotspotLabelEnabled()){
        clearMobileHotspotLabels();
        s360MobileLabelFrame=requestAnimationFrame(
            updateMobileHotspotLabels
        );
        return;
    }

    const krpano=window.krpanoObj;
    const pano=document.getElementById("pano");
    const layer=document.getElementById(
        "mobile-hotspot-label-layer"
    );

    if(!krpano||!pano||!layer){
        s360MobileLabelFrame=requestAnimationFrame(
            updateMobileHotspotLabels
        );
        return;
    }

    buildMobileHotspotLabels();

    /*
     * 라벨 레이어를 실제 파노라마 영역과 정확히 일치시킵니다.
     */
    layer.style.left=pano.offsetLeft+"px";
    layer.style.top=pano.offsetTop+"px";
    layer.style.width=pano.clientWidth+"px";
    layer.style.height=pano.clientHeight+"px";
    layer.style.right="auto";
    layer.style.bottom="auto";

    const panoWidth=pano.clientWidth;
    const panoHeight=pano.clientHeight;
    const edgeMargin=24;

    s360MobileLabelElements.forEach(function(
        data
    ){
        const prefix="hotspot["+data.index+"]";
        const visible=String(
            krpano.get(prefix+".visible")
        )!=="false";

        const alpha=Number(
            krpano.get(prefix+".alpha")
        );

        const ath=Number(
            krpano.get(prefix+".ath")
        );
        const atv=Number(
            krpano.get(prefix+".atv")
        );

        const point=getHotspotScreenPoint(
            krpano,
            ath,
            atv
        );

        const usable=
            visible &&
            (Number.isNaN(alpha)||alpha>0.05) &&
            point &&
            point.x>=-edgeMargin &&
            point.x<=panoWidth+edgeMargin &&
            point.y>=-edgeMargin &&
            point.y<=panoHeight+edgeMargin;

        if(!usable){
            data.missedFrames=(data.missedFrames||0)+1;

            /*
             * 회전·리사이즈 중 좌표가 잠깐 유효하지 않아도
             * 18프레임 동안은 기존 라벨을 유지해 깜빡임을 막습니다.
             */
            if(data.missedFrames>36){
                data.element.classList.remove(
                    "is-visible"
                );
            }
            return;
        }

        data.missedFrames=0;
        data.element.style.left=point.x+"px";
        data.element.style.top=point.y+"px";
        data.element.classList.add(
            "is-visible"
        );
    });

    s360MobileLabelFrame=requestAnimationFrame(
        updateMobileHotspotLabels
    );
}

/*
 * Scene 이동 직후 기존 이름을 지우고 새 화살표 이름을 생성합니다.
 */
window.addEventListener(
    "s360-scene-changed",
    clearMobileHotspotLabels
);

window.addEventListener(
    "resize",
    function(){
        s360MobileLabelScene="";
    },
    {passive:true}
);

if(!s360MobileLabelFrame){
    s360MobileLabelFrame=requestAnimationFrame(
        updateMobileHotspotLabels
    );
}


/* ==========================================================
   최종 PC·모바일 화살표 씬명 고정 말풍선
   - 자동 생성 XML 수정 없이 동작
   - 화살표가 화면에 나타나면 씬명을 계속 표시
   - 화살표 부모의 축소·기울기 행렬을 매 프레임 역보정
========================================================== */
(function(){
    "use strict";

    const records = new Map();
    let scanTimer = 0;
    let animationFrame = 0;

    function getKrpanoForLabels(){
        return (
            window.krpanoObj ||
            document.getElementById("pano")?.krpano ||
            null
        );
    }

    function getSceneLabelTitle(krpano, linkedScene){
        if(!linkedScene)return "";

        if(typeof getSceneTitleByName === "function"){
            const knownTitle = getSceneTitleByName(linkedScene);
            if(knownTitle)return String(knownTitle).trim();
        }

        try{
            const title = krpano.get(
                "scene[" + linkedScene + "].title"
            );

            if(title && String(title).trim()){
                return String(title).trim();
            }
        }catch(error){
            // 아래의 씬 이름 변환값 사용
        }

        return String(linkedScene)
            .replace(/^scene[_-]?/i, "")
            .replace(/[_-]+/g, " ")
            .trim();
    }

    function getHotspotSprite(krpano, hotspot, index){
        return (
            hotspot?.sprite ||
            krpano.get("hotspot[" + index + "].sprite") ||
            null
        );
    }

    /*
     * 부모 화살표 sprite의 위치 이동값은 제외하고,
     * 회전·기울기·축소값만 역행렬로 변환합니다.
     */
    function getInverseParentVisualMatrix(sprite){
        try{
            const transform = getComputedStyle(sprite).transform;

            if(!transform || transform === "none"){
                return "";
            }

            const matrix = new DOMMatrixReadOnly(transform);

            const visualOnly = new DOMMatrix([
                matrix.m11, matrix.m12, matrix.m13, matrix.m14,
                matrix.m21, matrix.m22, matrix.m23, matrix.m24,
                matrix.m31, matrix.m32, matrix.m33, matrix.m34,
                0,          0,          0,          matrix.m44
            ]);

            return visualOnly.inverse().toString();
        }catch(error){
            return "";
        }
    }

    function mobileLabelOffset(){
        const mobile =
            document.documentElement.classList.contains("s360-mobile") ||
            window.innerWidth <= 768 ||
            matchMedia("(pointer:coarse)").matches;

        /*
         * 라벨을 화살표보다 충분히 위로 올려
         * 이동 화살표의 모양과 클릭 영역을 가리지 않습니다.
         * 모바일은 PC보다 18px 더 위로 배치합니다.
         */
        return mobile ? 92 : 44;
    }

    function applyLabelVisual(record){
        const {sprite, label} = record;

        if(!sprite?.isConnected || !label?.isConnected){
            return false;
        }

        const inverseMatrix = getInverseParentVisualMatrix(sprite);

        label.style.setProperty(
            "transform",
            "translate(-50%, calc(-100% - " + (mobileLabelOffset()) + "px)) " + inverseMatrix,
            "important"
        );

        /*
         * 다른 CSS와 브라우저 캐시의 영향을 받지 않도록
         * 최종 크기 값을 인라인으로도 확정합니다.
         */
        const mobile =
            document.documentElement.classList.contains("s360-mobile") ||
            window.innerWidth <= 768 ||
            matchMedia("(pointer:coarse)").matches;

        label.style.setProperty(
            "font-size",
            mobile ? "13px" : "14px",
            "important"
        );

        label.style.setProperty(
            "padding",
            mobile ? "7px 13px" : "7px 14px",
            "important"
        );

        label.style.setProperty(
            "border-radius",
            "4px",
            "important"
        );

        label.style.setProperty("display","block","important");
        label.style.setProperty("visibility","visible","important");
        label.style.setProperty("opacity","1","important");

        return true;
    }

    function attachPermanentLabel(krpano, hotspot, index){
        if(!hotspot)return;

        const linkedScene = String(
            hotspot.linkedscene ||
            krpano.get("hotspot[" + index + "].linkedscene") ||
            ""
        ).trim();

        if(!linkedScene)return;

        /*
         * DOM 자식 말풍선을 붙일 수 있도록 화살표 renderer를 CSS3D로 전환합니다.
         * linkedscene과 기존 클릭 이동 기능은 그대로 유지됩니다.
         */
        if(String(hotspot.renderer || "").toLowerCase() !== "css3d"){
            try{
                hotspot.renderer = "css3d";
            }catch(error){
                try{
                    krpano.set(
                        "hotspot[" + index + "].renderer",
                        "css3d"
                    );
                }catch(ignore){}
            }
            return;
        }

        const sprite = getHotspotSprite(
            krpano,
            hotspot,
            index
        );

        if(!sprite || !(sprite instanceof HTMLElement)){
            return;
        }

        sprite.style.setProperty(
            "overflow",
            "visible",
            "important"
        );

        const title = getSceneLabelTitle(
            krpano,
            linkedScene
        );

        if(!title)return;

        let label = sprite.querySelector(
            ":scope > .s360-arrow-scene-label"
        );

        if(!label){
            label = document.createElement("div");
            label.className = "s360-arrow-scene-label";
            label.setAttribute("aria-hidden","true");
            sprite.appendChild(label);
        }

        if(label.textContent !== title){
            label.textContent = title;
        }

        const key =
            String(hotspot.name || index) +
            "::" +
            linkedScene;

        records.set(key,{
            sprite,
            label
        });

        applyLabelVisual({
            sprite,
            label
        });
    }

    function scanArrowHotspots(){
        const krpano = getKrpanoForLabels();
        if(!krpano)return;

        const count = Number(
            krpano.get("hotspot.count")
        ) || 0;

        for(let index=0; index<count; index+=1){
            let hotspot;

            try{
                hotspot = krpano.get(
                    "hotspot[" + index + "]"
                );
            }catch(error){
                continue;
            }

            attachPermanentLabel(
                krpano,
                hotspot,
                index
            );
        }

        try{
            krpano.call("updatescreen();");
        }catch(error){
            // 다음 스캔에서 다시 처리
        }
    }

    function updateLabelTransforms(){
        records.forEach(function(record,key){
            if(!applyLabelVisual(record)){
                records.delete(key);
            }
        });

        animationFrame = requestAnimationFrame(
            updateLabelTransforms
        );
    }

    function scheduleLabelScan(){
        clearTimeout(scanTimer);

        [0,80,200,450,850,1400].forEach(function(delay){
            setTimeout(
                scanArrowHotspots,
                delay
            );
        });

        /*
         * 씬 전환으로 hotspot DOM이 재생성되어도 자동 복구합니다.
         */
        scanTimer = setTimeout(
            scheduleLabelScan,
            1600
        );
    }

    window.addEventListener(
        "load",
        scheduleLabelScan,
        {once:true}
    );

    window.addEventListener(
        "resize",
        scheduleLabelScan,
        {passive:true}
    );

    window.addEventListener(
        "orientationchange",
        scheduleLabelScan,
        {passive:true}
    );

    window.addEventListener(
        "s360-scene-changed",
        function(){
            records.clear();
            scheduleLabelScan();
        }
    );

    if(!animationFrame){
        animationFrame = requestAnimationFrame(
            updateLabelTransforms
        );
    }

    setTimeout(
        scheduleLabelScan,
        300
    );
})();



/* v73 PC 상단 가로 메뉴 좌우 이동 */
window.js_scroll_pc_menu=function(direction){
    const menu=document.getElementById("pc-menu");
    if(!menu)return;

    const amount=Math.max(240,Math.round(menu.clientWidth*0.72));
    menu.scrollBy({
        left:(direction<0?-amount:amount),
        behavior:"smooth"
    });
};
