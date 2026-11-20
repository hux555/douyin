// ==UserScript==
// @name         抖音直播自动最高画质
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  后台自动把抖音直播画质调到最高清（不弹窗）：读取当前画质与可选档位，直接点击面板最高档
// @match        *://www.douyin.com/*
// @match        *://live.douyin.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  var PANEL_SEL = '[data-e2e="quality-selector"], .QualitySwitchNewPlugin';
  var CURRENT_SEL = '[data-e2e="quality"]';
  var TIERS = ['原画', '蓝光', '超清', '高清', '标清']; // 高 -> 低

  var lastClick = 0;
  var userPickedRoom = null;
  var doneRoom = null;  // 已确认最高档的房间
  var doneLabel = null; // 该房间的最高档

  console.log('[抖音最高画质] 脚本已加载 v2.2');

  function textOf(el) {
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function isLivePage() {
    return location.hostname === 'live.douyin.com' || location.pathname.indexOf('/live/') >= 0;
  }

  document.addEventListener('pointerdown', function (e) {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    if (e.target.closest(PANEL_SEL)) {
      userPickedRoom = location.pathname;
      console.log('[抖音最高画质] 检测到手动选画质，本房间不再自动切换');
    }
  }, true);

  // 在面板里找每个档位的选项元素：文字恰好等于档位名、且没有子元素也等于档位名（取最内层），排除当前画质显示元素
  function getItems(panel, currentEl) {
    var byLabel = {};
    var all = panel.querySelectorAll('div, span, li, button');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (currentEl && (el === currentEl || currentEl.contains(el))) continue;
      var t = textOf(el);
      if (TIERS.indexOf(t) < 0) continue;
      var kids = el.querySelectorAll('div, span, li, button');
      var hasTierChild = false;
      for (var k = 0; k < kids.length; k++) {
        if (TIERS.indexOf(textOf(kids[k])) >= 0) { hasTierChild = true; break; }
      }
      if (hasTierChild) continue;
      if (!byLabel[t]) byLabel[t] = el;
    }
    return TIERS.filter(function (t) { return byLabel[t]; })
      .map(function (t) { return { el: byLabel[t], label: t }; });
  }

  function checkQuality() {
    if (!isLivePage()) return;
    if (userPickedRoom === location.pathname) return;
    if (Date.now() - lastClick < 1500) return;

    var currentEl = document.querySelector(CURRENT_SEL);
    var current = textOf(currentEl);

    // 本房间已确认最高档且当前就是它 -> 跳过面板扫描（只做一次便宜的当前画质读取）
    if (doneRoom === location.pathname && current && current === doneLabel) return;

    var panel = document.querySelector(PANEL_SEL);
    if (!panel) return;

    var items = getItems(panel, currentEl);
    var top = items[0];
    if (!top) return;

    doneRoom = location.pathname;
    doneLabel = top.label;
    if (top.label === current) return;

    top.el.click();
    lastClick = Date.now();
    console.log('[抖音最高画质] 已切换到 ' + top.label + '（当前 ' + (current || '未知') +
      '，可选 ' + items.map(function (x) { return x.label; }).join('/') + '）');
  }

  setTimeout(checkQuality, 1500);
  setInterval(checkQuality, 2000);
})();
