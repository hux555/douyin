// ==UserScript==
// @name         抖音|快手全屏优化&自动清屏&零闪烁跳过广告-抖音|快手网页版优化
// @version      3.3.0
// @author       akace
// @description  抖音|快手网页版全屏优化 16:9 显示，API级拦截+DOM预判双保险零闪烁自动跳过广告/直播/购物/小黄车视频、自动清屏/自动选择智能分辨率/隐藏控制栏/侧边栏/搜索栏 (v3.3 抢占式零闪版)
// @icon         https://www.douyin.com/favicon.ico
// @match        *://*.douyin.com/*
// @match        *://*.iesdouyin.com/*
// @exclude      *://lf-zt.douyin.com*
// @match        *://*.kuaishou.com/*
// @license      GPL-3.0 License
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addStyle
// @namespace    https://greasyfork.org/scripts/508672
// @supportURL   https://github.com/akFace/userScript
// @homepageURL  https://github.com/akFace/userScript
// ==/UserScript==

(() => {
  "use strict";

  // ======================== 配置与状态 ========================
  const CONFIG_KEYS = {
    side: "J_side_bar_show",
    clearTime: "J_clsear_time",
    skipAd: "J_skip_ad_enabled",
    skipLive: "J_skip_live_enabled",
    skipShop: "J_skip_shop_enabled",
    debug: "J_debug_mode",
  };

  const ConstClearTime = 2000;
  let clearTs = parseInt(localStorage.getItem(CONFIG_KEYS.clearTime));
  if (clearTs !== 0 && !clearTs) clearTs = ConstClearTime;

  const state = {
    showSide: localStorage.getItem(CONFIG_KEYS.side) === "true",
    clearTime: clearTs,
    skipAd: localStorage.getItem(CONFIG_KEYS.skipAd) !== "false",
    skipLive: localStorage.getItem(CONFIG_KEYS.skipLive) === "true",
    skipShop: localStorage.getItem(CONFIG_KEYS.skipShop) !== "false",
    debug: localStorage.getItem(CONFIG_KEYS.debug) !== "false", // 默认开
  };

  // ======================== 调试日志 ========================
  const TAG = "%c[无广告抖音 v3.3]";
  const TAG_STYLE = "color:#ff0050;font-weight:bold;background:#fff0f3;padding:2px 6px;border-radius:4px;";
  const SUB = {
    api: "color:#0088ff;font-weight:bold",
    dom: "color:#ff8800;font-weight:bold",
    skip: "color:#00aa44;font-weight:bold",
    res: "color:#aa00aa;font-weight:bold",
    time: "color:#666;font-style:italic",
    cart: "color:#ffaa00;font-weight:bold", // 小黄车专属
  };
  function ts() {
    const d = new Date();
    return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
  }
  function dlog(sub, ...args) {
    if (!state.debug) return;
    const style = sub ? SUB[sub] || "" : "";
    console.log(`${TAG} %c${sub ? "[" + sub.toUpperCase() + "] " : ""}[${ts()}]`, TAG_STYLE, style, ...args);
  }
  function dwarn(...args) {
    if (!state.debug) return;
    console.warn(`${TAG} %c[WARN] [${ts()}]`, TAG_STYLE, "color:#ffaa00;font-weight:bold", ...args);
  }
  function derr(...args) {
    console.error(`${TAG} %c[ERROR] [${ts()}]`, TAG_STYLE, "color:#ff0000;font-weight:bold", ...args);
  }
  function timeit(label) {
    const start = performance.now();
    return {
      end: (extra) => {
        const cost = (performance.now() - start).toFixed(2);
        dlog("time", `${label} 耗时 ${cost}ms${extra ? " — " + extra : ""}`);
      }
    };
  }

  dlog(null, `启动 | 调试=${state.debug} | 跳广告=${state.skipAd} 跳直播=${state.skipLive} 跳购物(小黄车)=${state.skipShop} 清屏=${state.clearTime}ms`);

  // ======================== 油猴菜单 ========================
  GM_registerMenuCommand(
    state.skipAd ? "⚡ 自动跳过广告：【已开启】" : "⚡ 自动跳过广告：【已关闭】",
    () => { state.skipAd = !state.skipAd; localStorage.setItem(CONFIG_KEYS.skipAd, state.skipAd); location.reload(); }
  );
  GM_registerMenuCommand(
    state.skipLive ? "📺 自动跳过直播：【已开启】" : "📺 自动跳过直播：【已关闭】",
    () => { state.skipLive = !state.skipLive; localStorage.setItem(CONFIG_KEYS.skipLive, state.skipLive); location.reload(); }
  );
  GM_registerMenuCommand(
    state.skipShop ? "🛒 自动跳过小黄车/购物：【已开启】" : "🛒 自动跳过小黄车/购物：【已关闭】",
    () => { state.skipShop = !state.skipShop; localStorage.setItem(CONFIG_KEYS.skipShop, state.skipShop); location.reload(); }
  );
  GM_registerMenuCommand(
    state.showSide ? "💡隐藏侧边栏" : "💡显示侧边栏",
    () => { state.showSide = !state.showSide; localStorage.setItem(CONFIG_KEYS.side, state.showSide); updateStyle(); location.reload(); }
  );
  GM_registerMenuCommand("⏳设置自动清屏倒计时(0=关闭)", () => {
    const input = prompt(`自动清屏倒计时(ms)，当前: ${state.clearTime}ms，0=关闭`, state.clearTime);
    const value = parseInt(input);
    if (!isNaN(value)) { localStorage.setItem(CONFIG_KEYS.clearTime, value); state.clearTime = value; location.reload(); }
  });
  GM_registerMenuCommand(
    state.debug ? "🔍 调试模式：【已开启】(点这里关闭)" : "🔍 调试模式：【已关闭】(点这里开启)",
    () => { state.debug = !state.debug; localStorage.setItem(CONFIG_KEYS.debug, state.debug); location.reload(); }
  );

  // ======================== 样式注入 ========================
  updateStyle();
  function updateStyle() {
    const style_Add = document.createElement("style");
    const hideSide = `.isCssFullScreen .positionBox{opacity: 0!important;} .isCssFullScreen .xgplayer-inactive .positionBox{opacity: 0!important;}`;
    const showSide = `.slider-video .positionBox{visibility:visible!important;opacity: 1!important;display:flex!important;} .slider-video .positionBox .immersive-player-switch-on-hide-interaction-area{visibility:visible!important;opacity: 1!important;display:flex!important;}`;
    style_Add.innerHTML = `
      .isCssFullScreen .xg-video-container{bottom: 0!important;}
      .isCssFullScreen .xgplayer-inactive .xg-inner-controls{opacity: 0!important;}
      .isCssFullScreen .xg-inner-controls{opacity: 1;}
      .isCssFullScreen .positionBox{opacity: 1;}
      .isCssFullScreen .immersive-player-switch-on-hide-video-info.xgplayer-inactive .xgplayer-controls{background:none!important;}
      .isCssFullScreen .xgplayer-inactive.xgplayer.xgplayer-pc.xgplayer-pc .xgplayer-controls{background:none!important;}
      #video-info-wrap .video-info-mask{background:none!important;}
      .xgplayer-fullscreen-parent .uRH5Oxnw{display:none!important;}
      .xgplayer-fullscreen-parent .RHEfidGv.A0ANJEK_{display:none!important;}
      .wb-content.fullScreen .kplayer-video{padding-bottom: 0!important;}
      .wb-content.fullScreen .lb{opacity: 0;}
      .wb-content.fullScreen .control-area{opacity: 0;}
      .wb-content.fullScreen .rb{opacity: 0;}
      .wb-content.fullScreen .expand-btn.circle-btn{opacity: 0;}
      .js-ks-show .wb-content.fullScreen .lb{opacity: 1!important;}
      .js-ks-show .wb-content.fullScreen .control-area{opacity: 1!important;}
      .js-ks-show .wb-content.fullScreen .rb{opacity: 1!important;}
      .js-ks-show .wb-content.fullScreen .expand-btn.circle-btn{opacity: 1!important;}
      .player-pop.isFullScreen .kplayer-video{padding-bottom: 0!important;}
      .player-pop.isFullScreen .lb{opacity: 0;}
      .player-pop.isFullScreen .control-area{opacity: 0;}
      .player-pop.isFullScreen .rb{opacity: 0;}
      .player-pop.isFullScreen .close.circle-btn{opacity: 0;}
      .player-pop.isFullScreen .expand-btn.circle-btn{opacity: 0;}
      .js-ks-show .player-pop .lb{opacity: 1!important;}
      .js-ks-show .player-pop .control-area{opacity: 1!important;}
      .js-ks-show .player-pop .rb{opacity: 1!important;}
      .js-ks-show .player-pop.isFullScreen .close.circle-btn{opacity: 1!important;}
      .js-ks-show .player-pop.isFullScreen .expand-btn.circle-btn{opacity: 1!important;}
      [data-ad-blocked="true"]{display:none!important;}
      :fullscreen #RightBackgroundLayout,
      :-webkit-full-screen #RightBackgroundLayout,
      .xgplayer-is-fullscreen #RightBackgroundLayout { display: none !important; }
      :fullscreen .jf2XNxdH.Kt2MfBAz,
      :-webkit-full-screen .jf2XNxdH.Kt2MfBAz,
      .xgplayer-is-fullscreen .jf2XNxdH.Kt2MfBAz { display: none !important; }
      :fullscreen #ContainerBackgroundLayout,
      .xgplayer-is-fullscreen #ContainerBackgroundLayout { width: 100% !important; flex: 1 !important; }
      ${state.showSide ? showSide : hideSide}
    `;
    if (document.head) {
      document.head.appendChild(style_Add);
    } else {
      const t = setInterval(() => {
        if (document.head) {
          document.head.appendChild(style_Add);
          clearInterval(t);
        }
      });
    }
  }

  // ================================================================
  //  第一层防线：API 响应拦截（异步、不破坏流式读取）
  // ================================================================
  let apiFilteredCount = 0;
  let apiInterceptedCount = 0;

  // ===== 旧规则：广告 =====
  function isAdItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.is_ads || item.is_ad) return true;
    if (item.ad_info || item.raw_ad_data || item.commercial_info) return true;
    if (item.aweme_type === 109) return true;
    if (item.cell_type === 60 || item.cell_type === 61) return true;
    if (item.video_tag && Array.isArray(item.video_tag)) {
      for (const tag of item.video_tag) {
        if (tag.tag_name && /广告|推广|赞助/.test(tag.tag_name)) return true;
      }
    }
    if (item.ad_tag_text || item.ad_tag) return true;
    if (item.promotion_info || item.promotions || item.commerce_info) return true;
    return false;
  }

  // ===== 旧规则：直播 =====
  function isLiveItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.aweme_type === 101 || item.aweme_type === 200) return true;
    if (item.cell_type === 30) return true;
    if (item.rawdata && item.rawdata.includes && item.rawdata.includes('直播')) return true;
    if (item.room_id) return true;
    return false;
  }

  // ===== v3.2 重点：购物 / 小黄车（严格精确版 — 杜绝误伤主页/关注） =====
  // 教训：aweme_luban_schema 是很长的元数据 JSON，模糊关键词必误伤
  // 教训：/aweme/post/、/locate/post/、/follow/ 不是推荐流，不要拦截
  // 策略：只信任精确布尔位、精确枚举值、精确 type 字符串
  function isShopItem(item) {
    if (!item || typeof item !== 'object') return false;

    // 1. 精确枚举：抖音小黄车视频的官方 aweme_type
    if (item.aweme_type === 150 || item.aweme_type === 68) return true;
    if (item.cell_type === 31) return true; // 购物 cell（保留）

    // 2. commerce_info 仅信任 is_commerce 显式布尔
    if (item.commerce_info && item.commerce_info.is_commerce === true) return true;

    // 3. anchor_info.type 精确匹配（仅枚举值，不模糊）
    if (item.anchor_info && item.anchor_info.type === 'shopping') return true;

    // 4. 显式布尔位
    if (item.is_ecommerce === true) return true;
    if (item.has_mall === true) return true;
    if (item.is_ads === true && item.anchor_info) return true; // 关联广告 + 挂件

    // ⚠️ 移除：aweme_luban_schema 模糊匹配（v3.0 误伤 24 条正常视频）
    // ⚠️ 移除：video_text 文本匹配（容易误伤）
    // ⚠️ 移除：commerce_type 存在性判定（正常视频也可能带）
    // ⚠️ 移除：adv_promotion / commerce_card 存在性判定（误伤率高）

    return false;
  }

  function filterAwemeList(data, srcUrl) {
    if (!data || typeof data !== 'object') return data;
    const list = data.aweme_list || data.data;
    if (!Array.isArray(list)) return data;

    const key = data.aweme_list ? 'aweme_list' : 'data';
    const originalLen = list.length;
    const t = timeit("filterAwemeList");
    const reasons = { ad: 0, live: 0, shop: 0 };
    const samples = { ad: null, live: null, shop: null };

    const filtered = list.filter(item => {
      if (state.skipAd && isAdItem(item)) {
        reasons.ad++;
        if (!samples.ad) samples.ad = item.aweme_id || item.id || '?';
        return false;
      }
      if (state.skipLive && isLiveItem(item)) {
        reasons.live++;
        if (!samples.live) samples.live = item.aweme_id || item.id || '?';
        return false;
      }
      if (state.skipShop && isShopItem(item)) {
        reasons.shop++;
        if (!samples.shop) samples.shop = item.aweme_id || item.id || '?';
        return false;
      }
      return true;
    });

    const removed = originalLen - filtered.length;
    if (removed > 0) {
      apiFilteredCount += removed;
      data[key] = filtered;
      t.end(`${originalLen}→${filtered.length} ad:${reasons.ad} live:${reasons.live} shop:${reasons.shop} url=${shortUrl(srcUrl)}`);
      dlog("api", `✅ 拦截 ${removed} 条 (累计 ${apiFilteredCount})`, reasons,
        samples.ad ? `广告ID=${samples.ad}` : '',
        samples.live ? `直播ID=${samples.live}` : '',
        samples.shop ? `购物ID=${samples.shop}` : ''
      );
    }
    return data;
  }

  function shortUrl(u) {
    if (!u) return '';
    return u.replace(/^https?:\/\//, '').split('?')[0];
  }

  // 抓取推荐 feed 类请求：放宽匹配（抖音现在很多 URL 不再以 feed 结尾）
  // 第一闸：路径含 /aweme/v[12]/web/ 或 /tiktok/v\d+/feed
  function isFeedPath(url) {
    if (!url || typeof url !== 'string') return false;
    return /\/aweme\/v[12]\/web\//.test(url) || /\/tiktok\/v\d+\/feed/.test(url);
  }

  // 第二闸：必须路径里"明显是推荐流"才改写
  // 黑名单关键词：post（主页/作品列表）、locate、follow、notification、discover/search、favorite
  // 抖音里面"作品列表"接口就是 /aweme/post/，里面全是正常视频，绝不能删
  function isRecommendPath(url) {
    if (!url || typeof url !== 'string') return false;
    // 必须含以下任意一个才算推荐流
    return /\/aweme\/v[12]\/web\/(tab\/feed|feed|recommend|channel\/feed|related\/recommend|search\/item|hot\/search\/board|home\/recommend)/.test(url)
      || /\/aweme\/v[12]\/web\/aweme\/post\?.*publish_video_strategy_type/.test(url) // 推荐流变种
      || /\/tiktok\/v\d+\/feed/.test(url);
  }

  // 第三闸：拿到 body 后判定是不是"含 aweme_list 的推荐流"
  function looksLikeFeedJson(json) {
    if (!json || typeof json !== 'object') return false;
    if (Array.isArray(json.aweme_list)) return json.aweme_list.length > 0;
    if (Array.isArray(json.data) && json.data.length > 0) {
      const first = json.data[0];
      if (first && (first.aweme_id || first.video || first.video_id || first.play_addr)) return true;
    }
    if (json.status_code === 0 && (json.aweme_list || json.data)) return true;
    return false;
  }

  // --- Fetch 拦截（v3.1：恢复改写，用 Response 包装）---
  const _origFetch = window.fetch;
  window.fetch = function (resource, init) {
    let url = '';
    try {
      url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
    } catch (e) { return _origFetch.call(this, resource, init); }
    if (!isFeedPath(url) || !isRecommendPath(url)) {
      // 非推荐流（主页作品列表/关注/搜索/通知等）— 只统计不拦截
      if (isFeedPath(url)) dlog("api", `⏭️ 跳过非推荐流: ${shortUrl(url)}`);
      return _origFetch.call(this, resource, init);
    }

    apiInterceptedCount++;
    dlog("api", `📡 fetch 命中 #${apiInterceptedCount} url=${shortUrl(url)}`);

    return _origFetch.call(this, resource, init).then(response => {
      // 检查是否是 JSON
      const ct = response.headers.get('content-type') || '';
      if (ct.indexOf('json') === -1) return response;

      // 用 clone() 读一份，原始 response 流不动
      return response.clone().text().then(text => {
        let json;
        try { json = JSON.parse(text); } catch (e) { return response; }
        if (!looksLikeFeedJson(json)) return response;

        // 真的改：构造新 Response，把过滤后的 body 塞进去
        const filtered = filterAwemeList(json, url);
        const newBody = JSON.stringify(filtered);
        return new Response(newBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }).catch((e) => {
        derr("fetch 改写失败", e);
        return response;
      });
    });
  };

  // --- XMLHttpRequest 拦截（v3.1：恢复改写，用 defineProperty）---
  const _origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._fd_url = url;
    return _origXHROpen.call(this, method, url, ...rest);
  };

  const _origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    // 必须是推荐流才拦截，否则主页/关注/搜索的 aweme/post 会被误删
    if (this._fd_url && isFeedPath(this._fd_url) && isRecommendPath(this._fd_url)) {
      this.addEventListener('readystatechange', function () {
        if (this.readyState === 4) {
          try {
            let json = JSON.parse(this.responseText);
            if (!looksLikeFeedJson(json)) return;
            const before = (json.aweme_list || json.data || []).length;
            const filtered = filterAwemeList(json, this._fd_url);
            const after = (filtered.aweme_list || filtered.data || []).length;
            if (after < before) {
              // 改写响应：让播放器读到的是过滤后的 aweme_list
              const newText = JSON.stringify(filtered);
              try {
                Object.defineProperty(this, 'responseText', {
                  value: newText, writable: false, configurable: true
                });
                Object.defineProperty(this, 'response', {
                  value: JSON.parse(newText), writable: false, configurable: true
                });
                dlog("api", `✏️ XHR 改写成功: ${before}→${after} url=${shortUrl(this._fd_url)}`);
              } catch (defineErr) {
                // 极少数情况下属性不可重定义，try 一下 configurable:true 的写法
                try {
                  Object.defineProperty(this, 'responseText', { value: newText, configurable: true, writable: true });
                  Object.defineProperty(this, 'response', { value: JSON.parse(newText), configurable: true, writable: true });
                } catch (e2) { derr("XHR 改写失败", e2); }
              }
            }
          } catch (e) { /* 非JSON忽略 */ }
        }
      });
    }
    return _origXHRSend.apply(this, args);
  };

  console.log(`${TAG} %c✅ API 拦截层已启动 (v3.2 严格模式 — 推荐流专属)`, TAG_STYLE, "color:#0088ff;font-weight:bold");

  // ================================================================
  //  第二层防线：DOM 预判 + 预跳跨越（v3.0 强化小黄车检测）
  // ================================================================

  document.addEventListener("DOMContentLoaded", () => {
    dlog("dom", "DOMContentLoaded 触发，开始初始化各模块");
    const t = timeit("DOMContentLoaded 初始化");
    initClear();
    kuaishouClear();
    switchSmartResolution();
    initDOMAdSkipper();
    initLiveFullscreenLogger();
    t.end();
  });

  function initDOMAdSkipper() {
    if (!state.skipAd && !state.skipLive && !state.skipShop) {
      dlog("dom", "所有跳过项均关闭，DOM 拦截层不启动");
      return;
    }

    let skippedCount = 0;
    let scanCount = 0;
    let isSkipping = false;
    const COOLDOWN_MS = 800;
    const AD_BADGE_PATH_PREFIX = "M9.492 2.004";
    const AD_LABEL_RE = /(^|[·|｜/\\\-【\[(（])(?:广告|品牌广告)([·|｜/\\\-】）]|$)/;
    const AD_CTA_RE = /推广|赞助|立即(了解|查看|领取|体验|下载|预约|咨询|购买)|去看看|查看详情|了解详情/;

    // 冷启动
    let coldStartDone = false;
    setTimeout(() => {
      coldStartDone = true;
      dlog("dom", "冷启动期结束，扫描功能已解锁");
    }, 3000);

    function showToast(text) {
      let toast = document.getElementById("dy-noad-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "dy-noad-toast";
        toast.style.cssText = `position:fixed;top: 15%;left: 50%;transform:translate(-50%, -50%);background:rgba(0, 0, 0, 0.85);color:#fff;padding: 10px 20px;border-radius: 50px;z-index: 2147483647;font-size: 14px;font-weight:bold;pointer-events:none;box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);backdrop-filter:blur(4px);transition:opacity 0.3s;font-family:system-ui,sans-serif;`;
        document.body.appendChild(toast);
      }
      toast.textContent = text;
      toast.style.opacity = "1";
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 1800);
    }

    function executeSkip(reason) {
      if (isSkipping) {
        dlog("skip", `跳过冷却中，忽略 (reason=${reason})`);
        return;
      }
      isSkipping = true;
      dlog("skip", `⏭️ 执行跳转: ${reason}`);
      const activeVideo = document.querySelector('[data-e2e="feed-active-video"] video');
      if (activeVideo) {
        try {
          activeVideo.muted = true;
          activeVideo.pause();
        } catch (e) { derr("暂停视频失败", e); }
      }
      const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true, cancelable: true
      }));
      setTimeout(() => { isSkipping = false; }, COOLDOWN_MS);
    }

    function isInViewport(el) {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      const wh = window.innerHeight;
      const ww = window.innerWidth;
      return rect.top >= 0 && rect.bottom <= wh && rect.left < ww * 0.66 && rect.width > 10 && rect.height > 10;
    }

    function isInSidebar(el) {
      return !!(el.closest('[class*="drawer"]') || el.closest('[class*="sideslip"]') || el.closest('[class*="UserPanel"]'));
    }

    function getActiveContainer() {
      const active = document.querySelector('[data-e2e="feed-active-video"]');
      if (!active) return null;
      return active.closest('[data-e2e="recommend-item"]') || active;
    }

    // ===== 旧检测 1：广告 SVG badge =====
    function checkAdBadge(root) {
      if (!state.skipAd || !root) return false;
      const paths = root.querySelectorAll(`path[d^="${AD_BADGE_PATH_PREFIX}"]`);
      for (const p of paths) {
        const svg = p.closest("svg");
        if (svg && isInViewport(svg) && !isInSidebar(svg)) return true;
      }
      return false;
    }

    // ===== 旧检测 2：倍速被禁用 =====
    function checkSpeedDisabled() {
      if (!state.skipAd) return false;
      const container = document.querySelector('[data-e2e="feed-active-video"]');
      if (!container) return false;
      const playbackRatio = container.querySelector('.xgplayer-setting-playbackRatio');
      if (playbackRatio && playbackRatio.classList.contains('disabled')) return true;
      const tips = container.querySelector('.xgplayer-playback-setting .xgTips');
      if (tips && tips.textContent.includes('广告视频不支持倍速功能')) return true;
      return false;
    }

    // ===== 旧检测 3：广告文字 =====
    function checkAdText(root) {
      if (!state.skipAd || !root) return false;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
          const tag = node.tagName;
          if (tag === 'DIV' || tag === 'SECTION' || tag === 'UL' || tag === 'OL') return NodeFilter.FILTER_SKIP;
          if (tag !== 'SPAN' && tag !== 'A' && tag !== 'BUTTON' && tag !== 'P' && tag !== 'EM' && tag !== 'I' && tag !== 'LABEL') return NodeFilter.FILTER_REJECT;
          if (isInSidebar(node)) return NodeFilter.FILTER_REJECT;
          if (!isInViewport(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let n, checked = 0;
      while ((n = walker.nextNode()) && checked < 200) {
        checked++;
        const text = (n.innerText || n.textContent || "").trim().replace(/[\s\u200b-\u200f\ufeff]+/g, "");
        if (!text || text.length > 24) continue;
        if (AD_LABEL_RE.test(text) && n.offsetWidth < 120 && n.offsetHeight < 48) return { found: text, type: "label" };
        if (AD_CTA_RE.test(text) && n.offsetWidth < 220 && n.offsetHeight < 64) return { found: text, type: "cta" };
      }
      return false;
    }

    // ===== 旧检测 4：直播 =====
    function checkLive() {
      if (!state.skipLive) return false;
      const feedLive = document.querySelector('[data-e2e="feed-live"]');
      if (feedLive) return { found: "feed-live标签", type: "live" };
      const container = document.querySelector('[data-e2e="slidelist"]') || document.body;
      const matches = document.evaluate(".//*[text()='直播中']", container, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < matches.snapshotLength; i++) {
        const el = matches.snapshotItem(i);
        if (el && isInViewport(el) && el.offsetParent !== null) return { found: "直播中文本", type: "live" };
      }
      return false;
    }

    // ===== v3.0 重点：小黄车/购物车 DOM 检测 =====
    // 抖音的购物视频会在播放器周围渲染这些节点：
    //   - data-e2e="video-cart-entry"     旧购物车入口
    //   - data-e2e="video-goods-entry"    新商品入口
    //   - class*="shop-anchor"            挂件
    //   - class*="mall" / "goods" / "product"  弹层/按钮
    //   - 含"商品"/"购物车"/"小黄车"/"去抢购" 文本的小按钮
    const SHOP_TEXT_RE = /商品橱窗|商品详情|去看同款|去看看|立即购买|马上抢|去抢购|点击购买|小黄车|购物车|同款|相似好物|精选好物/;

    function checkShop() {
      if (!state.skipShop) return false;
      const container = document.querySelector('[data-e2e="feed-active-video"]');
      if (!container) return false;

      // 1. data-e2e 钩子（抖音最稳定）
      const e2eSelectors = [
        '[data-e2e="video-cart-entry"]',
        '[data-e2e="video-goods-entry"]',
        '[data-e2e="video-shop-entry"]',
        '[data-e2e="goods-dock-entry"]',
        '[data-e2e="mall-entry"]',
      ];
      for (const sel of e2eSelectors) {
        const el = container.querySelector(sel) || document.querySelector(sel);
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0 && isInViewport(el)) {
          return { found: sel, type: "e2e-hook" };
        }
      }

      // 2. class 关键字扫描（限播放器内部）
      const classSelectors = [
        '.xgplayer-shop-anchor',
        '.xgplayer-goods-anchor',
        '.goods-anchor',
        '.shop-anchor',
        '[class*="ProductCard"]',
        '[class*="GoodsCard"]',
        '[class*="ShopCard"]',
        '[class*="mall-entry"]',
        '[class*="goods-entry"]',
      ];
      for (const sel of classSelectors) {
        const el = container.querySelector(sel);
        if (el && el.offsetWidth > 0) return { found: sel, type: "class-hook" };
      }

      // 3. 文本兜底：搜 viewport 内的小按钮文字
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
          if (isInSidebar(node)) return NodeFilter.FILTER_REJECT;
          if (!isInViewport(node)) return NodeFilter.FILTER_REJECT;
          const tag = node.tagName;
          if (tag === 'DIV' || tag === 'SECTION') return NodeFilter.FILTER_SKIP;
          if (tag !== 'BUTTON' && tag !== 'SPAN' && tag !== 'A' && tag !== 'P') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let n, checked = 0;
      while ((n = walker.nextNode()) && checked < 80) {
        checked++;
        const text = (n.innerText || n.textContent || "").trim().replace(/[\s\u200b-\u200f\ufeff]+/g, "");
        if (!text || text.length > 12) continue;
        if (SHOP_TEXT_RE.test(text) && n.offsetWidth < 220 && n.offsetHeight < 80) {
          return { found: text, type: "text" };
        }
      }

      return false;
    }

    // 主扫描
    function scan(trigger) {
      if (isSkipping) {
        if (scanCount % 50 === 0) dlog("dom", `扫描 #${scanCount} 被冷却拦截 (trigger=${trigger})`);
        scanCount++;
        return;
      }
      scanCount++;
      if (!coldStartDone) {
        if (scanCount % 50 === 0) dlog("dom", `扫描 #${scanCount} 在冷启动期 (trigger=${trigger})`);
        return;
      }
      const t = timeit(`scan #${scanCount} (${trigger})`);
      const root = getActiveContainer();
      if (!root) { t.end("无活动容器"); return; }

      const checks = [
        ["广告(badge)", state.skipAd, () => checkAdBadge(root)],
        ["广告(倍速禁用)", state.skipAd, checkSpeedDisabled],
        ["广告(文字)", state.skipAd, () => checkAdText(root)],
        ["小黄车/购物", state.skipShop, checkShop],
        ["直播", state.skipLive, checkLive],
      ];
      let reason = null, detail = null;
      for (const [label, enabled, fn] of checks) {
        if (!enabled) continue;
        const r = fn();
        if (r) { reason = label; detail = r; break; }
      }

      if (reason) {
        skippedCount++;
        const detailText = (detail && typeof detail === 'object') ? ` (匹配="${detail.found}" via ${detail.type})` : '';
        showToast(`⚡ 已跳过${reason} (累计: ${skippedCount}${apiFilteredCount > 0 ? ' +API拦截' + apiFilteredCount : ''})${detailText}`);
        if (reason.includes("小黄车") || reason.includes("购物")) {
          dlog("cart", `🛒 命中小黄车${detailText}`);
        } else {
          dlog("skip", `🎯 命中 ${reason}${detailText} | 累计DOM跳过=${skippedCount}`);
        }
        const activeItem = document.querySelector('[data-e2e="feed-active-video"]');
        if (activeItem) {
          const container = activeItem.closest('[data-e2e="recommend-item"]') || activeItem;
          container.dataset.adBlocked = "true";
        }
        executeSkip(reason);
        requestAnimationFrame(() => requestAnimationFrame(() => scan("after-skip")));
      } else {
        t.end("干净");
      }
    }

    // 事件驱动
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        dlog("dom", `⌨️ 键盘: ${e.key}`);
        setTimeout(() => scan("keydown:" + e.key), 350);
      }
    });

    let wheelTimer;
    document.addEventListener("wheel", () => {
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => scan("wheel"), 350);
    }, { passive: true });

    // 监听 feed 切换
    let lastActive = null;
    function watchActiveVideo() {
      const cur = document.querySelector('[data-e2e="feed-active-video"]');
      if (cur && cur !== lastActive) {
        const isFirst = !lastActive;
        lastActive = cur;
        dlog("dom", `🎬 active-video 切换${isFirst ? "(首次)" : ""}`);
        setTimeout(() => scan(isFirst ? "first-frame" : "active-changed"), isFirst ? 500 : 250);
      }
      requestAnimationFrame(watchActiveVideo);
    }
    requestAnimationFrame(watchActiveVideo);

    // MutationObserver 收窄到 #slidelist
    setTimeout(() => {
      const slideList = document.querySelector('#slidelist');
      if (slideList) {
        let moCount = 0;
        const observer = new MutationObserver(() => {
          moCount++;
          clearTimeout(observer._t);
          observer._t = setTimeout(() => {
            dlog("dom", `👀 slidelist 变化 (累计 ${moCount} 次)`);
            scan("mutation:" + moCount);
          }, 200);
        });
        observer.observe(slideList, { childList: true });
        dlog("dom", "MutationObserver 已挂载到 #slidelist");
      } else {
        dwarn("#slidelist 未找到");
      }
    }, 1000);

    dlog("dom", "✅ DOM 拦截层初始化完成 (含小黄车检测)");

    // ================================================================
    //  v3.3 抢占式拦截：MutationObserver 监控整个推荐区
    //  在 .xgplayer-shop-anchor / data-e2e=video-goods-entry 出现的
    //  那一瞬间（DOM 节点刚插入 + offsetParent 还没建好之前）就标记隐形
    //  这样 .xgplayer-shop-anchor 还没来得及显示就被 display:none 掉
    // ================================================================
    if (state.skipShop || state.skipAd) {
      setTimeout(() => initPreemptiveSentinel(), 800);
    }
  }

  function initPreemptiveSentinel() {
    // 找一个能覆盖整个推荐 feed 的根节点
    const root = document.querySelector('#slidelist')
              || document.querySelector('[data-e2e="feed-active-video"]')?.closest('[data-e2e="recommend-item"]')?.parentElement
              || document.querySelector('.slider-video')
              || document.body;

    if (!root) { setTimeout(initPreemptiveSentinel, 500); return; }

    const SHOP_NODE_SELECTORS = [
      '.xgplayer-shop-anchor',
      '.xgplayer-goods-anchor',
      '[data-e2e="video-goods-entry"]',
      '[data-e2e="video-cart-entry"]',
      '[data-e2e="goods-dock-entry"]',
      '[class*="ProductCard"]',
      '[class*="GoodsCard"]',
      '[class*="ShopCard"]',
    ];

    // 用一个独立 Set 防止重复触发
    const blockedElements = new WeakSet();

    function preempt(el, why) {
      if (!el || blockedElements.has(el)) return;
      blockedElements.add(el);
      // 找到最外层 "推荐项容器"（喂到 swiper 的那一项）
      const item = el.closest('[data-e2e="recommend-item"]')
                || el.closest('[class*="swiper-slide"]')
                || el.closest('.slider-video')
                || el.closest('[data-e2e="feed-active-video"]')
                || el.parentElement;
      if (!item) return;
      if (item.dataset.adBlocked === "true") return;
      item.dataset.adBlocked = "true";  // 触发 CSS [data-ad-blocked="true"]{display:none!important;}
      dlog("cart", `🛒 抢占式拦截: 出现 ${why} → 立即 display:none 整个 item (真正零闪)`);
      showToast(`⚡ 拦截小黄车/广告 (零闪)`);
      // 立即派发 ArrowDown 跳过这条
      setTimeout(() => {
        const t = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
        t.dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true, cancelable: true
        }));
      }, 30);
    }

    function scanTree(node) {
      if (!node || node.nodeType !== 1) return;
      if (blockedElements.has(node)) return;
      // 命中 class 名
      for (const sel of SHOP_NODE_SELECTORS) {
        try {
          if (node.matches && node.matches(sel)) { preempt(node, sel); return; }
        } catch (e) { /* 某些 selector 在 SVG 节点上会报错 */ }
      }
      // 子树扫描
      if (node.querySelectorAll) {
        for (const sel of SHOP_NODE_SELECTORS) {
          try {
            const list = node.querySelectorAll(sel);
            for (const el of list) preempt(el, sel);
          } catch (e) { /* ignore */ }
        }
      }
    }

    // 1) 立即扫一次
    scanTree(root);

    // 2) 持续观察：节点插入瞬间就拦
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          for (const n of m.addedNodes) scanTree(n);
        }
        if (m.type === 'attributes' && m.target) {
          // className 变化也可能让元素"变成"小黄车挂件
          scanTree(m.target);
        }
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-e2e'] });
    dlog("dom", `🛡️ 抢占式 sentinel 已挂载到 ${root.id || root.className || 'body'} (零闪模式)`);
  }

  // ======================== 自动选择【智能】分辨率 ========================
  const switchSmartResolution = () => {
    let lastSwitchedFor = null;
    function trySwitch(retry = 0) {
      const activeVideo = document.querySelector("[data-e2e='feed-active-video']");
      if (!activeVideo) {
        if (retry < 5) requestAnimationFrame(() => trySwitch(retry + 1));
        return;
      }
      if (activeVideo === lastSwitchedFor) return;
      const resolutionOptions = Array.from(
        activeVideo.querySelectorAll(".xgplayer-playing div.virtual > div.item")
      ).filter(el => el.textContent && /智能/i.test(el.textContent.trim()));
      if (resolutionOptions.length > 0) {
        const smartOption = resolutionOptions[0];
        if (!smartOption.classList.contains("selected")) {
          smartOption.click();
          dlog("res", `切换到智能分辨率`);
        }
        lastSwitchedFor = activeVideo;
      } else if (retry < 10) {
        setTimeout(() => trySwitch(retry + 1), 1000);
      }
    }
    setTimeout(() => trySwitch(), 1500);
  };

  // ======================== 清屏操作 ========================
  let initClear = function () {
    let lastClearTime = 0;
    let clearCount = 0;
    let minClearInterval = state.clearTime;
    if (minClearInterval === 0) {
      dlog("dom", "清屏已关闭 (倒计时=0)");
      return;
    }

    function clearScreen() {
      try {
        const controlsDom = document.querySelectorAll('[data-e2e="feed-active-video"]');
        if (controlsDom.length) {
          const qingping = controlsDom[0].getElementsByClassName("xg-switch");
          if (qingping.length && qingping[0].className === "xg-switch") {
            qingping[0].click();
            clearCount++;
            dlog("dom", `🧹 清屏 #${clearCount}`);
          }
        }
      } catch (error) {
        derr("清屏操作失败", error);
      }
    }

    function tryAttach() {
      const target = document.querySelector('#slidelist') || document.querySelector('[data-e2e="feed-active-video"]');
      if (!target) { setTimeout(tryAttach, 500); return; }
      const observer = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastClearTime >= minClearInterval) {
          clearScreen();
          lastClearTime = now;
        }
      });
      observer.observe(target, { childList: true, subtree: true });
      dlog("dom", `清屏 observer 已挂载到 ${target.id || target.getAttribute('data-e2e') || 'unknown'}`);
    }
    tryAttach();
  };

  // ======================== 快手清屏 ========================
  let kuaishouClear = function () {
    const hoverArea = document.body;
    if (!hoverArea) return;
    let idleTimer = null;
    function resetIdleTimer() {
      clearTimeout(idleTimer);
      hoverArea.classList.add("js-ks-show");
      idleTimer = setTimeout(() => {
        hoverArea.classList.remove("js-ks-show");
      }, 2000);
    }
    hoverArea.addEventListener("mouseenter", () => {
      resetIdleTimer();
      hoverArea.addEventListener("mousemove", resetIdleTimer);
    });
  };

  // ======================== 抖音直播全屏状态监听 ========================
  function initLiveFullscreenLogger() {
    const logState = () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.xgplayer-is-fullscreen'));
      if (isFS) {
        console.log("%c[脚本提示] 已检测到进入真全屏模式，聊天框已自动收起。", "color: #ff0050; font-weight: bold; font-size: 14px;");
      } else {
        console.log("%c[脚本提示] 已退出全屏模式。", "color: #00b2ff; font-weight: bold;");
      }
    };
    document.addEventListener('fullscreenchange', logState);
    document.addEventListener('webkitfullscreenchange', logState);

    setTimeout(() => {
      const target = document.querySelector('#slidelist') || document.body;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === 'class') { logState(); break; }
        }
      });
      if (target) observer.observe(target, { attributes: true });
      console.log("抖音全屏优化脚本已启动，当前页面：" + document.title);
    }, 2000);
  }
})();
