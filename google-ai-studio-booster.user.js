// ==UserScript==
// @name         Google AI Studio Performance Booster (v26.0 The Hybrid)
// @namespace    http://branch.root/
// @version      26.0
// @description  [RootBranch] 完全体。集成 API 劫持(导出无损JSON) + DOM 冻结(降CPU) + 代码自动折叠。修复 Booster 消失的问题。
// @author       Branch of Root
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ================= 1. 🕵️ API Interceptor (立即运行) =================
    // 负责在页面加载初期劫持数据
    
    window.__BOOSTER_RAW_DATA__ = null;
    const TARGET_KEYWORD = '$rpc'; 

    function interceptLog(msg) {
        // console.log(`%c[Booster 🕵️] ${msg}`, 'color: #ff00ff; font-weight: bold;');
    }

    // --- Fetch Hook ---
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        try {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            if (url && url.includes(TARGET_KEYWORD)) {
                const clone = response.clone();
                clone.json().then(data => savePayload(data)).catch(()=>{});
            }
        } catch (e) {}
        return response;
    };

    // --- XHR Hook ---
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    XHR.open = function(method, url) { this._url = url; return open.apply(this, arguments); };
    XHR.send = function(postData) {
        this.addEventListener('load', function() {
            if (this._url && this._url.includes(TARGET_KEYWORD)) {
                try {
                    const responseText = this.responseText;
                    if (responseText && responseText.length > 5000) { // 忽略小包
                        const data = JSON.parse(responseText);
                        savePayload(data);
                    }
                } catch (e) {}
            }
        });
        return send.apply(this, arguments);
    };

    function savePayload(data) {
        const str = JSON.stringify(data);
        // 只有比当前存的更大才更新 (保留最完整的历史)
        if (!window.__BOOSTER_RAW_DATA__ || str.length > JSON.stringify(window.__BOOSTER_RAW_DATA__).length) {
            window.__BOOSTER_RAW_DATA__ = data;
            interceptLog(`Payload Secured: ${Math.round(str.length/1024)} KB`);
            if (window.__UPDATE_UI__) window.__UPDATE_UI__();
        }
    }


    // ================= 2. ⚡ Booster Core (DOM Ready) =================
    // 负责 UI、冻结、折叠
    
    document.addEventListener('DOMContentLoaded', initBooster);

    function initBooster() {
        console.log('[RootBranch] 🚀 Hybrid Engine Starting...');

        // --- Config ---
        const CONFIG = {
            boosterRootMargin: '600px 0px 600px 0px',
            // [新增] 代码折叠缓冲区：2500px (约等于 3-5 个对话块的高度)
            // 只有滚出这个范围，代码块才会自动折叠
            codeCollapseBuffer: '2500px 0px 2500px 0px', 
            minItemHeight: 50,
            autoCollapse: true,
            collapseDelay: 2000,
            codeHeaderSelector: 'mat-expansion-panel-header',
            debugMode: false
        };

        let stats = { frozen: 0, total: 0, code: 0 };
        let boosterSet = new WeakSet();
        let codeSet = new WeakSet();

        // --- CSS ---
        const style = document.createElement('style');
        style.textContent = `
            .boost-frozen { content-visibility: hidden !important; contain: size layout style !important; }
            body.is-exporting .boost-frozen { content-visibility: visible !important; contain: none !important; }
            
            #booster-dock { position: fixed; bottom: 20px; left: 20px; z-index: 99999; font-family: sans-serif; user-select: none; }
            #booster-main-btn { background: #fff; border: 1px solid #dadce0; border-radius: 24px; padding: 8px 16px; display: flex; align-items: center; gap: 8px; cursor: grab; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.1s; }
            #booster-main-btn:active { cursor: grabbing; transform: scale(0.98); }
            
            .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #ccc; transition: background 0.3s; }
            .status-dot.active { background: #1e8e3e; box-shadow: 0 0 4px #1e8e3e; }
            .status-dot.intercepted { background: #a142f4; box-shadow: 0 0 4px #a142f4; }
            
            #booster-menu { background: #fff; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); display: none; flex-direction: column; margin-bottom: 8px; min-width: 240px; overflow: hidden; }
            #booster-menu.show { display: flex; }
            .menu-item { padding: 10px 16px; font-size: 13px; color: #3c4043; cursor: pointer; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f1f3f4; }
            .menu-item:hover { background: #f1f3f4; }
            .menu-info { font-size: 11px; color: #70757a; padding: 8px 16px; background: #f8f9fa; border-top: 1px solid #eee; line-height: 1.5; }
            
            .badge-api { background: #e8f0fe; color: #1967d2; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            .badge-dom { background: #e6f4ea; color: #137333; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
        `;
        document.head.appendChild(style);

        // --- Helpers ---
        function queryDeepAll(root, selector) {
            let results = [];
            if (!root) return results;
            if (root.querySelectorAll) results.push(...Array.from(root.querySelectorAll(selector)));
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.shadowRoot) results.push(...queryDeepAll(node.shadowRoot, selector));
            }
            return results;
        }

        // --- UI Manager ---
        function createDock() {
            if (document.getElementById('booster-dock')) return;
            const dock = document.createElement('div');
            dock.id = 'booster-dock';
            dock.innerHTML = `
                <div id="booster-menu">
                    <div class="menu-item" id="btn-export-raw">
                        <span>📦</span> 导出原始 JSON (convo_sync)
                    </div>
                    <div class="menu-item" id="btn-export-md">
                        <span>📝</span> 导出为 Markdown (DOM)
                    </div>
                    <div class="menu-info">
                        <div>API 状态: <span id="api-status">等待拦截...</span></div>
                        <div id="dom-stats">Frozen: 0/0 | Code: 0</div>
                    </div>
                </div>
                <div id="booster-main-btn"><div class="status-dot"></div><span>Booster v26</span></div>
            `;
            document.body.appendChild(dock);

            const mainBtn = dock.querySelector('#booster-main-btn');
            const menu = dock.querySelector('#booster-menu');
            
            let isDragging = false, startX, startY, iLeft, iTop;
            mainBtn.addEventListener('mousedown', (e) => {
                if(e.button!==0)return; isDragging=false; startX=e.clientX; startY=e.clientY;
                const r = dock.getBoundingClientRect(); iLeft=r.left; iTop=r.top;
                dock.style.bottom='auto'; dock.style.right='auto'; dock.style.left=`${iLeft}px`; dock.style.top=`${iTop}px`;
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            });
            function onMove(e) { if((e.clientX-startX)**2+(e.clientY-startY)**2>25) isDragging=true; dock.style.left=`${iLeft+e.clientX-startX}px`; dock.style.top=`${iTop+e.clientY-startY}px`; }
            function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if(!isDragging){ menu.classList.toggle('show'); updateUI(); } }

            dock.querySelector('#btn-export-raw').addEventListener('click', () => { menu.classList.remove('show'); handleJsonExport(); });
            // Markdown 导出逻辑太长，这里简写调用，实际代码请保留 v22 的 extractMarkdownFromElement
            dock.querySelector('#btn-export-md').addEventListener('click', () => { menu.classList.remove('show'); alert('请使用 v22 的 DOM 导出代码，此处仅做演示连接'); });
            
            // 暴露全局更新接口给拦截器用
            window.__UPDATE_UI__ = updateUI;
        }

        function updateUI() {
            const apiStatus = document.getElementById('api-status');
            const domStats = document.getElementById('dom-stats');
            const dot = document.querySelector('.status-dot');

            // 更新 API 状态
            if (apiStatus) {
                if (window.__BOOSTER_RAW_DATA__) {
                    const size = Math.round(JSON.stringify(window.__BOOSTER_RAW_DATA__).length / 1024);
                    apiStatus.innerHTML = `<span class="badge-api">已捕获 ${size}KB</span>`;
                    if(dot) dot.classList.add('intercepted');
                } else {
                    apiStatus.textContent = "等待请求/请刷新...";
                }
            }

            // 更新 DOM 状态
            if (domStats) {
                domStats.innerHTML = `<span class="badge-dom">${stats.frozen}/${stats.total}</span> Code: ${stats.code}`;
                // 如果没有 API 数据但有冻结，显示绿色；有 API 数据显示紫色
                if(dot && !window.__BOOSTER_RAW_DATA__) {
                    stats.frozen > 0 ? dot.classList.add('active') : dot.classList.remove('active');
                }
            }
        }

        // --- Export Logic ---
        function handleJsonExport() {
            if (!window.__BOOSTER_RAW_DATA__) {
                alert('⚠️ 尚未捕获 API 数据！\n请按 F5 刷新页面，让脚本拦截 Google 的加载请求。');
                return;
            }
            const blob = new Blob([JSON.stringify(window.__BOOSTER_RAW_DATA__, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `AIStudio_Raw_${new Date().toISOString().slice(0,19).replace(/T|:/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        // --- Booster Logic (复活！) ---
        function findScrollContainer() {
            let candidate = document.querySelector('.layout-main');
            if (candidate && window.getComputedStyle(candidate).overflowY.includes('scroll')) return candidate;
            const allDivs = document.querySelectorAll('div, main');
            for (let div of allDivs) {
                const style = window.getComputedStyle(div);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight) return div;
            }
            return null;
        }
        let scrollRoot = findScrollContainer();

        const boosterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.remove('boost-frozen');
                    entry.target.style.containIntrinsicSize = ''; entry.target.style.height = '';
                    stats.frozen--;
                } else {
                    if(entry.boundingClientRect.height > CONFIG.minItemHeight) {
                        entry.target.style.containIntrinsicSize = `${entry.boundingClientRect.width}px ${entry.boundingClientRect.height}px`;
                        entry.target.style.height = `${entry.boundingClientRect.height}px`;
                        if(!entry.target.classList.contains('boost-frozen')) { entry.target.classList.add('boost-frozen'); stats.frozen++; }
                    }
                }
            });
            updateUI();
        }, { root: scrollRoot, rootMargin: CONFIG.boosterRootMargin, threshold: 0 });

        const collapseObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting && entry.target.getAttribute('aria-expanded') === 'true') {
                    entry.target.dataset.timer = setTimeout(() => { if(entry.target.isConnected) entry.target.click(); }, CONFIG.collapseDelay);
                } else if (entry.isIntersecting && entry.target.dataset.timer) {
                    clearTimeout(entry.target.dataset.timer); delete entry.target.dataset.timer;
                }
            });
        }, { root: null, rootMargin: CONFIG.codeCollapseBuffer, threshold: 0 });

        function scan() {
            createDock();
            const cur = findScrollContainer(); if(cur!==scrollRoot && cur!==null) scrollRoot=cur;
            let targets = queryDeepAll(document.body, 'ms-turn, ms-response, .turn-container, ms-user-turn, ms-model-turn');
            if(targets.length===0) document.querySelectorAll('div').forEach(d=>{ if(d.children.length>50 && !d.tagName.includes('CODE')) targets=Array.from(d.children); });
            targets.forEach(el => {
                if(!boosterSet.has(el) && !el.closest('code') && !['SCRIPT','STYLE'].includes(el.tagName)) {
                    boosterObserver.observe(el); boosterSet.add(el); stats.total++;
                }
            });
            if(CONFIG.autoCollapse) queryDeepAll(document.body, CONFIG.codeHeaderSelector).forEach(h=>{ if(!codeSet.has(h)){ collapseObserver.observe(h); codeSet.add(h); stats.code++; } });
            updateUI();
        }
        
        // 启动扫描
        scan(); 
        setInterval(scan, 2000);
    }

})();