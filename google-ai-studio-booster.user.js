// ==UserScript==
// @name         Google AI Studio Performance Booster (v29.0 Trusted Hardened)
// @namespace    http://branch.root/
// @version      29.0
// @description  [RootBranch] 彻底修复 Trusted Types 报错。全量 HTML 注入安全化。增强文件扫描选择器。
// @author       Branch of Root
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ================= 1. 🕵️ API Interceptor =================
    window.__BOOSTER_RAW_DATA__ = null;
    const TARGET_KEYWORD = '$rpc'; 

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

    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    XHR.open = function(method, url) { this._url = url; return open.apply(this, arguments); };
    XHR.send = function(postData) {
        this.addEventListener('load', function() {
            if (this._url && this._url.includes(TARGET_KEYWORD)) {
                try {
                    const responseText = this.responseText;
                    if (responseText && responseText.length > 5000) { 
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
        if (!window.__BOOSTER_RAW_DATA__ || str.length > JSON.stringify(window.__BOOSTER_RAW_DATA__).length) {
            window.__BOOSTER_RAW_DATA__ = data;
            if (window.__UPDATE_UI__) window.__UPDATE_UI__();
        }
    }

    // ================= 2. ⚡ Booster Core =================
    document.addEventListener('DOMContentLoaded', initBooster);

    function initBooster() {
        // --- 🛡️ Trusted Types Policy (安全通行证) ---
        let policy = { createHTML: (s) => s };
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            try { 
                policy = window.trustedTypes.createPolicy('booster_policy_v29', { 
                    createHTML: s => s 
                }); 
            } catch (e) {
                // 如果策略名重复，尝试复用已有的（极端情况）
                console.warn('Policy create failed, UI might break on Strict CSP');
            }
        }
        // 核心安全函数：所有 innerHTML 必须经过它
        const safe = (html) => policy.createHTML(html);
        // ---------------------------------------------

        console.log('[RootBranch] 🚀 Hardened Engine Starting...');

        const CONFIG = {
            boosterRootMargin: '600px 0px 600px 0px',
            codeCollapseBuffer: '2500px 0px 2500px 0px',
            minHeightToFold: 400,
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
            
            /* 上移默认位置 */
            #booster-dock { position: fixed; bottom: 150px; left: 20px; z-index: 99999; font-family: sans-serif; user-select: none; display: flex; flex-direction: column; gap: 8px; }
            
            #booster-main-btn { background: #fff; border: 1px solid #dadce0; border-radius: 24px; padding: 8px 16px; display: flex; align-items: center; gap: 8px; cursor: grab; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.1s; color: #3c4043; font-size: 13px; font-weight: 500;}
            #booster-main-btn:active { cursor: grabbing; transform: scale(0.98); }
            
            .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #ccc; transition: background 0.3s; }
            .status-dot.active { background: #1e8e3e; box-shadow: 0 0 4px #1e8e3e; }
            .status-dot.intercepted { background: #a142f4; box-shadow: 0 0 4px #a142f4; }
            
            #booster-menu { background: #fff; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); display: none; flex-direction: column; margin-bottom: 8px; min-width: 240px; overflow: hidden; }
            #booster-menu.show { display: flex; }
            .menu-item { padding: 10px 16px; font-size: 13px; color: #3c4043; cursor: pointer; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f1f3f4; transition: background 0.1s; }
            .menu-item:hover { background: #f1f3f4; }
            .menu-divider { height: 1px; background: #f1f3f4; margin: 2px 0; }
            .menu-info { font-size: 11px; color: #70757a; padding: 8px 16px; background: #f8f9fa; border-top: 1px solid #eee; }
            
            .badge-api { background: #e8f0fe; color: #1967d2; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            .badge-dom { background: #e6f4ea; color: #137333; padding: 2px 6px; border-radius: 4px; font-weight: bold; }

            /* 文件列表 */
            #file-list-area { display: none; border-top: 1px solid #eee; background: #fafafa; max-height: 250px; overflow-y: auto; flex-direction: column; }
            #file-list-area.show { display: flex; }
            .file-item { padding: 8px 16px; font-size: 12px; color: #444; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f1f1; }
            .file-item:hover { background: #e8f0fe; color: #1967d2; }
            .file-tag { font-size: 10px; background: #ddd; padding: 1px 4px; border-radius: 4px; margin-left: 8px;}
            
            @keyframes flash-highlight { 0% { outline: 4px solid #ff00ff; background: rgba(255,0,255,0.2); } 100% { outline: 4px solid transparent; background: transparent; } }
            .highlight-target { animation: flash-highlight 1.5s ease-out; }
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

        // --- Logic: Check Code Height ---
        function isCodeBlockTall(header) {
            const panel = header.closest('mat-expansion-panel');
            if (!panel) return true; 
            const pre = panel.querySelector('pre');
            if (pre && pre.offsetHeight < CONFIG.minHeightToFold) return false;
            return true;
        }

        // --- UI ---
        function createDock() {
            if (document.getElementById('booster-dock')) return;
            const dock = document.createElement('div');
            dock.id = 'booster-dock';
            
            // Restore Position
            const savedPos = localStorage.getItem('booster_pos');
            if (savedPos) {
                try {
                    const pos = JSON.parse(savedPos);
                    dock.style.left = pos.left;
                    dock.style.top = pos.top;
                    dock.style.bottom = 'auto'; 
                    dock.style.right = 'auto';
                } catch(e) {}
            }

            // 🛡️ Safe HTML
            dock.innerHTML = safe(`
                <div id="booster-menu">
                    <div class="menu-item" id="btn-export-raw"><span>📦</span> 导出原始 JSON</div>
                    <div class="menu-divider"></div>
                    <div class="menu-item" id="btn-show-files"><span>📂</span> 文件列表 <span id="file-count" style="margin-left:auto;color:#999;font-size:10px;"></span></div>
                    <div id="file-list-area"></div>
                    <div class="menu-divider"></div>
                    <div class="menu-info">
                        <div>API: <span id="api-status">等待...</span></div>
                        <div id="dom-stats">Ready</div>
                    </div>
                </div>
                <div id="booster-main-btn"><div class="status-dot"></div><span>Booster v29</span></div>
            `);
            document.body.appendChild(dock);
            
            const mainBtn = dock.querySelector('#booster-main-btn');
            const menu = dock.querySelector('#booster-menu');
            const fileBtn = dock.querySelector('#btn-show-files');
            const fileArea = dock.querySelector('#file-list-area');
            const fileCount = dock.querySelector('#file-count');
            
            let isDragging = false, startX, startY, iLeft, iTop;
            mainBtn.addEventListener('mousedown', (e) => {
                if(e.button!==0)return; isDragging=false; startX=e.clientX; startY=e.clientY;
                const r = dock.getBoundingClientRect(); iLeft=r.left; iTop=r.top;
                dock.style.bottom='auto'; dock.style.right='auto'; dock.style.left=`${iLeft}px`; dock.style.top=`${iTop}px`;
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            });
            function onMove(e) { if((e.clientX-startX)**2+(e.clientY-startY)**2>25) isDragging=true; dock.style.left=`${iLeft+e.clientX-startX}px`; dock.style.top=`${iTop+e.clientY-startY}px`; }
            function onUp() { 
                document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); 
                if(isDragging) {
                    localStorage.setItem('booster_pos', JSON.stringify({ left: dock.style.left, top: dock.style.top }));
                } else {
                    menu.classList.toggle('show'); updateUI(); 
                } 
            }

            dock.querySelector('#btn-export-raw').addEventListener('click', () => { menu.classList.remove('show'); handleJsonExport(); });
            
            // File List Logic with Expanded Selectors & Safety
            function scanAndListFiles() {
                // [更新选择器] 增加 mat-chip, mat-chip-row 等，覆盖更多文件展示形式
                const files = queryDeepAll(document.body, 'ms-drive-document, ms-uploaded-file, ms-text-attachment, ms-drive-chip, ms-image-chip, ms-attachment-chip, mat-chip-row');
                
                // 🛡️ Safe HTML
                fileArea.innerHTML = safe('');
                fileCount.textContent = files.length > 0 ? `(${files.length})` : '';

                if (files.length === 0) {
                    // 🛡️ Safe HTML
                    fileArea.innerHTML = safe('<div style="padding:10px;text-align:center;color:#999;font-size:11px;">未找到文件 (尝试滚动页面加载更多)</div>');
                    return;
                }

                files.forEach((el, index) => {
                    let name = el.getAttribute('aria-label') || el.innerText || 'Unknown File';
                    name = name.split('\n')[0].trim().substring(0, 30) + (name.length>30?'...':'');
                    
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    
                    // 🛡️ Safe HTML
                    item.innerHTML = safe(`<span>${index+1}. ${name}</span> <span class="file-tag">GO</span>`);
                    
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        el.scrollIntoView({behavior: "smooth", block: "center"});
                        el.classList.remove('highlight-target');
                        void el.offsetWidth;
                        el.classList.add('highlight-target');
                    });
                    fileArea.appendChild(item);
                });
            }

            fileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (fileArea.classList.contains('show')) {
                    fileArea.classList.remove('show');
                } else {
                    scanAndListFiles();
                    fileArea.classList.add('show');
                }
            });

            window.__UPDATE_UI__ = updateUI;
        }

        function updateUI() {
            const apiStatus = document.getElementById('api-status');
            const domStats = document.getElementById('dom-stats');
            const dot = document.querySelector('.status-dot');

            if (apiStatus) {
                if (window.__BOOSTER_RAW_DATA__) {
                    const size = Math.round(JSON.stringify(window.__BOOSTER_RAW_DATA__).length / 1024);
                    // 🛡️ Safe HTML
                    apiStatus.innerHTML = safe(`<span class="badge-api">捕获 ${size}KB</span>`);
                    if(dot) dot.classList.add('intercepted');
                } else {
                    apiStatus.textContent = "等待刷新...";
                }
            }
            if (domStats) {
                // 🛡️ Safe HTML
                domStats.innerHTML = safe(`<span class="badge-dom">${stats.frozen}/${stats.total}</span> Code: ${stats.code}`);
                if(dot && !window.__BOOSTER_RAW_DATA__) stats.frozen > 0 ? dot.classList.add('active') : dot.classList.remove('active');
            }
        }

        function handleJsonExport() {
            if (!window.__BOOSTER_RAW_DATA__) { alert('请刷新页面以捕获 API 数据'); return; }
            const blob = new Blob([JSON.stringify(window.__BOOSTER_RAW_DATA__, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `AI_Raw_${Date.now()}.json`; a.click();
        }

        // --- Core Observers ---
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
                const header = entry.target;
                if (entry.isIntersecting) {
                    if (header.dataset.collapseTimer) {
                        clearTimeout(parseInt(header.dataset.collapseTimer));
                        delete header.dataset.collapseTimer;
                    }
                } else {
                    if (header.getAttribute('aria-expanded') === 'true') {
                        if (!isCodeBlockTall(header)) return; 
                        header.dataset.collapseTimer = setTimeout(() => {
                            if (header.isConnected && header.getAttribute('aria-expanded') === 'true') {
                                header.click();
                            }
                        }, CONFIG.collapseDelay);
                    }
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
        
        scan(); setInterval(scan, 2000);
    }
})();