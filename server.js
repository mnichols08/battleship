const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(PUBLIC_DIR, url.pathname);

  if (url.pathname === '/') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    stream.pipe(res);
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.destroy();
    return;
  }

  const acceptKey = req.headers['sec-websocket-key'];
  if (!acceptKey) {
    socket.destroy();
    return;
  }

  const hash = crypto
    .createHash('sha1')
    .update(acceptKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
  ];

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

  const connection = new WebSocketConnection(socket);
  if (head && head.length > 0) {
    connection.handleData(head);
  }
  gameManager.addConnection(connection);
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    const listener = server.listen(port, () => {
      const address = listener.address();
      const actualPort = typeof address === 'string' ? port : address.port;
      console.log(`Battleship server running at http://localhost:${actualPort}`);
      resolve(listener);
    });
  });
}

if (require.main === module) {
  startServer();
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

class WebSocketConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.isOpen = true;
    this.onMessageHandlers = [];
    this.onCloseHandlers = [];

    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('end', () => this.handleClose());
    socket.on('close', () => this.handleClose());
    socket.on('error', () => this.handleClose());
  }

  onMessage(handler) {
    this.onMessageHandlers.push(handler);
  }

  onClose(handler) {
    this.onCloseHandlers.push(handler);
  }

  send(payload) {
    if (!this.isOpen) {
      return;
    }

    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const frame = encodeFrame(Buffer.from(data));
    this.socket.write(frame);
  }

  close(code = 1000, reason = '') {
    if (!this.isOpen) {
      return;
    }
    const reasonLength = Buffer.byteLength(reason);
    const buffer = Buffer.alloc(2 + reasonLength);
    buffer.writeUInt16BE(code, 0);
    if (reasonLength > 0) {
      buffer.write(reason, 2);
    }
    const frame = encodeFrame(buffer, { opcode: 0x8 });
    this.socket.write(frame);
    this.isOpen = false;
    this.socket.end();
    this.onCloseHandlers.forEach((handler) => handler());
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const frame = decodeFrame(this.buffer);
      if (!frame) {
        break;
      }

      this.buffer = this.buffer.slice(frame.frameLength);

      switch (frame.opcode) {
        case 0x1: {
          const message = frame.payload.toString('utf8');
          this.onMessageHandlers.forEach((handler) => handler(message));
          break;
        }
        case 0x8: {
          this.close();
          break;
        }
        case 0x9: {
          // ping
          const pongFrame = encodeFrame(frame.payload, { opcode: 0xA });
          this.socket.write(pongFrame);
          break;
        }
        case 0xA:
          // pong, ignore
          break;
        default:
          // unsupported opcode, close connection
          this.close(1003, 'Unsupported frame');
          break;
      }
    }
  }

  handleClose() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.onCloseHandlers.forEach((handler) => handler());
  }
}

function decodeFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const opcode = firstByte & 0x0f;
  const isMasked = (secondByte & 0x80) === 0x80;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    payloadLength = high * 2 ** 32 + low;
    offset += 8;
  }

  const maskLength = isMasked ? 4 : 0;

  if (buffer.length < offset + maskLength + payloadLength) {
    return null;
  }

  let payload;
  if (isMasked) {
    const maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
    payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i += 1) {
      payload[i] = buffer[offset + i] ^ maskingKey[i % 4];
    }
  } else {
    payload = buffer.slice(offset, offset + payloadLength);
  }

  return {
    opcode,
    payload,
    frameLength: offset + payloadLength,
  };
}

function encodeFrame(dataBuffer, options = {}) {
  const opcode = options.opcode !== undefined ? options.opcode : 0x1;
  const payloadLength = dataBuffer.length;
  let header;

  if (payloadLength < 126) {
    header = Buffer.alloc(2);
    header[1] = payloadLength;
  } else if (payloadLength < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    const high = Math.floor(payloadLength / 2 ** 32);
    const low = payloadLength & 0xffffffff;
    header.writeUInt32BE(high, 2);
    header.writeUInt32BE(low, 6);
  }

  header[0] = 0x80 | (opcode & 0x0f);

  return Buffer.concat([header, dataBuffer]);
}

