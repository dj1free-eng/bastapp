/* =========================
   BASTA BOMBA — app.js (COMPLETO)
   - Preguntas desde JSON: ./data/questions.json
   - Ronda armada (ready): no corre tiempo hasta pulsar botón central
   - Carta superior flip (Safari-safe)
   - Letras en rueda (20) con rotación por tecla
========================= */

const LETTERS = ['A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','R','S','T','U','V'];
let questionsLoaded = false;
let TURN_SECONDS = 10;            // se puede sobrescribir desde JSON
let QUESTIONS = [];               // se carga desde JSON
let gameState = 'setup';          // setup | ready | playing | exploded

let players = ['Jugador 1', 'Jugador 2'];
let currentPlayerIndex = 0;
let question = '';
let timer = TURN_SECONDS;
let disabled = new Set();
let tickHandle = null;
let audioUnlocked = false;
// =====================
// 🔊 SONIDOS
// =====================
const sounds = {
  start: new Audio('assets/sounds/start-round.wav'),
  tick: new Audio('assets/sounds/tick.wav'),
  warning: new Audio('assets/sounds/warning-beep.wav'),
  explosion: new Audio('assets/sounds/explosion.wav'),
  letter: new Audio('assets/sounds/letter-ok.wav'),
  lose: new Audio('assets/sounds/lose.wav')
};

// Configuración inicial
sounds.tick.loop = true;
sounds.tick.volume = 0.25;

sounds.warning.volume = 0.6;
sounds.explosion.volume = 0.9;
sounds.start.volume = 0.6;
sounds.letter.volume = 0.5;
sounds.lose.volume = 0.6;

// Utilidades
function playSound(s){
  if(!s) return;
  s.currentTime = 0;
  s.play().catch(()=>{});
}

function stopSound(s){
  if(!s) return;
  s.pause();
  s.currentTime = 0;
}
function playLoop(a){
  if(!a) return;
  a.loop = true;
  a.currentTime = 0;
  a.play().catch(err => console.warn('tick play blocked/error:', err));
}

function stopLoop(a){
  if(!a) return;
  a.pause();
  a.currentTime = 0;
}
function unlockAudioOnce(){
  if (audioUnlocked) return;
  audioUnlocked = true;

  // Desbloqueo silencioso en iOS/Safari:
  // reproducimos y pausamos cada audio con muted=true para que no suene nada.
  Object.values(sounds).forEach(a => {
    const prevMuted = a.muted;
    const prevVol = a.volume;

    a.muted = true;
    a.volume = 0;
    a.currentTime = 0;

    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = prevMuted;
        a.volume = prevVol;
      }).catch(() => {
        a.muted = prevMuted;
        a.volume = prevVol;
      });
    } else {
      // fallback
      try {
        a.pause();
        a.currentTime = 0;
      } catch(_) {}
      a.muted = prevMuted;
      a.volume = prevVol;
    }
  });
}
/* ===== DOM ===== */
const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');

const centerBtn = document.getElementById('centerBtn');

const playersListEl = document.getElementById('playersList');
const playerInputEl = document.getElementById('playerInput');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const startBtn = document.getElementById('startBtn');

const flipInner = document.getElementById('flipInner');
const frontTextEl = document.getElementById('frontText');
const questionTextEl = document.getElementById('questionText');
const turnTextEl = document.getElementById('turnText');

const bombEl = document.getElementById('bomb');
const timeTextEl = document.getElementById('timeText');
const overlayEl = document.getElementById('overlay');

const lettersLayerEl = document.getElementById('lettersLayer');
const chipsEl = document.getElementById('chips');

const newQuestionBtn = document.getElementById('newQuestionBtn');
const changePlayersBtn = document.getElementById('changePlayersBtn');
const continueBtn = document.getElementById('continueBtn');

