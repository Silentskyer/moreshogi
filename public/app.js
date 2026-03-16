import { ShogiGame, SHOGI_UI } from "./shogi-core.js";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const moveLogEl = document.getElementById("moveLog");
const modeSelect = document.getElementById("modeSelect");
const aiControls = document.getElementById("aiControls");
const aiDepthSelect = document.getElementById("aiDepth");
const onlineControls = document.getElementById("onlineControls");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const roomIdInput = document.getElementById("roomId");
const resignBtn = document.getElementById("resign");
const impasseBtn = document.getElementById("impasse");
const resetBtn = document.getElementById("reset");

const handWhiteEl = document.querySelector("#handWhite .hand-pieces");
const handBlackEl = document.querySelector("#handBlack .hand-pieces");

let game = new ShogiGame();
let mode = "local";
let selected = null; // { type: 'board'|'drop', from?, piece? }
let socket = null;
let onlineSide = null;
let pendingMoves = [];

function initBoard() {
  boardEl.innerHTML = "";
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener("click", () => onCellClick(x, y));
      boardEl.appendChild(cell);
    }
  }
}

function resetGame() {
  game = new ShogiGame();
  selected = null;
  pendingMoves = [];
  render();
}

function updateModeUI() {
  aiControls.style.display = mode === "ai" ? "block" : "none";
  onlineControls.style.display = mode === "online" ? "flex" : "none";
}

function statusText() {
  if (mode === "online") {
    const sideLabel = onlineSide ? (onlineSide === "black" ? "先手" : "後手") : "—";
    const roomLabel = roomIdInput.value ? `房間 ${roomIdInput.value}` : "未連線";
    return `線上對戰 · ${roomLabel} · 你是 ${sideLabel} · ${game.turn === "black" ? "先手" : "後手"} 行棋`;
  }
  if (mode === "ai") {
    return `對電腦 · ${game.turn === "black" ? "先手" : "後手"} 行棋`;
  }
  return `單機對弈 · ${game.turn === "black" ? "先手" : "後手"} 行棋`;
}

function render() {
  statusEl.textContent = statusText();

  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const piece = game.pieceAt(x, y);
    cell.classList.remove("highlight", "selected");
    cell.innerHTML = "";
    if (piece) {
      const span = document.createElement("span");
      span.className = `piece ${piece.color}`;
      span.textContent = SHOGI_UI.pieceLabel(piece);
      cell.appendChild(span);
    }
  });

  renderHands();
  renderMoves();

  if (selected) {
    const highlights = pendingMoves.map((m) => `${m.to.x},${m.to.y}`);
    cells.forEach((cell) => {
      const key = `${cell.dataset.x},${cell.dataset.y}`;
      if (highlights.includes(key)) cell.classList.add("highlight");
    });
    if (selected.type === "board") {
      const key = `${selected.from.x},${selected.from.y}`;
      cells.forEach((cell) => {
        if (`${cell.dataset.x},${cell.dataset.y}` === key) cell.classList.add("selected");
      });
    }
  }

  if (game.result) {
    if (game.result.winner) {
      resultEl.textContent = `${game.result.winner === "black" ? "先手" : "後手"} 勝利 (${game.result.reason})`;
    } else {
      resultEl.textContent = `平手 (${game.result.reason})`;
    }
  } else {
    resultEl.textContent = "—";
  }
}

function renderHands() {
  const renderHand = (el, color) => {
    el.innerHTML = "";
    const entries = Object.entries(game.hands[color]).filter(([, count]) => count > 0);
    if (entries.length === 0) {
      el.innerHTML = "<div class=\"hand-piece\">無</div>";
      return;
    }
    entries.forEach(([type, count]) => {
      const item = document.createElement("div");
      item.className = "hand-piece";
      item.textContent = `${SHOGI_UI.PIECE_NAMES[type]} × ${count}`;
      item.addEventListener("click", () => {
        if (game.turn !== color || (mode === "online" && color !== onlineSide)) return;
        selected = { type: "drop", piece: type, color };
        pendingMoves = game.generateLegalMoves(color).filter((m) => m.drop === type);
        clearHandSelection();
        item.classList.add("selected");
        render();
      });
      el.appendChild(item);
    });
  };

  renderHand(handWhiteEl, "white");
  renderHand(handBlackEl, "black");
}

function clearHandSelection() {
  document.querySelectorAll(".hand-piece").forEach((el) => el.classList.remove("selected"));
}

