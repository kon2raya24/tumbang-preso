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
- **The 3D view:** `src/view3d.mjs` is [three.js](https://threejs.org), bundled into `src/vendor/` so the game works offline.
  - The eskinita is built in code: painted, relief-mapped house fronts (`src/tex.mjs`) with their gates, grilles and the sari-sari store, balconies with the wash out, wires, banderitas, Lola Iska's tarpaulin, and a jeepney going by.
  - `src/envpack.mjs` dresses it with CC0 scans from [Poly Haven](https://polyhaven.com): a photographed sky for light and the sky behind, scanned concrete, asphalt and roofing, and real props (monobloc chairs, crates, pots, a rusted tin can for the lata, trees).
  - `src/people.mjs` plays the kids as real, motion-captured teenagers (Mixamo). Every one idles, runs, winds up and throws, dives, picks up a slipper, carries and sets the can, counts, sulks and cheers. In first person you're inside your own body: your own arm throws, and the slipper you hold shows in the corner of your eye.
  - `src/crowd.mjs` puts the neighbours out to watch: on the store's chairs, at their gates, by the fishball cart.
  - `src/post.mjs` gives it the film look: ambient occlusion, bloom, a grade, vignette and grain, SMAA. It steps down by itself on slow devices; `?gfx=0|1|2` fixes the level.
  - The Mixamo kids and the Poly Haven street ship only in the Vercel deploy (Mixamo's terms, and size); they're built with the tools in the Bakbakan repo. Without them the game still plays, with simple kids and a painted street.
- **The camera:** first person by default, with your hands in view: the tsinelas you're holding, the wind-up, the throw, fists pumping when you run, the can in your hands as the taya. It turns on its own only when your role changes or you get home with your slipper. **V** (or **△**) switches to a chase camera behind you.
- **Sound:** Web Audio. Real recordings (CC0, from [Kenney](https://kenney.nl)) for the tin lata, the rubber slap of a tsinelas, footsteps, dives and tags. The tune, the whoosh of a throw, the neighbours murmuring and cheering, the count and Nanay's bell are synthesized.

Tests (Node 20+): `node --test test/*.test.mjs`. They cover throw physics and aiming, knocking and resetting the can, saves, the tag rules (home, on your own slipper, can down), role swaps, points, the clock, AI kids who keep the game moving on every difficulty, exact replays, and the offline cache.

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). three.js is MIT licensed (`src/vendor/THREE-LICENSE`).

In real life: play somewhere safe, away from cars.

## License

MIT