class Player {
  constructor(connection) {
    this.connection = connection;
    this.index = null; // 0 or 1 within a game
    this.game = null;
    this.ready = false;
    this.ships = [];
    this.name = `Player-${Math.random().toString(16).slice(2, 6)}`;
    this.roomId = null;
    this.isRoomHost = false;
  }

  send(type, payload = {}) {
    this.connection.send({ type, ...payload });
  }

  close(code, reason) {
    this.connection.close(code, reason);
  }
}

class Game {
  constructor(playerA, playerB) {
    this.players = [playerA, playerB];
    this.boards = [createEmptyBoard(), createEmptyBoard()];
    this.turn = 0; // index of player whose turn it is
    this.active = true;

    playerA.index = 0;
    playerB.index = 1;
    playerA.game = this;
    playerB.game = this;

    this.players.forEach((player) => {
      player.ready = false;
      player.ships = [];
    });
  }

  setShips(player, shipsPayload) {
    const board = createEmptyBoard();
    const placedShips = [];
    const occupied = new Map();

    const expectedShips = [
      { name: 'Carrier', length: 5 },
      { name: 'Battleship', length: 4 },
      { name: 'Cruiser', length: 3 },
      { name: 'Submarine', length: 3 },
      { name: 'Destroyer', length: 2 },
    ];

    if (!Array.isArray(shipsPayload) || shipsPayload.length !== expectedShips.length) {
      return { ok: false, message: 'Invalid ship layout.' };
    }

    for (const shipDef of expectedShips) {
      const shipPayload = shipsPayload.find((ship) => ship.name === shipDef.name);
      if (!shipPayload) {
        return { ok: false, message: `Missing ship: ${shipDef.name}` };
      }
      if (!Array.isArray(shipPayload.coordinates) || shipPayload.coordinates.length !== shipDef.length) {
        return { ok: false, message: `Invalid coordinates for ${shipDef.name}` };
      }

      const coords = shipPayload.coordinates.map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
      }));

      if (coords.some((pt) => Number.isNaN(pt.x) || Number.isNaN(pt.y))) {
        return { ok: false, message: 'Invalid coordinate values.' };
      }

      if (!areCoordinatesAligned(coords)) {
        return { ok: false, message: `${shipDef.name} must be placed in a straight line.` };
      }

      if (!areCoordinatesConsecutive(coords)) {
        return { ok: false, message: `${shipDef.name} must be consecutive.` };
      }

      for (const coord of coords) {
        if (coord.x < 0 || coord.x > 9 || coord.y < 0 || coord.y > 9) {
          return { ok: false, message: 'Ship out of bounds.' };
        }
        const key = `${coord.x},${coord.y}`;
        if (occupied.has(key)) {
          return { ok: false, message: 'Ships cannot overlap.' };
        }
        occupied.set(key, shipDef.name);
        board.grid[coord.y][coord.x] = 1;
      }

      placedShips.push({
        name: shipDef.name,
        length: shipDef.length,
        coordinates: coords,
        hits: new Set(),
      });
    }

    board.ships = placedShips;
    player.ships = placedShips;
    board.occupied = occupied;
    board.shotsReceived = new Map();
    this.boards[player.index] = board;
    player.ready = true;

    const readyState = this.players.map((p) => p.ready);
    if (readyState.every(Boolean) && this.active) {
      this.players[this.turn].send('gameStart', { youStart: true });
      this.players[1 - this.turn].send('gameStart', { youStart: false });
      this.players[this.turn].send('yourTurn', {});
    }

    return { ok: true };
  }

  handleFire(player, x, y) {
    if (!this.active) {
      return { ok: false, message: 'Game is not active.' };
    }

    if (!this.players.every((p) => p.ready)) {
      return { ok: false, message: 'Both players must place ships first.' };
    }

    if (player.index !== this.turn) {
      return { ok: false, message: 'Not your turn.' };
    }

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 9 || y < 0 || y > 9) {
      return { ok: false, message: 'Invalid shot coordinates.' };
    }

    const opponentIndex = 1 - player.index;
    const opponentBoard = this.boards[opponentIndex];
    const key = `${x},${y}`;

    if (opponentBoard.shotsReceived.has(key)) {
      return { ok: false, message: 'Already fired at that location.' };
    }

    const shipName = opponentBoard.occupied.get(key);
    let result = 'miss';
    let sunkShip = null;

    opponentBoard.shotsReceived.set(key, shipName ? 'hit' : 'miss');

    if (shipName) {
      result = 'hit';
      const ship = opponentBoard.ships.find((s) => s.name === shipName);
      ship.hits.add(key);
      if (ship.hits.size === ship.length) {
        result = 'sunk';
        sunkShip = ship;
      }
    }

    const allSunk = opponentBoard.ships.every((ship) => ship.hits.size === ship.length);
    const nextTurnIndex = allSunk ? null : result === 'miss' ? opponentIndex : player.index;
    const nextTurnValue = nextTurnIndex === null ? null : nextTurnIndex + 1;

    this.players[player.index].send('fireResult', {
      x,
      y,
      outcome: result,
      ship: sunkShip ? { name: sunkShip.name, coordinates: sunkShip.coordinates } : null,
      nextTurn: nextTurnValue,
    });

    this.players[opponentIndex].send('opponentFire', {
      x,
      y,
      outcome: result,
      ship: sunkShip ? { name: sunkShip.name, coordinates: sunkShip.coordinates } : null,
      nextTurn: nextTurnValue,
    });

    if (allSunk) {
      this.active = false;
      this.players[player.index].send('gameOver', { result: 'win' });
      this.players[opponentIndex].send('gameOver', { result: 'lose' });
      this.players.forEach((p) => {
        p.game = null;
        p.ready = false;
      });
      return { ok: true, gameEnded: true };
    }

    this.turn = nextTurnIndex;
    if (this.turn !== null && this.turn !== undefined) {
      this.players[this.turn].send('yourTurn', {});
    }
    return { ok: true, gameEnded: false };
  }

  handleDisconnect(player) {
    if (!this.active) {
      return;
    }
    const opponent = this.players.find((p) => p !== player);
    if (opponent) {
      opponent.send('opponentLeft', {});
      opponent.game = null;
      opponent.ready = false;
    }
    player.game = null;
    player.ready = false;
    this.active = false;
  }
}