/* ===== Utils ===== */
function rand(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

function setScreen(which){
  setupEl.classList.toggle('hidden', which !== 'setup');
  gameEl.classList.toggle('hidden', which !== 'game');
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ===== JSON preguntas ===== */
async function loadQuestions(){
  // Fallback mínimo si no hay JSON / falla carga
  const fallback = ['Partes del cuerpo humano'];

  try{
    const res = await fetch('./data/questions.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('No se pudo cargar ./data/questions.json');

    const data = await res.json();

    // Tiempo configurable desde JSON
    if (typeof data.timeLimitSeconds === 'number' && data.timeLimitSeconds > 0) {
      TURN_SECONDS = data.timeLimitSeconds;
    }

    const cats = Array.isArray(data.categories) ? data.categories : [];
    const titles = cats.map(c => c && c.title).filter(Boolean);

    QUESTIONS = titles.length ? titles : fallback;

  } catch (err){
    console.error(err);
    QUESTIONS = fallback;
  }

  // Asegura consistencia del timer cuando cambie TURN_SECONDS
  timer = TURN_SECONDS;
}
QUESTIONS = titles.length ? titles : fallback;
questionsLoaded = true;
/* ===== Carta (flip Safari-safe) ===== */
function setCardFlipped(flipped){
  if(!flipInner) return;

  if(!flipped){
    flipInner.classList.remove('isFlipped');
    return;
  }

  // Safari iOS: forzar transición
  flipInner.classList.remove('isFlipped');
  void flipInner.offsetWidth; // reflow
  requestAnimationFrame(() => {
    flipInner.classList.add('isFlipped');
  });
}

/* ===== Render ===== */
function renderPlayersSetup(){
  playersListEl.innerHTML = '';
  players.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'playerRow';
    row.innerHTML = `<span>${escapeHtml(p)}</span>`;

    if(players.length > 2){
      const btn = document.createElement('button');
      btn.textContent = 'Quitar';
      btn.addEventListener('click', () => {
        players = players.filter((_, i) => i !== idx);
        if(currentPlayerIndex >= players.length) currentPlayerIndex = 0;
        renderPlayersSetup();
      });
      row.appendChild(btn);
    }
    playersListEl.appendChild(row);
  });
}

function renderChips(){
  chipsEl.innerHTML = '';
  players.forEach((p, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    if(gameState === 'playing' && idx === currentPlayerIndex) chip.classList.add('current');
    if(gameState === 'exploded' && idx === currentPlayerIndex) chip.classList.add('loser');
    chip.textContent = p;
    chipsEl.appendChild(chip);
  });
}

function renderHeader(){
  // TEXTO PRINCIPAL
  if (gameState === 'exploded') {
    const loser = players[currentPlayerIndex];
    questionTextEl.textContent = `💥 Ha perdido ${loser}`;
    turnTextEl.textContent = 'Fin de la ronda';
  } else {
    questionTextEl.textContent = question;

    if (gameState === 'ready') {
      turnTextEl.textContent = `Turno de: ${players[currentPlayerIndex]} — listo`;
    } else {
      turnTextEl.textContent = `Turno de: ${players[currentPlayerIndex]}`;
    }
  }

  // Texto frontal (instrucciones)
  if(frontTextEl){
    frontTextEl.textContent = 'Pulsa el botón central para iniciar el juego';
  }

  // Giro de la carta
  setCardFlipped(gameState === 'playing' || gameState === 'exploded');
}

function renderBomb(){
  timeTextEl.textContent = (gameState === 'exploded') ? '💥' : String(timer);

  bombEl.classList.toggle('low', gameState === 'playing' && timer <= 3);
  bombEl.classList.toggle('exploding', gameState === 'exploded');

  overlayEl.classList.toggle('hidden', gameState !== 'exploded');
  continueBtn.classList.toggle('hidden', gameState !== 'exploded');

  // Botón central visible SOLO cuando está armado
  centerBtn.classList.toggle('hidden', gameState !== 'ready');
}

function renderWheel(){
  lettersLayerEl.innerHTML = '';

  const N = LETTERS.length;       // 20
  const center = { x: 50, y: 50 };
  const radius = 37;              // ajustado a tu PNG (cámbialo si retocas CSS)
  const startAngleDeg = -90;      // primera tecla arriba

  LETTERS.forEach((letter, i) => {
    const angleDeg = startAngleDeg + (360 * i) / N;
    const ang = angleDeg * (Math.PI / 180);

    const x = center.x + radius * Math.cos(ang);
    const y = center.y + radius * Math.sin(ang);

    const btn = document.createElement('button');
    btn.className = 'letterBtn';
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;

    // Rotación: leer desde fuera
    const rot = angleDeg - 90;
    btn.style.setProperty('--rot', `${rot}deg`);

    btn.textContent = letter;

    const isDisabled = disabled.has(letter);
    if (isDisabled) btn.classList.add('disabled');

    // Deshabilitar si ya explotó
    btn.disabled = isDisabled || gameState === 'exploded';

    btn.addEventListener('click', () => onLetter(letter));
    lettersLayerEl.appendChild(btn);
  });
}

/* ===== Timer ===== */
function stopTimer(){
  if(tickHandle) clearInterval(tickHandle);
  tickHandle = null;
}

function startTimer(){
  stopTimer();

  stopLoop(sounds.tick);
  playLoop(sounds.tick);

  tickHandle = setInterval(() => {
    if(gameState !== 'playing') return;

    timer -= 1;

    if(timer === 3){
  playSound(sounds.warning);
}

    if(timer <= 0){
      timer = 0;
      explode();
      return;
    }

    renderBomb();
  }, 1000);
}

/* ===== Game logic ===== */
function explode(){
  gameState = 'exploded';

  stopTimer();
  stopSound(sounds.tick);
stopLoop(sounds.tick);
  playSound(sounds.explosion);
  setTimeout(() => playSound(sounds.lose), 400);

  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();
}
function resumeSameState(){
  // Solo tiene sentido si la ronda estaba en curso y se pausó por “explosión” accidental
  if(gameState !== 'exploded') return;

  // Volvemos a jugar SIN tocar nada del estado actual
  // (misma pregunta, mismas letras usadas, mismo jugador)
  gameState = 'playing';
  timer = TURN_SECONDS;

  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();

  startTimer();
}
function nextTurn(){
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  timer = TURN_SECONDS;
  renderHeader();
  renderBomb();
  renderChips();
}

function onLetter(letter){
  if(gameState !== 'playing') return;
  if(disabled.has(letter)) return;

  playSound(sounds.letter);

  disabled.add(letter);

  if(disabled.size === LETTERS.length){
    disabled = new Set();
  }

  renderWheel();
  nextTurn();
}

function startNewRound(){
  if(!QUESTIONS || QUESTIONS.length === 0){
    QUESTIONS = ['Partes del cuerpo humano'];
  }

  question = rand(QUESTIONS);
  disabled = new Set();
  currentPlayerIndex = 0;
  timer = TURN_SECONDS;

  gameState = 'ready'; // ronda armada, aún sin contar
stopSound(sounds.tick);
  setScreen('game');
  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();
stopLoop(sounds.tick);
  stopTimer();
  setCardFlipped(false);
}

function continueSameQuestion(){
  if(!question){
    question = (QUESTIONS && QUESTIONS.length) ? rand(QUESTIONS) : 'Partes del cuerpo humano';
  }

  gameState = 'playing';
  timer = TURN_SECONDS;

  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();

  startTimer();
}

/* ===== Events ===== */
addPlayerBtn.addEventListener('click', () => {
  const name = playerInputEl.value.trim();
  if(!name) return;
  if(players.length >= 8) return;

  players.push(name);
  playerInputEl.value = '';
  renderPlayersSetup();
});

playerInputEl.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') addPlayerBtn.click();
});

// Botón START (desde setup)
startBtn.addEventListener('click', startNewRound);

// Nueva pregunta (misma mecánica: queda ready)
newQuestionBtn.addEventListener('click', startNewRound);

// Cambiar jugadores
changePlayersBtn.addEventListener('click', () => {
  stopTimer();
  gameState = 'setup';
  setScreen('setup');
  renderPlayersSetup();
});
continueBtn.addEventListener('click', resumeSameState);
// Botón central: iniciar (flip + timer)
centerBtn.addEventListener('click', () => {
  if (gameState !== 'ready') return;

  // 🔇 Desbloquea audio sin que suene nada
  unlockAudioOnce();

  // Ahora sí: sonido real de inicio
  playSound(sounds.start);

  gameState = 'playing';
  setCardFlipped(true);

  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();

  startTimer();
});
/* ===== Init ===== */
renderPlayersSetup();
setScreen('setup');
loadQuestions();
