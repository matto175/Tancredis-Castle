# ATLANTIS: ART BIBLE

This file defines **what the scene must look like**. It is written for both the developer and the visual critic, and contains no implementation guidance. Reference images live in `concept-art/` (the eight top-level images only; ignore the `rejected/` and `source/` subfolders). Section 3 says how to use them.

**Scene in one sentence:** Atlantis at golden hour, a coastal garden city of white marble, living crystal and clear water, laid out in concentric rings and six radial spokes around a colossal crystal rising from an open crystal lotus. It should feel **tuned, not built**.

---

## 1. Vision

An ancient-feeling future: calm, abundant, humid, sunlit and inhabited. Technology appears only as crystal, glass, light and water, never as machinery. The city is woven into gardens. Flowering trees, cypress, vines and planters are everywhere, and the white architecture peeks out of the greenery.

**Design principles**
1. **Coherence.** One system of rings, radial spokes and six-fold symmetry governs the city plan, the paving inlay and the energy pulse.
2. **Translucency.** Crystal and glass let light in, bend it and show the world behind them.
3. **Light is purposeful.** Crystal light is restrained and follows geometry (cores, inlay lines, the pulse). There is no ambient "magic glow".
4. **Water is infrastructure.** Canals, ring moats, pools and cascades are everywhere and full of reflections.
5. **Nature is not separate.** There is no split between city and garden.
6. **Quiet monumentality.** The scale is vast but bright, soft and open, never oppressive or dark.

**Skyline silhouette:** a tall faceted crystal rising out of a fanned crystal lotus on a stepped round white podium, ringed by six slender spiral-banded crystal towers, over concentric rings of turquoise water, with limestone mountains behind.

## 2. Rendering target: fantasy photorealism

**The subject is fantasy, but the rendering is not.** Every frame should look like a real place rendered by a current-generation AAA game engine or real-time cinematic. A screenshot should pass as a frame from such a game.

It must **never** read as: concept-art painting, illustration, stylized or cel-shaded, toy or miniature model, low-poly, clay or plastic, "clean CG", or an early-2010s game.

**Real-world anchors.** Each fantasy material behaves like a real one:

| Element | Should look like |
|---|---|
| White stone | Honed and polished Thassos / Carrara marble, travertine |
| Crystal | A giant natural clear quartz specimen, optical glass |
| Glass domes | Botanical-garden conservatories: thin glass in slender metal ribs |
| Canals and pools | Clear Mediterranean coves: turquoise over a pale stone floor |
| Landscape | A Dalmatian or Ligurian limestone coast with green slopes |
| Vegetation | A lush Mediterranean garden: Italian cypress, olive, stone pine, plane trees, bougainvillea, jacaranda, hydrangea, lavender, climbing vines |

**What makes it read as real:**
1. **Grounding.** Dark contact shadows and occlusion wherever things meet: buildings on ground, walls at waterlines, under eaves and balustrades, inside arches, planters and window reveals. The image is bright overall, but crevices go genuinely dark (deep navy-teal, never pure black).
2. **One sun, one sky.** Every surface responds consistently to the same warm sun and cool sky. Highlights are shaped by surface roughness. Fresnel is visible everywhere: stone and water brighten at grazing angles, glass becomes a mirror at the edges.
3. **Bevelled edges.** Every architectural edge is slightly rounded and catches a thin highlight. There are no razor-sharp CG edges and no visible seams.
4. **Pristine but physically real surfaces.** Faint marble veining and pores, polished zones (paving, steps) next to honed zones (walls), slight darkening and a little moss at waterlines, leaf litter at planter edges. This detail is low in contrast and calm, never noisy.
5. **Secondary detail at every distance.** Cornices, stepped bases, window reveals and frames, dome mullions, railings, planters, vines. No large surface is blank.
6. **Botanical vegetation.** Trunks and branches are visible, leaf clusters have gaps the sky shows through, and leaves glow translucent when backlit. Never lollipop spheres, smooth blobs or cone props.
7. **Depth.** Aerial perspective grows steadily with distance, so the mountains clearly sit kilometres away.
8. **Camera response.** Filmic tone response, natural saturation, restrained bloom, no sparkle filters.

## 3. Reference images

All eight images show the same city in the same game-render style. Together they define the target look.

