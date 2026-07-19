const params=new URLSearchParams(location.search);
const requestedTour=params.get("tour");
const tourKey=/^[a-zA-Z0-9_-]+$/.test(requestedTour||"")
    ? requestedTour
    : "";
window.SUWON360_TOUR_KEY=tourKey;

if(tourKey){
    embedpano({
        xml:"./suwon_tour/" + tourKey + ".xml",
        target:"pano",
        html5:"auto",
        mobilescale:1.0,
        cors:"anonymous",
        passQueryParameters:"startscene,startlookat",
        onready:function(k){
            window.krpanoObj=k;

            if(typeof window.js_initialize_suwon360==="function"){
                window.js_initialize_suwon360();
            }

            window.setTimeout(function(){
                js_set_mobile_initial_split();

                if(typeof window.js_force_minimap_relayout==="function"){
                    window.js_force_minimap_relayout();
                }
            },250);

            window.setTimeout(function(){
                js_set_mobile_initial_split();
            },700);
        }
    });
}else{
    document.getElementById("vr-overlay-container").style.display="none";
    document.getElementById("tour-error-message").style.display="flex";
}

function js_close_vr_tour(){
    if(!confirm("수원360°투어를 종료하시겠습니까?"))return;
    if(history.length>1)history.back(); else window.close();
}

async function js_share_tour(){
    if(!window.SUWON360_TOUR_KEY)return;
    const u=new URL(location.pathname,location.origin);
    u.searchParams.set("tour",window.SUWON360_TOUR_KEY);
    const t=document.getElementById("tour-content-title").textContent.trim()||"수원360°투어";
    try{
        if(navigator.share){
            await navigator.share({title:"수원360°투어 │ "+t,url:u.toString()});
            return;
        }
        await navigator.clipboard.writeText(u.toString());
        js_show_share_toast("링크가 복사되었습니다.");
    }catch(error){
        if(!error||error.name!=="AbortError")prompt("아래 주소를 복사해 주세요.",u.toString());
    }
}

let shareToastTimer=null;
function js_show_share_toast(message){
    const toast=document.getElementById("share-toast");
    if(!toast)return;
    toast.textContent=message;
    toast.classList.add("is-visible");
    clearTimeout(shareToastTimer);
    shareToastTimer=setTimeout(function(){toast.classList.remove("is-visible");},2200);
}

function js_go_first_scene(){
    if(typeof window.js_load_first_scene==="function"){
        window.js_load_first_scene();
        return;
    }
    const k=window.krpanoObj;
    const first=k ? k.get("scene[0].name") : "";
    if(first)k.call("loadscene("+first+",null,MERGE,BLEND(0.7));");
}

window.js_close_vr_tour=js_close_vr_tour;
window.js_share_tour=js_share_tour;
window.js_go_first_scene=js_go_first_scene;
