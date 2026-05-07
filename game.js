const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_SKIPS = 3;

let state = {
  phase: 'setup',
  category: null,
  currentLetterIndex: 0,
  currentTurn: null,
  history: [],
  usedComputerWords: {},
  skipsLeft: MAX_SKIPS,
  skippedLetters: new Set(),
};

let el = {};

function $(id) { return document.getElementById(id); }

function init() {
  el = {
    setupScreen:     $('setup-screen'),
    gameScreen:      $('game-screen'),
    endScreen:       $('end-screen'),
    categorySelect:  $('category-select'),
    startBtn:        $('start-btn'),
    categoryDisplay: $('category-display'),
    letterDisplay:   $('letter-display'),
    alphabet:        $('alphabet'),
    wordHistory:     $('word-history'),
    turnIndicator:   $('turn-indicator'),
    inputArea:       $('input-area'),
    wordInput:       $('word-input'),
    submitBtn:       $('submit-btn'),
    errorMsg:        $('error-msg'),
    hintBtn:         $('hint-btn'),
    hintText:        $('hint-text'),
    skipBtn:         $('skip-btn'),
    skipCount:       $('skip-count'),
    quitBtn:         $('quit-btn'),
    homeBtn:         $('home-btn'),
    endCategory:     $('end-category'),
    finalWords:      $('final-words'),
    playAgainBtn:    $('play-again-btn'),
    endHomeBtn:      $('end-home-btn'),
    // suggestion modal
    suggestOpenBtn:  $('suggest-open-btn'),
    suggestModal:    $('suggest-modal'),
    suggestCloseBtn: $('suggest-close-btn'),
    sugCategory:     $('sug-category'),
    sugWord:         $('sug-word'),
    sugEmail:        $('sug-email'),
    sugError:        $('sug-error'),
    sugSubmitBtn:    $('sug-submit-btn'),
    sugFormWrap:     $('suggest-form-wrap'),
    sugSuccess:      $('suggest-success'),
    sugDoneBtn:      $('sug-done-btn'),
  };

  // Populate category dropdowns
  Object.entries(CATEGORIES).forEach(([key, name]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = name;
    el.categorySelect.appendChild(opt);

    const sugOpt = opt.cloneNode(true);
    el.sugCategory.appendChild(sugOpt);
  });

  // Game events
  el.startBtn.addEventListener('click', startGame);
  el.submitBtn.addEventListener('click', handleSubmit);
  el.wordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
  el.hintBtn.addEventListener('click', showHint);
  el.skipBtn.addEventListener('click', handleSkip);
  el.quitBtn.addEventListener('click', resetToSetup);
  el.homeBtn.addEventListener('click', resetToSetup);
  el.playAgainBtn.addEventListener('click', resetToSetup);
  el.endHomeBtn.addEventListener('click', resetToSetup);

  // Suggestion modal events
  el.suggestOpenBtn.addEventListener('click', openSuggestModal);
  el.suggestCloseBtn.addEventListener('click', closeSuggestModal);
  el.sugDoneBtn.addEventListener('click', closeSuggestModal);
  el.sugSubmitBtn.addEventListener('click', handleSuggestion);
  el.suggestModal.addEventListener('click', e => {
    if (e.target === el.suggestModal) closeSuggestModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSuggestModal();
  });
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
    skipsLeft: MAX_SKIPS,
    skippedLetters: new Set(),
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
  state.skipsLeft = MAX_SKIPS;
  state.skippedLetters = new Set();
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
    if (i < state.currentLetterIndex) {
      cls += state.skippedLetters.has(l) ? ' skipped' : ' done';
    }
    if (i === state.currentLetterIndex) cls += ' current';
    return `<span class="${cls}">${l}</span>`;
  }).join('');
}