class GameManager {
  constructor() {
    this.players = new Set();
    this.rooms = new Map();
    this.games = new Set();
    this.lobbyMusic = null;
  }

  addConnection(connection) {
    const player = new Player(connection);
    this.players.add(player);

    connection.onMessage((msg) => {
      this.handleMessage(player, msg);
    });
    connection.onClose(() => {
      this.handleDisconnect(player);
    });

    player.send('playerAssignment', { player: null });
    this.sendLobbySnapshot(player);
    this.sendLobbyMusicSnapshot(player);
  }

  handleMessage(player, rawMessage) {
    let payload;
    try {
      payload = JSON.parse(rawMessage);
    } catch (err) {
      player.send('error', { message: 'Invalid JSON payload.' });
      return;
    }

    const { type } = payload;
    switch (type) {
      case 'createRoom':
        this.createRoom(player, payload.name);
        break;
      case 'joinRoom':
        this.joinRoom(player, payload.roomId);
        break;
      case 'leaveRoom':
        this.leaveRoom(player);
        break;
      case 'listRooms':
        this.sendLobbySnapshot(player);
        break;
      case 'placeShips': {
        if (!player.game) {
          player.send('error', { message: 'No active game.' });
          return;
        }
        const result = player.game.setShips(player, payload.ships);
        if (!result.ok) {
          player.send('error', { message: result.message });
        } else {
          player.send('layoutAccepted', {});
          const opponent = player.game.players[1 - player.index];
          opponent.send('opponentReady', {});
        }
        break;
      }
      case 'fire': {
        if (!player.game) {
          player.send('error', { message: 'No active game.' });
          return;
        }
        const game = player.game;
        const result = game.handleFire(player, payload.x, payload.y);
        if (!result.ok) {
          player.send('error', { message: result.message });
        } else if (result.gameEnded) {
          this.games.delete(game);
        }
        break;
      }
      case 'resetPlacement': {
        player.ready = false;
        player.ships = [];
        player.send('resetAcknowledged', {});
        if (player.game) {
          const opponent = player.game.players[1 - player.index];
          if (opponent && opponent.ready) {
            opponent.send('opponentReset', {});
          }
        }
        break;
      }
      case 'musicLabShare':
        this.handleMusicLabShare(player, payload);
        break;
      default:
        player.send('error', { message: 'Unknown message type.' });
    }
  }

