'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

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
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');
const MAX_START_LEVEL = 15;
let gridColor = '#22222e';

let board, current, next, hold, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// startLevel = valor elegido en el menú (se aplica en el próximo init);
// gameStartLevel = nivel inicial de la partida en curso (no cambia a mitad de partida).
let startLevel = loadStartLevel();
let gameStartLevel = startLevel;

function loadStartLevel() {
  let v = 1;
  try { v = parseInt(localStorage.getItem('startLevel'), 10); } catch (e) { /* sin localStorage */ }
  return v >= 1 && v <= MAX_START_LEVEL ? v : 1;
}

function speedForLevel(lv) {
  return Math.max(100, 1000 - (lv - 1) * 90);
}

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
    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = speedForLevel(level);
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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
  overlayScore.hidden = false;
  restartBtn.hidden = false;
  pauseMenu.hidden = true;
  overlay.classList.remove('hidden');
}

// Quita el foco de botones/selector del menú para que Space/flechas no los reactiven.
function blurActive() {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    blurActive();
    dropAccum = 0;
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.hidden = true;
    restartBtn.hidden = true;
    pauseMenu.hidden = false;
    pauseControls.hidden = true;
    controlsBtn.textContent = 'Ver controles';
    controlsBtn.setAttribute('aria-expanded', 'false');
    startLevelSelect.value = startLevel;
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
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  hold = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  blurActive();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // Con el menú de pausa abierto (o en game over) se bloquean todos los controles del juego.
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

restartBtn.addEventListener('click', () => init());

// ---- Menú de pausa ----
for (let lv = 1; lv <= MAX_START_LEVEL; lv++) startLevelSelect.add(new Option(lv, lv));
startLevelSelect.value = startLevel;

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', () => init());

controlsBtn.addEventListener('click', () => {
  const show = pauseControls.hidden;
  pauseControls.hidden = !show;
  controlsBtn.textContent = show ? 'Ocultar controles' : 'Ver controles';
  controlsBtn.setAttribute('aria-expanded', String(show));
});

// El nivel elegido se guarda y se aplica en la próxima partida (init/reinicio).
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
  try { localStorage.setItem('startLevel', startLevel); } catch (e) { /* sin localStorage */ }
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  const light = theme === 'light';
  themeToggle.textContent = light ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space/Enter reactive el botón durante el juego
});

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');

init();