| File | Shot | Take from it |
|---|---|---|
| `P1_hero_aerial.png` | P1 | City plan: rings, spokes, podium and lotus, harbour, terraced fields, mountains with waterfalls, palette and haze, the faint beam |
| `P2_axis_approach.png` | P2 | The bridge axis: marble deck with gold inlay, crystal balustrades, indigo cascades on the podium, glass domes and arcaded halls, spiral towers, mirror water |
| `P3_canal_level.png` | P3 | Water: clarity, caustics on the floor, mirror reflections, moss at the waterline, flowering planting over quay walls |
| `P4_crystal_closeup.png` | P4 | The crystal: clear quartz, internal fractures, edge dispersion, lotus petals, indigo ring pool, gold inlay, pylons |
| `P5_garden_quarter.png` | P5 | Garden-quarter density: villas half-hidden in greenery, flowers everywhere, cupolas, cypress rhythm, a canal and bridge, backlit leaves |
| `P6_west_quay.png` | P6 | Sea and glare: the sun-glitter path, clear shallows over rock, quays and balustrades against the sun, the skyline along the coast |
| `M1_podium_materials.png` | material sheet | Close-up materials: marble veining and polish, gold inlay, crystal-panel balustrade, indigo cascade into an indigo pool, lotus petals |
| `V1_garden_street.png` | vegetation sheet | Close-up villas and planting: plaster, arched gold-framed windows, olive trunk and branches, bougainvillea, hydrangea, dappled light, a worn path, a water channel |

**Match the references in** composition, palette, light direction and mood, architecture, material identity, and vegetation and flower density. The render should look like the same place in the same game.

**Known deviations in the references.** Here, follow this document, not the image:
- Some images show more than six towers. There are exactly six.
- In some shots the podium and lotus look smaller than specified. The crystal is about 105 m tall and dominates.
- The craft in P1 and P3 are slightly too flat and disc-like. They are elongated teardrops.
- There are small star-shaped glints at the sun and on crystal tips. Highlights should be physically shaped.
- The cascades in M1 and P4 are splashy. Indigo liquid slides in smooth, slightly viscous sheets.

A render with less micro-detail than the references is acceptable. A render that looks less physically real is not.

## 4. Scope and exclusions

**Single world state:** clean, abundant, balanced, at one fixed time of day (section 9). No decline, ruin, flood or night.

**Never include:**
- people, figures, statues of figures, animals, birds, fish or any creature
- text, glyphs, runes, writing-like symbols, logos, UI or holograms in the scene
- classical orders (Doric, Ionic, Corinthian capitals), triangular pediments, Egyptian or ziggurat imagery
- machinery: engines, pipes, wires, gears, panels, screens, glass skyscrapers, flying saucers
- neon, lightning, laser beams, magic particles, glowing runes, "magic glow" overlays
- ruins, weathering, sepia or desert palettes, pastel washes, permanent fog
- an underwater or bubble-domed city

## 5. World layout

Harbour and open sea to the **south**, mountains to the **north**, sea to the east and west. Sizes are proportions to hold (±15% for composition), but keep the hierarchy and the ring order.

| Zone | Radius from centre | Content |
|---|---|---|
| Sanctuary podium | 0–85 m | Three stepped tiers, crystal lotus and master crystal, indigo ring pool, crystal pylons, inlaid paving |
| Inner moat | 85–125 m | Indigo light-liquid |
| Civic ring | 125–215 m | Large glass domes, arcaded halls, six crystal towers, plazas, gardens |
| Middle canal | 215–250 m | Clear turquoise water |
| Garden quarter | 250–380 m | Villas, dense trees and flowers, small channels and pools, small domes |
| Outer canal | 380–415 m | Clear turquoise; opens south into the harbour and meets the river from the north |
| Outer shelf | 415–900 m | Terraced fields, orchards, groves, scattered villas, descending to the coast |
| Harbour | south of the outer shelf | Terraced stone quays and stepped landings |
| Mountains | 1–2.2 km north | Pale limestone cliffs and green slopes, peaks around 450–600 m, 2–3 waterfalls; a river runs south to the outer canal |
| Sea | everywhere else | Open ocean to the horizon, a few low hazy islands at 3–6 km |

**Plan rules**
- **Six spokes** (bridges and causeways, about 14 m wide) radiate from the centre across every ring on low arches. The south spoke, from the harbour, is the grandest.
- **Six towers** stand in the civic ring between the spokes.
- **Rings are not a bullseye.** Radii wobble gently, and rings widen into lagoons or bend with terrain, but the order always holds.
- **Height hierarchy.** The master crystal (about 145 m above sea) is by far the tallest, towers reach about 90 m, and everything else stays below about 45 m. The crystal is visible from almost everywhere.
- **Readability test.** From above, the city reads as sanctuary, water, civic ring, water, garden quarter, water, cultivated coast. From ground level, the crystal tip shows above the rooftops.