  createRoom(player, rawName) {
    if (player.game) {
      player.send('error', { message: 'Cannot create a room while a match is active.' });
      return;
    }

    if (player.roomId) {
      this.leaveRoom(player, { silent: true });
    }

    const name = typeof rawName === 'string' ? rawName.trim().slice(0, 48) : '';
    const roomName = name || `${player.name}'s Room`;
    const roomId = `room-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
    const room = {
      id: roomId,
      name: roomName,
      players: [],
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.joinRoom(player, roomId, { createdRoom: true });
  }

  joinRoom(player, roomId, options = {}) {
    if (player.game) {
      player.send('error', { message: 'Cannot join a room while a match is active.' });
      return;
    }

    if (!roomId || typeof roomId !== 'string') {
      player.send('error', { message: 'Invalid room identifier.' });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      player.send('error', { message: 'Room no longer exists.' });
      this.sendLobbySnapshot(player);
      return;
    }

    if (room.players.includes(player)) {
      player.send('roomJoined', {
        roomId: room.id,
        name: room.name,
        occupants: room.players.length,
        isHost: player.isRoomHost,
      });
      return;
    }

    if (room.players.length >= 2) {
      player.send('error', { message: 'Room is full.' });
      this.sendLobbySnapshot(player);
      return;
    }

    if (player.roomId && player.roomId !== roomId) {
      this.leaveRoom(player, { silent: true });
    }

    room.players.push(player);
    player.roomId = room.id;
    player.isRoomHost = room.players.length === 1;

    player.send('roomJoined', {
      roomId: room.id,
      name: room.name,
      occupants: room.players.length,
      isHost: player.isRoomHost,
      created: !!options.createdRoom,
    });

    if (room.players.length === 1) {
      player.send('waitingForOpponent', {});
    }

    this.sendLobbyUpdate();

    if (room.players.length === 2) {
      this.startGame(room);
    }
  }

  leaveRoom(player, options = {}) {
    const roomId = player.roomId;
    if (!roomId) {
      return;
    }

    const room = this.rooms.get(roomId);
    player.roomId = null;
    player.isRoomHost = false;

    if (!room) {
      if (!options.silent) {
        player.send('roomLeft', { roomId });
      }
      this.sendLobbyUpdate();
      return;
    }

    room.players = room.players.filter((p) => p !== player);

    if (!options.silent) {
      player.send('roomLeft', { roomId });
    }

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    } else {
      const remainingPlayers = [...room.players];
      this.rooms.delete(roomId);
      remainingPlayers.forEach((p) => {
        p.roomId = null;
        p.isRoomHost = false;
        p.send('roomClosed', { roomId });
      });
    }

    this.sendLobbyUpdate();
  }

  startGame(room) {
    this.rooms.delete(room.id);
    const [playerA, playerB] = room.players;

    playerA.roomId = null;
    playerB.roomId = null;
    playerA.isRoomHost = false;
    playerB.isRoomHost = false;

    const game = new Game(playerA, playerB);
    this.games.add(game);

    playerA.send('playerAssignment', { player: 1 });
    playerB.send('playerAssignment', { player: 2 });
    playerA.send('opponentJoined', {});
    playerB.send('opponentJoined', {});

    this.sendLobbyUpdate();
  }

  sendLobbySnapshot(player) {
    player.send('lobbyUpdate', { rooms: this.buildLobbyRooms() });
  }

  sendLobbyUpdate() {
    const rooms = this.buildLobbyRooms();
    this.players.forEach((player) => {
      if (!player.game) {
        player.send('lobbyUpdate', { rooms });
      }
    });
  }

  sendLobbyMusicSnapshot(player) {
    if (!player) {
      return;
    }
    if (this.lobbyMusic) {
      player.send('lobbyMusic', { ...this.lobbyMusic });
    } else {
      player.send('lobbyMusic', {});
    }
  }

  broadcastLobbyMusic(update) {
    const message = update || this.lobbyMusic;
    this.players.forEach((player) => {
      if (!player.game) {
        if (message) {
          player.send('lobbyMusicUpdate', { ...message });
        } else {
          player.send('lobbyMusicUpdate', {});
        }
      }
    });
  }

  sanitizeMusicShare(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'Invalid music payload.' };
    }

    const maxRows = 16;
    const maxSteps = 32;

    const steps = Number.isInteger(payload.steps) && payload.steps > 0
      ? Math.min(payload.steps, maxSteps)
      : (Array.isArray(payload.pattern) && payload.pattern[0] ? Math.min(payload.pattern[0].length, maxSteps) : 8);

    if (steps <= 0) {
      return { ok: false, message: 'Invalid step count for music pattern.' };
    }

    if (!Array.isArray(payload.pattern) || payload.pattern.length === 0) {
      return { ok: false, message: 'Music pattern must contain at least one row.' };
    }

    const rowCount = Math.min(payload.pattern.length, maxRows);
    const pattern = Array.from({ length: rowCount }, (_, rowIdx) => {
      const row = Array.isArray(payload.pattern[rowIdx]) ? payload.pattern[rowIdx] : [];
      return Array.from({ length: steps }, (__, stepIdx) => !!row[stepIdx]);
    });

    const activeCount = pattern.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

    const notes = Array.isArray(payload.notes)
      ? pattern.map((_, idx) => {
        const note = payload.notes[idx] || {};
        return {
          label: typeof note.label === 'string' ? note.label.slice(0, 12) : '',
          semitone: Number.isFinite(note.semitone) ? Math.max(-48, Math.min(72, note.semitone)) : idx * 2,
        };
      })
      : pattern.map((_, idx) => ({ label: '', semitone: idx * 2 }));

  const tempo = Number.isFinite(payload.tempo) ? Math.min(1000, Math.max(120, payload.tempo)) : 480;

    const shareId = typeof payload.shareId === 'string' ? payload.shareId.slice(0, 42) : undefined;

    return {
      ok: true,
      pattern,
      steps,
      notes,
      tempo,
      activeCount,
      shareId,
    };
  }

  handleMusicLabShare(player, payload) {
    if (player.game) {
      player.send('error', { message: 'Music Lab sharing is only available while in the lobby.' });
      return;
    }

    const result = this.sanitizeMusicShare(payload);
    if (!result.ok) {
      player.send('error', { message: result.message });
      return;
    }

    const musicState = {
      pattern: result.pattern,
      steps: result.steps,
      notes: result.notes,
      tempo: result.tempo,
      author: player.name,
      shareId: result.shareId,
      activeCount: result.activeCount,
      timestamp: Date.now(),
    };

    this.lobbyMusic = musicState;
    this.broadcastLobbyMusic(musicState);
  }

  buildLobbyRooms() {
    const rooms = Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      occupants: room.players.length,
      capacity: 2,
      createdAt: room.createdAt,
    }));

    rooms.sort((a, b) => a.createdAt - b.createdAt);
    return rooms;
  }

  handleDisconnect(player) {
    this.leaveRoom(player, { silent: true });

    if (player.game) {
      const game = player.game;
      game.handleDisconnect(player);
      this.games.delete(game);
    }

    this.players.delete(player);
    this.sendLobbyUpdate();
  }
}

function createEmptyBoard() {
  return {
    grid: Array.from({ length: 10 }, () => Array(10).fill(0)),
    ships: [],
    occupied: new Map(),
    shotsReceived: new Map(),
  };
}

function areCoordinatesAligned(coords) {
  if (coords.length === 0) {
    return false;
  }
  const { x } = coords[0];
  const { y } = coords[0];
  const sameRow = coords.every((pt) => pt.y === y);
  const sameCol = coords.every((pt) => pt.x === x);
  return sameRow || sameCol;
}

function areCoordinatesConsecutive(coords) {
  if (coords.length === 0) {
    return false;
  }

  const sorted = [...coords].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const byRow = sorted.every((pt) => pt.x === sorted[0].x);
  const byCol = sorted.every((pt) => pt.y === sorted[0].y);

  if (byRow) {
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].y !== sorted[i - 1].y + 1) {
        return false;
      }
    }
    return true;
  }

  if (byCol) {
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].x !== sorted[i - 1].x + 1) {
        return false;
      }
    }
    return true;
  }

  return false;
}

const gameManager = new GameManager();

module.exports = { server, startServer, gameManager };
