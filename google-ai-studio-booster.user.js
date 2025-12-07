// ==UserScript==
// @name         Google AI Studio Performance Booster (v22.0 Purified Export)
// @namespace    http://branch.root/
// @version      22.0
// @description  [RootBranch] 彻底重写导出逻辑。增加“垃圾过滤器”，屏蔽 UI 图标、按钮文字。智能识别代码块格式。
// @author       Branch of Root
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ================= ⚙️ 配置 =================
    const CONFIG = {
        boosterRootMargin: '600px 0px 600px 0px',
        minItemHeight: 50,
        autoCollapse: true,
        collapseDelay: 2000,
        codeHeaderSelector: 'mat-expansion-panel-header',
        debugMode: false
    };

    // --- 全局状态 ---
    let stats = { frozen: 0, total: 0, code: 0 };
    let boosterSet = new WeakSet();
    let codeSet = new WeakSet();

    // --- CSS ---
    const style = document.createElement('style');
    style.textContent = `
        .boost-frozen {
            content-visibility: hidden !important;
            contain: size layout style !important;
        }
        body.is-exporting .boost-frozen {
            content-visibility: visible !important;
            contain: none !important;
        }
        /* 悬浮坞样式 */
        #booster-dock {
            position: fixed; bottom: 20px; left: 20px; z-index: 99999;
            display: flex; flex-direction: column; gap: 8px;
            font-family: 'Google Sans', 'Roboto', sans-serif; user-select: none;
        }
        #booster-main-btn {
            background: #fff; border: 1px solid #dadce0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 24px; padding: 8px 16px;
            display: flex; align-items: center; gap: 8px; cursor: grab;
            color: #3c4043; font-size: 13px; font-weight: 500; transition: transform 0.1s;
        }
        #booster-main-btn:active { cursor: grabbing; transform: scale(0.98); }
        .status-dot {
            width: 8px; height: 8px; border-radius: 50%; background: #ccc;
            transition: background 0.3s;
        }
        .status-dot.active { background: #1e8e3e; box-shadow: 0 0 4px #1e8e3e; }
        #booster-menu {
            background: #fff; border: 1px solid #dadce0; border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2); overflow: hidden; display: none;
            flex-direction: column; margin-bottom: 8px; min-width: 180px;
        }
        #booster-menu.show { display: flex; }
        .menu-item {
            padding: 10px 16px; font-size: 13px; color: #3c4043; cursor: pointer;
            display: flex; align-items: center; gap: 10px;
        }
        .menu-item:hover { background: #f1f3f4; }
        .menu-info { font-size: 11px; color: #70757a; padding: 4px 16px 8px; pointer-events: none;}
    `;
    document.head.appendChild(style);

    // ================= 🛠️ Helpers =================
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

    // ================= 📝 Core: Purified Markdown Extractor (重写核心) =================
    
    function extractMarkdownFromElement(root) {
        let text = "";
        
        // 自定义过滤器：屏蔽垃圾元素
        const filter = {
            acceptNode: function(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName;
                    const cls = node.className || "";
                    
                    // 1. 屏蔽按钮和图标 (这是造成 more_vert/edit/download 的元凶)
                    if (tag === 'BUTTON' || node.getAttribute('role') === 'button') return NodeFilter.FILTER_REJECT;
                    if (tag === 'MAT-ICON' || tag === 'SVG') return NodeFilter.FILTER_REJECT;
                    if (typeof cls === 'string' && (cls.includes('material-symbols') || cls.includes('material-icons'))) return NodeFilter.FILTER_REJECT;
                    
                    // 2. 屏蔽系统提示
                    if (tag === 'MS-TOOLTIP' || node.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        };

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter, false);
        
        while (walker.nextNode()) {
            const node = walker.currentNode;

            // --- 处理代码块 (PRE) ---
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'PRE') {
                // 尝试找语言
                let lang = '';
                // 策略：往上找 container，再找 header
                const container = node.closest('.code-block-wrapper') || node.parentNode;
                if (container) {
                    const header = container.querySelector('.header, mat-expansion-panel-header');
                    if (header) {
                        // 提取 header 里的纯文本作为语言 (排除 icon)
                        lang = header.innerText.replace(/content_copy|download|edit|more_vert/g, '').trim();
                    }
                }
                
                // 提取代码内容
                const codeContent = node.textContent;
                text += `\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n`;
                
                // 跳过 PRE 的子节点，防止重复提取
                // (TreeWalker 没有内置的 skipChildren，这里通过逻辑控制不重复加 text)
                continue; 
            }

            // --- 处理普通文本 ---
            if (node.nodeType === Node.TEXT_NODE) {
                const parent = node.parentNode;
                // 如果父节点是 PRE，说明是代码块内容，上面已经处理过了，跳过
                if (parent.tagName === 'PRE' || parent.tagName === 'CODE') continue;
                if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;

                let content = node.textContent;
                // 简单清洗
                if (content.trim().length > 0) {
                    text += content;
                }
            }

            // --- 处理换行 ---
            if (node.nodeType === Node.ELEMENT_NODE) {
                const display = window.getComputedStyle(node).display;
                if (display === 'block' || display === 'flex' || node.tagName === 'P' || node.tagName === 'BR') {
                    // 避免连续太多换行
                    if (!text.endsWith('\n\n')) {
                        text += '\n';
                    }
                }
            }
        }
        
        // 最终清洗：去除多余空行，去除奇怪的 Unicode
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    // ================= Feature: Exporter =================

    async function handleExport() {
        const btnText = document.querySelector('#booster-main-btn span');
        const originalText = btnText.textContent;
        btnText.textContent = '⏳ ...';

        document.body.classList.add('is-exporting'); 
        await new Promise(r => setTimeout(r, 100)); // 等待解冻

        try {
            // 1. 获取所有 turns (盲扫 + 精准)
            let turns = queryDeepAll(document.body, 'ms-turn, ms-response, .turn-container, ms-user-turn, ms-model-turn');
            if (turns.length === 0) {
                // 盲扫 fallback
                document.querySelectorAll('div').forEach(d => {
                    if (d.children.length > 50 && !d.tagName.includes('CODE')) turns = Array.from(d.children);
                });
            }
            
            // 过滤脚本
            turns = turns.filter(t => !['SCRIPT', 'STYLE'].includes(t.tagName));

            if (turns.length === 0) throw new Error("No turns found.");

            let mdContent = "";
            let userCount = 0;

            turns.forEach(turn => {
                let role = "Model";
                // 角色判断逻辑
                const tag = turn.tagName.toLowerCase();
                const cls = turn.className.toLowerCase();
                const style = window.getComputedStyle(turn);
                
                if (tag.includes('user') || cls.includes('user') || style.justifyContent === 'flex-end') {
                    role = "User";
                    userCount++;
                }

                const content = extractMarkdownFromElement(turn);
                if (content) {
                    mdContent += `**${role}:**\n\n${content}\n\n---\n\n`;
                }
            });

            // 下载
            const blob = new Blob([mdContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Chat_Export_${new Date().toISOString().slice(0,19).replace(/T|:/g, '-')}.md`;
            a.click();
            URL.revokeObjectURL(url);
            
            console.log(`Exported ${turns.length} turns.`);

        } catch (e) {
            console.error(e);
            alert('Export Failed: ' + e.message);
        } finally {
            document.body.classList.remove('is-exporting');
            btnText.textContent = originalText;
        }
    }

    // ================= UI & Booster Logic =================

    function createDock() {
        if (document.getElementById('booster-dock')) return;
        const dock = document.createElement('div');
        dock.id = 'booster-dock';
        dock.innerHTML = `
            <div id="booster-menu">
                <div class="menu-item" id="btn-export"><span>💾</span> 导出为 Markdown (净化版)</div>
                <div class="menu-item" style="font-size:10px;color:#999;cursor:default;">v22.0 Purified</div>
                <div class="menu-info" id="menu-stats">Waiting...</div>
            </div>
            <div id="booster-main-btn"><div class="status-dot"></div><span>Booster</span></div>
        `;
        document.body.appendChild(dock);

        const mainBtn = dock.querySelector('#booster-main-btn');
        const menu = dock.querySelector('#booster-menu');
        
        // 拖拽
        let isDragging = false, startX, startY, iLeft, iTop;
        mainBtn.addEventListener('mousedown', (e) => {
            if(e.button!==0)return; isDragging=false; startX=e.clientX; startY=e.clientY;
            const r = dock.getBoundingClientRect(); iLeft=r.left; iTop=r.top;
            dock.style.bottom='auto'; dock.style.right='auto'; dock.style.left=`${iLeft}px`; dock.style.top=`${iTop}px`;
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        });
        function onMove(e) { if((e.clientX-startX)**2+(e.clientY-startY)**2>25) isDragging=true; dock.style.left=`${iLeft+e.clientX-startX}px`; dock.style.top=`${iTop+e.clientY-startY}px`; }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if(!isDragging){ menu.classList.toggle('show'); updateStats(); } }

        dock.querySelector('#btn-export').addEventListener('click', () => { menu.classList.remove('show'); handleExport(); });
    }

    function updateStats() {
        const t = document.getElementById('menu-stats');
        if(t) t.textContent = `Frozen: ${stats.frozen}/${stats.total} | Code: ${stats.code}`;
        const d = document.querySelector('.status-dot');
        if(d) stats.frozen>0 ? d.classList.add('active') : d.classList.remove('active');
    }

    // Booster Engines
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
        updateStats();
    }, { root: scrollRoot, rootMargin: CONFIG.boosterRootMargin, threshold: 0 });

    const collapseObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting && entry.target.getAttribute('aria-expanded') === 'true') {
                entry.target.dataset.timer = setTimeout(() => { if(entry.target.isConnected) entry.target.click(); }, CONFIG.collapseDelay);
            } else if (entry.isIntersecting && entry.target.dataset.timer) {
                clearTimeout(entry.target.dataset.timer); delete entry.target.dataset.timer;
            }
        });
    }, { root: null, threshold: 0 });

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
        updateStats();
    }
    
    scan(); setInterval(scan, 2000);
})();