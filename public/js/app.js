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
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
    }
    this.musicTimer = setInterval(() => {
      this.playMusicStep();
    }, 750);
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
}

class BattleGrid extends HTMLElement {
  static get observedAttributes() {
    return ['mode'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.cells = new Map();
    this.mode = this.getAttribute('mode') || 'placement';
    this.interactive = true;
    this.render();
  }

  attributeChangedCallback(name, _old, value) {
    if (name === 'mode') {
      this.mode = value;
      this.updateMode();
    }
  }

  connectedCallback() {
    this.updateMode();
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
        .cell {
          position: relative;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(78, 220, 255, 0.05);
          cursor: pointer;
          transition: background 160ms ease, transform 120ms ease, border 160ms ease, box-shadow 160ms ease;
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
          transition: opacity 180ms ease;
        }
        .cell.ship {
          background: rgba(78, 220, 255, 0.18);
          border-color: rgba(78, 220, 255, 0.35);
        }
        :host([mode='target']) .cell.ship {
          background: rgba(78, 220, 255, 0.05);
          border-color: rgba(78, 220, 255, 0.05);
        }
        .cell.hit {
          background: rgba(255, 99, 132, 0.25);
          border-color: rgba(255, 99, 132, 0.5);
          box-shadow: 0 6px 20px rgba(255, 99, 132, 0.25);
        }
        .cell.hit::after {
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0));
          opacity: 0.65;
        }
        .cell.miss {
          background: rgba(132, 188, 255, 0.16);
          border-color: rgba(132, 188, 255, 0.3);
        }
        .cell.sunk {
          background: linear-gradient(135deg, rgba(255, 117, 140, 0.4), rgba(255, 255, 255, 0.12));
          border-color: rgba(255, 117, 140, 0.65);
          box-shadow: 0 0 20px rgba(255, 117, 140, 0.35);
        }
        .cell:hover::after {
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
        <div class="grid" part="grid"></div>
        <div class="labels bottom">
          ${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}</span>`).join('')}
        </div>
      </div>
    `;

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.container = this.shadowRoot.querySelector('.grid-shell');
    this.gridElement = this.shadowRoot.querySelector('.grid');

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

  reset() {
    this.cells.forEach((cell) => {
      cell.classList.remove('ship', 'hit', 'miss', 'sunk');
    });
  }

  setCellState(x, y, state) {
    const cell = this.cells.get(`${x},${y}`);
    if (!cell) {
      return;
    }
    cell.classList.remove('ship', 'hit', 'miss', 'sunk');
    if (state && state !== 'empty') {
      cell.classList.add(state);
    }
  }

  paintShipCells(coordinates) {
    coordinates.forEach(({ x, y }) => {
      this.setCellState(x, y, 'ship');
    });
  }

  markSunkShip(coordinates) {
    coordinates.forEach(({ x, y }) => {
      this.setCellState(x, y, 'sunk');
    });
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
    this.render();
  }

  connectedCallback() {
    this.bindElements();
    this.showModeOverlay();
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
      </style>
      <div class="shell">
        <header>
          <h1>Battleship Arena</h1>
          <div class="header-tools">
            <div class="status-line" id="statusLine"></div>
            <div class="audio-controls">
              <button id="sfxToggleBtn">SFX: Off</button>
              <button id="musicToggleBtn">Music: Off</button>
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
    `;
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  bindElements() {
    this.statusLine = this.shadowRoot.querySelector('#statusLine');
    this.placementBadge = this.shadowRoot.querySelector('#placementBadge');
    this.opponentBadge = this.shadowRoot.querySelector('#opponentBadge');
    this.turnInfo = this.shadowRoot.querySelector('#turnInfo');
    this.hintLine = this.shadowRoot.querySelector('#hintLine');
    this.logPanel = this.shadowRoot.querySelector('#logPanel');
    this.playAgainBtn = this.shadowRoot.querySelector('#playAgainBtn');

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
    if (this.orientationBtn) {
      this.orientationBtn.textContent = 'Orientation: Horizontal';
    }
    this.updateControls();
  }

  preparePvpMode() {
    this.addLog('Online PvP mode selected. Connecting to server...', 'info');
    this.connect();
    if (this.audio) {
      this.audio.playSfx('mode');
    }
  }

  prepareSoloMode() {
    this.playerNumber = 1;
    this.opponentConnected = true;
    this.addLog('Solo vs AI commander. Deploy your fleet.', 'info');
    this.opponentBadge.textContent = 'AI preparing layout';
    this.opponentBadge.classList.remove('success');
    this.localGame = {
      type: 'solo',
      aiBoard: null,
      playerBoard: null,
    };
    this.updateHint();
    this.updateControls();
    if (this.audio) {
      this.audio.playSfx('mode');
    }
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
    const payload = {
      x,
      y,
      outcome: outcome === 'sunk' ? 'sunk' : outcome,
      ship: sunkShip ? { name: sunkShip.name, coordinates: sunkShip.coordinates } : null,
      nextTurn: allSunk ? null : 2,
    };

    this.processFireResult(payload);

    if (allSunk) {
      this.handleServerEvent({ type: 'gameOver', result: 'win' });
    } else {
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
    const target = this.chooseRandomTarget(board);
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
    } else {
      board.shots.set(key, 'miss');
    }

    const allSunk = this.allShipsSunk(board);
    const payload = {
      x: target.x,
      y: target.y,
      outcome: outcome === 'sunk' ? 'sunk' : outcome,
      ship: sunkShip ? { name: sunkShip.name, coordinates: sunkShip.coordinates } : null,
      nextTurn: allSunk ? null : 1,
    };

    this.processIncomingFire(payload);

    if (allSunk) {
      this.handleServerEvent({ type: 'gameOver', result: 'lose' });
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
    alphaFleet.forEach((ship) => this.ownGrid.paintShipCells(ship.coordinates));
    betaFleet.forEach((ship) => this.targetGrid.paintShipCells(ship.coordinates));

    this.addLog(`${this.localGame.names[this.localGame.turn]} has the initiative.`, 'info');
    this.turnInfo.textContent = `${this.localGame.names[this.localGame.turn]} is lining up the first volley.`;
    this.startSpectatorMatch();
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
      grid.markSunkShip(sunkShip.coordinates);
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

    this.localGame.turn = defenderIndex;
    this.turnInfo.textContent = `${this.localGame.names[this.localGame.turn]} prepares to return fire.`;
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
    this.ws = new WebSocket(wsUrl);
    this.addLog('Connecting to command server...', 'info');

    this.ws.addEventListener('open', () => {
      this.state = 'placement';
      this.addLog('Connected. Waiting for assignment...', 'info');
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
      this.updateStatus();
    });

    this.ws.addEventListener('error', () => {
      this.addLog('Connection error encountered.', 'error');
    });
  }

  handleServerEvent(payload) {
    switch (payload.type) {
      case 'playerAssignment':
        this.playerNumber = payload.player;
        this.addLog(`You are Player ${payload.player}.`, 'info');
        this.updateStatus();
        break;
      case 'waitingForOpponent':
        this.addLog('Awaiting an opponent...', 'info');
        this.opponentBadge.textContent = 'Waiting';
        if (this.audio) {
          this.audio.playSfx('mode');
        }
        this.updateStatus();
        break;
      case 'opponentJoined':
        this.opponentConnected = true;
        this.opponentBadge.textContent = 'Opponent ready to place';
        this.addLog('Opponent joined the arena. Place your fleet!', 'success');
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
        if (this.audio) {
          this.audio.playSfx('alert');
        }
        break;
      case 'error':
        this.addLog(`Error: ${payload.message}`, 'error');
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
        this.targetGrid.markSunkShip(payload.ship.coordinates);
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
        this.ownGrid.markSunkShip(payload.ship.coordinates);
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
    this.ownGrid.paintShipCells(coords);
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
      this.ownGrid.paintShipCells(ship.coordinates);
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
