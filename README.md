# 🚀 Google AI Studio Performance Booster

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 让 200k+ tokens 的超长对话也能丝滑滚动

## 😤 痛点 (The Pain)

当上下文达到 **200k+ tokens** 时，Google AI Studio 网页版会因为渲染数万个 DOM 节点导致 CPU 满载（Ryzen 7840H 都会起飞），页面卡顿严重。

## 💡 方案 (The Solution)

本脚本不依赖具体的 Class Name（抗混淆），使用**启发式雷达算法**自动锁定对话容器，利用 `IntersectionObserver` 和 `content-visibility` 技术，动态"冻结"视口外的对话块。

## ✨ 效果 (Result)

- ⚡ DOM 节点渲染开销降低 **90%**
- 🎯 即使 1000 条对话历史，滚动依然丝滑
- ⌨️ 彻底解决打字卡顿

## 📦 安装 (Installation)

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)
2. 点击 [这里](google-ai-studio-booster.user.js) 查看脚本，然后点击 "Raw" 按钮安装
3. 访问 [Google AI Studio](https://aistudio.google.com/) 即可自动生效

## 🛠️ 配置 (Configuration)

脚本顶部提供可调参数：

```javascript
const CONFIG = {
  rootMargin: "1500px 0px 1500px 0px", // 缓冲区大小，调小会更积极冻结
  debugMode: false, // 开启后显示调试蓝框
};
```

## 📄 License

[MIT](LICENSE) © Branch of Root
