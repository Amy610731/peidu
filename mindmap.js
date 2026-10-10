// 陪讀「彩色心智圖」：中心主題在正中央，分支往四周長出去，像神經元的樹突（越外面越細、會發光）。
// 輸入：{center, branches:[{label, note, children:[...]}], links:[{from,to,label}]}
// 用法：const mm = PeiduMindmap.render(容器, 樹, {onNode}); mm.fit(); await mm.toPNG(); mm.outline(); mm.destroy();
(function (g) {
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9", "#4dabf7", "#9775fa", "#f783ac"];
  const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // 依文字算出固定的小亂數（每次畫出來形狀一樣，但不會呆板對稱）
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

  let measureCtx = null;
  function textWidth(t, size, bold) {
    measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
    measureCtx.font = `${bold ? "700 " : ""}${size}px ${FONT}`;
    return measureCtx.measureText(t).width;
  }
  // 中文每行 n 個字，最多 max 行（超過的最後補「…」）
  function wrap(label, n, max = 2) {
    const chars = [...label];
    const lines = [];
    for (let i = 0; i < chars.length && lines.length < max; i += n) lines.push(chars.slice(i, i + n).join(""));
    if (chars.length > n * max) lines[max - 1] = [...lines[max - 1]].slice(0, n - 1).join("") + "…";
    return lines;
  }
  const weight = n => (n.children && n.children.length) ? n.children.reduce((s, k) => s + weight(k), 0) : 1;

  function layout(tree) {
    const nodes = [], edges = [];
    const leaves = tree.branches.reduce((s, b) => s + weight(b), 0) || 1;
    // 每一圈的半徑：剛好放得下那一圈的節點就好（太鬆會讓整張縮很小、字看不清）
    const count = d => { let c = 0; const walk = (n, k) => { if (k === d) c++; (n.children || []).forEach(x => walk(x, k + 1)); }; tree.branches.forEach(b => walk(b, 1)); return c; };
    const R1 = 210;
    const R2 = Math.max(R1 + 190, count(2) * 150 / (2 * Math.PI));
    const R3 = Math.max(R2 + 165, count(3) * 125 / (2 * Math.PI));
    const center = { id: "c", label: tree.center, depth: 0, x: 0, y: 0, color: "#ffffff", path: [] };
    nodes.push(center);
    let a0 = -Math.PI / 2 - Math.PI / Math.max(3, tree.branches.length);  // 從上方偏左開始排
    tree.branches.forEach((b, bi) => {
      const span = (2 * Math.PI) * weight(b) / leaves;
      place(b, 1, a0, a0 + span, center, COLORS[bi % COLORS.length], [bi]);
      a0 += span;
    });
    function place(n, depth, from, to, parent, color, path) {
      const jitterA = (hash(n.label) - 0.5) * Math.min(0.12, (to - from) * 0.25);
      const ang = (from + to) / 2 + jitterA;
      const r = [0, R1, R2, R3][depth] + (hash(n.label + "r") - 0.5) * 30;
      const [x, y] = polar(r, ang);
      const node = { id: path.join("-"), label: n.label, note: n.note, depth, x, y, ang, r, color, path, parent };
      nodes.push(node);
      edges.push({ a: parent, b: node, depth, color });
      const kids = n.children || [];
      if (!kids.length) return;
      const total = kids.reduce((s, k) => s + weight(k), 0);
      let s = from;
      kids.forEach((k, ki) => {
        const span = (to - from) * weight(k) / total;
        place(k, depth + 1, s, s + span, node, color, [...path, ki]);
        s += span;
      });
    }
    const byLabel = new Map(nodes.map(n => [n.label, n]));
    const links = (tree.links || []).map(l => ({ a: byLabel.get(l.from), b: byLabel.get(l.to), label: l.label })).filter(l => l.a && l.b);
    return { nodes, edges, links };
  }

  // 樹突：從父節點順著放射方向彎出去，到子節點（中心出發的再加一點旋轉，比較有機）
  function dendrite(a, b) {
    const ra = Math.hypot(a.x, a.y), rb = Math.hypot(b.x, b.y);
    const angA = a.depth === 0 ? b.ang - 0.25 : a.ang, angB = b.ang;
    const mid = ra + (rb - ra) * 0.5;
    const [c1x, c1y] = a.depth === 0 ? polar(rb * 0.42, angA) : polar(mid, angA);
    const [c2x, c2y] = polar(mid, angB);
    return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }

  function render(container, tree, opts = {}) {
    container.textContent = "";
    const svg = el("svg", { xmlns: NS, width: "100%", height: "100%", style: "display:block;touch-action:none;cursor:grab;user-select:none" }, container);
    const defs = el("defs", {}, svg);
    const bg = el("radialGradient", { id: "mmBg", cx: "50%", cy: "50%", r: "75%" }, defs);
    el("stop", { offset: "0%", "stop-color": "#1b2547" }, bg); el("stop", { offset: "100%", "stop-color": "#070b18" }, bg);
    const glow = el("filter", { id: "mmGlow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: "6", result: "b" }, glow);
    const merge = el("feMerge", {}, glow); el("feMergeNode", { in: "b" }, merge); el("feMergeNode", { in: "SourceGraphic" }, merge);
    const core = el("radialGradient", { id: "mmCore", cx: "40%", cy: "35%", r: "70%" }, defs);
    el("stop", { offset: "0%", "stop-color": "#ffffff" }, core); el("stop", { offset: "55%", "stop-color": "#dfe7ff" }, core); el("stop", { offset: "100%", "stop-color": "#8da2ff" }, core);
    const bgRect = el("rect", { x: -5000, y: -5000, width: 10000, height: 10000, fill: "url(#mmBg)" }, svg);
    const world = el("g", {}, svg);

    const { nodes, edges, links } = layout(tree);
    // 背景的小光點（神經網路的氛圍）
    const dust = el("g", { opacity: "0.5" }, world);
    const span = Math.max(...nodes.map(n => Math.hypot(n.x, n.y))) + 200;
    for (let i = 0; i < 90; i++) {
      const [x, y] = polar(span * Math.sqrt(hash("d" + i)), hash("a" + i) * Math.PI * 2);
      el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: (0.6 + hash("s" + i) * 1.6).toFixed(2), fill: "#9fb4ff", opacity: (0.15 + hash("o" + i) * 0.4).toFixed(2) }, dust);
    }
    const linkG = el("g", {}, world), edgeG = el("g", { filter: "url(#mmGlow)" }, world), nodeG = el("g", {}, world);

    // 跨分支的關聯：虛線往中心彎
    for (const l of links) {
      const mx = (l.a.x + l.b.x) / 2 * 0.55, my = (l.a.y + l.b.y) / 2 * 0.55;
      el("path", { d: `M${l.a.x},${l.a.y} Q${mx},${my} ${l.b.x},${l.b.y}`, fill: "none", stroke: "#e9ecff", "stroke-width": 1.6, "stroke-dasharray": "6 6", opacity: 0.55, "data-link": "1" }, linkG);
      if (l.label) {
        const tx = (l.a.x + 2 * mx + l.b.x) / 4, ty = (l.a.y + 2 * my + l.b.y) / 4;
        const w = textWidth(l.label, 12) + 14;
        el("rect", { x: tx - w / 2, y: ty - 10, width: w, height: 20, rx: 10, fill: "#0d1430", stroke: "#e9ecff", "stroke-opacity": 0.4, "data-link": "1" }, linkG);
        const t = el("text", { x: tx, y: ty + 4, "text-anchor": "middle", "font-size": 12, fill: "#e9ecff", "font-family": FONT, "data-link": "1" }, linkG);
        t.textContent = l.label;
      }
    }
    // 分支線
    const widths = [0, 9, 4.5, 2.4];
    for (const e of edges) {
      el("path", { d: dendrite(e.a, e.b), fill: "none", stroke: e.color, "stroke-width": widths[e.depth], "stroke-linecap": "round", opacity: 0.9, "data-branch": e.b.path[0] }, edgeG);
      el("circle", { cx: e.b.x, cy: e.b.y, r: widths[e.depth] * 0.9 + 1.5, fill: e.color, "data-branch": e.b.path[0] }, edgeG);  // 突觸
    }
    // 節點
    for (const n of nodes) {
      const grp = el("g", { "data-id": n.id, "data-branch": n.depth ? n.path[0] : "c", style: "cursor:pointer" }, nodeG);
      if (n.depth === 0) {
        const lines = wrap(n.label, 6);
        el("circle", { cx: 0, cy: 0, r: 86, fill: "#8da2ff", opacity: 0.25, filter: "url(#mmGlow)" }, grp);
        el("circle", { cx: 0, cy: 0, r: 74, fill: "url(#mmCore)", stroke: "#ffffff", "stroke-width": 2 }, grp);
        lines.forEach((ln, i) => {
          const t = el("text", { x: 0, y: (i - (lines.length - 1) / 2) * 27 + 8, "text-anchor": "middle", "font-size": 23, "font-weight": 700, fill: "#141a3a", "font-family": FONT }, grp);
          t.textContent = ln;
        });
        continue;
      }
      const size = [0, 20, 17, 15][n.depth], perLine = [0, 7, 8, 8][n.depth], bold = n.depth === 1;
      const lines = wrap(n.label, perLine, n.depth === 1 ? 2 : 3);
      const w = Math.max(...lines.map(l => textWidth(l, size, bold))) + (n.depth === 1 ? 26 : 18);
      const h = lines.length * (size + 5) + (n.depth === 1 ? 14 : 9);
      if (n.depth === 1) el("rect", { x: n.x - w / 2, y: n.y - h / 2, width: w, height: h, rx: h / 2, fill: n.color, stroke: "#ffffff", "stroke-opacity": 0.55 }, grp);
      else el("rect", { x: n.x - w / 2, y: n.y - h / 2, width: w, height: h, rx: 9, fill: "#0d1430", "fill-opacity": 0.86, stroke: n.color, "stroke-width": n.depth === 2 ? 1.8 : 1.2 }, grp);
      lines.forEach((ln, i) => {
        const t = el("text", { x: n.x, y: n.y + (i - (lines.length - 1) / 2) * (size + 5) + size * 0.36, "text-anchor": "middle", "font-size": size, "font-weight": bold ? 700 : 500, fill: n.depth === 1 ? "#141a3a" : "#eef1ff", "font-family": FONT }, grp);
        t.textContent = ln;
      });
      if (n.note) el("circle", { cx: n.x + w / 2 - 3, cy: n.y - h / 2 + 3, r: 4, fill: "#ffffff", stroke: n.color, "stroke-width": 1.5 }, grp);  // 有補充說明的小圓點
    }

    // ---- 縮放、拖曳、兩指縮放 ----
    const T = { x: 0, y: 0, k: 1 };
    const apply = () => world.setAttribute("transform", `translate(${T.x},${T.y}) scale(${T.k})`);
    let fitK = 1;  // 全圖置中時的縮放比例（手機上很小）
    function fit() {
      const bb = world.getBBox(), cw = container.clientWidth || 800, ch = container.clientHeight || 600;
      const pad = 30, k = Math.min((cw - pad * 2) / bb.width, (ch - pad * 2) / bb.height, 1.4);
      T.k = k; T.x = cw / 2 - (bb.x + bb.width / 2) * k; T.y = ch / 2 - (bb.y + bb.height / 2) * k;
      fitK = k;
      apply();
    }
    function zoomAt(px, py, f) {
      const k = Math.min(4, Math.max(0.15, T.k * f));
      T.x = px - (px - T.x) * (k / T.k); T.y = py - (py - T.y) * (k / T.k); T.k = k; apply();
    }
    svg.addEventListener("wheel", e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    const ptrs = new Map(); let pinch = null, moved = false;
    svg.addEventListener("pointerdown", e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; try { svg.setPointerCapture(e.pointerId); } catch {} svg.style.cursor = "grabbing"; });
    svg.addEventListener("pointermove", e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        const r = svg.getBoundingClientRect();
        if (before > 0) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, after / before);
        pinch = true; moved = true; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      T.x += dx; T.y += dy; p.x = e.clientX; p.y = e.clientY; apply();
    });
    const up = e => { ptrs.delete(e.pointerId); if (!ptrs.size) { svg.style.cursor = "grab"; pinch = null; } };
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);

    // ---- 點節點：亮起那整條分支、其他變暗 ----
    let focused = null;
    function focus(branch) {
      focused = branch;
      for (const x of world.querySelectorAll("[data-branch]")) {
        const b = x.getAttribute("data-branch");
        x.style.opacity = branch == null || b === String(branch) || b === "c" ? "" : "0.15";
      }
      for (const x of linkG.querySelectorAll("[data-link]")) x.style.opacity = branch == null ? "" : "0.12";
      // 小螢幕（手機直拿）整張縮太小：點分支就把那一支放大到看得清楚，點中心／空白回到全圖
      const cw = container.clientWidth || 800, ch = container.clientHeight || 600;
      if (fitK >= 0.75) return;
      if (branch == null) { fit(); return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const x of world.querySelectorAll(`[data-branch="${branch}"]`)) {
        const b = x.getBBox(); if (!b.width && !b.height) continue;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      if (!isFinite(x0)) return;
      const pad = 24, k = Math.max(fitK, Math.min((cw - pad * 2) / (x1 - x0), (ch - pad * 2) / (y1 - y0), 1.1));
      T.k = k; T.x = cw / 2 - (x0 + x1) / 2 * k; T.y = ch / 2 - (y0 + y1) / 2 * k;
      apply();
    }
    nodeG.addEventListener("click", e => {
      if (moved) return;
      const grp = e.target.closest("[data-id]"); if (!grp) return;
      const n = nodes.find(x => x.id === grp.getAttribute("data-id"));
      if (!n || n.depth === 0) { focus(null); opts.onNode && opts.onNode(null); return; }
      focus(focused === n.path[0] && opts.lastNode === n.id ? null : n.path[0]);
      opts.lastNode = n.id;
      const trail = []; for (let p = n; p; p = p.parent) trail.unshift(p.label);
      opts.onNode && opts.onNode({ label: n.label, note: n.note, trail, color: n.color });
    });
    bgRect.addEventListener("click", () => { if (!moved) { focus(null); opts.onNode && opts.onNode(null); } });

    setTimeout(fit, 30);  // 等容器有大小再置中（背景分頁不會跑 requestAnimationFrame）

    // ---- 匯出 ----
    async function toPNG() {
      focus(null);
      const bb = world.getBBox(), pad = 40, scale = 2;
      const clone = svg.cloneNode(true);
      clone.setAttribute("width", (bb.width + pad * 2) * scale);
      clone.setAttribute("height", (bb.height + pad * 2) * scale);
      clone.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
      clone.querySelector("g").setAttribute("transform", "");
      const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = blobUrl; });
      const cv = document.createElement("canvas");
      cv.width = (bb.width + pad * 2) * scale; cv.height = (bb.height + pad * 2) * scale;
      cv.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(blobUrl);
      return new Promise(res => cv.toBlob(res, "image/png"));
    }
    // Obsidian 也能用的大綱（markdown 清單）
    function outline() {
      const out = [`# ${tree.center}`, ""];
      const walk = (n, d) => {
        out.push(`${"  ".repeat(d)}- ${n.label}${n.note ? `：${n.note}` : ""}`);
        (n.children || []).forEach(k => walk(k, d + 1));
      };
      tree.branches.forEach(b => walk(b, 0));
      if (links.length) { out.push("", "## 關聯"); links.forEach(l => out.push(`- ${l.a.label} ⟷ ${l.b.label}${l.label ? `（${l.label}）` : ""}`)); }
      return out.join("\n");
    }
    return { fit, toPNG, outline, focus, destroy: () => { container.textContent = ""; } };
  }

  g.PeiduMindmap = { render, COLORS };
})(typeof globalThis !== "undefined" ? globalThis : this);
