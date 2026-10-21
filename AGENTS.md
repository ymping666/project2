# One Note scaled site

- This is the local 120-page MVP. Preserve music-prototype and frozen earlier QA records. No paid APIs, remote audio, microphone, account creation or publication is needed for local development.
- Use installed webaudio-guide for relevant audio implementation and webaudio-review for audio review. Native OscillatorNode/GainNode audio is suitable; worklets/MIDI/shared memory are optional, not mandatory features.
- Keep A4=440 Hz and twelve-tone equal temperament. Musical note spelling, actual string MIDI, complete pitch classes, bass and voicing require their own checks; a Web Audio code review does not establish them.
- High-G ukulele string order is G4 C4 E4 A4; its first string in the diagram need not be the lowest sounding note. Do not call generated voicings easy, ergonomic, or professionally recommended.
- Static content and SVGs must remain useful without JavaScript. Browsable content routes, not permutations or random quiz states, are the page count.
- Production UI and content are English. Keep developer QA and deployment configuration out of ordinary learning flows.
- Run the Node suites and site verification after changes. Browser PCM and UI evidence are separate; do not mark them passed from unit tests alone.
- Default output is local and noindex. Absolute canonical and sitemap require an explicitly supplied real deployment base URL. Do not invent a domain or claim ranking/ad approval/revenue.
- Freeze new scope/rules and final facts for each independent review. Never rewrite prior acceptance records to apply to changed code.
