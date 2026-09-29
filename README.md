# Tumbang Preso

The Filipino street game, in 3D. It's five o'clock on a barangay street: the sari-sari store, the banderitas, the electric posts, the jeepney parked at the end. The kids are playing **tumbang preso** until Nanay calls everyone home to eat at six.

**Play:** https://tumbang-preso.vercel.app

## How to play

- Behind the chalk **line** you are safe. Hold to aim at the **lata** (a sardinas can), let go when the swinging power meter is right, and your **tsinelas** flies.
- **Knock the can down**, and the **taya** has to fetch it and stand it back in its circle before tagging anyone. That's everyone's chance to fetch their slipper and run home. Knocking it while friends are out in the field **saves** them.
- **Out past the line** you can be tagged, unless you are **standing on your own tsinelas**. Wait for the moment, then run.
- **Tagged? You're the taya.** Guard the can, count to three, and chase whoever steps out. Tag someone and you're back to throwing.
- **Points:**
  - knocking the can: 100, plus 50 for each friend you save
  - getting home safe with your slipper: 25
  - tagging as the taya: 150
- **Difficulty:**
  - **Madali:** a slow taya, and the whole throwing arc is shown.
  - **Katamtaman:** half the arc.
  - **Mahirap:** no arc, and a fast taya.

### Controls

| | |
| --- | --- |
| Keyboard | **WASD** / arrows to run (**Shift** for speed), **Space** hold and release to throw (or dive as the taya), **Q**/**E** or mouse drag to turn the camera, **P** pause, **M** sound |
| Controller | Any gamepad through the browser's Gamepad API, PlayStation included: **left stick** run, **✕** throw or dive, **○**/**R2** speed, **right stick** camera, **Options** pause |
| Phone | Your left thumb makes a stick wherever it lands; **IBATO** and **TAKBO** buttons on the right; drag the right side to look around |

## How it's made

- **The simulation:** `src/sim.mjs` is a pure fixed-step simulation in metres and seconds. It covers the throws and their arcs, the can flying and rolling, the taya's chores, tags and the safe rules, the AI kids, points and the clock. The 3D view only reads it. The same function that draws the aiming arc decides whether a throw hits.
- **The 3D view:** `src/view3d.mjs` is [three.js](https://threejs.org), bundled into `src/vendor/` so the game works offline. It uses no model files: every house, kid, slipper and jeepney is built from simple shapes and canvas textures.
- **The camera:** a chase camera. It trails behind you while you run and turns toward the can, your slipper or the runners when you stop or aim.
- **Sound:** all synthesized with Web Audio.

Tests (Node 20+): `node --test test/*.test.mjs`. They cover throw physics and aiming, knocking and resetting the can, saves, the tag rules (home, on your own slipper, can down), role swaps, points, the clock, AI kids who keep the game moving on every difficulty, exact replays, and the offline cache.

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). three.js is MIT licensed (`src/vendor/THREE-LICENSE`).

In real life: play somewhere safe, away from cars.

## License

MIT
