// 陪讀手機版「即時陪讀」：瀏覽器直接用 WebSocket 連 Gemini Live（聽到聲音就用聲音回答，可以隨時插話）。
// 從 chrome-extension/live.js 複製後改成 iPhone / iPad Safari 能用的版本：
// - AudioContext 只能在「按按鈕的那一刻」建立／叫醒 → start() 開頭同步建立，之後換模型、換聲音只重連 WebSocket，不重建音訊
// - 不假設 new AudioContext({sampleRate:16000}) 能接麥克風 → 用裝置原生取樣率擷取，在 worklet（mic-worklet.js）裡降到 16kHz
// - 老師的 24kHz 聲音用 AudioBuffer(24000) 放進原生取樣率的 context，瀏覽器自己重取樣
// - 不支援 AudioWorklet 的舊機器退回 ScriptProcessor
(function (g) {
  const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=";
  const VOICES = [
    { id: "Kore", label: "Kore（女・沉穩）" }, { id: "Aoede", label: "Aoede（女・輕快）" },
    { id: "Leda", label: "Leda（女・年輕）" }, { id: "Zephyr", label: "Zephyr（女・明亮）" },
    { id: "Puck", label: "Puck（男・活潑）" }, { id: "Charon", label: "Charon（男・知性）" },
    { id: "Fenrir", label: "Fenrir（男・有精神）" }, { id: "Orus", label: "Orus（男・穩重）" },
  ];
  // worklet 檔案跟 live.js 放在同一個資料夾
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const WORKLET_URL = new URL("mic-worklet.js", HERE).href;

  let S = null;    // 一次「即時陪讀」的所有狀態
  let CTX = null;  // 共用的 AudioContext（iPhone 只能在點擊當下建立，所以留著重用）

  function b64FromI16(i16) {
    let bin = ""; const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function f32FromB64(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(u8.buffer, 0, u8.length >> 1), f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
    return f32;
  }

  // ---- 音訊：一定要在點擊事件裡「同步」呼叫 ----
  function ensureCtx() {
    const AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) throw new Error("這個瀏覽器不支援即時語音");
    if (!CTX || CTX.state === "closed") {
      try { CTX = new AC({ latencyHint: "interactive" }); } catch (e) { CTX = new AC(); }
      // iPhone 來電、Siri 會把音訊「中斷」：結束後自動叫醒
      CTX.onstatechange = () => { if (S && CTX && CTX.state !== "running" && CTX.state !== "closed") CTX.resume().catch(() => {}); };
    }
    if (CTX.state !== "running") CTX.resume().catch(() => {});
    try {  // iOS 解鎖：在點擊當下放一段 1 個樣本的無聲音訊
      const b = CTX.createBuffer(1, 1, CTX.sampleRate), s = CTX.createBufferSource();
      s.buffer = b; s.connect(CTX.destination); s.start(0);
    } catch (e) { /* 忽略 */ }
    return CTX;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S && CTX && CTX.state !== "running") CTX.resume().catch(() => {});
  });

  function status(s) { if (S) { S.lastStatus = s; S.opts.onStatus && S.opts.onStatus(s); } }
  // 字幕裡中文字之間常多空格（「完 整 性」），顯示前先拿掉
  const tidy = t => t.replace(/([　-〿㐀-鿿＀-￯])\s+(?=[　-〿㐀-鿿＀-￯])/g, "$1");
  function caption() { S.opts.onCaption && S.opts.onCaption({ amy: tidy(S.amyText), claude: tidy(S.claudeText) }); }

  // ---- 播放老師的聲音（24kHz PCM）：接續排程，被打斷就全部停掉 ----
  function playChunk(b64, rate) {
    const ctx = CTX;
    if (!ctx || ctx.state === "closed") return;
    const f32 = f32FromB64(b64);
    if (!f32.length) return;
    const buf = ctx.createBuffer(1, f32.length, rate);  // 指定 24000：放進 48000 的 context 時瀏覽器會自己重取樣
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(S.outGain);
    // 一段話的開頭多墊 0.12 秒緩衝：網路偶爾慢一點，後面的聲音才接得上，不會一頓一頓
    const at = S.sources.size ? Math.max(ctx.currentTime, S.playAt) : Math.max(ctx.currentTime + 0.12, S.playAt);
    src.start(at);
    S.playAt = at + buf.duration;
    S.sources.add(src);
    src.onended = () => { S && S.sources.delete(src); if (S && !S.sources.size && S.lastStatus === "speaking") status("listening"); };
    if (S.lastStatus !== "speaking") status("speaking");  // 每一小段聲音都通知會讓畫面一直重畫
  }
  function stopPlayback() {
    if (!S) return;
    for (const s of S.sources) { try { s.stop(); } catch (e) { /* 已經停了 */ } }
    S.sources.clear(); S.playAt = 0;
  }

  function flushTurn() {
    if (!S) return;
    const amy = S.amyText.trim(), claude = S.claudeText.trim();
    if (amy) S.lastAmy = amy;  // 換模型重問時要用
    S.amyText = ""; S.claudeText = "";
    if ((amy || claude) && S.opts.onTurn) S.opts.onTurn({ amy: tidy(amy), claude: tidy(claude) });
  }

  function tools() {
    const o = S.opts;
    if (!o.onLookup && !o.onHighlight) return {};
    return { tools: [{ functionDeclarations: [
      ...(o.onLookup ? [{
        name: "lookup",
        description: "查詢講義以外的名詞或觀念（中文維基百科）。考試日期、報名、費用這類 iPAS 官網資訊查不到。",
        parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "要查的關鍵字，繁體中文，例如「零信任架構」" } }, required: ["query"] },
      }] : []),
      // 邊討論邊畫重點：老師講到講義上的考點時，自己把原文標起來（由頁面去畫）
      ...(o.onHighlight ? [{
        name: "highlight",
        description: "在學生正在讀的講義上，用螢光筆把剛剛討論到的重點原文標起來。",
        parameters: { type: "OBJECT", properties: {
          text: { type: "STRING", description: "要標的原文：必須從講義內容逐字複製，6 到 60 字，一個關鍵定義、關鍵句或正確選項" },
          kind: { type: "STRING", enum: ["key", "confuse", "extra"], description: "key＝考點、confuse＝容易混淆、extra＝補充" },
          note: { type: "STRING", description: "一句話說明為什麼要記，繁體中文 30 字內" },
        }, required: ["text", "kind", "note"] },
      }] : []),
    ] }] };
  }

  async function connect() {
    const mine = S;
    const cfg = await S.opts.getConfig();  // { key, model, system }
    if (!S || S !== mine || S.stopping) return;
    S.model = cfg.model; S.turnAudio = 0; S.turnOut = 0; S.noAudioFired = false;
    const ws = S.ws = new WebSocket(WS_URL + encodeURIComponent(cfg.key));
    S.ready = false;
    ws.onopen = () => ws.send(JSON.stringify({ setup: {
      model: cfg.model,
      generationConfig: { responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: S.opts.voice || "Kore" } } } },
      systemInstruction: { parts: [{ text: cfg.system }] },
      inputAudioTranscription: {}, outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },  // 聊久一點也不會被切斷
      ...tools(),
      // 斷句：停多久算講完（設定裡的「反應速度」）。0.3 秒會把一句話切成兩半，所以最短 0.5 秒
      realtimeInputConfig: { automaticActivityDetection: {
        endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
        silenceDurationMs: S.opts.silenceMs || 500, prefixPaddingMs: 300 } },  // 保留開口前 0.3 秒，句首才不會被吃掉
    } }));
    ws.onmessage = async m => {
      if (!S || ws !== S.ws) return;
      let d;
      try { d = JSON.parse(typeof m.data === "string" ? m.data : await m.data.text()); } catch (e) { return; }
      if (!S || ws !== S.ws) return;
      if (d.setupComplete) { S.ready = true; S.retries = 0; status("listening"); (S.queued.splice(0)).forEach(x => ws.send(x)); return; }
      if (d.goAway) { status("reconnecting"); return; }  // 快到時間上限，等它關掉再自動重連
      if (d.toolCall) {  // 老師要查資料／畫重點
        const calls = d.toolCall.functionCalls || [];
        const prev = S.lastStatus;
        if (calls.some(fc => fc.name === "lookup")) status("looking");
        const responses = await Promise.all(calls.map(async fc => {
          const args = fc.args || {};
          let result;
          if (fc.name === "highlight" && S && S.opts.onHighlight) {
            try { result = await S.opts.onHighlight(args); } catch (e) { result = "沒標成功：" + e.message + "（原文要逐字複製講義上的字）"; }
          } else if (fc.name === "lookup" && S && S.opts.onLookup) {
            try { result = await S.opts.onLookup(args.query || ""); } catch (e) { result = "查詢失敗：" + e.message; }
          } else result = "沒有這個工具";
          return { id: fc.id, name: fc.name, response: { result: result || "好了" } };
        }));
        if (S && ws === S.ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
          if (S.lastStatus === "looking") status(prev === "speaking" ? "speaking" : "listening");
        }
        return;
      }
      const sc = d.serverContent;
      if (!sc) return;
      if (sc.interrupted) { stopPlayback(); status("listening"); }  // 插話 → 老師馬上閉嘴
      if (sc.inputTranscription && sc.inputTranscription.text) {
        S.amyText += sc.inputTranscription.text;
        caption();
      }
      if (sc.outputTranscription && sc.outputTranscription.text) {
        S.claudeText += sc.outputTranscription.text;
        S.turnOut = (S.turnOut || 0) + sc.outputTranscription.text.length;
        caption();
      }
      for (const p of (sc.modelTurn && sc.modelTurn.parts) || []) {
        if (p.inlineData && p.inlineData.data) {
          if (S.lastSendAt && !S.firstAudioAt) {  // 量反應速度：送出問題 → 第一段聲音
            S.firstAudioAt = performance.now();
            S.lastLatency = Math.round(S.firstAudioAt - S.lastSendAt);
            S.opts.onLatency && S.opts.onLatency(S.lastLatency);
          }
          const rate = +((p.inlineData.mimeType || "").match(/rate=(\d+)/) || [0, 24000])[1];
          playChunk(p.inlineData.data, rate);
          S.turnAudio++;
        }
      }
      // 有字幕卻沒聲音＝這個模型今天的免費語音額度用完了（Google 不會報錯），讓外面換模型重問
      if ((sc.generationComplete || sc.turnComplete) && S.turnOut > 0 && !S.turnAudio && !S.noAudioFired && S.opts.onNoAudio) {
        S.noAudioFired = true;
        const info = { model: S.model, amy: S.amyText.trim() || S.lastText || S.lastAmy || "" };
        setTimeout(() => S && S.opts.onNoAudio(info));
      }
      if (sc.interrupted) flushTurn();
      if (sc.turnComplete) { flushTurn(); S.turnAudio = 0; S.turnOut = 0; S.noAudioFired = false; }
    };
    ws.onclose = e => {
      if (!S || ws !== S.ws) return;
      flushTurn();
      if (S.stopping) return;
      const reason = String(e.reason || "");
      // 額度用完／這個模型不能用 → 交給外面換下一個模型（不算重試次數）
      if (S.opts.onQuota && (/quota|exceed|RESOURCE_EXHAUSTED|rate.?limit/i.test(reason) ||
          (e.code === 1008 && /not found|not supported|unsupported|permission/i.test(reason)))) {
        S.opts.onQuota({ model: S.model, code: e.code, reason });
        return;
      }
      if (/API key|api_key|API_KEY_INVALID/i.test(reason)) return fail(new Error("KEY:" + reason));
      // 時間到（goAway）或網路斷掉 → 自動重連（最多連續 3 次）
      if (S.retries < 3) {
        S.retries++; status("reconnecting");
        setTimeout(() => S && !S.stopping && connect().catch(err => fail(err)), 600 * S.retries);
      } else fail(new Error("連線一直斷掉（" + e.code + (reason ? "：" + reason : "") + "）"));
    };
    ws.onerror = () => { /* onclose 會接手 */ };
  }

  function fail(err) {
    const cb = S && S.opts.onError;
    stop();
    cb && cb(err);
  }

  function makeDownsampler(inRate, outRate) {  // ScriptProcessor 退路用（跟 worklet 同一套算法）
    const ratio = inRate / outRate;
    let acc = 0, cnt = 0, pos = 0;
    return f32 => {
      const out = [];
      for (let i = 0; i < f32.length; i++) {
        if (ratio === 1) { out.push(f32[i]); continue; }
        acc += f32[i]; cnt++; pos += 1;
        if (pos >= ratio) { out.push(acc / cnt); acc = 0; cnt = 0; pos -= ratio; }
      }
      const i16 = new Int16Array(out.length);
      for (let i = 0; i < out.length; i++) { const v = Math.max(-1, Math.min(1, out[i])); i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      return i16;
    };
  }

  function sendPcm(i16) {
    if (!S || !S.ready || S.muted || !S.ws || S.ws.readyState !== 1 || !i16.length) return;
    S.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64FromI16(i16), mimeType: "audio/pcm;rate=" + S.micRate } } }));
  }

  async function startMic(ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) { /* 舊版 Safari 沒有 */ }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    const srcNode = ctx.createMediaStreamSource(stream);
    const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);  // 接到喇叭（音量 0），處理器才會一直跑
    const outRate = ctx.sampleRate < 16000 ? ctx.sampleRate : 16000;
    let node = null, kind = "worklet";
    if (ctx.audioWorklet && typeof AudioWorkletNode === "function") {
      try {
        if (!ctx.__peiduMic) { await ctx.audioWorklet.addModule(S.opts.workletUrl || WORKLET_URL); ctx.__peiduMic = true; }
        node = new AudioWorkletNode(ctx, "peidu-mic-16k", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { targetRate: 16000, chunk: 640 } });
        node.port.onmessage = ev => { if (ev.data instanceof ArrayBuffer) sendPcm(new Int16Array(ev.data)); };
      } catch (e) { node = null; }
    }
    if (!node) {  // 退路：ScriptProcessor（iOS 14.5 以前）
      kind = "script";
      node = ctx.createScriptProcessor(4096, 1, 1);
      const ds = makeDownsampler(ctx.sampleRate, outRate);
      node.onaudioprocess = ev => sendPcm(ds(ev.inputBuffer.getChannelData(0)));
    }
    srcNode.connect(node); node.connect(sink);
    // iPhone 切到別的 App、來電時，系統可能直接把麥克風關掉：告訴她再按一次
    const track = stream.getAudioTracks()[0];
    const mine = S;
    if (track) track.addEventListener("ended", () => { if (S && S === mine && !S.stopping) fail(new Error("麥克風被系統中斷了（例如切到別的 App 或來電），再按一次「開始陪讀」")); });
    return { stream, srcNode, node, sink, kind, rate: outRate, ctxRate: ctx.sampleRate };
  }

  // opts: { getConfig, voice, silenceMs, onStatus, onCaption, onTurn, onError, onLookup, onHighlight, onNoAudio, onQuota, onLatency }
  // ※ 一定要在點擊事件裡直接呼叫（中間不能先 await），iPhone 才會讓聲音出來
  function start(opts) {
    if (S) stop();
    let ctx;
    try { ctx = ensureCtx(); } catch (err) { opts.onError && opts.onError(err); return Promise.resolve(); }
    S = { opts, ws: null, ready: false, queued: [], sources: new Set(), playAt: 0, amyText: "", claudeText: "",
          retries: 0, stopping: false, muted: false, mic: null, micRate: 16000, outGain: ctx.createGain() };
    S.outGain.connect(ctx.destination);
    status("connecting");
    const mine = S;
    return (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("這個瀏覽器不能用麥克風（要用 Safari 開，網址要是 https）"), { name: "NoMic" });
        const mic = await startMic(ctx);
        if (S !== mine) { mic.stream.getTracks().forEach(t => t.stop()); return; }
        S.mic = mic; S.micRate = mic.rate;
      } catch (err) {
        if (S !== mine) return;
        const e = new Error(err && err.name === "NotAllowedError" ? "麥克風被擋住了：請到「設定 → Safari → 麥克風」允許，或重新整理後按「允許」"
          : err && err.name === "NoMic" ? err.message : "打不開麥克風：" + (err && err.message));
        return fail(e);
      }
      try { await connect(); } catch (err) { if (S === mine) fail(err); }
    })();
  }

  // 只重連 WebSocket（換模型、換聲音、換反應速度），麥克風和音訊不動 → 不需要再按一次按鈕
  function restart(patch) {
    if (!S) return false;
    Object.assign(S.opts, patch || {});
    stopPlayback();
    const old = S.ws;
    S.ws = null; S.ready = false; S.retries = 0;
    try { old && old.close(); } catch (e) { /* 忽略 */ }
    status("connecting");
    const mine = S;
    connect().catch(err => { if (S === mine) fail(err); });
    return true;
  }

  function stop() {
    if (!S) return;
    const s = S;
    s.stopping = true;
    flushTurn();
    stopPlayback();
    try { s.ws && s.ws.close(); } catch (e) { /* 忽略 */ }
    if (s.mic) {
      try { s.mic.srcNode.disconnect(); s.mic.node.disconnect(); s.mic.sink.disconnect(); } catch (e) { /* 忽略 */ }
      if (s.mic.node.port) s.mic.node.port.onmessage = null;
      s.mic.stream.getTracks().forEach(t => t.stop());
    }
    try { s.outGain.disconnect(); } catch (e) { /* 忽略 */ }
    S = null;
    try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) { /* 忽略 */ }
    if (CTX && CTX.state === "running") CTX.suspend().catch(() => {});  // 不關掉：下次按麥克風時叫醒就好
    s.opts.onStatus && s.opts.onStatus("off");
  }

  // 傳一段文字給老師：turnComplete=true 表示「請回答」；false＝只是補充資料（例如翻頁了）
  function sendText(text, turnComplete = true) {
    if (!S) return false;
    if (turnComplete) { stopPlayback(); S.lastText = text; S.amyText = ""; S.lastSendAt = performance.now(); S.firstAudioAt = 0; }
    const msg = JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete } });
    if (S.ready && S.ws && S.ws.readyState === 1) S.ws.send(msg); else S.queued.push(msg);
    return true;
  }

  // 麥克風靜音：先告訴 Gemini「我暫停了」（讓它把剛剛那句話收尾），之後不送聲音
  function setMuted(v) {
    if (!S) return;
    v = !!v;
    if (v && !S.muted && S.ready && S.ws && S.ws.readyState === 1) {
      try { S.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch (e) { /* 忽略 */ }
    }
    S.muted = v;
  }

  g.PeiduLive = {
    VOICES, start, stop, restart, sendText, setMuted,
    isOn: () => !!S, isMuted: () => !!(S && S.muted), status: () => (S ? S.lastStatus : "off"),
    stats: () => (S ? { model: S.model, ready: S.ready, micKind: S.mic && S.mic.kind, micRate: S.micRate,
      ctxRate: CTX && CTX.sampleRate, ctxState: CTX && CTX.state, lastLatency: S.lastLatency || null } : null),
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
