# Sol by Sol

*Mars, one sol at a time.*

**NASA Space Apps Challenge 2026 · Interplanetary Survival Guide: Martian Map**

A 3D field tablet for planning safe Mars excursions, built entirely from real NASA data.
Explore Jezero Crater, replay Perseverance's real 45 km drive, plan safe Marswalks, and drive a
crew rover across HiRISE terrain, where the slope, sand and energy you deal with all come from orbital data.

**Live app:** https://lumix-youtube-sketch.github.io/jezero-field-tablet/

## What you can do
- **Mission tour:** ten real stops, from landing (Feb 2021) to today, with the rover's own raw photos.
- **Mission replay:** Perseverance's real path (708 stops, sol 13–2022) and 28 sample sites from NASA's sample table.
- **Safe-route planner:** A* least-cost search on the 20 m DEM. Slopes above a limit are impassable, and loose sand (from THEMIS thermal data) can be avoided. Each route also gets a crew Marswalk estimate: time, EVA budget, a turnaround point and radiation dose.
- **Expeditions:** drive a concept crew rover (NASA's Space Exploration Vehicle model) on real terrain. Physics comes from data: grade from the DEM, loose ground from THEMIS, and energy from m·g·(Crr·cosθ+sinθ)·v/η. At each site you read the field station's measurements, identify the rock, and compare it with NASA's answer. The full traverse log exports as CSV.

## Data (all public NASA / USGS products)
| Layer | Source |
|---|---|
| Terrain, 20 m/px | USGS Mars 2020 CTX DEM mosaic (MRO CTX) |
| Imagery, 5 m/px | USGS Mars 2020 CTX orthomosaic |
| Close-up detail | USGS Mars 2020 TRN HiRISE ortho (0.25 m) + DTM (1 m), cut into 1 m / 4 m tiles |
| Thermal | Mars Odyssey THEMIS night-IR mosaic, 100 m/px (NASA Mars Trek WMTS) |
| Rover path | NASA/JPL "Where is Perseverance" waypoint feed |
| Samples | NASA Mars 2020 sample table |
| Photos | NASA/JPL-Caltech Mars 2020 raw images |
| 3D models | NASA 3D Resources: Perseverance, Space Exploration Vehicle |
| Radiation | Curiosity RAD average surface dose (~0.64 mSv/day) |

The crew-rover parameters (mass, battery, power), the suit pace, and the science points in the
missions are **assumptions**, and the app labels them as such. The Mars color tint on the grayscale imagery is cosmetic.

## Run locally
```bash
npm install
node src/server.js     # http://localhost:5178
```
The app in `public/` is static, so any web server works. To rebuild the data from the original archives, run
`src/build_heightmap.js`, `build_ortho.js`, `build_context.js`, `build_thermal.js`, `build_hirise.js`,
`build_samples.js`, `build_media.js` and `build_expeditions.js`. Raw GeoTIFFs go into `data/`, which is not committed.

## Tech
JavaScript, three.js, geotiff.js, Node.js. The route engine (`public/js/route.js`) and the rover model
(`public/js/rovermodel.js`) are shared by the app and the offline balancing scripts.

## AI disclosure
The source code and data-processing scripts were written with the help of an AI coding assistant
(Claude, by Anthropic) and reviewed and tested by the team. No AI-generated images, video or audio are used;
all imagery, terrain and models are real NASA/USGS products.
