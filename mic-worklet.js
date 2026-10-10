// 陪讀手機版：麥克風處理器（AudioWorklet）。
// iPhone 的麥克風是裝置原生取樣率（通常 48000 或 44100），這裡把它降到 16kHz 單聲道、轉成 16 位元整數，
// 每 40ms（640 個樣本）送一包給主程式，主程式再轉 base64 傳給 Gemini Live。
class PeiduMic16k extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.inRate = sampleRate;                       // AudioWorkletGlobalScope 的全域變數：這個 context 的取樣率
    this.outRate = this.inRate < (o.targetRate || 16000) ? this.inRate : (o.targetRate || 16000);
    this.ratio = this.inRate / this.outRate;        // 48000 → 3、44100 → 2.75625
    this.chunk = o.chunk || 640;
    this.buf = new Int16Array(this.chunk);
    this.n = 0;
    this.acc = 0; this.cnt = 0; this.pos = 0;       // 盒狀平均（簡單低通）＋小數位置，跨區塊延續
    this.port.postMessage({ rate: this.outRate });
  }
  push(v) {
    v = v > 1 ? 1 : v < -1 ? -1 : v;
    this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    if (this.n === this.chunk) {
      const out = this.buf;
      this.port.postMessage(out.buffer, [out.buffer]);
      this.buf = new Int16Array(this.chunk);
      this.n = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.ratio === 1) { for (let i = 0; i < ch.length; i++) this.push(ch[i]); return true; }
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.push(this.acc / this.cnt);
        this.acc = 0; this.cnt = 0; this.pos -= this.ratio;
      }
    }
    return true;
  }
}
registerProcessor("peidu-mic-16k", PeiduMic16k);
