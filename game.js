/* ============================================================
   深海吞噬 · 大鱼吃小鱼
   A self-contained canvas game. No external assets required.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist2 = (x1, y1, x2, y2) => {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return dx * dx + dy * dy;
  };
  const formatNumber = (n) => Math.floor(n).toLocaleString('zh-CN');
  const CANVAS_FONT = getComputedStyle(document.body).fontFamily;
  const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;
  const formatTime = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  /* ---------- dom ---------- */
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const app = $('app');

  const els = {
    app,
    canvas,
    hud: $('hud'),
    levelNum: $('levelNum'),
    levelName: $('levelName'),
    growthText: $('growthText'),
    growthFill: $('growthFill'),
    score: $('score'),
    combo: $('combo'),
    lives: $('lives'),
    hearts: Array.from(document.querySelectorAll('.heart')),
    soundBtn: $('soundBtn'),
    pauseBtn: $('pauseBtn'),
    dashBtn: $('dashBtn'),
    dashRing: $('dashRing'),
    levelBanner: $('levelBanner'),
    bannerTitle: $('bannerTitle'),
    bannerSub: $('bannerSub'),
    toast: $('toast'),
    screens: {
      menu: $('menuScreen'),
      pause: $('pauseScreen'),
      end: $('endScreen'),
    },
    startBtn: $('startBtn'),
    bestScore: $('bestScore'),
    resumeBtn: $('resumeBtn'),
    restartPauseBtn: $('restartPauseBtn'),
    menuPauseBtn: $('menuPauseBtn'),
    replayBtn: $('replayBtn'),
    menuEndBtn: $('menuEndBtn'),
    endScreen: $('endScreen'),
    endSymbol: $('endSymbol'),
    endKicker: $('endKicker'),
    endTitle: $('endTitle'),
    endDesc: $('endDesc'),
    endScore: $('endScore'),
    newRecord: $('newRecord'),
    endEaten: $('endEaten'),
    endSize: $('endSize'),
    endTime: $('endTime'),
    endLevel: $('endLevel'),
    endBest: $('endBest'),
  };

  /* ---------- constants ---------- */
  const STORE_KEY = 'deep-sea-big-fish-v1';
  const MAX_LIVES = 3;
  const DASH_COOLDOWN = 2.35;
  const DASH_DURATION = 0.21;
  const DASH_RING_LENGTH = 175.93;
  const LEVEL_NAMES = ['幼鱼', '小鱼', '中鱼', '大鱼', '霸主'];
  const LEVEL_QUOTAS = [40, 70, 110, 160, 220];

  const PALETTES = [
    { body: '#ffae63', light: '#ffe8b4', dark: '#c45a32', fin: '#ffc97e', stripe: 'rgba(255,244,207,.28)', outline: 'rgba(72,27,16,.32)' },
    { body: '#55d8cd', light: '#c5fff5', dark: '#147c7e', fin: '#8ff1e3', stripe: 'rgba(226,255,249,.23)', outline: 'rgba(3,37,38,.31)' },
    { body: '#9b8bf4', light: '#ddd1ff', dark: '#5843ae', fin: '#c4b4ff', stripe: 'rgba(238,229,255,.21)', outline: 'rgba(31,17,70,.33)' },
    { body: '#ffd166', light: '#fff0b0', dark: '#c48a1c', fin: '#ffe18c', stripe: 'rgba(255,251,218,.26)', outline: 'rgba(70,48,9,.29)' },
    { body: '#ff8ca5', light: '#ffd0db', dark: '#b53e62', fin: '#ffb4c5', stripe: 'rgba(255,239,243,.23)', outline: 'rgba(72,17,33,.29)' },
    { body: '#7edc8a', light: '#d5ffd9', dark: '#3c8f4d', fin: '#a9f0b2', stripe: 'rgba(237,255,239,.21)', outline: 'rgba(18,62,29,.29)' },
    { body: '#6fb5ff', light: '#cce5ff', dark: '#2d5ea8', fin: '#a2ccff', stripe: 'rgba(234,246,255,.21)', outline: 'rgba(12,36,70,.31)' },
  ];

  const PLAYER_PALETTE = {
    body: '#ffae54',
    light: '#fff2c0',
    dark: '#d9602e',
    fin: '#ffd58b',
    stripe: 'rgba(255,249,220,.31)',
    outline: 'rgba(88,32,12,.4)',
  };

  /* ---------- storage ---------- */
  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      return {};
    }
  }

  function writeStore(patch) {
    try {
      const current = readStore();
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...current, ...patch }));
    } catch (err) {
      /* storage can be unavailable in private mode; the game still works */
    }
  }

  /* ---------- audio ---------- */
  class SoundEngine {
    constructor() {
      const saved = readStore();
      this.enabled = saved.sound !== false;
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      this.volume = 0.3;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      try {
        this.ctx = new AudioCtor();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 20;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.22;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? this.volume : 0;
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise(0.5);
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (err) {
        this.ctx = null;
      }
    }

    makeNoise(seconds) {
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(enabled ? this.volume : 0, now, 0.025);
      }
      writeStore({ sound: enabled });
      this.updateButton();
    }

    toggle() {
      this.init();
      this.setEnabled(!this.enabled);
      if (this.enabled) this.click();
    }

    updateButton() {
      if (!els.soundBtn) return;
      els.soundBtn.classList.toggle('is-muted', !this.enabled);
      els.soundBtn.setAttribute('aria-label', this.enabled ? '关闭音效' : '开启音效');
      els.soundBtn.setAttribute('title', this.enabled ? '音效 (M)' : '音效已关闭 (M)');
    }

    tone(freq, duration, opts = {}) {
      if (!this.enabled || !this.ctx || !this.master) return;
      const t0 = this.ctx.currentTime + (opts.delay || 0);
      const type = opts.type || 'sine';
      const vol = Math.max(0.0002, opts.vol || 0.08);
      const attack = opts.attack || 0.008;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (opts.slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(22, opts.slide), t0 + duration);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.04);
    }

    noiseBurst(opts = {}) {
      if (!this.enabled || !this.ctx || !this.master || !this.noiseBuffer) return;
      const t0 = this.ctx.currentTime + (opts.delay || 0);
      const duration = opts.duration || 0.24;
      const vol = opts.vol || 0.06;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = 'bandpass';
      filter.Q.value = opts.q || 0.9;
      filter.frequency.setValueAtTime(opts.freq || 900, t0);
      filter.frequency.exponentialRampToValueAtTime(opts.endFreq || 260, t0 + duration);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(t0);
      source.stop(t0 + duration + 0.03);
    }

    click() {
      this.tone(540, 0.09, { type: 'sine', vol: 0.05, slide: 760 });
    }

    eat(combo) {
      const base = 280 + Math.min(combo, 7) * 42;
      this.tone(base, 0.13, { type: 'sine', vol: 0.085, slide: base * 1.55 });
      this.tone(base * 1.8, 0.08, { type: 'triangle', vol: 0.032, delay: 0.045, slide: base * 2.2 });
      this.noiseBurst({ freq: 1400, endFreq: 600, duration: 0.075, vol: 0.02 });
    }

    dash() {
      this.noiseBurst({ freq: 700, endFreq: 1600, duration: 0.25, vol: 0.075, q: 1.3 });
      this.tone(170, 0.2, { type: 'sine', vol: 0.04, slide: 420 });
    }

    hurt() {
      this.tone(165, 0.42, { type: 'sawtooth', vol: 0.1, slide: 52 });
      this.tone(92, 0.55, { type: 'triangle', vol: 0.075, slide: 44, delay: 0.03 });
      this.noiseBurst({ freq: 420, endFreq: 90, duration: 0.35, vol: 0.07, q: 0.7 });
    }

    levelUp() {
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((note, i) => {
        this.tone(note, 0.42, { type: i === 3 ? 'sine' : 'triangle', vol: 0.065, delay: i * 0.09 });
        this.tone(note * 2, 0.26, { type: 'sine', vol: 0.018, delay: i * 0.09 + 0.01 });
      });
    }

    victory() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((note, i) => {
        this.tone(note, 0.65, { type: 'triangle', vol: 0.06, delay: i * 0.11 });
      });
      [523.25, 659.25, 783.99].forEach((note) => {
        this.tone(note, 1.3, { type: 'sine', vol: 0.028, delay: 0.55 });
      });
    }

    gameOver() {
      const notes = [329.63, 277.18, 220, 164.81];
      notes.forEach((note, i) => {
        this.tone(note, 0.6, { type: 'triangle', vol: 0.06, delay: i * 0.16, slide: note * 0.86 });
      });
      this.noiseBurst({ freq: 260, endFreq: 65, duration: 0.7, vol: 0.035 });
    }
  }

  /* ---------- background ocean ---------- */
  class Ocean {
    constructor() {
      this.w = 0;
      this.h = 0;
      this.bubbles = [];
      this.plankton = [];
      this.rays = [];
      this.kelp = [];
      this.rocks = [];
      this.bgGradient = null;
      this.topGlow = null;
      this.floorGradient = null;
    }

    resize(w, h) {
      this.w = w;
      this.h = h;

      this.bgGradient = ctx.createLinearGradient(0, 0, 0, h);
      this.bgGradient.addColorStop(0, '#0a5a64');
      this.bgGradient.addColorStop(0.28, '#06414f');
      this.bgGradient.addColorStop(0.68, '#032a37');
      this.bgGradient.addColorStop(1, '#01141d');

      this.topGlow = ctx.createRadialGradient(w * 0.46, -h * 0.06, 0, w * 0.46, -h * 0.06, Math.max(w, h) * 0.72);
      this.topGlow.addColorStop(0, 'rgba(139,255,226,.2)');
      this.topGlow.addColorStop(0.48, 'rgba(70,210,190,.055)');
      this.topGlow.addColorStop(1, 'rgba(8,90,93,0)');

      this.floorGradient = ctx.createLinearGradient(0, h * 0.73, 0, h);
      this.floorGradient.addColorStop(0, 'rgba(1,17,22,0)');
      this.floorGradient.addColorStop(0.6, 'rgba(1,17,22,.28)');
      this.floorGradient.addColorStop(1, 'rgba(0,10,14,.75)');

      const bubbleCount = Math.round(clamp((w * h) / 44000, 18, 46));
      this.bubbles = Array.from({ length: bubbleCount }, () => this.makeBubble(rand(0, h), true));

      const planktonCount = Math.round(clamp((w * h) / 18500, 45, 120));
      this.plankton = Array.from({ length: planktonCount }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        z: rand(0.25, 1),
        size: rand(0.55, 1.9),
        phase: rand(0, TAU),
        speed: rand(2, 8),
      }));

      this.rays = Array.from({ length: 6 }, (_, i) => ({
        x: rand(-0.08, 0.92),
        width: rand(0.025, 0.085),
        alpha: rand(0.022, 0.065),
        phase: rand(0, TAU),
        speed: rand(0.06, 0.13),
        lean: rand(-0.16, 0.2),
        index: i,
      }));

      const kelpCount = w < 760 ? 5 : 8;
      this.kelp = Array.from({ length: kelpCount }, (_, i) => ({
        x: (i + rand(0.15, 0.85)) / kelpCount,
        height: rand(0.09, 0.24),
        phase: rand(0, TAU),
        width: rand(2.4, 6.2),
        lean: rand(-0.5, 0.5),
      }));

      this.rocks = Array.from({ length: w < 760 ? 4 : 6 }, (_, i) => ({
        x: (i + rand(0.1, 0.9)) / (w < 760 ? 4 : 6),
        width: rand(0.1, 0.23),
        height: rand(0.025, 0.09),
        alpha: rand(0.35, 0.7),
      }));
    }

    makeBubble(startY, initial = false) {
      const r = rand(1.1, 4.8);
      return {
        x: rand(0, this.w),
        y: initial ? startY : this.h + rand(5, 80),
        r,
        speed: rand(12, 42) * (0.7 + r * 0.08),
        drift: rand(4, 14),
        phase: rand(0, TAU),
        alpha: rand(0.12, 0.38),
      };
    }

    update(dt) {
      const t = performance.now() / 1000;
      for (const bubble of this.bubbles) {
        bubble.y -= bubble.speed * dt;
        bubble.x += Math.sin(t * 0.7 + bubble.phase) * bubble.drift * dt;
        if (bubble.y < -15) {
          Object.assign(bubble, this.makeBubble(this.h + rand(10, 100)));
        }
        if (bubble.x < -20) bubble.x = this.w + 20;
        if (bubble.x > this.w + 20) bubble.x = -20;
      }
    }

    draw(c, w, h, t) {
      if (!this.bgGradient) this.resize(w, h);

      c.fillStyle = this.bgGradient;
      c.fillRect(0, 0, w, h);
      c.fillStyle = this.topGlow;
      c.fillRect(0, 0, w, h);

      c.save();
      c.globalCompositeOperation = 'screen';
      for (const ray of this.rays) {
        const sway = Math.sin(t * ray.speed + ray.phase) * w * 0.035;
        const x = ray.x * w + sway;
        const width = ray.width * w;
        const bottomX = x + ray.lean * w;
        const rayGradient = c.createLinearGradient(0, 0, 0, h * 0.82);
        rayGradient.addColorStop(0, `rgba(164,255,235,${ray.alpha})`);
        rayGradient.addColorStop(0.5, `rgba(122,240,215,${ray.alpha * 0.55})`);
        rayGradient.addColorStop(1, 'rgba(100,230,210,0)');
        c.fillStyle = rayGradient;
        c.beginPath();
        c.moveTo(x, -20);
        c.lineTo(x + width, -20);
        c.lineTo(bottomX + width * 2.1, h * 0.82);
        c.lineTo(bottomX - width * 0.45, h * 0.82);
        c.closePath();
        c.fill();
      }
      c.restore();

      c.save();
      c.globalAlpha = 0.12;
      c.strokeStyle = 'rgba(181,255,238,.22)';
      c.lineWidth = 1;
      for (let line = 0; line < 3; line += 1) {
        c.beginPath();
        for (let x = -20; x <= w + 20; x += 48) {
          const y = h * 0.055 + line * 26 + Math.sin(x * 0.009 + t * 0.45 + line) * 10 + Math.sin(x * 0.021 - t * 0.3) * 3;
          if (x === -20) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      c.restore();

      this.drawSeabed(c, w, h, t);
      this.drawPlankton(c, w, h, t);
      this.drawBubbles(c, w, h, t);
    }

    drawSeabed(c, w, h, t) {
      c.fillStyle = this.floorGradient;
      c.fillRect(0, h * 0.72, w, h * 0.28);

      for (const rock of this.rocks) {
        const x = rock.x * w;
        const rw = rock.width * w;
        const rh = rock.height * h;
        const baseY = h + 8;
        c.fillStyle = `rgba(1,16,21,${rock.alpha})`;
        c.beginPath();
        c.moveTo(x - rw * 0.58, baseY);
        c.bezierCurveTo(x - rw * 0.52, baseY - rh * 0.45, x - rw * 0.3, baseY - rh * 0.85, x - rw * 0.06, baseY - rh);
        c.bezierCurveTo(x + rw * 0.2, baseY - rh * 0.86, x + rw * 0.44, baseY - rh * 0.4, x + rw * 0.6, baseY);
        c.closePath();
        c.fill();
      }

      for (const kelp of this.kelp) {
        const baseX = kelp.x * w;
        const baseY = h + 4;
        const height = kelp.height * h;
        const sway = Math.sin(t * 0.55 + kelp.phase) * 16 + kelp.lean * 26;
        c.save();
        c.strokeStyle = 'rgba(25,111,95,.38)';
        c.lineWidth = kelp.width;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(baseX, baseY);
        c.bezierCurveTo(
          baseX + sway * 0.22,
          baseY - height * 0.34,
          baseX + sway * 0.64,
          baseY - height * 0.72,
          baseX + sway,
          baseY - height
        );
        c.stroke();
        c.fillStyle = 'rgba(44,152,123,.18)';
        for (let i = 1; i < 5; i += 1) {
          const p = i / 5;
          const lx = baseX + sway * p * p + Math.sin(t * 0.55 + kelp.phase + i) * 5;
          const ly = baseY - height * p;
          c.save();
          c.translate(lx, ly);
          c.rotate(Math.sin(t * 0.35 + i) * 0.3 + (i % 2 ? 0.65 : -0.8));
          c.beginPath();
          c.ellipse(0, 0, 19, 6.5, 0, 0, TAU);
          c.fill();
          c.restore();
        }
        c.restore();
      }

      c.save();
      c.globalAlpha = 0.38;
      c.fillStyle = 'rgba(8,67,62,.45)';
      for (let i = 0; i < 3; i += 1) {
        const x = w * (0.17 + i * 0.31);
        const y = h + 2;
        c.beginPath();
        c.ellipse(x, y, 65 + i * 19, 13 + i * 4, 0, Math.PI, TAU);
        c.fill();
      }
      c.restore();
    }

    drawPlankton(c, w, h, t) {
      for (const p of this.plankton) {
        p.y -= p.speed * p.z * 0.016;
        p.x += Math.sin(t * 0.22 + p.phase) * p.z * 0.08;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = rand(0, w);
        }
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.05 + p.phase));
        c.globalAlpha = twinkle * (0.1 + p.z * 0.32);
        c.fillStyle = p.z > 0.72 ? '#b8ffef' : '#77d8cd';
        c.beginPath();
        c.arc(p.x, p.y, p.size * p.z, 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    drawBubbles(c, w, h, t) {
      for (const bubble of this.bubbles) {
        const sway = Math.sin(t * 0.9 + bubble.phase) * 2;
        c.globalAlpha = bubble.alpha;
        c.strokeStyle = 'rgba(191,255,244,.72)';
        c.lineWidth = 0.9;
        c.beginPath();
        c.arc(bubble.x + sway, bubble.y, bubble.r, 0, TAU);
        c.stroke();
        c.globalAlpha = bubble.alpha * 0.75;
        c.fillStyle = 'rgba(255,255,255,.8)';
        c.beginPath();
        c.arc(bubble.x + sway - bubble.r * 0.28, bubble.y - bubble.r * 0.3, Math.max(0.45, bubble.r * 0.2), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  /* ---------- fish ---------- */
  class Fish {
    constructor(x, y, r, palette, opts = {}) {
      this.x = x;
      this.y = y;
      this.r = r;
      this.palette = palette;
      this.baseSpeed = opts.speed || rand(58, 105);
      const angle = opts.angle !== undefined ? opts.angle : rand(0, TAU);
      this.vx = Math.cos(angle) * this.baseSpeed;
      this.vy = Math.sin(angle) * this.baseSpeed;
      this.face = this.vx < 0 ? -1 : 1;
      this.wanderAngle = angle;
      this.turnTimer = rand(0.8, 2.8);
      this.phase = rand(0, TAU);
      this.tailPhase = rand(0, TAU);
      this.fade = opts.fade !== undefined ? opts.fade : 0;
      this.fadeSpeed = opts.fadeSpeed || 2.1;
      this.mode = 'wander';
      this.kind = 'food';
      this.separationX = 0;
      this.separationY = 0;
    }

    update(dt, t, player) {
      const S = game.scale || 1;
      this.fade = Math.min(1, this.fade + dt * this.fadeSpeed);

      const speedNow = Math.hypot(this.vx, this.vy);
      this.tailPhase += dt * (4.6 + Math.min(18, speedNow / (this.r * 2.8 + 30)));
      this.turnTimer -= dt;

      let desiredX = 0;
      let desiredY = 0;
      let desiredSpeed = this.baseSpeed * 0.72;
      let mode = 'wander';

      if (player) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const ratio = this.r / player.r;
        const fleeRange = 195 * S + player.r * 3.2;
        const chaseRange = 430 * S + player.r * 2.4;

        if (ratio < 0.94 && d < fleeRange) {
          mode = 'flee';
          desiredX = -dx / d;
          desiredY = -dy / d;
          desiredX += Math.sin(t * 1.1 + this.phase) * 0.12;
          desiredY += Math.cos(t * 0.9 + this.phase) * 0.16;
          desiredSpeed = this.baseSpeed * 1.78;
        } else if (ratio > 1.06 && d < chaseRange) {
          mode = 'chase';
          const lead = 0.16;
          const tx = player.x + player.vx * lead - this.x;
          const ty = player.y + player.vy * lead - this.y;
          const td = Math.hypot(tx, ty) || 1;
          desiredX = tx / td;
          desiredY = ty / td;
          desiredSpeed = this.baseSpeed * 1.32;
        }
      }

      if (mode === 'wander') {
        if (this.turnTimer <= 0) {
          this.wanderAngle += rand(-1.4, 1.4);
          this.turnTimer = rand(1.1, 3.5);
        }
        desiredX = Math.cos(this.wanderAngle);
        desiredY = Math.sin(this.wanderAngle);
        desiredY += Math.sin(t * 0.8 + this.phase) * 0.16;
        desiredSpeed = this.baseSpeed * 0.72;
      }

      this.mode = mode;
      this.kind = player ? (this.r > player.r * 1.06 ? 'danger' : this.r < player.r * 0.94 ? 'food' : 'peer') : 'food';

      /* keep fish away from the canvas edges */
      const margin = 86 * S;
      if (this.x < margin) desiredX += ((margin - this.x) / margin) * 2.6;
      if (this.x > game.w - margin) desiredX -= ((this.x - (game.w - margin)) / margin) * 2.6;
      if (this.y < margin) desiredY += ((margin - this.y) / margin) * 2.6;
      if (this.y > game.h - margin) desiredY -= ((this.y - (game.h - margin)) / margin) * 2.6;

      /* little personal space to keep the shoal from stacking up */
      let sepX = 0;
      let sepY = 0;
      for (const other of game.fishes) {
        if (other === this) continue;
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const minDist = (this.r + other.r) * 0.92 + 8;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          const force = (1 - d / minDist) * 1.45;
          sepX += (dx / d) * force;
          sepY += (dy / d) * force;
        }
      }
      desiredX += sepX;
      desiredY += sepY;

      const desiredLength = Math.hypot(desiredX, desiredY) || 1;
      desiredX /= desiredLength;
      desiredY /= desiredLength;

      const steerRate = mode === 'flee' ? 4.2 : mode === 'chase' ? 2.3 : 1.3;
      const steer = 1 - Math.exp(-dt * steerRate);
      this.vx = lerp(this.vx, desiredX * desiredSpeed, steer);
      this.vy = lerp(this.vy, desiredY * desiredSpeed, steer);

      const maxSpeed = this.baseSpeed * (mode === 'flee' ? 2 : 1.55);
      const currentSpeed = Math.hypot(this.vx, this.vy);
      if (currentSpeed > maxSpeed) {
        this.vx = (this.vx / currentSpeed) * maxSpeed;
        this.vy = (this.vy / currentSpeed) * maxSpeed;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (Math.abs(this.vx) > 4) this.face = this.vx > 0 ? 1 : -1;

      /* hard safety bounds for fish that were spawned just off-screen */
      if (this.x < -130) {
        this.x = -130;
        this.vx = Math.abs(this.vx);
      } else if (this.x > game.w + 130) {
        this.x = game.w + 130;
        this.vx = -Math.abs(this.vx);
      }
      if (this.y < -130) {
        this.y = -130;
        this.vy = Math.abs(this.vy);
      } else if (this.y > game.h + 130) {
        this.y = game.h + 130;
        this.vy = -Math.abs(this.vy);
      }
    }
  }

  /* ---------- game state ---------- */
  const game = {
    mode: 'menu',
    w: 0,
    h: 0,
    dpr: 1,
    scale: 1,
    clock: 0,
    lastFrame: 0,
    player: null,
    fishes: [],
    particles: [],
    waves: [],
    texts: [],
    score: 0,
    eaten: 0,
    playTime: 0,
    maxLevel: 1,
    spawnTimer: 0,
    shake: 0,
    flash: 0,
    hurtFlash: 0,
    endKind: null,
    endTimer: 0,
    endShown: false,
    menuSilhouette: { x: 0.74, y: 0.35, face: -1 },
    tips: { danger: false },
    records: readStore(),
  };

  const ocean = new Ocean();
  const sound = new SoundEngine();
  const input = {
    keys: new Set(),
    mouse: { x: 0, y: 0, active: false },
    touch: { active: false, id: null, baseX: 0, baseY: 0, dx: 1, dy: 0, mag: 0 },
  };

  const hudCache = {
    level: -1,
    xp: -1,
    quota: -1,
    score: -1,
    lives: -1,
    combo: -1,
    dash: -1,
    dashReady: null,
  };

  let bannerTimer = 0;
  let toastTimer = 0;

  /* ---------- sizing ---------- */
  function resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(320, window.innerHeight);
    const oldW = game.w;
    const oldH = game.h;
    const oldScale = game.scale;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);

    game.w = w;
    game.h = h;
    game.dpr = dpr;
    game.scale = clamp(Math.min(w, h) / 820, 0.7, 1.2);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    if (oldW > 0 && oldH > 0 && oldScale > 0) {
      const xr = w / oldW;
      const yr = h / oldH;
      const rr = game.scale / oldScale;
      for (const fish of game.fishes) {
        fish.x *= xr;
        fish.y *= yr;
        fish.r *= rr;
        fish.baseSpeed *= rr;
        fish.vx *= rr;
        fish.vy *= rr;
      }
      if (game.player) {
        game.player.x *= xr;
        game.player.y *= yr;
        game.player.r *= rr;
        game.player.vx *= rr;
        game.player.vy *= rr;
      }
    }

    if (game.player) {
      game.player.targetR = computeTargetRadius();
      game.player.x = clamp(game.player.x, game.player.r * 1.3, w - game.player.r * 1.3);
      game.player.y = clamp(game.player.y, game.player.r * 1.3, h - game.player.r * 1.3);
    }

    ocean.resize(w, h);
  }

  function computeTargetRadius() {
    const p = game.player;
    if (!p) return 14 * game.scale;
    const quota = LEVEL_QUOTAS[p.levelIndex] || 1;
    const progress = clamp(p.xp / quota, 0, 1);
    return (14 + p.levelIndex * 6 + progress * 5) * game.scale;
  }

  /* ---------- screens & records ---------- */
  function showScreen(name) {
    for (const [key, screen] of Object.entries(els.screens)) {
      const active = key === name;
      screen.classList.toggle('is-active', active);
      screen.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
  }

  function hideScreens() {
    showScreen(null);
  }

  function setMode(mode) {
    game.mode = mode;
    app.dataset.mode = mode;
    els.hud.setAttribute('aria-hidden', mode === 'playing' || mode === 'paused' || mode === 'ending' ? 'false' : 'true');
  }

  function updateBestDisplay() {
    const best = Number(game.records.bestScore) || 0;
    els.bestScore.textContent = formatNumber(best);
    els.endBest.textContent = formatNumber(best);
  }

  function saveRecord() {
    if (!game.player) return false;
    const oldBest = Number(game.records.bestScore) || 0;
    const oldLevel = Number(game.records.bestLevel) || 0;
    const level = game.player.levelIndex + 1;
    const isNew = game.score > oldBest;
    game.records = {
      ...readStore(),
      bestScore: Math.max(oldBest, Math.floor(game.score)),
      bestLevel: Math.max(oldLevel, level),
    };
    writeStore(game.records);
    updateBestDisplay();
    return isNew;
  }

  function updateSoundButton() {
    sound.updateButton();
  }

  function applyTouchHints() {
    if (!TOUCH_DEVICE) return;
    const hints = document.querySelectorAll('.how-item small');
    if (hints[0]) hints[0].textContent = '拖拽屏幕游动';
    if (hints[1]) hints[1].textContent = '右下角按钮';
  }

  /* ---------- menu ---------- */
  function setupMenu() {
    game.player = null;
    game.fishes = [];
    game.particles = [];
    game.waves = [];
    game.texts = [];
    game.score = 0;
    game.eaten = 0;
    game.playTime = 0;
    game.shake = 0;
    game.flash = 0;
    game.hurtFlash = 0;
    game.endShown = false;
    game.endKind = null;
    hideBanner();
    hideToast();
    input.keys.clear();
    input.mouse.active = false;
    input.touch.active = false;

    const S = game.scale;
    const count = game.w < 760 ? 7 : 10;
    for (let i = 0; i < count; i += 1) {
      const bigHero = i === 0 || i === 1;
      const r = (bigHero ? rand(19, 30) : rand(8, 19)) * S;
      const x = rand(game.w * (game.w < 760 ? 0.38 : 0.48), game.w * 0.98);
      const y = rand(game.h * 0.13, game.h * 0.87);
      const palette = PALETTES[(i + 2) % PALETTES.length];
      const fish = new Fish(x, y, r, palette, {
        speed: rand(22, 52) * S,
        angle: rand(0, TAU),
        fade: rand(0.35, 1),
        fadeSpeed: 0.7,
      });
      game.fishes.push(fish);
    }

    updateBestDisplay();
    updateSoundButton();
    setMode('menu');
    showScreen('menu');
  }

  /* ---------- start / pause / end ---------- */
  function createPlayer() {
    const S = game.scale;
    return {
      x: game.w * 0.5,
      y: game.h * 0.56,
      vx: 0,
      vy: 0,
      r: 14 * S,
      targetR: 14 * S,
      face: 1,
      tailPhase: rand(0, TAU),
      phase: rand(0, TAU),
      fade: 1,
      fadeSpeed: 3,
      palette: PLAYER_PALETTE,
      levelIndex: 0,
      xp: 0,
      lives: MAX_LIVES,
      invincible: 1.15,
      hurtTimer: 0,
      dashTime: 0,
      dashCd: 0,
      dashDirX: 1,
      dashDirY: 0,
      bite: 0,
      combo: 0,
      comboTimer: 0,
      bubbleTimer: 0,
      isPlayer: true,
    };
  }

  function startGame() {
    sound.init();
    sound.click();
    resetGame();
    hideScreens();
    setMode('playing');
    input.keys.clear();
    input.mouse.active = false;
    input.touch.active = false;
    hudCache.level = -1;
    hudCache.lives = -1;
    hudCache.combo = -1;
    syncHUD(true);
    updateSoundButton();
    showToast(
      TOUCH_DEVICE
        ? '拖拽屏幕游动 · 点按冲刺 · 吃掉更小的鱼'
        : '移动鼠标 / WASD 游动 · 空格冲刺 · 吃掉更小的鱼',
      3600
    );
    if (els.canvas.focus) {
      try {
        els.canvas.focus({ preventScroll: true });
      } catch (err) {
        els.canvas.focus();
      }
    }
  }

  function resetGame() {
    game.player = createPlayer();
    game.fishes = [];
    game.particles = [];
    game.waves = [];
    game.texts = [];
    game.score = 0;
    game.eaten = 0;
    game.playTime = 0;
    game.maxLevel = 1;
    game.spawnTimer = 0.5;
    game.shake = 0;
    game.flash = 0;
    game.hurtFlash = 0;
    game.endKind = null;
    game.endTimer = 0;
    game.endShown = false;
    game.tips.danger = false;
    hideBanner();
    hideToast();
    seedFish();
  }

  function seedFish() {
    const p = game.player;
    const S = game.scale;

    for (let i = 0; i < 3; i += 1) {
      const angle = rand(0, TAU);
      const distance = rand(150, 290) * S;
      spawnFish({
        x: p.x + Math.cos(angle) * distance,
        y: p.y + Math.sin(angle) * distance,
        force: 'food',
        fade: rand(0.2, 0.6),
      });
    }

    for (let i = 0; i < 9; i += 1) spawnFish({ initial: true, force: 'food' });
    for (let i = 0; i < 3; i += 1) spawnFish({ initial: true, force: 'peer' });
    for (let i = 0; i < 2; i += 1) spawnFish({ initial: true, force: 'danger' });

    while (game.fishes.length < 18) spawnFish({ initial: true, force: 'food' });
  }

  function togglePause(force) {
    const shouldPause = force === true || (force !== false && game.mode === 'playing');
    if (shouldPause && game.mode === 'playing') {
      setMode('paused');
      input.keys.clear();
      input.touch.active = false;
      showScreen('pause');
      sound.click();
    } else if (!shouldPause && game.mode === 'paused') {
      hideScreens();
      setMode('playing');
      input.keys.clear();
      input.touch.active = false;
      syncHUD(true);
      sound.click();
    }
  }

  function goMenu() {
    sound.click();
    setupMenu();
  }

  function triggerGameOver() {
    if (game.mode !== 'playing') return;
    const p = game.player;
    p.lives = 0;
    p.invincible = 999;
    p.hurtTimer = 0;
    game.hurtFlash = 1.5;
    game.shake = 24;
    game.endKind = 'gameover';
    game.endTimer = 1.15;
    game.endShown = false;
    setMode('ending');
    hideScreens();
    sound.gameOver();
    syncHUD(true);
  }

  function triggerVictory() {
    if (game.mode !== 'playing' || !game.player) return;
    const p = game.player;
    p.xp = LEVEL_QUOTAS[p.levelIndex];
    p.targetR = computeTargetRadius();
    p.invincible = 999;
    game.score += 1200;
    game.maxLevel = LEVEL_NAMES.length;
    game.endKind = 'victory';
    game.endTimer = 1.55;
    game.endShown = false;
    game.flash = 1.25;
    game.shake = 17;
    setMode('ending');
    hideScreens();
    sound.victory();
    spawnWave(p.x, p.y, p.r * 1.1, Math.max(game.w, game.h) * 0.58, 1.1, '255,211,110', 2.5);
    spawnWave(p.x, p.y, p.r * 0.7, Math.max(game.w, game.h) * 0.4, 0.9, '112,245,213', 2);
    spawnBurst(p.x, p.y, p.r * 1.8, '#ffe39b', 38);
    showLevelBanner('DOMINATED', '深海霸主', '整片海域，都在你的阴影之下');
    syncHUD(true);
  }

  function finishEndScreen() {
    if (game.endShown || !game.player) return;
    game.endShown = true;
    const victory = game.endKind === 'victory';
    const p = game.player;

    setMode(victory ? 'victory' : 'gameover');
    const isNew = saveRecord();

    els.endScreen.classList.toggle('is-victory', victory);
    els.endSymbol.textContent = victory ? '★' : '✕';
    els.endKicker.textContent = victory ? 'DEEP SEA DOMINATED' : 'GAME OVER';
    els.endTitle.textContent = victory ? '深海霸主' : '被吞噬了';
    els.endDesc.textContent = victory
      ? '从一尾幼鱼到整片海域的统治者，你做到了。'
      : '深海不讲情面。调整节奏，再来一次。';
    animateEndScore(game.score);
    els.newRecord.hidden = !isNew;
    els.endEaten.textContent = formatNumber(game.eaten);
    els.endSize.textContent = `${Math.round(p.r / game.scale)} cm`;
    els.endTime.textContent = formatTime(game.playTime);
    els.endLevel.textContent = `Lv.${p.levelIndex + 1} ${LEVEL_NAMES[p.levelIndex]}`;
    els.endBest.textContent = formatNumber(game.records.bestScore || 0);

    showScreen('end');
    hideBanner();
    hideToast();
  }

  function animateEndScore(target) {
    const el = els.endScore;
    if (!el) return;
    if (el._numberTimer) cancelAnimationFrame(el._numberTimer);
    const start = performance.now();
    const from = 0;
    const duration = 760;
    const tick = (now) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatNumber(lerp(from, target, eased));
      if (progress < 1) el._numberTimer = requestAnimationFrame(tick);
      else {
        el._numberTimer = 0;
        el.textContent = formatNumber(target);
      }
    };
    el._numberTimer = requestAnimationFrame(tick);
  }

  /* ---------- fish spawning ---------- */
  function getTargetFishCount() {
    const p = game.player;
    const areaFactor = clamp((game.w * game.h) / 120000, 0.8, 1.35);
    const levelBonus = p ? p.levelIndex * 1.8 : 0;
    return Math.round(clamp((17 + levelBonus) * areaFactor, 16, 29));
  }

  function countPredators() {
    const p = game.player;
    if (!p) return 0;
    return game.fishes.reduce((n, f) => n + (f.r > p.r * 1.07 ? 1 : 0), 0);
  }

  function spawnFish(opts = {}) {
    const p = game.player;
    if (!p) return null;
    const S = game.scale;
    const maxPredators = 2 + p.levelIndex;
    const predators = countPredators();

    let force = opts.force || null;
    if (!force) {
      const dangerChance = 0.1 + p.levelIndex * 0.018;
      const roll = Math.random();
      if (roll < dangerChance && predators < maxPredators) force = 'danger';
      else if (roll < dangerChance + 0.08) force = 'peer';
      else if (roll < dangerChance + 0.52) force = 'tiny';
      else force = 'food';
    } else if (force === 'danger' && predators >= maxPredators) {
      force = 'food';
    }

    let factor;
    if (force === 'tiny') factor = rand(0.34, 0.64);
    else if (force === 'food') factor = rand(0.55, 0.91);
    else if (force === 'peer') factor = rand(0.94, 1.04);
    else factor = rand(1.12, 1.58);

    let r = p.r * factor;
    if (force === 'tiny') r = clamp(r, 4.2 * S, 13 * S);
    else if (force === 'danger') r = Math.max(r, p.r * 1.12);
    r = clamp(r, 4.2 * S, 74 * S);

    const isDanger = r > p.r * 1.06;
    const sizeNorm = r / p.r;
    let baseSpeed;
    if (isDanger) baseSpeed = rand(112, 152) * S * (1 + p.levelIndex * 0.035);
    else if (sizeNorm > 0.94) baseSpeed = rand(64, 98) * S;
    else baseSpeed = rand(48, 82) * S * (0.85 + Math.min(1, sizeNorm) * 0.3);

    let x;
    let y;
    let angle;
    let initial = !!opts.initial;

    if (opts.x !== undefined && opts.y !== undefined) {
      x = opts.x;
      y = opts.y;
      angle = rand(0, TAU);
    } else if (initial) {
      let tries = 0;
      do {
        x = rand(game.w * 0.06, game.w * 0.94);
        y = rand(game.h * 0.12, game.h * 0.88);
        tries += 1;
      } while (
        (dist2(x, y, p.x, p.y) < Math.pow((isDanger ? 380 : 135) * S, 2)) &&
        tries < 12
      );
      angle = rand(0, TAU);
    } else {
      const edge = randInt(0, 3);
      if (edge === 0) {
        x = rand(-55, game.w + 55);
        y = -45;
      } else if (edge === 1) {
        x = game.w + 45;
        y = rand(-55, game.h + 55);
      } else if (edge === 2) {
        x = rand(-55, game.w + 55);
        y = game.h + 45;
      } else {
        x = -45;
        y = rand(-55, game.h + 55);
      }
      angle = Math.atan2(game.h * 0.5 - y, game.w * 0.5 - x) + rand(-0.35, 0.35);
    }

    if (isDanger && !opts.x) {
      let guard = 0;
      while (dist2(x, y, p.x, p.y) < Math.pow(360 * S, 2) && guard < 16) {
        x = rand(-55, game.w + 55);
        y = game.h < 600 ? rand(-55, game.h * 0.2) : rand(-55, game.h + 55);
        guard += 1;
      }
      if (initial) {
        angle = rand(0, TAU);
      } else {
        angle = Math.atan2(game.h * 0.5 - y, game.w * 0.5 - x) + rand(-0.25, 0.25);
      }
    }

    const palette = pick(PALETTES);
    const fish = new Fish(x, y, r, palette, {
      speed: baseSpeed,
      angle,
      fade: opts.fade !== undefined ? opts.fade : 0,
    });
    fish.kind = force === 'danger' ? 'danger' : force === 'peer' ? 'peer' : 'food';
    fish.fadeSpeed = rand(1.6, 2.7);

    if (game.fishes.length > 32) game.fishes.shift();
    game.fishes.push(fish);
    return fish;
  }

  function maintainFish(dt) {
    const target = getTargetFishCount();
    game.spawnTimer -= dt;

    if (game.spawnTimer > 0) return;

    const p = game.player;
    const edible = game.fishes.reduce((n, f) => n + (f.r < p.r * 0.92 ? 1 : 0), 0);

    if (edible < 7) {
      spawnFish({ force: Math.random() < 0.5 ? 'tiny' : 'food' });
      game.spawnTimer = rand(0.22, 0.45);
      return;
    }

    if (game.fishes.length < target) {
      spawnFish();
      game.spawnTimer = rand(0.34, 0.78);
    } else {
      game.spawnTimer = 0.4;
    }
  }

  /* ---------- player movement ---------- */
  function getMoveIntent() {
    let x = 0;
    let y = 0;
    let mag = 0;
    const keys = input.keys;

    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const up = keys.has('KeyW') || keys.has('ArrowUp');
    const down = keys.has('KeyS') || keys.has('ArrowDown');

    if (left || right || up || down) {
      x = (right ? 1 : 0) - (left ? 1 : 0);
      y = (down ? 1 : 0) - (up ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      x /= len;
      y /= len;
      mag = 1;
    } else if (input.touch.active) {
      x = input.touch.dx;
      y = input.touch.dy;
      mag = input.touch.mag;
    } else if (input.mouse.active && game.player) {
      const dx = input.mouse.x - game.player.x;
      const dy = input.mouse.y - game.player.y;
      const d = Math.hypot(dx, dy);
      if (d > 5) {
        x = dx / d;
        y = dy / d;
        mag = clamp((d - 4) / (72 * game.scale), 0, 1);
      }
    }

    return { x, y, mag };
  }

  function doDash() {
    const p = game.player;
    if (!p || game.mode !== 'playing' || p.dashCd > 0 || p.dashTime > 0) return;

    const intent = getMoveIntent();
    let dx = intent.x;
    let dy = intent.y;
    if (intent.mag < 0.08) {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 22) {
        dx = p.vx / speed;
        dy = p.vy / speed;
      } else {
        dx = p.face;
        dy = 0;
      }
    }

    p.dashTime = DASH_DURATION;
    p.dashCd = DASH_COOLDOWN;
    p.dashDirX = dx;
    p.dashDirY = dy;
    p.invincible = Math.max(p.invincible, 0.37);
    game.shake = Math.max(game.shake, 4);
    sound.dash();

    for (let i = 0; i < 9; i += 1) {
      addParticle({
        type: 'bubble',
        x: p.x - dx * p.r * rand(0.4, 1.2) + rand(-7, 7),
        y: p.y - dy * p.r * rand(0.4, 1.2) + rand(-7, 7),
        vx: -dx * rand(35, 95) + rand(-25, 25),
        vy: -dy * rand(35, 95) + rand(-25, 25),
        size: rand(1.4, 4.2),
        life: rand(0.35, 0.8),
        ttl: 0.8,
        gravity: -18,
        drag: 1.2,
        color: 'rgba(157,255,235,.7)',
      });
    }
  }

  function updatePlayer(dt) {
    const p = game.player;
    const S = game.scale;
    let intent = getMoveIntent();

    if (p.dashTime > 0) {
      p.dashTime = Math.max(0, p.dashTime - dt);
      intent = { x: p.dashDirX, y: p.dashDirY, mag: 1 };
      if (Math.random() < 0.8) {
        addParticle({
          type: 'bubble',
          x: p.x - p.dashDirX * p.r * rand(0.7, 1.5) + rand(-5, 5),
          y: p.y - p.dashDirY * p.r * rand(0.7, 1.5) + rand(-5, 5),
          vx: rand(-18, 18) - p.dashDirX * 25,
          vy: rand(-18, 18) - p.dashDirY * 25,
          size: rand(1.1, 3.5),
          life: rand(0.28, 0.65),
          ttl: 0.65,
          gravity: -22,
          drag: 1.4,
          color: 'rgba(139,255,231,.6)',
        });
      }
    }

    const sizeFactor = clamp(1 - ((p.r / S) - 14) / 70 * 0.32, 0.72, 1);
    const baseSpeed = 352 * S * sizeFactor;
    const speed = p.dashTime > 0 ? 352 * S * 2.32 : baseSpeed;
    const accel = p.dashTime > 0 ? 22 : 8.5;

    const targetVX = intent.x * speed * clamp(intent.mag, 0, 1);
    const targetVY = intent.y * speed * clamp(intent.mag, 0, 1);
    const k = 1 - Math.exp(-accel * dt);
    p.vx = lerp(p.vx, targetVX, k);
    p.vy = lerp(p.vy, targetVY, k);

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const margin = p.r * 1.28 + 3;
    if (p.x < margin) {
      p.x = margin;
      if (p.vx < 0) p.vx *= -0.28;
    } else if (p.x > game.w - margin) {
      p.x = game.w - margin;
      if (p.vx > 0) p.vx *= -0.28;
    }
    if (p.y < margin) {
      p.y = margin;
      if (p.vy < 0) p.vy *= -0.28;
    } else if (p.y > game.h - margin) {
      p.y = game.h - margin;
      if (p.vy > 0) p.vy *= -0.28;
    }

    const speedNow = Math.hypot(p.vx, p.vy);
    p.tailPhase += dt * (4 + Math.min(20, speedNow / (S * 6)));
    if (Math.abs(p.vx) > 8) p.face = p.vx > 0 ? 1 : -1;

    p.bite = Math.max(0, p.bite - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    p.invincible = Math.max(0, p.invincible - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.r = lerp(p.r, p.targetR, 1 - Math.exp(-dt * 2.4));

    if (p.comboTimer > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) p.combo = 0;
    }

    p.bubbleTimer -= dt;
    if (p.bubbleTimer <= 0 && speedNow > 55 * S) {
      p.bubbleTimer = rand(0.13, 0.3);
      addParticle({
        type: 'bubble',
        x: p.x - p.face * p.r * rand(0.7, 1.25),
        y: p.y + rand(-p.r * 0.25, p.r * 0.1),
        vx: -p.vx * 0.06 + rand(-7, 7),
        vy: -rand(14, 34),
        size: rand(1, 3.2),
        life: rand(0.6, 1.2),
        ttl: 1.2,
        gravity: -7,
        drag: 0.8,
        color: 'rgba(178,255,241,.45)',
      });
    }

    /* a faint water ripple behind the tail while dashing */
    if (p.dashTime > 0) {
      p.x = clamp(p.x, margin, game.w - margin);
      p.y = clamp(p.y, margin, game.h - margin);
    }
  }

  /* ---------- collisions & growth ---------- */
  function resolveFishCollisions() {
    const p = game.player;
    if (!p) return;

    for (let i = game.fishes.length - 1; i >= 0; i -= 1) {
      const f = game.fishes[i];
      if (!f) continue;
      const dx = f.x - p.x;
      const dy = f.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const ratio = f.r / p.r;

      if (ratio < 0.94) {
        const eatDistance = p.r * 0.86 + f.r * 0.58;
        if (d < eatDistance) {
          game.fishes.splice(i, 1);
          eatFish(f);
          if (game.mode !== 'playing') return;
        }
      } else if (ratio > 1.06) {
        const hitDistance = p.r * 0.62 + f.r * 0.68;
        if (d < hitDistance && p.invincible <= 0) {
          hurtPlayer(f);
          if (game.mode !== 'playing') return;
        }
      } else {
        const minDistance = p.r * 0.92 + f.r * 0.72;
        if (d < minDistance) {
          const nx = dx / d;
          const ny = dy / d;
          const overlap = minDistance - d;
          p.x += nx * overlap * 0.45;
          p.y += ny * overlap * 0.45;
          f.x -= nx * overlap * 0.65;
          f.y -= ny * overlap * 0.65;
          p.vx += nx * 12;
          p.vy += ny * 12;
          f.vx -= nx * 20;
          f.vy -= ny * 20;
        }
      }
    }
  }

  function eatFish(fish) {
    const p = game.player;
    const S = game.scale;
    p.combo = Math.min(8, p.combo + 1);
    p.comboTimer = 2.5;
    p.bite = 0.17;
    p.hurtTimer = 0;

    const multiplier = Math.min(5, p.combo);
    const points = Math.round((11 + (fish.r / S) * 2.3) * multiplier);
    const xpGain = Math.round(5 + (fish.r / S) * 0.62 + (fish.r / p.r) * 3);

    game.score += points;
    game.eaten += 1;
    p.xp += xpGain;
    p.targetR = computeTargetRadius();

    game.shake = Math.max(game.shake, Math.min(8, 2.2 + fish.r / S * 0.1));
    spawnBurst(fish.x, fish.y, fish.r, fish.palette.body, Math.round(clamp(fish.r / S + 4, 6, 18)));
    spawnWave(fish.x, fish.y, fish.r * 0.6, fish.r * 2.8, 0.42, '112,245,213', 1.2);
    addText(
      fish.x,
      fish.y - fish.r * 0.75,
      `+${points}`,
      multiplier > 1 ? '#ffe39b' : '#cafff0',
      Math.round(clamp(12 + fish.r / S * 0.28, 12, 20))
    );
    sound.eat(p.combo);

    const quota = LEVEL_QUOTAS[p.levelIndex];
    if (p.xp >= quota) {
      if (p.levelIndex >= LEVEL_NAMES.length - 1) {
        triggerVictory();
        return;
      }
      p.xp -= quota;
      p.levelIndex += 1;
      game.maxLevel = Math.max(game.maxLevel, p.levelIndex + 1);
      p.targetR = computeTargetRadius();
      p.invincible = Math.max(p.invincible, 1.85);
      game.score += 180 * (p.levelIndex + 1);
      game.flash = Math.max(game.flash, 0.62);
      game.shake = Math.max(game.shake, 13);
      game.waves.push({
        x: p.x,
        y: p.y,
        radius: p.r * 1.2,
        maxRadius: Math.max(game.w, game.h) * 0.44,
        life: 0.9,
        ttl: 0.9,
        color: '112,245,213',
        width: 2.1,
      });

      let healed = false;
      if (p.levelIndex === 1 || p.levelIndex === 3) {
        if (p.lives < MAX_LIVES) {
          p.lives += 1;
          healed = true;
          addText(p.x, p.y - p.r * 2.1, '+1 生命', '#ff9aab', 15);
        }
      }

      for (const other of game.fishes) {
        if (other.r <= p.r * 1.05) continue;
        const dx = other.x - p.x;
        const dy = other.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        other.vx += (dx / d) * 95;
        other.vy += (dy / d) * 95;
      }

      sound.levelUp();
      showLevelBanner(
        'EVOLUTION',
        `进化 · Lv.${p.levelIndex + 1} ${LEVEL_NAMES[p.levelIndex]}`,
        p.levelIndex === LEVEL_NAMES.length - 1
          ? '最终形态 · 填满成长条，统治深海'
          : `体型提升${healed ? ' · 生命恢复' : '，新的猎物已解锁'}`
      );
    }

    syncHUD();
  }

  function hurtPlayer(fish) {
    const p = game.player;
    if (game.mode !== 'playing' || p.invincible > 0) return;

    p.lives -= 1;
    p.invincible = 2.4;
    p.hurtTimer = 0.66;
    p.combo = 0;
    p.comboTimer = 0;
    p.xp = Math.max(0, p.xp - (LEVEL_QUOTAS[p.levelIndex] || 0) * 0.1);
    p.targetR = computeTargetRadius();

    const dx = p.x - fish.x;
    const dy = p.y - fish.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx += (dx / d) * 260;
    p.vy += (dy / d) * 260;
    fish.vx -= (dx / d) * 70;
    fish.vy -= (dy / d) * 70;

    game.hurtFlash = 1.15;
    game.shake = 20;
    spawnBurst(p.x, p.y, p.r * 1.2, '#ff6a78', 26);
    spawnWave(p.x, p.y, p.r * 0.7, p.r * 3.6, 0.5, '255,95,112', 2);
    addText(p.x, p.y - p.r * 1.7, '生命 -1', '#ff8792', 16);
    sound.hurt();
    syncHUD(true);

    if (p.lives <= 0) triggerGameOver();
  }

  /* ---------- effects ---------- */
  function addParticle(particle) {
    if (game.particles.length > 260) game.particles.shift();
    game.particles.push(particle);
  }

  function spawnBurst(x, y, radius, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(35, 150) * clamp(radius / (18 * game.scale), 0.5, 1.8);
      addParticle({
        type: i % 4 === 0 ? 'bubble' : 'dot',
        x: x + Math.cos(angle) * radius * rand(0.15, 0.7),
        y: y + Math.sin(angle) * radius * rand(0.15, 0.7),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        size: rand(1.2, 4.2),
        life: rand(0.45, 1.05),
        ttl: 1.05,
        gravity: i % 4 === 0 ? -25 : 30,
        drag: 1.4,
        color,
      });
    }
  }

  function spawnWave(x, y, radius, maxRadius, life, color, width) {
    game.waves.push({ x, y, radius, maxRadius, life, ttl: life, color, width });
  }

  function addText(x, y, text, color, size) {
    if (game.texts.length > 22) game.texts.shift();
    game.texts.push({
      x,
      y,
      text,
      color,
      size,
      life: 1.1,
      ttl: 1.1,
      vy: -27,
      vx: rand(-8, 8),
    });
  }

  function updateEffects(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.gravity || 0) * dt;
      const drag = Math.exp(-(particle.drag || 1) * dt);
      particle.vx *= drag;
      particle.vy *= drag;
    }
    game.particles = game.particles.filter((p) => p.life > 0);

    for (const wave of game.waves) {
      wave.life -= dt;
      const p = 1 - wave.life / wave.ttl;
      wave.radius = lerp(wave.radius, wave.maxRadius, 1 - Math.pow(1 - p, 2.3));
    }
    game.waves = game.waves.filter((w) => w.life > 0);

    for (const text of game.texts) {
      text.life -= dt;
      text.x += text.vx * dt;
      text.y += text.vy * dt;
      text.vy *= 0.985;
    }
    game.texts = game.texts.filter((t) => t.life > 0);
  }

  /* ---------- hud ---------- */
  function syncHUD(force = false) {
    const p = game.player;
    if (!p) return;

    const quota = LEVEL_QUOTAS[p.levelIndex];
    const progress = clamp(p.xp / quota, 0, 1);
    const score = String(Math.floor(game.score)).padStart(6, '0');

    if (force || hudCache.level !== p.levelIndex) {
      hudCache.level = p.levelIndex;
      els.levelNum.textContent = String(p.levelIndex + 1).padStart(2, '0');
      els.levelName.textContent = LEVEL_NAMES[p.levelIndex];
    }

    els.growthFill.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (force || hudCache.xp !== Math.floor(p.xp) || hudCache.quota !== quota) {
      hudCache.xp = Math.floor(p.xp);
      hudCache.quota = quota;
      els.growthText.textContent = `${Math.floor(p.xp)} / ${quota}`;
    }

    if (force || hudCache.score !== score) {
      hudCache.score = score;
      els.score.textContent = score;
    }

    if (force || hudCache.lives !== p.lives) {
      hudCache.lives = p.lives;
      els.hearts.forEach((heart, i) => heart.classList.toggle('is-empty', i >= p.lives));
      els.lives.setAttribute('aria-label', `剩余生命 ${p.lives}`);
    }

    const comboValue = Math.min(5, p.combo);
    if (force || hudCache.combo !== p.combo) {
      hudCache.combo = p.combo;
      els.combo.textContent = `×${comboValue} 连吃`;
      els.combo.classList.toggle('show', p.combo >= 2);
      if (p.combo >= 2) {
        els.combo.classList.remove('pop');
        void els.combo.offsetWidth;
        els.combo.classList.add('pop');
      }
    }

    const dashRatio = clamp(p.dashCd / DASH_COOLDOWN, 0, 1);
    els.dashRing.style.strokeDashoffset = String(DASH_RING_LENGTH * dashRatio);
    const ready = p.dashCd <= 0;
    if (force || hudCache.dashReady !== ready) {
      hudCache.dashReady = ready;
      els.dashBtn.classList.toggle('is-ready', ready);
      els.dashBtn.classList.toggle('is-cooling', !ready);
      els.dashBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
    }
  }

  function showLevelBanner(kicker, title, subtitle) {
    const kickerEl = els.levelBanner.querySelector('span');
    if (kickerEl) kickerEl.textContent = kicker;
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = subtitle;
    els.levelBanner.classList.remove('show');
    void els.levelBanner.offsetWidth;
    els.levelBanner.classList.add('show');
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => els.levelBanner.classList.remove('show'), 2450);
  }

  function hideBanner() {
    window.clearTimeout(bannerTimer);
    els.levelBanner.classList.remove('show');
  }

  function showToast(text, duration = 3000) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), duration);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    els.toast.classList.remove('show');
  }

  /* ---------- draw: fish ---------- */
  function drawDangerAura(c, fish, t) {
    if (fish.fade < 0.05) return;
    const pulse = 0.55 + 0.45 * Math.sin(t * 4.3 + fish.phase);
    c.save();
    c.globalAlpha = fish.fade;
    c.translate(fish.x, fish.y);
    const aura = c.createRadialGradient(0, 0, fish.r * 0.72, 0, 0, fish.r * 2.4);
    aura.addColorStop(0, 'rgba(255,62,86,.27)');
    aura.addColorStop(0.46, 'rgba(255,64,88,.085)');
    aura.addColorStop(1, 'rgba(255,64,88,0)');
    c.fillStyle = aura;
    c.beginPath();
    c.arc(0, 0, fish.r * 2.4, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'screen';
    c.strokeStyle = `rgba(255,118,133,${0.28 + pulse * 0.26})`;
    c.lineWidth = 1.55;
    c.setLineDash([4, 7]);
    c.lineDashOffset = -t * 18;
    c.beginPath();
    c.arc(0, 0, fish.r * 1.62, 0, TAU);
    c.stroke();
    c.restore();
  }

  function drawPlayerAura(c, p, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + p.phase);
    const radius = p.r * 2.5;
    c.save();
    c.translate(p.x, p.y);
    const aura = c.createRadialGradient(0, 0, p.r * 0.7, 0, 0, radius);
    aura.addColorStop(0, `rgba(255,214,142,${0.1 + pulse * 0.035})`);
    aura.addColorStop(0.5, 'rgba(255,188,102,.045)');
    aura.addColorStop(1, 'rgba(255,168,74,0)');
    c.fillStyle = aura;
    c.beginPath();
    c.arc(0, 0, radius, 0, TAU);
    c.fill();

    c.strokeStyle = `rgba(255,236,186,${0.24 + pulse * 0.13})`;
    c.lineWidth = 1.15;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, 0, p.r * 1.52, -Math.PI * 0.77, -Math.PI * 0.12);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, p.r * 1.52, Math.PI * 0.23, Math.PI * 0.7);
    c.stroke();
    c.restore();
  }

  function drawFish(c, fish, t, player, opts = {}) {
    const R = fish.r;
    const alpha = Math.min(1, fish.fade) * (opts.alpha !== undefined ? opts.alpha : 1);
    if (alpha <= 0.01) return;
    if (fish.x < -R * 3.4 || fish.x > game.w + R * 3.4 || fish.y < -R * 3.4 || fish.y > game.h + R * 3.4) return;

    const isDanger = !!player && !opts.isPlayer && fish.r > player.r * 1.06;
    if (isDanger) drawDangerAura(c, fish, t);

    const pal = fish.palette;
    const flap = Math.sin(fish.tailPhase);
    const tilt = clamp(fish.vy / (Math.abs(fish.vx) + R * 2.8), -0.72, 0.72) * 0.5;

    c.save();
    c.globalAlpha = alpha;
    c.translate(fish.x, fish.y);
    c.scale(fish.face, 1);
    c.rotate(tilt);

    if (opts.isPlayer) {
      c.shadowColor = 'rgba(255,178,90,.34)';
      c.shadowBlur = R * 0.9;
    }

    /* tail */
    const tailX = -R * 0.82;
    const tailTip = -R * 1.96;
    c.beginPath();
    c.moveTo(tailX, 0);
    c.bezierCurveTo(
      -R * 1.25,
      -R * 0.2 + flap * R * 0.16,
      -R * 1.62,
      -R * 0.68 + flap * R * 0.27,
      tailTip,
      -R * 0.9 + flap * R * 0.2
    );
    c.quadraticCurveTo(-R * 1.5, -R * 0.04, tailTip, R * 0.9 + flap * R * 0.2);
    c.bezierCurveTo(
      -R * 1.62,
      R * 0.68 + flap * R * 0.27,
      -R * 1.25,
      R * 0.2 + flap * R * 0.16,
      tailX,
      0
    );
    c.closePath();
    c.fillStyle = pal.fin;
    c.globalAlpha = alpha * 0.92;
    c.fill();
    c.globalAlpha = alpha;
    c.strokeStyle = pal.outline;
    c.lineWidth = Math.max(0.7, R * 0.045);
    c.stroke();

    /* dorsal fin */
    c.beginPath();
    c.moveTo(-R * 0.42, -R * 0.55);
    c.quadraticCurveTo(-R * 0.2, -R * 1.22 - flap * R * 0.05, R * 0.12, -R * 1.04);
    c.quadraticCurveTo(R * 0.22, -R * 0.78, R * 0.34, -R * 0.48);
    c.closePath();
    c.fillStyle = pal.dark;
    c.globalAlpha = alpha * 0.55;
    c.fill();
    c.globalAlpha = alpha;

    /* body */
    const bodyGradient = c.createLinearGradient(0, -R, 0, R);
    bodyGradient.addColorStop(0, pal.light);
    bodyGradient.addColorStop(0.3, pal.body);
    bodyGradient.addColorStop(0.78, pal.body);
    bodyGradient.addColorStop(1, pal.dark);
    c.beginPath();
    c.ellipse(0, 0, R * 1.29, R * 0.82, 0, 0, TAU);
    c.fillStyle = bodyGradient;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = pal.outline;
    c.lineWidth = Math.max(0.8, R * 0.055);
    c.stroke();

    if (opts.isPlayer) {
      c.globalAlpha = alpha * 0.3;
      c.strokeStyle = 'rgba(255,244,206,.95)';
      c.lineWidth = Math.max(0.7, R * 0.028);
      c.beginPath();
      c.ellipse(0, 0, R * 1.35, R * 0.87, 0, 0, TAU);
      c.stroke();
      c.globalAlpha = alpha;
    }

    /* subtle stripes */
    c.save();
    c.beginPath();
    c.ellipse(0, 0, R * 1.27, R * 0.8, 0, 0, TAU);
    c.clip();
    c.strokeStyle = pal.stripe;
    c.lineWidth = Math.max(1, R * 0.12);
    for (let i = -1; i <= 1; i += 1) {
      const x = i * R * 0.42 + R * 0.04;
      c.beginPath();
      c.moveTo(x - R * 0.08, -R);
      c.quadraticCurveTo(x + R * 0.16, 0, x - R * 0.06, R);
      c.stroke();
    }
    c.restore();

    /* top sheen and belly */
    c.save();
    c.globalAlpha = alpha * 0.22;
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(0.8, R * 0.045);
    c.beginPath();
    c.ellipse(R * 0.02, -R * 0.17, R * 0.86, R * 0.4, -0.08, Math.PI * 1.06, Math.PI * 1.9);
    c.stroke();
    c.globalAlpha = alpha * 0.1;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(R * 0.1, R * 0.26, R * 0.78, R * 0.31, -0.04, 0, TAU);
    c.fill();
    c.restore();

    /* pectoral fin */
    c.beginPath();
    c.moveTo(R * 0.08, R * 0.13);
    c.quadraticCurveTo(-R * 0.03, R * 0.69 + flap * R * 0.06, -R * 0.3, R * 0.42);
    c.quadraticCurveTo(-R * 0.02, R * 0.3, R * 0.28, R * 0.18);
    c.closePath();
    c.fillStyle = pal.fin;
    c.globalAlpha = alpha * 0.82;
    c.fill();
    c.globalAlpha = alpha;
    c.strokeStyle = pal.outline;
    c.lineWidth = Math.max(0.6, R * 0.035);
    c.stroke();

    /* gill */
    c.strokeStyle = pal.outline;
    c.globalAlpha = alpha * 0.45;
    c.lineWidth = Math.max(0.7, R * 0.04);
    c.beginPath();
    c.arc(R * 0.35, 0, R * 0.46, Math.PI * 0.58, Math.PI * 1.05);
    c.stroke();
    c.globalAlpha = alpha;

    /* eye */
    const eyeX = R * 0.7;
    const eyeY = -R * 0.15;
    c.fillStyle = '#f8fffb';
    c.beginPath();
    c.arc(eyeX, eyeY, R * 0.155, 0, TAU);
    c.fill();
    c.fillStyle = '#06252b';
    c.beginPath();
    c.arc(eyeX + R * 0.035, eyeY + R * 0.012, Math.max(0.75, R * 0.082), 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(eyeX + R * 0.014, eyeY - R * 0.035, Math.max(0.45, R * 0.033), 0, TAU);
    c.fill();

    /* mouth */
    c.strokeStyle = pal.outline;
    c.lineWidth = Math.max(0.8, R * 0.045);
    c.beginPath();
    if (opts.isPlayer && fish.bite > 0) {
      c.arc(R * 1.02, R * 0.11, R * 0.12, -0.25, Math.PI * 1.25);
      c.fillStyle = 'rgba(49,16,14,.6)';
      c.fill();
    } else {
      c.moveTo(R * 1.02, R * 0.05);
      c.quadraticCurveTo(R * 1.13, R * 0.13, R * 1.01, R * 0.2);
      c.stroke();
    }

    if (opts.isPlayer && opts.level >= 3) {
      c.save();
      c.fillStyle = '#ffe28b';
      c.globalAlpha = alpha * 0.9;
      c.beginPath();
      c.moveTo(-R * 0.2, -R * 0.96);
      c.lineTo(-R * 0.06, -R * 1.22);
      c.lineTo(R * 0.05, -R * 1.02);
      c.lineTo(R * 0.17, -R * 1.26);
      c.lineTo(R * 0.29, -R * 0.97);
      c.closePath();
      c.fill();
      c.restore();
    }

    c.restore();
  }

  function drawPlayerShield(c, p, t) {
    if (p.invincible <= 0 || p.invincible >= 900 || game.mode !== 'playing') return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(t * 0.35);
    c.strokeStyle = `rgba(151,255,235,${0.18 + pulse * 0.12})`;
    c.lineWidth = 1.4;
    c.setLineDash([3, 7]);
    c.lineDashOffset = -t * 12;
    c.beginPath();
    c.arc(0, 0, p.r * 1.5 + pulse * 2, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 0.055 + pulse * 0.035;
    c.fillStyle = '#a6ffe9';
    c.beginPath();
    c.arc(0, 0, p.r * 1.5, 0, TAU);
    c.fill();
    c.restore();
  }

  /* ---------- draw: world ---------- */
  function drawWaves(c) {
    c.save();
    for (const wave of game.waves) {
      const a = clamp(wave.life / wave.ttl, 0, 1);
      c.strokeStyle = `rgba(${wave.color},${a * 0.46})`;
      c.lineWidth = wave.width * (0.55 + a * 0.6);
      c.beginPath();
      c.arc(wave.x, wave.y, Math.max(1, wave.radius), 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  function drawParticles(c) {
    if (!game.particles.length) return;
    for (const particle of game.particles) {
      const alpha = clamp(particle.life / particle.ttl, 0, 1);
      if (alpha <= 0) continue;
      if (particle.type === 'bubble') {
        c.globalAlpha = alpha * 0.6;
        c.strokeStyle = particle.color;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(particle.x, particle.y, Math.max(0.4, particle.size), 0, TAU);
        c.stroke();
        c.globalAlpha = alpha * 0.24;
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(particle.x - particle.size * 0.25, particle.y - particle.size * 0.3, Math.max(0.3, particle.size * 0.22), 0, TAU);
        c.fill();
      } else {
        c.globalAlpha = alpha * 0.8;
        c.fillStyle = particle.color;
        c.beginPath();
        c.arc(particle.x, particle.y, Math.max(0.4, particle.size), 0, TAU);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  function drawTexts(c) {
    if (!game.texts.length) return;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const item of game.texts) {
      const alpha = clamp(item.life / item.ttl, 0, 1);
      c.globalAlpha = Math.min(1, alpha * 1.9);
      c.fillStyle = item.color;
      c.font = `800 ${item.size}px ${CANVAS_FONT}`;
      c.shadowColor = 'rgba(0,8,10,.7)';
      c.shadowBlur = 8;
      c.fillText(item.text, item.x, item.y);
    }
    c.restore();
  }

  function drawMenuLeviathan(c, t) {
    if (game.mode !== 'menu') return;
    const scale = clamp(Math.min(game.w, game.h) * 0.16, 80, 170);
    const x = game.w * game.menuSilhouette.x + Math.sin(t * 0.07) * game.w * 0.018;
    const y = game.h * game.menuSilhouette.y + Math.cos(t * 0.11) * 11;
    const face = game.menuSilhouette.face;

    c.save();
    c.translate(x, y);
    c.scale(face, 1);
    c.rotate(Math.sin(t * 0.09) * 0.025);
    c.fillStyle = 'rgba(1,20,25,.27)';
    c.beginPath();
    c.ellipse(0, 0, scale * 1.55, scale * 0.66, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(-scale * 1.1, 0);
    c.quadraticCurveTo(-scale * 1.7, -scale * 0.55, -scale * 2.15, -scale * 0.68);
    c.quadraticCurveTo(-scale * 1.65, 0, -scale * 2.15, scale * 0.68);
    c.quadraticCurveTo(-scale * 1.7, scale * 0.55, -scale * 1.1, 0);
    c.fill();
    c.beginPath();
    c.moveTo(-scale * 0.12, -scale * 0.52);
    c.quadraticCurveTo(scale * 0.08, -scale * 1.1, scale * 0.46, -scale * 0.46);
    c.fill();
    c.fillStyle = 'rgba(2,24,28,.38)';
    c.beginPath();
    c.arc(scale * 0.92, -scale * 0.16, scale * 0.065, 0, TAU);
    c.fill();
    c.restore();
  }

  function drawReticle(c) {
    if (game.mode !== 'playing' || !input.mouse.active || input.touch.active) return;
    const x = input.mouse.x;
    const y = input.mouse.y;
    c.save();
    c.translate(x, y);
    c.rotate(game.clock * 0.7);
    c.strokeStyle = 'rgba(155,255,235,.5)';
    c.lineWidth = 1;
    c.setLineDash([2, 5]);
    c.beginPath();
    c.arc(0, 0, 9, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(197,255,244,.86)';
    c.beginPath();
    c.arc(0, 0, 1.7, 0, TAU);
    c.fill();
    for (let i = 0; i < 4; i += 1) {
      c.rotate(Math.PI / 2);
      c.fillStyle = 'rgba(155,255,235,.32)';
      c.fillRect(12, -0.5, 4, 1);
    }
    c.restore();
  }

  function drawJoystick(c) {
    if (game.mode !== 'playing' || !input.touch.active) return;
    const t = input.touch;
    const radius = 43;
    const knobDistance = radius * t.mag;
    const knobX = t.baseX + t.dx * knobDistance;
    const knobY = t.baseY + t.dy * knobDistance;

    c.save();
    c.globalAlpha = 0.72;
    c.fillStyle = 'rgba(2,24,30,.25)';
    c.strokeStyle = 'rgba(147,255,232,.2)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(t.baseX, t.baseY, radius, 0, TAU);
    c.fill();
    c.stroke();

    c.strokeStyle = 'rgba(147,255,232,.35)';
    c.setLineDash([3, 6]);
    c.beginPath();
    c.arc(t.baseX, t.baseY, 28, 0, TAU);
    c.stroke();
    c.setLineDash([]);

    c.strokeStyle = 'rgba(147,255,232,.16)';
    c.beginPath();
    c.moveTo(t.baseX, t.baseY);
    c.lineTo(knobX, knobY);
    c.stroke();

    c.fillStyle = 'rgba(112,245,213,.2)';
    c.strokeStyle = 'rgba(180,255,240,.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(knobX, knobY, 17, 0, TAU);
    c.fill();
    c.stroke();

    c.fillStyle = 'rgba(230,255,249,.8)';
    c.beginPath();
    c.arc(knobX, knobY, 2.3, 0, TAU);
    c.fill();
    c.restore();
  }

  function drawThreatVignette(c) {
    const p = game.player;
    if (!p || game.mode !== 'playing') return;
    let threat = 0;
    const S = game.scale;
    for (const fish of game.fishes) {
      if (fish.r <= p.r * 1.06) continue;
      const d = Math.hypot(fish.x - p.x, fish.y - p.y);
      threat = Math.max(threat, clamp(1 - (d - p.r) / (260 * S), 0, 1));
    }
    if (threat <= 0.01) return;
    const pulse = 0.75 + 0.25 * Math.sin(game.clock * 5.2);
    const g = c.createRadialGradient(
      game.w * 0.5,
      game.h * 0.5,
      Math.min(game.w, game.h) * 0.22,
      game.w * 0.5,
      game.h * 0.5,
      Math.max(game.w, game.h) * 0.72
    );
    g.addColorStop(0, 'rgba(255,48,72,0)');
    g.addColorStop(0.72, `rgba(255,45,66,${threat * 0.04 * pulse})`);
    g.addColorStop(1, `rgba(255,35,58,${threat * 0.2 * pulse})`);
    c.fillStyle = g;
    c.fillRect(0, 0, game.w, game.h);
  }

  function drawScreenFlash(c) {
    if (game.hurtFlash > 0) {
      const a = clamp(game.hurtFlash / 1.15, 0, 1);
      const g = c.createRadialGradient(
        game.w * 0.5,
        game.h * 0.5,
        Math.min(game.w, game.h) * 0.15,
        game.w * 0.5,
        game.h * 0.5,
        Math.max(game.w, game.h) * 0.72
      );
      g.addColorStop(0, `rgba(255,45,65,${a * 0.035})`);
      g.addColorStop(1, `rgba(255,30,55,${a * 0.22})`);
      c.fillStyle = g;
      c.fillRect(0, 0, game.w, game.h);
    }
    if (game.flash > 0) {
      const a = clamp(game.flash, 0, 1);
      c.fillStyle = `rgba(160,255,232,${a * 0.08})`;
      c.fillRect(0, 0, game.w, game.h);
    }
  }

  function render() {
    const w = game.w;
    const h = game.h;
    c_setTransform();
    ctx.clearRect(0, 0, w, h);
    ocean.draw(ctx, w, h, game.clock);

    const shakeX = game.shake > 0 ? rand(-game.shake, game.shake) * 0.55 : 0;
    const shakeY = game.shake > 0 ? rand(-game.shake, game.shake) * 0.55 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    if (game.mode === 'menu') {
      drawMenuLeviathan(ctx, game.clock);
      const sorted = game.fishes.slice().sort((a, b) => a.r - b.r);
      for (const fish of sorted) drawFish(ctx, fish, game.clock, null);
    } else {
      drawWaves(ctx);
      const sorted = game.fishes.slice().sort((a, b) => a.r - b.r);
      const player = game.player;
      if (player) drawPlayerAura(ctx, player, game.clock);
      for (const fish of sorted) drawFish(ctx, fish, game.clock, player);
      if (player) {
        let alpha = 1;
        if (player.hurtTimer > 0) alpha = 0.58 + 0.42 * Math.abs(Math.sin(game.clock * 24));
        drawFish(ctx, player, game.clock, player, { isPlayer: true, alpha, level: player.levelIndex });
        drawPlayerShield(ctx, player, game.clock);
      }
      drawParticles(ctx);
      drawTexts(ctx);
    }

    ctx.restore();
    drawThreatVignette(ctx);
    drawScreenFlash(ctx);
    drawReticle(ctx);
    drawJoystick(ctx);
  }

  function c_setTransform() {
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  }

  /* ---------- game updates ---------- */
  function updateMenu(dt) {
    for (const fish of game.fishes) fish.update(dt, game.clock, null);
  }

  function updatePlaying(dt) {
    game.playTime += dt;
    const p = game.player;
    if (!p) return;

    updatePlayer(dt);
    maintainFish(dt);

    for (const fish of game.fishes) fish.update(dt, game.clock, p);
    resolveFishCollisions();

    if (game.mode !== 'playing') return;

    updateEffects(dt);
    syncHUD();

    if (!game.tips.danger && game.playTime > 4.5) {
      const S = game.scale;
      for (const fish of game.fishes) {
        if (fish.r > p.r * 1.15 && Math.hypot(fish.x - p.x, fish.y - p.y) < 420 * S) {
          game.tips.danger = true;
          showToast('危险！红色光晕的鱼会吃掉你', 3000);
          break;
        }
      }
    }
  }

  function updateEnding(dt) {
    const p = game.player;
    if (p) {
      p.x += p.vx * dt * 0.22;
      p.y += p.vy * dt * 0.22;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.invincible = Math.max(0, p.invincible - dt);
      p.r = lerp(p.r, p.targetR, 1 - Math.exp(-dt * 2.2));
      p.tailPhase += dt * 1.7;
    }
    for (const fish of game.fishes) fish.update(dt * 0.55, game.clock, null);
    updateEffects(dt);
    syncHUD();
    game.endTimer -= dt;
    if (game.endTimer <= 0) finishEndScreen();
  }

  function update(dt) {
    game.clock += dt;
    if (game.mode !== 'paused') ocean.update(dt);

    if (game.mode === 'menu') {
      updateMenu(dt);
    } else if (game.mode === 'playing') {
      updatePlaying(dt);
    } else if (game.mode === 'ending') {
      updateEnding(dt);
    } else if (game.mode === 'gameover' || game.mode === 'victory') {
      updateEffects(dt * 0.55);
    }

    game.shake = Math.max(0, game.shake - dt * 32);
    game.flash = Math.max(0, game.flash - dt * 2.2);
    game.hurtFlash = Math.max(0, game.hurtFlash - dt * 2);

    if (game.mode === 'playing' || game.mode === 'paused' || game.mode === 'ending') syncHUD();
  }

  function loop(now) {
    const raw = game.lastFrame ? (now - game.lastFrame) / 1000 : 0.016;
    const dt = clamp(raw, 0, 1 / 28);
    game.lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  /* ---------- input ---------- */
  function resetPointerState() {
    input.keys.clear();
    input.touch.active = false;
    input.mouse.active = false;
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

    window.addEventListener('keydown', (event) => {
      const code = event.code;
      const gameKey = [
        'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'KeyW', 'KeyA', 'KeyS', 'KeyD',
      ].includes(code);
      if (gameKey) event.preventDefault();

      if (code === 'Escape' || code === 'KeyP') {
        event.preventDefault();
        if (game.mode === 'playing') togglePause(true);
        else if (game.mode === 'paused') togglePause(false);
        else if (game.mode === 'gameover' || game.mode === 'victory') goMenu();
        return;
      }

      if (code === 'KeyM') {
        event.preventDefault();
        sound.toggle();
        return;
      }

      if (code === 'Enter') {
        event.preventDefault();
        if (game.mode === 'menu') startGame();
        else if (game.mode === 'paused') togglePause(false);
        else if (game.mode === 'gameover' || game.mode === 'victory') startGame();
        return;
      }

      if (code === 'Space') {
        if (!event.repeat && game.mode === 'playing') doDash();
        return;
      }

      if (game.mode !== 'playing') return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        input.keys.add(code);
      }
    });

    window.addEventListener('keyup', (event) => {
      input.keys.delete(event.code);
    });

    window.addEventListener('blur', () => {
      input.keys.clear();
      input.touch.active = false;
      if (game.mode === 'playing') togglePause(true);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.mode === 'playing') togglePause(true);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse') {
        const rect = canvas.getBoundingClientRect();
        input.mouse.x = event.clientX - rect.left;
        input.mouse.y = event.clientY - rect.top;
        if (game.mode === 'playing') input.mouse.active = true;
      } else if (event.pointerType === 'touch' && input.touch.active && event.pointerId === input.touch.id) {
        updateJoystick(event);
      }
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (game.mode !== 'playing') return;
      if (event.pointerType === 'mouse') {
        const rect = canvas.getBoundingClientRect();
        input.mouse.x = event.clientX - rect.left;
        input.mouse.y = event.clientY - rect.top;
        input.mouse.active = true;
        try {
          canvas.focus({ preventScroll: true });
        } catch (err) { /* the canvas may not be focusable in older engines */ }
        return;
      }
      if (event.pointerType === 'touch') {
        if (input.touch.active) return;
        input.touch.active = true;
        input.touch.id = event.pointerId;
        input.touch.baseX = event.clientX;
        input.touch.baseY = event.clientY;
        input.touch.dx = 0;
        input.touch.dy = 0;
        input.touch.mag = 0;
        input.mouse.active = false;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (err) { /* ignore */ }
        event.preventDefault();
      }
    });

    function endTouch(event) {
      if (!input.touch.active) return;
      if (event && event.pointerId !== undefined && event.pointerId !== input.touch.id) return;
      input.touch.active = false;
      input.touch.id = null;
      input.touch.mag = 0;
    }

    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);
    window.addEventListener('pointerup', endTouch);

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    els.startBtn.addEventListener('click', startGame);
    els.pauseBtn.addEventListener('click', () => togglePause());
    els.resumeBtn.addEventListener('click', () => togglePause(false));
    els.restartPauseBtn.addEventListener('click', startGame);
    els.menuPauseBtn.addEventListener('click', goMenu);
    els.replayBtn.addEventListener('click', startGame);
    els.menuEndBtn.addEventListener('click', goMenu);
    els.soundBtn.addEventListener('click', () => sound.toggle());

    els.dashBtn.addEventListener('click', (event) => {
      event.preventDefault();
      doDash();
    });

    els.dashBtn.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') {
        event.preventDefault();
        doDash();
      }
    });
  }

  function updateJoystick(event) {
    const dx = event.clientX - input.touch.baseX;
    const dy = event.clientY - input.touch.baseY;
    const distance = Math.hypot(dx, dy);
    const deadZone = 5;
    if (distance < deadZone) {
      input.touch.mag = 0;
      input.touch.dx = 0;
      input.touch.dy = 0;
      return;
    }
    input.touch.dx = dx / distance;
    input.touch.dy = dy / distance;
    input.touch.mag = clamp((distance - deadZone) / 48, 0, 1);
  }

  /* ---------- bootstrap ---------- */
  resize();
  setupMenu();
  applyTouchHints();
  updateSoundButton();
  bindEvents();
  requestAnimationFrame(loop);

  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__deepSea = {
      game,
      startGame,
      resetGame,
      togglePause,
      triggerVictory,
      triggerGameOver,
      finishEndScreen,
      showEndScreen: finishEndScreen,
      spawnFish,
      drawFish,
      computeTargetRadius,
      getState: () => ({
        mode: game.mode,
        score: game.score,
        eaten: game.eaten,
        lives: game.player ? game.player.lives : null,
        level: game.player ? game.player.levelIndex + 1 : null,
        xp: game.player ? game.player.xp : null,
        radius: game.player ? game.player.r : null,
        fish: game.fishes.length,
        particles: game.particles.length,
      }),
    };
  }
})();
