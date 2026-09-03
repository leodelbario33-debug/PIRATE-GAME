// Motor de audio 100% procedural (WebAudio) — sin assets externos.
export class SFX {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private seaGain: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenLfo: OscillatorNode | null = null;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    // --- rumor del mar (ruido filtrado en bucle) ---
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    this.seaGain = this.ctx.createGain();
    this.seaGain.gain.value = 0.10;
    src.connect(f); f.connect(this.seaGain); this.seaGain.connect(this.master);
    src.start();

    // --- motor del jugador ---
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 50;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 260;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  engine(throttle: number, pitchMul = 1, on = true) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime((42 + throttle * 68) * pitchMul, t, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + throttle * 0.09 : 0, t, 0.15);
  }

  siren(on: boolean) {
    if (!this.ctx || !this.master) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "triangle";
      this.sirenOsc.frequency.value = 620;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo?.stop(); } catch { /* noop */ }
      this.sirenOsc = null; this.sirenLfo = null; this.sirenGain = null;
    }
  }

  private noiseBurst(dur: number, freq: number, gain: number, type: BiquadFilterType = "lowpass") {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start();
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = "square", slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  shot(heavy = false) {
    this.noiseBurst(heavy ? 0.16 : 0.09, heavy ? 900 : 1800, heavy ? 0.5 : 0.32, "lowpass");
    this.tone(heavy ? 120 : 180, 0.06, 0.18, "square", 60);
  }
  enemyShot() { this.noiseBurst(0.1, 1200, 0.16); }
  explosion(big = false) {
    this.noiseBurst(big ? 1.6 : 0.9, big ? 320 : 500, big ? 1.0 : 0.7);
    this.tone(70, big ? 1.2 : 0.7, 0.7, "sine", 28);
  }
  splash() { this.noiseBurst(0.5, 700, 0.35, "bandpass"); }
  torpedoLaunch() {
    this.noiseBurst(0.7, 500, 0.4, "bandpass");
    this.tone(220, 0.6, 0.2, "sine", 70);
  }
  hit() { this.tone(900, 0.06, 0.22, "square", 400); }
  hurt() { this.tone(160, 0.25, 0.4, "sawtooth", 70); }
  buzz() { this.tone(90, 0.35, 0.5, "sawtooth", 55); this.noiseBurst(0.2, 2400, 0.3, "highpass"); }
  reload() { this.tone(500, 0.05, 0.15, "square"); setTimeout(() => this.tone(380, 0.05, 0.15, "square"), 120); }
  empty() { this.tone(300, 0.04, 0.12, "square", 240); }
  sonar() { this.tone(880, 0.9, 0.14, "sine", 860); }
  alarm() { this.tone(720, 0.3, 0.22, "square"); setTimeout(() => this.tone(560, 0.3, 0.22, "square"), 320); }
  horn() { this.tone(98, 2.2, 0.5, "sawtooth", 92); this.tone(147, 2.2, 0.25, "triangle"); }
  sell() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 0.25, "triangle"), i * 110));
  }
  jingle() {
    const seq = [392, 523, 659, 784];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 0.22, "square"), i * 90));
  }
  splashDown() { this.noiseBurst(0.8, 300, 0.5); this.tone(300, 0.5, 0.2, "sine", 90); }
  uiClick() { this.tone(640, 0.05, 0.12, "square", 500); }
  rope() {
    // silbido de la cuerda al volar + clac del garfio contra la barandilla
    this.noiseBurst(0.3, 950, 0.22, "bandpass");
    setTimeout(() => { this.tone(1500, 0.07, 0.28, "square", 480); this.noiseBurst(0.08, 2600, 0.14, "highpass"); }, 250);
  }
}
