/**
 * BASTA BOMBA — versión web simple (sin build tools)
 * Reglas:
 * - Pregunta (tarjeta) fija durante la ronda
 * - Letras disponibles (20 fijas). Al acertar, se desactiva una letra.
 * - Si se gastan todas: se reactivan y se sigue con la MISMA pregunta.
 * - Por turnos: 10 segundos. Si llega a 0: explota y pierde el jugador actual.
 */

const LETTERS = ['A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','R','S','T','U','V'];
const QUESTIONS = [
  'Partes del cuerpo humano','Países','Animales','Comidas','Ciudades','Profesiones','Marcas','Películas','Series','Deportes',
  'Frutas','Verduras','Bebidas','Instrumentos musicales','Cosas que te pones (ropa/accesorios)','Cosas de una casa',
  'Cosas de un coche','Objetos del colegio','Videojuegos','Personajes famosos'
];

const TURN_SECONDS = 10;

// --- State ---
let gameState = 'setup'; // setup | playing | exploded
let players = ['Jugador 1', 'Jugador 2'];
let currentPlayerIndex = 0;
let question = '';
let timer = TURN_SECONDS;
let disabled = new Set();

let tickHandle = null;

// --- DOM ---
const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');

const playersListEl = document.getElementById('playersList');
const playerInputEl = document.getElementById('playerInput');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const startBtn = document.getElementById('startBtn');

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

// --- Helpers ---
function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function setScreen(which){
  if(which === 'setup'){
    setupEl.classList.remove('hidden');
    gameEl.classList.add('hidden');
  } else {
    setupEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
  }
}

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
  questionTextEl.textContent = question;
  if(gameState === 'exploded'){
    turnTextEl.textContent = '¡BOOOM! Fin de ronda';
  } else {
    turnTextEl.textContent = `Turno de: ${players[currentPlayerIndex]}`;
  }
}

function renderBomb(){
  timeTextEl.textContent = (gameState === 'exploded') ? '💥' : String(timer);

  bombEl.classList.toggle('low', gameState === 'playing' && timer <= 3);
  bombEl.classList.toggle('exploding', gameState === 'exploded');

  overlayEl.classList.toggle('hidden', gameState !== 'exploded');
  continueBtn.classList.toggle('hidden', gameState !== 'exploded');
}

function renderWheel(){
  lettersLayerEl.innerHTML = '';

  const N = LETTERS.length;
  const center = { x: 50, y: 50 };
  const radius = 44; // %
  const startAngleDeg = -90;

  LETTERS.forEach((letter, i) => {
    const ang = (startAngleDeg + (360 * i) / N) * (Math.PI / 180);
    const x = center.x + radius * Math.cos(ang);
    const y = center.y + radius * Math.sin(ang);

    const btn = document.createElement('button');
    btn.className = 'letterBtn';
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;
    btn.textContent = letter;

    const isDisabled = disabled.has(letter);
    if(isDisabled) btn.classList.add('disabled');
    btn.disabled = isDisabled || gameState === 'exploded';

    btn.addEventListener('click', () => onLetter(letter));

    lettersLayerEl.appendChild(btn);
  });
}

function startTimer(){
  stopTimer();
  tickHandle = setInterval(() => {
    if(gameState !== 'playing') return;
    timer -= 1;
    if(timer <= 0){
      timer = 0;
      explode();
    }
    renderBomb();
  }, 1000);
}

function stopTimer(){
  if(tickHandle) clearInterval(tickHandle);
  tickHandle = null;
}

function explode(){
  gameState = 'exploded';
  stopTimer();
  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();
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

  disabled.add(letter);

  // Si se gastan todas -> reset y seguimos misma pregunta
  if(disabled.size === LETTERS.length){
    disabled = new Set();
  }

  renderWheel();
  nextTurn();
}

// --- Actions ---
function startNewRound(){
  question = rand(QUESTIONS);
  disabled = new Set();
  currentPlayerIndex = 0;
  timer = TURN_SECONDS;
  gameState = 'playing';

  setScreen('game');
  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();
  startTimer();
}

function continueSameQuestion(){
  if(!question) question = rand(QUESTIONS);
  gameState = 'playing';
  timer = TURN_SECONDS;
  renderHeader();
  renderBomb();
  renderWheel();
  renderChips();
  startTimer();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// --- Events ---
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
  gameState = 'setup';
  setScreen('setup');
  renderPlayersSetup();
});

continueBtn.addEventListener('click', continueSameQuestion);

// Init
renderPlayersSetup();
setScreen('setup');
