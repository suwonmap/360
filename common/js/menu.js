/* 모바일 가로회전 후 검은 여백 방지용 화면 재계산 */
window.addEventListener(
    "orientationchange",
    function(){
        [100,260,520,900].forEach(function(delay){
            window.setTimeout(function(){
                const root=document.getElementById(
                    "vr-overlay-container"
                );
                const pano=document.getElementById("pano");

                if(
                    window.matchMedia(
                        "(orientation: landscape) and (pointer: coarse)"
                    ).matches
                ){
                    if(root){
                        root.style.top="0px";
                        root.style.bottom="0px";
                        root.style.height="100dvh";
                    }

                    if(pano){
                        pano.style.top="0px";
                        pano.style.bottom="0px";
                        pano.style.height="auto";
                    }
                }

                if(typeof window.js_force_minimap_relayout==="function"){
                    window.js_force_minimap_relayout();
                }

                if(window.krpanoObj){
                    window.krpanoObj.call("updatescreen();");
                }
            },delay);
        });
    },
    {passive:true}
);


/* ===== 모바일 환경 감지 ===== */
(function(){
    function detectMobileUi(){
        const touchDevice =
            navigator.maxTouchPoints > 0 ||
            "ontouchstart" in window;

        const mobileWidth =
            window.matchMedia("(max-width: 1024px)").matches;

        document.documentElement.classList.toggle(
            "s360-mobile",
            (touchDevice && mobileWidth) || window.matchMedia("(max-width: 768px)").matches
        );
    }

    detectMobileUi();

    window.addEventListener("resize",detectMobileUi);
    window.addEventListener("orientationchange",function(){
        window.setTimeout(detectMobileUi,100);
    });
})();
(function(){
    const DESKTOP_MIN_WIDTH=769;
    let closeTimer=0;
    let resizeTimer=0;
    let observer=null;

    function isDesktop(){return window.innerWidth>=DESKTOP_MIN_WIDTH;}
    function panel(){return document.getElementById('pc-menu-panel');}
    function menu(){return document.getElementById('pc-menu');}
    function more(){return document.getElementById('pc-menu-more');}

    function ensureOverflow(){
        const p=panel();
        if(!p)return null;
        let box=document.getElementById('pc-menu-overflow');
        if(!box){
            box=document.createElement('nav');
            box.id='pc-menu-overflow';
            box.setAttribute('aria-label','나머지 장소 메뉴');
            p.appendChild(box);
        }
        return box;
    }

    function alignPanel(){
        if(!isDesktop())return;
        const p=panel();
        if(!p)return;

        /*
         * PC 상단 메뉴는 좌측 타이틀과 우측 버튼 사이가 아니라
         * 브라우저 화면 전체의 가로 정중앙을 기준으로 배치합니다.
         * 기존 코드는 left/right를 inline !important로 지정하여
         * 뒤쪽 CSS의 left:50% 규칙을 덮어쓰고 있었습니다.
         */
        p.style.setProperty('left','50%','important');
        p.style.setProperty('right','auto','important');
        p.style.setProperty('transform','translateX(-50%)','important');
    }

    function copyItem(original){
        const clone=original.cloneNode(true);
        clone.classList.remove('v75-overflow-hidden');
        clone.removeAttribute('id');
        clone.addEventListener('click',function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            original.click();
            closeNow();
        });
        return clone;
    }

    function layoutMenu(){
        if(!isDesktop())return;
        const p=panel(), m=menu(), b=more(), box=ensureOverflow();
        if(!p||!m||!b||!box)return;

        p.classList.remove('is-expanded');
        const items=Array.from(m.querySelectorAll(':scope > .tour-menu-item'));
        items.forEach(item=>item.classList.remove('v75-overflow-hidden'));
        box.innerHTML='';

        alignPanel();
        const available=Math.max(0,m.clientWidth);
        let used=0;
        let overflowStarted=false;
        const gap=8;

        items.forEach((item,index)=>{
            const w=Math.ceil(item.getBoundingClientRect().width);
            const next=used+(used>0?gap:0)+w;
            if(overflowStarted || next>available){
                overflowStarted=true;
                item.classList.add('v75-overflow-hidden');
                box.appendChild(copyItem(item));
            }else{
                used=next;
            }
        });

        const hasOverflow=box.children.length>0;
        b.style.setProperty('display',hasOverflow?'flex':'none','important');
        if(!hasOverflow)closeNow();
    }

    function openNow(){
        window.clearTimeout(closeTimer);
        const p=panel();
        const b=more();
        const box=ensureOverflow();
        if(!p||!b||!box||box.children.length===0)return;
        p.classList.add('v75-hover-open');
        b.setAttribute('aria-expanded','true');
    }

    function closeNow(){
        window.clearTimeout(closeTimer);
        const p=panel(), b=more();
        if(p)p.classList.remove('v75-hover-open','is-expanded');
        if(b)b.setAttribute('aria-expanded','false');
    }

    function scheduleClose(){
        window.clearTimeout(closeTimer);
        closeTimer=window.setTimeout(closeNow,180);
    }

    function bind(){
        const p=panel(), m=menu(), b=more(), box=ensureOverflow();
        if(!p||!m||!b||!box)return;

        /* 기존 클릭 토글 무력화: 클릭도 단순 열림/닫힘만 수행 */
        b.onclick=function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            if(p.classList.contains('v75-hover-open'))closeNow();
            else openNow();
            return false;
        };

        b.addEventListener('mouseenter',openNow);
        b.addEventListener('focus',openNow);
        box.addEventListener('mouseenter',openNow);
        b.addEventListener('mouseleave',scheduleClose);
        box.addEventListener('mouseleave',scheduleClose);

        if(!observer){
            observer=new MutationObserver(function(){
                window.clearTimeout(resizeTimer);
                resizeTimer=window.setTimeout(layoutMenu,50);
            });
            observer.observe(m,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
        }

        layoutMenu();
        window.setTimeout(layoutMenu,300);
        window.setTimeout(layoutMenu,900);
    }

    window.addEventListener('resize',function(){
        window.clearTimeout(resizeTimer);
        resizeTimer=window.setTimeout(function(){alignPanel();layoutMenu();},120);
    });
    window.addEventListener('orientationchange',function(){
        window.setTimeout(function(){alignPanel();layoutMenu();},250);
    });
    document.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeNow();});
    document.addEventListener('click',function(ev){
        const p=panel();
        if(p&&!p.contains(ev.target))closeNow();
    });

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
    else bind();
})();