function updateUI() {
  renderAlphabet();
  el.letterDisplay.textContent = currentLetter();
  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  // Skip button
  el.skipCount.textContent = `(${state.skipsLeft} left)`;
  el.skipBtn.disabled = state.skipsLeft <= 0;

  if (state.currentTurn === 'user') {
    el.turnIndicator.textContent =
      `Your turn — name a ${CATEGORIES[state.category]} starting with "${currentLetter()}"`;
    el.inputArea.classList.remove('hidden');
    el.skipBtn.classList.remove('hidden');
    el.wordInput.value = '';
    el.wordInput.focus();
  } else {
    el.turnIndicator.textContent = 'Computer is thinking\u2026';
    el.inputArea.classList.add('hidden');
    el.skipBtn.classList.add('hidden');
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

function handleSkip() {
  if (state.skipsLeft <= 0 || state.currentTurn !== 'user') return;

  const letter = currentLetter();
  state.skipsLeft--;
  state.skippedLetters.add(letter);
  state.history.push({ word: '(skipped)', player: 'skipped', letter });

  const row = document.createElement('div');
  row.className = 'history-row skipped-row';
  row.textContent = `${letter} — skipped (${state.skipsLeft} skip${state.skipsLeft !== 1 ? 's' : ''} remaining)`;
  el.wordHistory.appendChild(row);
  el.wordHistory.scrollTop = el.wordHistory.scrollHeight;

  el.hintText.classList.add('hidden');
  el.errorMsg.classList.add('hidden');

  state.currentLetterIndex++;

  if (state.currentLetterIndex >= 26) {
    state.phase = 'ended';
    setTimeout(endGame, 400);
    return;
  }

  state.currentTurn = 'computer';
  updateUI();
  scheduleComputerTurn();
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

  if (player === 'computer') {
    row.innerHTML = `
      <div class="h-meta">
        <span class="h-letter">${letter}</span>
        <span class="h-word">${word}</span>
        <span class="h-who">Computer</span>
      </div>
      <img class="word-img" alt="${word}">
    `;
    const img = row.querySelector('.word-img');
    fetchWikiImage(word).then(url => {
      if (url) {
        img.src = url;
        img.classList.add('loaded');
        el.wordHistory.scrollTop = el.wordHistory.scrollHeight;
      } else {
        img.remove();
      }
    });
  } else {
    row.innerHTML = `
      <span class="h-letter">${letter}</span>
      <span class="h-word">${word}</span>
      <span class="h-who">You</span>
    `;
  }

  el.wordHistory.appendChild(row);
  el.wordHistory.scrollTop = el.wordHistory.scrollHeight;
}

async function fetchWikiImage(word) {
  try {
    const query = encodeURIComponent(word.replace(/ /g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${query}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail?.source ?? null;
  } catch {
    return null;
  }
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
  el.finalWords.innerHTML = state.history.map(({ word, player, letter }) => {
    if (player === 'skipped') {
      return `<div class="final-row skipped">
        <span class="f-letter">${letter}</span>
        <span class="f-word">(skipped)</span>
        <span class="f-who"></span>
      </div>`;
    }
    return `<div class="final-row ${player}">
      <span class="f-letter">${letter}</span>
      <span class="f-word">${word}</span>
      <span class="f-who">${player === 'user' ? 'You' : 'Computer'}</span>
    </div>`;
  }).join('');
  showScreen('end');
}

// --- Word Suggestion ---

function openSuggestModal() {
  el.sugWord.value = '';
  el.sugEmail.value = '';
  el.sugError.classList.add('hidden');
  el.sugFormWrap.classList.remove('hidden');
  el.sugSuccess.classList.add('hidden');
  el.suggestModal.classList.remove('hidden');
  el.sugWord.focus();
}

function closeSuggestModal() {
  el.suggestModal.classList.add('hidden');
}

async function handleSuggestion() {
  const word     = el.sugWord.value.trim();
  const category = el.sugCategory.value;
  const email    = el.sugEmail.value.trim();

  if (!word) {
    showSugError('Please enter a word.');
    return;
  }
  if (!category) {
    showSugError('Please choose a category.');
    return;
  }

  el.sugSubmitBtn.disabled = true;
  el.sugSubmitBtn.textContent = 'Sending\u2026';

  try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'form-name': 'word-suggestion',
        word,
        category,
        email,
      }).toString(),
    });

    if (res.ok || res.status === 303) {
      el.sugFormWrap.classList.add('hidden');
      el.sugSuccess.classList.remove('hidden');
    } else {
      showSugError('Submission failed. Please try again.');
    }
  } catch {
    showSugError('Network error. Please try again.');
  } finally {
    el.sugSubmitBtn.disabled = false;
    el.sugSubmitBtn.textContent = 'Submit';
  }
}

function showSugError(msg) {
  el.sugError.textContent = msg;
  el.sugError.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