## 6. Hero elements

**A. Sanctuary podium.** Circular, three stepped white marble tiers rising about 30 m above the water, with low parapets. Thin sheets of indigo light-liquid spill over the tier edges into the moat (P2, M1). On top: a ring pool of indigo light-liquid around the lotus, a ring of about 12 faceted crystal pylons (14 m), and polished paving with flush gold inlay of concentric rings and 12 radial lines.

**B. Crystal lotus.** 12–16 large translucent crystal petals, each about 25–35 m long, fanned open in a corona around the base of the master crystal on a low white drum, with thin pale-gold rims (P2, P4). The petals are clear and faceted, tinted faintly aqua and lilac, and lit by the sun through them.

**C. Master crystal (focal point).** A single elongated six-sided crystal, about 16 m across, rising about 105 m above the podium and tapering slightly to a gem-cut faceted point. It is **clear and refractive** (P4):
- the sky and the city behind it are visibly bent through it
- internal facet planes and a few fracture veils and inclusions catch the light
- a soft white core glow, strongest low down, breathes slowly
- pale aqua and lilac tones sit in the facets
- thin spectral fringes appear along the edges

It is the brightest object in the scene, but it looks like a gem lit by the sun, not like a lamp. A very faint thin beam rises from the tip and is visible only through haze.

**D. Six crystal towers.** Slender six-sided crystal shafts, 70–90 m tall and 5–7 m across, with faceted points capped by a fine pale-gold cage. A thin pale-gold spiral band winds around each from base to tip, with a soft internal glow along the spiral (P2, P3). Each stands on a round white plinth in a shallow reflecting pool.

**E. Glass domes.** Ribbed glass domes with slender pale-gold meridian ribs and rings, on white marble drums with arched windows. The glass is thin and faintly aqua-tinted: it reflects the sky at grazing angles, and plants are visible through it. Large ones (30–60 m) stand in the civic ring; small cupolas (5–15 m) crown villas and halls.

**F. Arcaded halls.** Long, low (≤ 25 m) curved halls following the rings, in white marble with arcades of round arches, glass-ribbed or shallow-domed roofs, and balustraded roof terraces with planters. Round arches only: no columns with capitals, no pediments.

**G. Garden villas** (about 150–250 in the garden quarter, 30–60 on the outer shelf). Two or three storeys (6–12 m), white stone with softened corners, arched windows with pale-gold frames, roof terraces with flowers spilling over the parapets, and some with small glass cupolas. Plans vary (round, oval, L-shaped, clustered), as do heights and slight tints (ivory, faint aqua, faint rose). They sit irregularly along winding paths and channels, never on a grid, and the **tree canopies rise above the roofs** (P5, V1).

**H. Bridges, causeways and quays.** Marble decks with gold inlay lines running along them, and balustrades of faceted crystal panels between marble posts (P2, M1). They cross the water on low, shallow arches. Quays step down into the water with human-scale landings (risers about 0.18 m).

**I. Hovering craft** (minor). 8–15 small silver-white **elongated teardrop** pods, about 4.5 m long, seamless, with no wheels, no visible propulsion, never disc- or saucer-shaped. They hover 1–30 m above canals and spokes, and some idle at the harbour. They are rare and quiet.

**J. Mountains and waterfalls.** Pale layered limestone cliffs, forested foothills thinning to bare rock, and 2–3 soft white misty waterfalls, with a river flowing south through the outer shelf (P1).

## 7. Materials

| Material | Look |
|---|---|
| **White marble** | Warm ivory-white in sun, cool blue-aqua in open shadow. Faint grey veining, fine pores. Paving and steps are polished (soft, blurry reflections, not mirrors); walls are honed satin. Bevelled edges catch highlights. Strong aqua bounce from the water on undersides. |
| **Crystal** | Clear and refractive with fresnel edges. Internal facet planes, inclusions and fracture veils. A white core grading to pale aqua and lilac. Dispersion only as thin fringes at edges and facet boundaries. A slow breathing glow, never flicker. |
| **Glass** (domes, windows) | Thin, faintly aqua, mirror-like at grazing angles and transparent face-on, showing interiors and plants. Very subtle thin-film iridescence. |
| **Pale gold** | Thin inlay lines, dome ribs, window frames, tower spirals and caps, petal rims. Satin, never a mirror; never structural cladding. |
| **Plaster and limestone** | Villas and cliffs: matte, slightly warm, fine grain. |
| **Craft alloy** | Seamless silver-white with soft reflections. |

