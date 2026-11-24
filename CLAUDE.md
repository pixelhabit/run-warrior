# Run Warrior

A pixel-art running game. The player (the warrior) fights monsters, one live GPS run per fight. Running fast enough blocks the monster's attacks; covering the distance defeats it.

## Owner context
- Built by Vinz, who also made SPIN-A-RUN (a roulette-wheel running web app hosted on GitHub Pages as a single index.html, dark charcoal and red look, Racing Sans One title font in all caps).
- Run Warrior is a separate game with its own look (pixel art, Press Start 2P and VT323 fonts, indigo and gold).

## Core loop
- Stage map: stages unlock in order (beat one to open the next). No weekly schedule: the player fights any open stage whenever they choose. Distances show under monster names on the map.
- A fight is one GPS run. Both start at full HP (warrior 100).
- Every 30 s of moving time (after a 1-minute warm-up) blows are traded:
  - The warrior's strike: monster HP falls in step with distance covered (it only reaches 0 at the goal distance).
  - The monster's attack: blocked if the live pace (last 30 s) is at or under the pace target; otherwise it hits for ceil(attack × severity), severity = (pace/target − 1) × 4, clamped to 25%–100%. Standing still = full attack. No GPS points in the window = no damage.
- Reaching the goal distance wins. Warrior HP 0 = knocked out (fight lost). Retreat ends a fight early. Lost or retreated fights can be retried any time; the best % is shown on the map.
- Levels 1–5 (chosen in warrior setup) set the pace targets: 1 = slow runners, 5 = fast runners.
- Monsters (distance, HP, attack, pace targets L1–L5): Slime 3 km, 100, 10, 8:15/7:15/6:15/5:30/4:45; Goblin 5 km, 150, 8, 8:30/7:30/6:30/5:45/5:00; Troll 10 km, 200, 6, 8:45/7:45/6:45/6:00/5:15; Dragon (boss) 21 km, 400, 5, 9:00/8:00/7:00/6:15/5:30.
- Beating all stages shows a champion screen with a "new campaign" reset.

## Fair-play checks
- A win must pass: average speed ≤ 25 km/h and at least 30 GPS track points; otherwise it doesn't count.

## Warrior profile
- Name (max 12 characters; blank shows "Warrior"), male or female character, level 1–5. Kept when progress resets; editable from "Edit warrior".

## Run data
- Runs come only from browser GPS (Geolocation API), tracked live in the game: start, pause/resume, retreat. Manual entry was removed by the owner's choice.
- GPS needs a secure page: https (GitHub Pages) or localhost. A phone opening the Mac's LAN address over http gets no GPS.
- Limits: the screen and tab must stay open (the game requests a screen wake lock). Paused time and distance don't count. A fight in progress is saved, so a reload resumes it paused.
- Track filtering: skip fixes worse than 35 m accuracy, ignore moves under 5 m (jitter), drop jumps faster than 30 km/h.
- `?simulate` (e.g. `?simulate=360&speed=20`) fakes a GPS run for desk testing.
- Later options: Strava (needs a paid subscription for API access and a small serverless function for the OAuth token exchange). Apple Health and Google Health Connect need a native app; out of scope for the web version.