function renderMoves() {
  moveLogEl.innerHTML = "";
  const history = game.moveHistory || [];
  history.forEach((move, idx) => {
    const item = document.createElement("li");
    item.textContent = `${idx + 1}. ${move.color === "black" ? "先" : "後"} ${formatMove(move)}`;
    moveLogEl.appendChild(item);
  });
}

function formatMove(move) {
  if (move.drop) {
    return `${SHOGI_UI.PIECE_NAMES[move.drop]}打 ${coord(move.to)}`;
  }
  return `${coord(move.to)}${move.promote ? "成" : ""}`;
}

function coord(pos) {
  return `${pos.x + 1}${pos.y + 1}`;
}

function onCellClick(x, y) {
  if (game.result) return;
  const piece = game.pieceAt(x, y);
  const currentColor = game.turn;
  if (mode === "online" && onlineSide !== currentColor) return;

  if (!selected && piece && piece.color === currentColor) {
    selected = { type: "board", from: { x, y } };
    pendingMoves = game
      .generateLegalMoves(currentColor)
      .filter((m) => m.from && m.from.x === x && m.from.y === y);
    render();
    return;
  }

  if (selected) {
    const movesTo = pendingMoves.filter((m) => m.to.x === x && m.to.y === y);
    if (movesTo.length === 0) {
      selected = null;
      pendingMoves = [];
      clearHandSelection();
      render();
      return;
    }

    let chosen = movesTo[0];
    if (movesTo.length > 1) {
      const promoteMove = movesTo.find((m) => m.promote);
      const answer = confirm("要成嗎？");
      chosen = answer && promoteMove ? promoteMove : movesTo.find((m) => !m.promote) || movesTo[0];
    }

    if (mode === "online") {
      socket?.send(JSON.stringify({ type: "move", move: chosen }));
    } else {
      const res = game.applyMove(chosen);
      if (!res.ok) {
        alert(`非法：${res.reason}`);
        return;
      }
      if (mode === "ai") {
        window.setTimeout(aiMove, 300);
      }
    }
    selected = null;
    pendingMoves = [];
    clearHandSelection();
    render();
  }
}

function aiMove() {
  if (game.result) return;
  if (game.turn !== "white") return;
  const depth = Number(aiDepthSelect.value);
  const move = game.findBestMove("white", depth);
  if (move) game.applyMove(move);
  render();
}

function connectOnline(action, roomId = null) {
  if (socket) {
    socket.close();
    socket = null;
  }

  socket = new WebSocket(`${location.origin.replace("http", "ws")}`);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: action, roomId }));
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "room_joined") {
      onlineSide = msg.side;
      syncFromServer(msg);
    } else if (msg.type === "state") {
      syncFromServer(msg);
    } else if (msg.type === "illegal") {
      alert(`非法：${msg.reason}`);
    }
  });
}

function syncFromServer(payload) {
  game.board = payload.board;
  game.hands = payload.hands;
  game.turn = payload.turn;
  game.result = payload.result;
  game.lastMove = payload.lastMove;
  if (Array.isArray(payload.history)) {
    game.moveHistory = payload.history.map((h) => h.move);
  }
  if (payload.roomId) {
    roomIdInput.value = payload.roomId;
  }
  render();
}

modeSelect.addEventListener("change", () => {
  mode = modeSelect.value;
  updateModeUI();
  resetGame();
});

createRoomBtn.addEventListener("click", () => {
  mode = "online";
  modeSelect.value = "online";
  updateModeUI();
  connectOnline("create_room");
});

joinRoomBtn.addEventListener("click", () => {
  const roomId = roomIdInput.value.trim().toUpperCase();
  if (!roomId) return;
  mode = "online";
  modeSelect.value = "online";
  updateModeUI();
  connectOnline("join_room", roomId);
});

resignBtn.addEventListener("click", () => {
  if (mode === "online") {
    socket?.send(JSON.stringify({ type: "resign" }));
  } else if (!game.result) {
    game.result = { winner: game.turn === "black" ? "white" : "black", reason: "resign" };
    render();
  }
});

impasseBtn.addEventListener("click", () => {
  if (mode === "online") {
    socket?.send(JSON.stringify({ type: "declare_impasse" }));
  } else {
    const res = game.declareImpasse(game.turn);
    if (!res.ok) alert(`無法宣言：${res.reason}`);
    render();
  }
});

resetBtn.addEventListener("click", () => {
  if (mode === "online") {
    socket?.close();
    socket = null;
    onlineSide = null;
    mode = "local";
    modeSelect.value = "local";
    updateModeUI();
  }
  resetGame();
});

initBoard();
updateModeUI();
render();
