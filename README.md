# Drunk Drawing

Drunk Drawing is a same-room drawing and guessing game. Your team guesses out loud while your ink drifts away from where you aim.

Run `npm ci` and `npm run dev`, then open the URL Vite prints. Use `npm test` for the game logic tests and `npm run build` to make a static build. All 1,000 prompts are bundled locally. The game needs no backend.

Pick a drawer and have everyone else look away. Hold **Reveal** (Space or RT), then release it before starting the timer. Drag on the paper with a mouse or touch, or aim with the left stick and hold RT. The drawer can use **Undo** (X) twice and **Clear** (Y) once. Select **Correct!** (A) when the group guesses the word. The final drawing and score appear when the round ends.

Easy, Normal, and Hard currently use the same defaults. Each preset can override settings in `PRESETS` in `src/badDraw.js`. The dev panel is visible during every drawing round. Drift and stick controls take effect immediately, ink width applies to the next stroke, and round length applies to the next round. Tuning carries over until you reset it, change difficulty, or reload the page.

Additional prompts were sourced from the [Datamuse API](https://www.datamuse.com/api/) and screened using [Brysbaert et al.’s concreteness ratings](https://pubmed.ncbi.nlm.nih.gov/24142837/).