**Pattern vocabulary:** concentric rings, radial spokes, a six-fold hex lattice and spirals, used only as structure and inlay, never as pasted symbols.

## 8. Water

Water is the second hero after the crystal.
1. **Clear turquoise** (canals, pools, harbour, river). See-through over a pale stone floor with moving caustics in the shallows, deepening to teal. Calm, with small ripples. **Clear reflections** of the crystal, towers, domes, trees and sky, and strong fresnel at grazing angles. Caustic light dances on quay walls near the water (P3).
2. **Indigo light-liquid** (inner moat, ring pool, podium cascades). Clearly not ordinary water: deep indigo (#2A1B8C to #1E1470), slow and slightly viscous, with fine luminous violet and rose filaments flowing along the channel. It glows brighter near crystal and reflects the sky with a violet tint (P4, M1). This is the only place indigo dominates. Indigo and turquoise never mix: the two are always separated by stone, and indigo cascades fall only into indigo pools.
3. **Open sea.** Long swell with gentle chop, turquoise shallows grading to deep navy, a broad silky sun-glitter path (never speckled noise), and thin foam at the shore (P6).
4. **Cascades and waterfalls.** Soft sheets with mist: indigo on the podium tiers, white in the mountains.

## 9. Light, sky, atmosphere and colour

**Fixed time: low golden hour.**
- **Sun:** about 15° elevation, from the **west-north-west**. Warm gold-white key light (about #FFE6B8), long soft shadows. In most hero shots the sun is to the front-left, so the crystal, glass, leaves and water are partly backlit and glow at their edges (P1, P2, P5).
- **Sky:** clear and luminous, a medium-blue zenith (about #4A7DB4) grading to pale blue (#9CC0DA) and a warm cream horizon near the sun (#F6E2BE). Scattered small fair-weather clouds with warm sunlit edges. No stars and no large moon.
- **Atmosphere:** warm and humid, a clean luminous haze, never fog. Distant mountains are softened and blue-shifted but still readable (P1, P5), and the sea horizon dissolves into pearl. A soft halo around the sun, and subtle god rays through trees, petals and ridges.
- **Shadows:** open shadows are cool blue-aqua from the sky and water bounce. Contact shadows and crevices are deep. Contrast comes from both warm-versus-cool temperature and real value range.
- **Crystal light** is bright at the cores and in the energy pulse, and spills onto nearby stone and water only locally. It never floods the scene.

**Palette (final image, after tone mapping)**

| Role | Colours |
|---|---|
| Architecture | Pearl #F4F1EA, ivory #E6DCC6, warm sunlit stone #F2E2C4, shadowed stone #B9C9D2 |
| Water and sky | Navy #06223A, teal #0B4D5C, turquoise #1FB5B0, sea-glass #5FB7AE, sky blue #4A7DB4 |
| Vegetation | Cypress green #2F4A2A, emerald #2E6B3E, olive #6F7F4A, sage #8FA67A, backlit leaf #B7C86A |
| Flowers | Magenta #C2407E, rose #E58FB0, lilac #9B7BC8, hydrangea blue #6E7FD0, white |
| Accents | Indigo #2A1B8C, violet #8E5CF0, pale gold #E8C26A |

**Typical frame:** about 35% sky and water, 30% whites, 25% greens, 10% flowers and accents. Natural saturation, never neon.

## 10. Vegetation and landscape

- **Tree types:** tall slender Italian cypress (the vertical rhythm of the city), broad round-canopy trees (olive, plane, stone pine; 8–14 m), and flowering trees in pink, magenta and lilac (about 15–20% of trees).
- **Undergrowth:** abundant flower beds and planters (hydrangea, lavender, bougainvillea), vines and ivy trailing down walls and parapets, low shrubs along paths.
- **Density:** densest in the garden quarter and outer shelf; planted courtyards and edges in the civic ring; only a few ornamental trees and low planting on the podium.
- **Outer shelf:** terraced fields and orchards following the contours in sage, olive and green bands, with narrow water channels. Slightly irregular, never a perfect grid.
- **Terrain:** a smooth coastal plateau, pale layered cliffs at the coast and in the mountains, green slopes, forest thinning with altitude.

## 11. Motion

All motion is slow, smooth and coherent.

| Element | Behaviour |
|---|---|
| Crystal breathing | Master crystal and towers pulse gently in brightness (about a 10 s period, ±15%) |
| **Energy pulse** (signature event) | About every 14 s, a soft wave of warm-white-to-violet light leaves the ring pool and travels outward (about 60 m/s) along the gold inlay rings and the radial lines, across the bridge decks. Nearby water answers with a soft concentric ripple and brighter caustics. Geometric light on surfaces, never bolts or beams. |
| Water | Ripples, caustics, flowing indigo filaments, sea swell, cascades and mist |
| Vegetation | A gentle, coherent breeze |
| Clouds | A slow drift |
| Craft | Smooth looped paths with slow acceleration; idle craft bob subtly |

## 12. Lived-in cues (without people)

The city must feel **inhabited, not like a theme-park model**:
- **Scale cues:** human-size doors and windows, steps, railings, 2 m paving modules, 4.5 m craft, 8–14 m trees.
- **Use cues:** worn footpaths, cultivated rows, planters, open roof terraces, moored craft, stepped water landings.
- **Variation:** no two neighbouring buildings are identical; rings have small asymmetries.

## 13. Shots

Six fixed review shots (16:9, vertical FOV about 60°). Where a reference exists, framing, subject placement and sun side should resemble it.

| # | Shot | Reference | Expected read |
|---|---|---|---|
| P1 | **Hero aerial** from the south-south-east, about 350 m up | P1 | The whole ring-and-spoke city in one view, harbour in the foreground, mountains behind in haze. The crystal is the clear focal point and the sun glows at the left edge. |
| P2 | **Axis approach**, low over the south spoke | P2 | The bridge leads straight to the podium, lotus and crystal. Domes, halls and towers flank the view, mirror water on both sides, and the sun at front-left. |
| P3 | **Canal level**, just above the water | P3 | Clear water with caustics, reflections of towers and domes, flowering trees over quay walls, a craft overhead, and the crystal in the distance. |
| P4 | **Crystal close-up** from the podium, looking up | P4 | Refraction, internal facets, edge fringes, the lotus petals fanning around the base, and the indigo ring pool and gold inlay in the foreground. |
| P5 | **Garden quarter**, about 30 m above the villas | P5 | Villas half-hidden in trees and flowers, a canal, domes and towers in the midground, the crystal beyond, and the sun at upper-left behind trees. |
| P6 | **West quay toward the sun** | P6 | Glare stress test: the sun-glitter path on the sea, backlit haze, stepped quays, rim-lit crystal balustrades. Highlights silky and shimmer-free. |

## 14. Review rubric (for the visual critic)

**Severity**
- **Critical:** does not read as this Atlantis (a Greek ruin, neon sci-fi, dark fantasy, generic fantasy town); **looks stylized, cartoonish, toy-like, low-poly or clay-like**; no ring-and-spoke legibility; no crystal focal point; palette badly off; dark or muddy image.
- **Major:**
  - plastic- or clay-looking materials
  - objects that float for lack of contact shadows
  - lollipop or blob vegetation
  - water without reflections
  - a crystal that reads as a glowing neon prop or holographic foil
  - sparkle glints or blanket bloom
  - missing indigo light-liquid
  - flat sky or haze
  - banding, shimmer, aliasing or popping visible at normal viewing
- **Moderate:** local issues: repeated identical buildings, blank surfaces, hard seams, stretched detail, a weak composition in one shot, a shot whose framing or sun side contradicts its reference.
- **Minor:** polish, such as small colour tweaks or slightly soft reflections.

**Yes/no tests** (every "no" is a defect):
1. Could each screenshot pass as a frame from a current AAA game?
2. Are all objects grounded by contact shadows and occlusion?
3. Do the materials read as their real-world anchors (section 2)?
4. Does the vegetation look botanical, dense and flowering, as in P5 and V1?
5. Does the city read as rings and spokes around the crystal?
6. Are the forms curved, arched, domed or crystalline, with no classical orders or machinery?
7. Is the crystal clear and refractive, with dispersion only at its edges?
8. Is the water clear, reflective and present everywhere, including the indigo light-liquid?
9. Is the light a single coherent low golden-hour sun with cool open shadows and clean aerial perspective?
10. Does the palette match section 9 and the references?
11. Side by side with each reference, does the shot match its composition and mood and look more physically real?
12. Does it feel "tuned, not built" and inhabited?

**Temporal checks** (on the fly-through frames):
- **Shimmer or crawl** on inlay lines, balustrades, foliage, distant geometry, water highlights or sun glitter.
- **Aliasing:** stair-stepped silhouettes or pattern lines.
- **Popping:** objects, shadows, reflections or light levels changing abruptly with distance or motion.
- **Banding** in the sky, haze, glows, crystal interiors or water depth.
- **Instability:** flicker, ghosting or trailing, or sudden exposure changes.
