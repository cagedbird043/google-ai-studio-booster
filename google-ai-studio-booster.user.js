// ==UserScript==
// @name         Google AI Studio Performance Booster (v10.0 Final)
// @namespace    http://branch.root/
// @version      10.0
// @description  自动探测并冻结后台对话块，显著降低 CPU 占用。包含 HUD 状态显示。
// @author       Branch of Root
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ================= ⚙️ 最终配置 =================
    const CONFIG = {
        scrollContainerSelector: '.layout-main',
        minItemHeight: 50, // 忽略太矮的元素
        // 缓冲区：上下各留 1.5 屏高度保持渲染，保证回滚时无白屏感
        // 如果你觉得还是有点卡，可以把这个数字改小（比如 800px），冻结会更积极
        rootMargin: '1500px 0px 1500px 0px',
        debugMode: false // 🔴 关闭调试蓝框，还你清爽界面
    };
    // ===========================================

    // --- UI: 极简状态面板 (HUD) ---
    const hud = document.createElement('div');
    hud.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 9999;
        background: rgba(0,0,0,0.7); color: #aaa; font-family: monospace;
        padding: 4px 8px; border-radius: 4px; font-size: 11px;
        pointer-events: none; user-select: none; backdrop-filter: blur(2px);
    `;
    hud.textContent = '初始化...';
    document.body.appendChild(hud);

    // --- Core: 样式注入 ---
    const style = document.createElement('style');
    style.textContent = `
        /* 冻结状态：移出渲染树，保留占位 */
        .boost-frozen {
            content-visibility: hidden !important;
            contain: size layout style !important;
        }
    `;
    document.head.appendChild(style);

    // --- Core: 视口观察者 (性能核心) ---
    let activeFrozen = 0;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            if (entry.isIntersecting) {
                // [解冻] 进入缓冲区，恢复渲染
                if (el.classList.contains('boost-frozen')) {
                    el.classList.remove('boost-frozen');
                    // 移除强制尺寸，允许内容高度自适应变化
                    el.style.containIntrinsicSize = '';
                    el.style.height = '';
                    activeFrozen--;
                }
            } else {
                // [冻结] 滚出缓冲区，停止渲染
                const rect = entry.boundingClientRect;
                // 双重检查高度，防止冻结了刚生成的 0 高度元素
                if (rect.height > CONFIG.minItemHeight) {
                    // 📸 关键：拍摄高度快照，防止滚动条抖动
                    el.style.containIntrinsicSize = `${rect.width}px ${rect.height}px`;
                    el.style.height = `${rect.height}px`;
                    el.classList.add('boost-frozen');
                    activeFrozen++;
                }
            }
        });
        updateHUD();
    }, {
        root: document.querySelector(CONFIG.scrollContainerSelector),
        rootMargin: CONFIG.rootMargin,
        threshold: 0
    });

    // --- Logic: 智能雷达系统 ---
    let currentTargetContainer = null;
    let observedCount = 0;
    let observedSet = new WeakSet();

    function updateHUD() {
        // 只有当有冻结元素时才高亮显示，平时保持低调
        const color = activeFrozen > 0 ? '#4caf50' : '#aaa';
        hud.style.color = color;
        hud.style.border = activeFrozen > 0 ? '1px solid #4caf50' : 'none';
        hud.textContent = `Booster: ${activeFrozen} / ${observedCount} ❄️`;
    }

    // 寻找最佳容器算法
    function findBestContainer(root) {
        let best = null;
        let maxCount = 0;

        function traverse(node) {
            if (!node || node.nodeType !== 1) return;

            const children = node.children;
            if (children && children.length > 2) {
                let validCount = 0;
                for (let i = 0; i < children.length; i++) {
                    const tag = children[i].tagName;
                    // 只要是像样的块级元素就算
                    if (tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'SPAN') {
                        validCount++;
                    }
                }
                if (validCount > maxCount) {
                    maxCount = validCount;
                    best = node;
                }
            }

            if (node.shadowRoot) traverse(node.shadowRoot);

            // 性能优化：只遍历前几层，避免深层递归卡死
            // 大多数对话容器都在较浅的层级
            if (children.length < 50) {
                for (let i = 0; i < children.length; i++) traverse(children[i]);
            }
        }

        traverse(root);
        return best;
    }

    function radarScan() {
        const root = document.querySelector(CONFIG.scrollContainerSelector) || document.body;

        // 1. 如果当前没锁定容器，或者容器被销毁了，重新搜索
        if (observedCount === 0 || !currentTargetContainer || !currentTargetContainer.isConnected) {
            const best = findBestContainer(root);
            if (best && best !== currentTargetContainer) {
                // console.log("📡 [Booster] 锁定新容器:", best);
                currentTargetContainer = best;
            }
        }

        // 2. 将容器内的新元素加入监控
        if (currentTargetContainer) {
            const children = currentTargetContainer.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (!observedSet.has(child)) {
                    const tag = child.tagName;
                    if (tag !== 'STYLE' && tag !== 'SCRIPT' && tag !== 'LINK') {
                        observer.observe(child);
                        observedSet.add(child);
                        observedCount++;
                    }
                }
            }
        }
        updateHUD();
    }

    // --- 启动 ---
    function start() {
        radarScan();
        // 低频轮询，确保新生成的对话能被抓到
        setInterval(radarScan, 2000);
    }

    setTimeout(start, 2000);

})();