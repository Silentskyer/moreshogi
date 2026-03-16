const PIECES = ["K", "R", "B", "G", "S", "N", "L", "P"];

const PIECE_NAMES = {
  K: "玉",
  R: "飛",
  B: "角",
  G: "金",
  S: "銀",
  N: "桂",
  L: "香",
  P: "歩",
};

const PROMOTED_NAMES = {
  R: "龍",
  B: "馬",
  S: "全",
  N: "圭",
  L: "杏",
  P: "と",
};

const DIRECTIONS = {
  K: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  G: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, -1],
  ],
  S: [
    [1, -1],
    [-1, -1],
    [0, -1],
    [1, 1],
    [-1, 1],
  ],
  N: [
    [1, -2],
    [-1, -2],
  ],
  P: [[0, -1]],
  L: [[0, -1]],
  R: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  B: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};

const PROMOTED_GOLD_LIKE = new Set(["S", "N", "L", "P"]);

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function emptyHands() {
  return {
    black: { K: 0, R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 },
    white: { K: 0, R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 },
  };
}

function inBounds(x, y) {
  return x >= 0 && x < 9 && y >= 0 && y < 9;
}

function opponent(color) {
  return color === "black" ? "white" : "black";
}

function promotionZone(color) {
  return color === "black" ? [0, 1, 2] : [6, 7, 8];
}

function mustPromote(piece, color, toY) {
  if (piece.promoted) return false;
  if (piece.type === "P" || piece.type === "L") {
    return (color === "black" && toY === 0) || (color === "white" && toY === 8);
  }
  if (piece.type === "N") {
    return (color === "black" && toY <= 1) || (color === "white" && toY >= 7);
  }
  return false;
}

function canPromote(piece, color, fromY, toY) {
  if (piece.promoted) return false;
  if (piece.type === "K" || piece.type === "G") return false;
  const zone = promotionZone(color);
  return zone.includes(fromY) || zone.includes(toY);
}

function pieceLabel(piece) {
  if (!piece) return "";
  if (piece.promoted) return PROMOTED_NAMES[piece.type] || PIECE_NAMES[piece.type];
  return PIECE_NAMES[piece.type];
}

function encodePiece(piece) {
  if (!piece) return "";
  return `${piece.color[0]}${piece.type}${piece.promoted ? "+" : ""}`;
}

export function encodePositionKey(game) {
  const rows = game.board
    .map((row) => row.map((p) => encodePiece(p) || "__").join(","))
    .join("/");
  const hands = ["black", "white"]
    .map((c) =>
      PIECES.map((t) => `${t}${game.hands[c][t]}`).join("")
    )
    .join("|");
  return `${rows}|${hands}|${game.turn}`;
}

export class ShogiGame {
  constructor() {
    this.board = ShogiGame.initialBoard();
    this.hands = emptyHands();
    this.turn = "black";
    this.result = null;
    this.lastMove = null;
    this.moveHistory = [];
    this.positionCounts = new Map();
    this.positionHistory = [];
    const key = encodePositionKey(this);
    this.positionCounts.set(key, 1);
    this.positionHistory.push({ posKey: key, checkingSide: null });
  }

  static initialBoard() {
    const empty = Array.from({ length: 9 }, () => Array(9).fill(null));
    const place = (x, y, type, color) => {
      empty[y][x] = { type, color, promoted: false };
    };

    // White side (top)
    ["L", "N", "S", "G", "K", "G", "S", "N", "L"].forEach((t, x) => {
      place(x, 0, t, "white");
    });
    place(1, 1, "B", "white");
    place(7, 1, "R", "white");
    for (let x = 0; x < 9; x += 1) place(x, 2, "P", "white");

    // Black side (bottom)
    ["L", "N", "S", "G", "K", "G", "S", "N", "L"].forEach((t, x) => {
      place(x, 8, t, "black");
    });
    place(7, 7, "B", "black");
    place(1, 7, "R", "black");
    for (let x = 0; x < 9; x += 1) place(x, 6, "P", "black");

    return empty;
  }

