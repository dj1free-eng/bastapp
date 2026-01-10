/* =========================
   BASTA BOMBA — app.js (COMPLETO CORREGIDO)
   - Preguntas desde JSON: ./data/questions.json
   - Ronda armada (ready): no corre tiempo hasta pulsar botón central
   - Carta superior flip (Safari-safe)
   - Letras en rueda (20) con rotación por tecla
   - Sonidos WAV
========================= */

const LETTERS = ['A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','R','S','T','U','V'];

let questionsLoaded = false;
let TURN_SECONDS = 10;
let QUESTIONS = [];
let lastQuestion = '';

let gameState = 'setup';          // setup | ready | playing | exploded
let players = ['Jugador 1', 'Jugador 2'];
let currentPlayerIndex = 0;
let question = '';
let timer = TURN_SECONDS;
let disabled = new Set();
let tickHandle = null;

/* =====================
   🔊 SONIDOS
===================== */
let audioUnlocked = false;

const sounds = {
  start: new Audio('assets/sounds/start-round.wav'),
  tick: new Audio('assets/sounds/tick.wav'),
  warning: new Audio('assets/sounds/warning-beep.wav'),
  explosion: new Audio('assets/sounds/explosion.wav'),
  letter: new Audio('assets/sounds/letter-ok.wav'),
  lose: new Audio('assets/sounds/lose.wav')
};

sounds.tick.loop = true;
sounds.tick.volume = 0.25;

sounds.warning.volume = 0.5;
sounds.explosion.volume = 1.0;
sounds.start.volume = 0.8;
sounds.letter.volume = 0.9;
sounds.lose.volume = 0.6;

function playSound(a){
  if(!a) return;
  a.currentTime = 0;
  a.play().catch(()=>{});
}
function stopSound(a){
  if(!a) return;
  a.pause();
  a.currentTime = 0;
}
function playLoop(a){
  if(!a) return;
  a.loop = true;
  a.currentTime = 0;
  a.play().catch(err => console.warn('loop play error:', err));
}
function stopLoop(a){
  if(!a) return;
  a.pause();
  a.currentTime = 0;
}

// Desbloqueo silencioso iOS/Safari
function unlockAudioOnce(){
  if (audioUnlocked) return;
  audioUnlocked = true;

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
      try { a.pause(); a.currentTime = 0; } catch(_) {}
      a.muted = prevMuted;
      a.volume = prevVol;
    }
  });
}

/* ===== DOM ===== */
const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');
const setupStatusEl = document.getElementById('setupStatus');
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
  const fallback = ['Partes del cuerpo humano'];

  try{
    // URL robusta (funciona en GitHub Pages y subcarpetas)
    const url = new URL('data/questions.json', window.location.href).toString();

    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);

    const data = await res.json();

    const cats = Array.isArray(data.categories) ? data.categories : [];
    const titles = cats.map(c => c && c.title).filter(Boolean);

    QUESTIONS = titles.length ? titles : fallback;
    questionsLoaded = true;

    // 👇 DIAGNÓSTICO EN PANTALLA
    if (turnTextEl) turnTextEl.textContent = `✅ Preguntas cargadas: ${QUESTIONS.length}`;

  } catch (err){
    QUESTIONS = fallback;
    questionsLoaded = true;

    // 👇 DIAGNÓSTICO EN PANTALLA
    if (turnTextEl) turnTextEl.textContent = `❌ No cargó questions.json → ${String(err.message || err)}`;
  }
}
/* ===== Carta (flip Safari-safe) ===== */
function setCardFlipped(flipped){
  if(!flipInner) return;

  if(!flipped){
    flipInner.classList.remove('isFlipped');
    return;
  }

  flipInner.classList.remove('isFlipped');
  void flipInner.offsetWidth;
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

  if(frontTextEl){
    frontTextEl.textContent = 'Pulsa el botón central para iniciar el juego';
  }

  setCardFlipped(gameState === 'playing' || gameState === 'exploded');
}

function renderBomb(){
  timeTextEl.textContent = (gameState === 'exploded') ? '💥' : String(timer);

  bombEl.classList.toggle('low', gameState === 'playing' && timer <= 3);
  bombEl.classList.toggle('exploding', gameState === 'exploded');

  overlayEl.classList.toggle('hidden', gameState !== 'exploded');
  continueBtn.classList.toggle('hidden', gameState !== 'exploded');

  centerBtn.classList.toggle('hidden', gameState !== 'ready');
}

function renderWheel(){
  lettersLayerEl.innerHTML = '';

  const N = LETTERS.length;
  const center = { x: 50, y: 50 };
  const radius = 37;
  const startAngleDeg = -90;

  LETTERS.forEach((letter, i) => {
    const angleDeg = startAngleDeg + (360 * i) / N;
    const ang = angleDeg * (Math.PI / 180);

    const x = center.x + radius * Math.cos(ang);
    const y = center.y + radius * Math.sin(ang);

    const btn = document.createElement('button');
    btn.className = 'letterBtn';
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;

    const rot = angleDeg - 90;
    btn.style.setProperty('--rot', `${rot}deg`);

    btn.textContent = letter;

    const isDisabled = disabled.has(letter);
    if (isDisabled) btn.classList.add('disabled');

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

    // warning SOLO cuando llega a 3
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
  stopLoop(sounds.tick);

  playSound(sounds.explosion);
  setTimeout(() => playSound(sounds.lose), 400);

  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();
}

// Reanudar en el mismo estado (mismo jugador, letras, pregunta)
function resumeSameState(){
  if(gameState !== 'exploded') return;

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

// Elegir pregunta sin repetir la anterior (si hay más de 1)
function pickQuestion(){
  if(!QUESTIONS || QUESTIONS.length === 0) return 'Partes del cuerpo humano';

  if(QUESTIONS.length === 1) return QUESTIONS[0];

  let q = rand(QUESTIONS);
  while(q === lastQuestion){
    q = rand(QUESTIONS);
  }
  lastQuestion = q;
  return q;
}

function startNewRound(){
  if(!questionsLoaded){
    console.warn('Preguntas aún no cargadas');
    return;
  }

  question = pickQuestion();
  disabled = new Set();
  currentPlayerIndex = 0;
  timer = TURN_SECONDS;

  gameState = 'ready';

  stopTimer();
  stopLoop(sounds.tick);

  setScreen('game');
  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();

  setCardFlipped(false);
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

startBtn.addEventListener('click', startNewRound);
newQuestionBtn.addEventListener('click', startNewRound);

changePlayersBtn.addEventListener('click', () => {
  stopTimer();
  stopLoop(sounds.tick);
  gameState = 'setup';
  setScreen('setup');
  renderPlayersSetup();
});

continueBtn.addEventListener('click', resumeSameState);

centerBtn.addEventListener('click', () => {
  if (gameState !== 'ready') return;

  unlockAudioOnce();
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

startBtn.disabled = true;
newQuestionBtn.disabled = true;

loadQuestions().then(() => {
  startBtn.disabled = false;
  newQuestionBtn.disabled = false;
});
