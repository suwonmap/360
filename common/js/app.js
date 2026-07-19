let s360ViewportMaxHeight=0;
let s360ViewportOrientation="";

function js_update_visual_viewport(){
    const viewport=window.visualViewport;

    const viewportHeight=viewport
        ? viewport.height
        : window.innerHeight;

    const viewportOffsetTop=viewport
        ? viewport.offsetTop
        : 0;

    const orientationKey=
        window.innerWidth>window.innerHeight
            ? "landscape"
            : "portrait";

    /*
     * 화면 방향이 바뀌면 최대 높이 기준을 새로 설정합니다.
     */
    if(s360ViewportOrientation!==orientationKey){
        s360ViewportOrientation=orientationKey;
        s360ViewportMaxHeight=viewportHeight;
    }

    /*
     * 주소창이 접힌 상태의 가장 큰 viewport 높이를 기억합니다.
     */
    if(viewportHeight>s360ViewportMaxHeight){
        s360ViewportMaxHeight=viewportHeight;
    }

    /*
     * 일부 모바일 브라우저는 주소창이 나타나도 offsetTop이 0입니다.
     * 따라서 최대 높이와 현재 높이의 차이를 주소창 높이 후보로 사용합니다.
     */
    const viewportLoss=Math.max(
        0,
        s360ViewportMaxHeight-viewportHeight
    );

    /*
     * 하단 브라우저 바나 일시적인 작은 변화가 과도하게 반영되지 않도록
     * 상단 이동값은 최대 110px로 제한합니다.
     */
    const browserUiTop=Math.min(
        110,
        Math.max(
            viewportOffsetTop,
            viewportLoss
        )
    );

    document.documentElement.style.setProperty(
        "--app-height",
        Math.round(viewportHeight)+"px"
    );

    document.documentElement.style.setProperty(
        "--viewport-top",
        Math.round(viewportOffsetTop)+"px"
    );

    document.documentElement.style.setProperty(
        "--browser-ui-top",
        Math.round(browserUiTop)+"px"
    );

    /*
     * 컨테이너 자체는 중복 이동시키지 않고 높이만 실제 화면에 맞춥니다.
     * 상단 UI와 가로모드 패널은 --browser-ui-top으로 별도 이동합니다.
     */
    const root=document.getElementById(
        "vr-overlay-container"
    );

    if(root){
        root.style.top="0px";
        root.style.height=Math.round(
            viewportHeight
        )+"px";
    }

    if(typeof window.js_force_minimap_relayout==="function"){
        window.setTimeout(
            window.js_force_minimap_relayout,
            80
        );
    }

    if(window.krpanoObj){
        window.setTimeout(function(){
            window.krpanoObj.call(
                "updatescreen();"
            );
        },80);
    }
}

js_update_visual_viewport();

window.addEventListener(
    "resize",
    js_update_visual_viewport,
    {passive:true}
);

window.addEventListener(
    "orientationchange",
    function(){
        s360ViewportMaxHeight=0;
        s360ViewportOrientation="";

        [120,320,650].forEach(function(delay){
            window.setTimeout(
                js_update_visual_viewport,
                delay
            );
        });
    },
    {passive:true}
);

if(window.visualViewport){
    window.visualViewport.addEventListener(
        "resize",
        js_update_visual_viewport,
        {passive:true}
    );

    window.visualViewport.addEventListener(
        "scroll",
        js_update_visual_viewport,
        {passive:true}
    );
}

/* ==========================================================
   모바일 하단 레이아웃 상태관리
========================================================== */

function js_is_mobile_ui(){
    return document.documentElement.classList.contains("s360-mobile");
}

const MOBILE_LAYOUT = Object.freeze({
    SPLIT: "split",
    MENU: "menu",
    MAP: "map",
    HIDDEN: "hidden"
});

let mobileLayoutState = MOBILE_LAYOUT.SPLIT;

