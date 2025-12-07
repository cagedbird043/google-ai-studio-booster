// ==UserScript==
// @name         Google AI Studio Performance Booster (v21.0 Logic Sync)
// @namespace    http://branch.root/
// @version      21.0
// @description  [RootBranch] 修复导出报 "No turns found" 的问题（同步盲扫逻辑）。增加悬浮坞拖拽功能。
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

        /* 悬浮坞样式 (增加 grab 手势) */
        #booster-dock {
            position: fixed; bottom: 20px; left: 20px; z-index: 99999;
            display: flex; flex-direction: column; gap: 8px;
            font-family: 'Google Sans', 'Roboto', sans-serif;
            user-select: none; /* 防止拖拽时选中文字 */
        }

        #booster-main-btn {
            background: #fff; border: 1px solid #dadce0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 24px; padding: 8px 16px;
            display: flex; align-items: center; gap: 8px;
            cursor: grab; transition: transform 0.1s, box-shadow 0.2s;
            color: #3c4043; font-size: 13px; font-weight: 500;
        }
        #booster-main-btn:active { cursor: grabbing; transform: scale(0.98); }
        
        .status-dot {
            width: 8px; height: 8px; border-radius: 50%; background: #ccc;
            transition: background 0.3s; pointer-events: none;
        }
        .status-dot.active { background: #1e8e3e; box-shadow: 0 0 4px #1e8e3e; }

        #booster-menu {
            background: #fff; border: 1px solid #dadce0;
            border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            overflow: hidden; display: none; flex-direction: column;
            margin-bottom: 8px; min-width: 180px;
        }
        #booster-menu.show { display: flex; animation: fadeIn 0.15s ease-out; }
        
        .menu-item {
            padding: 10px 16px; font-size: 13px; color: #3c4043; cursor: pointer;
            display: flex; align-items: center; gap: 10px; transition: background 0.1s;
        }
        .menu-item:hover { background: #f1f3f4; }
        .menu-divider { height: 1px; background: #f1f3f4; margin: 2px 0; }
        .menu-info { font-size: 11px; color: #70757a; padding: 4px 16px 8px; pointer-events: none;}

        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(style);

    // ================= 🛠️ Shared Helpers (核心修复点) =================

    // 深度搜索
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

    // 寻找最大容器 (盲扫)
    function findFatContainer(root) {
        let best = null;
        let maxCount = 0;
        function traverse(node) {
            if (!node || node.nodeType !== 1) return;
            // 跳过非容器元素
            if (['CODE', 'PRE', 'SVG', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(node.tagName)) return;

            const children = node.children;
            if (children && children.length > 3) {
                let blockCount = 0;
                for (let i = 0; i < children.length; i++) {
                    const tag = children[i].tagName;
                    // 只要是 div 或者自定义标签就算
                    if (tag === 'DIV' || tag.includes('-')) blockCount++;
                }
                if (blockCount > maxCount) {
                    maxCount = blockCount;
                    best = node;
                }
            }
            if (node.shadowRoot) traverse(node.shadowRoot);
            // 限制深度防止卡死
            if (children.length < 50) for(let i=0; i<children.length; i++) traverse(children[i]);
        }
        traverse(root);
        return best;
    }

    // 统一获取对话列表 (The Fix: 让导出和冻结使用完全相同的逻辑)
    function getAllTurns() {
        // 1. 尝试精准搜索
        let targets = queryDeepAll(document.body, 'ms-turn, ms-response, .turn-container, ms-user-turn, ms-model-turn');
        
        // 2. 尝试盲扫 fallback
        if (targets.length === 0) {
            const fatContainer = findFatContainer(document.body);
            if (fatContainer) {
                targets = Array.from(fatContainer.children);
                // 简单的二次过滤，确保不是脚本
                targets = targets.filter(el => !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName));
            }
        }
        return targets;
    }

    // ================= UI Module: Draggable Dock =================

    function createDock() {
        if (document.getElementById('booster-dock')) return;

        const dock = document.createElement('div');
        dock.id = 'booster-dock';
        dock.innerHTML = `
            <div id="booster-menu">
                <div class="menu-item" id="btn-export">
                    <span>💾</span> 导出为 Markdown
                </div>
                <div class="menu-divider"></div>
                <div class="menu-info" id="menu-stats">
                    Wait...
                </div>
            </div>
            <div id="booster-main-btn">
                <div class="status-dot"></div>
                <span>Booster</span>
            </div>
        `;
        document.body.appendChild(dock);

        const mainBtn = dock.querySelector('#booster-main-btn');
        const menu = dock.querySelector('#booster-menu');
        const exportBtn = dock.querySelector('#btn-export');

        // 拖拽逻辑
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        mainBtn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // 只响应左键
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = dock.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // 清除 bottom/right 定位，改为 top/left 以便拖拽
            dock.style.bottom = 'auto';
            dock.style.right = 'auto';
            dock.style.left = `${initialLeft}px`;
            dock.style.top = `${initialTop}px`;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (dx * dx + dy * dy > 25) isDragging = true; // 移动超过 5px 视为拖拽
            dock.style.left = `${initialLeft + dx}px`;
            dock.style.top = `${initialTop + dy}px`;
        }

        function onMouseUp(e) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 如果不是拖拽，则是点击
            if (!isDragging) {
                menu.classList.toggle('show');
                updateMenuStats();
            }
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!dock.contains(e.target) && !isDragging) menu.classList.remove('show');
        });

        // Export Action
        exportBtn.addEventListener('click', () => {
            menu.classList.remove('show');
            handleExport();
        });
    }

    function updateMenuStats() {
        const statText = document.getElementById('menu-stats');
        if (statText) {
            statText.textContent = `Frozen: ${stats.frozen}/${stats.total} | Code: ${stats.code}`;
        }
        const dot = document.querySelector('.status-dot');
        if (dot) {
            if (stats.frozen > 0) dot.classList.add('active');
            else dot.classList.remove('active');
        }
    }

    // ================= Feature: Markdown Exporter =================

    async function handleExport() {
        const btnText = document.querySelector('#booster-main-btn span');
        const originalText = btnText.textContent;
        btnText.textContent = '⏳ ...';

        document.body.classList.add('is-exporting'); // 解冻
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 100)); 

        try {
            // 使用与 Booster 完全相同的逻辑获取 turns
            const turns = getAllTurns(); 
            
            if (turns.length === 0) {
                alert('Export Failed: No turns found! (Booster found 0 too?)');
                return;
            }

            let mdContent = "";
            let userCount = 0;
            let modelCount = 0;

            turns.forEach(turn => {
                let role = "Unknown";
                const tag = turn.tagName.toLowerCase();
                const cls = turn.className.toLowerCase();
                
                // 简单的角色猜测逻辑
                if (tag.includes('user') || cls.includes('user')) role = "User";
                else if (tag.includes('model') || tag.includes('response') || cls.includes('model')) role = "Model";
                else {
                    // 盲扫模式下的交替猜测：偶数是 User，奇数是 Model (通常如此)
                    // 或者根据对齐方式判断 (align-right 通常是 user)
                    if (window.getComputedStyle(turn).justifyContent === 'flex-end') role = "User";
                    else role = "Model";
                }
                
                if (role === 'User') userCount++; else modelCount++;

                let text = extractMarkdownFromElement(turn);
                if (text && text.trim()) {
                    mdContent += `**${role}:**\n\n${text}\n\n---\n\n`;
                }
            });

            console.log(`Exported: ${userCount} User turns, ${modelCount} Model turns`);

            const blob = new Blob([mdContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Chat_Export_${new Date().toISOString().slice(0,19).replace(/T|:/g, '-')}.md`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('Export Error: ' + e.message);
        } finally {
            document.body.classList.remove('is-exporting'); // 恢复冻结
            btnText.textContent = originalText;
        }
    }

    function extractMarkdownFromElement(root) {
        let text = "";
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.parentNode && ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.parentNode.tagName)) continue;
                if (node.textContent.trim().length === 0) continue;
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName.toLowerCase() === 'mat-expansion-panel-header') {
                    const langSpan = node.querySelector('.mat-expansion-panel-header-title > span:nth-child(2)');
                    const lang = langSpan ? langSpan.textContent.trim() : '';
                    text += `\n\`\`\`${lang}\n`;
                }
                const display = window.getComputedStyle(node).display;
                if (display === 'block' || display === 'flex' || node.tagName === 'BR' || node.tagName === 'P') text += '\n';
            }
        }
        return text.trim();
    }

    // ================= Core Logic =================

    // 寻找滚动容器 (用于优化 Booster 性能，不影响发现 turns)
    function findScrollContainer() {
        let candidate = document.querySelector('.layout-main');
        if (candidate && window.getComputedStyle(candidate).overflowY.includes('scroll')) return candidate;
        const allDivs = document.querySelectorAll('div, main');
        for (let div of allDivs) {
            const style = window.getComputedStyle(div);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight) {
                return div;
            }
        }
        return null;
    }

    let scrollRoot = findScrollContainer();

    const boosterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            if (entry.isIntersecting) {
                if (el.classList.contains('boost-frozen')) {
                    el.classList.remove('boost-frozen');
                    el.style.containIntrinsicSize = '';
                    el.style.height = '';
                    stats.frozen--;
                }
            } else {
                const rect = entry.boundingClientRect;
                if (rect.height > CONFIG.minItemHeight) {
                    el.style.containIntrinsicSize = `${rect.width}px ${rect.height}px`;
                    el.style.height = `${rect.height}px`;
                    if (!el.classList.contains('boost-frozen')) {
                        el.classList.add('boost-frozen');
                        stats.frozen++;
                    }
                }
            }
        });
        updateMenuStats();
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
                    header.dataset.collapseTimer = setTimeout(() => {
                        if (header.isConnected && header.getAttribute('aria-expanded') === 'true') {
                            header.click();
                        }
                    }, CONFIG.collapseDelay);
                }
            }
        });
    }, { root: null, threshold: 0 });

    function scan() {
        createDock(); 
        const currentRoot = findScrollContainer();
        if (currentRoot !== scrollRoot && currentRoot !== null) scrollRoot = currentRoot;

        // 使用统一的逻辑获取 turns
        const targets = getAllTurns();

        targets.forEach(el => {
            if (!boosterSet.has(el)) {
                const tag = el.tagName;
                if (el.closest('code') || el.closest('pre')) return;

                boosterObserver.observe(el);
                boosterSet.add(el);
                stats.total++;
            }
        });

        if (CONFIG.autoCollapse) {
            const headers = queryDeepAll(document.body, CONFIG.codeHeaderSelector);
            headers.forEach(h => {
                if (!codeSet.has(h)) {
                    collapseObserver.observe(h);
                    codeSet.add(h);
                    stats.code++;
                }
            });
        }
        updateMenuStats();
    }

    scan();
    setInterval(scan, 2000);

})();