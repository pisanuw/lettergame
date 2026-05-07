# Briefing

- **Purpose**: Browser word game where user and computer alternate naming things in a category, following the alphabet A to Z.
- **Current scope**: Plain HTML/CSS/JS single-page app. Four files: index.html, style.css, words.js, game.js. 20 categories, each with 3-6 words per letter (A-Z). User types a word; it is validated against the word list. Computer picks randomly. Hint button available. Game ends at Z.
- **Key decisions**: No score, purely collaborative/casual. No skipping hard letters (Q, X, Z handled with real but sometimes obscure words). Netlify-compatible static site.
- **Non-goals**: No backend, no accounts, no user-contributed words, no timer/pressure mechanics.