function js_apply_mobile_layout(nextState){
    const root=document.getElementById("vr-overlay-container");
    const panel=document.getElementById("bottom-panel");
    const menuPane=document.getElementById("bottom-menu-pane");
    const mapPane=document.getElementById("bottom-map-pane");
    const menuButton=document.getElementById("menu-pane-collapse");
    const mapButton=document.getElementById("map-pane-collapse");
    const pano=document.getElementById("pano");

    if(!root||!panel||!menuPane||!mapPane)return;

    if(!Object.values(MOBILE_LAYOUT).includes(nextState)){
        nextState=MOBILE_LAYOUT.SPLIT;
    }

    mobileLayoutState=nextState;
    panel.dataset.layout=nextState;

    panel.classList.remove(
        "menu-hidden",
        "map-hidden",
        "map-expanded",
        "both-hidden"
    );

    root.classList.toggle(
        "mobile-layout-hidden",
        nextState===MOBILE_LAYOUT.HIDDEN
    );

    if(js_is_mobile_ui()){
        panel.style.display=
            nextState===MOBILE_LAYOUT.HIDDEN
                ? "none"
                : "grid";
        panel.style.visibility=
            nextState===MOBILE_LAYOUT.HIDDEN
                ? "hidden"
                : "visible";
        panel.style.position="absolute";
        panel.style.left="0";
        panel.style.right="0";
        panel.style.bottom="0";
        panel.style.width="100%";
        panel.style.height="35%";
        panel.style.overflow="hidden";

        if(nextState===MOBILE_LAYOUT.SPLIT){
            panel.style.gridTemplateColumns=
                window.innerWidth<=430
                    ? "42% 58%"
                    : "45% 55%";

            panel.style.setProperty("transform","none","important");
            panel.style.pointerEvents="auto";

            menuPane.style.display="block";
            mapPane.style.display="block";
        }else if(nextState===MOBILE_LAYOUT.MENU){
            panel.style.gridTemplateColumns="100%";
            panel.style.setProperty("transform","none","important");
            panel.style.pointerEvents="auto";

            menuPane.style.display="block";
            mapPane.style.display="none";
        }else if(nextState===MOBILE_LAYOUT.MAP){
            panel.style.gridTemplateColumns="100%";
            panel.style.setProperty("transform","none","important");
            panel.style.pointerEvents="auto";

            menuPane.style.display="none";
            mapPane.style.display="block";
        }else{
            panel.style.setProperty(
                "transform",
                document.documentElement.classList.contains("s360-landscape")
                    ? "translateX(100%)"
                    : "translateY(100%)",
                "important"
            );
            panel.style.pointerEvents="none";

            menuPane.style.display="none";
            mapPane.style.display="none";
        }

        if(pano){
            const landscape=
                document.documentElement.classList.contains("s360-landscape") ||
                window.innerWidth>window.innerHeight;

            pano.style.setProperty("left","0px","important");
            pano.style.setProperty("top","0px","important");
            pano.style.setProperty(
                "width",
                nextState===MOBILE_LAYOUT.HIDDEN
                    ? "100%"
                    : (landscape ? "65%" : "100%"),
                "important"
            );
            pano.style.setProperty(
                "height",
                nextState===MOBILE_LAYOUT.HIDDEN
                    ? "100%"
                    : (landscape ? "100%" : "65%"),
                "important"
            );
        }

        if(menuButton){
            menuButton.style.display=
                nextState===MOBILE_LAYOUT.MAP ||
                nextState===MOBILE_LAYOUT.HIDDEN
                    ? "none"
                    : "flex";
        }

        if(mapButton){
            mapButton.style.display=
                nextState===MOBILE_LAYOUT.MENU ||
                nextState===MOBILE_LAYOUT.HIDDEN
                    ? "none"
                    : "flex";
        }
    }

    window.setTimeout(function(){
        if(
            nextState!==MOBILE_LAYOUT.HIDDEN &&
            typeof window.js_force_minimap_relayout==="function"
        ){
            window.js_force_minimap_relayout();
        }

        window.dispatchEvent(new Event("resize"));

        if(window.krpanoObj){
            window.krpanoObj.call("updatescreen();");
        }
    },180);
}

function js_set_mobile_initial_split(){
    if(js_is_mobile_ui()){
        js_apply_mobile_layout(MOBILE_LAYOUT.SPLIT);
    }
}

function js_hide_mobile_menu_pane(){
    if(mobileLayoutState===MOBILE_LAYOUT.MENU){
        js_apply_mobile_layout(MOBILE_LAYOUT.SPLIT);
    }else{
        js_apply_mobile_layout(MOBILE_LAYOUT.MAP);
    }
}

function js_hide_mobile_map_pane(){
    if(mobileLayoutState===MOBILE_LAYOUT.MAP){
        js_apply_mobile_layout(MOBILE_LAYOUT.SPLIT);
    }else{
        js_apply_mobile_layout(MOBILE_LAYOUT.MENU);
    }
}

function js_toggle_mobile_menu_pane(){
    js_hide_mobile_menu_pane();
}

