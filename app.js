// 陪讀手機版：純前端（GitHub Pages 也能跑）。講義、筆記、對話都存在這支手機的 IndexedDB；老師＝Gemini（金鑰只存在這支手機）。
// 閱讀器／螢光筆／框選／學習卡／心智圖沿用 artifact/peidu-go.html；即時語音用 live.js（手機版）。
"use strict";
(() => {
  // ================= 基本工具 =================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clamp01 = v => clamp(v, 0, 1);
  const nowISO = () => new Date().toISOString();
  const stem = n => String(n || "").replace(/\.pdf$/i, "");
  const pad2 = n => String(n).padStart(2, "0");
  const ymd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const shortDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()}`; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const KINDS = { key: "重點", confuse: "易混", extra: "補充", question: "提問", note: "筆記" };
  const MAX_BYTES = 150 * 1024 * 1024;
  const GUTTER = 16;
  const MAX_PAGE_W = 1000;
  const TOUCH = matchMedia("(pointer: coarse)").matches;
  const mqWide = matchMedia("(min-width: 900px)");
  const PDFJS_OK = typeof window.pdfjsLib !== "undefined";
  if (PDFJS_OK) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const API = "https://generativelanguage.googleapis.com/v1beta";

  // 開發測試用：只有在本機（localhost）而且網址帶 ?dev=1 才會作用；金鑰改從同源的 /api/live/config 拿。GitHub Pages 上永遠不會作用。
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && new URLSearchParams(location.search).get("dev") === "1";

  // ================= 老師的設定（照搬電腦版） =================
  // tutor_prompt.txt
  const TUTOR = `你是 iPAS 證照的陪讀夥伴。對方正在準備「AI 應用規劃師中級」和「資訊安全工程師初級」，一邊讀講義一邊問你。她不是工程師，但 AI 概念有中級考生的程度。

規則（回答會被語音念出來）：
- 直接講重點，預設 2 到 4 句、120 字以內。她說「詳細一點」才講長。
- 不叫她的名字，不寒暄、不說「好問題」「沒問題」這類客套，不重複她的問題。
- 結尾不要硬塞反問或「要不要繼續」。只有她說「考我」「出題」時才出題。
- 用繁體中文、台灣用語。
- 不要用 markdown、條列符號、表格、emoji、網址（念出來很怪）。要列舉就說「第一、第二」。
- 英文術語和縮寫可以保留（例如 CIA、ISO 27001），第一次出現時順便講中文。
- 問到她正在讀的內容，以那頁為主回答；講義沒寫的補充就說「講義沒寫，但考試常考」。
- 問到講義以外的觀念、名詞、例子、延伸問題，直接用你自己的知識回答，不要說「講義沒提到所以沒辦法回答」。
- 需要最新或特定事實的問題（考試日期、報名時間、費用、法規最新修訂、新聞），你沒辦法上網查：不確定就直接說「這個我不確定，建議查官網」，絕對不要編日期或數字，也不要假裝查過。
- 容易混淆的概念，直接點出差別和考試陷阱。`;

  // server.py 的 LIVE_RULES（手機版沒有 server：lookup 只能查維基百科）
  const LIVE_RULES = `你現在是用「即時語音」回答學生：
- 用台灣華語的口音和台灣常用詞（例如：影片、軟體、網路、資訊、品質）。
- 照下面「說話個性」講話，講完就停。不叫她的名字、不寒暄、結尾不硬塞反問。她插話時馬上停下來聽。
- 說話要慢、要清楚：用比平常聊天慢一點的速度，像老師對第一次學的學生講課，一句講完稍微停一下再講下一句；專有名詞、英文縮寫、數字要放慢念清楚。學生說「講快一點」才加快，說「再慢一點」就更慢。
- 講新觀念時：先用一個生活化的例子（國中生都懂的日常情境）讓她聽懂，再帶出正式名詞和考試重點；一次不要丟太多名詞。
- 不要念出標點、符號或格式；英文縮寫照念（例如 C I A、ISO 兩萬七千零一）。
- 她問「這題」「這段」通常是指她現在這一頁，或她剛框起來傳給你的內容。
- 講義以外的觀念問題照樣用你的知識回答。
- 你有一個 lookup 查詢工具（只能查中文維基百科）。問到你不確定的名詞或觀念，先用 lookup 查，再根據查到的內容回答，並說出來源（例如「維基百科說」）。
- 考試日期、報名、費用、最新消息這類 iPAS 官網資訊，手機版查不到，直接說「我查不到，建議看官網」。絕對不要編日期或數字，沒查過就不要說「我查了一下」。
- 你有一個 highlight 螢光筆工具：討論到講義上的考點、正確選項、關鍵定義或容易混淆的地方時，先開口講第一句（不要還沒講話就先標），再呼叫 highlight 把那句原文標起來（text 必須從下面的講義內容逐字複製，一次討論標 1 到 3 個就好，不要整頁亂標）。標完不用特別講「我幫你標了」，繼續講重點就好。工具是在背後偷偷用的：絕對不要把 highlight、lookup、text、kind、note 這些工具名稱或參數念出來或寫在回答裡。
- 收到「（這則不用回應…）」開頭的訊息時，不要出聲回應。`;

  // 老師的說話個性（設定裡可以換）；內容規則都一樣，只差語氣
  const PERSONAS = {
    tsundere: { label: "甄嬛（宮鬥劇，叫你小主）", text: `說話個性：你扮演宮鬥劇裡的甄嬛（熹貴妃），學生是你一手提拔、最疼愛的「小主」，你在教她怎麼在「考場這座後宮」裡活下來、步步高升。
- 一律稱呼她「小主」，自稱「本宮」；語氣端莊溫婉、話中有話，偶爾帶一點宮鬥的心機和霸氣，例如「小主，這後宮之中，最要緊的便是……」「本宮當年在這題上，可是吃過大虧的」。宮廷腔要一聽就懂，不要堆文言文。
- 把考試內容演成後宮的人和事：例如防火牆是守宮門的侍衛、駭客是想陷害小主的對手、雜湊值是驗明正身的令牌、備份是本宮早就留好的後手。
- 提醒考點要像提點小主避開陷阱：「小主記住，這是考官最愛設的局」「這兩個最容易混淆，小主切莫中計」。
- 疼愛小主：可以有一點恨鐵不成鋼的嗔怪，但絕不能真的貶低她或讓她難過；她說聽不懂、很累、很焦慮時，立刻溫柔安撫，像姐姐一樣：「小主別急，本宮陪你慢慢來。」
- 戲是包裝，重點才是主角：先用一句白話把答案或結論講清楚，再用後宮的比喻讓她記住；專有名詞要翻成白話。內容一定要正確，不能為了演戲講錯，也不要編講義沒有的事實。
- 長度：一場戲 2 到 5 句就收，不要演成連續劇；她說「詳細一點」才加長。` },
    hungyi: { label: "宏毅老師風（生動比喻、先講直覺）", text: `說話個性：參考台大李宏毅老師上課的教學風格來講解（不要自稱是李宏毅，也不要說自己是哪位真實人物）。
- 先講直覺、再講原理：用一個生活化、甚至有點好笑的比喻讓她先「懂感覺」，再一句話點出正式說法。
- 很愛用動漫、遊戲、寶可夢、日常小故事當例子，例如把防火牆比成門口的警衛、把雜湊值比成指紋。
- 口語、親切、有點幽默，會自問自答帶她想：「那為什麼要這樣做？因為……」。
- 會提醒「這裡是考試很愛考的地方」、「這兩個大家最容易搞混」。
內容一定要正確，不能為了角色講錯，也不要編講義沒有的事實；先講結論，再用角色的方式幫她記住，2 到 5 句就收，她說「詳細一點」才加長。` },
    sweet: { label: "甜妹（軟萌溫柔、超會誇）", text: `說話個性：你是軟萌、溫柔、甜甜的學伴甜妹。
- 語氣甜、帶笑、很會誇她，例如「哇你好厲害，這題一下就抓到重點了」「沒關係，我們一起慢慢來」。
- 解說用最簡單的白話和可愛的比喻，像在跟好朋友分享小祕密。
- 她答錯時不責備，先安慰再溫柔地講正確答案；她累了會提醒休息一下、喝口水。
- 可以用「呢」「喔」「嘛」這類可愛的語氣詞。
內容一定要正確，不能為了角色講錯，也不要編講義沒有的事實；先講結論，再用角色的方式幫她記住，2 到 5 句就收，她說「詳細一點」才加長。` },
    shizun: { label: "清冷絕美的師尊（仙俠漫劇）", text: `說話個性：你是仙俠漫劇裡清冷絕美、修為高深的師尊，她是你座下的徒兒。
- 語氣清冷、從容、惜字如金，帶一點古風文雅，例如「徒兒，此題不難，靜心聽為師說」「記住了，莫要再錯」。
- 外冷內熱：表面淡淡的，其實很護短；她答對時只淡淡一句「嗯，尚可」，卻藏不住讚許；她累了會說「今日便到此，好生歇著」。
- 把資安、AI 觀念說成修仙世界的東西：防火牆是護山大陣、駭客是心術不正的魔修、加密是封印、金鑰是令牌、漏洞是陣法的破綻。
- 古風只是包裝，專有名詞還是要講清楚白話意思，不要用艱深文言文讓她聽不懂。
內容一定要正確，不能為了角色講錯，也不要編講義沒有的事實；先講結論，再用角色的方式幫她記住，2 到 5 句就收，她說「詳細一點」才加長。` },
    disciple: { label: "萬人迷徒弟（撒嬌黏人、陽光）", text: `說話個性：你是漫劇裡人見人愛的萬人迷小徒弟，她是你最崇拜的師父／師姐。
- 陽光、嘴甜、愛撒嬌、有點黏人，例如「師父師父，這題我會！我講給你聽好不好」「師父好厲害，徒兒都要被你比下去了」。
- 會用「徒兒」自稱，帶點古風但輕鬆好懂；偶爾小小吃醋或耍寶逗她開心。
- 把觀念說成門派、江湖、修煉裡的事，例如防火牆是山門守衛、駭客是來踢館的外人、備份是藏在密室的祕笈副本。
- 她累了會說「師父辛苦了，徒兒幫你捶捶背」，然後提醒休息。
內容一定要正確，不能為了角色講錯，也不要編講義沒有的事實；先講結論，再用角色的方式幫她記住，2 到 5 句就收，她說「詳細一點」才加長。` },
    kid: { label: "童言童語小學霸（配童音最搭）", text: `說話個性：你是一個 7、8 歲、聰明又可愛的小學霸，在跟大姐姐分享你懂的東西。
- 用小朋友的說法：句子短、用詞簡單、很有好奇心，例如「我知道我知道！」「這個就像……」「超酷的對不對」。
- 用小朋友生活裡的東西比喻：上鎖的日記、班上的值日生、保管箱、躲貓貓、零用錢。
- 天真但講得很對，偶爾很得意地說「我是不是很厲害」；她答對會拍手說「姐姐好棒」。
- 可以用「喔」「啦」「耶」這類小朋友的語氣詞。
內容一定要正確，不能為了角色講錯，也不要編講義沒有的事實；先講結論，再用角色的方式幫她記住，2 到 5 句就收，她說「詳細一點」才加長。` },
    lujie: { label: "呂捷風・歷史說書人（幽默、黑色幽默）", text: `說話個性：參考歷史說書人呂捷老師的講課風格（不要自稱是呂捷，也不要說自己是哪位真實人物）。
- 用超接地氣的台灣口語聊天，像在補習班講台上說書：有梗、有節奏、會自問自答帶氣氛，例如「各位，這個就很有意思了」「你以為這樣就完了嗎？沒有！」。
- 很會把觀念講成歷史故事：拿朝代、皇帝、將軍、宮廷權謀、戰爭、外交來比喻資安和 AI，例如防火牆像長城、駭客像混進城裡的細作、加密像軍情密函、備份像把玉璽多刻幾顆藏在不同地方。
- 帶一點黑色幽默和反差笑點：會自嘲、吐槽古人和現代人一樣會犯蠢，但不能拿悲劇、真實受害者、族群或宗教開玩笑，也不能真的嘲笑學生。
- 笑點是包裝、重點才是主角：先一句白話講清楚答案，再用故事讓她記住；專有名詞要翻成白話，歷史比喻只拿大家都知道的、不要編造假的歷史細節。
- 她說聽不懂或很累時，收起嘴砲，用溫暖的方式鼓勵。
- 一段 2 到 5 句就收，不要說成連續劇；她說「詳細一點」才講長。可以用台灣口語的語氣詞。` },
    calm: { label: "冷靜重點（朋友聊天）", text: `說話個性：像坐在旁邊一起讀書的朋友聊天，自然、口語、輕鬆，但內容只講重點，1 到 3 句就停。句子不要用「喔」「啦」「欸」「呢」「囉」這類語助詞結尾。解說要簡單易懂，專有名詞順便講白話。` },
  };
  const personaText = () => (PERSONAS[prefs.persona] || PERSONAS.tsundere).text;

  const MINDMAP_PROMPT = `把下面的學習內容整理成一張「中文心智圖」的結構，給 iPAS 考生複習用。

要求：
- center：這份內容的中心主題（12 字內）。
- branches：4 到 7 個主分支，涵蓋最重要的面向（觀念、比較、考點、易混淆、例子…依內容決定）。
- 每個節點：label 要很短（主分支 8 字內、其他 10 字內），不要把全名塞進 label；全名、解釋放 note（一句話，30 字內，考點或易混淆處要寫）。
- 只有「真的存在的正式縮寫」才寫英文（例如 BCP、SAST、RAID 5、SBOM），寫成「DAST 動態測試」這樣；沒有正式縮寫的就只寫中文（例如「增量備份」「日誌管理」），絕對不要自己發明縮寫（不可寫 BAK、INC、LOG 這種）。
- 子分支最多兩層（主分支 → 子節點 → 孫節點），每個主分支 2 到 5 個子節點。
- links：0 到 4 條「跨分支的關聯」（例如兩個容易搞混的概念、因果關係），from / to 填節點的 label（必須跟節點 label 一字不差），label 寫關係（6 字內，例如「容易混淆」「互補」「導致」）。
- 只用繁體中文（英文術語、縮寫可保留），不要編造內容裡沒有的事實。

只回 JSON，格式：
{"center":"…","branches":[{"label":"…","note":"…","children":[{"label":"…","note":"…","children":[{"label":"…"}]}]}],"links":[{"from":"…","to":"…","label":"…"}]}

=== 學習內容 ===
`;

  // server.py 的模型清單：前面的免費額度用完就換下一個
  const LIVE_MODELS = ["models/gemini-3.8-live", "models/gemini-3.1-flash-live-preview",
    "models/gemini-2.5-flash-native-audio-latest", "models/gemini-2.5-flash-native-audio-preview-12-2025"];
  const FAST_TEXT_MODELS = ["models/gemini-2.5-flash", "models/gemini-3-flash-preview", "models/gemini-flash-latest",
    "models/gemini-3.5-flash", "models/gemini-3.6-flash", "models/gemini-3.7-flash"];

  // ================= 狀態與偏好 =================
  const S = {
    docs: [], doc: null, pdf: null, pages: [], scale: 1, zoom: 1, base: { w: 612, h: 792 }, page: 1, gen: 0, openSeq: 0, lastW: 0,
    anns: [], chat: [], sys: [],
    tc: new Map(), chars: new Map(),
    tab: "chat", editing: null, sheetOpen: false, sheetH: 0,
    pending: null, comp: null, hlBusy: false, selbarTouch: 0,
  };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const KEY_LS = "peidu-phone-gemini-key";
  const AZ_LS = "peidu-phone-azure";  // {key, region}：童音用的 Azure 語音金鑰，只存在這支手機
  const azureConf = () => { const c = LS.get(AZ_LS, {}); return c && c.key && c.region ? c : null; };
  const xmlEsc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  // Azure 念一句（瀏覽器直接呼叫，Azure 允許跨網域）→ 回傳 mp3 的 ArrayBuffer
  async function azureTts(text, v, conf) {
    conf = conf || azureConf();
    if (!conf) throw new Error("還沒設定 Azure 語音金鑰（⚙️ 設定）");
    const ssml = `<speak version='1.0' xml:lang='zh-CN'><voice name='${v.azure}'><prosody rate='${v.rate >= 0 ? "+" : ""}${v.rate}%' pitch='${v.pitch >= 0 ? "+" : ""}${v.pitch}Hz'>${xmlEsc(text)}</prosody></voice></speak>`;
    const r = await fetch(`https://${conf.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST", body: ssml,
      headers: { "Ocp-Apim-Subscription-Key": conf.key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3" },
    });
    if (r.status === 401 || r.status === 403) throw new Error("Azure 金鑰或區域不對");
    if (r.status === 429) throw new Error("Azure 免費額度用完了，或念太快");
    if (!r.ok) throw new Error("Azure 語音暫時不能用（" + r.status + "）");
    return r.arrayBuffer();
  }
  const prefs = Object.assign({ voice: "Kore", silence: 500, persona: "tsundere", speed: 0.9 }, LS.get("peidu-phone-prefs", {}));
  if (![500, 800, 1200].includes(+prefs.silence)) prefs.silence = 500;
  const savePrefs = () => LS.set("peidu-phone-prefs", prefs);

  // ================= 小元件 =================
  function toast(msg, ms = 2800) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
  }
  // 老師自動畫的重點：下方跳出「復原」，連續標了好幾個就一個一個往回復原
  const UNDO = { stack: [], t: 0 };
  function showUndo(ann) {
    UNDO.stack.push(ann);
    paintUndo();
  }
  function paintUndo() {
    const bar = $("#undoBar");
    clearTimeout(UNDO.t);
    const last = UNDO.stack[UNDO.stack.length - 1];
    if (!last) { bar.hidden = true; return; }
    $("#undoText").textContent = `🖍 老師標了：${last.text.slice(0, 18)}${last.text.length > 18 ? "…" : ""}` + (UNDO.stack.length > 1 ? `（共 ${UNDO.stack.length} 個）` : "");
    bar.hidden = false; UNDO.reclamp && UNDO.reclamp();
    UNDO.t = setTimeout(() => { bar.hidden = true; UNDO.stack = []; }, 20000);
  }
  $("#undoBtn").onclick = async () => {
    const last = UNDO.stack.pop();
    if (!last) return paintUndo();
    try { await store.deleteAnn(last.id); toast("復原了：這個重點拿掉了"); } catch (err) { writeErr(err); }
    paintUndo();
  };
  $("#undoClose").onclick = () => { clearTimeout(UNDO.t); UNDO.stack = []; $("#undoBar").hidden = true; };
  // 復原提示條可以拖到別的地方（左邊 ⠿ 把手；位置記在這台裝置；點兩下把手回原位）
  (() => {
    const bar = document.getElementById("undoBar"), grip = bar.querySelector(".undo-grip"), KEY = "peidu-phone-undo-pos";
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* 沒存過 */ }
    function place(p) {
      if (!p) { bar.classList.remove("moved"); bar.style.left = bar.style.top = ""; return; }
      bar.classList.add("moved");
      const w = bar.offsetWidth || 260, h = bar.offsetHeight || 44;
      bar.style.left = Math.max(4, Math.min(innerWidth - w - 4, p.x)) + "px";
      bar.style.top = Math.max(4, Math.min(innerHeight - h - 4, p.y)) + "px";
    }
    UNDO.reclamp = () => { if (saved) place(saved); };  // 每次顯示時重新算一次，不會跑出畫面
    let d = null;
    grip.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const r = bar.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      grip.setPointerCapture(e.pointerId); e.preventDefault();
    });
    grip.addEventListener("pointermove", e => { if (d) place({ x: e.clientX - d.dx, y: e.clientY - d.dy }); });
    const end = () => {
      if (!d) return;
      d = null; const r = bar.getBoundingClientRect(); saved = { x: r.left, y: r.top };
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* 忽略 */ }
    };
    grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
    grip.addEventListener("dblclick", () => { saved = null; place(null); try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } });
    addEventListener("resize", () => UNDO.reclamp());
  })();

  function askConfirm(title, body, okLabel = "刪除") {
    return new Promise(resolve => {
      $("#cfTitle").textContent = title; $("#cfBody").textContent = body; $("#cfOk").textContent = okLabel;
      $("#confirmBox").hidden = false;
      const done = v => { $("#confirmBox").hidden = true; $("#cfOk").onclick = $("#cfCancel").onclick = null; resolve(v); };
      $("#cfOk").onclick = () => done(true);
      $("#cfCancel").onclick = () => done(false);
    });
  }
  $("#confirmBox").addEventListener("click", e => { if (e.target.id === "confirmBox") $("#cfCancel").click(); });
  const writeErr = e => toast(e && e.name === "QuotaExceededError" ? "手機空間不夠了，刪掉一些舊講義再試" : "沒存到，再試一次");

  // ================= IndexedDB（講義、筆記、對話都存在這支手機） =================
  let dbP = null;
  function openDB() {
    if (!dbP) dbP = new Promise((res, rej) => {
      const r = indexedDB.open("peidu-phone", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("docs", { keyPath: "id" });
        d.createObjectStore("files", { keyPath: "id" });
        d.createObjectStore("anns", { keyPath: "id" }).createIndex("docId", "docId");
        d.createObjectStore("chat", { keyPath: "id" }).createIndex("docId", "docId");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbP = null; rej(r.error); };
      r.onblocked = () => toast("有另一個陪讀分頁開著，先關掉它再重新整理");
    });
    return dbP;
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function idb(stores, mode, fn) {
    const db = await openDB();
    const t = db.transaction(stores, mode);
    const done = new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("abort")); });
    const v = await fn(t);
    await done;
    return v;
  }
  const dbGet = (s, k) => idb(s, "readonly", t => reqP(t.objectStore(s).get(k)));
  const dbPut = (s, v) => idb(s, "readwrite", t => reqP(t.objectStore(s).put(v)));
  const dbDel = (s, k) => idb(s, "readwrite", t => reqP(t.objectStore(s).delete(k)));
  const dbAll = s => idb(s, "readonly", t => reqP(t.objectStore(s).getAll()));
  const dbByDoc = (s, docId) => idb(s, "readonly", t => reqP(t.objectStore(s).index("docId").getAll(docId)));
  async function dbDeleteDoc(docId) {
    await idb(["docs", "files", "anns", "chat"], "readwrite", async t => {
      t.objectStore("docs").delete(docId); t.objectStore("files").delete(docId);
      for (const s of ["anns", "chat"]) {
        const keys = await reqP(t.objectStore(s).index("docId").getAllKeys(docId));
        keys.forEach(k => t.objectStore(s).delete(k));
      }
    });
  }

  const store = {
    async addAnn(a) {
      const ann = { id: uid(), docId: S.doc.id, page: a.page, kind: a.kind, text: a.text || "", rects: a.rects || [],
        note: a.note || "", answer: a.answer || "", author: a.author || "amy", created: nowISO() };
      if (a.region) ann.region = true;
      await dbPut("anns", ann);
      if (S.doc && S.doc.id === ann.docId) { S.anns = [...S.anns, ann]; onAnnsChanged(); }
      touchDoc();
      return ann;
    },
    async updateAnn(id, patch) {
      const cur = S.anns.find(a => a.id === id) || await dbGet("anns", id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      await dbPut("anns", next);
      S.anns = S.anns.map(a => a.id === id ? next : a); onAnnsChanged();
    },
    async deleteAnn(id) {
      await dbDel("anns", id);
      S.anns = S.anns.filter(a => a.id !== id); onAnnsChanged();
    },
    async addChat(m) {
      const msg = { id: uid(), docId: S.doc.id, page: m.page || S.page || 1, role: m.role, text: m.text, created: nowISO() };
      if (m.topic) msg.topic = String(m.topic).slice(0, 40);  // 星圖模式：這句話是在哪個考點講的
      await dbPut("chat", msg);
      if (S.doc && S.doc.id === msg.docId) { S.chat = [...S.chat, msg]; if (S.tab === "chat") renderSide(); }
      touchDoc();
      return msg;
    },
  };
  function touchDoc() {
    const d = S.doc; if (!d) return;
    d.updatedAt = nowISO();
    clearTimeout(touchDoc.t); touchDoc.t = setTimeout(() => saveDocMeta(d), 800);
  }
  function saveDocMeta(d) {
    if (d.virtual) return Promise.resolve();  // 星圖不是講義，不放進書架
    const { ...rec } = d; delete rec.savedPage;
    return dbPut("docs", rec).catch(() => {});
  }

  // ================= 金鑰 =================
  let devKey = null;
  const storedKey = () => { try { return (localStorage.getItem(KEY_LS) || "").trim(); } catch { return ""; } };
  const hasKey = () => DEV || !!storedKey();
  async function getKey() {
    if (!DEV) return storedKey();
    if (!devKey) {
      const r = await fetch("/api/live/config", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.key) throw new Error("測試伺服器沒有給金鑰：" + (j.error || r.status));
      devKey = j.key;
    }
    return devKey;
  }

  // ================= Gemini：模型清單、額度用完換模型、文字 JSON =================
  const MODELS = { list: null, at: 0 };
  async function listModels(key) {
    if (MODELS.list && Date.now() - MODELS.at < 3600e3) return MODELS.list;
    let r;
    try { r = await fetch(`${API}/models?pageSize=300&key=${encodeURIComponent(key)}`); } catch { return null; }  // 網路不穩：用固定清單
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const msg = (j.error && j.error.message) || ("HTTP " + r.status);
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error("KEY:" + msg);
      return null;
    }
    const j = await r.json();
    MODELS.list = j.models || []; MODELS.at = Date.now();
    return MODELS.list;
  }
  const exhausted = kind => LS.get("peidu-phone-ex2-" + kind, {});
  function markExhausted(kind, model, sec) {
    const m = exhausted(kind); m[model] = Date.now() + sec * 1000;
    for (const k in m) if (m[k] < Date.now()) delete m[k];
    LS.set("peidu-phone-ex2-" + kind, m);
  }
  async function pickLiveModel(key) {
    const list = await listModels(key);
    const names = list ? new Set(list.filter(m => (m.supportedGenerationMethods || []).includes("bidiGenerateContent")).map(m => m.name)) : null;
    const ex = exhausted("live"), now = Date.now();
    const ok = m => !(ex[m] > now);
    let model = LIVE_MODELS.find(m => (!names || names.has(m)) && ok(m));
    if (!model && names) model = [...names].find(m => /live|native-audio/i.test(m) && ok(m));  // Google 改名時的退路
    if (!model) throw new Error("即時語音的免費額度都用完了（過幾個小時會恢復）。現在可以先讀講義、畫重點。");
    return model;
  }
  async function textCandidates(key) {
    const list = await listModels(key);
    const now = Date.now(), ex = exhausted("text");
    let order = FAST_TEXT_MODELS;
    if (list) {
      const gen = new Set(list.filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name));
      order = FAST_TEXT_MODELS.filter(m => gen.has(m));
      if (!order.length) {
        const ver = n => (n.split("/").pop().match(/\d+/g) || [0]).slice(0, 2).map(Number);
        order = [...gen].filter(n => /flash/i.test(n) && !/lite|image|tts|audio|live|embedding/i.test(n))
          .sort((a, b) => { const x = ver(a), y = ver(b); return (y[0] - x[0]) || ((y[1] || 0) - (x[1] || 0)); });
      }
    }
    return order.filter(m => !(ex[m] > now));
  }
  function retrySeconds(j) {
    try { for (const d of (j.error && j.error.details) || []) if (d.retryDelay) return parseFloat(String(d.retryDelay)) + 5; } catch {}
    return 3600;
  }
  async function geminiJSON(prompt, maxTokens = 4000) {
    const key = await getKey();
    if (!key) throw new Error("NEED_KEY");
    const body = { contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens, responseMimeType: "application/json" } };
    let last = "沒有可用的模型";
    for (const model of await textCandidates(key)) {
      const url = `${API}/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const post = b => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      let r;
      try {
        r = await post({ ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingBudget: 0 } } });
        if (r.status === 400) { const t = await r.clone().text(); if (/think/i.test(t)) r = await post(body); }
      } catch (e) { last = "連線不穩"; continue; }
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) { markExhausted("text", model, retrySeconds(j)); last = "今天的免費額度用完了"; continue; }
      if (!r.ok) { last = (j.error && j.error.message) || ("HTTP " + r.status); if (r.status === 400 && /API key/i.test(last)) throw new Error("KEY:" + last); continue; }
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.filter(p => !p.thought).map(p => p.text || "").join("").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      try { return JSON.parse(text); } catch { last = "回傳的格式壞掉"; continue; }
    }
    throw new Error("Gemini 沒辦法產生：" + last);
  }
  const keyErrText = e => {
    const m = String((e && e.message) || e || "");
    if (m === "NEED_KEY") return "還沒設定 Gemini 金鑰";
    if (m.startsWith("KEY:")) return "Gemini 金鑰不能用（可能貼錯了），請到設定重新貼一次";
    return m;
  };

  // ================= 查資料（維基百科；server.py 的 _wiki 規則） =================
  const WIKI_FILLER = /維基百科|wiki|別名|又稱|是什麼|什麼是|意思|定義|介紹|解釋|請問|幫我查|查一下|有哪些|差在哪|差別|的/gi;
  const EXAM_INFO = /考試|報名|鑑定|簡章|考區|成績|證書|日期|費用|梯次|第[一二三四]次|時間|地點|公告|最新/;
  const IPAS_WORDS = /iPAS|ipas|考試|報名|鑑定|簡章|考區|成績|證書|日期|費用|梯次|第[一二三四]次|應用規劃師|資訊安全工程師|資安工程師/;
  async function fetchJSON(url, opts = {}, ms = 8000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) return null; return await r.json(); }
    catch { return null; } finally { clearTimeout(t); }
  }
  async function wiki(query) {
    // 老師給的查詢常夾帶「維基百科」「別名」這種字，會把搜尋帶歪 → 先拿掉
    const words = query.replace(WIKI_FILLER, " ").split(/\s+/).filter(w => w.length >= 2);
    const tries = words.length ? [words.join(" "), ...[...words].sort((a, b) => b.length - a.length)] : [query];
    let title = null;
    for (const q of [...new Set(tries)]) {
      const j = await fetchJSON(`https://zh.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=${encodeURIComponent(q)}`);
      if (!j) return "";  // 維基太忙或連不上：當作查不到，不要讓老師卡住
      const qchars = new Set(q.replace(/ /g, ""));
      for (const h of (j.query && j.query.search) || []) {
        // 標題至少要跟查詢有兩個字相同、而且蓋到查詢 40% 的字，才算查到對的條目
        const same = [...new Set(h.title)].filter(c => qchars.has(c)).length;
        if (same >= 2 && same >= 0.4 * qchars.size) { title = h.title; break; }
      }
      if (title) break;
    }
    if (!title) return "";
    let s = await fetchJSON(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { "Accept-Language": "zh-tw" } });
    let extract = s && s.extract ? String(s.extract).trim() : "";
    if (!extract) {
      const j = await fetchJSON(`https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&origin=*&variant=zh-tw&titles=${encodeURIComponent(title)}`);
      const pg = j && j.query && j.query.pages && Object.values(j.query.pages)[0];
      extract = pg && pg.extract ? String(pg.extract).trim() : "";
    }
    return extract ? `【維基百科《${(s && s.title) || title}》】${extract.slice(0, 900)}` : "";
  }
  async function lookup(query) {
    query = String(query || "").trim().slice(0, 100);
    if (!query) return "沒有查詢內容。";
    const ipas = IPAS_WORDS.test(query);
    // 考試日期、報名、費用這類只有 iPAS 官網才有的事：手機版查不到官網（瀏覽器不能跨站抓），維基只會查到不相干的考試
    if (ipas && EXAM_INFO.test(query)) return "查不到，建議看官網（手機版沒辦法查 iPAS 官網的考試日期、報名、費用）。";
    let w = "";
    try { w = await wiki(query); } catch {}
    if (w) return ((ipas ? "【iPAS 官網】手機版查不到官網資料。\n" : "") + w).slice(0, 2000);
    return ipas ? "查不到，建議看官網（手機版沒辦法查 iPAS 官網的考試日期、報名、費用）。" : "查不到相關資料。";
  }

  // ================= 書架 =================
  async function loadDocs() {
    try { S.docs = await dbAll("docs"); } catch (e) { S.docs = []; toast("打不開手機裡的書架：" + (e && e.message)); }
    renderShelf();
  }
  function renderShelf() {
    $("#keyNote").hidden = hasKey();
    const list = $("#docList"), empty = $("#shelfEmpty");
    const docs = [...S.docs].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    list.innerHTML = docs.map(d => {
      const total = +d.pageCount || 0, last = clamp(+d.lastPage || 1, 1, Math.max(1, total));
      const pct = total ? Math.round(last / total * 100) : 0;
      return `<li class="doc" data-id="${esc(d.id)}">
        <button type="button" class="doc-open" data-act="open">
          <span class="doc-name">${esc(stem(d.name))}</span>
          <span class="doc-meta">讀到第 ${last}${total ? ` / ${total}` : ""} 頁${d.updatedAt ? ` · ${shortDate(d.updatedAt)}` : ""}</span>
          <span class="doc-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </button>
        <button type="button" class="doc-del" data-act="del" aria-label="刪除 ${esc(stem(d.name))}">刪除</button>
      </li>`;
    }).join("");
    list.hidden = !docs.length; $("#shelfLabel").hidden = !docs.length; empty.hidden = !!docs.length;
  }
  $("#docList").addEventListener("click", e => {
    const li = e.target.closest(".doc"); const b = e.target.closest("button[data-act]");
    if (!li || !b) return;
    const d = S.docs.find(x => x.id === li.dataset.id); if (!d) return;
    if (b.dataset.act === "open") openDoc(d); else deleteDoc(d);
  });
  $("#addBtn").onclick = () => $("#addFile").click();
  $("#addFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) addPdf(f); });
  $("#shelfSettings").onclick = () => openSettings();

  function setUploading(text) { $("#uploading").hidden = !text; if (text) $("#uploadingText").textContent = text; $("#addBtn").disabled = !!text; }
  async function addPdf(file) {
    if (!PDFJS_OK) return toast("PDF 元件沒有載入成功，請重新整理（要有網路）");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return toast("只能加入 PDF 檔");
    if (file.size > MAX_BYTES) return toast(`這個檔案 ${(file.size / 1048576).toFixed(0)}MB，太大了。先在電腦把 PDF 拆小一點。`, 5000);
    setUploading("正在檢查 PDF…");
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
      const pageCount = pdf.numPages; pdf.destroy();
      setUploading("正在存進手機…");
      const id = uid(), t = nowISO();
      const doc = { id, name: file.name, size: file.size, pageCount, lastPage: 1, createdAt: t, updatedAt: t };
      await dbPut("files", { id, data: buf });
      await dbPut("docs", doc);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
      S.docs.push(doc); renderShelf();
      toast("加好了：" + stem(file.name));
    } catch (e) {
      console.warn(e);
      toast(e && e.name === "PasswordException" ? "這份 PDF 有密碼保護，先在電腦解除密碼再加入。"
        : e && e.name === "QuotaExceededError" ? "手機空間不夠了，刪掉一些舊講義再試"
        : e && /PDF/i.test(e.name || "") ? "這個檔案打不開，可能不是正常的 PDF。" : "加入失敗，再試一次", 5000);
    } finally { setUploading(""); }
  }
  async function deleteDoc(d) {
    const ok = await askConfirm(`把《${stem(d.name)}》從書架拿掉？`, "這份講義的重點、筆記和對話會一起刪掉，刪了就找不回來。");
    if (!ok) return;
    try { await dbDeleteDoc(d.id); S.docs = S.docs.filter(x => x.id !== d.id); renderShelf(); toast("已刪除《" + stem(d.name) + "》"); }
    catch { toast("刪除失敗，再試一次"); }
  }

  // ================= 開啟文件 =================
  function showView(name) { $("#shelf").hidden = name !== "shelf"; $("#reader").hidden = name !== "reader"; }
  function viewerMsg(text, spin = true) { $("#viewerMsg").hidden = !text; $("#viewerMsgText").textContent = text || ""; $("#viewerSpin").hidden = !spin; }
  async function openDoc(doc) {
    if (!PDFJS_OK) return toast("PDF 元件沒有載入成功，請重新整理（要有網路）");
    closeDoc();
    const seq = ++S.openSeq;
    S.doc = { ...doc }; S.page = 0; S.zoom = 1;
    showView("reader");
    $("#docName").textContent = stem(doc.name);
    $("#pageTotal").textContent = "/ " + (doc.pageCount || "…");
    setTab("chat");
    viewerMsg("正在打開講義…");
    try {
      const [file, anns, chat] = await Promise.all([dbGet("files", doc.id), dbByDoc("anns", doc.id), dbByDoc("chat", doc.id)]);
      if (seq !== S.openSeq) return;
      if (!file || !file.data) throw new Error("找不到這份講義的檔案");
      S.anns = anns || [];
      S.chat = (chat || []).sort((a, b) => String(a.created).localeCompare(String(b.created)));
      S.lastRead = Math.max(1, +doc.lastPage || 1);  // 🔖 上次讀到第幾頁（這次開之前的）
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(file.data) }).promise;
      if (seq !== S.openSeq) { pdf.destroy(); return; }
      S.pdf = pdf;
      await buildPages();
      if (seq !== S.openSeq) return;
      viewerMsg("");
      S.doc.savedPage = clamp(+doc.lastPage || 1, 1, pdf.numPages);
      if (S.doc.pageCount !== pdf.numPages) { S.doc.pageCount = pdf.numPages; saveDocMeta(S.doc); }
      gotoPage(S.doc.savedPage);
      drawAllHighlights(); renderSide();
      if (S.lastRead > 1) toast(`🔖 上次讀到第 ${S.lastRead} 頁，紅框那頁就是`, 3500);
    } catch (e) {
      if (seq !== S.openSeq) return;
      console.warn(e);
      viewerMsg(e && e.name === "PasswordException" ? "這份 PDF 有密碼保護，打不開。" : "打不開這份講義，回書架再點一次試試。", false);
    }
  }
  function closeDoc() {
    if (PeiduLive.isOn()) setLive(false);
    flushLastPage();
    S.openSeq++;
    for (const p of S.pages) unrenderPage(p);
    S.pages = []; $("#pages").textContent = "";
    if (S.pdf) { try { S.pdf.destroy(); } catch {} S.pdf = null; }
    S.tc.clear(); S.chars.clear();
    S.anns = []; S.chat = []; S.sys = []; S.editing = null; S.pending = null;
    if (S.star) {  // 離開星圖：iframe 清空（下次進來是乾淨的總覽）
      S.star = null; S.topic = null; clearTimeout(STAR.t);
      $("#reader").classList.remove("star");
      $("#starFrame").removeAttribute("src");
    }
    S.doc = null;
    hideSelbar(); setBox(false); closeComposer(); closeRegionPop(true);
  }
  $("#backBtn").onclick = () => backToShelf();
  function backToShelf() { closeDoc(); closeSheet(); showView("shelf"); loadDocs(); }

  // ================= 🌌 星圖（嵌入 l23-map 系列，點考點 → 即時語音老師拿到考點內容） =================
  // 星圖網頁用 postMessage 把「點開的考點／作答結果」送上來（見 l23-map 的 emit）；老師的情境就是這些資料。
  // 資安星圖之後做好也放在同一個網域下，加一行到 STAR_MAPS 就能用。
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const STAR_MAPS = [
    { id: "l23", name: "科目三星圖", sub: "AI 應用規劃師中級・機器學習技術與應用", subject: "iPAS「AI 應用規劃師中級」的科目三（機器學習技術與應用）",
      url: LOCAL ? `${location.origin}/_star/l23/?embed=1` : "https://amy610731.github.io/l23-map/?embed=1" },
    { id: "sec2", name: "資安科目二星圖", sub: "資訊安全工程師初級・科目二", subject: "iPAS「資訊安全工程師初級」的科目二",
      url: LOCAL ? `${location.origin}/_star/sec2/?embed=1` : "https://amy610731.github.io/l23-map/sec2/?embed=1" },
    { id: "sec1", name: "資安科目一星圖", sub: "資訊安全工程師初級・科目一", subject: "iPAS「資訊安全工程師初級」的科目一",
      url: LOCAL ? `${location.origin}/_star/sec1/?embed=1` : "https://amy610731.github.io/l23-map/sec1/?embed=1" },
  ];
  const STAR = { t: 0, answers: {} };
  const starOrigin = m => { try { return new URL(m.url).origin; } catch { return ""; } };
  const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
  const LETTERS = "ABCDEFGH";
  function renderStarList() {
    $("#starList").innerHTML = STAR_MAPS.map(m => `<button type="button" class="star-btn" data-star="${esc(m.id)}"><b>🌌 ${esc(m.name)}</b><small>${esc(m.sub)}</small></button>`).join("");
    // 還沒上線的星圖（網址 404）先藏起來；只在正式網站查（同網域，本機測試不查）
    if (!LOCAL) STAR_MAPS.forEach(m => {
      fetch(m.url.replace("?embed=1", ""), { method: "HEAD", cache: "no-store" }).then(r => {
        if (!r.ok) { const b = $(`#starList [data-star="${m.id}"]`); if (b) b.hidden = true; }
      }).catch(() => {});
    });
  }
  $("#starList").addEventListener("click", e => {
    const b = e.target.closest("[data-star]"); if (!b) return;
    const m = STAR_MAPS.find(x => x.id === b.dataset.star); if (m) openStar(m);
  });
  async function openStar(map) {
    closeDoc();
    const seq = ++S.openSeq;
    S.doc = { id: "__star_" + map.id, name: map.name, virtual: true, pageCount: 0 };
    S.star = map; S.topic = null; S.page = 1; STAR.answers = {};
    showView("reader");
    $("#reader").classList.add("star");
    $("#docName").textContent = "🌌 " + map.name;
    $("#starFrame").src = map.url;
    setTab("chat");
    try {
      const chat = await dbByDoc("chat", S.doc.id);
      if (seq !== S.openSeq) return;
      S.chat = (chat || []).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    } catch { /* 讀不到對話紀錄就從空的開始 */ }
    renderSide();
  }
  // 把一個考點整理成給老師看的文字
  function starTopicText(t) {
    const L = [];
    L.push(`【考點】${t.title}（${[t.sectionName, t.chapter].filter(Boolean).join("｜")}）`);
    L.push(t.examHits ? `官方公告試題考過 ${t.examHits} 次（${(t.examRefs || []).join("、")}）` : "官方公告試題還沒考過這個考點");
    if (t.summary) L.push(`白話說明：${t.summary}`);
    if (t.keyPoints.length) L.push("重點：" + t.keyPoints.map((k, i) => `${i + 1}. ${k}`).join(" "));
    if (t.trap) L.push(`常見陷阱：${t.trap}`);
    if (t.related.length) L.push("相關考點：" + t.related.map(r => r.title + (r.why ? `（${r.why}）` : "")).join("；"));
    if (t.quiz.length) {
      L.push(`\n【畫面上的練習題，共 ${t.quiz.length} 題；編號和畫面上一樣。正確答案與解析是給你判斷用的，她回答之前不能講】`);
      t.quiz.forEach((q, i) => {
        L.push(`第 ${i + 1} 題（${q.source}）：${q.stem}`);
        L.push(q.options.map((o, j) => `(${LETTERS[j]}) ${o}`).join("　"));
        L.push(`正確答案：(${LETTERS[q.answer]})`);
        if (q.hint) L.push(`答錯時畫面會顯示的提示（只給你引導她用，不要照念、不要當成答案）：${q.hint}`);
        if (q.explanation) L.push(`解析：${q.explanation}`);
      });
    } else L.push("這個考點沒有練習題。");
    return L.join("\n").slice(0, 9000);
  }
  // 收進來的資料一律當成不可信的字串處理（長度、型別都檢查）
  function cleanTopic(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.title !== "string") return null;
    const arr = (a, n, f) => (Array.isArray(a) ? a.slice(0, n).map(f) : []);
    return {
      id: clip(raw.id, 40), title: clip(raw.title, 60), sectionName: clip(raw.sectionName, 60), chapter: clip(raw.chapter, 60),
      examHits: +raw.examHits || 0, examRefs: arr(raw.examRefs, 6, x => clip(x, 30)),
      summary: clip(raw.summary, 900), keyPoints: arr(raw.keyPoints, 8, x => clip(x, 300)), trap: clip(raw.trap, 400),
      related: arr(raw.related, 5, r => ({ title: clip(r && r.title, 40), why: clip(r && r.why, 120) })),
      quiz: arr(raw.quiz, 8, q => ({
        stem: clip(q && q.stem, 900), options: arr(q && q.options, 6, o => clip(o, 300)),
        answer: Math.max(0, Math.min(5, +(q && q.answer) || 0)), hint: clip(q && q.hint, 300), explanation: clip(q && q.explanation, 700), source: clip(q && q.source, 40) })),
    };
  }
  // 點了新考點／回到總覽：連線中就偷偷告訴老師（不要它回應）；沒連線的話，下次連線時 getConfig 會帶進去
  function starSetTopic(t) {
    S.topic = t; STAR.answers = {};
    clearTimeout(STAR.t);
    if (!PeiduLive.isOn()) return;
    STAR.t = setTimeout(() => {
      if (!PeiduLive.isOn() || !S.star) return;
      PeiduLive.sendText(t
        ? `（這則不用回應，只是讓你知道：學生在畫面上點開了新的考點「${t.title}」，之後她問「這個」「這題」「考我」就是指它。資料如下）\n${starTopicText(t)}`
        : "（這則不用回應，只是讓你知道：學生回到考點清單了，現在畫面上沒有點開的考點。）", false);
    }, 700);
  }
  function starAnswered(m) {
    const t = S.topic, q = t && t.quiz[+m.qi];
    if (!t || !q || m.topicId !== t.id) return;
    let text;
    if (m.type === "reveal") text = `學生在畫面上按了「看解析」，看了第 ${+m.qi + 1} 題的答案。`;
    else {
      const picked = Math.max(0, Math.min(5, +m.picked || 0)), ok = picked === q.answer;
      text = `學生在畫面上作答第 ${+m.qi + 1} 題，選了 (${LETTERS[picked]})，${ok ? "答對了" : "答錯了"}${+m.tries > 1 ? `（第 ${+m.tries} 次嘗試）` : ""}。`;
    }
    STAR.answers[m.qi] = text;
    if (PeiduLive.isOn()) PeiduLive.sendText("（這則不用回應，只是讓你知道：" + text + "）", false);
  }
  addEventListener("message", e => {
    if (!S.star || e.origin !== starOrigin(S.star) || e.source !== $("#starFrame").contentWindow) return;
    const m = e.data;
    if (!m || m.src !== "l23-map") return;
    if (m.type === "topic") { const t = cleanTopic(m.topic); if (t) starSetTopic(t); }
    else if (m.type === "home") starSetTopic(null);
    else if (m.type === "answer" || m.type === "reveal") starAnswered(m);
  });
  const STAR_RULES = map => `=== 星圖練習模式（和上面「講義」「這一頁」有衝突的地方，以這一段為準）===
學生正在用星圖複習${map.subject}。畫面上是一張考點星圖，她點開一個考點，畫面就會顯示白話說明、重點、陷阱和練習題。這次沒有講義頁面，也沒有螢光筆；她說的「這題」「這個」指的是她目前點開的考點，或它的練習題。
你的任務是用口頭問答幫她練習和複習：
- 她說「考我」「出題」「開始」「下一題」時，從目前考點的練習題挑一題（照順序；她指定第幾題就照她說的），用口語把題幹和每個選項念給她聽，念完停下來等她回答。出題這一段可以不受「120 字以內」的限制，但選項要念清楚、不要念出標點符號；題幹太長、有程式碼或公式時，用口語簡述重點，並說「完整題目在畫面上」。
- 她回答之前，絕對不能先講答案，也不能暗示答案。她回答之後：答對了，用一兩句講為什麼對，順便點出最容易混淆的那個選項；答錯了，先不要公佈答案，用你自己的話給一個提示引導她再想一次（資料裡的提示只是參考，不要照念，更不要把它當成答案念出來）；她說「不知道」「直接告訴我」，或第二次還答錯，才公佈正確答案並講解。
- 一次只出一題。講完等她說要不要下一題，不要自己連續出題，也不要她沒說話就開始考。
- 她問概念（「這是什麼意思」「為什麼」「跟某某差在哪」）就用考點資料回答：先白話、再講考試陷阱；資料沒寫的觀念用你自己的知識補充。
- 收到「（這則不用回應…）」開頭、說她在畫面上點了別的考點或作答的訊息，不要出聲，只要記住：之後以最新的考點為準；她在畫面上作答的結果算她已經回答過那一題，她問「我答對了嗎」就照結果回答。
- 如果現在沒有點開任何考點：她想練習，就請她先在星圖上點一個考點，或請她說想練哪個主題，你就口頭出一題概念題。`;
  function liveSystemStar() {
    const rules = LIVE_RULES.split("\n").filter(l => !/^- 你有一個 highlight/.test(l) && !/^- 她問「這題」「這段」/.test(l)).join("\n");
    const ctx = S.topic ? `=== 學生目前點開的考點 ===\n${starTopicText(S.topic)}` + (Object.keys(STAR.answers).length ? "\n她在畫面上已經作答：" + Object.values(STAR.answers).join("") : "") : "=== 學生還沒有點開任何考點 ===";
    return [rules, TUTOR, STAR_RULES(S.star), personaText(), ctx].join("\n\n");
  }
  renderStarList();

  // ================= 頁面渲染 =================
  const viewer = $("#viewer");
  function fitScale(w1) { return Math.max(0.2, Math.min(viewer.clientWidth - GUTTER * 2, MAX_PAGE_W) / w1) * S.zoom; }
  function sizePage(p) { p.el.style.width = Math.floor(p.w * S.scale) + "px"; p.el.style.height = Math.floor(p.h * S.scale) + "px"; }
  async function buildPages() {
    const box = $("#pages"); box.textContent = ""; S.pages = []; S.gen++;
    const first = await S.pdf.getPage(1);
    const vp1 = first.getViewport({ scale: 1 });
    S.base = { w: vp1.width, h: vp1.height };
    S.scale = fitScale(vp1.width); S.lastW = viewer.clientWidth;
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= S.pdf.numPages; n++) {
      const el = document.createElement("div");
      el.className = "page"; el.dataset.page = n;
      el.innerHTML = `<div class="hlLayer"></div><span class="pno">p.${n}</span>` + (n === S.lastRead && n > 1 ? `<div class="lastMark">🔖 上次讀到這裡</div>` : "");
      if (n === S.lastRead && n > 1) el.classList.add("last-read");
      frag.appendChild(el);
      const p = { n, el, w: vp1.width, h: vp1.height, page: n === 1 ? first : null, rendered: false, task: null };
      sizePage(p); S.pages.push(p);
    }
    box.appendChild(frag);
    $("#pageTotal").textContent = "/ " + S.pdf.numPages; $("#pageIn").max = S.pdf.numPages;
    drawAllHighlights();
  }
  async function renderPage(p) {
    if (p.rendered) return;
    p.rendered = true;
    const gen = S.gen, token = p.token = (p.token || 0) + 1;
    const stale = () => gen !== S.gen || token !== p.token;
    try {
      if (!p.page) p.page = await S.pdf.getPage(p.n);
      if (stale()) return;
      const vp1 = p.page.getViewport({ scale: 1 });
      if (Math.abs(vp1.width - p.w) > 0.5 || Math.abs(vp1.height - p.h) > 0.5) { p.w = vp1.width; p.h = vp1.height; sizePage(p); }
      const vp = p.page.getViewport({ scale: S.scale });
      // iPhone 是 3 倍螢幕，畫 2 倍就夠清楚；放大很多時再降，避免超過 Safari 的畫布上限
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12e6 / (vp.width * vp.height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      p.el.prepend(canvas);
      p.task = p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      const tl = document.createElement("div"); tl.className = "textLayer";
      tl.style.setProperty("--scale-factor", vp.scale);
      p.el.appendChild(tl);
      const tc = await getTC(p.n);
      if (stale()) return;
      pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] });
      await p.task.promise;
    } catch (e) {
      if (!e || e.name !== "RenderingCancelledException") console.warn("render", p.n, e);
    }
  }
  function unrenderPage(p) {
    try { if (p.task) p.task.cancel(); } catch {}
    p.task = null; p.token = (p.token || 0) + 1;
    for (const c of p.el.querySelectorAll("canvas")) { c.width = 0; c.height = 0; c.remove(); }  // 手機記憶體：真的釋放
    for (const t of p.el.querySelectorAll(".textLayer")) t.remove();
    p.rendered = false;
  }
  const MAX_RENDERED = 6;
  function updateVisible() {
    if (!S.pages.length) return;
    const vr = viewer.getBoundingClientRect(), H = vr.height || 600;
    let best = S.page || 1, bestVis = -Infinity;
    const center = vr.top + H / 2;
    for (const p of S.pages) {
      const r = p.el.getBoundingClientRect();
      const near = r.bottom > vr.top - H && r.top < vr.bottom + H;
      const far = r.bottom < vr.top - H * 2.5 || r.top > vr.bottom + H * 2.5;
      if (near) renderPage(p); else if (p.rendered && far) unrenderPage(p);
      const vis = Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top);
      if (vis > bestVis) { bestVis = vis; best = p.n; }
      p.dist = Math.abs((r.top + r.bottom) / 2 - center);
    }
    const rendered = S.pages.filter(p => p.rendered);
    if (rendered.length > MAX_RENDERED) rendered.sort((a, b) => b.dist - a.dist).slice(0, rendered.length - MAX_RENDERED).forEach(unrenderPage);
    setPage(best);
  }
  // 捲動停一下才算頁碼、畫頁面（不用 requestAnimationFrame：畫面在背景時它不會跑）
  viewer.addEventListener("scroll", () => {
    clearTimeout(updateVisible.t); updateVisible.t = setTimeout(updateVisible, 90);
    if (!$("#selbar").hidden) { clearTimeout(S.selT); S.selT = setTimeout(checkSelection, 150); }
  }, { passive: true });
  function maybeRefit() {
    if (!S.pdf || !S.pages.length) return;
    if (Math.abs(viewer.clientWidth - S.lastW) < 3) return;  // 只看寬度；抽屜拉高拉低不重畫
    clearTimeout(S.refitT); S.refitT = setTimeout(refit, 220);
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(maybeRefit).observe(viewer);
  addEventListener("resize", maybeRefit);
  addEventListener("orientationchange", () => setTimeout(maybeRefit, 300));
  function refit() {
    if (!S.pdf) return;
    const keep = S.page || 1, p = S.pages[keep - 1];
    const frac = p ? clamp01((viewer.scrollTop - p.el.offsetTop) / Math.max(1, p.el.offsetHeight)) : 0;
    const xfrac = viewer.scrollWidth > viewer.clientWidth ? (viewer.scrollLeft + viewer.clientWidth / 2) / viewer.scrollWidth : 0.5;
    S.lastW = viewer.clientWidth;
    S.scale = fitScale(S.base.w); S.gen++;
    for (const q of S.pages) { unrenderPage(q); sizePage(q); }
    gotoPage(keep, frac);
    viewer.scrollLeft = Math.max(0, xfrac * viewer.scrollWidth - viewer.clientWidth / 2);
  }
  function setZoom(z) {
    z = clamp(Math.round(z * 100) / 100, 0.6, 3);
    if (Math.abs(z - S.zoom) < 0.01) return;
    S.zoom = z; refit();
    toast(`縮放 ${Math.round(z * 100)}%`, 1200);
  }
  $("#zoomIn").onclick = () => setZoom(S.zoom * 1.25);
  $("#zoomOut").onclick = () => setZoom(S.zoom / 1.25);
  // iPhone/iPad 兩指縮放：Safari 的 gesture 事件 → 改成縮放講義（不讓整個畫面放大）
  viewer.addEventListener("gesturestart", e => { e.preventDefault(); });
  viewer.addEventListener("gesturechange", e => { e.preventDefault(); $("#pages").style.transform = `scale(${clamp(e.scale, 0.5, 3)})`; });
  viewer.addEventListener("gestureend", e => { e.preventDefault(); $("#pages").style.transform = ""; setZoom(S.zoom * clamp(e.scale, 0.5, 3)); });
  document.addEventListener("gesturestart", e => e.preventDefault());

  function gotoPage(n, offsetFrac = 0) {
    if (!S.pages.length) return;
    n = clamp(Math.round(+n) || 1, 1, S.pages.length);
    const el = S.pages[n - 1].el;
    viewer.scrollTop = Math.max(0, el.offsetTop - 12 + offsetFrac * el.offsetHeight);
    setPage(n); updateVisible();
  }
  function setPage(n) {
    if (n === S.page) return;
    S.page = n;
    if (document.activeElement !== $("#pageIn")) $("#pageIn").value = n;
    if (S.tab === "page") renderSide(); else updateCounts();
    paintLastChip();
    clearTimeout(S.lpT); S.lpT = setTimeout(saveLastPage, 1000);
    liveNotePage(n);
  }
  // 離開上次讀到的那頁時，左上角出現「🔖 回到上次 p.X」，點一下跳回去
  function paintLastChip() {
    const chip = $("#lastChip"), n = S.lastRead || 0;
    chip.hidden = !(S.pdf && n > 1 && S.page !== n);
    chip.textContent = `🔖 回到上次 p.${n}`;
  }
  $("#lastChip").onclick = () => gotoPage(S.lastRead);
  function saveLastPage() {
    const d = S.doc; if (!d) return;
    const n = S.page; if (!n || d.savedPage === n) return;
    d.savedPage = n; d.lastPage = n; d.updatedAt = nowISO();
    saveDocMeta(d);
  }
  function flushLastPage() { if (S.lpT) { clearTimeout(S.lpT); S.lpT = 0; saveLastPage(); } }
  $("#pageIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); gotoPage(e.target.value); e.target.blur(); } });
  $("#pageIn").addEventListener("change", e => gotoPage(e.target.value));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushLastPage(); });
  addEventListener("pagehide", flushLastPage);

  // ================= 文字（座標） =================
  function getTC(n) {
    if (!S.tc.has(n)) S.tc.set(n, S.pdf.getPage(n).then(pg => pg.getTextContent()));
    return S.tc.get(n);
  }
  const normChar = c => { const n = c.normalize("NFKC"); return (n.length === 1 ? n : c).toLowerCase(); };
  // 每個字的 0–1 座標（跟電腦版 rects 同一套意義）
  async function pageChars(n) {
    if (S.chars.has(n)) return S.chars.get(n);
    const page = await S.pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await getTC(n);
    const list = []; let text = "";
    tc.items.forEach((it, idx) => {
      if (typeof it.str !== "string") return;
      if (it.str) {
        const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
        const fh = Math.hypot(tx[2], tx[3]) || 1;
        const st = (tc.styles && tc.styles[it.fontName]) || {};
        const asc = st.ascent ? st.ascent : st.descent ? 1 + st.descent : 0.85;
        const w = (st.vertical ? it.height : it.width) * vp.scale;
        const left = tx[4], top = tx[5] - fh * asc;
        const chs = [...it.str], cw = w / Math.max(1, chs.length);
        chs.forEach((c, i) => {
          list.push({ c, n: normChar(c), ws: /\s/.test(c), item: idx,
            x0: (left + i * cw) / vp.width, y0: top / vp.height, x1: (left + (i + 1) * cw) / vp.width, y1: (top + fh) / vp.height });
        });
        text += it.str;
      }
      if (it.hasEOL) text += "\n";
    });
    const res = { list, text: text.replace(/\n{3,}/g, "\n\n").trim() };
    S.chars.set(n, res);
    return res;
  }
  async function getPageText(n) { try { return (await pageChars(n)).text; } catch { return ""; } }
  function regionText(chars, [rx0, ry0, rx1, ry1]) {
    let out = "", prev = null;
    for (const ch of chars.list) {
      const cx = (ch.x0 + ch.x1) / 2, cy = (ch.y0 + ch.y1) / 2;
      if (cx < rx0 || cx > rx1 || cy < ry0 || cy > ry1) continue;
      if (prev && ch.item !== prev.item) {
        const h = Math.max(ch.y1 - ch.y0, 1e-4);
        out += Math.abs((ch.y0 + ch.y1) / 2 - (prev.y0 + prev.y1) / 2) > h * 0.5 ? "\n" : "";
      }
      out += ch.c; prev = ch;
    }
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function mergeRects(rs) {
    rs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const out = [];
    for (const r of rs) {
      const l = out[out.length - 1];
      const sameLine = l && Math.abs((l[1] + l[3]) / 2 - (r[1] + r[3]) / 2) < (r[3] - r[1]) * 0.5;
      if (sameLine && r[0] <= l[2] + 0.02) { l[0] = Math.min(l[0], r[0]); l[1] = Math.min(l[1], r[1]); l[2] = Math.max(l[2], r[2]); l[3] = Math.max(l[3], r[3]); }
      else out.push(r.slice());
    }
    return out.map(r => r.map(v => Math.round(clamp01(v) * 1e5) / 1e5));
  }
  // 在一頁找一段原文（忽略空白、全半形；loose＝連標點符號也忽略），回傳 rects；找不到回 null
  const SKIP_LOOSE = /[\s\p{P}\p{S}]/u;
  function findRects(chars, query, loose = false) {
    const skip = loose ? (c => SKIP_LOOSE.test(c)) : (c => /\s/.test(c));
    const q = [...String(query)].map(normChar).filter(c => !skip(c)).join("");
    if (q.length < 2) return null;
    const arr = chars.list.filter(c => !skip(c.n));
    const txt = arr.map(c => c.n).join("");
    const idx = txt.indexOf(q);
    if (idx < 0) return null;
    const byItem = new Map();
    for (const c of arr.slice(idx, idx + q.length)) {
      const r = byItem.get(c.item);
      if (!r) byItem.set(c.item, [c.x0, c.y0, c.x1, c.y1]);
      else { r[0] = Math.min(r[0], c.x0); r[1] = Math.min(r[1], c.y0); r[2] = Math.max(r[2], c.x1); r[3] = Math.max(r[3], c.y1); }
    }
    return mergeRects([...byItem.values()]);
  }

  // ================= 螢光筆 =================
  function drawAllHighlights() {
    const byPage = new Map();
    for (const a of S.anns) { if (!byPage.has(a.page)) byPage.set(a.page, []); byPage.get(a.page).push(a); }
    for (const p of S.pages) {
      const layer = p.el.querySelector(".hlLayer");
      const items = byPage.get(p.n) || [];
      if (!items.length && !layer.firstChild) continue;
      layer.textContent = "";
      for (const a of items) {
        for (const r of a.rects || []) {
          if (!Array.isArray(r) || r.length < 4) continue;
          const [x0, y0, x1, y1] = r;
          const d = document.createElement("div");
          d.className = "hl k-" + (KINDS[a.kind] ? a.kind : "key") + (a.region ? " box" : "");
          d.dataset.id = a.id;
          d.style.cssText = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%`;
          layer.appendChild(d);
        }
      }
    }
    drawFindMarks();
  }
  function onAnnsChanged() { drawAllHighlights(); if (S.tab !== "chat") renderSide(); else updateCounts(); }

  // ================= 🔍 搜尋整份講義 =================
  const FIND = { q: "", results: [], cur: -1, doc: null, seq: 0 };
  // 一頁裡找出所有符合處（忽略空白、全半形、大小寫）
  function findAllRects(chars, q) {
    const arr = chars.list.filter(c => !/\s/.test(c.n));
    const txt = arr.map(c => c.n).join(""), out = [];
    let idx = txt.indexOf(q);
    while (idx >= 0) {
      const byItem = new Map();
      for (const c of arr.slice(idx, idx + q.length)) {
        const r = byItem.get(c.item);
        if (!r) byItem.set(c.item, [c.x0, c.y0, c.x1, c.y1]);
        else { r[0] = Math.min(r[0], c.x0); r[1] = Math.min(r[1], c.y0); r[2] = Math.max(r[2], c.x1); r[3] = Math.max(r[3], c.y1); }
      }
      const a = Math.max(0, idx - 16), b = Math.min(arr.length, idx + q.length + 16), orig = arr.map(c => c.c);
      out.push({ rects: mergeRects([...byItem.values()]),
        snippet: (a ? "…" : "") + orig.slice(a, idx).join("") + "【" + orig.slice(idx, idx + q.length).join("") + "】" + orig.slice(idx + q.length, b).join("") + (b < arr.length ? "…" : "") });
      idx = txt.indexOf(q, idx + q.length);
    }
    return out;
  }
  function drawFindMarks() {
    $$("#pages .srch").forEach(x => x.remove());
    if (!S.doc || FIND.doc !== S.doc.id) return;
    FIND.results.forEach((r, i) => {
      const p = S.pages[r.page - 1]; if (!p) return;
      const layer = p.el.querySelector(".hlLayer");
      for (const [x0, y0, x1, y1] of r.rects) {
        const d = document.createElement("div");
        d.className = "srch" + (i === FIND.cur ? " cur" : "");
        d.style.cssText = `left:${x0 * 100 - 0.3}%;top:${y0 * 100 - 0.2}%;width:${(x1 - x0) * 100 + 0.6}%;height:${(y1 - y0) * 100 + 0.4}%`;
        layer.appendChild(d);
      }
    });
  }
  function findGo(i) {
    if (!FIND.results.length) return;
    FIND.cur = (i + FIND.results.length) % FIND.results.length;
    const r = FIND.results[FIND.cur], p = S.pages[r.page - 1];
    drawFindMarks();
    $("#findCount").textContent = `${FIND.cur + 1} / ${FIND.results.length}`;
    $$("#findList button").forEach((b, k) => b.classList.toggle("cur", k === FIND.cur));
    if (!p) return;
    const [x0, y0, x1] = r.rects[0];
    viewer.scrollTop = Math.max(0, p.el.offsetTop + y0 * p.el.offsetHeight - viewer.clientHeight / 3);
    const cx = p.el.offsetLeft + ((x0 + x1) / 2) * p.el.offsetWidth;
    if (cx < viewer.scrollLeft + 30 || cx > viewer.scrollLeft + viewer.clientWidth - 30) viewer.scrollLeft = cx - viewer.clientWidth / 2;
    setPage(r.page); updateVisible();
  }
  async function findRun() {
    const raw = $("#findIn").value.trim();
    const q = [...raw].map(normChar).filter(c => !/\s/.test(c)).join("");
    if (!S.pdf) return;
    if (!q) { FIND.q = ""; FIND.results = []; drawFindMarks(); $("#findCount").textContent = ""; $("#findList").innerHTML = ""; return; }
    if (q === FIND.q && S.doc && FIND.doc === S.doc.id) return findGo(FIND.cur + 1);  // 同一個字再按一次＝下一個
    const seq = ++FIND.seq, doc = S.doc, results = [];
    for (let n = 1; n <= S.pages.length; n++) {
      if (seq !== FIND.seq || S.doc !== doc) return;
      if (n % 10 === 1) $("#findCount").textContent = `${Math.round(n / S.pages.length * 100)}%`;
      let chars; try { chars = await pageChars(n); } catch { continue; }
      for (const m of findAllRects(chars, q)) { results.push({ page: n, ...m }); if (results.length >= 300) break; }
      if (results.length >= 300) break;
    }
    Object.assign(FIND, { q, doc: doc.id, results, cur: -1 });
    $("#findList").innerHTML = results.map((x, k) => `<button type="button" data-k="${k}"><b>p.${x.page}</b>${esc(x.snippet)}</button>`).join("");
    if (!results.length) { drawFindMarks(); $("#findCount").textContent = "找不到"; return; }
    const start = results.findIndex(x => x.page >= S.page);
    findGo(start >= 0 ? start : 0);
  }
  function closeFind() {
    $("#findBar").hidden = true; $("#findList").hidden = true;
    FIND.q = ""; FIND.results = []; FIND.cur = -1; FIND.seq++; drawFindMarks();
  }
  $("#findBtn").onclick = () => {
    if (!$("#findBar").hidden) return closeFind();
    $("#findBar").hidden = false; viewer.scrollTop = viewer.scrollTop;  // 搜尋列固定在上方
    const sel = String(window.getSelection && window.getSelection() || "").trim();
    if (sel && sel.length <= 40) $("#findIn").value = sel;
    $("#findIn").focus(); $("#findIn").select();
  };
  $("#findIn").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); findRun(); $("#findIn").blur(); }
    else if (e.key === "Escape") closeFind();
  });
  const sameQ = () => [...$("#findIn").value.trim()].map(normChar).filter(c => !/\s/.test(c)).join("") === FIND.q;
  $("#findNext").onclick = () => (sameQ() && FIND.results.length ? findGo(FIND.cur + 1) : findRun());
  $("#findPrev").onclick = () => (sameQ() && FIND.results.length ? findGo(FIND.cur - 1) : findRun());
  $("#findListBtn").onclick = () => { $("#findList").hidden = !$("#findList").hidden; };
  $("#findClose").onclick = closeFind;
  $("#findList").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) { findGo(+b.dataset.k); if (!mqWide.matches) $("#findList").hidden = true; } });

  // 點一下螢光筆 → 小選單：看是誰標的、刪除這個重點（拖曳選字、框選、畫筆時不觸發）
  const HLPOP = { id: null, down: null };
  document.getElementById("pages").addEventListener("pointerdown", e => { HLPOP.down = [e.clientX, e.clientY]; }, true);
  function hlAtPoint(x, y) {
    const hits = [...document.querySelectorAll("#pages .hl")].filter(h => {
      const r = h.getBoundingClientRect();
      return x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3;
    });
    return hits.length ? hits[hits.length - 1] : null;
  }
  function closeHlPop() { $("#hlPop").hidden = true; HLPOP.id = null; }
  document.getElementById("pages").addEventListener("click", e => {
    if (BOX.on || BOX.drag) return;
    if (HLPOP.down && Math.hypot(e.clientX - HLPOP.down[0], e.clientY - HLPOP.down[1]) > 8) return;  // 拖曳／捲動，不是點
    const sel = window.getSelection && window.getSelection();
    if (sel && String(sel).trim()) return;  // 正在選字
    const h = hlAtPoint(e.clientX, e.clientY);
    if (!h) { if (!$("#hlPop").hidden) closeHlPop(); return; }
    const a = S.anns.find(x => x.id === h.dataset.id); if (!a) return;
    HLPOP.id = a.id;
    const kindName = { key: "重點", confuse: "易混", extra: "補充", question: "提問", note: "筆記" }[a.kind] || "重點";
    $("#hlPopWho").textContent = `${a.author === "claude" ? "🖍 老師標的" : "✏️ 你標的"}${kindName}・第 ${a.page} 頁`;
    $("#hlPopText").textContent = (a.text || "").slice(0, 80) + ((a.text || "").length > 80 ? "…" : "") + (a.note ? `\n— ${a.note}` : "");
    const pop = $("#hlPop"); pop.hidden = false;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(e.clientX - pw / 2, innerWidth - pw - 8)) + "px";
    pop.style.top = (e.clientY + 16 + ph <= innerHeight - 8 ? e.clientY + 16 : Math.max(8, e.clientY - ph - 16)) + "px";
  });
  $("#hlPopClose").onclick = closeHlPop;
  $("#hlPopDel").onclick = async () => {
    const id = HLPOP.id; closeHlPop();
    if (id) try { await store.deleteAnn(id); toast("刪掉了"); } catch (err) { writeErr(err); }
  };


  // ================= 選字工具列 =================
  const selbar = $("#selbar");
  document.addEventListener("selectionchange", () => {
    clearTimeout(S.selT);
    S.selT = setTimeout(checkSelection, TOUCH ? 400 : 250);  // iPhone 長按選字沒有 mouseup，停 0.4 秒再出現
  });
  document.addEventListener("mouseup", e => { if (!selbar.contains(e.target)) setTimeout(checkSelection, 10); });
  function hideSelbar() { selbar.hidden = true; }
  function checkSelection() {
    if (BOX.on || $("#reader").hidden) return hideSelbar();
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      if (Date.now() - S.selbarTouch < 900) return;
      return hideSelbar();
    }
    const range = sel.getRangeAt(0);
    const sc = range.startContainer;
    const startEl = sc.nodeType === 1 ? sc : sc.parentElement;
    const pageEl = startEl && startEl.closest ? startEl.closest(".page") : null;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!pageEl || !$("#pages").contains(pageEl) || !text) return hideSelbar();
    const pr = pageEl.getBoundingClientRect();
    const rects = mergeRects([...range.getClientRects()]
      .filter(r => r.width > 1 && r.height > 1 && r.bottom > pr.top && r.top < pr.bottom)
      .map(r => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, (r.right - pr.left) / pr.width, (r.bottom - pr.top) / pr.height]));
    if (!rects.length) return hideSelbar();
    S.pending = { page: +pageEl.dataset.page, text, rects };
    selbar.hidden = false;
    placeSelbar(range.getBoundingClientRect());
  }
  function placeSelbar(rect) {
    const w = selbar.offsetWidth || 330, h = selbar.offsetHeight || 50;
    let top;
    if (TOUCH) top = rect.bottom + 30 + h <= innerHeight - 120 ? rect.bottom + 30 : rect.top - h - 56;  // iPhone 自己的選單在選取上方，我們放下方
    else top = rect.top - h - 8 >= 8 ? rect.top - h - 8 : rect.bottom + 8;
    selbar.style.left = clamp(rect.left, 8, innerWidth - w - 8) + "px";
    selbar.style.top = clamp(top, 8, innerHeight - h - 8) + "px";
  }
  selbar.addEventListener("mousedown", e => e.preventDefault());
  selbar.addEventListener("pointerdown", () => { S.selbarTouch = Date.now(); });
  selbar.addEventListener("click", e => {
    const b = e.target.closest("button[data-kind]"); if (!b || !S.pending) return;
    const pend = S.pending, kind = b.dataset.kind;
    S.pending = null; hideSelbar();
    try { getSelection().removeAllRanges(); } catch {}
    if (kind === "question" || kind === "note") return openComposer(kind, pend);
    store.addAnn({ ...pend, kind }).then(() => toast(`畫好${KINDS[kind]}了（第 ${pend.page} 頁）`)).catch(writeErr);
  });

  // ================= 輸入框（提問／筆記／框選自己打） =================
  function openComposer(kind, pend) {
    S.comp = { kind, pend };
    const tag = $("#compTag");
    tag.className = "tag k-" + (kind === "region" ? "question" : kind);
    tag.textContent = kind === "note" ? "筆記" : kind === "region" ? "框選提問" : "提問";
    $("#compQuote").textContent = pend.text;
    $("#compText").value = "";
    $("#compText").placeholder = kind === "note" ? "寫下你的筆記…" : "這段哪裡不懂？想問老師什麼？";
    $("#compSave").hidden = kind === "region";
    $("#compSave").textContent = kind === "note" ? "存起來" : "只記下來";
    $("#compSave").className = kind === "note" ? "btn primary" : "btn ghost";
    $("#compAsk").hidden = kind === "note";
    $("#composer").hidden = false; $("#chatBox").hidden = true;
    openSheet(300);
    setTimeout(() => $("#compText").focus(), 60);
  }
  function closeComposer() { $("#composer").hidden = true; S.comp = null; $("#chatBox").hidden = S.tab !== "chat"; }
  $("#compCancel").onclick = () => { if (S.comp && S.comp.kind === "region") closeRegionPop(true); closeComposer(); };
  $("#compSave").onclick = async () => {
    const c = S.comp; if (!c) return;
    const v = $("#compText").value.trim();
    if (c.kind === "question" && !v) return toast("先寫下你的問題");
    closeComposer();
    try { await store.addAnn({ ...c.pend, kind: c.kind, note: v }); toast(c.kind === "note" ? "筆記存好了" : "問題記下來了"); }
    catch (e) { writeErr(e); }
  };
  $("#composer").addEventListener("submit", async e => {
    e.preventDefault();
    const c = S.comp; if (!c) return;
    if (c.kind === "note") return $("#compSave").click();
    const v = $("#compText").value.trim();
    if (!v) return toast("先寫下你的問題");
    if (!ensureLive()) return;  // 一定要在 await 之前（iPhone 只在點擊當下讓聲音出來）
    if (c.kind === "region") { closeComposer(); return askRegion(v); }
    closeComposer();
    let ann;
    try { ann = await store.addAnn({ ...c.pend, kind: "question", note: v }); } catch (err) { return writeErr(err); }
    sendLive({ text: `${v}\n\n（我在第 ${c.pend.page} 頁選起來的文字）\n${c.pend.text}`,
      display: `${v}\n「${c.pend.text.slice(0, 80)}${c.pend.text.length > 80 ? "…" : ""}」`, page: c.pend.page, annId: ann.id });
  });

  // ================= 框選提問 =================
  const BOX = { on: false, drag: null, pending: null };
  function setBox(on) {
    if (on && !S.pdf) return;
    BOX.on = on;
    document.body.classList.toggle("box", on);
    $("#boxBanner").hidden = !on;
    if (on) { hideSelbar(); try { getSelection().removeAllRanges(); } catch {} closeSheet(); }
  }
  $("#boxCancel").onclick = () => { setBox(false); closeRegionPop(true); };
  function closeRegionPop(removeDraft) {
    $("#regionPop").hidden = true;
    if (removeDraft && BOX.pending) { BOX.pending.div.remove(); BOX.pending = null; }
  }
  viewer.addEventListener("pointerdown", e => {
    if (!BOX.on || (e.pointerType === "mouse" && e.button !== 0)) return;
    const pageEl = e.target.closest(".page"); if (!pageEl) return;
    e.preventDefault();
    closeRegionPop(true);
    const r = pageEl.getBoundingClientRect();
    const div = document.createElement("div"); div.className = "boxDraft"; pageEl.appendChild(div);
    const x = clamp01((e.clientX - r.left) / r.width), y = clamp01((e.clientY - r.top) / r.height);
    BOX.drag = { pageEl, r, div, x0: x, y0: y, x1: x, y1: y };
    try { viewer.setPointerCapture(e.pointerId); } catch {}
  });
  viewer.addEventListener("pointermove", e => {
    const d = BOX.drag; if (!d) return;
    d.x1 = clamp01((e.clientX - d.r.left) / d.r.width); d.y1 = clamp01((e.clientY - d.r.top) / d.r.height);
    Object.assign(d.div.style, { left: Math.min(d.x0, d.x1) * 100 + "%", top: Math.min(d.y0, d.y1) * 100 + "%",
      width: Math.abs(d.x1 - d.x0) * 100 + "%", height: Math.abs(d.y1 - d.y0) * 100 + "%" });
  });
  viewer.addEventListener("pointercancel", () => { if (BOX.drag) { BOX.drag.div.remove(); BOX.drag = null; } });
  viewer.addEventListener("pointerup", e => {
    const d = BOX.drag; if (!d) return;
    BOX.drag = null;
    const rect = [Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.max(d.x0, d.x1), Math.max(d.y0, d.y1)].map(v => Math.round(v * 1e5) / 1e5);
    if ((rect[2] - rect[0]) * d.r.width < 14 || (rect[3] - rect[1]) * d.r.height < 14) { d.div.remove(); return; }  // 太小＝誤觸
    BOX.pending = { page: +d.pageEl.dataset.page, rect, div: d.div };
    const pop = $("#regionPop");
    pop.hidden = false;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = clamp(e.clientX - pw / 2, 8, innerWidth - pw - 8) + "px";
    pop.style.top = (e.clientY + 14 + ph <= innerHeight - 8 ? e.clientY + 14 : clamp(e.clientY - ph - 14, 8, innerHeight - ph - 8)) + "px";
  });
  $("#regionPop").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.q) { if (!ensureLive()) return; return askRegion(b.dataset.q); }
    if (b.dataset.act === "cancel") return closeRegionPop(true);
    if (b.dataset.act === "type" && BOX.pending) {
      $("#regionPop").hidden = true;
      openComposer("region", { page: BOX.pending.page, text: `第 ${BOX.pending.page} 頁框起來的範圍` });
    }
  });
  async function askRegion(question) {
    const pend = BOX.pending; if (!pend) return;
    BOX.pending = null; $("#regionPop").hidden = true; setBox(false);
    let rtext = "";
    try { rtext = regionText(await pageChars(pend.page), pend.rect).slice(0, 3000); } catch {}
    let ann;
    try { ann = await store.addAnn({ page: pend.page, kind: "question", rects: [pend.rect], region: true, text: rtext, note: question }); }
    catch (e) { pend.div.remove(); return writeErr(e); }
    pend.div.remove();
    const body = rtext ? `${question}\n\n（我框起來的內容，第 ${pend.page} 頁）\n${rtext}`
      : `${question}\n\n（我框起來的是第 ${pend.page} 頁的一塊圖，裡面抽不到文字，請根據這頁內容回答）`;
    sendLive({ text: body, display: `⬚ 第 ${pend.page} 頁框選：${question}`, page: pend.page, annId: ann.id });
  }
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("#regionPop").hidden) closeRegionPop(true); else if (BOX.on) setBox(false);
    hideSelbar();
  });

  // ================= 🎙️ 即時陪讀（Gemini Live） =================
  const LIVE = { status: "off", caption: null, lastTurn: null, page: null, pendingAnn: null, pageTimer: null, awaiting: null, latency: [] };
  const LABELS = {
    off: ["開始陪讀", "按一下直接說話", "🎙️"],
    connecting: ["連線中…", "問麥克風時按允許", "⏳"],
    reconnecting: ["重新連線中…", "網路不穩，馬上回來", "🔄"],
    listening: ["我在聽", "說完會回答・按這結束", "🎙️"],
    speaking: ["老師說話中", "開口就能插話", "🔊"],
    looking: ["查資料中…", "老師在查維基百科", "🔎"],
  };
  function liveUI() {
    const st = LIVE.status, b = $("#micBtn"), muted = PeiduLive.isMuted();
    b.dataset.st = st;
    b.classList.toggle("muted", muted);
    let [label, sub, ico] = LABELS[st] || LABELS.off;
    if (muted && st === "listening") { label = "麥克風靜音中"; sub = "老師聽不到你"; ico = "🔇"; }
    $("#micLabel").textContent = label; $("#micSub").textContent = sub; $("#micIco").textContent = ico;
    b.setAttribute("aria-label", st === "off" ? "開始陪讀" : label + "（按一下結束）");
    const on = st !== "off";
    $("#muteBtn").disabled = !on;
    $("#muteBtn").setAttribute("aria-pressed", String(muted));
    $("#muteBtn").classList.toggle("muted", muted);
    $("#muteIco").textContent = muted ? "🔇" : "🎤";
    $("#muteLabel").textContent = muted ? "已靜音" : "靜音";
    paintCaption();
  }
  function paintCaption() {
    const c = LIVE.caption || LIVE.lastTurn;
    const chatShown = S.tab === "chat" && (mqWide.matches || S.sheetOpen);  // 對話欄已經在畫面上 → 不重複顯示字幕
    const show = LIVE.status !== "off" && c && (c.amy || c.claude) && !chatShown;
    $("#caption").hidden = !show;
    if (!show) return;
    $("#capAmy").textContent = c.amy || "";
    $("#capTeacher").textContent = c.claude || "";
  }
  // 字幕更新很頻繁：只改字幕那兩個泡泡，不要整個對話區重畫
  function paintLiveChat() {
    clearTimeout(paintLiveChat.t);
    paintLiveChat.t = setTimeout(() => {
      paintCaption();
      const c = LIVE.caption, body = $("#sideBody");
      if (S.tab !== "chat" || !S.sheetOpen && !mqWide.matches) return;
      const amyEl = body.querySelector(".msg.amy.live .txt"), tEl = body.querySelector(".msg.claude.live .txt");
      if (c && ((c.amy && !amyEl) || (c.claude && !tEl))) return renderChat();
      if (amyEl) amyEl.textContent = c ? c.amy : "";
      if (tEl) tEl.textContent = c ? c.claude : "";
      body.scrollTop = body.scrollHeight;
    }, 100);
  }
  function liveSystem(pg, text) {
    return [LIVE_RULES, TUTOR, personaText(), `=== 學生正在讀《${stem(S.doc ? S.doc.name : "")}》第 ${pg} 頁，這頁內容 ===\n${(text || "").trim() || "（抓不到文字）"}`].join("\n\n");
  }
  // 按麥克風／問老師之前呼叫：沒開就開（要在點擊事件裡、await 之前呼叫）
  function ensureLive() {
    if (PeiduLive.isOn()) return true;
    if (!S.pdf && !S.star) { toast("講義還在打開中"); return false; }
    if (!hasKey()) { openSettings("要先貼上 Gemini 金鑰，才能跟老師語音討論"); return false; }
    setLive(true);
    return true;
  }
  function setLive(on) {
    if (!on) { PeiduLive.stop(); LIVE.caption = null; LIVE.lastTurn = null; if (S.tab === "chat") renderSide(); return; }
    if (!S.pdf && !S.star) return toast("講義還在打開中");
    if (!hasKey()) return openSettings("要先貼上 Gemini 金鑰，才能跟老師語音討論");
    // ⚠ 這裡必須同步呼叫 PeiduLive.start（不能先 await），iPhone 才會讓聲音出來
    const liveOpts = {
      voice: prefs.voice,
      silenceMs: +prefs.silence,
      speed: +prefs.speed || 0.9,  // 老師語速
      // 童音：字幕一句一句交給 Azure 念；念不出來那句會改用手機內建聲音
      tts: (text, v) => azureTts(text, v),
      onTtsError: err => { toast("童音念不出來：" + (err.message || err) + "，這次先用老師原本的聲音", 5000); S.sys.push({ text: "童音念不出來：" + (err.message || err), after: S.chat.length }); if (S.tab === "chat") renderSide(); },
      getConfig: async () => {
        const key = await getKey();
        if (!key) throw new Error("NEED_KEY");
        const model = await pickLiveModel(key);
        if (S.star) return { key, model, system: liveSystemStar() };  // 星圖：情境是目前點開的考點
        const pg = S.page || 1;
        LIVE.page = pg;
        const text = (await getPageText(pg)).slice(0, 6000);
        return { key, model, system: liveSystem(pg, text) };
      },
      onStatus: s => {
        const first = LIVE.status === "connecting" && s === "listening";
        LIVE.status = s; liveUI();
        if (first) toast("開始了！直接說話就好，老師說話時也可以直接插話");
      },
      onCaption: c => { LIVE.caption = c; paintLiveChat(); },
      onTurn: async ({ amy, claude }) => {
        LIVE.caption = null; LIVE.lastTurn = { amy, claude };
        paintCaption();
        if (!S.doc) return;
        try {
          if (amy) await store.addChat({ page: S.page, role: "amy", text: amy, topic: S.star && S.topic ? S.topic.title : "" });
          if (claude) {
            await store.addChat({ page: S.page, role: "claude", text: claude, topic: S.star && S.topic ? S.topic.title : "" });
            LIVE.awaiting = null;
            if (LIVE.pendingAnn) { const id = LIVE.pendingAnn; LIVE.pendingAnn = null; await store.updateAnn(id, { answer: claude }); }
          }
        } catch (e) { writeErr(e); }
        if (S.tab === "chat") renderSide();
      },
      onLatency: ms => { LIVE.latency.push(ms); },
      onError: err => {
        LIVE.status = "off"; liveUI();
        const m = String(err && err.message || err);
        if (m === "NEED_KEY" || m.startsWith("KEY:")) { openSettings(keyErrText(err)); return; }
        S.sys.push({ text: "即時陪讀停了：" + m, after: S.chat.length });
        if (S.tab === "chat") renderSide();
        toast("即時陪讀停了：" + m, 5000);
      },
      // 老師要查資料（中文維基百科）
      onLookup: async query => {
        S.sys.push({ text: `🔎 老師查了：${query}`, after: S.chat.length });
        if (S.tab === "chat") renderSide();
        return lookup(query);
      },
      // 邊討論邊畫重點：老師挑原文，先找這頁，找不到再找前後頁（題目常跨頁）
      onHighlight: async ({ text, kind, note }) => {
        const t = String(text || "").replace(/^[「『"]|[」』"]$/g, "").trim();
        if (!t || !S.pdf) return "沒標成功：沒有原文";
        const base = S.page || 1;
        kind = ["key", "confuse", "extra"].includes(kind) ? kind : "key";
        for (const pg of [base, base + 1, base - 1].filter(p => p >= 1 && p <= S.pages.length)) {
          let chars; try { chars = await pageChars(pg); } catch { continue; }
          const rects = findRects(chars, t) || findRects(chars, t, true);
          if (!rects || !rects.length) continue;
          if (S.anns.some(a => a.page === pg && a.author === "claude" && a.text === t)) return `這段在第 ${pg} 頁已經標過了`;
          const ann = await store.addAnn({ page: pg, kind, text: t, rects, note: String(note || "").trim(), author: "claude" });
          showUndo(ann);
          return `已經標在第 ${pg} 頁`;
        }
        return `沒標成功：第 ${base} 頁（和前後頁）找不到「${t.slice(0, 30)}」這段原文。text 必須從講義內容逐字複製，不要改字或加字。`;
      },
      // 只有字幕沒有聲音＝這個語音模型今天的免費額度用完 → 換下一個模型（不重開麥克風），把剛剛的問題再問一次
      onNoAudio: ({ model, amy }) => {
        markExhausted("live", model, 6 * 3600);
        toast("這個語音模型的額度用完了，換另一個…");
        if (PeiduLive.restart() && amy) PeiduLive.sendText(amy, true);
      },
      // 連線時就說額度用完／模型不能用
      onQuota: ({ model }) => {
        markExhausted("live", model, 6 * 3600);
        toast("這個語音模型現在不能用，換另一個…");
        if (PeiduLive.restart() && LIVE.awaiting) PeiduLive.sendText(LIVE.awaiting, true);
      },
    };
    if (S.star) delete liveOpts.onHighlight;  // 星圖沒有講義可以畫螢光筆
    PeiduLive.start(liveOpts);
  }
  $("#micBtn").onclick = () => { if (PeiduLive.isOn()) setLive(false); else ensureLive(); };
  $("#muteBtn").onclick = () => {
    if (!PeiduLive.isOn()) return;
    PeiduLive.setMuted(!PeiduLive.isMuted()); liveUI();
    toast(PeiduLive.isMuted() ? "麥克風靜音了：老師聽不到你，打字還是可以問" : "麥克風打開了");
  };
  $("#caption").onclick = () => { setTab("chat"); openSheet(); };
  // 傳文字給老師（老師用聲音回答）；文字問題本身記進對話
  function sendLive({ text, display, page, annId }) {
    if (!PeiduLive.isOn()) return false;
    store.addChat({ page: page || S.page, role: "amy", text: display || text, topic: S.star && S.topic ? S.topic.title : "" }).catch(writeErr);
    LIVE.pendingAnn = annId || null;
    LIVE.awaiting = text;
    LIVE.lastTurn = { amy: display || text, claude: "" }; paintCaption();
    return PeiduLive.sendText(text, true);
  }
  // 即時陪讀中翻頁：停 1.5 秒確定不是一路翻過去，才把新頁內容告訴老師（不要它回應）
  function liveNotePage(n) {
    if (!PeiduLive.isOn() || n === LIVE.page) return;
    clearTimeout(LIVE.pageTimer);
    LIVE.pageTimer = setTimeout(async () => {
      if (!PeiduLive.isOn() || S.page !== n) return;
      const text = (await getPageText(n)).slice(0, 6000);
      PeiduLive.sendText(`（這則不用回應，只是讓你知道：學生翻到第 ${n} 頁了，之後她問「這題、這段」就是指這頁。這頁內容如下）\n${text || "（這頁抽不到文字）"}`, false);
      LIVE.page = n;
    }, 1500);
  }

  // ================= 抽屜／側欄 =================
  const side = $("#side");
  const isWide = () => mqWide.matches;
  function openSheet(minH) {
    if (isWide()) return;
    const rh = $("#reader").clientHeight || innerHeight;
    let h = S.sheetH || Math.round(rh * 0.45);
    if (minH) h = Math.max(h, minH);
    h = clamp(h, 160, Math.round(rh * 0.8));
    side.style.height = h + "px";
    side.classList.add("open"); S.sheetOpen = true; paintCaption();
    $("#notesBtn").setAttribute("aria-pressed", "true");
    renderSide();
  }
  function closeSheet() {
    side.classList.remove("open"); S.sheetOpen = false; paintCaption();
    $("#notesBtn").setAttribute("aria-pressed", "false");
  }
  $("#notesBtn").onclick = () => { if (S.sheetOpen) closeSheet(); else openSheet(); };
  $("#sheetClose").onclick = closeSheet;
  (() => {  // 拉把：上下拖調高度，拖到很低就收起；點一下收起
    const hd = $("#sheetHandle");
    let start = null;
    hd.addEventListener("pointerdown", e => { start = { y: e.clientY, h: side.offsetHeight, moved: false }; try { hd.setPointerCapture(e.pointerId); } catch {} });
    hd.addEventListener("pointermove", e => {
      if (!start) return;
      const dy = start.y - e.clientY;
      if (Math.abs(dy) > 4) start.moved = true;
      side.style.height = clamp(start.h + dy, 60, Math.round($("#reader").clientHeight * 0.85)) + "px";
    });
    const end = () => {
      if (!start) return;
      const h = side.offsetHeight;
      if (!start.moved || h < 130) closeSheet(); else S.sheetH = h;
      start = null;
    };
    hd.addEventListener("pointerup", end); hd.addEventListener("pointercancel", end);
    hd.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeSheet(); } });
  })();

  function setTab(t) {
    S.tab = t; S.editing = null;
    $$(".tabs button[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    if (!S.comp) $("#chatBox").hidden = t !== "chat";
    renderSide(); paintCaption();
  }
  $(".tabs").addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); });

  function updateCounts() {
    const here = S.anns.filter(a => a.page === S.page).length;
    $("#cntPage").textContent = here ? here : "";
    $("#cntAll").textContent = S.anns.length ? S.anns.length : "";
  }
  function annsForTab() {
    let items = S.anns.slice();
    if (S.tab === "page") items = items.filter(a => a.page === S.page);
    const y = a => (a.rects && a.rects[0] && a.rects[0][1]) ?? 1;
    return items.sort((a, b) => a.page - b.page || y(a) - y(b) || String(a.created).localeCompare(String(b.created)));
  }
  function annHTML(a) {
    const who = a.author === "claude" ? "老師" : "我";
    const editing = S.editing === a.id;
    const isQ = a.kind === "question";
    return `<article class="ann" data-id="${esc(a.id)}">
      <div class="ann-head"><span class="tag k-${esc(KINDS[a.kind] ? a.kind : "key")}">${a.region ? "框選" : ""}${esc(KINDS[a.kind] || "重點")}</span><span>${who} · p.${+a.page}</span></div>
      ${a.text ? `<p class="ann-q">${esc(a.text)}</p>` : ""}
      ${editing
        ? `<textarea class="edit" rows="3" aria-label="${isQ ? "問題" : "註解"}">${esc(a.note || "")}</textarea>
           <div class="ann-acts"><button type="button" data-act="save">存起來</button><button type="button" data-act="cancel">取消</button></div>`
        : (a.note ? `<p class="ann-note">${isQ ? "❓ " : ""}${esc(a.note)}</p>` : "")}
      ${isQ ? (a.answer ? `<p class="ann-ans"><b>老師：</b>${esc(a.answer)}</p>` : `<p class="ann-ans wait">還沒有答案，可以按「問老師」</p>`) : ""}
      ${editing ? "" : `<div class="ann-acts">
        <button type="button" data-act="edit">✎ ${isQ ? "改問題" : "寫註解"}</button>
        ${isQ && !a.answer ? `<button type="button" data-act="ask">問老師</button>` : ""}
        <button type="button" class="del" data-act="del">刪除</button>
      </div>`}
    </article>`;
  }
  function renderSide() {
    updateCounts();
    if (S.tab === "chat") return renderChat();
    const body = $("#sideBody");
    const items = annsForTab();
    if (!items.length) {
      body.innerHTML = `<div class="hint">${S.tab === "page"
        ? `第 ${S.page || 1} 頁還沒有筆記。<br><b>長按選字</b>就能畫重點；跟老師討論時，老師也會自己幫你畫。`
        : "這份講義還沒有筆記。"}</div>`;
      return;
    }
    body.innerHTML = items.map(annHTML).join("");
  }
  function renderChat() {
    const body = $("#sideBody");
    const parts = [];
    if (!S.chat.length && !S.sys.length && !LIVE.caption) {
      parts.push(S.star
        ? `<div class="hint">先在星圖上點一個考點，按下面的 <b>🎙️ 開始陪讀</b>，然後說「<b>考我</b>」，老師會用說的出題，你直接口頭回答。<br>也可以問「這是什麼意思」「跟某某差在哪」；不方便說話時可以在下面打字。</div>`
        : `<div class="hint">按下面的 <b>🎙️ 開始陪讀</b>，直接說話問老師；老師說話時也可以直接插話。<br>不方便說話時，可以在下面打字問（老師一樣用說的回答）。</div>`);
    }
    const sysAt = i => S.sys.filter(s => s.after === i).map(s => `<div class="sys">${esc(s.text)}</div>`).join("");
    S.chat.forEach((m, i) => {
      parts.push(sysAt(i));
      const mine = m.role !== "claude";
      parts.push(`<div class="msg ${mine ? "amy" : "claude"}" data-id="${esc(m.id)}"><span class="txt">${esc(m.text)}</span><div class="mmeta"><span>${mine ? "我" : "老師"} · ${S.star ? esc(m.topic || "星圖") : "p." + (+m.page)}</span>${mine || S.star ? "" : `<button type="button" data-act="pin">📌 記到這頁</button>`}</div></div>`);
    });
    parts.push(S.sys.filter(s => s.after >= S.chat.length).map(s => `<div class="sys">${esc(s.text)}</div>`).join(""));
    const c = LIVE.caption;
    if (c && c.amy) parts.push(`<div class="msg amy live"><span class="txt">${esc(c.amy)}</span></div>`);
    if (c && c.claude) parts.push(`<div class="msg claude live"><span class="txt">${esc(c.claude)}</span></div>`);
    body.innerHTML = parts.join("");
    body.scrollTop = body.scrollHeight;
  }
  $("#sideBody").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    const msgEl = e.target.closest(".msg");
    if (msgEl && btn) {
      const i = S.chat.findIndex(m => m.id === msgEl.dataset.id), m = S.chat[i]; if (!m) return;
      if (btn.dataset.act === "pin") {
        const q = S.chat.slice(0, i).reverse().find(x => x.role !== "claude");
        try { await store.addAnn({ page: m.page, kind: "question", text: "", rects: [], note: q ? q.text : "（陪讀討論）", answer: m.text }); toast(`記到第 ${m.page} 頁了，學完會變成學習卡`); }
        catch (err) { writeErr(err); }
      }
      return;
    }
    const card = e.target.closest(".ann"); if (!card) return;
    const a = S.anns.find(x => x.id === card.dataset.id); if (!a) return;
    if (!btn) { if (e.target.closest("textarea")) return; return jumpToAnn(a); }
    const act = btn.dataset.act;
    if (act === "edit") { S.editing = a.id; renderSide(); const t = $(`.ann[data-id="${CSS.escape(a.id)}"] textarea`); if (t) t.focus(); return; }
    if (act === "cancel") { S.editing = null; return renderSide(); }
    if (act === "save") {
      const v = card.querySelector("textarea").value.trim();
      S.editing = null;
      try { await store.updateAnn(a.id, { note: v }); toast("改好了"); } catch (err) { writeErr(err); }
      return renderSide();
    }
    if (act === "ask") {
      if (!ensureLive()) return;
      const q = a.note || "這段是什麼意思？";
      return sendLive({ text: a.text ? `${q}\n\n（第 ${a.page} 頁的這段）\n${a.text}` : q, display: q, page: a.page, annId: a.id });
    }
    if (act === "del") {
      const ok = await askConfirm("刪掉這則筆記？", (a.text ? `「${a.text.slice(0, 40)}${a.text.length > 40 ? "…" : ""}」` : "") + "刪了就找不回來。");
      if (!ok) return;
      try { await store.deleteAnn(a.id); toast("刪掉了"); } catch (err) { writeErr(err); }
    }
  });
  function jumpToAnn(a) {
    if (!isWide()) closeSheet();
    const y = (a.rects && a.rects[0] && a.rects[0][1]) || 0;
    requestAnimationFrame(() => {
      const p = S.pages[a.page - 1]; if (!p) return;
      viewer.scrollTop = Math.max(0, p.el.offsetTop + y * p.el.offsetHeight - viewer.clientHeight * 0.3);
      setPage(a.page); updateVisible();
      $$(`.hl[data-id="${CSS.escape(a.id)}"]`, p.el).forEach(h => { h.classList.remove("flash"); void h.offsetWidth; h.classList.add("flash"); });
    });
  }
  // 對話區的橫線：上下拖曳調整下方輸入／設定區的高度（點兩下回預設），高度記在這台裝置
  function makeHSplit(split, box, key, minH, reserve = 140) {  // reserve：上面對話紀錄至少留多高
    const apply = (h, clampIt) => {
      if (clampIt) { const area = box.parentElement.getBoundingClientRect().height; h = Math.max(minH, Math.min(h, area - reserve)); }
      box.style.height = h + "px"; box.style.maxHeight = "none"; box.classList.add("sized");
    };
    try { const h = +localStorage.getItem(key); if (h) apply(h, false); } catch (e) { /* 沒存過 */ }
    let d = null;
    split.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      d = { y: e.clientY, h: box.getBoundingClientRect().height };
      split.setPointerCapture(e.pointerId); document.body.classList.add("vresizing"); e.preventDefault();
    });
    split.addEventListener("pointermove", e => { if (d) apply(d.h + (d.y - e.clientY), true); });
    const end = () => {
      if (!d) return;
      d = null; document.body.classList.remove("vresizing");
      try { localStorage.setItem(key, Math.round(box.getBoundingClientRect().height)); } catch (e) { /* 忽略 */ }
    };
    split.addEventListener("pointerup", end); split.addEventListener("pointercancel", end);
    split.addEventListener("dblclick", () => {
      box.style.height = ""; box.style.maxHeight = ""; box.classList.remove("sized");
      try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
    });
  }
  // 平板：PDF 和對話欄中間的直線左右拖（寬度改了 PDF 會自己重新符合寬度）
  (() => {
    const sp = $("#sideSplit"), root = $("#reader"), KEY = "peidu-phone-side-w";
    const apply = w => root.style.setProperty("--side-w", Math.max(300, Math.min(w, innerWidth - 420)) + "px");
    try { const w = +localStorage.getItem(KEY); if (w) apply(w); } catch (e) { /* 沒存過 */ }
    let d = null;
    sp.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      d = { x: e.clientX, w: $("#side").getBoundingClientRect().width };
      sp.setPointerCapture(e.pointerId); document.body.classList.add("hresizing"); e.preventDefault();
    });
    sp.addEventListener("pointermove", e => { if (d) apply(d.w + (d.x - e.clientX)); });
    const end = () => {
      if (!d) return;
      d = null; document.body.classList.remove("hresizing");
      try { localStorage.setItem(KEY, Math.round($("#side").getBoundingClientRect().width)); } catch (e) { /* 忽略 */ }
      dispatchEvent(new Event("resize"));  // 讓 PDF 重新符合新的寬度
    };
    sp.addEventListener("pointerup", end); sp.addEventListener("pointercancel", end);
    sp.addEventListener("dblclick", () => { root.style.removeProperty("--side-w"); try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } dispatchEvent(new Event("resize")); });
  })();
  // 🍅 番茄鐘：時間到用語音提醒（正在即時陪讀就請老師用它的個性講；否則播預錄的提醒音檔）
  // iPhone／iPad 不准網頁「自己」開口（朗讀會被擋），所以：按開始的當下先把聲音解鎖，時間到再播預錄的音檔
  const POMO = { ctx: null, bufs: {}, loading: null };
  function pomoUnlock() {
    try {
      if (!POMO.ctx) POMO.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (POMO.ctx.state !== "running") POMO.ctx.resume();
      const b = POMO.ctx.createBuffer(1, 1, 22050), s = POMO.ctx.createBufferSource();  // 播一下靜音，iOS 才算真的解鎖
      s.buffer = b; s.connect(POMO.ctx.destination); s.start(0);
    } catch (e) { /* 不支援就只顯示文字 */ }
    if (!POMO.loading && POMO.ctx) {
      POMO.loading = Promise.all(["study-end-0", "study-end-1", "study-end-2", "study-end-3", "rest-end"].map(async n => {
        try { const ab = await (await fetch(`sounds/${n}.mp3?v=1`)).arrayBuffer(); POMO.bufs[n] = await POMO.ctx.decodeAudioData(ab); } catch (e) { /* 這個檔載不到就算了 */ }
      }));
    }
  }
  function pomoPlay(name) {
    const c = POMO.ctx, b = POMO.bufs[name];
    if (!c || !b) return false;
    if (c.state !== "running") c.resume();
    const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    return true;
  }
  const pomo = PeiduPomodoro.init({
    button: $("#pomoBtn"), key: "peidu-phone-pomodoro",
    toast: t => toast(t, 6000),
    unlock: pomoUnlock,
    speak: (t, info) => {
      if (PeiduLive.isOn()) return PeiduLive.sendText(`（番茄鐘提醒：請用你的說話個性，用一兩句話提醒學生：${t}）`, true);
      const name = info.kind === "rest-end" ? "rest-end" : info.kind === "study-end" ? `study-end-${info.extra || 0}` : "";
      if (name && pomoPlay(name)) return;
      try { const u = new SpeechSynthesisUtterance(t); u.lang = "zh-TW"; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) { /* 念不出來就只顯示文字 */ }
    },
  });
  // 重新整理後番茄鐘還在倒數、但聲音還沒解鎖：碰一下畫面任何地方就解鎖
  document.addEventListener("pointerdown", () => { const st = pomo.state(); if (st.phase !== "idle" && (!POMO.ctx || POMO.ctx.state !== "running")) pomoUnlock(); }, { capture: true, passive: true });
  makeHSplit($("#chatSplit"), $("#chatBox"), "peidu-phone-chatbox-h2" + (mqWide.matches ? "-wide" : ""), 64, 200);  // 手機、平板各記各的

  $("#chatBox").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("#chatIn").value.trim();
    if (!v) return;
    if (!ensureLive()) return;
    $("#chatIn").value = ""; autoGrow();
    sendLive({ text: v, page: S.page });
  });
  $("#chatIn").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !TOUCH) { e.preventDefault(); $("#chatBox").requestSubmit(); }
  });
  function autoGrow() { const t = $("#chatIn"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, innerHeight * 0.3) + "px"; }
  $("#chatIn").addEventListener("input", autoGrow);

  // ================= 更多 =================
  const closeMore = () => { $("#moreBox").hidden = true; };
  $("#moreBtn").onclick = () => { $("#moreBox").hidden = false; };
  $("#moreClose").onclick = closeMore;
  $("#moreBox").addEventListener("click", e => { if (e.target.id === "moreBox") closeMore(); });
  $("#moreShelf").onclick = () => { closeMore(); backToShelf(); };
  $("#boxBtn").onclick = () => { closeMore(); if (!S.pdf) return toast("講義還在打開中"); setBox(true); };
  $("#settingsBtn").onclick = () => { closeMore(); openSettings(); };
  $("#exportBtn").onclick = () => { closeMore(); exportCards(); };

  // ✨ 請老師畫這頁重點（Gemini 文字 API）
  $("#hlBtn").onclick = async () => {
    closeMore();
    if (!S.pdf) return toast("講義還在打開中");
    if (S.hlBusy) return;
    if (!hasKey()) return openSettings("要先貼上 Gemini 金鑰，老師才能幫你畫重點");
    const pg = S.page || 1, doc = S.doc;
    let chars;
    try { chars = await pageChars(pg); } catch { return toast("讀不到這頁的文字"); }
    if (!chars.text.replace(/\s/g, "")) return toast("這頁抽不到文字（可能是掃描圖），沒辦法畫重點");
    S.hlBusy = true;
    toast(`老師正在讀第 ${pg} 頁，挑重點中…`, 8000);
    const prompt = `你是 iPAS 陪讀老師（學生在準備「AI 應用規劃師中級」和「資訊安全工程師初級」）。下面是講義《${stem(doc.name)}》第 ${pg} 頁的文字，請挑出 3 到 6 個最值得畫螢光筆的地方。

規則：
- text 必須「逐字」從本頁文字複製，不可改寫、不可增減字、不可加引號，長度 6 到 60 字，最好是一個關鍵定義或關鍵句。
- kind 只能是 "key"（重點）、"confuse"（易混：容易跟別的概念搞混）、"extra"（補充：考試常考的延伸）。
- note 用繁體中文一句話說明為什麼要記（30 字內），可以點出考試陷阱。

只回覆一個 JSON 陣列，不要其他文字，例如：
[{"text":"（逐字複製的句子）","kind":"key","note":"（一句話）"}]

=== 第 ${pg} 頁文字 ===
${chars.text.slice(0, 6000)}`;
    try {
      const out = await geminiJSON(prompt, 2000);
      const list = Array.isArray(out) ? out : (out && (out.items || out.highlights)) || [];
      let ok = 0, miss = 0;
      for (const h of list.slice(0, 8)) {
        if (S.doc !== doc) break;
        const t = String((h && h.text) || "").replace(/^[「『"]|[」』"]$/g, "").trim();
        if (!t) continue;
        const rects = findRects(chars, t) || findRects(chars, t, true);
        if (!rects || !rects.length) { miss++; continue; }
        const kind = ["key", "confuse", "extra"].includes(h.kind) ? h.kind : "key";
        await store.addAnn({ page: pg, kind, text: t, rects, note: String(h.note || "").trim(), author: "claude" });
        ok++;
      }
      toast(ok ? `老師在第 ${pg} 頁畫了 ${ok} 個重點${miss ? `（${miss} 個對不到原文，先略過）` : ""}` : "老師挑的句子對不到這頁原文，再按一次試試", 4000);
    } catch (e) {
      const m = String(e && e.message || e);
      if (m === "NEED_KEY" || m.startsWith("KEY:")) openSettings(keyErrText(e)); else toast("沒畫成功：" + m, 4500);
    } finally { S.hlBusy = false; }
  };

  // ================= 設定 =================
  const voiceSel = $("#voiceSel");
  voiceSel.innerHTML = PeiduLive.VOICES.map(v => `<option value="${v.id}">${esc(v.label)}</option>`).join("");
  function openSettings(msg) {
    $("#setMsg").textContent = msg || ""; $("#setMsg").hidden = !msg;
    $("#keyIn").value = storedKey(); $("#keyIn").type = "password"; $("#keyShow").textContent = "顯示";
    $("#keyState").textContent = DEV ? "（開發測試模式：金鑰由本機測試伺服器提供，不會存進手機）"
      : storedKey() ? `已經存了一把金鑰（結尾 ${storedKey().slice(-4)}）。` : "還沒有金鑰。";
    const az = azureConf(); $("#azKeyIn").value = az ? az.key : ""; $("#azRegionIn").value = az ? az.region : "";
    $("#azState").textContent = az ? `已經存了 Azure 金鑰（區域 ${az.region}）。` : "還沒有 Azure 金鑰（不用童音就不用填）。";
    $("#rateSel").value = String([1, 0.9, 0.8].includes(+prefs.speed) ? +prefs.speed : 0.9);
    voiceSel.value = prefs.voice; $("#speedSel").value = String(prefs.silence); $("#personaSel").value = PERSONAS[prefs.persona] ? prefs.persona : "tsundere";
    $("#setBox").hidden = false;
  }
  $("#keyShow").onclick = () => { const k = $("#keyIn"); const show = k.type === "password"; k.type = show ? "text" : "password"; $("#keyShow").textContent = show ? "隱藏" : "顯示"; };
  $("#setClose").onclick = () => { $("#setBox").hidden = true; };
  $("#setBox").addEventListener("click", e => { if (e.target.id === "setBox") $("#setBox").hidden = true; });
  $("#keyClear").onclick = async () => {
    if (!storedKey()) return toast("這支手機沒有存金鑰");
    const ok = await askConfirm("刪除這支手機裡的 Gemini 金鑰？", "刪了之後要語音討論，得重新貼一次金鑰。");
    if (!ok) return;
    LS.del(KEY_LS); MODELS.list = null; $("#keyIn").value = ""; renderShelf(); openSettings("金鑰刪掉了");
  };
  $("#setSave").onclick = () => {
    const k = $("#keyIn").value.replace(/\s+/g, "");
    const oldKey = storedKey();
    if (k && !/^[A-Za-z0-9_.\-]{20,}$/.test(k)) { $("#setMsg").textContent = "這串看起來不像金鑰（應該是 AQ. 或 AIza 開頭的一長串英數字，中間不能有空格），再檢查一次"; $("#setMsg").hidden = false; return; }
    if (k) { try { localStorage.setItem(KEY_LS, k); } catch { toast("存不進去：這個瀏覽器不讓網頁存資料（例如無痕模式）"); return; } }
    if (k !== oldKey) MODELS.list = null;
    // 童音的 Azure 金鑰：有填就存，存完背景試念一句確認能用
    const azKey = $("#azKeyIn").value.replace(/\s+/g, ""), azRegion = $("#azRegionIn").value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const azOld = azureConf();
    if (azKey && azRegion && (!azOld || azOld.key !== azKey || azOld.region !== azRegion)) {
      LS.set(AZ_LS, { key: azKey, region: azRegion });
      azureTts("你好", { azure: "zh-CN-XiaoyiNeural", rate: 0, pitch: 0 }, { key: azKey, region: azRegion })
        .then(() => toast("Azure 金鑰可以用 ✓ 「即時聲音」選童音就會用它", 4000))
        .catch(err => toast("Azure 金鑰不能用：" + err.message, 6000));
    } else if (!azKey && azOld) LS.del(AZ_LS);
    const voiceChanged = voiceSel.value !== prefs.voice, speedChanged = +$("#speedSel").value !== +prefs.silence, personaChanged = $("#personaSel").value !== prefs.persona, rateChanged = +$("#rateSel").value !== +prefs.speed;
    prefs.voice = voiceSel.value; prefs.silence = +$("#speedSel").value; prefs.persona = $("#personaSel").value; prefs.speed = +$("#rateSel").value; savePrefs();
    $("#setBox").hidden = true; renderShelf();
    if (PeiduLive.isOn() && (voiceChanged || speedChanged || personaChanged || rateChanged || (k && k !== oldKey))) {
      PeiduLive.restart({ voice: prefs.voice, silenceMs: prefs.silence, speed: prefs.speed });
      toast("設定改好了，重新連線中");
    } else toast(k ? "存好了" : "設定存好了");
  };

  // ================= 學完做學習卡 =================
  // 跟電腦版 server.py 的 build_export 同一個格式
  function buildExport(doc, anns, chat) {
    const title = stem(doc.name), today = ymd();
    const list = [...anns].sort((a, b) => a.page - b.page || String(a.created).localeCompare(String(b.created)));
    const out = ["---", `title: 陪讀筆記｜${title}`, "type: 知識", `description: "${title} 陪讀時的螢光筆重點、提問與學習卡草稿"`,
      `source: ${doc.name}`, `created: ${today}`, `updated: ${today}`, "---", "", `# 陪讀筆記：${title}`, ""];
    for (const kind of ["key", "confuse", "extra", "note"]) {
      const items = list.filter(a => a.kind === kind);
      if (!items.length) continue;
      out.push(`## ${KINDS[kind]}`);
      for (const a of items) {
        const who = a.author === "claude" ? "Claude" : "Amy";
        let line = `- p.${a.page}`;
        if (a.text) line += `「${a.text}」`;
        if (a.note) line += ` — ${a.note}（${who}）`;
        out.push(line);
      }
      out.push("");
    }
    const qs = list.filter(a => a.kind === "question");
    if (qs.length) {
      out.push("## 我的提問");
      for (const a of qs) {
        out.push(`### Q（p.${a.page}）：${a.note || ""}`);
        if (a.text) out.push(`> ${a.text.replace(/\n/g, "\n> ")}`);
        out.push("");
        out.push(`A：${a.answer || "（尚未回答）"}`);
        out.push("");
      }
    }
    const cards = [];
    for (const a of qs) if (a.answer) cards.push([a.note || "", a.answer]);
    for (const a of list) if (["key", "confuse", "extra"].includes(a.kind) && a.text && a.note) cards.push([`「${a.text}」的重點是？`, a.note]);
    if (cards.length) {
      out.push("## 學習卡草稿"); out.push("");
      for (const [q, ans] of cards) out.push(`${q.trim().replace(/\n/g, " ")}::${ans.trim().replace(/\n/g, " ")}`);
      out.push("");
    }
    // 手機版多一段：跟老師的語音討論（字幕），回電腦做卡時可以參考
    const talk = (chat || []).slice(-80);
    if (talk.length) {
      out.push("## 和老師的討論");
      for (const m of talk) out.push(`- ${m.role === "claude" ? "老師" : "我"}（p.${m.page}）：${String(m.text).replace(/\s*\n\s*/g, " ")}`);
      out.push("");
    }
    return { md: out.join("\n"), cards: cards.length };
  }
  const EX = { blob: null, name: "", type: "", url: null };
  function showExport({ title, status, text, blob, name, image }) {
    if (EX.url) { URL.revokeObjectURL(EX.url); EX.url = null; }
    Object.assign(EX, { blob, name, type: blob.type });
    $("#exTitle").textContent = title; $("#exStatus").textContent = status;
    $("#exText").value = text || ""; $("#exDetails").hidden = !text; $("#exDetails").open = false;
    const img = $("#exImg");
    if (image) { EX.url = URL.createObjectURL(blob); img.src = EX.url; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
    $("#exCopy").hidden = !text;
    $("#exportBox").hidden = false;
  }
  function exportCards() {
    if (!S.doc) return;
    if (!S.anns.length && !S.chat.length) return toast("這份講義還沒有重點或討論，先畫幾個或跟老師聊聊再做卡");
    const { md, cards } = buildExport(S.doc, S.anns, S.chat);
    const name = `陪讀筆記_${stem(S.doc.name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80)}_${ymd()}.md`;
    S.lastExport = md;
    showExport({ title: "學習卡做好了", text: md, name, blob: new Blob([md], { type: "text/markdown" }),
      status: `共 ${S.anns.length} 則筆記、${cards} 張學習卡草稿、${S.chat.length} 則討論。按「分享／存檔」存到「檔案」App（iCloud 雲碟）或傳到 LINE，回電腦放進 Obsidian 就好。` });
  }
  // 分享一定要在點擊當下呼叫（iPhone 規定），所以分成「先做好」→「按分享」兩步
  $("#exShare").onclick = async () => {
    if (!EX.blob) return;
    const tries = [EX.type, EX.type === "text/markdown" ? "text/plain" : null].filter(Boolean);
    for (const type of tries) {
      const file = new File([EX.blob], EX.name, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: EX.name }); return; }
        catch (e) { if (e && e.name === "AbortError") return; break; }
      }
    }
    const a = document.createElement("a");  // 不能分享就下載
    a.href = URL.createObjectURL(EX.blob); a.download = EX.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    toast("已經下載了，可以在「檔案」App 的下載項目找到");
  };
  $("#exClose").onclick = () => { $("#exportBox").hidden = true; };
  $("#exportBox").addEventListener("click", e => { if (e.target.id === "exportBox") $("#exportBox").hidden = true; });
  $("#exCopy").onclick = async () => {
    const t = $("#exText");
    try { await navigator.clipboard.writeText(t.value); toast("複製好了"); }
    catch { $("#exDetails").open = true; t.focus(); t.select(); toast("已經選起來了，按「拷貝」就好"); }
  };

  // ================= 🧠 彩色心智圖 =================
  const MM = { view: null, tree: null, busy: false };
  async function mindmapMaterial(scope, pg) {
    const lines = [`文件：《${stem(S.doc.name)}》`];
    const anns = S.anns.filter(a => scope === "doc" || a.page === pg).sort((a, b) => a.page - b.page || String(a.created).localeCompare(String(b.created)));
    const chat = S.chat.filter(m => scope === "doc" || m.page === pg).slice(-80);
    for (const a of anns) {
      let line = `[${KINDS[a.kind] || a.kind} p.${a.page}] ${a.text || ""}`;
      if (a.note) line += ` ／ ${a.note}`;
      if (a.answer) line += ` ／ 答：${a.answer}`;
      lines.push(line.slice(0, 600));
    }
    for (const m of chat) lines.push(`${m.role === "amy" ? "問" : "答"}（p.${m.page}）：${String(m.text).slice(0, 500)}`);
    if (anns.length + chat.length < 4) {  // 討論太少：拿這頁內容來整理
      lines.push(`=== 第 ${pg} 頁內容 ===`);
      lines.push((await getPageText(pg)).slice(0, 6000));
    }
    return lines.join("\n").slice(0, 24000);
  }
  function cleanMindmap(m) {
    if (!m || typeof m !== "object" || !Array.isArray(m.branches) || !m.branches.length) throw new Error("心智圖結構不完整，再試一次");
    const node = (n, depth) => {
      const out = { label: String(n.label || "").trim().slice(0, 24) || "（未命名）" };
      if (n.note) out.note = String(n.note).trim().slice(0, 80);
      if (depth < 3 && Array.isArray(n.children)) out.children = n.children.slice(0, 6).filter(k => k && typeof k === "object").map(k => node(k, depth + 1));
      return out;
    };
    const tree = { center: String(m.center || "").trim().slice(0, 24) || "主題", branches: m.branches.slice(0, 8).filter(b => b && typeof b === "object").map(b => node(b, 1)) };
    const labels = new Set();
    const collect = n => { labels.add(n.label); (n.children || []).forEach(collect); };
    tree.branches.forEach(collect);
    tree.links = (Array.isArray(m.links) ? m.links : []).slice(0, 6)
      .filter(l => l && labels.has(l.from) && labels.has(l.to) && l.from !== l.to)
      .map(l => ({ from: l.from, to: l.to, label: String(l.label || "").slice(0, 10) }));
    return tree;
  }
  function mmMsg(t) { $("#mmMsg").hidden = !t; $("#mmMsg").textContent = t || ""; }
  function mmShow(tree) {
    MM.tree = tree; $("#mmInfo").hidden = true; mmMsg("");
    MM.view = PeiduMindmap.render($("#mmStage"), tree, {
      onNode: n => {
        const box = $("#mmInfo");
        if (!n) { box.hidden = true; return; }
        box.style.setProperty("--mmc", n.color);
        box.innerHTML = `<div class="trail">${esc(n.trail.join(" › "))}</div><b>${esc(n.label)}</b>${n.note ? `<div>${esc(n.note)}</div>` : ""}`;
        box.hidden = false;
      },
    });
  }
  async function mmGenerate() {
    if (!S.doc || MM.busy) return;
    if (!hasKey()) { $("#mmOverlay").hidden = true; return openSettings("要先貼上 Gemini 金鑰，才能整理心智圖"); }
    const doc = S.doc, scope = $("#mmScope").value, pg = S.page || 1;
    MM.busy = true; $("#mmGen").disabled = true;
    $("#mmStage").textContent = ""; MM.view = null; $("#mmInfo").hidden = true;
    mmMsg("🧠 老師正在整理討論內容…\n（大約 10～30 秒）");
    try {
      const out = await geminiJSON(MINDMAP_PROMPT + await mindmapMaterial(scope, pg));
      const tree = { ...cleanMindmap(out), scope, page: pg, at: nowISO() };
      if (S.doc !== doc) return;
      doc.mindmap = tree; saveDocMeta(doc);
      if (!$("#mmOverlay").hidden) mmShow(tree);
    } catch (e) {
      mmMsg("沒整理成功：" + keyErrText(e) + "\n可以按「🔄 重新整理」再試一次");
    } finally { MM.busy = false; $("#mmGen").disabled = false; }
  }
  $("#mmBtn").onclick = () => {
    closeMore();
    if (!S.pdf) return toast("講義還在打開中");
    $("#mmOverlay").hidden = false;
    const saved = S.doc && S.doc.mindmap;
    if (saved && saved.branches) { $("#mmScope").value = saved.scope || "doc"; mmShow(saved); }  // 上次畫的先拿出來
    else if (!MM.busy) {
      if (!S.anns.length && !S.chat.length) $("#mmScope").value = "page";
      mmGenerate();
    }
  };
  $("#mmGen").onclick = mmGenerate;
  $("#mmFit").onclick = () => MM.view && MM.view.fit();
  $("#mmClose").onclick = () => { $("#mmOverlay").hidden = true; };
  $("#mmPng").onclick = async () => {
    if (!MM.view) return;
    let blob = null;
    try { blob = await MM.view.toPNG(); } catch {}
    if (!blob) return toast("圖片轉不出來，改用「📋 大綱」");
    const name = `心智圖_${(MM.tree.center || "主題").replace(/[\\/:*?"<>|]+/g, "_")}.png`;
    showExport({ title: "心智圖圖片", status: "按「分享／存檔」存到照片或檔案；也可以長按圖片 →「加入照片」。", blob, name, image: true });
  };
  $("#mmCopy").onclick = async () => {
    if (!MM.view) return;
    const md = MM.view.outline();
    try { await navigator.clipboard.writeText(md); toast("大綱複製好了，可以貼到 Obsidian"); }
    catch {
      showExport({ title: "心智圖大綱", status: "按「複製」，或「分享／存檔」存成檔案。", text: md,
        blob: new Blob([md], { type: "text/markdown" }), name: `心智圖大綱_${(MM.tree.center || "主題").replace(/[\\/:*?"<>|]+/g, "_")}.md` });
    }
  };
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("#mmOverlay").hidden) $("#mmOverlay").hidden = true; });
  addEventListener("resize", () => { if (!$("#mmOverlay").hidden && MM.view) MM.view.fit(); });

  // ================= 寬窄切換 =================
  const onWide = () => { if (isWide()) side.style.height = ""; else closeSheet(); renderSide(); };
  mqWide.addEventListener ? mqWide.addEventListener("change", onWide) : mqWide.addListener(onWide);

  // ================= 啟動 =================
  liveUI();
  loadDocs();
  if (!PDFJS_OK) toast("PDF 元件沒有載入成功，請確認有網路後重新整理", 6000);
  // 給測試和除錯看狀態用（不含金鑰）
  window.PeiduApp = { S, LIVE, store, findRects, pageChars, getPageText, buildExport, lookup, DEV };
})();