  clone() {
    const copy = new ShogiGame();
    copy.board = cloneBoard(this.board);
    copy.hands = {
      black: { ...this.hands.black },
      white: { ...this.hands.white },
    };
    copy.turn = this.turn;
    copy.result = this.result ? { ...this.result } : null;
    copy.lastMove = this.lastMove ? { ...this.lastMove } : null;
    copy.moveHistory = this.moveHistory.map((m) => ({ ...m }));
    copy.positionCounts = new Map(this.positionCounts);
    copy.positionHistory = this.positionHistory.map((h) => ({ ...h }));
    return copy;
  }

  pieceAt(x, y) {
    if (!inBounds(x, y)) return null;
    return this.board[y][x];
  }

  kingPosition(color) {
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const p = this.board[y][x];
        if (p && p.type === "K" && p.color === color) return { x, y };
      }
    }
    return null;
  }

  isInCheck(color) {
    const king = this.kingPosition(color);
    if (!king) return false;
    const enemy = opponent(color);
    const enemyMoves = this.generatePseudoMoves(enemy, { ignoreCheck: true });
    return enemyMoves.some((m) => m.to && m.to.x === king.x && m.to.y === king.y);
  }

  generatePseudoMoves(color, opts = {}) {
    const moves = [];
    const dirFactor = color === "black" ? 1 : -1;
    const addMove = (from, to) => {
      const piece = this.board[from.y][from.x];
      if (!piece) return;
      if (mustPromote(piece, color, to.y)) {
        moves.push({ from, to, promote: true });
        return;
      }
      if (canPromote(piece, color, from.y, to.y)) {
        moves.push({ from, to, promote: false });
        moves.push({ from, to, promote: true });
        return;
      }
      moves.push({ from, to, promote: false });
    };

    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const piece = this.board[y][x];
        if (!piece || piece.color !== color) continue;

        const type = piece.type;
        if (type === "R" || type === "B" || type === "L") {
          const dirs = DIRECTIONS[type];
          dirs.forEach(([dx, dy]) => {
            let nx = x + dx;
            let ny = y + dy * (type === "L" ? dirFactor : 1);
            while (inBounds(nx, ny)) {
              const target = this.board[ny][nx];
              if (!target) {
                addMove({ x, y }, { x: nx, y: ny });
              } else {
                if (target.color !== color) {
                  addMove({ x, y }, { x: nx, y: ny });
                }
                break;
              }
              nx += dx;
              ny += dy * (type === "L" ? dirFactor : 1);
            }
          });
        } else if (piece.promoted && PROMOTED_GOLD_LIKE.has(type)) {
          DIRECTIONS.G.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy * dirFactor;
            if (!inBounds(nx, ny)) return;
            const target = this.board[ny][nx];
            if (!target || target.color !== color) {
              addMove({ x, y }, { x: nx, y: ny });
            }
          });
        } else if (piece.promoted && (type === "R" || type === "B")) {
          const baseDirs = DIRECTIONS[type];
          baseDirs.forEach(([dx, dy]) => {
            let nx = x + dx;
            let ny = y + dy;
            while (inBounds(nx, ny)) {
              const target = this.board[ny][nx];
              if (!target) {
                addMove({ x, y }, { x: nx, y: ny });
              } else {
                if (target.color !== color) {
                  addMove({ x, y }, { x: nx, y: ny });
                }
                break;
              }
              nx += dx;
              ny += dy;
            }
          });
          DIRECTIONS.K.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) return;
            const target = this.board[ny][nx];
            if (!target || target.color !== color) {
              addMove({ x, y }, { x: nx, y: ny });
            }
          });
        } else if (type === "N") {
          DIRECTIONS.N.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy * dirFactor;
            if (!inBounds(nx, ny)) return;
            const target = this.board[ny][nx];
            if (!target || target.color !== color) {
              addMove({ x, y }, { x: nx, y: ny });
            }
          });
        } else {
          const dirs = DIRECTIONS[type] || [];
          dirs.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy * (type === "P" || type === "S" || type === "G" ? dirFactor : 1);
            if (!inBounds(nx, ny)) return;
            const target = this.board[ny][nx];
            if (!target || target.color !== color) {
              addMove({ x, y }, { x: nx, y: ny });
            }
          });
        }
      }
    }

    if (opts.includeDrops !== false) {
      PIECES.forEach((t) => {
        const count = this.hands[color][t];
        if (count <= 0 || t === "K") return;
        for (let y = 0; y < 9; y += 1) {
          for (let x = 0; x < 9; x += 1) {
            if (this.board[y][x]) continue;
            if (!this.isLegalDrop(color, t, x, y, opts)) continue;
            moves.push({ drop: t, to: { x, y } });
          }
        }
      });
    }

    return moves;
  }

  isLegalDrop(color, type, x, y, opts = {}) {
    if (this.board[y][x]) return false;
    if (type === "P") {
      // Nifu
      for (let yy = 0; yy < 9; yy += 1) {
        const p = this.board[yy][x];
        if (p && p.color === color && p.type === "P" && !p.promoted) return false;
      }
      // Last rank
      if ((color === "black" && y === 0) || (color === "white" && y === 8)) return false;
    }
    if (type === "L") {
      if ((color === "black" && y === 0) || (color === "white" && y === 8)) return false;
    }
    if (type === "N") {
      if ((color === "black" && y <= 1) || (color === "white" && y >= 7)) return false;
    }

    if (type === "P" && !opts.ignoreUchifuzume) {
      const test = this.clone();
      test.board[y][x] = { type, color, promoted: false };
      test.hands[color][type] -= 1;
      if (test.isInCheck(opponent(color))) {
        const replies = test.generateLegalMoves(opponent(color), { ignoreUchifuzume: true });
        if (replies.length === 0) return false; // uchifuzume
      }
    }

    return true;
  }

  generateLegalMoves(color, opts = {}) {
    const moves = [];
    const pseudo = this.generatePseudoMoves(color, opts);
    pseudo.forEach((m) => {
      const res = this.applyMove(m, { dryRun: true, ignoreUchifuzume: opts.ignoreUchifuzume });
      if (res.ok) moves.push(res.move);
    });
    return moves;
  }

  applyMove(move, opts = {}) {
    const color = this.turn;
    const enemy = opponent(color);
    const dryRun = opts.dryRun === true;

    const legalMoves = this.generatePseudoMoves(color, {
      includeDrops: true,
      ignoreUchifuzume: opts.ignoreUchifuzume,
    });
    const isLegal = legalMoves.some((m) => ShogiGame.sameMove(m, move));
    if (!isLegal) return { ok: false, reason: "illegal" };

    const next = dryRun ? this.clone() : this;
    if (move.drop) {
      next.hands[color][move.drop] -= 1;
      next.board[move.to.y][move.to.x] = { type: move.drop, color, promoted: false };
    } else {
      const piece = next.board[move.from.y][move.from.x];
      next.board[move.from.y][move.from.x] = null;
      const captured = next.board[move.to.y][move.to.x];
      if (captured) {
        const baseType = captured.type;
        next.hands[color][baseType] += 1;
      }
      const promote = move.promote || mustPromote(piece, color, move.to.y);
      next.board[move.to.y][move.to.x] = {
        type: piece.type,
        color,
        promoted: piece.promoted || promote,
      };
    }

    if (next.isInCheck(color)) {
      return { ok: false, reason: "self_check" };
    }

    if (!dryRun) {
      next.turn = enemy;
      next.lastMove = { ...move, color };
      next.moveHistory.push({ ...move, color });

      const posKey = encodePositionKey(next);
      const count = (next.positionCounts.get(posKey) || 0) + 1;
      next.positionCounts.set(posKey, count);
      const checkingSide = next.isInCheck(enemy) ? color : null;
      next.positionHistory.push({ posKey, checkingSide });

      const enemyMoves = next.generateLegalMoves(enemy, { ignoreUchifuzume: true });
      if (enemyMoves.length === 0) {
        if (next.isInCheck(enemy)) {
          next.result = { winner: color, reason: "checkmate" };
        } else {
          next.result = { winner: null, reason: "stalemate" };
        }
      }

      if (!next.result && count >= 4) {
        const occurrences = next.positionHistory.filter((h) => h.posKey === posKey);
        const lastFour = occurrences.slice(-4);
        const perpetual = lastFour.length === 4 && lastFour.every((h) => h.checkingSide === color);
        if (perpetual) {
          next.result = { winner: enemy, reason: "perpetual_check" };
        } else {
          next.result = { winner: null, reason: "repetition" };
        }
      }
    }

    return { ok: true, move };
  }

  declareImpasse(color) {
    if (this.result) return { ok: false, reason: "game_over" };
    if (this.turn !== color) return { ok: false, reason: "not_your_turn" };
    if (this.isInCheck(color)) return { ok: false, reason: "in_check" };

    const king = this.kingPosition(color);
    const enemyKing = this.kingPosition(opponent(color));
    const zone = promotionZone(color);
    const enemyZone = promotionZone(opponent(color));
    if (!king || !enemyKing) return { ok: false, reason: "missing_king" };
    if (!zone.includes(king.y) || !enemyZone.includes(enemyKing.y)) {
      return { ok: false, reason: "kings_not_in_zone" };
    }

    const points = (c) => {
      let total = 0;
      for (let y = 0; y < 9; y += 1) {
        for (let x = 0; x < 9; x += 1) {
          const p = this.board[y][x];
          if (!p || p.color !== c) continue;
          if (p.type === "K") continue;
          total += p.type === "R" || p.type === "B" ? 5 : 1;
        }
      }
      PIECES.forEach((t) => {
        if (t === "K") return;
        total += this.hands[c][t] * (t === "R" || t === "B" ? 5 : 1);
      });
      return total;
    };

    const myPoints = points(color);
    const enemyPoints = points(opponent(color));
    if (myPoints >= 24 && enemyPoints >= 24) {
      this.result = { winner: null, reason: "impasse" };
    } else if (myPoints < 24 && enemyPoints >= 24) {
      this.result = { winner: opponent(color), reason: "impasse" };
    } else if (myPoints >= 24 && enemyPoints < 24) {
      this.result = { winner: color, reason: "impasse" };
    } else {
      this.result = { winner: null, reason: "impasse" };
    }

    return { ok: true };
  }
  static sameMove(a, b) {
    if (!a || !b) return false;
    if (a.drop || b.drop) {
      return a.drop === b.drop && a.to.x === b.to.x && a.to.y === b.to.y;
    }
    return (
      a.from.x === b.from.x &&
      a.from.y === b.from.y &&
      a.to.x === b.to.x &&
      a.to.y === b.to.y &&
      !!a.promote === !!b.promote
    );
  }

  evaluate(color) {
    const values = { K: 10000, R: 900, B: 800, G: 500, S: 450, N: 350, L: 300, P: 100 };
    let score = 0;
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const p = this.board[y][x];
        if (!p) continue;
        let val = values[p.type] || 0;
        if (p.promoted && p.type !== "K" && p.type !== "G") val += 150;
        score += p.color === color ? val : -val;
      }
    }
    PIECES.forEach((t) => {
      score += this.hands[color][t] * (values[t] || 0) * 0.6;
      score -= this.hands[opponent(color)][t] * (values[t] || 0) * 0.6;
    });
    return score;
  }

  findBestMove(color, depth = 2) {
    const moves = this.generateLegalMoves(color);
    if (moves.length === 0) return null;
    let best = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const next = this.clone();
      next.applyMove(move);
      const score = this.minimax(next, depth - 1, opponent(color), color, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  minimax(state, depth, turnColor, maxColor, alpha, beta) {
    if (depth === 0 || state.result) {
      if (state.result) {
        if (state.result.winner === maxColor) return 99999;
        if (state.result.winner === opponent(maxColor)) return -99999;
        return 0;
      }
      return state.evaluate(maxColor);
    }
    const moves = state.generateLegalMoves(turnColor);
    if (moves.length === 0) return state.evaluate(maxColor);

    if (turnColor === maxColor) {
      let value = -Infinity;
      for (const move of moves) {
        const next = state.clone();
        next.applyMove(move);
        value = Math.max(value, this.minimax(next, depth - 1, opponent(turnColor), maxColor, alpha, beta));
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }

    let value = Infinity;
    for (const move of moves) {
      const next = state.clone();
      next.applyMove(move);
      value = Math.min(value, this.minimax(next, depth - 1, opponent(turnColor), maxColor, alpha, beta));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }
}

export const SHOGI_UI = {
  pieceLabel,
  PIECE_NAMES,
  PROMOTED_NAMES,
};