function js_toggle_mobile_map_pane(){
    js_hide_mobile_map_pane();
}

function js_hide_mobile_all(){
    if(js_is_mobile_ui()){
        js_apply_mobile_layout(MOBILE_LAYOUT.HIDDEN);
    }
}

function js_restore_mobile_split(){
    js_apply_mobile_layout(MOBILE_LAYOUT.SPLIT);
}

function js_expand_mobile_map_after_scene_select(){
    if(!js_is_mobile_ui())return;

    /*
     * 메뉴를 선택해도 현재 하단 레이아웃을 그대로 유지합니다.
     *
     * SPLIT 상태  → 메뉴 + 지도 좌우 분할 유지
     * MENU 상태   → 메뉴 전체폭 유지
     * MAP 상태    → 지도 전체폭 유지
     * HIDDEN 상태 → 전체 숨김 유지
     */
    js_apply_mobile_layout(mobileLayoutState);
}

function js_get_mobile_layout_state(){
    return mobileLayoutState;
}


function js_force_initial_mobile_split(){
    if(js_is_mobile_ui()){
        js_set_mobile_initial_split();

        window.setTimeout(function(){
            js_set_mobile_initial_split();
        },250);
    }
}

if(document.readyState==="loading"){
    document.addEventListener(
        "DOMContentLoaded",
        js_force_initial_mobile_split,
        {once:true}
    );
}else{
    js_force_initial_mobile_split();
}

window.addEventListener("pageshow",function(){
    js_force_initial_mobile_split();
});


/* 모바일 주소창 전환 시 한 번 더 위치를 확정 */
if(window.visualViewport){
    ["resize","scroll"].forEach(function(eventName){
        window.visualViewport.addEventListener(
            eventName,
            function(){
                window.requestAnimationFrame(
                    js_update_visual_viewport
                );

                window.setTimeout(
                    js_update_visual_viewport,
                    120
                );
            },
            {passive:true}
        );
    });
}

window.js_hide_mobile_menu_pane=js_hide_mobile_menu_pane;
window.js_toggle_mobile_menu_pane=js_toggle_mobile_menu_pane;
window.js_hide_mobile_map_pane=js_hide_mobile_map_pane;
window.js_toggle_mobile_map_pane=js_toggle_mobile_map_pane;
window.js_apply_mobile_layout=js_apply_mobile_layout;
window.js_set_mobile_initial_split=js_set_mobile_initial_split;
window.js_hide_mobile_all=js_hide_mobile_all;
window.js_restore_mobile_split=js_restore_mobile_split;
window.js_expand_mobile_map_after_scene_select=js_expand_mobile_map_after_scene_select;
window.js_get_mobile_layout_state=js_get_mobile_layout_state;
window.js_expand_mobile_map_after_scene_select=js_expand_mobile_map_after_scene_select;
window.js_set_mobile_initial_split=js_set_mobile_initial_split;


