# Drunk Drawing

Drunk Drawing is a same-room drawing and guessing game. Your team guesses out loud while your ink drifts away from where you aim.

Run `npm ci` and `npm run dev`, then open the URL Vite prints. Use `npm test` for the game logic tests and `npm run build` to make a static build. All 1,000 prompts are bundled locally. The game needs no backend.

It is built for touch screens only (phones and tablets). There are no keyboard or controller controls.

Pick a drawer and have everyone else look away. Press and hold **Hold to reveal**, then let go before starting the timer. Drag your finger on the paper to draw. The drawer can use **Undo** twice and **Clear** once. Tap **Correct!** when the group guesses the word. The final drawing and score appear when the round ends.

The ink wobbles with a slow lean, gets further off and faster as the clock runs down (1.6× by the end), and hiccups 5 times a round at random moments: a quick jolt out and back, with a "hic!" by the pen. A tall beer meter beside the paper drains over the round, from Sober to Wasted.

Easy, Normal, and Hard currently use the same defaults. Each preset can override settings in `PRESETS` in `src/badDraw.js`. The dev panel is visible during every drawing round. Drift controls take effect immediately, ink width applies to the next stroke, and round length applies to the next round. Tuning carries over until you reset it, change difficulty, or reload the page.

Additional prompts were sourced from the [Datamuse API](https://www.datamuse.com/api/) and screened using [Brysbaert et al.’s concreteness ratings](https://pubmed.ncbi.nlm.nih.gov/24142837/).
