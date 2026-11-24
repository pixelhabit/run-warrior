# Run Warrior

A pixel-art running game: fight monsters with live GPS runs. Hold the pace to block their attacks, cover the distance to win. See `CLAUDE.md` for the full design.

## Run locally

ES modules and `fetch` need a local server (opening the file directly won't work):

```bash
python3 -m http.server 8000
```

- Game: http://localhost:8000/
- Tests: http://localhost:8000/tests/

No build step and no npm. It deploys to GitHub Pages as-is.

## GPS

Runs are tracked live with the browser's GPS. Browsers only allow GPS on secure
pages: the published https site, or `localhost` on this computer. A phone opening
this computer's network address over plain http gets no GPS.

To try a run at a desk, add `?simulate` to the URL. It fakes a run at 6:00/km,
20× faster than real time. Change both with `?simulate=330&speed=40`
(pace in seconds per km, speed-up factor).

## Layout

```
index.html          app shell
css/style.css       pixel-art styling and animations
js/main.js          screens: title and warrior setup, stage map, live fight
js/gps.js           GPS run tracking (distance, moving time, jitter filtering, simulator)
js/sprites.js       pixel sprites drawn from text grids
js/scene.js         animated battle backdrops and hit effects
js/audio.js         chiptune sound effects (Web Audio, no files)
js/monsters.js      loads data/monsters.json
js/rules.js         live fight engine (pace checks, blows traded), levels, fair-play checks
js/storage.js       localStorage save/load
js/format.js        time, pace and goal text for display
data/monsters.json  monster definitions (format documented in "_format")
icons/              app icons (browser tab, iPhone and Android home screen)
manifest.webmanifest  name and icons for "Add to Home Screen"
tools/make_icon.py  redraws the icons: python3 tools/make_icon.py icons
tests/              in-browser tests (open tests/index.html via the server)
```
