import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { ShogiGame, encodePositionKey } from "./public/shogi-core.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

// Simple room system for online play
const rooms = new Map();

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createRoom() {
  const id = makeRoomId();
  const room = {
    id,
    players: [],
    game: new ShogiGame(),
    history: [],
  };
  rooms.set(id, room);
  return room;
}

function send(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  room.players.forEach((p) => {
    if (p.ws.readyState === 1) {
      send(p.ws, payload);
    }
  });
}

function assignSide(room) {
  if (room.players.length === 1) return "black";
  if (room.players.length === 2) return "white";
  return "spectator";
}

function roomState(room) {
  return {
    roomId: room.id,
    board: room.game.board,
    hands: room.game.hands,
    turn: room.game.turn,
    result: room.game.result,
    lastMove: room.game.lastMove,
    history: room.history,
  };
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let side = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "create_room") {
      const room = createRoom();
      side = assignSide(room);
      room.players.push({ ws, side });
      currentRoom = room;
      send(ws, { type: "room_joined", side, ...roomState(room) });
      return;
    }

    if (msg.type === "join_room") {
      const room = rooms.get(msg.roomId);
      if (!room) {
        send(ws, { type: "error", message: "Room not found" });
        return;
      }
      if (room.players.length >= 2) {
        send(ws, { type: "error", message: "Room full" });
        return;
      }
      side = assignSide(room);
      room.players.push({ ws, side });
      currentRoom = room;
      send(ws, { type: "room_joined", side, ...roomState(room) });
      room.players.forEach((p) => {
        if (p.ws !== ws) send(p.ws, { type: "state", ...roomState(room) });
      });
      return;
    }

    if (msg.type === "move" && currentRoom) {
      const room = currentRoom;
      if (room.game.result) return;
      if (side !== room.game.turn) return;

      const applied = room.game.applyMove(msg.move);
      if (!applied.ok) {
        send(ws, { type: "illegal", reason: applied.reason });
        return;
      }
      const posKey = encodePositionKey(room.game);
      room.history.push({ move: msg.move, posKey });
      broadcast(room, { type: "state", ...roomState(room) });
      return;
    }

    if (msg.type === "resign" && currentRoom) {
      const room = currentRoom;
      if (!room.game.result) {
        room.game.result = { winner: side === "black" ? "white" : "black", reason: "resign" };
        broadcast(room, { type: "state", ...roomState(room) });
      }
      return;
    }

    if (msg.type === "declare_impasse" && currentRoom) {
      const room = currentRoom;
      const res = room.game.declareImpasse(side);
      if (!res.ok) {
        send(ws, { type: "illegal", reason: res.reason });
        return;
      }
      broadcast(room, { type: "state", ...roomState(room) });
    }
  });

  ws.on("close", () => {
    if (!currentRoom) return;
    currentRoom.players = currentRoom.players.filter((p) => p.ws !== ws);
    if (currentRoom.players.length === 0) {
      rooms.delete(currentRoom.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`WebShogi server running on http://localhost:${PORT}`);
});
