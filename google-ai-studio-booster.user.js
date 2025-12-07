// ==UserScript==
// @name         Google AI Studio Performance Booster (v20.0 Floating Dock)
// @namespace    http://branch.root/
// @version      20.0
// @description  [RootBranch] 独立悬浮坞UI。核心冻结引擎+Markdown导出。解决UI消失问题。
// @author       Branch of Root
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ================= ⚙️ 配置 =================
    const CONFIG = {
        boosterRootMargin: '600px 0px 600px 0px', // 冻结缓冲区
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
        /* 核心优化：冻结样式 */
        .boost-frozen {
            content-visibility: hidden !important;
            contain: size layout style !important;
        }
        /* 导出时强制解冻 */
        body.is-exporting .boost-frozen {
            content-visibility: visible !important;
            contain: none !important;
        }

        /* v20 UI: 左下角悬浮坞 */
        #booster-dock {
            position: fixed; bottom: 20px; left: 20px; z-index: 99999;
            display: flex; flex-direction: column; gap: 8px;
            font-family: 'Google Sans', 'Roboto', sans-serif;
        }

        /* 主按钮 */
        #booster-main-btn {
            background: #fff; border: 1px solid #dadce0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 24px; padding: 8px 16px;
            display: flex; align-items: center; gap: 8px;
            cursor: pointer; transition: all 0.2s;
            color: #3c4043; font-size: 13px; font-weight: 500;
        }
        #booster-main-btn:hover { background: #f8f9fa; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
        
        /* 状态指示灯 */
        .status-dot {
            width: 8px; height: 8px; border-radius: 50%; background: #ccc;
            transition: background 0.3s;
        }
        .status-dot.active { background: #1e8e3e; box-shadow: 0 0 4px #1e8e3e; }

        /* 菜单 (向上弹出) */
        #booster-menu {
            background: #fff; border: 1px solid #dadce0;
            border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden; display: none; flex-direction: column;
            margin-bottom: 8px; min-width: 180px;
        }
        #booster-menu.show { display: flex; animation: slideUp 0.2s ease-out; }
        
        .menu-item {
            padding: 10px 16px; font-size: 13px; color: #3c4043; cursor: pointer;
            display: flex; align-items: center; gap: 10px; transition: background 0.1s;
        }
        .menu-item:hover { background: #f1f3f4; }
        .menu-divider { height: 1px; background: #f1f3f4; margin: 2px 0; }
        .menu-info { font-size: 11px; color: #70757a; padding: 4px 16px 8px; }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // ================= UI Module: 悬浮坞 (Floating Dock) =================

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
                    Frozen: 0/0
                </div>
            </div>
            <div id="booster-main-btn">
                <div class="status-dot"></div>
                <span>Booster Console</span>
            </div>
        `;

        document.body.appendChild(dock);

        const mainBtn = dock.querySelector('#booster-main-btn');
        const menu = dock.querySelector('#booster-menu');
        const exportBtn = dock.querySelector('#btn-export');

        // Toggle Menu
        mainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');
            updateMenuStats();
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!dock.contains(e.target)) menu.classList.remove('show');
        });

        // Export Action
        exportBtn.addEventListener('click', () => {
            menu.classList.remove('show');
            handleExport();
        });
    }

    function updateUI() {
        const dot = document.querySelector('.status-dot');
        const statText = document.getElementById('menu-stats');
        
        if (dot) {
            if (stats.frozen > 0) dot.classList.add('active');
            else dot.classList.remove('active');
        }
        if (statText) {
            updateMenuStats();
        }
    }

    function updateMenuStats() {
        const statText = document.getElementById('menu-stats');
        if (statText) {
            statText.textContent = `Frozen: ${stats.frozen}/${stats.total} | Code: ${stats.code}`;
        }
    }

    // ================= Feature: Markdown Exporter =================

    async function handleExport() {
        const btnText = document.querySelector('#booster-main-btn span');
        const originalText = btnText.textContent;
        btnText.textContent = '⏳ Exporting...';

        document.body.classList.add('is-exporting'); // 强制解冻
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 150)); 

        try {
            let mdContent = "";
            const turns = queryDeepAll(document.body, 'ms-turn, ms-response, .turn-container, ms-user-turn, ms-model-turn');
            
            turns.forEach(turn => {
                let role = "Unknown";
                const tag = turn.tagName.toLowerCase();
                if (tag.includes('user') || turn.className.includes('user')) role = "User";
                else if (tag.includes('model') || tag.includes('response') || turn.className.includes('model')) role = "Model";
                
                let text = extractMarkdownFromElement(turn);
                if (text.trim()) mdContent += `**${role}:**\n\n${text}\n\n---\n\n`;
            });

            const blob = new Blob([mdContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `AI_Studio_Chat_${new Date().toISOString().slice(0,19).replace(/T|:/g, '-')}.md`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('Export Error');
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
                if (node.parentNode && ['SCRIPT', 'STYLE'].includes(node.parentNode.tagName)) continue;
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
        createDock(); // 确保 UI 永远在
        
        const currentRoot = findScrollContainer();
        if (currentRoot !== scrollRoot && currentRoot !== null) scrollRoot = currentRoot;

        let targets = queryDeepAll(document.body, 'ms-turn, ms-response, .turn-container, ms-user-turn, ms-model-turn');
        if (targets.length === 0) {
            let best = null, max = 0;
            document.querySelectorAll('div').forEach(d => {
                if(d.children.length > max && !d.tagName.includes('CODE')) { max = d.children.length; best = d; }
            });
            if (best) targets = Array.from(best.children);
        }

        targets.forEach(el => {
            if (!boosterSet.has(el)) {
                const tag = el.tagName;
                if (['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(tag)) return;
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
        updateUI();
    }

    scan();
    setInterval(scan, 2000);

})();