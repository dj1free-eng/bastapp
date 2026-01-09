const LETTERS = ['A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','R','S','T','U','V'];
const QUESTIONS = [
  'Partes del cuerpo humano','Países','Animales','Comidas','Ciudades','Profesiones','Marcas','Películas','Series','Deportes',
  'Frutas','Verduras','Bebidas','Instrumentos musicales','Cosas que te pones (ropa/accesorios)','Cosas de una casa',
  'Cosas de un coche','Objetos del colegio','Videojuegos','Personajes famosos'
];
const TURN_SECONDS = 10;

let gameState = 'setup';
let players = ['Jugador 1', 'Jugador 2'];
let currentPlayerIndex = 0;
let question = '';
let timer = TURN_SECONDS;
let disabled = new Set();
let tickHandle = null;

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

function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function setScreen(which){
  setupEl.classList.toggle('hidden', which !== 'setup');
  gameEl.classList.toggle('hidden', which !== 'game');
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
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
  turnTextEl.textContent = (gameState === 'exploded')
    ? '¡BOOOM! Fin de ronda'
    : `Turno de: ${players[currentPlayerIndex]}`;
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

  const N = LETTERS.length;      // 20
  const center = { x: 50, y: 50 };
  const radius = 36;             // ajustado a tu PNG
  const startAngleDeg = -90;     // primera tecla arriba

  LETTERS.forEach((letter, i) => {
    // Posición (en círculo)
    const angleDeg = startAngleDeg + (360 * i) / N;
    const ang = angleDeg * (Math.PI / 180);

    const x = center.x + radius * Math.cos(ang);
    const y = center.y + radius * Math.sin(ang);

    // Botón
    const btn = document.createElement('button');
    btn.className = 'letterBtn';
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;

    // Rotación: LEER DESDE FUERA (tecla + letra juntas)
    const rot = angleDeg - 90;
    btn.style.setProperty('--rot', `${rot}deg`);

    btn.textContent = letter;

    // Estado deshabilitado
    const isDisabled = disabled.has(letter);
    if (isDisabled) btn.classList.add('disabled');
    btn.disabled = isDisabled || gameState === 'exploded';

    // Click
    btn.addEventListener('click', () => onLetter(letter));

    lettersLayerEl.appendChild(btn);
  });
}

function stopTimer(){
  if(tickHandle) clearInterval(tickHandle);
  tickHandle = null;
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
  if(disabled.size === LETTERS.length){
    disabled = new Set();
  }

  renderWheel();
  nextTurn();
}

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

renderPlayersSetup();
setScreen('setup');
