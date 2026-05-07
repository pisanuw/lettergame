const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

let state = {
  phase: 'setup',
  category: null,
  currentLetterIndex: 0,
  currentTurn: null,
  history: [],
  usedComputerWords: {},
};

let el = {};

function $(id) { return document.getElementById(id); }

function init() {
  el = {
    setupScreen:    $('setup-screen'),
    gameScreen:     $('game-screen'),
    endScreen:      $('end-screen'),
    categorySelect: $('category-select'),
    startBtn:       $('start-btn'),
    categoryDisplay:$('category-display'),
    letterDisplay:  $('letter-display'),
    alphabet:       $('alphabet'),
    wordHistory:    $('word-history'),
    turnIndicator:  $('turn-indicator'),
    inputArea:      $('input-area'),
    wordInput:      $('word-input'),
    submitBtn:      $('submit-btn'),
    errorMsg:       $('error-msg'),
    hintBtn:        $('hint-btn'),
    hintText:       $('hint-text'),
    quitBtn:        $('quit-btn'),
    endCategory:    $('end-category'),
    finalWords:     $('final-words'),
    playAgainBtn:   $('play-again-btn'),
  };

  Object.entries(CATEGORIES).forEach(([key, name]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = name;
    el.categorySelect.appendChild(opt);
  });

  el.startBtn.addEventListener('click', startGame);
  el.submitBtn.addEventListener('click', handleSubmit);
  el.wordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
  el.hintBtn.addEventListener('click', showHint);
  el.quitBtn.addEventListener('click', resetToSetup);
  el.playAgainBtn.addEventListener('click', resetToSetup);
}

function showScreen(name) {
  ['setup-screen', 'game-screen', 'end-screen'].forEach(id => {
    $(id).classList.toggle('active', id === name + '-screen');
  });
}

function resetToSetup() {
  state = {
    phase: 'setup',
    category: null,
    currentLetterIndex: 0,
    currentTurn: null,
    history: [],
    usedComputerWords: {},
  };
  el.wordHistory.innerHTML = '';
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');
  showScreen('setup');
}

function startGame() {
  state.currentLetterIndex = 0;
  state.history = [];
  state.usedComputerWords = {};
  state.phase = 'playing';

  const selected = el.categorySelect.value;
  const keys = Object.keys(CATEGORIES);
  state.category = selected || keys[Math.floor(Math.random() * keys.length)];

  el.categoryDisplay.textContent = CATEGORIES[state.category];
  el.wordHistory.innerHTML = '';
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  state.currentTurn = Math.random() < 0.5 ? 'user' : 'computer';

  showScreen('game');
  renderAlphabet();
  updateUI();

  if (state.currentTurn === 'computer') scheduleComputerTurn();
}

function currentLetter() {
  return LETTERS[state.currentLetterIndex];
}

function renderAlphabet() {
  el.alphabet.innerHTML = LETTERS.map((l, i) => {
    let cls = 'alpha-chip';
    if (i < state.currentLetterIndex) cls += ' done';
    if (i === state.currentLetterIndex) cls += ' current';
    return `<span class="${cls}">${l}</span>`;
  }).join('');
}

function updateUI() {
  renderAlphabet();
  el.letterDisplay.textContent = currentLetter();
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  if (state.currentTurn === 'user') {
    el.turnIndicator.textContent =
      `Your turn — name a ${CATEGORIES[state.category]} starting with "${currentLetter()}"`;
    el.inputArea.classList.remove('hidden');
    el.wordInput.value = '';
    el.wordInput.focus();
  } else {
    el.turnIndicator.textContent = 'Computer is thinking\u2026';
    el.inputArea.classList.add('hidden');
  }
}

function scheduleComputerTurn() {
  const delay = 900 + Math.random() * 700;
  setTimeout(doComputerTurn, delay);
}

function doComputerTurn() {
  if (state.phase !== 'playing') return;

  const letter = currentLetter();
  const words = (WORDS[state.category] || {})[letter] || [];

  if (words.length === 0) {
    recordWord('(none found)', 'computer');
    return;
  }

  const used = state.usedComputerWords[letter] || new Set();
  const available = words.filter(w => !used.has(w.toLowerCase()));
  const pool = available.length > 0 ? available : words;
  const word = pool[Math.floor(Math.random() * pool.length)];

  recordWord(word, 'computer');
}

function handleSubmit() {
  const raw = el.wordInput.value.trim();
  if (!raw) return;

  const letter = currentLetter();

  if (!raw.toUpperCase().startsWith(letter)) {
    showError(`"${raw}" doesn\u2019t start with "${letter}". Try again.`);
    return;
  }

  const words = (WORDS[state.category] || {})[letter] || [];
  const match = words.find(w => w.toLowerCase() === raw.toLowerCase());

  if (!match) {
    showError(`"${raw}" isn\u2019t in my ${CATEGORIES[state.category]} list. Try another.`);
    return;
  }

  el.errorMsg.classList.add('hidden');
  el.hintText.classList.add('hidden');
  recordWord(match, 'user');
}

function recordWord(word, player) {
  const letter = currentLetter();

  if (player === 'computer') {
    if (!state.usedComputerWords[letter]) state.usedComputerWords[letter] = new Set();
    state.usedComputerWords[letter].add(word.toLowerCase());
  }

  state.history.push({ word, player, letter });
  appendWordToHistory(word, player, letter);

  state.currentLetterIndex++;

  if (state.currentLetterIndex >= 26) {
    state.phase = 'ended';
    setTimeout(endGame, 400);
    return;
  }

  state.currentTurn = state.currentTurn === 'user' ? 'computer' : 'user';
  updateUI();

  if (state.currentTurn === 'computer') scheduleComputerTurn();
}

function appendWordToHistory(word, player, letter) {
  const row = document.createElement('div');
  row.className = `history-row ${player}`;
  row.innerHTML = `
    <span class="h-letter">${letter}</span>
    <span class="h-word">${word}</span>
    <span class="h-who">${player === 'user' ? 'You' : 'Computer'}</span>
  `;
  el.wordHistory.appendChild(row);
  el.wordHistory.scrollTop = el.wordHistory.scrollHeight;
}

function showHint() {
  const letter = currentLetter();
  const words = (WORDS[state.category] || {})[letter] || [];
  if (words.length === 0) {
    el.hintText.textContent = 'No hints available.';
  } else {
    const sample = words.slice(0, 3).join(', ');
    el.hintText.textContent = `Hint: try \u2014 ${sample}`;
  }
  el.hintText.classList.remove('hidden');
}

function showError(msg) {
  el.errorMsg.textContent = msg;
  el.errorMsg.classList.remove('hidden');
}

function endGame() {
  el.endCategory.textContent = `Category: ${CATEGORIES[state.category]}`;
  el.finalWords.innerHTML = state.history.map(({ word, player, letter }) =>
    `<div class="final-row ${player}">
      <span class="f-letter">${letter}</span>
      <span class="f-word">${word}</span>
      <span class="f-who">${player === 'user' ? 'You' : 'Computer'}</span>
    </div>`
  ).join('');
  showScreen('end');
}

document.addEventListener('DOMContentLoaded', init);
