const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_SKIPS = 3;

// Image search is proxied through /.netlify/functions/image-search
// so credentials stay server-side (set GOOGLE_API_KEY and GOOGLE_CX in Netlify env vars)

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

// Prefetch cache: keyed by letter, value is { word, imageUrl } or null
const prefetchCache = {};

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
    // suggestion (end screen)
    sugSection:      $('suggest-section'),
    sugCategoryName: $('sug-category-name'),
    sugWord:         $('sug-word'),
    sugEmail:        $('sug-email'),
    sugError:        $('sug-error'),
    sugSubmitBtn:    $('sug-submit-btn'),
    sugSkipBtn:      $('sug-skip-btn'),
    sugFormWrap:     $('suggest-form-wrap'),
    sugSuccess:      $('suggest-success'),
  };

  // Populate category dropdown
  Object.entries(CATEGORIES).forEach(([key, name]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = name;
    el.categorySelect.appendChild(opt);
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

  // Suggestion events (end screen)
  el.sugSubmitBtn.addEventListener('click', handleSuggestion);
  el.sugSkipBtn.addEventListener('click', () => {
    el.sugSection.classList.add('hidden');
  });
  el.sugWord.addEventListener('keydown', e => { if (e.key === 'Enter') handleSuggestion(); });
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
  // Clear prefetch cache from previous game
  Object.keys(prefetchCache).forEach(k => delete prefetchCache[k]);

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
    // While user is thinking, silently pick and prefetch the computer's next word
    prefetchNextComputerWord();
  } else {
    el.turnIndicator.textContent = 'Computer is thinking\u2026';
    el.inputArea.classList.add('hidden');
    el.skipBtn.classList.add('hidden');
  }
}

function pickComputerWord(letter) {
  const words = (WORDS[state.category] || {})[letter] || [];
  if (words.length === 0) return null;
  const used = state.usedComputerWords[letter] || new Set();
  const available = words.filter(w => !used.has(w.toLowerCase()));
  const pool = available.length > 0 ? available : words;
  return pool[Math.floor(Math.random() * pool.length)];
}

function prefetchNextComputerWord() {
  // Computer plays every other turn, one letter ahead of user's current letter
  const nextIndex = state.currentLetterIndex + 1;
  if (nextIndex >= 26) return;
  const letter = LETTERS[nextIndex];
  if (prefetchCache[letter] !== undefined) return; // already done

  const word = pickComputerWord(letter);
  if (!word) { prefetchCache[letter] = null; return; }

  // Mark as in-progress so concurrent calls don't double-fetch
  prefetchCache[letter] = { word, imageUrl: null };

  fetchWikiImage(word, state.category).then(url => {
    prefetchCache[letter] = { word, imageUrl: url };
  });
}

function scheduleComputerTurn() {
  const delay = 900 + Math.random() * 700;
  setTimeout(doComputerTurn, delay);
}

function doComputerTurn() {
  if (state.phase !== 'playing') return;

  const letter = currentLetter();
  const cached = prefetchCache[letter];

  if (cached && cached.word) {
    // Use pre-picked word; image may already be ready
    recordWord(cached.word, 'computer', cached.imageUrl);
  } else {
    // Fallback: pick now (no image pre-fetch)
    const word = pickComputerWord(letter);
    if (!word) { recordWord('(none found)', 'computer', null); return; }
    recordWord(word, 'computer', null);
  }
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

function recordWord(word, player, prefetchedImageUrl = undefined) {
  const letter = currentLetter();

  if (player === 'computer') {
    if (!state.usedComputerWords[letter]) state.usedComputerWords[letter] = new Set();
    state.usedComputerWords[letter].add(word.toLowerCase());
  }

  state.history.push({ word, player, letter });
  appendWordToHistory(word, player, letter, prefetchedImageUrl);

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

function appendWordToHistory(word, player, letter, prefetchedImageUrl = undefined) {
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

    const applyImage = url => {
      if (url) {
        img.src = url;
        img.classList.add('loaded');
        el.wordHistory.scrollTop = el.wordHistory.scrollHeight;
      } else {
        img.remove();
      }
    };

    if (prefetchedImageUrl !== undefined) {
      // Already fetched (or confirmed null) during user's turn
      applyImage(prefetchedImageUrl);
    } else {
      // Fallback: fetch now
      fetchWikiImage(word, state.category).then(applyImage);
    }
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

// Singular form of the category name used as search context (e.g. "Flowers" -> "flower")
const CATEGORY_HINT = {
  fruits:      'fruit',
  animals:     'animal',
  cities:      'city',
  foods:       'food dish',
  vegetables:  'vegetable',
  sports:      'sport',
  instruments: 'musical instrument',
  occupations: 'occupation',
  birds:       'bird',
  flowers:     'flower',
  trees:       'tree',
  gemstones:   'gemstone',
  dinosaurs:   'dinosaur',
  movies:      'movie',
  games:       'video game',
  tvshows:     'TV show',
  superheroes: 'superhero',
  mythology:   'mythological deity',
  history:     'historical figure',
  dances:      'dance',
};

// 1. Try Wikipedia REST API directly (fastest, no quota)
async function tryWikiDirect(word) {
  try {
    const q = encodeURIComponent(word.replace(/ /g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail?.source ?? null;
  } catch { return null; }
}

// 2. Search Wikipedia with category context, then fetch the top article's image
async function tryWikiSearch(word, category) {
  try {
    const hint = CATEGORY_HINT[category] ?? '';
    const q = encodeURIComponent(hint ? `${word} ${hint}` : word);
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = data.query?.search?.[0]?.title;
    if (!title) return null;
    return tryWikiDirect(title);
  } catch { return null; }
}

// 3. Google Custom Search fallback with category context
async function tryGoogleImage(word, category) {
  try {
    const hint = CATEGORY_HINT[category] ?? '';
    const q = encodeURIComponent(hint ? `${word} ${hint}` : word);
    const res = await fetch(`/.netlify/functions/image-search?q=${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.link ?? null;
  } catch { return null; }
}

async function fetchWikiImage(word, category) {
  return (await tryWikiDirect(word))
      ?? (await tryWikiSearch(word, category))
      ?? (await tryGoogleImage(word, category));
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

  // Reset suggestion section
  el.sugCategoryName.textContent = CATEGORIES[state.category];
  el.sugWord.value = '';
  el.sugEmail.value = '';
  el.sugError.classList.add('hidden');
  el.sugFormWrap.classList.remove('hidden');
  el.sugSuccess.classList.add('hidden');
  el.sugSection.classList.remove('hidden');

  showScreen('end');
}

// --- Word Suggestion ---

async function handleSuggestion() {
  const word     = el.sugWord.value.trim();
  const category = state.category;
  const email    = el.sugEmail.value.trim();

  if (!word) {
    showSugError('Please enter a word.');
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
        category: CATEGORIES[category] || category,
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
    el.sugSubmitBtn.textContent = 'Suggest';
  }
}

function showSugError(msg) {
  el.sugError.textContent = msg;
  el.sugError.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