/* ==========================================================
   v48 모바일 방향전환 단일 컨트롤러
========================================================== */
(function(){
    let timer=0;
    let lastLandscape=null;

    function isMobileLayout(){
        return document.documentElement.classList.contains("s360-mobile");
    }

    function visibleSize(){
        const viewport=window.visualViewport;
        return {
            width:Math.round(viewport ? viewport.width : window.innerWidth),
            height:Math.round(viewport ? viewport.height : window.innerHeight)
        };
    }

    function applyMobileOrientation(){
        if(!isMobileLayout())return;

        const html=document.documentElement;
        const size=visibleSize();
        const landscape=size.width>size.height;

        html.classList.toggle("s360-landscape",landscape);
        html.classList.toggle("s360-portrait",!landscape);
        html.style.setProperty("--s360-visible-height",size.height+"px");

        /*
         * 이전 버전에서 남았을 수 있는 상단 이동 변수는 사용하지 않습니다.
         */
        html.style.setProperty("--browser-ui-top","0px");
        html.style.setProperty("--viewport-top","0px");

        const root=document.getElementById("vr-overlay-container");
        const pano=document.getElementById("pano");
        const panel=document.getElementById("bottom-panel");
        const title=document.getElementById("tour-information");
        const actions=document.getElementById("top-action-buttons");

        if(root){
            root.style.setProperty("top","0px","important");
            root.style.setProperty("height",size.height+"px","important");
            root.style.setProperty("width",size.width+"px","important");
            root.style.setProperty("transform","none","important");
        }

        if(landscape){
            const panoWidth=Math.round(size.width*0.65);
            const panelWidth=size.width-panoWidth;

            const hidden = mobileLayoutState===MOBILE_LAYOUT.HIDDEN;

            if(pano){
                pano.style.setProperty("left","0px","important");
                pano.style.setProperty("top","0px","important");
                pano.style.setProperty("width",hidden ? size.width+"px" : panoWidth+"px","important");
                pano.style.setProperty("height",size.height+"px","important");
                pano.style.setProperty("transform","none","important");
            }

            if(panel){
                panel.style.setProperty("display",hidden ? "none" : "grid","important");
                panel.style.setProperty("visibility",hidden ? "hidden" : "visible","important");
                panel.style.setProperty("left",panoWidth+"px","important");
                panel.style.setProperty("top","0px","important");
                panel.style.setProperty("width",panelWidth+"px","important");
                panel.style.setProperty("height",size.height+"px","important");
                panel.style.setProperty(
                    "transform",
                    hidden ? "translateX(100%)" : "none",
                    "important"
                );
                panel.style.pointerEvents=hidden ? "none" : "auto";
            }

            if(title){
                title.style.setProperty("left","8px","important");
                title.style.setProperty(
                    "top",
                    "calc(8px + env(safe-area-inset-top))",
                    "important"
                );
                title.style.setProperty("bottom","auto","important");
                title.style.setProperty("transform","none","important");
            }

            if(actions){
                actions.style.setProperty(
                    "top",
                    "calc(8px + env(safe-area-inset-top))",
                    "important"
                );
                actions.style.setProperty(
                    "right",
                    (panelWidth+8)+"px",
                    "important"
                );
                actions.style.setProperty("bottom","auto","important");
                actions.style.setProperty("transform","none","important");
            }
        }else{
            const panoHeight=Math.round(size.height*0.65);
            const panelHeight=size.height-panoHeight;

            const hidden = mobileLayoutState===MOBILE_LAYOUT.HIDDEN;

            if(pano){
                pano.style.setProperty("left","0px","important");
                pano.style.setProperty("top","0px","important");
                pano.style.setProperty("width",size.width+"px","important");
                pano.style.setProperty("height",hidden ? size.height+"px" : panoHeight+"px","important");
                pano.style.setProperty("transform","none","important");
            }

            if(panel){
                panel.style.setProperty("display",hidden ? "none" : "grid","important");
                panel.style.setProperty("visibility",hidden ? "hidden" : "visible","important");
                panel.style.setProperty("left","0px","important");
                panel.style.setProperty("top",panoHeight+"px","important");
                panel.style.setProperty("width",size.width+"px","important");
                panel.style.setProperty("height",panelHeight+"px","important");
                panel.style.setProperty(
                    "transform",
                    hidden ? "translateY(100%)" : "none",
                    "important"
                );
                panel.style.pointerEvents=hidden ? "none" : "auto";
            }

            if(title){
                title.style.setProperty("left","8px","important");
                title.style.setProperty(
                    "top",
                    "calc(8px + env(safe-area-inset-top))",
                    "important"
                );
                title.style.setProperty("right","auto","important");
                title.style.setProperty("bottom","auto","important");
                title.style.setProperty("transform","none","important");
            }

            if(actions){
                actions.style.setProperty(
                    "top",
                    "calc(8px + env(safe-area-inset-top))",
                    "important"
                );
                actions.style.setProperty(
                    "right",
                    "10px",
                    "important"
                );
                actions.style.setProperty("left","auto","important");
                actions.style.setProperty("bottom","auto","important");
                actions.style.setProperty("transform","none","important");
            }
        }

        requestAnimationFrame(function(){
            if(window.krpanoObj){
                try{
                    window.krpanoObj.call("updatescreen();");
                }catch(error){}
            }

            if(typeof window.js_force_minimap_relayout==="function"){
                window.js_force_minimap_relayout();
            }
        });

        lastLandscape=landscape;
    }

    function scheduleApply(){
        clearTimeout(timer);
        applyMobileOrientation();
        timer=window.setTimeout(applyMobileOrientation,160);
        window.setTimeout(applyMobileOrientation,420);
    }

    window.addEventListener("load",scheduleApply,{once:true});
    window.addEventListener("resize",scheduleApply,{passive:true});
    window.addEventListener("orientationchange",scheduleApply,{passive:true});

    if(screen.orientation){
        screen.orientation.addEventListener("change",scheduleApply);
    }

    if(window.visualViewport){
        window.visualViewport.addEventListener("resize",scheduleApply,{passive:true});
    }
})();
