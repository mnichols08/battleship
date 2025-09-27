# Battleship Arena

A zero-dependency multiplayer Battleship game featuring a pure Node.js WebSocket server and a native Web Components UI. Two players connect to the same server, place their fleets, and battle in real time.

## Features

- **No dependencies** – only the Node.js standard library on the server and native browser features on the client.
- **Custom WebSocket engine** – handcrafted handshake and frame parser (text frames) to keep things self-contained.
- **Modern Web Components UI** – encapsulated grids, status badges, and interaction logic built with vanilla HTML, CSS, and JavaScript modules.
- **Full Battleship rule set** – classic fleet (Carrier, Battleship, Cruiser, Submarine, Destroyer), validated layouts, alternating turns, hit/miss/sunk feedback, and victory detection.
- **Graceful handling** – opponent disconnects, layout resets before the match, and informative activity logs.
- **Multiple modes** – hop online for PvP, duel a built-in AI, or sit back and watch AI vs AI matches without touching the board.
- **Dynamic soundstage** – native Web Audio sound effects plus a procedurally generated soundtrack, both controllable via in-game toggles.

## Getting Started

1. Ensure you have a recent Node.js runtime (v18+ recommended).
2. Install dependencies (none required!).

### Run the server

```powershell
npm start
```

Visit [http://localhost:3000](http://localhost:3000) in two browser tabs or different machines pointing to the same server. Place your fleets, lock them in, and take turns firing shots.

### Run the smoke test

```powershell
npm test
```

This starts the server on a random available port and verifies that the main page is served successfully.

## Game Modes

Upon loading the page you can choose among three experiences:

- **Online PvP** – connect to another live player through the Node.js WebSocket server.
- **Solo vs AI** – battle a locally simulated opponent with random-but-legal ship placement and targeting logic (no network connection required).
- **AI vs AI (Spectate)** – watch two AI fleets clash autonomously; great for demos or quick verification without interacting.

## Audio Controls

Use the **SFX** and **Music** buttons in the header to enable or mute battle effects and the procedural score. Both features are powered by the Web Audio API, so no extra assets or dependencies are required.

## Gameplay Flow

1. **Place ships** – click cells (or randomize) to position the classic fleet. Use the orientation toggle to rotate ships.
2. **Lock in** – once all ships are placed, lock your fleet. You can unlock before the match begins if you want to rearrange.
3. **Battle** – when both players are ready, the game starts. Click opponent cells to fire; hits and misses update in real time.
4. **Win condition** – sink every segment of the opponent’s fleet. The game announces the winner and offers a quick replay button.

## Project Structure

```
.
├── public/               # Static assets served by Node.js
│   ├── index.html        # Shell page injecting the game component
│   ├── css/styles.css    # Global styling
│   └── js/app.js         # Web Components and game logic
├── server.js             # HTTP + WebSocket server (no dependencies)
├── tests/smoke.js        # Minimal HTTP smoke test
├── package.json          # Scripts for running and testing
└── README.md             # This file
```

## Technical Notes

- The server validates ship layouts to prevent overlap and ensure straight, consecutive placement.
- WebSocket frames are parsed manually to remain dependency-free; the implementation currently handles single-frame text messages, pings/pongs, and clean closes.
- The UI relies on Shadow DOM styling and internal state management without external frameworks.
- For production hardening, consider adding authentication, HTTPS, multi-game room support, and persistence.

Enjoy the naval showdown! ⚓
