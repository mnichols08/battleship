const SHIPS = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
];

class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.sfxEnabled = false;
    this.musicEnabled = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.scale = [0, 3, 5, 7, 10, 12, 15];
    this.supported = !!(window.AudioContext || window.webkitAudioContext);
    this.backgroundPattern = null;
    this.backgroundNotes = [];
    this.backgroundSteps = 0;
    this.backgroundTempo = 750;
  }

  ensureContext() {
    if (!this.supported) {
      console.warn('Web Audio API is not supported in this browser.');
      return;
    }
    if (this.context) {
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioCtx();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.context.destination);

    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.masterGain);
  }

  async syncContextState() {
    if (!this.context) {
      return;
    }
    if (!this.sfxEnabled && !this.musicEnabled) {
      if (this.context.state === 'running') {
        await this.context.suspend();
      }
    } else if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  async enableSfx() {
    this.ensureContext();
    if (!this.context) {
      return;
    }
    this.sfxEnabled = true;
    await this.syncContextState();
    const now = this.context.currentTime;
    this.sfxGain.gain.cancelScheduledValues(now);
    this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
    this.sfxGain.gain.linearRampToValueAtTime(0.9, now + 0.1);
  }

  async disableSfx() {
    if (!this.context) {
      this.sfxEnabled = false;
      return;
    }
    this.sfxEnabled = false;
    const now = this.context.currentTime;
    this.sfxGain.gain.cancelScheduledValues(now);
    this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
    this.sfxGain.gain.linearRampToValueAtTime(0.0001, now + 0.15);
    await this.syncContextState();
  }

  async toggleMusic() {
    if (this.musicEnabled) {
      await this.stopMusic();
    } else {
      await this.startMusic();
    }
  }

  async startMusic() {
    this.ensureContext();
    if (!this.context || this.musicEnabled) {
      return;
    }
    this.musicEnabled = true;
    await this.syncContextState();
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0.35, now + 0.4);
    this.musicStep = 0;
    this.refreshMusicLoopTimer();
    this.playMusicStep();
  }

  async stopMusic() {
    if (!this.context || !this.musicEnabled) {
      this.musicEnabled = false;
      return;
    }
    this.musicEnabled = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    await this.syncContextState();
  }

  playMusicStep() {
    if (!this.context || !this.musicEnabled) {
      return;
    }
    const now = this.context.currentTime;
    const baseFreq = 196; // G3
    const degree = this.scale[this.musicStep % this.scale.length];
    const freq = baseFreq * 2 ** (degree / 12);
    const accent = this.musicStep % 8 === 0;
    this.spawnTone({
      frequencyStart: freq,
      frequencyEnd: freq * (accent ? 1.02 : 0.98),
      duration: accent ? 0.7 : 0.45,
      gainPeak: accent ? 0.55 : 0.35,
      type: accent ? 'sawtooth' : 'triangle',
      destination: this.musicGain,
    });

    if (accent) {
      const fifth = freq * 2 ** (7 / 12);
      const octave = freq * 2;
      this.spawnTone({
        frequencyStart: fifth,
        frequencyEnd: fifth,
        duration: 0.8,
        gainPeak: 0.25,
        type: 'sine',
        destination: this.musicGain,
      });
      this.spawnTone({
        frequencyStart: octave,
        frequencyEnd: octave,
        duration: 0.6,
        gainPeak: 0.18,
        type: 'triangle',
        destination: this.musicGain,
      });
    }

    if (Array.isArray(this.backgroundPattern) && this.backgroundPattern.length > 0) {
      const stepCount = this.backgroundSteps > 0 ? this.backgroundSteps : (this.backgroundPattern[0]?.length || 0);
      const patternStep = stepCount > 0 ? this.musicStep % stepCount : 0;
      const notes = Array.isArray(this.backgroundNotes) && this.backgroundNotes.length === this.backgroundPattern.length
        ? this.backgroundNotes
        : null;

      this.backgroundPattern.forEach((row, rowIdx) => {
        if (!row || !row[patternStep]) {
          return;
        }
        const note = notes && notes[rowIdx] ? notes[rowIdx] : { semitone: rowIdx * 2 };
        const semitone = typeof note.semitone === 'number' ? note.semitone : rowIdx * 2;
        const frequency = baseFreq * 2 ** (semitone / 12);
        const gainPeak = 0.22 + Math.min(rowIdx * 0.03, 0.12);
        this.spawnTone({
          frequencyStart: frequency,
          frequencyEnd: frequency * 1.01,
          duration: accent ? 0.65 : 0.5,
          gainPeak: Math.min(0.4, gainPeak),
          type: rowIdx % 2 === 0 ? 'triangle' : 'sine',
          destination: this.musicGain,
        });
      });
    }

    this.musicStep += 1;
  }

  playSfx(type) {
    if (!this.sfxEnabled) {
      return;
    }
    this.ensureContext();
    if (!this.context) {
      return;
    }
    const now = this.context.currentTime;
    switch (type) {
      case 'place':
        this.spawnTone({
          frequencyStart: 420,
          frequencyEnd: 620,
          duration: 0.18,
          gainPeak: 0.5,
          type: 'triangle',
        });
        break;
      case 'lock':
        this.spawnTone({
          frequencyStart: 320,
          frequencyEnd: 160,
          duration: 0.25,
          gainPeak: 0.55,
          type: 'sawtooth',
        });
        break;
      case 'fire':
        this.spawnTone({
          frequencyStart: 720,
          frequencyEnd: 180,
          duration: 0.35,
          gainPeak: 0.7,
          type: 'square',
        });
        break;
      case 'hit':
        this.spawnTone({
          frequencyStart: 200,
          frequencyEnd: 120,
          duration: 0.4,
          gainPeak: 0.65,
          type: 'square',
        });
        break;
      case 'sunk':
        this.spawnTone({
          frequencyStart: 160,
          frequencyEnd: 80,
          duration: 0.6,
          gainPeak: 0.7,
          type: 'sawtooth',
        });
        this.spawnTone({
          frequencyStart: 480,
          frequencyEnd: 240,
          duration: 0.55,
          gainPeak: 0.45,
          type: 'triangle',
          delay: 0.05,
        });
        break;
      case 'miss':
        this.spawnNoise({ duration: 0.25, gainPeak: 0.35 });
        break;
      case 'victory':
        this.spawnChord([392, 494, 587], 0.9, 0.55);
        break;
      case 'defeat':
        this.spawnTone({
          frequencyStart: 140,
          frequencyEnd: 70,
          duration: 0.8,
          gainPeak: 0.6,
          type: 'sawtooth',
        });
        break;
      case 'opponent':
        this.spawnTone({
          frequencyStart: 560,
          frequencyEnd: 640,
          duration: 0.2,
          gainPeak: 0.4,
          type: 'triangle',
        });
        break;
      case 'turn':
        this.spawnTone({
          frequencyStart: 500,
          frequencyEnd: 750,
          duration: 0.22,
          gainPeak: 0.5,
          type: 'triangle',
        });
        break;
      case 'alert':
        this.spawnTone({
          frequencyStart: 840,
          frequencyEnd: 600,
          duration: 0.4,
          gainPeak: 0.6,
          type: 'square',
        });
        break;
      case 'error':
        this.spawnTone({
          frequencyStart: 260,
          frequencyEnd: 120,
          duration: 0.3,
          gainPeak: 0.55,
          type: 'sawtooth',
        });
        break;
      case 'mode':
        this.spawnTone({
          frequencyStart: 480,
          frequencyEnd: 360,
          duration: 0.2,
          gainPeak: 0.45,
          type: 'triangle',
        });
        break;
      default:
        break;
    }
    this.syncContextState();
  }

  spawnTone({
    frequencyStart,
    frequencyEnd,
    duration,
    gainPeak,
    type,
    delay = 0,
    destination,
  }) {
    if (!this.context) {
      return;
    }
    const dest = destination || this.sfxGain;
    const now = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    osc.type = type || 'sine';
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.frequency.setValueAtTime(frequencyStart, now);
    osc.frequency.linearRampToValueAtTime(frequencyEnd, now + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  spawnNoise({ duration, gainPeak }) {
    if (!this.context) {
      return;
    }
    const bufferSize = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = this.context.createBufferSource();
    noise.buffer = buffer;
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);
    noise.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  spawnChord(frequencies, duration, gainPeak) {
    frequencies.forEach((frequency, index) => {
      this.spawnTone({
        frequencyStart: frequency,
        frequencyEnd: frequency,
        duration,
        gainPeak: gainPeak * (1 - index * 0.15),
        type: index === 0 ? 'triangle' : 'sine',
        destination: this.sfxGain,
      });
    });
  }

  setBackgroundPattern(config) {
    if (!config || !Array.isArray(config.pattern) || config.pattern.length === 0) {
      this.backgroundPattern = null;
      this.backgroundNotes = [];
      this.backgroundSteps = 0;
      this.backgroundTempo = 750;
      this.musicStep = 0;
      if (this.musicEnabled) {
        this.refreshMusicLoopTimer();
      }
      return;
    }

    const maxRows = Math.min(config.pattern.length, 16);
    const steps = Number.isInteger(config.steps) && config.steps > 0 ? Math.min(config.steps, 32) : (config.pattern[0]?.length || 8);
    const sanitizedPattern = Array.from({ length: maxRows }, (_, rowIdx) => {
      const row = Array.isArray(config.pattern[rowIdx]) ? config.pattern[rowIdx] : [];
      return Array.from({ length: steps }, (__, stepIdx) => !!row[stepIdx]);
    });

    const notes = Array.isArray(config.notes)
      ? sanitizedPattern.map((_, idx) => {
        const note = config.notes[idx] || {};
        return {
          label: typeof note.label === 'string' ? note.label : '',
          semitone: typeof note.semitone === 'number' ? note.semitone : idx * 2,
        };
      })
      : sanitizedPattern.map((_, idx) => ({ label: '', semitone: idx * 2 }));

    this.backgroundPattern = sanitizedPattern;
    this.backgroundNotes = notes;
    this.backgroundSteps = steps;
    const inferredTempo = typeof config.tempo === 'number' && Number.isFinite(config.tempo) ? config.tempo : 480;
    this.backgroundTempo = Math.min(1500, Math.max(180, inferredTempo));
    this.musicStep = 0;

    if (this.musicEnabled) {
      this.refreshMusicLoopTimer();
    }
  }

  refreshMusicLoopTimer() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (!this.musicEnabled) {
      return;
    }
    const interval = Math.min(1500, Math.max(180, this.backgroundTempo || 750));
    this.musicTimer = setInterval(() => {
      this.playMusicStep();
    }, interval);
  }
}

