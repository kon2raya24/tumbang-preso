# Tumbang Preso

The Filipino street game, in 3D and first person. It's a sunny afternoon in a barangay eskinita: two-storey houses in pastel hollow blocks, the sari-sari store with its monobloc chairs, laundry on the balconies, banderitas and a tangle of wires overhead, a fishball cart, and a jeepney going by at the end of the street. You hold your tsinelas in your own hand, and the kids play **tumbang preso** until Nanay calls everyone home to eat at six.

**Play:** https://tumbang-preso-3d.vercel.app

## How to play

- Behind the chalk **line** you are safe. Look at the **lata** (a sardinas can), hold to aim, and let go when the swinging power meter is right: your **tsinelas** flies where you look.
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
| Mouse and keyboard | Click the game and the **mouse** looks around (Esc lets go and pauses). **Click** or **Space**: hold to aim, let go to throw, or dive as the taya. **WASD** to move (**Shift** for speed), **←**/**→** or **Q**/**E** to turn, **V** first person or chase camera, **P** pause, **M** sound |
| Controller | Any gamepad through the browser's Gamepad API, PlayStation included: **left stick** move, **right stick** look, **✕** throw or dive, **○**/**R2** speed, **△** camera, **Options** pause |
| Phone | Your left thumb makes a stick wherever it lands; drag the right side to look; **IBATO** and **TAKBO** buttons on the right; **1P/3P** switches the camera |

## How it's made

- **The simulation:** `src/sim.mjs` is a pure fixed-step simulation in metres and seconds. It covers the throws and their arcs, the can flying and rolling, the taya's chores, tags and the safe rules, the AI kids, points and the clock. The 3D view only reads it. The same function that draws the aiming arc decides whether a throw hits.
- **The 3D view:** `src/view3d.mjs` is [three.js](https://threejs.org), bundled into `src/vendor/` so the game works offline. It uses no model or image files: every house, kid, slipper and jeepney is built from simple shapes. The walls, gates, grilles, signs and faces are small canvas textures painted pixel by pixel and magnified without smoothing, for the chunky look. The static street is merged by material into a few dozen draw calls.
- **The camera:** first person by default, with your hands in view: the tsinelas you're holding, the wind-up, the throw, fists pumping when you run, the can in your hands as the taya. It turns on its own only when your role changes or you get home with your slipper. **V** (or **△**) switches to a chase camera behind you.
- **Sound:** all synthesized with Web Audio.

Tests (Node 20+): `node --test test/*.test.mjs`. They cover throw physics and aiming, knocking and resetting the can, saves, the tag rules (home, on your own slipper, can down), role swaps, points, the clock, AI kids who keep the game moving on every difficulty, exact replays, and the offline cache.

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). three.js is MIT licensed (`src/vendor/THREE-LICENSE`).

In real life: play somewhere safe, away from cars.

## License

MIT
