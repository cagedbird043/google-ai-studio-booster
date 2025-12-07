// ==UserScript==
// @name         Google AI Studio Performance Booster (v18.0 Stable)
// @namespace    http://branch.root/
// @version      18.0
// @description  [RootBranch] 生产环境版本。无感冻结后台对话，自动折叠代码块，极致性能优化。
// @author       Branch of Root
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ================= ⚙️ 生产环境配置 =================
    const CONFIG = {
        // 冻结缓冲区：600px (约一屏高度)
        // 既能省 CPU，又能保证往回滚时大概率已经预渲染好了，看不到白屏
        boosterRootMargin: '600px 0px 600px 0px',

        minItemHeight: 50,

        autoCollapse: true,
        collapseDelay: 2000,
        codeHeaderSelector: 'mat-expansion-panel-header',

        // 🔴 关闭调试模式：不再显示红绿框，还原原生体验
        visualDebug: false
    };

    // --- 📝 日志 ---
    const ANCHOR = '[RootBranch]';
    const LOG_STYLE = 'color: #00ff9d; font-weight: bold; background: #003300; padding: 2px 4px; border-radius: 3px;';
    function log(msg, ...args) { console.log(`%c${ANCHOR} ${msg}`, LOG_STYLE, ...args); }

    // --- UI: HUD (极简模式) ---
    const hud = document.createElement('div');
    hud.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 9999;
        background: rgba(0,0,0,0.7); color: #fff; font-family: monospace; font-size: 11px;
        padding: 4px 8px; border-radius: 4px; pointer-events: none; opacity: 0.6;
        transition: opacity 0.3s;
    `;
    hud.textContent = `Booster v18`;
    document.body.appendChild(hud);

    // 鼠标悬停时显示详细信息，平时半透明
    hud.addEventListener('mouseenter', () => hud.style.opacity = 1);
    hud.addEventListener('mouseleave', () => hud.style.opacity = 0.6);

    // --- CSS ---
    const style = document.createElement('style');
    style.textContent = `
        /* 核心优化：移出渲染树，但保留布局占位 */
        .boost-frozen {
            content-visibility: hidden !important;
            contain: size layout style !important;
        }

        /* 仅在调试模式下生效的样式 */
        ${CONFIG.visualDebug ? `
            .boost-debug-active { border-left: 4px solid #4caf50 !important; }
            .boost-frozen.boost-debug-active {
                border-left: 4px solid #f44336 !important;
                background: repeating-linear-gradient(45deg, #333, #333 10px, #444 10px, #444 20px) !important;
                opacity: 0.5 !important;
            }
        ` : ''}
    `;
    document.head.appendChild(style);

    // ================= 1. 智能容器锁定 =================
    // 自动寻找页面上正在滚动的那个容器
    function findScrollContainer() {
        // 优先检查 AI Studio 的特定结构
        let candidate = document.querySelector('.layout-main');
        if (candidate && window.getComputedStyle(candidate).overflowY.includes('scroll')) return candidate;

        // 兜底：找最大的滚动容器
        const allDivs = document.querySelectorAll('div, main');
        for (let div of allDivs) {
            const style = window.getComputedStyle(div);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight) {
                return div;
            }
        }
        return null; // Fallback to viewport
    }

    // ================= 2. Booster Engine =================

    let stats = { frozen: 0, total: 0, code: 0 };
    let boosterSet = new WeakSet();
    let scrollRoot = findScrollContainer();

    if (scrollRoot) log(`🎯 锁定滚动容器: .${scrollRoot.className}`);

    const boosterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            if (entry.isIntersecting) {
                // 解冻
                if (el.classList.contains('boost-frozen')) {
                    el.classList.remove('boost-frozen');
                    el.style.containIntrinsicSize = '';
                    el.style.height = '';
                    stats.frozen--;
                }
            } else {
                // 冻结
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
        updateHUD();
    }, {
        root: scrollRoot,
        rootMargin: CONFIG.boosterRootMargin,
        threshold: 0
    });

    // ================= 3. Collapser Engine =================

    let codeSet = new WeakSet();
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

    // ================= 4. Scanner =================

    function updateHUD() {
        hud.textContent = `Booster: ${stats.frozen}/${stats.total} | Code: ${stats.code}`;
        hud.style.color = stats.frozen > 0 ? '#4caf50' : '#fff';
    }

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

    function scan() {
        // 动态检查容器变化
        const currentRoot = findScrollContainer();
        if (currentRoot !== scrollRoot && currentRoot !== null) {
            scrollRoot = currentRoot;
            // 生产环境不频繁打印日志，保持控制台干净
        }

        // 扫描对话
        let targets = queryDeepAll(document.body, 'ms-turn, ms-response, .turn-container, ms-user-turn, ms-model-turn');

        // 盲扫兜底
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
                if (CONFIG.visualDebug) el.classList.add('boost-debug-active');
                stats.total++;
            }
        });

        // 扫描代码
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
        updateHUD();
    }

    log('v18.0 Production Started');
    scan();
    setInterval(scan, 2000);

})();