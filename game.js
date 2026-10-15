'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Skins: cada una define su paleta (índice 0 vacío, 1–7 alineados con PIECES:
// I, O, T, S, Z, J, L) y su función de dibujo de bloque. El fondo y la rejilla
// del canvas los sobrescribe CSS vía data-skin (--canvas-bg / --canvas-grid).
const SKINS = {
  retro: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
    draw: drawRetroBlock,
  },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d000ff', '#39ff14', '#ff073a', '#2979ff', '#ff8c00'],
    draw: drawNeonBlock,
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1a8', '#d9bdf2', '#bde8b4', '#f7b8b8', '#b8cff7', '#ffd4ab'],
    draw: drawPastelBlock,
  },
  pixel: {
    colors: [null, '#3cbcfc', '#f8b800', '#b048f8', '#58d854', '#f83800', '#0058f8', '#fc7460'],
    draw: drawPixelBlock,
  },
};

let skin = SKINS.retro;
let COLORS = skin.colors;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
let gridColor = '#22222e';

let board, current, next, hold, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function createPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return createPiece(Math.floor(Math.random() * 7) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  canHold = true;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

// Guarda la pieza actual (o la intercambia con la reservada). Una vez por pieza.
function holdPiece() {
  if (!canHold) return;
  const heldType = hold;
  hold = current.type;
  if (heldType) {
    current = createPiece(heldType);
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    spawn();
  }
  canHold = false;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const a = alpha ?? 1;
  context.globalAlpha = a;
  skin.draw(context, x * size, y * size, size, COLORS[colorIndex], a);
  context.globalAlpha = 1;
}

// Retro: bloque plano con franja de brillo superior.
function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

// Neon: contorno brillante con glow (shadowBlur). El ghost va sin glow.
function drawNeonBlock(context, px, py, size, color, alpha) {
  const glow = alpha >= 1;
  context.shadowColor = color;
  context.shadowBlur = glow ? size * 0.5 : 0;
  context.fillStyle = color;
  context.globalAlpha = alpha * 0.35;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

// Rectángulo redondeado con fallback para navegadores sin ctx.roundRect.
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Pastel: bloque redondeado con borde suave y brillo superior.
function drawPastelBlock(context, px, py, size, color) {
  roundRectPath(context, px + 2, py + 2, size - 4, size - 4, size * 0.25);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.12)';
  context.lineWidth = 1;
  context.stroke();
  roundRectPath(context, px + 5, py + 4, size - 10, size * 0.25, size * 0.12);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();
}

// Pixel art: bisel claro arriba-izquierda, oscuro abajo-derecha y textura de puntos.
function drawPixelBlock(context, px, py, size, color) {
  const p = size / 10; // tamaño de un "pixel"
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fillRect(px, py, size, p);
  context.fillRect(px, py, p, size);
  context.fillStyle = 'rgba(0,0,0,0.4)';
  context.fillRect(px, py + size - p, size, p);
  context.fillRect(px + size - p, py, p, size);
  // textura: tablero de ajedrez de 4×4 en el interior
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      context.fillStyle = (i + j) % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
      context.fillRect(px + p * (1 + i * 2), py + p * (1 + j * 2), p * 2, p * 2);
    }
  // brillo de un pixel en la esquina
  context.fillStyle = 'rgba(255,255,255,0.7)';
  context.fillRect(px + p, py + p, p, p);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawPreview(context, piece) {
  const NB = 30;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!piece) return;
  const shape = piece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB);
}

function drawNext() {
  drawPreview(nextCtx, next);
}

function drawHold() {
  drawPreview(holdCtx, hold ? createPiece(hold) : null);
  holdCanvas.classList.toggle('locked', !canHold);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  hold = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyC', 'KeyP'];

document.addEventListener('keydown', e => {
  // Si el selector de skin conserva el foco, que las teclas del juego no lo cambien
  if (e.target === skinSelect && GAME_KEYS.includes(e.code) && (e.code === 'KeyP' || !(paused || gameOver))) {
    e.preventDefault();
    skinSelect.blur();
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  refreshGridColor();
  const light = theme === 'light';
  themeToggle.textContent = light ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space/Enter reactive el botón durante el juego
});

// La rejilla de la skin (--canvas-grid) tiene prioridad sobre la del tema (--grid).
function refreshGridColor() {
  const cs = getComputedStyle(document.documentElement);
  gridColor = cs.getPropertyValue('--canvas-grid').trim() || cs.getPropertyValue('--grid').trim();
}

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  COLORS = skin.colors;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  refreshGridColor();
  try { localStorage.setItem('skin', name); } catch (e) { /* almacenamiento no disponible */ }
}

function loadSkin() {
  try { return localStorage.getItem('skin'); } catch (e) { return null; }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  // redibuja al instante, también en pausa o game over
  draw();
  drawNext();
  drawHold();
  skinSelect.blur(); // evita que las flechas cambien la skin durante el juego
});

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');
applySkin(loadSkin());

init();
