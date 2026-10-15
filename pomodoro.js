// 陪讀「🍅 番茄鐘」：讀書 N 分鐘 → 語音提醒起來動一動、喝水、上廁所 → 休息 M 分鐘 → 提醒回來讀書。
// 閱讀器（server 的 /pomodoro.js）和手機版（phone-site/pomodoro.js，同一份）共用。
// 用法：PeiduPomodoro.init({ button, speak(text), toast(text), key })
//   button：放倒數的按鈕（會改它的文字）；speak：怎麼念出來（正在即時對話就請老師講，否則用語音朗讀）
(function (g) {
  const STUDY = [25, 45, 50], REST = [5, 10, 15];
  const EXTRA = ["伸伸懶腰", "轉轉脖子、動動肩膀", "讓眼睛看看遠方", "做幾下深呼吸"];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };


  // 樣式自己帶（閱讀器淺色、手機版深色都用各自的顏色變數）
  function injectCss() {
    if (document.getElementById("pomo-css")) return;
    const st = document.createElement("style"); st.id = "pomo-css";
    st.textContent = `
.pomo-pop { position: fixed; z-index: 200; width: min(320px, calc(100vw - 16px)); padding: 12px 14px; border-radius: 14px; display: grid; gap: 10px;
  background: var(--panel, #fff); color: var(--ink, #222); border: 1px solid var(--line, var(--rule, #ccc)); box-shadow: 0 10px 30px rgba(0,0,0,.25); font-size: 14px; }
.pomo-pop[hidden] { display: none; }
.pomo-head { display: flex; align-items: center; justify-content: space-between; }
.pomo-head button { border: 0; background: none; color: inherit; font-size: 16px; min-width: 36px; min-height: 36px; cursor: pointer; }
.pomo-big { font-size: 44px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
.pomo-state { text-align: center; opacity: .75; font-size: 13px; margin-top: -6px; }
.pomo-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pomo-row span { width: 34px; opacity: .75; }
.pomo-row button, .pomo-acts button { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line, var(--rule, #ccc)); background: transparent; color: inherit; cursor: pointer; font: inherit; }
.pomo-row button.on { background: #ff6b6b; border-color: #ff6b6b; color: #fff; font-weight: 700; }
.pomo-voice { display: flex; gap: 6px; align-items: flex-start; font-size: 13px; opacity: .9; }
.pomo-acts { display: flex; gap: 6px; flex-wrap: wrap; }
.pomo-acts .pomo-main { flex: 1; background: #ff6b6b; border-color: #ff6b6b; color: #fff; font-weight: 700; }
.pomo-acts button:disabled { opacity: .4; cursor: default; }
.pomo-on { background: #fff0f0 !important; color: #c92a2a !important; border-color: #ff8787 !important; font-variant-numeric: tabular-nums; font-weight: 700; }
.pomo-on.pomo-rest { background: #e7f5ff !important; color: #1864ab !important; border-color: #74c0fc !important; }`;
    document.head.appendChild(st);
  }

  function init(opts) {
    injectCss();
    const KEY = opts.key || "peidu-pomodoro";
    const btn = opts.button, label0 = btn.textContent;
    // 狀態存在這台裝置：重新整理也接著倒數
    let st = Object.assign({ study: 25, rest: 5, phase: "idle", endAt: 0, left: 0, voice: true, rounds: 0 }, load());
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 忽略 */ } }

    // ---- 面板 ----
    const pop = document.createElement("div");
    pop.className = "pomo-pop"; pop.hidden = true;
    pop.innerHTML = `
      <div class="pomo-head"><b>🍅 番茄鐘</b><button type="button" data-act="close" aria-label="關閉">✕</button></div>
      <div class="pomo-big" data-el="big">25:00</div>
      <div class="pomo-state" data-el="state">準備好就按開始</div>
      <div class="pomo-row"><span>讀書</span>${STUDY.map(m => `<button type="button" data-study="${m}">${m} 分</button>`).join("")}</div>
      <div class="pomo-row"><span>休息</span>${REST.map(m => `<button type="button" data-rest="${m}">${m} 分</button>`).join("")}</div>
      <label class="pomo-voice"><input type="checkbox" data-el="voice"> 時間到用語音提醒（起來動一動、喝水、上廁所）</label>
      <div class="pomo-acts">
        <button type="button" data-act="start" class="pomo-main">▶ 開始讀書</button>
        <button type="button" data-act="pause">⏸ 暫停</button>
        <button type="button" data-act="stop">⏹ 結束</button>
      </div>`;
    document.body.appendChild(pop);
    const $ = s => pop.querySelector(s);
    $('[data-el="voice"]').checked = st.voice;

    function remaining() { return st.phase === "study" || st.phase === "rest" ? st.endAt - Date.now() : st.left; }
    function paint() {
      const r = remaining();
      const running = st.phase === "study" || st.phase === "rest";
      const total = (st.phase === "rest" || st.phase === "rest-paused" ? st.rest : st.study) * 60000;
      $('[data-el="big"]').textContent = mmss(st.phase === "idle" ? st.study * 60000 : r);
      $('[data-el="state"]').textContent = { idle: "準備好就按開始", study: `專心讀書中（第 ${st.rounds + 1} 個番茄）`, rest: "休息時間：起來動一動、喝水、上廁所",
        "study-paused": "讀書暫停中", "rest-paused": "休息暫停中" }[st.phase];
      pop.querySelectorAll("[data-study]").forEach(b => b.classList.toggle("on", +b.dataset.study === st.study));
      pop.querySelectorAll("[data-rest]").forEach(b => b.classList.toggle("on", +b.dataset.rest === st.rest));
      $('[data-act="start"]').textContent = st.phase === "idle" ? "▶ 開始讀書" : st.phase.endsWith("paused") ? "▶ 繼續" : st.phase === "rest" ? "⏭ 提早回來讀" : "▶ 重新開始";
      $('[data-act="pause"]').disabled = !running;
      $('[data-act="stop"]').disabled = st.phase === "idle";
      btn.textContent = st.phase === "idle" ? label0 : `${st.phase.startsWith("rest") ? "☕" : "🍅"} ${mmss(r)}${st.phase.endsWith("paused") ? " ⏸" : ""}`;
      btn.classList.toggle("pomo-on", st.phase !== "idle");
      btn.classList.toggle("pomo-rest", st.phase.startsWith("rest"));
      btn.title = st.phase === "idle" ? "番茄鐘：讀一段時間就提醒你休息" : `番茄鐘（剩 ${mmss(r)}${total ? "" : ""}）`;
    }
    function begin(phase) {
      st.phase = phase; st.endAt = Date.now() + (phase === "rest" ? st.rest : st.study) * 60000; save(); paint();
    }
    function remind(text) {
      opts.toast && opts.toast(text);
      if (st.voice && opts.speak) { try { opts.speak(text); } catch (e) { /* 念不出來就算了 */ } }
      if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) { /* 不支援 */ }
    }
    function tick() {
      if ((st.phase === "study" || st.phase === "rest") && Date.now() >= st.endAt) {
        if (st.phase === "study") {
          st.rounds++;
          remind(`番茄時間到！你已經專心讀了 ${st.study} 分鐘，起來走一走、${pick(EXTRA)}，喝口水、上個廁所，休息 ${st.rest} 分鐘再回來。`);
          begin("rest");
        } else {
          remind("休息結束，回來繼續讀書吧！");
          begin("study");
        }
      }
      paint();
    }
    setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });  // 手機鎖螢幕回來馬上補提醒

    // ---- 操作 ----
    btn.addEventListener("click", () => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden) { const r = btn.getBoundingClientRect(); pop.style.top = Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + "px"; paint(); }
    });
    pop.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.study) { st.study = +b.dataset.study; if (st.phase === "idle") st.left = 0; save(); return paint(); }
      if (b.dataset.rest) { st.rest = +b.dataset.rest; save(); return paint(); }
      const act = b.dataset.act;
      if (act === "close") { pop.hidden = true; return; }
      if (act === "start") {
        opts.unlock && opts.unlock();  // 手機：在按下去的當下先讓聲音可以播（之後時間到才念得出來）
        if (st.phase.endsWith("paused")) { st.phase = st.phase.replace("-paused", ""); st.endAt = Date.now() + st.left; save(); return paint(); }
        begin("study"); opts.toast && opts.toast(`🍅 開始！專心讀 ${st.study} 分鐘，時間到我會提醒你休息`);
        return;
      }
      if (act === "pause" && (st.phase === "study" || st.phase === "rest")) { st.left = st.endAt - Date.now(); st.phase += "-paused"; save(); return paint(); }
      if (act === "stop") { st.phase = "idle"; st.left = 0; st.rounds = 0; save(); return paint(); }
    });
    $('[data-el="voice"]').addEventListener("change", e => { st.voice = e.target.checked; save(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") pop.hidden = true; });
    tick();
    return { state: () => ({ ...st, remaining: remaining() }), _tick: tick, _force: ms => { st.endAt = Date.now() + ms; save(); } };
  }

  g.PeiduPomodoro = { init };
})(typeof globalThis !== "undefined" ? globalThis : this);