/* ===== PC 메뉴 레이아웃 ===== */
(function(){
    const TARGET_TEXT='사랑채102호';

    function applyV76Layout(){
        if(window.innerWidth<769)return;
        const p=document.getElementById('pc-menu-panel');
        const m=document.getElementById('pc-menu');
        const b=document.getElementById('pc-menu-more');
        const box=document.getElementById('pc-menu-overflow');
        const title=document.getElementById('tour-information');
        const actions=document.getElementById('top-action-buttons');
        if(!p||!m||!b||!box||!title||!actions)return;

        const items=Array.from(m.querySelectorAll(':scope > .tour-menu-item'));
        if(!items.length)return;

        items.forEach(item=>item.classList.remove('v75-overflow-hidden'));
        box.innerHTML='';

        let cutoff=items.findIndex(item=>{
            const txt=(item.textContent||'').replace(/\s+/g,'');
            return txt.includes(TARGET_TEXT);
        });
        if(cutoff<0)cutoff=Math.min(2,items.length-1);

        items.forEach((item,index)=>{
            if(index>cutoff){
                item.classList.add('v75-overflow-hidden');
                const clone=item.cloneNode(true);
                clone.classList.remove('v75-overflow-hidden');
                clone.removeAttribute('id');
                clone.addEventListener('click',function(ev){
                    ev.preventDefault();
                    ev.stopPropagation();
                    item.click();
                    p.classList.remove('v75-hover-open','is-expanded');
                    b.setAttribute('aria-expanded','false');
                });
                box.appendChild(clone);
            }
        });

        const titleRect=title.getBoundingClientRect();
        const actionRect=actions.getBoundingClientRect();
        const left=Math.ceil(titleRect.right+48);
        p.style.setProperty('left',left+'px','important');
        p.style.setProperty('right','auto','important');

        const visible=items.filter((_,i)=>i<=cutoff);
        const widths=visible.map(el=>Math.ceil(el.getBoundingClientRect().width));
        const menuWidth=widths.reduce((a,v)=>a+v,0)+Math.max(0,visible.length-1)*6;
        const desired=menuWidth+(box.children.length?47:0);
        const maxAllowed=Math.max(220,Math.floor(actionRect.left-48-left));
        const finalWidth=Math.min(desired,maxAllowed);

        m.style.setProperty('width',Math.max(160,finalWidth-(box.children.length?47:0))+'px','important');
        p.style.setProperty('width',finalWidth+'px','important');
        b.style.setProperty('display',box.children.length?'flex':'none','important');

        box.style.setProperty('top','48px','important');
        box.style.setProperty('bottom','auto','important');
        box.style.setProperty('right','0','important');
    }

    function schedule(){
        clearTimeout(window.__v76Timer);
        window.__v76Timer=setTimeout(applyV76Layout,80);
    }

    window.addEventListener('load',schedule);
    window.addEventListener('resize',schedule,{passive:true});
    document.addEventListener('DOMContentLoaded',schedule);

    const obs=new MutationObserver(schedule);
    const start=function(){
        const m=document.getElementById('pc-menu');
        if(m)obs.observe(m,{childList:true,subtree:true});
        schedule();
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
    else start();
})();


/* ===== PC 상단 UI ===== */
(function(){
'use strict';
var menu,prev,next,counter,observer,drag=null,timer=0;
function desktop(){return window.matchMedia('(min-width:769px)').matches;}
function getItems(){return menu?Array.prototype.slice.call(menu.querySelectorAll(':scope > .tour-menu-item')):[];}
function activeIndex(){
    var list=getItems(),idx=list.findIndex(function(el){return el.classList.contains('is-active')||el.getAttribute('aria-current')==='true';});
    if(idx<0&&window.krpanoObj){try{var scene=String(window.krpanoObj.get('xml.scene')||'');idx=list.findIndex(function(el){return el.dataset.sceneName===scene;});}catch(e){}}
    return idx<0?0:idx;
}
function arrange(){
    if(!desktop()||!menu)return;
    var list=getItems(),half=Math.ceil(list.length/2);
    list.forEach(function(el,i){
        el.style.gridRow=i<half?'1':'2';
        el.style.gridColumn=String(i<half?i+1:i-half+1);
    });
    update();
}
function update(){
    if(!menu)return;
    var list=getItems(),idx=activeIndex(),max=Math.max(0,menu.scrollWidth-menu.clientWidth);
    if(counter)counter.textContent=(list.length?idx+1:0)+' / '+list.length;
    if(prev)prev.disabled=menu.scrollLeft<=2;
    if(next)next.disabled=menu.scrollLeft>=max-2;
}
function ensureActive(){
    if(!desktop()||!menu)return;
    var list=getItems(),target=list[activeIndex()];if(!target)return;
    list.forEach(function(el){if(el!==target)el.removeAttribute('aria-current');});
    target.setAttribute('aria-current','true');
    var m=menu.getBoundingClientRect(),b=target.getBoundingClientRect();
    if(b.left<m.left+5)menu.scrollBy({left:b.left-m.left-20,behavior:'smooth'});
    else if(b.right>m.right-5)menu.scrollBy({left:b.right-m.right+20,behavior:'smooth'});
    setTimeout(update,220);
}
function bind(){
    menu=document.getElementById('pc-menu');prev=document.getElementById('pc-chip-prev');next=document.getElementById('pc-chip-next');counter=document.getElementById('pc-chip-counter');
    if(!menu||!prev||!next){setTimeout(bind,120);return;}
    var step=function(){return Math.max(260,Math.round(menu.clientWidth*.72));};
    prev.onclick=function(){menu.scrollBy({left:-step(),behavior:'smooth'});};
    next.onclick=function(){menu.scrollBy({left:step(),behavior:'smooth'});};
    menu.addEventListener('scroll',function(){clearTimeout(timer);timer=setTimeout(update,35);},{passive:true});
    menu.addEventListener('wheel',function(e){if(!desktop())return;var d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;e.preventDefault();menu.scrollLeft+=d;},{passive:false});
    menu.addEventListener('pointerdown',function(e){if(!desktop()||e.button!==0||e.target.closest('.tour-menu-item'))return;drag={x:e.clientX,left:menu.scrollLeft,id:e.pointerId};menu.classList.add('is-dragging');try{menu.setPointerCapture(e.pointerId);}catch(err){}});
    menu.addEventListener('pointermove',function(e){if(drag)menu.scrollLeft=drag.left-(e.clientX-drag.x);});
    function end(e){if(!drag)return;drag=null;menu.classList.remove('is-dragging');try{menu.releasePointerCapture(e.pointerId);}catch(err){}}
    menu.addEventListener('pointerup',end);menu.addEventListener('pointercancel',end);
    document.addEventListener('click',function(e){if(e.target.closest('#pc-menu .tour-menu-item')){setTimeout(ensureActive,40);setTimeout(ensureActive,220);}},true);
    window.addEventListener('s360-scene-changed',function(){setTimeout(ensureActive,50);setTimeout(ensureActive,230);});
    observer=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){arrange();ensureActive();},55);});
    observer.observe(menu,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current','data-scene-name']});
    arrange();setTimeout(arrange,250);setTimeout(function(){arrange();ensureActive();},800);
    window.addEventListener('resize',function(){setTimeout(arrange,80);},{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();

/* 공통 PC 메뉴 접기/펼치기 */
function js_toggle_pc_menu(){
    const panel=document.getElementById("pc-menu-panel");
    if(panel)panel.classList.toggle("is-collapsed");
}
window.js_toggle_pc_menu=js_toggle_pc_menu;
