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
  - knocks in a row without being tagged: 50 more for each one in the streak (up to 150)
  - a long shot, from 10 m or more: 50 more
  - getting home safe with your slipper: 25
  - tagging as the taya: 150
- **Ways to play:**
  - **Klasiko:** until Nanay calls at six.
  - **Walang Katapusan:** no six o'clock. The sun lowers over ten minutes and holds, and you call it a day from the pause menu.
  - **Ikaw ang Taya:** you guard the can first.
- **Difficulty:**
  - **Madali:** a slow taya, and the whole throwing arc is shown.
  - **Katamtaman:** half the arc.
  - **Mahirap:** no arc, and a fast taya.
- **Ayos (settings):**
  - the game: how long the afternoon is (3, 5 or 8 minutes), how many play (3 to 5), and whether the throwing arc follows the difficulty, always shows or never does
  - the controls: the camera, look speed, invert Y, field of view
  - the sound and the look: music and effects volume, graphics, camera shake
- **Medals:** nine, kept on your device. They include Asintado (a 10 m knock), Sunod-sunod (three in a row), Bantay-Sarado (three tags as the taya) and Hari ng Kalye (the most knocks of anyone).

### Controls

| | |
| --- | --- |
| Mouse and keyboard | Click the game and the **mouse** looks around (Esc lets go and pauses). **Click** or **Space**: hold to aim, let go to throw, or dive as the taya. **WASD** to move (**Shift** for speed), **←**/**→** or **Q**/**E** to turn, **V** first person or chase camera, **P** pause, **M** sound |
| Controller | Any gamepad through the browser's Gamepad API, PlayStation included: **left stick** move, **right stick** look, **✕** throw or dive, **○**/**R2** speed, **△** camera, **Options** pause. In the menus the d-pad or stick moves between buttons (and steps a slider), **✕** presses and **○** goes back |
| Phone | Your left thumb makes a stick wherever it lands; drag the right side to look; **IBATO** and **TAKBO** buttons on the right; **1P/3P** switches the camera |

## How it's made

- **The simulation:** `src/sim.mjs` is a pure fixed-step simulation in metres and seconds. It covers the throws and their arcs, the can flying and rolling, the taya's chores, tags and the safe rules, the AI kids, points and the clock. The 3D view only reads it. The same function that draws the aiming arc decides whether a throw hits.
- **The 3D view:** `src/view3d.mjs` is [three.js](https://threejs.org), bundled into `src/vendor/` so the game works offline.
  - The eskinita is built in code: painted, relief-mapped house fronts (`src/tex.mjs`) with their gates, grilles and the sari-sari store, balconies with the wash out, wires, banderitas, Lola Iska's tarpaulin, and a jeepney going by.
  - `src/envpack.mjs` dresses it with CC0 scans from [Poly Haven](https://polyhaven.com): a photographed sky for light and the sky behind, scanned concrete, asphalt and roofing, and real props (monobloc chairs, crates, pots, a rusted tin can for the lata, trees).
  - `src/people.mjs` plays the kids as real, motion-captured teenagers (Mixamo). Every one idles, runs, winds up and throws, dives, picks up a slipper, carries and sets the can, and counts. They flinch and sulk when tagged, taunt when they tag, and celebrate a knock (cheering, jumping, a fist pump). Their heads follow what matters (the can in the air, the kid being chased, the taya coming close), and they lean into their turns. In first person you're inside your own body: your own arm throws, and the slipper you hold shows in the corner of your eye.
  - The kids talk: a line in a bubble over their heads when a can goes down, a throw misses, someone's tagged or gets home, and now and then while they wait (`src/barks.mjs`).
  - The afternoon goes by: the sun lowers and turns golden, and the sky fades into a Poly Haven dusk by six.
  - `src/crowd.mjs` puts the neighbours out to watch: on the store's chairs, at their gates, by the fishball cart.
  - `src/post.mjs` gives it the film look: ambient occlusion, bloom, a grade, vignette and grain, SMAA. It steps down by itself on slow devices; `?gfx=0|1|2` fixes the level.
  - The Mixamo kids and the Poly Haven street ship only in the Vercel deploy (Mixamo's terms, and size); they're built with the tools in the Bakbakan repo. Without them the game still plays, with simple kids and a painted street.
- **The camera:** first person by default, with your hands in view: the tsinelas you're holding, the wind-up, the throw, fists pumping when you run, the can in your hands as the taya. It turns on its own only when your role changes or you get home with your slipper. **V** (or **△**) switches to a chase camera behind you. That camera stays out of the walls, and it cuts to a low shot of the lata when you knock it down.
- **The moments:** a "Maiba taya!" roulette picks who guards the can first. Callouts mark streaks and long shots. At six the camera finds the best player of the afternoon, celebrating, beside the results and your medals.
- **Sound:** Web Audio. Real recordings (CC0, from [Kenney](https://kenney.nl)) for the tin lata, the rubber slap of a tsinelas, footsteps, dives and tags. The tune, the whoosh of a throw, the neighbours murmuring and cheering, the count and Nanay's bell are synthesized.

Tests (Node 20+): `node --test test/*.test.mjs`. They cover:
- throw physics and aiming
- knocking and resetting the can, and saves
- the tag rules (home, on your own slipper, can down) and role swaps
- points, including streaks and long shots
- the clock and the game options (length, endless play, players, starting as the taya)
- AI kids who keep the game moving on every difficulty
- medals
- exact replays
- the offline cache

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). three.js is MIT licensed (`src/vendor/THREE-LICENSE`).

In real life: play somewhere safe, away from cars.

## License

MIT
