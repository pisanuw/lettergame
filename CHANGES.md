# Changes

Format: `YYYY-MM-DD [type] description` (max 200 chars). Types: decision, plan, doc, scope, code, note.

2026-05-07 [note] Initialized.
2026-05-07 [code] Initial build: index.html, style.css, words.js, game.js — 20 categories, full A-Z word lists, hint button, Netlify-ready
2026-05-07 [decision] No score/win condition, purely collaborative. No letter skipping, Q/X/Z handled with real words (some obscure).
2026-05-07 [code] Doubled word choices (2105 total). Home button in game/end header. Skip button (3/game, yellow in alphabet). Word suggestion via Netlify Forms.
2026-05-07 [decision] Word suggestions use Netlify Forms (AJAX POST to /). Admin configures email notification in Netlify dashboard — no API key in client code.
2026-05-07 [doc] README updated with live URL, repo URL, feature summary.
2026-05-07 [code] Wikipedia image fetch added for computer words (bubble layout, fade-in on load).
2026-05-07 [code] Fixed all words in history category not starting with their letter key (Napoleon Bonaparte etc).
2026-05-08 [code] Google Custom Search fallback added via Netlify serverless function (/.netlify/functions/image-search).
2026-05-08 [decision] API key kept server-side only; client calls proxy function. Keys in Netlify env vars + local .env (git-ignored).
2026-05-08 [code] Category context appended to all image queries to disambiguate (e.g. "Bleeding Heart flower").
2026-05-08 [code] Image prefetch during user turn: computer word and image fetched while user types, Promise stored in prefetchCache.
2026-05-08 [code] Rejected word error message now includes inline "Suggest this word" link opening in-game modal.
2026-05-08 [code] Suggestion modal submits word+category to Netlify Forms; on success advances game treating word as valid (suggested).
2026-05-08 [decision] Skips removed as separate mechanic. Hint button (3 uses) shows one random word. When hints exhausted, button becomes dashed amber Skip.
2026-05-08 [code] Skip shows a word with image in history (right-aligned, dashed amber border). Skipped words shown in end-game recap with actual word.
2026-05-08 [code] SEARCH_OVERRIDES map added for abbreviations/ambiguous terms (UX Designer, EMT, X-Men, etc).
2026-05-08 [code] Fixed image bug when computer goes first (doComputerTurn now async, awaits image Promise before recordWord).
2026-05-08 [note] Live site: https://letter-category.netlify.app/ — repo: https://github.com/pisanuw/lettergame
2026-05-08 [doc] ~/.claude/CLAUDE.md rewritten: AI-log logging made mandatory first step, tables for project records and slash commands, removed redundancy.
2026-05-08 [plan] Hints redesigned: show clue text (not the answer) when Hint pressed. generate-hints.js one-time script uses Claude Haiku to produce one clue per word, saved to hints.js.
2026-05-08 [code] admin.html added: password-gated word admin. Two modes via ADMIN_PASSWORD_BASIC / ADMIN_PASSWORD_VERIFIED. Mode 2 Google-verifies each word before GitHub commit. netlify/functions/admin-add-word.js handles auth, verify, and GitHub REST API commit.
2026-05-08 [code] hints.js generated (one clue per word). Hint button now shows clue text instead of the word itself; lastHintWord still used for computer's next play.
2026-05-08 [doc] README rewritten: hints, admin page, env vars table, local dev instructions. .env.example updated with GITHUB_TOKEN, ADMIN_PASSWORD_BASIC/VERIFIED.
2026-05-08 [decision] Admin passwords: ADMIN_PASSWORD_BASIC (direct add), ADMIN_PASSWORD_VERIFIED (Google-verified add). Both required in Netlify env vars before deploy.
