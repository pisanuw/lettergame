# Briefing

- **Purpose**: Browser word game where user and computer alternate naming things in a category, following the alphabet A to Z.
- **Current scope**: Plain HTML/CSS/JS single-page app (index.html, style.css, words.js, game.js). 20 categories, 2105 words total, full A-Z coverage. User types a word validated against the word list. Computer picks randomly with image fetched from Wikipedia (Google Custom Search fallback). Game ends at Z.
- **Key decisions**:
  - No score, purely collaborative/casual.
  - Hints (3 per game): each shows one random valid word. When exhausted, button becomes a Skip.
  - Skip shows a suggested word with image in history (right-aligned, dashed amber). No separate skip counter.
  - Unknown words show an inline "Suggest this word" link — opens modal, submits to Netlify Forms, then accepts the word and advances the game.
  - Images fetched via: Wikipedia REST API → Wikipedia Search API → Google Custom Search proxy (/.netlify/functions/image-search). Images prefetched during user turn.
  - Google API key and CX stored server-side in Netlify env vars (GOOGLE_API_KEY, GOOGLE_CX); local .env is git-ignored.
  - Word suggestions use Netlify Forms. Admin (yusuf.pisan@gmail.com) sets up email notification in Netlify dashboard.
  - SEARCH_OVERRIDES map in game.js handles abbreviations/ambiguous terms for image search.
- **Non-goals**: No backend, no accounts, no timer/pressure mechanics, no scoring.
- **Live site**: https://letter-category.netlify.app/
- **Repo**: https://github.com/pisanuw/lettergame