class BattleGrid extends HTMLElement {
  static get observedAttributes() {
    return ['mode', 'reveal-ships'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.cells = new Map();
  this.shipDecor = new Map();
  this.shipOverlays = new Map();
  this.shipSegments = new Map();
    this.mode = this.getAttribute('mode') || 'placement';
    this.revealShips = this.mode !== 'target';
    this.overlayLayer = null;
    this.resizeObserver = null;
    this.pendingOverlayPositionFrame = null;
    this.interactive = true;
    this.render();
  }

  attributeChangedCallback(name, _old, value) {
    if (name === 'mode') {
      this.mode = value;
      const revealAttr = this.getAttribute('reveal-ships');
      this.revealShips = revealAttr === null ? this.mode !== 'target' : revealAttr !== 'false';
      this.updateMode();
      this.updateOverlayVisibility();
    } else if (name === 'reveal-ships') {
      this.revealShips = value === null ? this.mode !== 'target' : value !== 'false';
      this.updateOverlayVisibility();
    }
  }

  connectedCallback() {
    this.updateMode();
    this.updateOverlayVisibility();
    this.updateOverlayPositions();
  }

  disconnectedCallback() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.pendingOverlayPositionFrame) {
      const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
      cancelFrame(this.pendingOverlayPositionFrame);
      this.pendingOverlayPositionFrame = null;
    }
  }

  render() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .grid-shell {
          position: relative;
          padding: 20px;
          border-radius: 18px;
          background: rgba(16, 33, 58, 0.65);
          box-shadow: inset 0 0 0 1px rgba(78, 220, 255, 0.12), 0 16px 40px rgba(0, 0, 0, 0.48);
          backdrop-filter: blur(10px);
          transition: transform 200ms ease;
        }
        :host([mode='target']) .grid-shell {
          background: rgba(20, 27, 48, 0.65);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(10, minmax(30px, 1fr));
          grid-template-rows: repeat(10, minmax(30px, 1fr));
          gap: 2px;
        }
        .grid-wrapper {
          position: relative;
        }
        .ship-overlays {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
        }
        .ship-overlay {
          position: absolute;
          pointer-events: none;
          --ship-hull-light: rgba(126, 178, 255, 0.94);
          --ship-hull-dark: rgba(27, 46, 86, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.2);
          border-radius: 26px;
          background:
            linear-gradient(165deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.18)),
            linear-gradient(135deg, var(--ship-hull-light), var(--ship-hull-dark));
          box-shadow:
            0 14px 32px rgba(0, 0, 0, 0.45),
            inset 0 0 0 1px rgba(255, 255, 255, 0.08);
          overflow: hidden;
          transition: transform 180ms ease, box-shadow 220ms ease, opacity 180ms ease, filter 220ms ease;
        }
        .ship-overlay.horizontal::before,
        .ship-overlay.vertical::before {
          content: '';
          position: absolute;
          inset: 8% 6%;
          border-radius: 22px;
          background:
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent 12px,
              var(--ship-stripe) 12px,
              var(--ship-stripe) 14px
            ),
            linear-gradient(120deg, rgba(255, 255, 255, 0.12), rgba(15, 21, 32, 0.32));
          box-shadow:
            inset 0 0 12px rgba(0, 0, 0, 0.35);
        }
        .ship-overlay.vertical::before {
          background:
            repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent 12px,
              var(--ship-stripe) 12px,
              var(--ship-stripe) 14px
            ),
            linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(15, 21, 32, 0.32));
        }
        .ship-overlay::after {
          content: '';
          position: absolute;
          inset: 14% 20%;
          border-radius: 999px;
          background: radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.22), transparent 60%);
          opacity: 0.85;
          pointer-events: none;
        }
        .ship-overlay.horizontal::after {
          inset: 16% 16%;
        }
        .ship-overlay.is-hidden {
          opacity: 0;
          transform: scale(0.96);
          filter: saturate(0.5);
        }
        .ship-overlay.ship-overlay-damaged {
          filter: saturate(1.2) brightness(1.05);
          box-shadow:
            0 18px 36px rgba(0, 0, 0, 0.55),
            inset 0 0 0 1px rgba(255, 117, 140, 0.45);
        }
        .ship-overlay.ship-overlay-destroyed {
          filter: grayscale(0.55) brightness(0.8);
          box-shadow:
            0 12px 26px rgba(0, 0, 0, 0.55),
            inset 0 0 0 1px rgba(0, 0, 0, 0.55);
        }
        .ship-overlay-hit {
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 45% 40%, rgba(255, 220, 156, 0.85), rgba(152, 48, 42, 0.75) 55%, rgba(103, 22, 20, 0.95));
          box-shadow: 0 0 18px rgba(255, 136, 98, 0.55);
          transform: translate(-50%, -50%);
        }
        .ship-overlay.ship-overlay-destroyed .ship-overlay-hit {
          background:
            radial-gradient(circle at 50% 45%, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.4) 60%, rgba(24, 24, 24, 0.6));
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.75);
        }
        .cell {
          position: relative;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(78, 220, 255, 0.05);
          cursor: pointer;
          transition: background 160ms ease, transform 120ms ease, border 160ms ease, box-shadow 160ms ease, filter 180ms ease;
        }
        :host(.disabled) .cell {
          cursor: not-allowed;
        }
        .cell::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease, background 200ms ease;
        }
        .cell.ship,
        .cell.hit,
        .cell.sunk {
          background: rgba(18, 36, 58, 0.7);
          border-color: rgba(78, 220, 255, 0.28);
          box-shadow: inset 0 0 0 1px rgba(78, 220, 255, 0.12);
        }
        :host([mode='target']) .cell.ship,
        :host([mode='target']) .cell.hit,
        :host([mode='target']) .cell.sunk {
          background: rgba(16, 28, 46, 0.6);
          border-color: rgba(78, 220, 255, 0.16);
        }
        .cell.miss {
          background: rgba(132, 188, 255, 0.16);
          border-color: rgba(132, 188, 255, 0.3);
        }
        .cell.hit:not(.ship-segment) {
          background: rgba(255, 116, 140, 0.28);
          border-color: rgba(255, 140, 160, 0.55);
          box-shadow: 0 6px 20px rgba(255, 116, 140, 0.3);
        }
        .cell.hit:not(.ship-segment)::after {
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0));
          opacity: 0.7;
        }
        .cell.sunk:not(.ship-segment) {
          background: linear-gradient(135deg, rgba(255, 133, 153, 0.45), rgba(255, 255, 255, 0.12));
          border-color: rgba(255, 117, 140, 0.65);
          box-shadow: 0 0 20px rgba(255, 117, 140, 0.35);
        }
        .cell.sunk:not(.ship-segment)::after {
          background: radial-gradient(circle at center, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0));
          opacity: 0.6;
        }
        .cell.ship-segment {
          position: relative;
          --ship-hull-light: rgba(110, 142, 186, 0.96);
          --ship-hull-dark: rgba(36, 52, 76, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.14);
        }
        .cell.ship-segment::before {
          content: '';
          position: absolute;
          inset: 4px;
          border-radius: 10px;
          background:
            linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(15, 20, 30, 0.35)),
            linear-gradient(135deg, var(--ship-hull-light), var(--ship-hull-dark));
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.08),
            inset 0 10px 14px rgba(0, 0, 0, 0.35);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .cell.ship-horizontal.ship-segment::before {
          background:
            linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(15, 20, 30, 0.35)),
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent 10px,
              rgba(255, 255, 255, 0.07) 10px,
              rgba(255, 255, 255, 0.07) 13px
            ),
            linear-gradient(135deg, var(--ship-hull-light), var(--ship-hull-dark));
        }
        .cell.ship-vertical.ship-segment::before {
          background:
            linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(15, 20, 30, 0.35)),
            repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent 10px,
              rgba(255, 255, 255, 0.07) 10px,
              rgba(255, 255, 255, 0.07) 13px
            ),
            linear-gradient(135deg, var(--ship-hull-light), var(--ship-hull-dark));
        }
        .cell.ship-horizontal.ship-head::before {
          border-top-left-radius: 18px;
          border-bottom-left-radius: 18px;
        }
        .cell.ship-horizontal.ship-tail::before {
          border-top-right-radius: 18px;
          border-bottom-right-radius: 18px;
        }
        .cell.ship-vertical.ship-head::before {
          border-top-left-radius: 18px;
          border-top-right-radius: 18px;
        }
        .cell.ship-vertical.ship-tail::before {
          border-bottom-left-radius: 18px;
          border-bottom-right-radius: 18px;
        }
        .cell.ship-single::before {
          border-radius: 18px;
        }
        .cell.ship-segment::after {
          content: '';
          position: absolute;
          inset: 6px;
          border-radius: 8px;
          opacity: 0.85;
          background:
            radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.18), transparent 60%),
            linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0)),
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent 8px,
              rgba(255, 255, 255, 0.08) 8px,
              rgba(255, 255, 255, 0.08) 9px
            );
          pointer-events: none;
          transition: opacity 200ms ease, background 220ms ease;
        }
        .cell.ship-vertical.ship-segment::after {
          background:
            radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.18), transparent 65%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0)),
            repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent 8px,
              rgba(255, 255, 255, 0.08) 8px,
              rgba(255, 255, 255, 0.08) 9px
            );
        }
        .cell.ship-overlayed.ship-segment::before,
        .cell.ship-overlayed.ship-segment::after {
          display: none;
        }
        .cell.ship-overlayed.ship,
        .cell.ship-overlayed.sunk {
          background: rgba(10, 24, 40, 0.55);
          border-color: rgba(78, 220, 255, 0.2);
          box-shadow: inset 0 0 0 1px rgba(78, 220, 255, 0.08);
        }
        .cell.ship-type-carrier,
        .ship-overlay.ship-type-carrier {
          --ship-hull-light: rgba(126, 178, 255, 0.95);
          --ship-hull-dark: rgba(27, 46, 86, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.2);
        }
        .cell.ship-type-battleship,
        .ship-overlay.ship-type-battleship {
          --ship-hull-light: rgba(136, 164, 185, 0.95);
          --ship-hull-dark: rgba(44, 58, 74, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.16);
        }
        .cell.ship-type-cruiser,
        .ship-overlay.ship-type-cruiser {
          --ship-hull-light: rgba(116, 191, 206, 0.95);
          --ship-hull-dark: rgba(32, 70, 86, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.18);
        }
        .cell.ship-type-submarine,
        .ship-overlay.ship-type-submarine {
          --ship-hull-light: rgba(125, 140, 162, 0.95);
          --ship-hull-dark: rgba(28, 39, 54, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.12);
        }
        .cell.ship-type-destroyer,
        .ship-overlay.ship-type-destroyer {
          --ship-hull-light: rgba(186, 204, 214, 0.95);
          --ship-hull-dark: rgba(58, 84, 101, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.2);
        }
        .cell.ship-type-unknown,
        .ship-overlay.ship-type-unknown {
          --ship-hull-light: rgba(150, 168, 188, 0.95);
          --ship-hull-dark: rgba(54, 70, 92, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.14);
        }
        .cell.ship-type-target,
        .ship-overlay.ship-type-target {
          --ship-hull-light: rgba(165, 186, 210, 0.95);
          --ship-hull-dark: rgba(52, 71, 96, 0.95);
          --ship-stripe: rgba(255, 255, 255, 0.2);
        }
        .cell.ship-damaged::after {
          background:
            radial-gradient(circle at 45% 55%, rgba(255, 116, 80, 0.5), rgba(255, 116, 80, 0) 65%),
            radial-gradient(circle at 65% 40%, rgba(255, 236, 185, 0.55), rgba(255, 236, 185, 0) 70%),
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent 8px,
              rgba(255, 255, 255, 0.08) 8px,
              rgba(255, 255, 255, 0.08) 9px
            );
          opacity: 1;
          mix-blend-mode: screen;
        }
        .cell.ship-vertical.ship-damaged::after {
          background:
            radial-gradient(circle at 55% 45%, rgba(255, 116, 80, 0.5), rgba(255, 116, 80, 0) 65%),
            radial-gradient(circle at 30% 70%, rgba(255, 236, 185, 0.55), rgba(255, 236, 185, 0) 70%),
            repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent 8px,
              rgba(255, 255, 255, 0.08) 8px,
              rgba(255, 255, 255, 0.08) 9px
            );
        }
        .cell.ship-destroyed::before {
          background:
            linear-gradient(165deg, rgba(25, 26, 29, 0.9), rgba(8, 8, 10, 0.95));
          box-shadow:
            inset 0 0 0 1px rgba(0, 0, 0, 0.4),
            inset 0 0 16px rgba(0, 0, 0, 0.75);
        }
        .cell.ship-destroyed::after {
          background:
            radial-gradient(circle at 38% 58%, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.3) 55%, transparent 75%),
            radial-gradient(circle at 70% 42%, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.25) 55%, transparent 72%);
          opacity: 1;
        }
        .cell.ship-destroyed {
          border-color: rgba(255, 117, 140, 0.5);
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.4);
        }
        .cell:not(.ship-segment):hover::after {
          opacity: 0.12;
        }
        .grid-shell.disabled .cell {
          cursor: default;
          pointer-events: none;
          opacity: 0.88;
        }
        .labels {
          display: grid;
          grid-template-columns: repeat(10, minmax(30px, 1fr));
          gap: 2px;
          margin-bottom: 6px;
          color: rgba(255, 255, 255, 0.35);
          font-size: 13px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .labels.bottom {
          margin-top: 6px;
        }
        .legend {
          display: flex;
          gap: 8px;
          justify-content: space-between;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.45);
          margin-top: 12px;
        }
      </style>
        <div class="grid-shell">
        <div class="labels top">
          ${Array.from({ length: 10 }, (_, i) => `<span>${String.fromCharCode(65 + i)}</span>`).join('')}
        </div>
        <div class="grid-wrapper">
          <div class="grid" part="grid"></div>
          <div class="ship-overlays" part="ship-overlays"></div>
        </div>
        <div class="labels bottom">
          ${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}</span>`).join('')}
        </div>
      </div>
    `;

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.container = this.shadowRoot.querySelector('.grid-shell');
    this.gridElement = this.shadowRoot.querySelector('.grid');
    this.overlayLayer = this.shadowRoot.querySelector('.ship-overlays');

    if (typeof ResizeObserver !== 'undefined') {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      this.resizeObserver = new ResizeObserver(() => {
        this.updateOverlayPositions();
      });
      if (this.gridElement) {
        this.resizeObserver.observe(this.gridElement);
      }
    }

    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        this.gridElement.appendChild(cell);
        this.cells.set(`${x},${y}`, cell);
      }
    }

    this.gridElement.addEventListener('click', (event) => {
      if (!this.interactive) {
        return;
      }
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      this.dispatchEvent(
        new CustomEvent('cellclick', {
          detail: { x, y },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }

  updateMode() {
    if (!this.container) {
      return;
    }
    if (this.mode === 'target') {
      this.container.classList.add('target');
    } else {
      this.container.classList.remove('target');
    }
  }

  setInteractive(enabled) {
    this.interactive = enabled;
    if (enabled) {
      this.classList.remove('disabled');
      this.container.classList.remove('disabled');
    } else {
      this.classList.add('disabled');
      this.container.classList.add('disabled');
    }
  }

  clearShipOverlays() {
    if (this.overlayLayer) {
      this.overlayLayer.innerHTML = '';
    }
    this.shipOverlays.forEach((overlay) => {
      if (overlay && overlay.hitMarkers) {
        overlay.hitMarkers.forEach((marker) => marker.remove());
      }
    });
    this.shipOverlays.clear();
  }

  reset() {
    this.shipDecor.clear();
    this.clearShipOverlays();
    this.shipSegments.clear();
    const removable = [
      'ship',
      'hit',
      'miss',
      'sunk',
      'ship-segment',
      'ship-horizontal',
      'ship-vertical',
      'ship-head',
      'ship-tail',
      'ship-mid',
      'ship-single',
      'ship-damaged',
      'ship-destroyed',
      'ship-type-carrier',
      'ship-type-battleship',
      'ship-type-cruiser',
      'ship-type-submarine',
      'ship-type-destroyer',
      'ship-type-target',
      'ship-type-unknown',
      'ship-overlayed',
    ];
    this.cells.forEach((cell) => {
      cell.classList.remove(...removable);
      cell.removeAttribute('data-ship-type');
    });
  }

  setCellState(x, y, state) {
    const key = `${x},${y}`;
    const cell = this.cells.get(key);
    if (!cell) {
      return;
    }
    cell.classList.remove(
      'ship',
      'hit',
      'miss',
      'sunk',
      'ship-segment',
      'ship-horizontal',
      'ship-vertical',
      'ship-head',
      'ship-tail',
      'ship-mid',
      'ship-single',
      'ship-damaged',
      'ship-destroyed',
      'ship-type-carrier',
      'ship-type-battleship',
      'ship-type-cruiser',
      'ship-type-submarine',
      'ship-type-destroyer',
      'ship-type-target',
      'ship-type-unknown',
    );
    cell.removeAttribute('data-ship-type');

    if (!state || state === 'empty') {
      return;
    }

    cell.classList.add(state);

    if (['ship', 'hit', 'sunk'].includes(state)) {
      const info = this.shipDecor.get(key);
      if (info) {
        this.decorateCell(cell, info, state);
      } else if (state === 'hit') {
        this.decorateCell(
          cell,
          {
            orientation: 'horizontal',
            segment: 'single',
            shipType: 'target',
            shipKey: null,
            overlay: false,
          },
          state,
        );
      }
    }

    this.updateShipOverlayDamage(key, state);
  }

  paintShipCells(coordinates, shipName = '') {
    const segments = this.buildShipSegments(coordinates, shipName);
    if (!segments.length) {
      return;
    }
    const shipKey = segments[0].shipKey;
    this.shipSegments.set(shipKey, { segments, shipName });
    const overlayApplied = this.createOrUpdateShipOverlay(shipKey, segments, shipName, false);
    segments.forEach(({ point, key, orientation, segment, shipType, shipKey: segShipKey }) => {
      this.shipDecor.set(key, {
        orientation,
        segment,
        shipType,
        shipKey: segShipKey,
        overlay: overlayApplied,
        shipName,
      });
      this.setCellState(point.x, point.y, 'ship');
    });
  }

  markSunkShip(coordinates, shipName = '') {
    const segments = this.buildShipSegments(coordinates, shipName);
    if (!segments.length) {
      return;
    }
    const shipKey = segments[0].shipKey;
    this.shipSegments.set(shipKey, { segments, shipName });
    const overlayApplied = this.createOrUpdateShipOverlay(shipKey, segments, shipName, true);
    segments.forEach(({ point, key, orientation, segment, shipType, shipKey: segShipKey }) => {
      this.shipDecor.set(key, {
        orientation,
        segment,
        shipType,
        shipKey: segShipKey,
        overlay: overlayApplied,
        shipName,
      });
      this.setCellState(point.x, point.y, 'sunk');
    });
  }

  buildShipSegments(coordinates, shipName) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return [];
    }
    const normalizedType = this.normalizeShipName(shipName);
    const orientation = coordinates.length === 1
      ? 'horizontal'
      : coordinates.every((pt) => pt.y === coordinates[0].y)
        ? 'horizontal'
        : 'vertical';
    const sorted = [...coordinates].sort((a, b) => (orientation === 'horizontal' ? a.x - b.x : a.y - b.y));
    const shipKey = sorted.map((point) => `${point.x},${point.y}`).join('|');
    return sorted.map((point, index) => {
      let segment = 'single';
      if (sorted.length > 1) {
        if (index === 0) {
          segment = 'head';
        } else if (index === sorted.length - 1) {
          segment = 'tail';
        } else {
          segment = 'mid';
        }
      }
      return {
        point,
        key: `${point.x},${point.y}`,
        orientation,
        segment,
        shipType: normalizedType,
        shipKey,
      };
    });
  }

  decorateCell(cell, info, state) {
    cell.classList.add('ship', 'ship-segment');
    cell.classList.add(info.orientation === 'vertical' ? 'ship-vertical' : 'ship-horizontal');
    cell.classList.add(`ship-${info.segment}`);

    const shipType = info.shipType || 'unknown';
    cell.classList.add(`ship-type-${shipType}`);
    cell.dataset.shipType = shipType;

    if (info.overlay) {
      cell.classList.add('ship-overlayed');
    } else {
      cell.classList.remove('ship-overlayed');
    }

    cell.classList.toggle('ship-damaged', state === 'hit');
    cell.classList.toggle('ship-destroyed', state === 'sunk');
    if (state === 'ship') {
      cell.classList.remove('ship-damaged', 'ship-destroyed');
    }
  }

  createOrUpdateShipOverlay(shipKey, segments, shipName, forceReveal = false) {
    if (!shipKey || !Array.isArray(segments) || segments.length === 0 || !this.overlayLayer) {
      return false;
    }

    const allowReveal = this.revealShips || forceReveal;
    if (!allowReveal) {
      return false;
    }

    const orientation = segments[0].orientation;
    const shipType = segments[0].shipType || 'unknown';

    let overlay = this.shipOverlays.get(shipKey);
    if (!overlay) {
      const element = document.createElement('div');
      element.classList.add('ship-overlay', orientation === 'vertical' ? 'vertical' : 'horizontal');
      element.dataset.shipType = shipType;
      if (shipName) {
        element.setAttribute('data-ship-name', shipName);
      }

      overlay = {
        key: shipKey,
        element,
        orientation,
        shipType,
        length: segments.length,
        cells: segments.map((seg) => seg.key),
        coordinates: segments.map((seg) => seg.point),
        hits: new Set(),
        hitMarkers: new Map(),
        segmentIndex: new Map(),
        revealed: forceReveal || this.revealShips,
        destroyed: false,
        shipName,
      };
      segments.forEach((seg, idx) => overlay.segmentIndex.set(seg.key, idx));
      this.shipOverlays.set(shipKey, overlay);
      this.overlayLayer.appendChild(element);
    } else {
      overlay.orientation = orientation;
      overlay.shipType = shipType;
      overlay.length = segments.length;
      overlay.cells = segments.map((seg) => seg.key);
      overlay.coordinates = segments.map((seg) => seg.point);
      overlay.revealed = overlay.revealed || forceReveal || this.revealShips;
      overlay.segmentIndex = new Map();
      segments.forEach((seg, idx) => overlay.segmentIndex.set(seg.key, idx));
      if (shipName) {
        overlay.element.setAttribute('data-ship-name', shipName);
      }
      overlay.shipName = shipName || overlay.shipName;
    }

    Array.from(overlay.element.classList)
      .filter((cls) => cls.startsWith('ship-type-'))
      .forEach((cls) => overlay.element.classList.remove(cls));
    overlay.element.classList.add(`ship-type-${overlay.shipType}`);
    overlay.element.dataset.shipType = overlay.shipType;

    overlay.element.classList.remove('horizontal', 'vertical');
    overlay.element.classList.add(overlay.orientation === 'vertical' ? 'vertical' : 'horizontal');

    if (overlay.destroyed) {
      overlay.element.classList.add('ship-overlay-destroyed');
    } else {
      overlay.element.classList.remove('ship-overlay-destroyed');
    }

    if (overlay.hits && overlay.hits.size > 0 && !overlay.destroyed) {
      overlay.element.classList.add('ship-overlay-damaged');
    } else if (!overlay.destroyed) {
      overlay.element.classList.remove('ship-overlay-damaged');
    }

    if (overlay.hitMarkers && overlay.hitMarkers.size > 0) {
      const length = overlay.length || overlay.cells.length || 1;
      const step = 100 / length;
      overlay.hitMarkers.forEach((marker, key) => {
        const index = overlay.segmentIndex?.get(key) ?? 0;
        if (overlay.orientation === 'vertical') {
          marker.style.left = '50%';
          marker.style.top = `${(index + 0.5) * step}%`;
        } else {
          marker.style.left = `${(index + 0.5) * step}%`;
          marker.style.top = '50%';
        }
      });
    }

    overlay.element.classList.toggle('is-hidden', !(overlay.revealed || this.revealShips));

    this.updateOverlayPositions();
    return true;
  }

  positionShipOverlay(overlay) {
    if (!overlay || !overlay.coordinates || overlay.coordinates.length === 0 || !this.gridElement) {
      return;
    }

    const xs = overlay.coordinates.map((pt) => pt.x);
    const ys = overlay.coordinates.map((pt) => pt.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const headCell = this.cells.get(`${minX},${minY}`);
    const tailCell = this.cells.get(`${maxX},${maxY}`);
    if (!headCell || !tailCell) {
      return;
    }

    const gridRect = this.gridElement.getBoundingClientRect();
    const headRect = headCell.getBoundingClientRect();
    const tailRect = tailCell.getBoundingClientRect();

    const pad = 1.5;
    const left = Math.max(0, headRect.left - gridRect.left - pad);
    const top = Math.max(0, headRect.top - gridRect.top - pad);
    const right = Math.min(gridRect.width, tailRect.right - gridRect.left + pad);
    const bottom = Math.min(gridRect.height, tailRect.bottom - gridRect.top + pad);

    overlay.element.style.left = `${left}px`;
    overlay.element.style.top = `${top}px`;
    overlay.element.style.width = `${Math.max(0, right - left)}px`;
    overlay.element.style.height = `${Math.max(0, bottom - top)}px`;
  }

  updateOverlayPositions() {
    const scheduleFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 16);
    const cancelFrame = typeof cancelAnimationFrame === 'function'
      ? cancelAnimationFrame
      : clearTimeout;

    if (this.pendingOverlayPositionFrame) {
      cancelFrame(this.pendingOverlayPositionFrame);
    }
    this.pendingOverlayPositionFrame = scheduleFrame(() => {
      this.pendingOverlayPositionFrame = null;
      this.shipOverlays.forEach((overlay) => {
        this.positionShipOverlay(overlay);
      });
    });
  }

  updateOverlayVisibility() {
    if (this.revealShips) {
      this.ensureShipOverlaysForReveal();
    }
    if (this.shipOverlays.size === 0) {
      return;
    }
    this.shipOverlays.forEach((overlay) => {
      const shouldShow = overlay.revealed || this.revealShips;
      overlay.element.classList.toggle('is-hidden', !shouldShow);
    });
  }

  ensureShipOverlaysForReveal() {
    if (!this.overlayLayer || !this.revealShips || this.shipSegments.size === 0) {
      return;
    }
    this.shipSegments.forEach(({ segments, shipName }, shipKey) => {
      if (!this.shipOverlays.has(shipKey)) {
        const created = this.createOrUpdateShipOverlay(shipKey, segments, shipName, false);
        if (created) {
          segments.forEach((segment) => {
            const info = this.shipDecor.get(segment.key);
            if (info) {
              const updated = {
                ...info,
                overlay: true,
              };
              this.shipDecor.set(segment.key, updated);
              const cell = this.cells.get(segment.key);
              if (cell) {
                this.decorateCell(cell, updated, 'ship');
              }
            }
          });
        }
      }
    });
  }

  updateShipOverlayDamage(cellKey, state) {
    if (!cellKey) {
      return;
    }
    const info = this.shipDecor.get(cellKey);
    if (!info || !info.shipKey) {
      return;
    }
    const overlay = this.shipOverlays.get(info.shipKey);
    if (!overlay) {
      return;
    }

    if (state === 'ship') {
      if (overlay.hitMarkers && overlay.hitMarkers.has(cellKey)) {
        const marker = overlay.hitMarkers.get(cellKey);
        if (marker) {
          marker.remove();
        }
        overlay.hitMarkers.delete(cellKey);
      }
      if (overlay.hits) {
        overlay.hits.delete(cellKey);
        if (overlay.hits.size === 0) {
          overlay.element.classList.remove('ship-overlay-damaged');
        }
      }
      return;
    }

    if (!overlay.hitMarkers) {
      overlay.hitMarkers = new Map();
    }
    if (!overlay.hits) {
      overlay.hits = new Set();
    }

    if (!overlay.hitMarkers.has(cellKey)) {
      const marker = document.createElement('span');
      marker.classList.add('ship-overlay-hit');
      const index = overlay.segmentIndex?.get(cellKey) ?? 0;
      const length = overlay.length || overlay.cells.length || 1;
      const step = 100 / length;
      if (overlay.orientation === 'vertical') {
        marker.style.left = '50%';
        marker.style.top = `${(index + 0.5) * step}%`;
      } else {
        marker.style.left = `${(index + 0.5) * step}%`;
        marker.style.top = '50%';
      }
      overlay.element.appendChild(marker);
      overlay.hitMarkers.set(cellKey, marker);
    }

    overlay.hits.add(cellKey);
    overlay.element.classList.add('ship-overlay-damaged');

    if (state === 'sunk') {
      overlay.destroyed = true;
      overlay.element.classList.add('ship-overlay-destroyed');
    }

    overlay.revealed = overlay.revealed || this.revealShips || state === 'sunk';
    this.updateOverlayVisibility();
  }

  normalizeShipName(name) {
    if (!name || typeof name !== 'string') {
      return 'unknown';
    }
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  }
}

customElements.define('battle-grid', BattleGrid);

class GameApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = 'connecting';
    this.playerNumber = null;
    this.isMyTurn = false;
    this.layoutLocked = false;
    this.opponentReady = false;
    this.opponentConnected = false;
    this.gameEnded = false;
    this.placedShips = [];
    this.occupiedCells = new Set();
    this.currentShipIndex = 0;
    this.orientation = 'horizontal';
    this.shotsTaken = new Set();
    this.ws = null;
    this.logLimit = 80;
    this.mode = null;
    this.localGame = null;
    this.localTimers = new Set();
    this.audio = new AudioEngine();
    this.lobbyRooms = [];
    this.currentRoom = null;
    this.waitingForOpponent = false;
    this.musicLab = this.createMusicLabState();
    this.sudoku = this.createSudokuState();
    this.profile = this.createProfileState();
    this.profileMessageTimer = null;
    this.pendingProfileName = null;
    this.leaderboards = this.createLeaderboardState();
    this.pendingSoloResult = null;
    this.soloResultReported = false;
    this.chat = this.createChatState();
    this.handleSudokuKeypadClick = this.handleSudokuKeypadClick.bind(this);
    this.handleSudokuBoardClick = this.handleSudokuBoardClick.bind(this);
    this.handleSudokuOverlayKeydown = this.handleSudokuOverlayKeydown.bind(this);
    this.musicShareTimer = null;
    this.musicShareEcho = new Map();
    this.lastSharedMusic = null;
    this.render();
  }

  applyMusicLabPatternToBackground(options = {}) {
    if (!this.audio || !this.audio.supported) {
      return;
    }
    const lab = this.musicLab;
    const pattern = options.pattern || (lab ? lab.pattern : null);
    if (!pattern || !Array.isArray(pattern)) {
      this.audio.setBackgroundPattern(null);
      return;
    }
    const steps = options.steps || (lab ? lab.steps : undefined);
    const notes = options.notes || (lab ? lab.notes : undefined);
    const tempo = options.tempo || (lab ? lab.tempo : undefined);
    this.audio.setBackgroundPattern({ pattern, steps, notes, tempo });
  }

  scheduleMusicLabBroadcast(reason = 'update') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.mode !== 'pvp' || this.state !== 'lobby') {
      return;
    }
    if (this.musicShareTimer) {
      clearTimeout(this.musicShareTimer);
    }
    this.musicShareTimer = setTimeout(() => {
      this.musicShareTimer = null;
      this.broadcastMusicLabPattern(reason);
    }, 320);
  }

  broadcastMusicLabPattern(reason = 'update') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.musicLab) {
      return;
    }
    const { pattern, steps, notes, tempo } = this.musicLab;
    if (!Array.isArray(pattern)) {
      return;
    }
    const shareId = this.generateMusicShareId();
    this.musicShareEcho.set(shareId, Date.now());
    this.pruneMusicShareEcho();
    this.send({
      type: 'musicLabShare',
      pattern: pattern.map((row) => row.map((value) => !!value)),
      steps,
      notes: Array.isArray(notes) ? notes.map((note) => ({
        label: note.label,
        semitone: note.semitone,
      })) : [],
      tempo,
      reason,
      shareId,
      activeCount: pattern.reduce((sum, row) => sum + row.filter(Boolean).length, 0),
    });
  }

  generateMusicShareId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  pruneMusicShareEcho() {
    const now = Date.now();
    this.musicShareEcho.forEach((timestamp, key) => {
      if (now - timestamp > 15000) {
        this.musicShareEcho.delete(key);
      }
    });
  }

  handleIncomingMusicPattern(data, options = {}) {
    if (!data) {
      this.applyMusicLabPatternToBackground({ pattern: null });
      return;
    }

    if (data.shareId && this.musicShareEcho.has(data.shareId)) {
      this.musicShareEcho.delete(data.shareId);
      this.applyMusicLabPatternToBackground({
        pattern: this.convertPatternForLab(data.pattern),
        steps: this.musicLab ? this.musicLab.steps : data.steps,
        notes: data.notes,
        tempo: data.tempo,
      });
      return;
    }

    const hasPattern = Array.isArray(data.pattern) && data.pattern.length > 0;
    if (!hasPattern) {
      this.applyMusicLabPatternToBackground({ pattern: null });
      const lab = this.musicLab;
      if (lab) {
        lab.pattern = this.convertPatternForLab([]);
        this.refreshMusicPadStates();
        if (lab.open) {
          this.updateMusicLabInfo('Lobby groove cleared. Compose a new sequence.');
        }
      }
      if (this.musicLabBtn) {
        this.musicLabBtn.classList.remove('attention');
      }
      if (!options.silent) {
        this.addLog('Lobby groove cleared.', 'info');
      }
      this.lastSharedMusic = null;
      return;
    }

    const sanitizedPattern = this.convertPatternForLab(data.pattern);
    this.applyMusicLabPatternToBackground({
      pattern: sanitizedPattern,
      steps: this.musicLab ? this.musicLab.steps : data.steps,
      notes: data.notes,
      tempo: data.tempo,
    });

    const lab = this.musicLab;
    if (lab) {
      lab.pattern = sanitizedPattern;
      if (Number.isFinite(data.tempo)) {
        lab.tempo = Math.max(120, Math.min(1000, data.tempo));
      }
      this.refreshMusicPadStates();
      if (lab.open) {
        this.updateMusicLabInfo(`Lobby groove synced from ${data.author || 'ally commander'}.`);
      } else if (this.musicInfo && (this.musicInfo.textContent || '').length === 0) {
        this.updateMusicLabInfo(`Lobby groove set by ${data.author || 'ally commander'}. Press Play to hear it.`);
      }
    }

    if (this.musicLabBtn) {
      this.musicLabBtn.classList.add('attention');
    }

    if (!options.silent) {
      this.addLog(`Lobby music updated by ${data.author || 'another commander'}.`, 'info');
    }
    this.lastSharedMusic = data;
  }

  convertPatternForLab(pattern) {
    const lab = this.musicLab;
    const rowCount = lab ? lab.notes.length : Array.isArray(pattern) ? pattern.length : 0;
    const steps = lab ? lab.steps : 8;
    if (!Array.isArray(pattern) || rowCount === 0) {
      return Array.from({ length: rowCount }, () => Array(steps).fill(false));
    }
    return Array.from({ length: rowCount }, (_, rowIdx) => {
      const row = Array.isArray(pattern[rowIdx]) ? pattern[rowIdx] : [];
      return Array.from({ length: steps }, (__, stepIdx) => !!row[stepIdx]);
    });
  }

  handleMusicLabPatternChanged({ reason = 'update', broadcast = true } = {}) {
    this.applyMusicLabPatternToBackground();
    if (broadcast) {
      this.scheduleMusicLabBroadcast(reason);
    }
    if (this.musicLabBtn) {
      this.musicLabBtn.classList.remove('attention');
    }
  }

  connectedCallback() {
    this.bindElements();
    this.showModeOverlay();
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    }
    if (!this.hasCommanderName()) {
      this.promptCommanderName({ focus: true, message: 'Enter your commander name to begin chatting.' });
    }
    this.updateStatus();
  }

  render() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        :host {
          display: block;
          width: min(1040px, 100vw);
        }
        .shell {
          display: grid;
          gap: 24px;
          background: rgba(12, 20, 36, 0.65);
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 22px 60px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(92, 159, 255, 0.1);
          backdrop-filter: blur(14px);
        }
        header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        header h1 {
          font-size: 26px;
          letter-spacing: 0.5px;
        }
        .header-tools {
          display: grid;
          justify-items: end;
          gap: 10px;
        }
        .profile-controls {
          display: grid;
          gap: 6px;
          justify-items: end;
        }
        .profile-bar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 10px;
        }
        .name-form {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .name-form label {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .name-form input {
          width: min(200px, 45vw);
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgba(78, 220, 255, 0.25);
          background: rgba(8, 16, 28, 0.85);
          color: var(--text-primary);
        }
        .name-form input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .name-form button {
          min-width: 70px;
          padding: 8px 14px;
        }
        .name-status {
          font-size: 12px;
          min-height: 18px;
          color: var(--text-secondary);
        }
        .name-status.success {
          color: rgba(79, 255, 171, 0.85);
        }
        .name-status.error {
          color: rgba(255, 103, 133, 0.85);
        }
        .status-line {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          color: var(--text-secondary);
        }
        .audio-controls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .audio-controls button {
          min-width: 120px;
        }
        .header-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
        }
        .header-buttons button {
          min-width: 110px;
        }
        .header-buttons button.attention {
          box-shadow: 0 0 0 2px rgba(78, 220, 255, 0.4), 0 0 20px rgba(78, 220, 255, 0.45);
        }
        .boards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 24px;
        }
        .board-panel {
          background: rgba(8, 14, 24, 0.55);
          padding: 18px;
          border-radius: 20px;
          box-shadow: inset 0 0 0 1px rgba(78, 220, 255, 0.07);
          display: grid;
          gap: 16px;
        }
        .board-panel h2 {
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .legend {
          display: grid;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .legend span {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .key {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          display: inline-block;
        }
        .key.ship {
          background: rgba(78, 220, 255, 0.4);
        }
        .key.hit {
          background: rgba(255, 117, 140, 0.65);
        }
        .key.miss {
          background: rgba(132, 188, 255, 0.45);
        }
        .log {
          max-height: 220px;
          overflow-y: auto;
          display: grid;
          gap: 6px;
          padding-right: 6px;
        }
        .log::-webkit-scrollbar {
          width: 6px;
        }
        .log::-webkit-scrollbar-thumb {
          background: rgba(78, 220, 255, 0.3);
          border-radius: 8px;
        }
        .log-entry {
          font-size: 13px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(20, 30, 48, 0.45);
          border-left: 3px solid rgba(78, 220, 255, 0.4);
        }
        .chat-panel {
          position: fixed;
          right: 28px;
          bottom: 28px;
          width: min(320px, calc(100vw - 36px));
          background: rgba(12, 22, 38, 0.92);
          border-radius: 18px;
          padding: 16px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 12px;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(78, 220, 255, 0.14);
          z-index: 980;
        }
        .chat-panel[hidden] {
          display: none;
        }
        .chat-panel.collapsed {
          grid-template-rows: auto;
          padding-bottom: 12px;
        }
        .chat-panel.collapsed .chat-messages,
        .chat-panel.collapsed .chat-form {
          display: none;
        }
        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .chat-title-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .chat-title-group h3 {
          margin: 0;
          font-size: 15px;
          letter-spacing: 0.3px;
        }
        .chat-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .chat-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .chat-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(79, 255, 171, 0.7);
          box-shadow: 0 0 10px rgba(79, 255, 171, 0.4);
        }
        .chat-status-dot.offline {
          background: rgba(255, 103, 133, 0.7);
          box-shadow: 0 0 10px rgba(255, 103, 133, 0.4);
        }
        .chat-status-dot.idle {
          background: rgba(255, 193, 84, 0.75);
          box-shadow: 0 0 10px rgba(255, 193, 84, 0.45);
        }
        #chatToggleBtn {
          padding: 6px 10px;
          border-radius: 10px;
          background: rgba(20, 34, 56, 0.85);
          border: 1px solid rgba(78, 220, 255, 0.2);
          font-size: 13px;
          min-width: 0;
        }
        .chat-messages {
          max-height: 260px;
          overflow-y: auto;
          display: grid;
          gap: 8px;
          padding-right: 4px;
        }
        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }
        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(78, 220, 255, 0.28);
          border-radius: 8px;
        }
        .chat-message {
          display: grid;
          gap: 4px;
          font-size: 13px;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(16, 28, 46, 0.72);
          border-left: 3px solid rgba(78, 220, 255, 0.38);
        }
        .chat-meta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 11px;
          letter-spacing: 0.4px;
          color: rgba(200, 219, 255, 0.6);
          text-transform: uppercase;
        }
        .chat-author {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
        }
        .chat-text {
          color: rgba(233, 242, 255, 0.92);
          word-break: break-word;
        }
        .chat-form {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .chat-form input {
          flex: 1;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(78, 220, 255, 0.24);
          background: rgba(8, 16, 28, 0.85);
          color: var(--text-primary);
          font-size: 13px;
        }
        .chat-form input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .chat-form button {
          min-width: 68px;
          padding: 9px 14px;
        }
        @media (max-width: 640px) {
          .chat-panel {
            left: 16px;
            right: 16px;
            width: auto;
            bottom: 16px;
          }
        }
        .log-entry.win {
          border-left-color: rgba(79, 255, 171, 0.6);
        }
        .log-entry.lose,
        .log-entry.error {
          border-left-color: rgba(255, 103, 133, 0.6);
        }
        .actions {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .inline-info {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .mode-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 10, 18, 0.86);
          display: grid;
          place-items: center;
          z-index: 999;
          backdrop-filter: blur(20px);
        }
        .mode-overlay[hidden] {
          display: none;
        }
        .mode-dialog {
          background: rgba(12, 22, 38, 0.9);
          border-radius: 24px;
          padding: 32px;
          width: min(420px, 90vw);
          display: grid;
          gap: 18px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(78, 220, 255, 0.18);
          text-align: center;
        }
        .mode-dialog h2 {
          margin: 0;
          font-size: 22px;
        }
        .mode-dialog p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
        }
        .mode-options {
          display: grid;
          gap: 12px;
        }
        .mode-options button {
          padding: 14px 18px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(78, 220, 255, 0.4), rgba(78, 220, 255, 0.18));
          font-size: 16px;
        }
        .mode-options button.secondary {
          background: linear-gradient(135deg, rgba(132, 188, 255, 0.35), rgba(78, 220, 255, 0.12));
        }
        .leaderboard-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 10, 18, 0.88);
          display: grid;
          place-items: center;
          backdrop-filter: blur(20px);
          z-index: 994;
        }
        .leaderboard-overlay[hidden] {
          display: none;
        }
        .leaderboard-panel {
          width: min(540px, 92vw);
          background: rgba(12, 22, 38, 0.95);
          border-radius: 24px;
          padding: 28px;
          display: grid;
          gap: 18px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(78, 220, 255, 0.16);
        }
        .leaderboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .leaderboard-header h2 {
          margin: 0;
          font-size: 22px;
        }
        .leaderboard-content {
          display: grid;
          gap: 20px;
        }
        .leaderboard-section h3 {
          margin: 0 0 8px;
          font-size: 16px;
        }
        .leaderboard-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .leaderboard-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(16, 28, 46, 0.68);
          border: 1px solid rgba(78, 220, 255, 0.14);
          font-size: 13px;
        }
        .leaderboard-item .identity {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }
        .leaderboard-item .rank {
          width: 24px;
          text-align: right;
          color: rgba(78, 220, 255, 0.85);
          font-family: 'JetBrains Mono', monospace;
        }
        .leaderboard-item .name {
          color: rgba(233, 242, 255, 0.92);
        }
        .leaderboard-item .metrics {
          display: flex;
          gap: 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: rgba(200, 219, 255, 0.78);
        }
        .leaderboard-empty {
          text-align: center;
          font-size: 13px;
          color: var(--text-secondary);
          padding: 12px;
          border-radius: 12px;
          background: rgba(16, 28, 46, 0.6);
          border: 1px solid rgba(78, 220, 255, 0.12);
        }
        .lobby-overlay {
          position: fixed;
          inset: 0;
          background: rgba(6, 12, 22, 0.88);
          display: grid;
          place-items: center;
          z-index: 990;
          backdrop-filter: blur(18px);
        }
        .lobby-overlay[hidden] {
          display: none;
        }
        .lobby-panel {
          width: min(520px, 92vw);
          background: rgba(12, 22, 38, 0.92);
          border-radius: 24px;
          padding: 28px;
          display: grid;
          gap: 16px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(78, 220, 255, 0.16);
        }
        .lobby-panel h2 {
          margin: 0;
          font-size: 22px;
        }
        .lobby-create {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .lobby-create input {
          flex: 1;
          min-width: 180px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(78, 220, 255, 0.25);
          background: rgba(8, 16, 28, 0.8);
          color: var(--text-primary);
        }
        .lobby-create button {
          min-width: 130px;
        }
        .lobby-refresh {
          justify-self: flex-start;
        }
        .lobby-list {
          display: grid;
          gap: 12px;
          max-height: 280px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .lobby-list::-webkit-scrollbar {
          width: 6px;
        }
        .lobby-list::-webkit-scrollbar-thumb {
          background: rgba(78, 220, 255, 0.3);
          border-radius: 8px;
        }
        .lobby-room {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(16, 28, 46, 0.65);
          border: 1px solid rgba(78, 220, 255, 0.12);
          gap: 16px;
        }
        .lobby-room.active {
          border-color: rgba(78, 220, 255, 0.35);
          box-shadow: 0 0 12px rgba(78, 220, 255, 0.2);
        }
        .lobby-room h3 {
          margin: 0;
          font-size: 16px;
        }
        .lobby-room small {
          color: var(--text-secondary);
          display: block;
          margin-top: 4px;
        }
        .lobby-room button {
          min-width: 88px;
        }
        .lobby-empty {
          text-align: center;
          color: var(--text-secondary);
          font-size: 14px;
        }
        .lobby-info {
          font-size: 14px;
          color: var(--text-secondary);
          min-height: 20px;
        }
        .music-overlay {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          background: rgba(4, 10, 18, 0.88);
          backdrop-filter: blur(24px);
          z-index: 995;
        }
        .music-overlay[hidden] {
          display: none;
        }
        .music-panel {
          width: min(620px, 94vw);
          background: rgba(14, 26, 44, 0.94);
          border-radius: 28px;
          padding: 26px;
          display: grid;
          gap: 18px;
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(78, 220, 255, 0.16);
        }
        .music-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .music-panel-header h2 {
          margin: 0;
          font-size: 24px;
        }
        #closeMusicOverlayBtn {
          font-size: 20px;
          line-height: 1;
          padding: 8px 12px;
          background: rgba(20, 32, 52, 0.9);
          border: 1px solid rgba(78, 220, 255, 0.24);
          border-radius: 12px;
          width: 42px;
          height: 42px;
        }
        .music-description {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
        }
        .music-grid {
          display: grid;
          gap: 10px;
        }
        .music-row {
          display: grid;
          grid-template-columns: 60px repeat(8, minmax(42px, 1fr));
          gap: 8px;
          align-items: center;
        }
        .music-note-label {
          justify-self: end;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.62);
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .music-pad {
          position: relative;
          border-radius: 14px;
          border: 1px solid rgba(78, 220, 255, 0.14);
          background: rgba(25, 38, 60, 0.7);
          height: 44px;
          cursor: pointer;
          transition: transform 120ms ease, border 150ms ease, box-shadow 150ms ease, background 150ms ease;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.65);
          font-size: 13px;
        }
        .music-pad:hover {
          border-color: rgba(78, 220, 255, 0.45);
          transform: translateY(-1px);
        }
        .music-pad.active {
          background: linear-gradient(135deg, rgba(78, 220, 255, 0.5), rgba(132, 188, 255, 0.25));
          box-shadow: 0 8px 24px rgba(78, 220, 255, 0.18);
          border-color: rgba(78, 220, 255, 0.6);
          color: rgba(255, 255, 255, 0.85);
        }
        .music-pad.playing-step {
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18), 0 0 25px rgba(78, 220, 255, 0.35);
        }
        .music-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .music-controls button {
          flex: 1;
          min-width: 120px;
        }
        .music-info {
          font-size: 13px;
          min-height: 20px;
          color: var(--text-secondary);
        }
        .sudoku-overlay {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          background: rgba(4, 10, 18, 0.9);
          backdrop-filter: blur(26px);
          z-index: 994;
        }
        .sudoku-overlay[hidden] {
          display: none;
        }
        .sudoku-panel {
          width: min(520px, 90vw);
          background: rgba(14, 24, 40, 0.96);
          border-radius: 28px;
          padding: 26px;
          display: grid;
          gap: 18px;
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(78, 220, 255, 0.16);
        }
        .sudoku-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .sudoku-panel-header h2 {
          margin: 0;
          font-size: 24px;
        }
        #closeSudokuOverlayBtn {
          font-size: 20px;
          line-height: 1;
          padding: 8px 12px;
          background: rgba(20, 32, 52, 0.9);
          border: 1px solid rgba(78, 220, 255, 0.24);
          border-radius: 12px;
          width: 42px;
          height: 42px;
        }
        .sudoku-description {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
        }
        .sudoku-board {
          display: grid;
          grid-template-columns: repeat(9, minmax(36px, 1fr));
          gap: 4px;
          background: rgba(10, 18, 32, 0.9);
          padding: 12px;
          border-radius: 22px;
          box-shadow: inset 0 0 0 1px rgba(78, 220, 255, 0.18);
        }
        .sudoku-cell {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          border-radius: 10px;
          border: 1px solid rgba(78, 220, 255, 0.16);
          background: rgba(30, 44, 66, 0.72);
          color: rgba(255, 255, 255, 0.82);
          font-size: 18px;
          font-weight: 600;
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 140ms ease, border 160ms ease, background 160ms ease;
        }
        .sudoku-cell:hover {
          transform: translateY(-1px);
          border-color: rgba(78, 220, 255, 0.35);
        }
        .sudoku-cell.selected {
          box-shadow: 0 0 0 2px rgba(78, 220, 255, 0.5);
          border-color: rgba(78, 220, 255, 0.6);
        }
        .sudoku-cell.fixed {
          background: rgba(54, 74, 104, 0.9);
          border-color: rgba(78, 220, 255, 0.35);
          cursor: default;
        }
        .sudoku-cell.fixed:hover {
          transform: none;
        }
        .sudoku-cell.error {
          border-color: rgba(255, 99, 132, 0.7);
          box-shadow: 0 0 0 2px rgba(255, 99, 132, 0.45);
        }
        .sudoku-cell.conflict {
          background: rgba(255, 99, 132, 0.25);
          border-color: rgba(255, 99, 132, 0.45);
        }
        .sudoku-cell:nth-child(9n + 1) {
          margin-left: 0;
        }
        .sudoku-board .sudoku-cell[data-subgrid-left='true'] {
          border-left: 2px solid rgba(255, 255, 255, 0.18);
        }
        .sudoku-board .sudoku-cell[data-subgrid-top='true'] {
          border-top: 2px solid rgba(255, 255, 255, 0.18);
        }
        .sudoku-board .sudoku-cell[data-subgrid-right='true'] {
          border-right: 2px solid rgba(255, 255, 255, 0.18);
        }
        .sudoku-board .sudoku-cell[data-subgrid-bottom='true'] {
          border-bottom: 2px solid rgba(255, 255, 255, 0.18);
        }
        .sudoku-keypad {
          display: grid;
          grid-template-columns: repeat(5, minmax(60px, 1fr));
          gap: 10px;
        }
        .sudoku-keypad button {
          padding: 12px 0;
          border-radius: 14px;
          font-size: 16px;
        }
        .sudoku-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .sudoku-controls button {
          flex: 1;
          min-width: 130px;
        }
        .sudoku-info {
          min-height: 20px;
          font-size: 13px;
          color: var(--text-secondary);
        }
      </style>
      <div class="shell">
        <header>
          <h1>Battleship Arena</h1>
          <div class="header-tools">
            <div class="profile-controls">
              <div class="profile-bar">
                <form id="playerNameForm" class="name-form">
                  <label for="playerNameInput">Commander</label>
                  <input id="playerNameInput" type="text" maxlength="24" placeholder="Enter call sign" autocomplete="nickname" />
                  <button type="submit">Save</button>
                </form>
                <button id="leaderboardBtn" type="button">Leaderboards</button>
              </div>
              <span class="name-status" id="playerNameStatus" aria-live="polite"></span>
            </div>
            <div class="status-line" id="statusLine"></div>
            <div class="header-buttons">
              <button id="sudokuBtn" type="button">Sudoku</button>
              <button id="musicLabBtn" type="button">Music Lab</button>
              <button id="toggleLobbyBtn" type="button" hidden>Lobby</button>
              <button id="leaveRoomBtn" type="button" hidden>Leave Room</button>
              <div class="audio-controls">
                <button id="sfxToggleBtn">SFX: Off</button>
                <button id="musicToggleBtn">Music: Off</button>
              </div>
            </div>
          </div>
        </header>
        <section class="boards">
          <div class="board-panel">
            <h2>Your Fleet <span class="badge" id="placementBadge">Place ships</span></h2>
            <battle-grid id="ownGrid" mode="placement"></battle-grid>
            <div class="controls">
              <button id="orientationBtn">Orientation: Horizontal</button>
              <button id="randomBtn">Randomize Fleet</button>
              <button id="resetBtn">Reset</button>
              <button id="readyBtn">Lock In Fleet</button>
            </div>
            <div class="legend">
              <span><span class="key ship"></span> Placed ship segments</span>
              <span><span class="key hit"></span> Hits / sunk ships</span>
              <span><span class="key miss"></span> Missed shots</span>
            </div>
          </div>
          <div class="board-panel">
            <h2>Enemy Waters <span class="badge" id="opponentBadge">Waiting...</span></h2>
            <battle-grid id="targetGrid" mode="target"></battle-grid>
            <div class="inline-info" id="turnInfo">Take aim once the battle begins.</div>
          </div>
        </section>
        <section>
          <div class="actions">
            <button id="playAgainBtn" hidden>Play Again</button>
            <span class="inline-info" id="hintLine"></span>
          </div>
          <div class="log" id="logPanel"></div>
        </section>
        <aside class="chat-panel" id="chatPanel" hidden>
          <div class="chat-header">
            <div class="chat-title-group">
              <h3 id="chatTitle">Lobby Comms</h3>
              <span class="chat-subtitle" id="chatSubtitle">Chat with commanders in the lobby.</span>
            </div>
            <div class="chat-header-actions">
              <span class="chat-status-dot offline" id="chatStatusDot" aria-hidden="true"></span>
              <button type="button" id="chatToggleBtn" aria-expanded="true" aria-label="Collapse chat">−</button>
            </div>
          </div>
          <div class="chat-messages" id="chatMessages" role="log" aria-live="polite"></div>
          <form id="chatForm" class="chat-form">
            <input id="chatInput" type="text" maxlength="280" placeholder="Message the lobby…" autocomplete="off" />
            <button id="chatSendBtn" type="submit">Send</button>
          </form>
        </aside>
      </div>
      <div class="mode-overlay" id="modeOverlay">
        <div class="mode-dialog">
          <h2>Choose battle mode</h2>
          <p>Select how you'd like to engage the fleet.</p>
          <div class="mode-options">
            <button data-mode="pvp">Online PvP</button>
            <button data-mode="solo">Solo vs AI Commander</button>
            <button class="secondary" data-mode="spectate">AI vs AI (Spectate)</button>
          </div>
        </div>
      </div>
      <div class="leaderboard-overlay" id="leaderboardOverlay" hidden>
        <div class="leaderboard-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboardTitle">
          <div class="leaderboard-header">
            <h2 id="leaderboardTitle">Commander Leaderboards</h2>
            <button id="closeLeaderboardBtn" type="button" aria-label="Close leaderboards">×</button>
          </div>
          <div class="leaderboard-content">
            <section class="leaderboard-section">
              <h3>PvP Commanders</h3>
              <ol class="leaderboard-list" id="pvpLeaderboardList"></ol>
            </section>
            <section class="leaderboard-section">
              <h3>Solo vs AI</h3>
              <ol class="leaderboard-list" id="soloLeaderboardList"></ol>
            </section>
          </div>
        </div>
      </div>
      <div class="lobby-overlay" id="lobbyOverlay" hidden>
        <div class="lobby-panel">
          <h2>Battle Lobby</h2>
          <form class="lobby-create" id="createRoomForm">
            <input id="roomNameInput" type="text" maxlength="48" placeholder="Room name" />
            <button type="submit">Create Room</button>
          </form>
          <button id="refreshRoomsBtn" type="button" class="lobby-refresh">Refresh Rooms</button>
          <div class="lobby-list" id="lobbyRooms"></div>
          <div class="lobby-info" id="lobbyInfo"></div>
        </div>
      </div>
      <div class="sudoku-overlay" id="sudokuOverlay" hidden tabindex="-1">
        <div class="sudoku-panel" role="dialog" aria-modal="true" aria-labelledby="sudokuTitle">
          <div class="sudoku-panel-header">
            <h2 id="sudokuTitle">Sudoku Bay</h2>
            <button id="closeSudokuOverlayBtn" type="button" aria-label="Close sudoku bay">×</button>
          </div>
          <p class="sudoku-description">Pass the time before the next battle by solving this tactical puzzle.</p>
          <div class="sudoku-board" id="sudokuBoard"></div>
          <div class="sudoku-keypad" id="sudokuKeypad"></div>
          <div class="sudoku-controls">
            <button id="sudokuHintBtn" type="button">Hint</button>
            <button id="sudokuCheckBtn" type="button">Check Board</button>
            <button id="sudokuNewBtn" type="button">New Puzzle</button>
          </div>
          <div class="sudoku-info" id="sudokuInfo" aria-live="polite"></div>
        </div>
      </div>
      <div class="music-overlay" id="musicOverlay" hidden>
        <div class="music-panel">
          <div class="music-panel-header">
            <h2>Music Lab</h2>
            <button id="closeMusicOverlayBtn" type="button" aria-label="Close music lab">×</button>
          </div>
          <p class="music-description">Toggle pads to lay down a groove and hit play to hear your custom sequence.</p>
          <div class="music-grid" id="musicGrid"></div>
          <div class="music-controls">
            <button id="musicPlayBtn" type="button">Play</button>
            <button id="musicStopBtn" type="button" disabled>Stop</button>
            <button id="musicRandomBtn" type="button">Randomize</button>
            <button id="musicClearBtn" type="button">Clear</button>
          </div>
          <div class="music-info" id="musicInfo"></div>
        </div>
      </div>
    `;
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  createChatState() {
    return {
      scope: 'lobby',
      roomId: null,
      roomName: '',
      lobby: { messages: [] },
      rooms: new Map(),
      collapsed: false,
      connection: 'offline',
    };
  }

  sanitizePlayerName(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.replace(/\s+/g, ' ').trim();
    const filtered = trimmed.replace(/[^a-z0-9 '\-]/gi, '');
    return filtered.slice(0, 24);
  }

  createProfileState() {
    const stored = this.getStoredCommanderName();
    const sanitized = this.sanitizePlayerName(stored);
    return {
      name: sanitized,
      draft: sanitized,
      pending: null,
      status: 'idle',
      message: '',
      messageVariant: 'info',
    };
  }

  getStoredCommanderName() {
    try {
      return window.localStorage.getItem('battleshipCommanderName') || '';
    } catch (error) {
      console.warn('Unable to read commander name from storage.', error);
      return '';
    }
  }

  persistCommanderName(name) {
    try {
      if (name) {
        window.localStorage.setItem('battleshipCommanderName', name);
      } else {
        window.localStorage.removeItem('battleshipCommanderName');
      }
    } catch (error) {
      console.warn('Unable to persist commander name.', error);
    }
  }

  createLeaderboardState() {
    return {
      pvp: [],
      solo: [],
      loading: false,
      fetched: false,
      open: false,
      needsRefresh: false,
      error: '',
      lastUpdated: 0,
    };
  }

  createMusicLabState() {
    const notes = this.buildMusicLabNotes();
    const steps = 8;
    return {
      open: false,
      playing: false,
      notes,
      steps,
      pattern: Array.from({ length: notes.length }, () => Array(steps).fill(false)),
      currentStep: 0,
      timer: null,
      pads: new Map(),
      stepGroups: Array.from({ length: steps }, () => []),
      tempo: 420,
      pendingSharedPattern: null,
    };
  }

  buildMusicLabNotes() {
    return [
      { label: 'C4', semitone: 0 },
      { label: 'D4', semitone: 2 },
      { label: 'E4', semitone: 4 },
      { label: 'G4', semitone: 7 },
      { label: 'A4', semitone: 9 },
      { label: 'C5', semitone: 12 },
    ];
  }

  setupMusicLabInterface() {
    const lab = this.musicLab;
    if (!this.musicGrid || !lab) {
      return;
    }

    if (!Array.isArray(lab.pattern) || lab.pattern.length !== lab.notes.length) {
      lab.pattern = Array.from({ length: lab.notes.length }, () => Array(lab.steps).fill(false));
    }

    lab.pads = new Map();
    lab.stepGroups = Array.from({ length: lab.steps }, () => []);

    this.musicGrid.innerHTML = '';
    lab.notes.forEach((note, rowIdx) => {
      const row = document.createElement('div');
      row.className = 'music-row';

      const label = document.createElement('span');
      label.className = 'music-note-label';
      label.textContent = note.label;
      row.appendChild(label);

      for (let step = 0; step < lab.steps; step += 1) {
        const pad = document.createElement('button');
        pad.type = 'button';
        pad.className = 'music-pad';
        pad.dataset.row = String(rowIdx);
        pad.dataset.step = String(step);
        if (lab.pattern[rowIdx][step]) {
          pad.classList.add('active');
        }
        pad.addEventListener('click', () => {
          this.toggleMusicPad(rowIdx, step);
        });
        row.appendChild(pad);
        const key = `${rowIdx}:${step}`;
        lab.pads.set(key, pad);
        lab.stepGroups[step].push(pad);
      }

      this.musicGrid.appendChild(row);
    });

    if (this.musicLabBtn) {
      this.musicLabBtn.addEventListener('click', () => {
        if (lab.open) {
          this.closeMusicOverlay();
        } else {
          this.openMusicOverlay();
        }
        this.musicLabBtn.classList.remove('attention');
      });
    }

    if (this.closeMusicOverlayBtn) {
      this.closeMusicOverlayBtn.addEventListener('click', () => {
        this.closeMusicOverlay();
      });
    }

    if (this.musicOverlay) {
      this.musicOverlay.addEventListener('click', (event) => {
        if (event.target === this.musicOverlay) {
          this.closeMusicOverlay();
        }
      });
    }

    if (this.musicPlayBtn) {
      this.musicPlayBtn.addEventListener('click', () => {
        this.playMusicLab();
      });
    }

    if (this.musicStopBtn) {
      this.musicStopBtn.addEventListener('click', () => {
        this.stopMusicLab();
      });
    }

    if (this.musicRandomBtn) {
      this.musicRandomBtn.addEventListener('click', () => {
        this.randomizeMusicPattern();
      });
    }

    if (this.musicClearBtn) {
      this.musicClearBtn.addEventListener('click', () => {
        this.clearMusicPattern();
      });
    }

    this.setMusicLabPlayingState(false);
    this.updateMusicLabInfo('Tap pads to arm them and press Play.');
    this.applyMusicLabPatternToBackground();
  }

  setupChatInterface() {
    if (!this.chatPanel) {
      return;
    }

    if (this.chatForm && !this.chatForm.dataset.bound) {
      this.chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.submitChatMessage();
      });
      this.chatForm.dataset.bound = 'true';
    }

    if (this.chatToggleBtn && !this.chatToggleBtn.dataset.bound) {
      this.chatToggleBtn.addEventListener('click', () => {
        this.chat.collapsed = !this.chat.collapsed;
        this.chatPanel.classList.toggle('collapsed', this.chat.collapsed);
        if (this.chatToggleBtn) {
          this.chatToggleBtn.setAttribute('aria-expanded', String(!this.chat.collapsed));
          this.chatToggleBtn.textContent = this.chat.collapsed ? '+' : '−';
          this.chatToggleBtn.setAttribute('aria-label', this.chat.collapsed ? 'Expand chat' : 'Collapse chat');
        }
        if (!this.chat.collapsed) {
          this.scrollChatToBottom();
        }
      });
      this.chatToggleBtn.dataset.bound = 'true';
    }

    this.updateChatVisibility();
    this.updateChatContextUI();
    this.renderChatMessages();
    this.updateChatInputState();
    this.setChatConnectionState(this.chat.connection || 'offline');
  }

  updateChatVisibility() {
    if (!this.chatPanel) {
      return;
    }
    this.chatPanel.hidden = false;
  }

  updateChatContextUI() {
    if (!this.chatPanel) {
      return;
    }
    const scope = this.chat.scope === 'room' && this.chat.roomId ? 'room' : 'lobby';
    if (scope === 'room' && this.chat.roomId && !this.chat.rooms.has(this.chat.roomId)) {
      this.chat.rooms.set(this.chat.roomId, []);
    }
    if (this.chatTitle) {
      if (scope === 'room') {
        const roomName = this.chat.roomName ? `${this.chat.roomName} Comms` : 'Ready Room Comms';
        this.chatTitle.textContent = roomName;
      } else {
        this.chatTitle.textContent = 'Lobby Comms';
      }
    }
    if (this.chatSubtitle) {
      this.chatSubtitle.textContent = scope === 'room'
        ? 'Chat with commanders in your room.'
        : 'Chat with commanders in the lobby.';
    }
    if (this.chatToggleBtn) {
      this.chatToggleBtn.setAttribute('aria-expanded', String(!this.chat.collapsed));
      this.chatToggleBtn.textContent = this.chat.collapsed ? '+' : '−';
      this.chatToggleBtn.setAttribute('aria-label', this.chat.collapsed ? 'Expand chat' : 'Collapse chat');
    }
    if (this.chatPanel) {
      this.chatPanel.classList.toggle('collapsed', !!this.chat.collapsed);
    }
    this.updateChatInputPlaceholder();
    this.updateChatVisibility();
  }

  updateChatInputPlaceholder() {
    if (!this.chatInput) {
      return;
    }
    if (this.chat.scope === 'room' && this.chat.roomId) {
      this.chatInput.placeholder = this.chat.roomName
        ? `Message ${this.chat.roomName}…`
        : 'Message your opponent…';
    } else {
      this.chatInput.placeholder = 'Message the lobby…';
    }
  }

  getActiveChatMessages() {
    if (this.chat.scope === 'room' && this.chat.roomId) {
      return this.chat.rooms.get(this.chat.roomId) || [];
    }
    return this.chat.lobby.messages;
  }

  renderChatMessages() {
    if (!this.chatMessages) {
      return;
    }
    const messages = this.getActiveChatMessages();
    this.chatMessages.innerHTML = '';
    messages.forEach((msg) => {
      const normalized = this.normalizeChatMessage(msg);
      if (!normalized) {
        return;
      }
      const element = this.buildChatMessageElement(normalized);
      this.chatMessages.appendChild(element);
    });
    this.scrollChatToBottom();
  }

  scrollChatToBottom() {
    if (!this.chatMessages) {
      return;
    }
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  buildChatMessageElement(message) {
    const container = document.createElement('div');
    container.className = 'chat-message';

    const meta = document.createElement('div');
    meta.className = 'chat-meta';

    const author = document.createElement('span');
    author.className = 'chat-author';
    author.textContent = message.author || 'Commander';

    const time = document.createElement('span');
    time.className = 'chat-time';
    const timestamp = Number.isFinite(message.timestamp) ? message.timestamp : Date.now();
    time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    meta.appendChild(author);
    meta.appendChild(time);

    const text = document.createElement('div');
    text.className = 'chat-text';
    text.textContent = message.text || '';

    container.appendChild(meta);
    container.appendChild(text);
    return container;
  }

  appendChatMessageToUI(message) {
    if (!this.chatMessages) {
      return;
    }
    const normalized = this.normalizeChatMessage(message);
    if (!normalized) {
      return;
    }
    const element = this.buildChatMessageElement(normalized);
    this.chatMessages.appendChild(element);
    this.scrollChatToBottom();
  }

  submitChatMessage() {
    if (!this.chatInput || this.chatInput.disabled) {
      return;
    }
    const value = this.chatInput.value.trim();
    if (!value) {
      return;
    }
    const scope = this.chat.scope === 'room' && this.chat.roomId ? 'room' : 'lobby';
    this.send({ type: 'chatSend', scope, message: value });
    this.chatInput.value = '';
  }

  setChatConnectionState(state) {
    this.chat.connection = state;
    if (!this.chatStatusDot) {
      return;
    }
    this.chatStatusDot.classList.remove('offline', 'idle');
    if (state === 'online') {
      // default styling already indicates online
    } else if (state === 'connecting') {
      this.chatStatusDot.classList.add('idle');
    } else {
      this.chatStatusDot.classList.add('offline');
    }
    this.updateChatInputState();
  }

  updateChatInputState() {
    if (!this.chatInput) {
      return;
    }
    const canChat = this.chat.connection === 'online';
    this.chatInput.disabled = !canChat;
    if (this.chatSendBtn) {
      this.chatSendBtn.disabled = !canChat;
    }
  }

  resetChatState() {
    this.chat = this.createChatState();
    this.updateChatContextUI();
    this.renderChatMessages();
    this.setChatConnectionState('offline');
  }

  normalizeChatMessage(message) {
    if (!message) {
      return null;
    }
    const safeAuthor = typeof message.author === 'string' && message.author.trim()
      ? message.author.trim()
      : 'Commander';
    const safeText = typeof message.text === 'string' ? message.text : '';
    const safeTimestamp = Number.isFinite(message.timestamp) ? message.timestamp : Date.now();
    const safeId = typeof message.id === 'string' && message.id ? message.id : `local-${safeTimestamp}-${Math.random().toString(16).slice(2, 6)}`;
    return {
      id: safeId,
      author: safeAuthor,
      text: safeText,
      timestamp: safeTimestamp,
    };
  }

  addChatMessageToChannel(channelId, message) {
    const normalized = this.normalizeChatMessage(message);
    if (!normalized) {
      return;
    }
    if (channelId === 'lobby') {
      this.chat.lobby.messages.push(normalized);
      if (this.chat.lobby.messages.length > 120) {
        this.chat.lobby.messages.shift();
      }
      return;
    }
    if (!this.chat.rooms.has(channelId)) {
      this.chat.rooms.set(channelId, []);
    }
    const store = this.chat.rooms.get(channelId);
    store.push(normalized);
    if (store.length > 120) {
      store.shift();
    }
  }

  applyChatContext(payload) {
    this.setChatConnectionState('online');
    const scope = payload && payload.scope === 'room' ? 'room' : 'lobby';
    if (scope === 'room') {
      const roomId = typeof payload.roomId === 'string' && payload.roomId ? payload.roomId : this.chat.roomId;
      this.chat.scope = 'room';
      this.chat.roomId = roomId;
      this.chat.roomName = typeof payload.roomName === 'string' ? payload.roomName : this.chat.roomName;
    } else {
      this.chat.scope = 'lobby';
      this.chat.roomId = null;
      this.chat.roomName = '';
    }
    this.updateChatContextUI();
    this.renderChatMessages();
  }

  applyChatHistory(payload) {
    this.setChatConnectionState('online');
    if (!payload || !Array.isArray(payload.messages)) {
      return;
    }
    if (payload.scope === 'room') {
      const roomId = typeof payload.roomId === 'string' ? payload.roomId : null;
      if (!roomId) {
        return;
      }
      const messages = payload.messages.map((msg) => this.normalizeChatMessage(msg)).filter(Boolean);
      this.chat.rooms.set(roomId, messages);
      if (this.chat.scope === 'room' && this.chat.roomId === roomId) {
        this.renderChatMessages();
      }
      return;
    }
    const messages = payload.messages.map((msg) => this.normalizeChatMessage(msg)).filter(Boolean);
    this.chat.lobby.messages = messages;
    if (this.chat.scope === 'lobby') {
      this.renderChatMessages();
    }
  }

  applyChatMessage(payload) {
    this.setChatConnectionState('online');
    if (!payload || !payload.message) {
      return;
    }
    if (payload.scope === 'room') {
      const roomId = typeof payload.roomId === 'string' ? payload.roomId : null;
      if (!roomId) {
        return;
      }
      this.addChatMessageToChannel(roomId, payload.message);
      if (this.chat.scope === 'room' && this.chat.roomId === roomId) {
        this.appendChatMessageToUI(payload.message);
      }
      return;
    }
    this.addChatMessageToChannel('lobby', payload.message);
    if (this.chat.scope === 'lobby') {
      this.appendChatMessageToUI(payload.message);
    }
  }

  setupProfileControls() {
    if (this.playerNameForm && !this.playerNameForm.dataset.bound) {
      this.playerNameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.submitCommanderName();
      });
      this.playerNameForm.dataset.bound = 'true';
    }

    if (this.playerNameInput && !this.playerNameInput.dataset.bound) {
      this.playerNameInput.addEventListener('input', () => {
        this.profile.draft = this.playerNameInput.value;
      });
      this.playerNameInput.dataset.bound = 'true';
    }

    if (this.leaderboardBtn) {
      this.leaderboardBtn.setAttribute('aria-haspopup', 'dialog');
      this.leaderboardBtn.setAttribute('aria-pressed', this.leaderboards.open ? 'true' : 'false');
    }

    this.updateProfileUI();
  }

  updateProfileUI() {
    if (this.playerNameInput) {
      const currentValue = this.profile.draft || '';
      if (this.playerNameInput.value !== currentValue) {
        this.playerNameInput.value = currentValue;
      }
      this.playerNameInput.disabled = this.profile.status === 'saving';
    }

    if (this.playerNameForm) {
      const submitBtn = this.playerNameForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = this.profile.status === 'saving';
        submitBtn.textContent = this.profile.status === 'saving' ? 'Saving…' : 'Save';
      }
    }

    if (this.playerNameStatus) {
      this.playerNameStatus.textContent = this.profile.message || '';
      this.playerNameStatus.classList.toggle('success', this.profile.messageVariant === 'success');
      this.playerNameStatus.classList.toggle('error', this.profile.messageVariant === 'error');
    }
  }

  setProfileStatus(message, variant = 'info', options = {}) {
    if (this.profileMessageTimer) {
      clearTimeout(this.profileMessageTimer);
      this.profileMessageTimer = null;
    }
    this.profile.message = message || '';
    this.profile.messageVariant = variant;
    this.updateProfileUI();

    const autoClear = options.autoClear !== undefined ? options.autoClear : variant !== 'error';
    if (autoClear && message) {
      this.profileMessageTimer = setTimeout(() => {
        this.profile.message = '';
        this.profile.messageVariant = 'info';
        this.profileMessageTimer = null;
        this.updateProfileUI();
      }, 3200);
    }
  }

  hasCommanderName() {
    const name = this.profile && typeof this.profile.name === 'string' ? this.profile.name.trim() : '';
    return name.length >= 2;
  }

  promptCommanderName({ focus = false, message } = {}) {
    const promptMessage = message || 'Set your commander name to report for duty.';
    this.setProfileStatus(promptMessage, 'error', { autoClear: false });
    if (focus && this.playerNameInput) {
      requestAnimationFrame(() => {
        this.playerNameInput.focus();
        this.playerNameInput.select();
      });
    }
  }

  ensureCommanderName(options = {}) {
    if (this.hasCommanderName()) {
      return true;
    }
    const { focus = true, message } = options;
    this.promptCommanderName({ focus, message: message || 'Enter your commander name before joining a room.' });
    return false;
  }

  submitCommanderName() {
    if (!this.playerNameInput) {
      return;
    }
    const sanitized = this.sanitizePlayerName(this.playerNameInput.value);
    if (!sanitized || sanitized.length < 2) {
      this.profile.draft = this.profile.name;
      this.setProfileStatus('Enter a name with at least two characters.', 'error', { autoClear: false });
      this.updateProfileUI();
      return;
    }

    if (sanitized === this.profile.name && !this.profile.pending) {
      this.setProfileStatus('Name already saved.', 'info');
      return;
    }

    this.profile.draft = sanitized;
    this.profile.pending = sanitized;
    this.profile.status = 'saving';
    this.pendingProfileName = sanitized;
    this.setProfileStatus('Saving…', 'info', { autoClear: false });
    this.updateProfileUI();
    this.flushPendingProfileName();
  }

  flushPendingProfileName() {
    if (!this.pendingProfileName) {
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const pending = this.pendingProfileName;
    this.pendingProfileName = null;
    this.send({ type: 'setName', name: pending });
  }

  handleProfileUpdate(payload) {
    if (!payload) {
      return;
    }
    if (payload.error) {
      this.pendingProfileName = null;
      this.profile.pending = null;
      this.profile.status = 'error';
      this.profile.draft = this.profile.name;
      this.setProfileStatus(payload.error, 'error', { autoClear: false });
      this.updateProfileUI();
      return;
    }
    if (typeof payload.name === 'string') {
      const sanitized = this.sanitizePlayerName(payload.name);
      this.profile.name = sanitized;
      this.profile.draft = sanitized;
      this.profile.pending = null;
      this.profile.status = 'ready';
      this.persistCommanderName(sanitized);
      this.setProfileStatus('Call sign updated.', 'success');
      this.updateProfileUI();
      this.updateStatus();
    }
  }

  syncCommanderProfile() {
    if (this.profile.pending) {
      return;
    }
    const name = this.profile && this.profile.name ? this.sanitizePlayerName(this.profile.name) : '';
    if (!name || name.length < 2) {
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.send({ type: 'setName', name });
  }

  setupLeaderboardInterface() {
    if (this.leaderboardBtn && !this.leaderboardBtn.dataset.bound) {
      this.leaderboardBtn.addEventListener('click', () => {
        if (this.leaderboards.open) {
          this.closeLeaderboardOverlay();
        } else {
          this.openLeaderboardOverlay();
        }
      });
      this.leaderboardBtn.dataset.bound = 'true';
    }

    if (this.closeLeaderboardBtn && !this.closeLeaderboardBtn.dataset.bound) {
      this.closeLeaderboardBtn.addEventListener('click', () => {
        this.closeLeaderboardOverlay();
      });
      this.closeLeaderboardBtn.dataset.bound = 'true';
    }

    if (this.leaderboardOverlay && !this.leaderboardOverlay.dataset.bound) {
      this.leaderboardOverlay.addEventListener('click', (event) => {
        if (event.target === this.leaderboardOverlay) {
          this.closeLeaderboardOverlay();
        }
      });
      this.leaderboardOverlay.dataset.bound = 'true';
    }

    this.renderLeaderboard();
  }

  openLeaderboardOverlay() {
    if (!this.leaderboardOverlay) {
      return;
    }
    this.leaderboardOverlay.hidden = false;
    this.leaderboards.open = true;
    if (this.leaderboardBtn) {
      this.leaderboardBtn.setAttribute('aria-pressed', 'true');
    }
    if (this.closeLeaderboardBtn) {
      this.closeLeaderboardBtn.focus();
    }
    if ((!this.leaderboards.fetched && !this.leaderboards.loading) || this.leaderboards.needsRefresh) {
      this.requestLeaderboards();
    }
    this.renderLeaderboard();
  }

  closeLeaderboardOverlay(options = {}) {
    if (!this.leaderboardOverlay || this.leaderboardOverlay.hidden) {
      return;
    }
    this.leaderboardOverlay.hidden = true;
    this.leaderboards.open = false;
    if (this.leaderboardBtn) {
      this.leaderboardBtn.setAttribute('aria-pressed', 'false');
      if (!options.silent) {
        this.leaderboardBtn.focus();
      }
    }
  }

  renderLeaderboard() {
    this.renderLeaderboardSection(this.pvpLeaderboardList, this.leaderboards.pvp, 'pvp');
    this.renderLeaderboardSection(this.soloLeaderboardList, this.leaderboards.solo, 'solo');
  }

  renderLeaderboardSection(list, entries, mode) {
    if (!list) {
      return;
    }
    list.innerHTML = '';

    if (this.leaderboards.error) {
      const li = document.createElement('li');
      li.className = 'leaderboard-empty';
      li.textContent = this.leaderboards.error;
      list.appendChild(li);
      return;
    }

    if (this.leaderboards.loading && (!Array.isArray(entries) || entries.length === 0)) {
      const li = document.createElement('li');
      li.className = 'leaderboard-empty';
      li.textContent = 'Syncing results…';
      list.appendChild(li);
      return;
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'leaderboard-empty';
      li.textContent = mode === 'pvp'
        ? 'No PvP battles recorded yet.'
        : 'No solo battles recorded yet.';
      list.appendChild(li);
      return;
    }

    entries.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'leaderboard-item';

      const identity = document.createElement('div');
      identity.className = 'identity';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `${index + 1}.`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name || 'Commander';
      identity.appendChild(rank);
      identity.appendChild(name);

      const metrics = document.createElement('div');
      metrics.className = 'metrics';
      const wins = document.createElement('span');
      wins.textContent = `${Number.isFinite(entry.wins) ? entry.wins : 0}W`;
      const losses = document.createElement('span');
      losses.textContent = `${Number.isFinite(entry.losses) ? entry.losses : 0}L`;
      const rate = document.createElement('span');
      const games = Number.isFinite(entry.games) ? entry.games : (Number.isFinite(entry.wins) ? entry.wins : 0) + (Number.isFinite(entry.losses) ? entry.losses : 0);
      const winRate = games > 0 ? Math.round(((Number.isFinite(entry.wins) ? entry.wins : 0) / games) * 100) : 0;
      rate.textContent = `${winRate}%`;
      rate.title = `Win rate across ${games} game${games === 1 ? '' : 's'}`;
      metrics.appendChild(wins);
      metrics.appendChild(losses);
      metrics.appendChild(rate);

      item.appendChild(identity);
      item.appendChild(metrics);
      list.appendChild(item);
    });
  }

  requestLeaderboards(options = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const silent = !!options.silent;
    this.leaderboards.error = '';
    if (!silent) {
      this.leaderboards.loading = true;
      this.renderLeaderboard();
    }
    this.leaderboards.needsRefresh = false;
    this.send({ type: 'leaderboardRequest' });
  }

  applyLeaderboardData(payload) {
    if (!payload) {
      return;
    }
    const normalize = (entries) => {
      if (!Array.isArray(entries)) {
        return [];
      }
      return entries.slice(0, 20).map((entry) => {
        const wins = Number.isFinite(entry.wins) && entry.wins >= 0 ? entry.wins : 0;
        const losses = Number.isFinite(entry.losses) && entry.losses >= 0 ? entry.losses : 0;
        const games = Number.isFinite(entry.games) && entry.games >= 0 ? entry.games : wins + losses;
        return {
          name: this.sanitizePlayerName(entry.name) || 'Commander',
          wins,
          losses,
          games,
        };
      });
    };

    this.leaderboards.pvp = normalize(payload.pvp);
    this.leaderboards.solo = normalize(payload.solo);
    this.leaderboards.loading = false;
    this.leaderboards.fetched = true;
    this.leaderboards.error = '';
    this.leaderboards.needsRefresh = false;
    this.leaderboards.lastUpdated = Date.now();
    this.renderLeaderboard();
  }

  handleLeaderboardError(payload) {
    const message = payload && typeof payload.message === 'string'
      ? payload.message
      : 'Unable to load leaderboards.';
    this.leaderboards.loading = false;
    this.leaderboards.error = message;
    this.renderLeaderboard();
    this.addLog(`Leaderboard: ${message}`, 'error');
  }

  reportSoloResult(result) {
    if (this.soloResultReported) {
      return;
    }
    if (result !== 'win' && result !== 'lose') {
      return;
    }
    this.soloResultReported = true;
    this.pendingSoloResult = result;
    this.leaderboards.needsRefresh = true;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.addLog('Solo result will sync when connection is restored.', 'info');
    }
    this.flushPendingSoloResult();
  }

  flushPendingSoloResult() {
    if (!this.pendingSoloResult) {
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const outcome = this.pendingSoloResult;
    this.pendingSoloResult = null;
    this.send({ type: 'soloResult', result: outcome });
  }

  openMusicOverlay() {
    if (!this.musicOverlay) {
      return;
    }
    this.musicOverlay.hidden = false;
    this.musicLab.open = true;
    if (this.musicLabBtn) {
      this.musicLabBtn.setAttribute('aria-pressed', 'true');
    }
    this.updateMusicLabInfo('Tap pads to arm them and press Play.');
  }

  closeMusicOverlay(options = {}) {
    if (!this.musicOverlay) {
      return;
    }
    const { silent = false } = options;
    this.stopMusicLab({ silent: true });
    this.musicOverlay.hidden = true;
    this.musicLab.open = false;
    if (this.musicLabBtn) {
      this.musicLabBtn.setAttribute('aria-pressed', 'false');
    }
    if (!silent) {
      this.updateMusicLabInfo('Tap pads to arm them and press Play.');
    }
  }

  toggleMusicPad(rowIdx, stepIdx) {
    const lab = this.musicLab;
    if (!lab || !lab.pattern[rowIdx]) {
      return;
    }
    const current = lab.pattern[rowIdx][stepIdx];
    const next = !current;
    lab.pattern[rowIdx][stepIdx] = next;
    const pad = lab.pads.get(`${rowIdx}:${stepIdx}`);
    if (pad) {
      pad.classList.toggle('active', next);
    }
    if (lab.playing) {
      this.updateMusicLabInfo('Pattern updated. Ride the groove.');
    } else if (next) {
      this.updateMusicLabInfo('Pad armed. Press Play to hear it.');
    } else if (!this.hasMusicPatternData()) {
      this.updateMusicLabInfo('All pads cleared. Add some notes or randomize.');
    } else {
      this.updateMusicLabInfo('Pad cleared. Keep sculpting your beat.');
    }
    this.handleMusicLabPatternChanged({ reason: 'padToggle' });
  }

  async playMusicLab() {
    const lab = this.musicLab;
    if (!lab || lab.playing) {
      return;
    }

    if (!this.audio || !this.audio.supported) {
      this.updateMusicLabInfo('Audio not supported in this browser.');
      return;
    }

    if (!this.hasMusicPatternData()) {
      this.updateMusicLabInfo('Activate some pads or tap Randomize to generate a loop.');
      return;
    }

    this.audio.ensureContext();
    if (!this.audio.sfxEnabled) {
      await this.audio.enableSfx();
      this.refreshAudioControls();
      this.addLog('Music Lab engaged sound effects channel.', 'info');
    }

    lab.playing = true;
    lab.currentStep = 0;
    this.setMusicLabPlayingState(true);
    this.updateMusicLabInfo('Sequence running. Tap Stop to pause.');

    this.advanceMusicLabStep();
    const tempo = Math.max(120, Math.min(1000, lab.tempo || 420));
    lab.timer = setInterval(() => {
      this.advanceMusicLabStep();
    }, tempo);
    this.scheduleMusicLabBroadcast('play');
  }

  stopMusicLab(options = {}) {
    const lab = this.musicLab;
    if (!lab) {
      return;
    }
    const { silent = false } = options;
    if (lab.timer) {
      clearInterval(lab.timer);
      lab.timer = null;
    }
    const wasPlaying = lab.playing;
    lab.playing = false;
    lab.currentStep = 0;
    this.clearMusicLabHighlights();
    this.setMusicLabPlayingState(false);
    if (wasPlaying && !silent) {
      this.updateMusicLabInfo('Sequence paused. Adjust pads or resume.');
    }
  }

  advanceMusicLabStep() {
    const lab = this.musicLab;
    if (!lab || !lab.playing) {
      return;
    }
    const previousStep = (lab.currentStep - 1 + lab.steps) % lab.steps;
    const previousPads = lab.stepGroups[previousStep] || [];
    previousPads.forEach((pad) => pad.classList.remove('playing-step'));

    const currentPads = lab.stepGroups[lab.currentStep] || [];
    currentPads.forEach((pad) => pad.classList.add('playing-step'));

    this.triggerMusicLabStep(lab.currentStep);

    lab.currentStep = (lab.currentStep + 1) % lab.steps;
  }

  triggerMusicLabStep(stepIdx) {
    const lab = this.musicLab;
    if (!lab || !this.audio || !this.audio.context) {
      return;
    }
    const baseFreq = 261.63; // C4
    const accent = stepIdx === 0;

    lab.notes.forEach((note, rowIdx) => {
      if (!lab.pattern[rowIdx][stepIdx]) {
        return;
      }
      const frequency = baseFreq * 2 ** (note.semitone / 12);
      const wobble = accent ? 1.05 : 1.015;
      this.audio.spawnTone({
        frequencyStart: frequency,
        frequencyEnd: frequency * wobble,
        duration: accent ? 0.4 : 0.32,
        gainPeak: accent ? 0.55 : 0.42,
        type: rowIdx % 2 === 0 ? 'triangle' : 'sine',
        destination: this.audio.musicGain || this.audio.sfxGain,
      });
      if (accent && rowIdx === 0) {
        this.audio.spawnTone({
          frequencyStart: frequency / 2,
          frequencyEnd: (frequency / 2) * 1.01,
          duration: 0.5,
          gainPeak: 0.32,
          type: 'sawtooth',
          destination: this.audio.musicGain || this.audio.sfxGain,
          delay: 0.02,
        });
      }
    });
  }

  randomizeMusicPattern() {
    const lab = this.musicLab;
    if (!lab) {
      return;
    }
    lab.pattern = Array.from({ length: lab.notes.length }, (_row, rowIdx) => (
      Array.from({ length: lab.steps }, () => Math.random() < (0.3 + rowIdx * 0.04))
    ));
    this.refreshMusicPadStates();
    this.updateMusicLabInfo('Fresh pattern loaded. Press Play to listen.');
    this.handleMusicLabPatternChanged({ reason: 'randomize' });
  }

  clearMusicPattern() {
    const lab = this.musicLab;
    if (!lab) {
      return;
    }
    lab.pattern = Array.from({ length: lab.notes.length }, () => Array(lab.steps).fill(false));
    this.refreshMusicPadStates();
    this.updateMusicLabInfo('Pads cleared. Paint a new rhythm.');
    this.handleMusicLabPatternChanged({ reason: 'clear' });
  }

  refreshMusicPadStates() {
    const lab = this.musicLab;
    if (!lab) {
      return;
    }
    lab.notes.forEach((_, rowIdx) => {
      for (let step = 0; step < lab.steps; step += 1) {
        const pad = lab.pads.get(`${rowIdx}:${step}`);
        if (pad) {
          pad.classList.toggle('active', !!lab.pattern[rowIdx][step]);
        }
      }
    });
  }

  setMusicLabPlayingState(isPlaying) {
    if (this.musicPlayBtn) {
      this.musicPlayBtn.disabled = isPlaying;
    }
    if (this.musicStopBtn) {
      this.musicStopBtn.disabled = !isPlaying;
    }
    if (this.musicRandomBtn) {
      this.musicRandomBtn.disabled = isPlaying;
    }
    if (this.musicClearBtn) {
      this.musicClearBtn.disabled = isPlaying;
    }
  }

  clearMusicLabHighlights() {
    const lab = this.musicLab;
    if (!lab) {
      return;
    }
    lab.stepGroups.forEach((pads) => {
      pads.forEach((pad) => pad.classList.remove('playing-step'));
    });
  }

  hasMusicPatternData() {
    const lab = this.musicLab;
    if (!lab) {
      return false;
    }
    return lab.pattern.some((row) => row.some((value) => value));
  }

  updateMusicLabInfo(message) {
    if (this.musicInfo) {
      this.musicInfo.textContent = message || '';
    }
  }

  shutdownMusicLab() {
    this.stopMusicLab({ silent: true });
    this.closeMusicOverlay({ silent: true });
    this.updateMusicLabInfo('Tap pads to arm them and press Play.');
  }

  shutdownSudoku() {
    if (!this.sudoku) {
      return;
    }
    this.closeSudokuOverlay({ silent: true });
    this.sudoku.selectedIndex = null;
    this.sudoku.errors.clear();
    this.sudoku.conflicts.clear();
    this.sudoku.completed = false;
    if (Array.isArray(this.sudoku.puzzles) && this.sudoku.puzzles.length > 0) {
      this.loadSudokuPuzzle({ announce: false });
    }
    this.setSudokuInfo('Select a cell to begin.');
    this.updateSudokuButtonAttention();
  }

  createSudokuState() {
    return {
      open: false,
      selectedIndex: null,
      puzzles: this.buildSudokuPuzzles(),
      currentPuzzle: null,
      cells: Array(81).fill(0),
      solution: Array(81).fill(0),
      givens: new Set(),
      cellMap: new Map(),
      errors: new Set(),
      conflicts: new Set(),
      waitingPrompt: false,
      completed: false,
      info: '',
    };
  }

  buildSudokuPuzzles() {
    return [
      {
        id: 'delta-reef',
        puzzle: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
        solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
      },
      {
        id: 'aurora-gate',
        puzzle: '200080300060070084030500209000105408000000000402706000301007040720040060004010003',
        solution: '245986371169273584837541269673195428918324657452768931391652847728439165564817923',
      },
      {
        id: 'nebula-swell',
        puzzle: '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
        solution: '435269781682571493197834562826195347374682915951743628519326874248957136763418259',
      },
      {
        id: 'tidal-cross',
        puzzle: '300000000005009089200500000000867000500000001000321000000004003120700600000000005',
        solution: '391286457675139289248574316432867159517492831869321574756914823123758694984653712',
      },
      {
        id: 'polar-route',
        puzzle: '040000000001940000009020007007000500800207009005000200300080100000079400000000090',
        solution: '743851962581964723629327817237418596814257639965693248376582194158679432492135781',
      },
    ];
  }

  setupSudokuInterface() {
    const state = this.sudoku;
    if (!state || !this.sudokuBoard || !this.sudokuKeypad) {
      return;
    }

    this.renderSudokuBoard();
    this.renderSudokuKeypad();

    if (this.sudokuBtn) {
      this.sudokuBtn.addEventListener('click', () => {
        if (state.open) {
          this.closeSudokuOverlay();
        } else {
          this.openSudokuOverlay();
        }
      });
    }

    if (this.closeSudokuOverlayBtn) {
      this.closeSudokuOverlayBtn.addEventListener('click', () => {
        this.closeSudokuOverlay();
      });
    }

    if (this.sudokuOverlay) {
      this.sudokuOverlay.addEventListener('click', (event) => {
        if (event.target === this.sudokuOverlay) {
          this.closeSudokuOverlay();
        }
      });
      this.sudokuOverlay.addEventListener('keydown', this.handleSudokuOverlayKeydown);
    }

    if (this.sudokuBoard) {
      this.sudokuBoard.addEventListener('click', this.handleSudokuBoardClick);
    }

    if (this.sudokuKeypad) {
      this.sudokuKeypad.addEventListener('click', this.handleSudokuKeypadClick);
    }

    if (this.sudokuHintBtn) {
      this.sudokuHintBtn.addEventListener('click', () => {
        this.handleSudokuHint();
      });
    }

    if (this.sudokuCheckBtn) {
      this.sudokuCheckBtn.addEventListener('click', () => {
        this.checkSudokuBoard();
      });
    }

    if (this.sudokuNewBtn) {
      this.sudokuNewBtn.addEventListener('click', () => {
        this.handleSudokuNewPuzzle();
      });
    }

    this.loadSudokuPuzzle({ announce: true });
    this.updateSudokuButtonAttention();
  }

  loadSudokuPuzzle({ announce = false } = {}) {
    const state = this.sudoku;
    if (!state || !Array.isArray(state.puzzles) || state.puzzles.length === 0) {
      return;
    }

    const available = state.puzzles.filter((entry) => entry.id !== (state.currentPuzzle ? state.currentPuzzle.id : null));
    const pool = available.length > 0 ? available : state.puzzles;
    const next = pool[Math.floor(Math.random() * pool.length)];

    state.currentPuzzle = next;
    state.cells = next.puzzle.split('').map((char) => Number(char) || 0);
    state.solution = next.solution.split('').map((char) => Number(char) || 0);
    state.givens = new Set();
    state.errors = new Set();
    state.conflicts = new Set();
    state.selectedIndex = null;
    state.completed = false;
    state.waitingPrompt = this.waitingForOpponent;

    state.cells.forEach((value, index) => {
      if (value) {
        state.givens.add(index);
      }
    });

    this.recalculateSudokuConflicts();
    this.refreshSudokuCells();
    if (announce) {
      this.setSudokuInfo('Select a cell to begin. Waiting for an opponent? Keep your mind sharp here.');
    }
  }

  renderSudokuBoard() {
    const state = this.sudoku;
    if (!state || !this.sudokuBoard) {
      return;
    }

    this.sudokuBoard.innerHTML = '';
    state.cellMap = new Map();

    for (let index = 0; index < 81; index += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'sudoku-cell';
      cell.dataset.index = String(index);

      const row = Math.floor(index / 9);
      const col = index % 9;

      if (col % 3 === 0 && col !== 0) {
        cell.dataset.subgridLeft = 'true';
      }
      if (col % 3 === 2 && col !== 8) {
        cell.dataset.subgridRight = 'true';
      }
      if (row % 3 === 0 && row !== 0) {
        cell.dataset.subgridTop = 'true';
      }
      if (row % 3 === 2 && row !== 8) {
        cell.dataset.subgridBottom = 'true';
      }

      cell.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}`);

      state.cellMap.set(index, cell);
      this.sudokuBoard.appendChild(cell);
    }
  }

  renderSudokuKeypad() {
    if (!this.sudokuKeypad) {
      return;
    }
    this.sudokuKeypad.innerHTML = '';
    for (let value = 1; value <= 9; value += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(value);
      button.dataset.value = String(value);
      this.sudokuKeypad.appendChild(button);
    }
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.dataset.value = 'clear';
    this.sudokuKeypad.appendChild(clearBtn);
  }

  refreshSudokuCells() {
    const state = this.sudoku;
    if (!state || !state.cellMap) {
      return;
    }
    state.cellMap.forEach((cell, index) => {
      const value = state.cells[index];
      cell.textContent = value ? String(value) : '';
      cell.classList.toggle('fixed', state.givens.has(index));
      cell.classList.toggle('selected', state.selectedIndex === index);
      cell.classList.toggle('error', state.errors.has(index));
      cell.classList.toggle('conflict', state.conflicts.has(index));
    });
  }

  selectSudokuCell(index) {
    const state = this.sudoku;
    if (!state || !state.cellMap.has(index)) {
      return;
    }

    if (state.givens.has(index)) {
      state.selectedIndex = null;
      this.setSudokuInfo('That coordinate is locked by command. Pick another cell.');
      this.refreshSudokuCells();
      return;
    }

    state.selectedIndex = index;
    this.clearSudokuErrorsFor(index);
    this.setSudokuInfo('Cell selected. Use the keypad or your keyboard to fill it.');
    this.refreshSudokuCells();
    const cell = state.cellMap.get(index);
    if (cell) {
      cell.focus({ preventScroll: false });
    }
  }

  applySudokuValue(value) {
    const state = this.sudoku;
    if (!state || state.selectedIndex === null) {
      this.setSudokuInfo('Select a cell before entering a value.');
      return;
    }

    this.setSudokuCellValue(state.selectedIndex, value);
    if (value === null || value === 0) {
      this.setSudokuInfo('Cell cleared.');
    } else {
      this.setSudokuInfo(`Placed ${value}. Keep scanning the grid.`);
    }
  }

  setSudokuCellValue(index, value) {
    const state = this.sudoku;
    if (!state || state.givens.has(index)) {
      return;
    }

    const normalized = Number(value) || 0;
    if (!Array.isArray(state.cells)) {
      state.cells = Array(81).fill(0);
    }
    state.cells[index] = normalized;
    state.errors.delete(index);
    state.completed = false;

    this.recalculateSudokuConflicts();
    this.refreshSudokuCells();
    this.checkSudokuSolved();
  }

  recalculateSudokuConflicts() {
    const state = this.sudoku;
    if (!state) {
      return;
    }

    const conflicts = new Set();

    const registerConflicts = (indices) => {
      if (indices.length <= 1) {
        return;
      }
      indices.forEach((idx) => conflicts.add(idx));
    };

    for (let row = 0; row < 9; row += 1) {
      const seen = new Map();
      for (let col = 0; col < 9; col += 1) {
        const idx = row * 9 + col;
        const value = state.cells[idx];
        if (!value) {
          continue;
        }
        const bucket = seen.get(value) || [];
        bucket.push(idx);
        seen.set(value, bucket);
      }
      seen.forEach(registerConflicts);
    }

    for (let col = 0; col < 9; col += 1) {
      const seen = new Map();
      for (let row = 0; row < 9; row += 1) {
        const idx = row * 9 + col;
        const value = state.cells[idx];
        if (!value) {
          continue;
        }
        const bucket = seen.get(value) || [];
        bucket.push(idx);
        seen.set(value, bucket);
      }
      seen.forEach(registerConflicts);
    }

    for (let blockRow = 0; blockRow < 9; blockRow += 3) {
      for (let blockCol = 0; blockCol < 9; blockCol += 3) {
        const seen = new Map();
        for (let row = blockRow; row < blockRow + 3; row += 1) {
          for (let col = blockCol; col < blockCol + 3; col += 1) {
            const idx = row * 9 + col;
            const value = state.cells[idx];
            if (!value) {
              continue;
            }
            const bucket = seen.get(value) || [];
            bucket.push(idx);
            seen.set(value, bucket);
          }
        }
        seen.forEach(registerConflicts);
      }
    }

    state.conflicts = conflicts;
  }

  checkSudokuBoard() {
    const state = this.sudoku;
    if (!state) {
      return;
    }

    const incorrect = [];
    state.cells.forEach((value, index) => {
      if (!value) {
        return;
      }
      if (value !== state.solution[index]) {
        incorrect.push(index);
      }
    });

    state.errors = new Set(incorrect);
    this.recalculateSudokuConflicts();
    this.refreshSudokuCells();

    if (incorrect.length === 0) {
      if (this.checkSudokuSolved()) {
        return;
      }
      this.setSudokuInfo('Looks good so far. All current entries align with the solution.');
    } else {
      const label = incorrect.length === 1 ? 'entry' : 'entries';
      this.setSudokuInfo(`${incorrect.length} incorrect ${label} flagged. Adjust and try again.`);
    }
  }

  clearSudokuErrors() {
    const state = this.sudoku;
    if (!state) {
      return;
    }
    state.errors.clear();
    this.refreshSudokuCells();
  }

  clearSudokuErrorsFor(index) {
    const state = this.sudoku;
    if (!state || !state.errors) {
      return;
    }
    if (state.errors.delete(index)) {
      this.refreshSudokuCells();
    }
  }

  handleSudokuHint() {
    const state = this.sudoku;
    if (!state) {
      return;
    }
    const candidates = [];
    state.cells.forEach((value, index) => {
      if (!value && !state.givens.has(index)) {
        candidates.push(index);
      }
    });
    if (candidates.length === 0) {
      this.setSudokuInfo('No empty cells available for a hint. Finish the remaining verifications.');
      return;
    }
    const index = candidates[Math.floor(Math.random() * candidates.length)];
    const correctValue = state.solution[index];
    state.selectedIndex = index;
    this.setSudokuCellValue(index, correctValue);
    this.refreshSudokuCells();
    this.setSudokuInfo('Hint deployed. The filled value is guaranteed correct.');
  }

  handleSudokuNewPuzzle() {
    this.loadSudokuPuzzle({ announce: false });
    this.setSudokuInfo('Fresh puzzle deployed. Keep the crew sharp while you wait.');
    this.updateSudokuButtonAttention();
  }

  openSudokuOverlay() {
    const state = this.sudoku;
    if (!state || !this.sudokuOverlay) {
      return;
    }
    this.sudokuOverlay.hidden = false;
    state.open = true;
    if (this.sudokuBtn) {
      this.sudokuBtn.setAttribute('aria-pressed', 'true');
    }
    if (this.sudokuOverlay) {
      this.sudokuOverlay.focus();
    }
    if (state.waitingPrompt && this.waitingForOpponent) {
      this.setSudokuInfo('Opponent not ready yet. Keep solving while the fleets gather.');
      state.waitingPrompt = false;
    } else {
      this.setSudokuInfo(state.info || 'Select a cell to begin.');
    }
    this.updateSudokuButtonAttention();
  }

  closeSudokuOverlay(options = {}) {
    const state = this.sudoku;
    if (!state || !this.sudokuOverlay) {
      return;
    }
    const { silent = false } = options;
    this.sudokuOverlay.hidden = true;
    state.open = false;
    if (this.sudokuBtn) {
      this.sudokuBtn.setAttribute('aria-pressed', 'false');
    }
    if (!silent && !state.completed) {
      state.info = state.info || 'Select a cell to begin.';
    }
    this.updateSudokuButtonAttention();
  }

  setSudokuInfo(message) {
    const state = this.sudoku;
    if (state) {
      state.info = message;
    }
    if (this.sudokuInfo) {
      this.sudokuInfo.textContent = message || '';
    }
  }

  checkSudokuSolved() {
    const state = this.sudoku;
    if (!state) {
      return false;
    }
    const solved = state.cells.every((value, index) => value && value === state.solution[index]);
    if (!solved) {
      return false;
    }
    if (!state.completed) {
      state.completed = true;
      this.setSudokuInfo('Puzzle solved! You are battle-ready and mentally sharp.');
      this.addLog('Sudoku puzzle solved while waiting for the next engagement.', 'success');
      if (this.audio) {
        this.audio.playSfx('victory');
      }
    }
    this.updateSudokuButtonAttention();
    return true;
  }

  handleSudokuKeypadClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button[data-value]');
    if (!button) {
      return;
    }
    const { value } = button.dataset;
    if (value === 'clear') {
      this.applySudokuValue(null);
      return;
    }
    const digit = Number(value);
    if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
      this.applySudokuValue(digit);
    }
  }

  handleSudokuBoardClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const cell = target.closest('.sudoku-cell');
    if (!cell || !this.sudokuBoard || !this.sudokuBoard.contains(cell)) {
      return;
    }
    const index = Number(cell.dataset.index);
    if (!Number.isInteger(index)) {
      return;
    }
    this.selectSudokuCell(index);
  }

  handleSudokuOverlayKeydown(event) {
    if (!this.sudoku || !this.sudoku.open) {
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      this.applySudokuValue(Number(event.key));
      event.preventDefault();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0' || event.key === ' ') {
      this.applySudokuValue(null);
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      this.closeSudokuOverlay();
    }
  }

  updateSudokuButtonAttention() {
    if (!this.sudokuBtn || !this.sudoku) {
      return;
    }
    const highlight = this.mode === 'pvp' && !this.gameEnded && this.waitingForOpponent && !this.sudoku.completed;
    this.sudokuBtn.classList.toggle('attention', highlight);
  }

  setWaitingForOpponent(waiting) {
    const previous = this.waitingForOpponent;
    this.waitingForOpponent = waiting;
    if (this.sudoku) {
      if (waiting) {
        this.sudoku.waitingPrompt = true;
      } else if (previous && this.sudoku.open && !this.sudoku.completed) {
        this.setSudokuInfo('Opponent ready! Finish up or close the puzzle when you are set.');
        this.sudoku.waitingPrompt = false;
      } else {
        this.sudoku.waitingPrompt = false;
      }
    }
    this.updateSudokuButtonAttention();
  }

  bindElements() {
    this.statusLine = this.shadowRoot.querySelector('#statusLine');
    this.placementBadge = this.shadowRoot.querySelector('#placementBadge');
    this.opponentBadge = this.shadowRoot.querySelector('#opponentBadge');
    this.turnInfo = this.shadowRoot.querySelector('#turnInfo');
    this.hintLine = this.shadowRoot.querySelector('#hintLine');
    this.logPanel = this.shadowRoot.querySelector('#logPanel');
    this.playAgainBtn = this.shadowRoot.querySelector('#playAgainBtn');
    this.playerNameForm = this.shadowRoot.querySelector('#playerNameForm');
    this.playerNameInput = this.shadowRoot.querySelector('#playerNameInput');
    this.playerNameStatus = this.shadowRoot.querySelector('#playerNameStatus');
    this.leaderboardBtn = this.shadowRoot.querySelector('#leaderboardBtn');

    this.ownGrid = this.shadowRoot.querySelector('#ownGrid');
    this.targetGrid = this.shadowRoot.querySelector('#targetGrid');
    this.orientationBtn = this.shadowRoot.querySelector('#orientationBtn');
    this.randomBtn = this.shadowRoot.querySelector('#randomBtn');
    this.resetBtn = this.shadowRoot.querySelector('#resetBtn');
    this.readyBtn = this.shadowRoot.querySelector('#readyBtn');
    this.modeOverlay = this.shadowRoot.querySelector('#modeOverlay');
    this.modeButtons = this.shadowRoot.querySelectorAll('[data-mode]');
    this.sfxToggleBtn = this.shadowRoot.querySelector('#sfxToggleBtn');
    this.musicToggleBtn = this.shadowRoot.querySelector('#musicToggleBtn');
    this.toggleLobbyBtn = this.shadowRoot.querySelector('#toggleLobbyBtn');
    this.leaveRoomBtn = this.shadowRoot.querySelector('#leaveRoomBtn');
    this.lobbyOverlay = this.shadowRoot.querySelector('#lobbyOverlay');
    this.lobbyRoomsList = this.shadowRoot.querySelector('#lobbyRooms');
    this.lobbyInfo = this.shadowRoot.querySelector('#lobbyInfo');
    this.createRoomForm = this.shadowRoot.querySelector('#createRoomForm');
    this.roomNameInput = this.shadowRoot.querySelector('#roomNameInput');
    this.refreshRoomsBtn = this.shadowRoot.querySelector('#refreshRoomsBtn');
    this.sudokuBtn = this.shadowRoot.querySelector('#sudokuBtn');
    this.sudokuOverlay = this.shadowRoot.querySelector('#sudokuOverlay');
    this.closeSudokuOverlayBtn = this.shadowRoot.querySelector('#closeSudokuOverlayBtn');
    this.sudokuBoard = this.shadowRoot.querySelector('#sudokuBoard');
    this.sudokuKeypad = this.shadowRoot.querySelector('#sudokuKeypad');
    this.sudokuHintBtn = this.shadowRoot.querySelector('#sudokuHintBtn');
    this.sudokuCheckBtn = this.shadowRoot.querySelector('#sudokuCheckBtn');
    this.sudokuNewBtn = this.shadowRoot.querySelector('#sudokuNewBtn');
    this.sudokuInfo = this.shadowRoot.querySelector('#sudokuInfo');
    this.musicLabBtn = this.shadowRoot.querySelector('#musicLabBtn');
    this.musicOverlay = this.shadowRoot.querySelector('#musicOverlay');
    this.musicGrid = this.shadowRoot.querySelector('#musicGrid');
    this.musicPlayBtn = this.shadowRoot.querySelector('#musicPlayBtn');
    this.musicStopBtn = this.shadowRoot.querySelector('#musicStopBtn');
    this.musicRandomBtn = this.shadowRoot.querySelector('#musicRandomBtn');
    this.musicClearBtn = this.shadowRoot.querySelector('#musicClearBtn');
    this.musicInfo = this.shadowRoot.querySelector('#musicInfo');
    this.closeMusicOverlayBtn = this.shadowRoot.querySelector('#closeMusicOverlayBtn');
    this.leaderboardOverlay = this.shadowRoot.querySelector('#leaderboardOverlay');
    this.closeLeaderboardBtn = this.shadowRoot.querySelector('#closeLeaderboardBtn');
    this.pvpLeaderboardList = this.shadowRoot.querySelector('#pvpLeaderboardList');
    this.soloLeaderboardList = this.shadowRoot.querySelector('#soloLeaderboardList');
    this.chatPanel = this.shadowRoot.querySelector('#chatPanel');
    this.chatTitle = this.shadowRoot.querySelector('#chatTitle');
    this.chatSubtitle = this.shadowRoot.querySelector('#chatSubtitle');
    this.chatMessages = this.shadowRoot.querySelector('#chatMessages');
    this.chatForm = this.shadowRoot.querySelector('#chatForm');
    this.chatInput = this.shadowRoot.querySelector('#chatInput');
    this.chatSendBtn = this.shadowRoot.querySelector('#chatSendBtn');
    this.chatToggleBtn = this.shadowRoot.querySelector('#chatToggleBtn');
    this.chatStatusDot = this.shadowRoot.querySelector('#chatStatusDot');

    this.targetGrid.setInteractive(false);
    this.ownGrid.setInteractive(true);

    this.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.selectMode(button.dataset.mode);
      });
    });

    this.ownGrid.addEventListener('cellclick', (event) => {
      if (this.layoutLocked || this.state !== 'placement') {
        return;
      }
      this.handlePlacementClick(event.detail);
    });

    this.targetGrid.addEventListener('cellclick', (event) => {
      if (!this.layoutLocked || !this.opponentReady || !this.isMyTurn || this.gameEnded) {
        return;
      }
      this.handleFire(event.detail);
    });

    this.orientationBtn.addEventListener('click', () => {
      if (this.layoutLocked) {
        return;
      }
      this.orientation = this.orientation === 'horizontal' ? 'vertical' : 'horizontal';
      this.orientationBtn.textContent = `Orientation: ${this.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}`;
      this.updateHint();
    });

    this.randomBtn.addEventListener('click', () => {
      if (this.layoutLocked) {
        return;
      }
      this.generateRandomFleet();
    });

    this.resetBtn.addEventListener('click', () => {
      if (this.layoutLocked) {
        if (this.mode === 'pvp') {
          this.send({ type: 'resetPlacement' });
        } else if (this.mode === 'solo') {
          this.addLog('Battle already in progress. Reload to start a new solo game.', 'error');
        }
        return;
      }
      this.resetPlacement();
    });

    this.readyBtn.addEventListener('click', () => {
      if (this.layoutLocked) {
        return;
      }
      if (this.placedShips.length !== SHIPS.length) {
        this.addLog('Place all ships before locking in.', 'error');
        return;
      }
      if (this.mode === 'pvp') {
        this.send({ type: 'placeShips', ships: this.serializeShips() });
      } else if (this.mode === 'solo') {
        this.commitSoloPlacement();
      }
    });

    this.playAgainBtn.addEventListener('click', () => {
      window.location.reload();
    });

    if (this.sfxToggleBtn) {
      this.sfxToggleBtn.addEventListener('click', () => {
        this.toggleSfx();
      });
    }
    if (this.musicToggleBtn) {
      this.musicToggleBtn.addEventListener('click', () => {
        this.toggleMusic();
      });
    }

    if (this.toggleLobbyBtn) {
      this.toggleLobbyBtn.addEventListener('click', () => {
        if (!this.lobbyOverlay) {
          return;
        }
        if (this.lobbyOverlay.hidden) {
          this.showLobbyOverlay();
          this.requestLobbyRooms();
        } else {
          this.hideLobbyOverlay();
        }
        this.refreshLobbyControls();
      });
    }

    if (this.leaveRoomBtn) {
      this.leaveRoomBtn.addEventListener('click', () => {
        this.leaveRoom();
      });
    }

    if (this.createRoomForm) {
      this.createRoomForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!this.ensureCommanderName({ focus: true, message: 'Set your commander name before creating a room.' })) {
          this.addLog('Commander name required to create a room.', 'error');
          return;
        }
        const name = this.roomNameInput ? this.roomNameInput.value.trim() : '';
        if (!name) {
          this.addLog('Enter a room name to deploy a lobby.', 'error');
          return;
        }
        this.send({ type: 'createRoom', name });
        if (this.roomNameInput) {
          this.roomNameInput.value = '';
        }
      });
    }

    if (this.refreshRoomsBtn) {
      this.refreshRoomsBtn.addEventListener('click', () => {
        this.requestLobbyRooms();
      });
    }

    if (this.lobbyRoomsList) {
      this.lobbyRoomsList.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('button[data-room-id]');
        if (!button) {
          return;
        }
        const { roomId } = button.dataset;
        if (!roomId) {
          return;
        }
        if (!this.ensureCommanderName({ focus: true })) {
          this.addLog('Set your commander name before joining a room.', 'error');
          return;
        }
        this.send({ type: 'joinRoom', roomId });
      });
    }

    this.renderLobbyRooms();
    this.updateLobbyInfo();
    this.refreshLobbyControls();

    this.setupProfileControls();
    this.setupLeaderboardInterface();
    this.setupSudokuInterface();
    this.setupMusicLabInterface();
    this.setupChatInterface();
  }

  async toggleSfx() {
    if (!this.audio) {
      return;
    }
    if (!this.audio.supported) {
      this.addLog('Sound playback is not supported in this browser.', 'error');
      return;
    }
    if (this.audio.sfxEnabled) {
      await this.audio.disableSfx();
      this.addLog('Sound effects muted.', 'info');
    } else {
      await this.audio.enableSfx();
      this.audio.playSfx('mode');
      this.addLog('Sound effects engaged.', 'info');
    }
    this.refreshAudioControls();
  }

  async toggleMusic() {
    if (!this.audio) {
      return;
    }
    if (!this.audio.supported) {
      this.addLog('Sound playback is not supported in this browser.', 'error');
      return;
    }
    await this.audio.toggleMusic();
    if (this.audio.musicEnabled) {
      this.audio.playSfx('mode');
      this.addLog('Procedural score online.', 'info');
    } else {
      this.addLog('Music silenced.', 'info');
    }
    this.refreshAudioControls();
  }

  refreshAudioControls() {
    const supported = this.audio ? this.audio.supported : false;
    if (this.sfxToggleBtn) {
      this.sfxToggleBtn.textContent = `SFX: ${this.audio && this.audio.sfxEnabled ? 'On' : 'Off'}`;
      this.sfxToggleBtn.disabled = !supported;
    }
    if (this.musicToggleBtn) {
      this.musicToggleBtn.textContent = `Music: ${this.audio && this.audio.musicEnabled ? 'On' : 'Off'}`;
      this.musicToggleBtn.disabled = !supported;
    }
  }

  enterLobby() {
    if (this.mode !== 'pvp') {
      return;
    }
    if (!this.currentRoom) {
      this.setWaitingForOpponent(false);
      this.showLobbyOverlay();
      this.requestLobbyRooms();
    }
    this.updateLobbyInfo();
    this.refreshLobbyControls();
  }

  showLobbyOverlay() {
    if (!this.lobbyOverlay) {
      return;
    }
    this.lobbyOverlay.hidden = false;
    this.renderLobbyRooms();
    this.updateLobbyInfo();
  }

  hideLobbyOverlay() {
    if (!this.lobbyOverlay) {
      return;
    }
    this.lobbyOverlay.hidden = true;
    this.refreshLobbyControls();
  }

  requestLobbyRooms() {
    if (this.mode !== 'pvp') {
      return;
    }
    this.send({ type: 'listRooms' });
  }

  renderLobbyRooms() {
    if (!this.lobbyRoomsList) {
      return;
    }
    this.lobbyRoomsList.innerHTML = '';
    if (!Array.isArray(this.lobbyRooms) || this.lobbyRooms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lobby-empty';
      empty.textContent = 'No rooms available. Create one to deploy your fleet.';
      this.lobbyRoomsList.appendChild(empty);
      return;
    }
    this.lobbyRooms.forEach((room) => {
      const card = document.createElement('div');
      card.className = 'lobby-room';
      if (this.currentRoom && this.currentRoom.roomId === room.id) {
        card.classList.add('active');
      }

      const info = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = room.name || 'Unnamed Room';
      const subtitle = document.createElement('small');
      const occupants = Math.min(room.occupants || 0, room.capacity || 2);
      subtitle.textContent = `${occupants}/${room.capacity || 2} commanders`;
      info.appendChild(title);
      info.appendChild(subtitle);

      const action = document.createElement('button');
      action.type = 'button';
      action.dataset.roomId = room.id;

      if (this.currentRoom && this.currentRoom.roomId === room.id) {
        action.textContent = this.waitingForOpponent ? 'Waiting...' : 'Ready';
        action.disabled = true;
      } else if (occupants >= (room.capacity || 2)) {
        action.textContent = 'Full';
        action.disabled = true;
      } else {
        action.textContent = 'Join';
      }

      card.appendChild(info);
      card.appendChild(action);
      this.lobbyRoomsList.appendChild(card);
    });
  }

  updateLobbyInfo(message) {
    if (!this.lobbyInfo) {
      return;
    }

    if (message) {
      this.lobbyInfo.textContent = message;
      return;
    }

    if (this.mode !== 'pvp') {
      this.lobbyInfo.textContent = '';
      return;
    }

    if (this.currentRoom) {
      if (this.waitingForOpponent) {
        this.lobbyInfo.textContent = `In room "${this.currentRoom.name}". Waiting for an opponent...`;
      } else {
        this.lobbyInfo.textContent = `Room "${this.currentRoom.name}" is ready. Prepare for battle.`;
      }
      return;
    }

    if (!Array.isArray(this.lobbyRooms) || this.lobbyRooms.length === 0) {
      this.lobbyInfo.textContent = 'No ready rooms yet. Create one to invite an opponent.';
      return;
    }

    const count = this.lobbyRooms.length;
    this.lobbyInfo.textContent = `${count} room${count === 1 ? '' : 's'} standing by.`;
  }

  refreshLobbyControls() {
    if (this.toggleLobbyBtn) {
      const shouldShowToggle = this.mode === 'pvp' && !this.gameEnded;
      this.toggleLobbyBtn.hidden = !shouldShowToggle;
      if (shouldShowToggle) {
        const isOpen = this.lobbyOverlay && !this.lobbyOverlay.hidden;
        this.toggleLobbyBtn.textContent = isOpen ? 'Close Lobby' : 'Lobby';
      }
    }

    if (this.leaveRoomBtn) {
      const shouldShowLeave = this.mode === 'pvp' && !this.gameEnded && !!this.currentRoom;
      this.leaveRoomBtn.hidden = !shouldShowLeave;
    }
  }

  leaveRoom() {
    if (this.mode !== 'pvp') {
      return;
    }
    this.send({ type: 'leaveRoom' });
  }

  showModeOverlay() {
    if (this.modeOverlay) {
      this.modeOverlay.hidden = false;
    }
  }

  selectMode(mode) {
    if (!mode) {
      this.addLog('Please choose a valid mode.', 'error');
      this.showModeOverlay();
      return;
    }

    this.mode = mode;
    if (this.modeOverlay) {
      this.modeOverlay.hidden = true;
    }
    this.resetBaseState();

    switch (mode) {
      case 'pvp':
        this.preparePvpMode();
        break;
      case 'solo':
        this.prepareSoloMode();
        break;
      case 'spectate':
        this.prepareSpectateMode();
        break;
      default:
        this.addLog('Unknown mode selected.', 'error');
    }

    this.updateStatus();
  }

  resetBaseState() {
    this.clearLocalTimers();
    this.shutdownMusicLab();
    this.shutdownSudoku();
    if (this.musicShareTimer) {
      clearTimeout(this.musicShareTimer);
      this.musicShareTimer = null;
    }
    if (this.musicShareEcho) {
      this.musicShareEcho.clear();
    }
    this.lastSharedMusic = null;
    this.resetChatState();
    this.closeLeaderboardOverlay({ silent: true });
    this.pendingSoloResult = null;
    this.soloResultReported = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        // ignore
      }
      this.ws = null;
    }
    this.state = 'placement';
    this.playerNumber = null;
    this.isMyTurn = false;
    this.layoutLocked = false;
    this.opponentReady = false;
    this.opponentConnected = false;
    this.gameEnded = false;
    this.currentShipIndex = 0;
    this.orientation = 'horizontal';
    this.placedShips = [];
    this.occupiedCells = new Set();
    this.shotsTaken = new Set();
    this.localGame = null;
    this.ownGrid.reset();
    this.targetGrid.reset();
    this.ownGrid.setInteractive(true);
    this.targetGrid.setInteractive(false);
    this.placementBadge.classList.remove('success');
    this.placementBadge.textContent = 'Place ships';
    this.opponentBadge.classList.remove('success');
    this.opponentBadge.textContent = 'Waiting...';
    this.turnInfo.textContent = 'Take aim once the battle begins.';
    this.hintLine.textContent = 'Select a cell to place your Carrier (5 cells).';
    this.playAgainBtn.hidden = true;
    this.playAgainBtn.textContent = 'Play Again';
    this.logPanel.innerHTML = '';
    this.currentRoom = null;
    this.lobbyRooms = [];
  this.setWaitingForOpponent(false);
    this.hideLobbyOverlay();
    this.renderLobbyRooms();
    this.updateLobbyInfo();
    if (this.orientationBtn) {
      this.orientationBtn.textContent = 'Orientation: Horizontal';
    }
    this.updateControls();
    this.refreshLobbyControls();
  }

  preparePvpMode() {
    this.addLog('Online PvP mode selected. Connecting to server...', 'info');
    this.state = 'lobby';
    this.currentRoom = null;
    this.setWaitingForOpponent(false);
    this.ownGrid.removeAttribute('reveal-ships');
    this.targetGrid.removeAttribute('reveal-ships');
    this.turnInfo.textContent = 'Connecting to the lobby...';
    if (!this.hasCommanderName()) {
      this.promptCommanderName({ focus: false, message: 'Set your commander name to stand out in the lobby.' });
    }
    this.enterLobby();
    this.connect();
    if (this.audio) {
      this.audio.playSfx('mode');
    }
  }

  prepareSoloMode() {
    this.playerNumber = 1;
    this.opponentConnected = true;
    this.ownGrid.removeAttribute('reveal-ships');
    this.targetGrid.removeAttribute('reveal-ships');
    this.addLog('Solo vs AI commander. Deploy your fleet.', 'info');
    this.opponentBadge.textContent = 'AI preparing layout';
    this.opponentBadge.classList.remove('success');
    this.localGame = {
      type: 'solo',
      aiBoard: null,
      playerBoard: null,
      aiTargetQueue: [],
      aiTargetSet: new Set(),
    };
    this.updateHint();
    this.updateControls();
    if (this.audio) {
      this.audio.playSfx('mode');
    }
    this.connect();
  }

  commitSoloPlacement() {
    if (!this.localGame || this.localGame.type !== 'solo') {
      return;
    }

    const aiFleet = this.buildRandomFleetLayout();
    if (!aiFleet) {
      this.addLog('AI fleet deployment failed. Try locking in again.', 'error');
      return;
    }

    this.handleServerEvent({ type: 'layoutAccepted' });
    this.localGame.playerBoard = this.createBoardState(this.placedShips);
    this.localGame.aiBoard = this.createBoardState(aiFleet);
    this.resetAiTargeting();
    this.handleServerEvent({ type: 'opponentReady' });
    const youStart = Math.random() >= 0.5;
    this.handleServerEvent({ type: 'gameStart', youStart });
    if (!youStart) {
      this.scheduleLocalAiTurn();
    }
  }

  processLocalPlayerFire(x, y) {
    if (!this.localGame || this.localGame.type !== 'solo' || !this.localGame.aiBoard || this.gameEnded) {
      return;
    }

    const board = this.localGame.aiBoard;
    const key = `${x},${y}`;
    if (board.shots.has(key)) {
      this.addLog('Coordinate already targeted.', 'error');
      return;
    }

    const ship = board.occupied.get(key);
    let outcome = 'miss';
    let sunkShip = null;
    if (ship) {
      ship.hits.add(key);
      board.shots.set(key, 'hit');
      outcome = ship.hits.size === ship.length ? 'sunk' : 'hit';
      if (outcome === 'sunk') {
        sunkShip = ship;
      }
    } else {
      board.shots.set(key, 'miss');
    }

    const allSunk = this.allShipsSunk(board);
    const nextTurn = allSunk ? null : outcome === 'miss' ? 2 : 1;
    const payload = {
      x,
      y,
      outcome: outcome === 'sunk' ? 'sunk' : outcome,
      ship: sunkShip ? { name: sunkShip.name, coordinates: sunkShip.coordinates } : null,
      nextTurn,
    };

    this.processFireResult(payload);

    if (allSunk) {
      this.handleServerEvent({ type: 'gameOver', result: 'win' });
    } else if (nextTurn === 2) {
      this.scheduleLocalAiTurn();
    }
  }

  scheduleLocalAiTurn() {
    if (!this.localGame || this.localGame.type !== 'solo' || this.gameEnded) {
      return;
    }
    const timer = setTimeout(() => {
      this.localTimers.delete(timer);
      this.performLocalAiTurn();
    }, 900);
    this.localTimers.add(timer);
  }

  performLocalAiTurn() {
    if (!this.localGame || this.localGame.type !== 'solo' || !this.localGame.playerBoard || this.gameEnded) {
      return;
    }

    const board = this.localGame.playerBoard;
    let target = this.popNextAiTarget(board);
    if (!target) {
      target = this.chooseRandomTarget(board);
    }
    if (!target) {
      return;
    }

    const key = `${target.x},${target.y}`;
    if (board.shots.has(key)) {
      this.scheduleLocalAiTurn();
      return;
    }

    const ship = board.occupied.get(key);
    let outcome = 'miss';
    let sunkShip = null;
    if (ship) {
      ship.hits.add(key);
      board.shots.set(key, 'hit');
      outcome = ship.hits.size === ship.length ? 'sunk' : 'hit';
      if (outcome === 'sunk') {
        sunkShip = ship;
      }
      this.handleAiShotOutcome(board, target, ship, outcome);
    } else {
      board.shots.set(key, 'miss');
    }

    const allSunk = this.allShipsSunk(board);
    const nextTurn = allSunk ? null : outcome === 'miss' ? 1 : 2;
    const payload = {
      x: target.x,
      y: target.y,
      outcome: outcome === 'sunk' ? 'sunk' : outcome,
      ship: sunkShip ? { name: sunkShip.name, coordinates: sunkShip.coordinates } : null,
      nextTurn,
    };

    this.processIncomingFire(payload);

    if (allSunk) {
      this.handleServerEvent({ type: 'gameOver', result: 'lose' });
    } else if (nextTurn === 2) {
      this.scheduleLocalAiTurn();
    }
  }

  prepareSpectateMode() {
    this.state = 'spectate';
    this.layoutLocked = true;
    this.ownGrid.setInteractive(false);
    this.targetGrid.setInteractive(false);
    this.readyBtn.disabled = true;
    this.randomBtn.disabled = true;
    this.orientationBtn.disabled = true;
    this.resetBtn.disabled = true;
    this.placementBadge.textContent = 'Observer';
    this.opponentBadge.textContent = 'Observer';
    this.hintLine.textContent = 'Watching AI commanders duel.';
    this.turnInfo.textContent = 'Initializing fleets...';
    this.addLog('Spectator mode engaged. Initializing AI fleets.', 'info');
    if (this.audio) {
      this.audio.playSfx('mode');
    }
    if (this.audio) {
      this.audio.playSfx('mode');
    }

    this.ownGrid.setAttribute('reveal-ships', 'true');
    this.targetGrid.setAttribute('reveal-ships', 'true');

    const alphaFleet = this.buildRandomFleetLayout();
    const betaFleet = this.buildRandomFleetLayout();
    if (!alphaFleet || !betaFleet) {
      this.addLog('Unable to initialize AI fleets. Try reloading.', 'error');
      return;
    }

    this.localGame = {
      type: 'spectate',
      boards: [this.createBoardState(alphaFleet), this.createBoardState(betaFleet)],
      names: ['Fleet Alpha', 'Fleet Beta'],
      turn: Math.random() > 0.5 ? 0 : 1,
    };

    this.ownGrid.reset();
    this.targetGrid.reset();
  alphaFleet.forEach((ship) => this.ownGrid.paintShipCells(ship.coordinates, ship.name));
  betaFleet.forEach((ship) => this.targetGrid.paintShipCells(ship.coordinates, ship.name));

    this.addLog(`${this.localGame.names[this.localGame.turn]} has the initiative.`, 'info');
    this.turnInfo.textContent = `${this.localGame.names[this.localGame.turn]} is lining up the first volley.`;
    this.startSpectatorMatch();
    this.connect();
  }

  startSpectatorMatch() {
    if (!this.localGame || this.localGame.type !== 'spectate' || this.gameEnded) {
      return;
    }
    const timer = setTimeout(() => {
      this.localTimers.delete(timer);
      this.advanceSpectatorTurn();
    }, 900);
    this.localTimers.add(timer);
  }

  advanceSpectatorTurn() {
    if (!this.localGame || this.localGame.type !== 'spectate' || this.gameEnded) {
      return;
    }

    const attackerIndex = this.localGame.turn;
    const defenderIndex = attackerIndex === 0 ? 1 : 0;
    const attackerName = this.localGame.names[attackerIndex];
    const defenderName = this.localGame.names[defenderIndex];
    const defenderBoard = this.localGame.boards[defenderIndex];

    const target = this.chooseRandomTarget(defenderBoard);
    if (!target) {
      this.finishSpectatorMatch(attackerName);
      return;
    }

    const key = `${target.x},${target.y}`;
    if (defenderBoard.shots.has(key)) {
      // Should not happen, but guard to prevent infinite loops.
      this.startSpectatorMatch();
      return;
    }

    const ship = defenderBoard.occupied.get(key);
    let outcome = 'miss';
    let sunkShip = null;
    if (ship) {
      ship.hits.add(key);
      defenderBoard.shots.set(key, 'hit');
      outcome = ship.hits.size === ship.length ? 'sunk' : 'hit';
      if (outcome === 'sunk') {
        sunkShip = ship;
      }
    } else {
      defenderBoard.shots.set(key, 'miss');
    }

    const grid = defenderIndex === 1 ? this.targetGrid : this.ownGrid;
    grid.setCellState(target.x, target.y, outcome === 'sunk' ? 'sunk' : outcome);
    if (sunkShip) {
      grid.markSunkShip(sunkShip.coordinates, sunkShip.name);
    }

    const coordLabel = this.prettyCoord(target.x, target.y);
    let logMessage = `${attackerName} fires at ${coordLabel} `;
    if (outcome === 'miss') {
      logMessage += 'and misses.';
    } else if (outcome === 'hit') {
      logMessage += 'and scores a hit!';
    } else {
      logMessage += `and sinks ${defenderName}'s ${sunkShip.name}!`;
    }
    this.addLog(logMessage, outcome === 'miss' ? 'info' : 'success');
    if (this.audio) {
      const cue = outcome === 'sunk' ? 'sunk' : outcome;
      this.audio.playSfx(cue);
    }

    if (this.allShipsSunk(defenderBoard)) {
      this.finishSpectatorMatch(attackerName);
      return;
    }

    if (outcome === 'miss') {
      this.localGame.turn = defenderIndex;
      this.turnInfo.textContent = `${this.localGame.names[this.localGame.turn]} prepares to return fire.`;
    } else if (outcome === 'hit') {
      this.turnInfo.textContent = `${attackerName} lines up another volley.`;
    } else {
      this.turnInfo.textContent = `${attackerName} keeps the initiative after sinking ${defenderName}'s ${sunkShip.name}.`;
    }

    this.startSpectatorMatch();
  }

  finishSpectatorMatch(winnerName) {
    this.gameEnded = true;
    this.clearLocalTimers();
    this.turnInfo.textContent = `${winnerName} wins the duel.`;
    this.addLog(`${winnerName} has obliterated the opposing fleet.`, 'win');
    if (this.audio) {
      this.audio.playSfx('victory');
    }
    this.playAgainBtn.hidden = false;
    this.playAgainBtn.textContent = 'Watch Again';
    this.updateStatus();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}`;
    this.setChatConnectionState('connecting');
    this.ws = new WebSocket(wsUrl);
    this.addLog('Connecting to command server...', 'info');

    this.ws.addEventListener('open', () => {
      if (this.mode === 'pvp') {
        this.state = 'lobby';
        this.addLog('Connected to command lobby. Browse or create a room to begin.', 'info');
        this.turnInfo.textContent = 'Connected. Use the lobby to find an opponent.';
        this.enterLobby();
        this.requestLobbyRooms();
      } else if (this.mode === 'solo') {
        this.state = 'placement';
        this.addLog('Connected to command server. Solo results will sync automatically.', 'info');
      } else if (this.mode === 'spectate') {
        this.addLog('Command server connection established. Observing AI duel.', 'info');
      } else {
        this.state = 'placement';
        this.addLog('Connected to command server.', 'info');
      }
      this.flushPendingProfileName();
      if (!this.profile.pending) {
        this.syncCommanderProfile();
      }
      this.flushPendingSoloResult();
      this.requestLeaderboards({ silent: true });
      this.updateStatus();
    });

    this.ws.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        console.error('Invalid message', error, event.data);
        return;
      }
      this.handleServerEvent(payload);
    });

    this.ws.addEventListener('close', () => {
      if (!this.gameEnded) {
        this.addLog('Connection closed. Refresh to reconnect.', 'error');
        this.turnInfo.textContent = 'Connection lost. Refresh the page.';
      }
      this.layoutLocked = true;
      this.ownGrid.setInteractive(false);
      this.targetGrid.setInteractive(false);
      this.currentRoom = null;
  this.setWaitingForOpponent(false);
      this.lobbyRooms = [];
      this.renderLobbyRooms();
      if (this.mode === 'pvp') {
        this.showLobbyOverlay();
        this.updateLobbyInfo('Disconnected from lobby. Refresh to reconnect.');
      }
      this.refreshLobbyControls();
      this.closeLeaderboardOverlay({ silent: true });
      if (this.profile && this.profile.pending && !this.pendingProfileName) {
        this.pendingProfileName = this.profile.pending;
        this.profile.status = 'idle';
        this.updateProfileUI();
      }
      this.setChatConnectionState('offline');
      this.leaderboards.loading = false;
      this.renderLeaderboard();
      this.updateStatus();
    });

    this.ws.addEventListener('error', () => {
      this.addLog('Connection error encountered.', 'error');
    });
  }

  handleServerEvent(payload) {
    switch (payload.type) {
      case 'profile':
        this.handleProfileUpdate(payload);
        break;
      case 'leaderboardData':
      case 'leaderboardUpdate':
        this.applyLeaderboardData(payload);
        break;
      case 'leaderboardError':
        this.handleLeaderboardError(payload);
        break;
      case 'chatContext':
        this.applyChatContext(payload);
        break;
      case 'chatHistory':
        this.applyChatHistory(payload);
        break;
      case 'chatMessage':
        this.applyChatMessage(payload);
        break;
      case 'chatError':
        if (payload.message) {
          this.addLog(`Chat: ${payload.message}`, 'error');
        }
        break;
      case 'lobbyUpdate': {
        this.lobbyRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
        this.renderLobbyRooms();
        this.updateLobbyInfo();
        break;
      }
      case 'lobbyMusic':
      case 'lobbyMusicUpdate':
        this.handleIncomingMusicPattern(payload, { silent: payload.type === 'lobbyMusic' });
        break;
      case 'roomJoined': {
        this.currentRoom = {
          roomId: payload.roomId,
          name: payload.name || 'Room',
          isHost: !!payload.isHost,
        };
        const occupants = typeof payload.occupants === 'number' ? payload.occupants : 1;
        const capacity = payload.capacity || 2;
        const waiting = occupants < capacity;
        this.setWaitingForOpponent(waiting);
        const logMessage = payload.created
          ? `Room "${this.currentRoom.name}" deployed. Waiting for an opponent.`
          : `Joined room "${this.currentRoom.name}"${waiting ? '. Awaiting opponent...' : '.'}`;
        this.addLog(logMessage, 'info');
        if (waiting) {
          this.turnInfo.textContent = 'Room ready. Waiting for an opponent to join.';
        }
        this.hideLobbyOverlay();
        this.updateLobbyInfo();
        this.refreshLobbyControls();
        this.updateStatus();
        break;
      }
      case 'roomLeft': {
        if (this.currentRoom && this.currentRoom.roomId === payload.roomId) {
          this.addLog('You left the room.', 'info');
        }
        this.currentRoom = null;
        this.setWaitingForOpponent(false);
        this.showLobbyOverlay();
        this.requestLobbyRooms();
        this.refreshLobbyControls();
        this.updateStatus();
        this.turnInfo.textContent = 'Left room. Select another to continue.';
        this.updateLobbyInfo('You left the room. Select or create another to begin.');
        break;
      }
      case 'roomClosed': {
        if (this.currentRoom && this.currentRoom.roomId === payload.roomId) {
          this.addLog('Room closed.', 'error');
        } else {
          this.addLog('A lobby room was closed.', 'info');
        }
        this.currentRoom = null;
        this.setWaitingForOpponent(false);
        this.showLobbyOverlay();
        this.requestLobbyRooms();
        this.refreshLobbyControls();
        this.updateStatus();
        this.turnInfo.textContent = 'Room closed. Select another or create a new one.';
        this.updateLobbyInfo('Room closed. Select another or create a new one.');
        break;
      }
      case 'playerAssignment':
        if (payload.player === null || payload.player === undefined) {
          this.playerNumber = null;
          this.updateStatus();
          break;
        }
        this.playerNumber = payload.player;
        this.state = 'placement';
        this.currentRoom = null;
        this.setWaitingForOpponent(false);
        this.lobbyRooms = [];
        this.renderLobbyRooms();
        this.hideLobbyOverlay();
        this.refreshLobbyControls();
        this.turnInfo.textContent = 'Deploy your fleet and lock it in.';
        this.addLog(`You are Player ${payload.player}.`, 'info');
        this.updateStatus();
        break;
      case 'waitingForOpponent':
        this.addLog('Awaiting an opponent...', 'info');
        this.opponentBadge.textContent = 'Waiting';
        this.setWaitingForOpponent(true);
        if (this.mode === 'pvp') {
          this.turnInfo.textContent = 'Awaiting an opponent to join your room.';
        }
        this.updateLobbyInfo();
        this.refreshLobbyControls();
        if (this.audio) {
          this.audio.playSfx('mode');
        }
        this.updateStatus();
        break;
      case 'opponentJoined':
        this.opponentConnected = true;
        this.opponentBadge.textContent = 'Opponent ready to place';
        this.addLog('Opponent joined the arena. Place your fleet!', 'success');
        this.setWaitingForOpponent(false);
        this.hideLobbyOverlay();
        this.refreshLobbyControls();
        if (this.audio) {
          this.audio.playSfx('opponent');
        }
        this.updateStatus();
        break;
      case 'layoutAccepted':
        this.layoutLocked = true;
        this.placementBadge.textContent = 'Locked In';
        this.placementBadge.classList.add('success');
        this.readyBtn.disabled = true;
        this.randomBtn.disabled = true;
        this.orientationBtn.disabled = true;
        this.resetBtn.textContent = 'Unlock Fleet';
        this.ownGrid.setInteractive(false);
        this.addLog('Fleet coordinates locked. Awaiting opponent.', 'info');
        if (this.audio) {
          this.audio.playSfx('lock');
        }
        this.updateStatus();
        break;
      case 'opponentReady':
        this.opponentReady = true;
        this.opponentBadge.textContent = 'Opponent locked in';
        this.opponentBadge.classList.add('success');
        this.addLog('Opponent locked their fleet.', 'info');
        if (this.audio) {
          this.audio.playSfx('opponent');
        }
        this.updateStatus();
        break;
      case 'opponentReset':
        this.opponentReady = false;
        this.opponentBadge.textContent = 'Opponent adjusting fleet';
        this.opponentBadge.classList.remove('success');
        this.addLog('Opponent is repositioning their fleet.', 'info');
        if (this.audio) {
          this.audio.playSfx('mode');
        }
        this.updateStatus();
        break;
      case 'resetAcknowledged':
        this.layoutLocked = false;
        this.resetPlacement();
        this.readyBtn.disabled = false;
        this.randomBtn.disabled = false;
        this.orientationBtn.disabled = false;
        this.resetBtn.textContent = 'Reset';
        this.placementBadge.textContent = 'Place ships';
        this.placementBadge.classList.remove('success');
        this.ownGrid.setInteractive(true);
        if (this.audio) {
          this.audio.playSfx('mode');
        }
        this.updateStatus();
        break;
      case 'gameStart':
        this.state = 'in-game';
        this.gameEnded = false;
        this.opponentBadge.textContent = 'Battle engaged';
        this.addLog('Battle commenced!', 'success');
        this.shotsTaken.clear();
        this.targetGrid.reset();
        this.currentRoom = null;
  this.setWaitingForOpponent(false);
        this.hideLobbyOverlay();
        this.refreshLobbyControls();
        if (payload.youStart) {
          this.isMyTurn = true;
          this.turnInfo.textContent = 'Your turn. Fire at will!';
        } else {
          this.isMyTurn = false;
          this.turnInfo.textContent = 'Opponent fires first.';
        }
        this.targetGrid.setInteractive(true);
        if (this.audio) {
          this.audio.playSfx('turn');
        }
        this.updateStatus();
        break;
      case 'yourTurn':
        this.isMyTurn = true;
        this.turnInfo.textContent = 'Your turn. Select a target cell.';
        if (this.audio) {
          this.audio.playSfx('turn');
        }
        this.updateStatus();
        break;
      case 'fireResult':
        this.processFireResult(payload);
        break;
      case 'opponentFire':
        this.processIncomingFire(payload);
        break;
      case 'gameOver':
        this.handleGameOver(payload.result);
        break;
      case 'opponentLeft':
        this.handleGameOver('win', 'Opponent disconnected.');
        this.currentRoom = null;
        this.setWaitingForOpponent(false);
        this.showLobbyOverlay();
        this.requestLobbyRooms();
        this.refreshLobbyControls();
        if (this.audio) {
          this.audio.playSfx('alert');
        }
        break;
      case 'error':
        this.addLog(`Error: ${payload.message}`, 'error');
        if (this.mode === 'pvp' && !this.playerNumber) {
          this.updateLobbyInfo(payload.message || 'Lobby error encountered.');
        }
        if (this.audio) {
          this.audio.playSfx('error');
        }
        break;
      default:
        console.warn('Unhandled message', payload);
    }
  }

  processFireResult(payload) {
    const key = `${payload.x},${payload.y}`;
    this.shotsTaken.add(key);
    if (payload.outcome === 'hit' || payload.outcome === 'sunk') {
      this.targetGrid.setCellState(payload.x, payload.y, payload.outcome === 'sunk' ? 'sunk' : 'hit');
      if (payload.ship && payload.ship.coordinates) {
        this.targetGrid.markSunkShip(payload.ship.coordinates, payload.ship.name);
      }
      this.addLog(`Direct hit at ${this.prettyCoord(payload.x, payload.y)}${payload.ship ? ` (${payload.ship.name})` : ''}.`, 'success');
    } else {
      this.targetGrid.setCellState(payload.x, payload.y, 'miss');
      this.addLog(`Splash at ${this.prettyCoord(payload.x, payload.y)}.`, 'info');
    }
    if (this.audio) {
      const outcomeCue = payload.outcome === 'sunk' ? 'sunk' : payload.outcome;
      this.audio.playSfx(outcomeCue);
    }
    if (payload.nextTurn && payload.nextTurn === this.playerNumber) {
      this.isMyTurn = true;
      this.turnInfo.textContent = 'Your turn. Choose another target.';
    } else if (!payload.nextTurn) {
      this.turnInfo.textContent = 'Engagement resolved.';
    } else {
      this.isMyTurn = false;
      this.turnInfo.textContent = "Opponent's turn.";
    }
    this.updateStatus();
  }

  processIncomingFire(payload) {
    if (payload.outcome === 'hit' || payload.outcome === 'sunk') {
      this.ownGrid.setCellState(payload.x, payload.y, payload.outcome === 'sunk' ? 'sunk' : 'hit');
      if (payload.ship && payload.ship.coordinates) {
        this.ownGrid.markSunkShip(payload.ship.coordinates, payload.ship.name);
      }
      this.addLog(`Incoming hit at ${this.prettyCoord(payload.x, payload.y)}.`, 'error');
    } else {
      this.ownGrid.setCellState(payload.x, payload.y, 'miss');
      this.addLog(`Incoming salvo missed at ${this.prettyCoord(payload.x, payload.y)}.`, 'info');
    }
    if (this.audio) {
      const outcomeCue = payload.outcome === 'sunk' ? 'sunk' : payload.outcome;
      this.audio.playSfx(outcomeCue);
    }

    if (payload.nextTurn && payload.nextTurn === this.playerNumber) {
      this.isMyTurn = true;
      this.turnInfo.textContent = 'Your turn. Return fire!';
    } else if (!payload.nextTurn) {
      this.turnInfo.textContent = 'Battle resolved.';
    } else {
      this.isMyTurn = false;
      this.turnInfo.textContent = "Opponent's turn.";
    }
    this.updateStatus();
  }

  handleGameOver(result, reasonMessage) {
    this.clearLocalTimers();
    this.gameEnded = true;
    if (this.mode === 'solo') {
      this.reportSoloResult(result);
    }
    this.targetGrid.setInteractive(false);
    this.isMyTurn = false;
    this.playAgainBtn.hidden = false;
    let message;
    if (result === 'win') {
      message = reasonMessage || 'Victory! You sank the enemy fleet.';
      this.addLog(message, 'win');
      this.turnInfo.textContent = 'Victory achieved.';
    } else {
      message = reasonMessage || 'Defeat. Enemy fleet stands.';
      this.addLog(message, 'lose');
      this.turnInfo.textContent = 'Defeated. Try again!';
    }
    if (this.audio) {
      this.audio.playSfx(result === 'win' ? 'victory' : 'defeat');
    }
    this.updateStatus();
  }

  handlePlacementClick({ x, y }) {
    if (this.currentShipIndex >= SHIPS.length) {
      return;
    }
    const ship = SHIPS[this.currentShipIndex];
    const coords = this.calculateCoordinates(x, y, ship.length, this.orientation);
    if (!coords) {
      this.addLog('Ship would extend beyond the board.', 'error');
      return;
    }
    if (coords.some((point) => this.occupiedCells.has(`${point.x},${point.y}`))) {
      this.addLog('Ships cannot overlap.', 'error');
      return;
    }

    coords.forEach((point) => this.occupiedCells.add(`${point.x},${point.y}`));
    this.placedShips.push({ name: ship.name, length: ship.length, coordinates: coords });
  this.ownGrid.paintShipCells(coords, ship.name);
    if (this.audio) {
      this.audio.playSfx('place');
    }
    this.currentShipIndex += 1;
    if (this.currentShipIndex >= SHIPS.length) {
      this.placementBadge.textContent = 'All ships placed';
      this.hintLine.textContent = 'Click "Lock In Fleet" to transmit your layout.';
    } else {
      const nextShip = SHIPS[this.currentShipIndex];
      this.hintLine.textContent = `Place your ${nextShip.name} (${nextShip.length} cells).`;
    }
    this.updateControls();
  }

  calculateCoordinates(startX, startY, length, orientation) {
    const coords = [];
    for (let i = 0; i < length; i += 1) {
      const x = orientation === 'horizontal' ? startX + i : startX;
      const y = orientation === 'horizontal' ? startY : startY + i;
      if (x > 9 || y > 9) {
        return null;
      }
      coords.push({ x, y });
    }
    return coords;
  }

  generateRandomFleet() {
    const placements = this.buildRandomFleetLayout();
    if (!placements) {
      this.addLog('Failed to randomize fleet. Try again.', 'error');
      return;
    }

    this.resetPlacement();
    placements.forEach((ship) => {
      ship.coordinates.forEach((point) => this.occupiedCells.add(`${point.x},${point.y}`));
  this.ownGrid.paintShipCells(ship.coordinates, ship.name);
    });
    this.placedShips = placements.map((ship) => ({
      name: ship.name,
      length: ship.length,
      coordinates: ship.coordinates.map((coord) => ({ ...coord })),
    }));
    this.currentShipIndex = SHIPS.length;
    this.placementBadge.textContent = 'All ships placed';
    this.hintLine.textContent = 'Click "Lock In Fleet" to transmit your layout.';
    if (this.audio) {
      this.audio.playSfx('place');
    }
    this.updateControls();
  }

  resetPlacement() {
    this.ownGrid.reset();
    this.placedShips = [];
    this.occupiedCells.clear();
    this.currentShipIndex = 0;
    this.layoutLocked = false;
    this.ownGrid.setInteractive(true);
    this.readyBtn.disabled = false;
    this.randomBtn.disabled = false;
    this.orientationBtn.disabled = false;
    this.resetBtn.textContent = 'Reset';
    this.placementBadge.textContent = 'Place ships';
    this.placementBadge.classList.remove('success');
    this.orientationBtn.textContent = `Orientation: ${this.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}`;
    this.hintLine.textContent = 'Select a cell to place your Carrier (5 cells).';
    this.updateStatus();
  }

  buildRandomFleetLayout() {
    const placements = [];
    const filled = new Set();

    for (const ship of SHIPS) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 500) {
        attempts += 1;
        const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        const maxX = orientation === 'horizontal' ? 10 - ship.length : 9;
        const maxY = orientation === 'horizontal' ? 9 : 10 - ship.length;
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        const coords = this.calculateCoordinates(x, y, ship.length, orientation);
        if (!coords || coords.some((point) => filled.has(`${point.x},${point.y}`))) {
          continue;
        }
        coords.forEach((point) => filled.add(`${point.x},${point.y}`));
        placements.push({
          name: ship.name,
          length: ship.length,
          coordinates: coords.map((coord) => ({ ...coord })),
        });
        placed = true;
      }
      if (!placed) {
        return null;
      }
    }

    return placements;
  }

  createBoardState(fleet) {
    const ships = fleet.map((ship) => ({
      name: ship.name,
      length: ship.length,
      coordinates: ship.coordinates.map((coord) => ({ ...coord })),
      hits: new Set(),
    }));

    const occupied = new Map();
    ships.forEach((ship) => {
      ship.coordinates.forEach(({ x, y }) => {
        occupied.set(`${x},${y}`, ship);
      });
    });

    return {
      ships,
      occupied,
      shots: new Map(),
    };
  }

  isWithinBounds(x, y) {
    return x >= 0 && x < 10 && y >= 0 && y < 10;
  }

  resetAiTargeting() {
    if (!this.localGame || this.localGame.type !== 'solo') {
      return;
    }
    this.localGame.aiTargetQueue = [];
    this.localGame.aiTargetSet = new Set();
  }

  enqueueAiTarget(board, x, y) {
    if (!this.localGame || this.localGame.type !== 'solo') {
      return;
    }
    if (!this.isWithinBounds(x, y)) {
      return;
    }
    const key = `${x},${y}`;
    if (board && board.shots && board.shots.has(key)) {
      return;
    }
    if (!Array.isArray(this.localGame.aiTargetQueue)) {
      this.localGame.aiTargetQueue = [];
    }
    if (!this.localGame.aiTargetSet || typeof this.localGame.aiTargetSet.has !== 'function') {
      this.localGame.aiTargetSet = new Set();
    }
    if (this.localGame.aiTargetSet.has(key)) {
      return;
    }
    this.localGame.aiTargetQueue.push(key);
    this.localGame.aiTargetSet.add(key);
  }

  popNextAiTarget(board) {
    if (!this.localGame || this.localGame.type !== 'solo') {
      return null;
    }
    if (!Array.isArray(this.localGame.aiTargetQueue)) {
      this.localGame.aiTargetQueue = [];
      return null;
    }
    while (this.localGame.aiTargetQueue.length > 0) {
      const key = this.localGame.aiTargetQueue.shift();
      if (this.localGame.aiTargetSet && typeof this.localGame.aiTargetSet.delete === 'function') {
        this.localGame.aiTargetSet.delete(key);
      }
      if (board && board.shots && board.shots.has(key)) {
        continue;
      }
      const [rawX, rawY] = key.split(',').map(Number);
      if (Number.isInteger(rawX) && Number.isInteger(rawY) && this.isWithinBounds(rawX, rawY)) {
        return { x: rawX, y: rawY };
      }
    }
    return null;
  }

  pruneAiQueueToOrientation(board, hits, orientation) {
    if (!this.localGame || this.localGame.type !== 'solo' || !Array.isArray(this.localGame.aiTargetQueue)) {
      return;
    }
    const anchor = orientation === 'vertical' ? hits[0].x : hits[0].y;
    const filtered = [];
    this.localGame.aiTargetQueue.forEach((key) => {
      if (board && board.shots && board.shots.has(key)) {
        if (this.localGame.aiTargetSet) {
          this.localGame.aiTargetSet.delete(key);
        }
        return;
      }
      const [qx, qy] = key.split(',').map(Number);
      if (orientation === 'vertical') {
        if (qx !== anchor) {
          if (this.localGame.aiTargetSet) {
            this.localGame.aiTargetSet.delete(key);
          }
          return;
        }
      } else if (qy !== anchor) {
        if (this.localGame.aiTargetSet) {
          this.localGame.aiTargetSet.delete(key);
        }
        return;
      }
      filtered.push(key);
    });
    this.localGame.aiTargetQueue = filtered;
  }

  handleAiShotOutcome(board, target, ship, outcome) {
    if (!this.localGame || this.localGame.type !== 'solo' || !ship) {
      return;
    }
    if (outcome === 'sunk') {
      this.resetAiTargeting();
      return;
    }

    const hits = Array.from(ship.hits || []).map((key) => {
      const [hx, hy] = key.split(',').map(Number);
      return { x: hx, y: hy };
    });

    if (hits.length === 0) {
      return;
    }

    let candidates = [];
    if (hits.length >= 2) {
      const vertical = hits.every((point) => point.x === hits[0].x);
      if (vertical) {
        const ys = hits.map((point) => point.y);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        this.pruneAiQueueToOrientation(board, hits, 'vertical');
        candidates = [
          { x: hits[0].x, y: minY - 1 },
          { x: hits[0].x, y: maxY + 1 },
        ];
      } else {
        const xs = hits.map((point) => point.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        this.pruneAiQueueToOrientation(board, hits, 'horizontal');
        candidates = [
          { x: minX - 1, y: hits[0].y },
          { x: maxX + 1, y: hits[0].y },
        ];
      }
    } else {
      candidates = [
        { x: target.x + 1, y: target.y },
        { x: target.x - 1, y: target.y },
        { x: target.x, y: target.y + 1 },
        { x: target.x, y: target.y - 1 },
      ];
    }

    candidates.forEach(({ x, y }) => this.enqueueAiTarget(board, x, y));
  }

  chooseRandomTarget(board) {
    const candidates = [];
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        const key = `${x},${y}`;
        if (!board.shots.has(key)) {
          candidates.push({ x, y });
        }
      }
    }
    if (candidates.length === 0) {
      return null;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  allShipsSunk(board) {
    return board.ships.every((ship) => ship.hits.size === ship.length);
  }

  clearLocalTimers() {
    this.localTimers.forEach((timer) => clearTimeout(timer));
    this.localTimers.clear();
  }

  handleFire({ x, y }) {
    const key = `${x},${y}`;
    if (this.shotsTaken.has(key)) {
      this.addLog('Coordinate already targeted.', 'error');
      return;
    }
    if (this.mode === 'pvp') {
      if (this.audio) {
        this.audio.playSfx('fire');
      }
      this.send({ type: 'fire', x, y });
      this.isMyTurn = false;
      this.turnInfo.textContent = 'Coordinates transmitted...';
      this.updateStatus();
    } else if (this.mode === 'solo') {
      if (this.audio) {
        this.audio.playSfx('fire');
      }
      this.processLocalPlayerFire(x, y);
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  serializeShips() {
    return this.placedShips.map((ship) => ({
      name: ship.name,
      coordinates: ship.coordinates,
    }));
  }

  prettyCoord(x, y) {
    return `${String.fromCharCode(65 + x)}${y + 1}`;
  }

  addLog(message, level = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.textContent = `[${timestamp}] ${message}`;
    this.logPanel.appendChild(entry);
    while (this.logPanel.children.length > this.logLimit) {
      this.logPanel.removeChild(this.logPanel.firstChild);
    }
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
  }

  updateStatus() {
    const status = [];
    if (this.profile) {
      const trimmedName = this.profile.name && this.profile.name.trim() ? this.profile.name.trim() : '';
      const label = trimmedName ? `Commander ${trimmedName}` : 'Commander unassigned';
      status.push(this.buildBadge(label, trimmedName ? 'success' : 'info'));
    }
    if (!this.mode) {
      status.push(this.buildBadge('Choose a mode to begin', 'info'));
    } else if (this.mode === 'pvp') {
      if (!this.playerNumber) {
        status.push(this.buildBadge('Awaiting assignment', 'info'));
      } else {
        status.push(this.buildBadge(`You are Player ${this.playerNumber}`, 'info'));
      }
      status.push(this.buildBadge(this.layoutLocked ? 'Fleet locked' : 'Placing fleet', this.layoutLocked ? 'success' : 'info'));
      status.push(this.buildBadge(this.opponentConnected ? 'Opponent connected' : 'No opponent yet', this.opponentConnected ? 'success' : 'info'));
      if (this.opponentReady) {
        status.push(this.buildBadge('Opponent ready', 'success'));
      }
      if (this.currentRoom && !this.playerNumber) {
        status.push(this.buildBadge(`Room: ${this.currentRoom.name}`, 'info'));
        status.push(
          this.buildBadge(
            this.waitingForOpponent ? 'Waiting for opponent' : 'Opponent found',
            this.waitingForOpponent ? 'info' : 'success',
          ),
        );
      } else if (!this.playerNumber && !this.currentRoom) {
        status.push(this.buildBadge('In lobby', 'info'));
      }
      if (this.isMyTurn && !this.gameEnded) {
        status.push(this.buildBadge('Your turn', 'success'));
      } else if (!this.gameEnded && this.layoutLocked && this.opponentReady) {
        status.push(this.buildBadge("Opponent's turn", 'info'));
      }
      if (this.gameEnded) {
        status.push(this.buildBadge('Game complete', 'success'));
      }
    } else if (this.mode === 'solo') {
      status.push(this.buildBadge('Solo vs AI', 'info'));
      status.push(this.buildBadge(this.layoutLocked ? 'Fleet locked' : 'Placing fleet', this.layoutLocked ? 'success' : 'info'));
      status.push(this.buildBadge(this.opponentReady ? 'AI ready' : 'AI preparing', this.opponentReady ? 'success' : 'info'));
      if (this.state === 'in-game' && !this.gameEnded) {
        status.push(this.buildBadge(this.isMyTurn ? 'Your turn' : "AI's turn", this.isMyTurn ? 'success' : 'info'));
      }
      if (this.gameEnded) {
        status.push(this.buildBadge('Battle complete', 'success'));
      }
    } else if (this.mode === 'spectate') {
      status.push(this.buildBadge('Spectator mode', 'info'));
      status.push(this.buildBadge(this.gameEnded ? 'Match complete' : 'Match in progress', this.gameEnded ? 'success' : 'info'));
    }
    this.statusLine.innerHTML = '';
    status.forEach((badge) => this.statusLine.appendChild(badge));
    if (this.mode !== 'spectate') {
      this.updateHint();
    }
    this.updateControls();
    if (this.mode === 'pvp') {
      this.refreshLobbyControls();
      this.updateLobbyInfo();
    }
    this.updateChatVisibility();
    this.updateChatInputState();
    this.updateSudokuButtonAttention();
  }

  updateHint() {
    if (this.layoutLocked) {
      return;
    }
    if (this.currentShipIndex < SHIPS.length) {
      const remaining = SHIPS[this.currentShipIndex];
      this.hintLine.textContent = `Place your ${remaining.name} (${remaining.length} cells) facing ${this.orientation}.`;
    }
  }

  updateControls() {
    if (!this.orientationBtn || !this.randomBtn || !this.readyBtn || !this.resetBtn) {
      return;
    }

    if (this.mode === 'spectate') {
      this.orientationBtn.disabled = true;
      this.randomBtn.disabled = true;
      this.readyBtn.disabled = true;
      this.resetBtn.disabled = true;
      if (this.targetGrid) {
        this.targetGrid.setInteractive(false);
      }
      this.refreshAudioControls();
      return;
    }

    const inPlacement = this.state === 'placement' && !this.layoutLocked;
    const allShipsPlaced = this.placedShips.length === SHIPS.length;
    const canTarget = this.state === 'in-game' && this.opponentReady && this.isMyTurn && !this.gameEnded;

    this.orientationBtn.disabled = !inPlacement;
    this.randomBtn.disabled = !inPlacement;
    this.readyBtn.disabled = !inPlacement || !allShipsPlaced;
    this.resetBtn.disabled = false;

    if (this.targetGrid) {
      this.targetGrid.setInteractive(canTarget);
    }

    this.refreshAudioControls();
  }

  buildBadge(text, variant) {
    const badge = document.createElement('span');
    badge.className = `badge ${variant}`;
    badge.textContent = text;
    return badge;
  }
}

customElements.define('game-app', GameApp);
