# Тексты для формы сабмишна — Space Apps 2026

> Всё в форме должно быть **на английском** (требование правил). Ниже — готовый текст под каждое поле,
> копируй как есть. Что заполнить самому — помечено `[ВСТАВИТЬ: ...]`.
> Тема: **Interplanetary Survival Guide: Martian Map**.

---

## Project Name

**Jezero Field Tablet**

(подзаголовок, если поле позволяет: *Relive Perseverance's real mission on real NASA terrain — then plan your own safe traverse*)

---

## High-Level Project Summary

Jezero Field Tablet is an interactive 3D map of the area of Jezero Crater, Mars, where NASA's Perseverance rover is driving today. It is built only from real NASA and USGS data: orbital terrain, orbital imagery, the rover's actual 45 km path and all 30 rock samples from NASA's official sample table. Users replay the mission sol by sol, open each sample to learn what was drilled and why, and plan their own route. The route planner finds the safest path between any two points: it never crosses slopes steeper than a chosen limit. It then compares that path with the distance the rover actually drove, and turns it into a crew Marswalk plan: walking time, EVA time budget, a turnaround point and radiation dose. Users can also drive a concept crew rover across the crater. Slope, loose sand and battery use are computed from real orbital data, and at real sample sites the user identifies each rock from on-the-spot measurements before seeing NASA's answer. This answers the challenge directly. It layers terrain, imagery, slope hazard and mission data at the hyperlocal scale of a single excursion, which global tools like Mars Trek do not focus on. It puts astronaut safety first by making slope hazards visible and computing routes around them. Because every point on the map is a real mission decision, the tool also teaches what we already know about one of the best places on Mars to look for signs of ancient life.

---

## Link to Project Demo

`[ВСТАВИТЬ: публичная ссылка на видео ≤30 сек (YouTube/Google Drive) — сценарий ниже, в конце файла]`

---

## Link to Final Project

https://lumix-youtube-sketch.github.io/jezero-field-tablet/  
(source code: https://github.com/lumix-youtube-sketch/jezero-field-tablet)

---

## Detailed Project Description

**What it does**

Jezero Field Tablet turns the whole of Jezero Crater (an 89 × 101 km area) into an interactive 3D field map, the kind of tool a crew could use on a tablet in the habitat before and during a surface excursion. Inside it, a high-resolution zone of 17.8 × 8.7 km covers everywhere Perseverance has driven since February 2021: the Octavia E. Butler landing site, the crater floor, the ancient river delta, and the crater rim it is exploring now.

It has seven parts:

1. **Layered 3D terrain from two NASA orbiters.** Both the whole crater and the high-resolution zone are built from a USGS digital elevation model made from MRO data. The user can switch between four layers: MRO CTX imagery (optical), elevation (topographic), a slope-hazard map, and Mars Odyssey THEMIS night-time infrared (thermal). Solid rock stays warm after sunset and loose sand and dust cool fast, so the thermal layer shows firm ground versus places where boots and wheels can sink. On the hazard map, red marks every place steeper than the planner's current limit. Vertical relief is adjustable, and the cursor shows latitude, longitude, elevation and slope.
2. **Guided mission tour.** Ten real stops take the user from landing to today. The camera flies to each one, and each comes with an explanation and the rover's own photos from that sol. Stops include Ingenuity's first flight (sol 58), the Séítah magma-chamber rocks, the Three Forks sample depot, and Cheyava Falls, which NASA called a potential biosignature in 2025.
3. **Mission replay.** A 3D model of Perseverance drives its real 45.2 km path: 708 localized stops from NASA/JPL's "Where is Perseverance" feed, sol 13 to sol 2022. The camera can follow the rover. The mission clock shows the Earth date, odometry, elevation and the samples sealed so far, and a notification pops up as each sample is sealed.
4. **Real science stops with real photos.** 28 of the 30 samples in NASA's official table are placed where the rover was parked on the sol its tube was sealed. Each card shows the rock, the region, the rock type, why that region matters, and real raw images from that sol: Navcam, Mastcam-Z, Hazcam, and CacheCam photos of the rock core inside its tube. Samples 29–30 have no published sol yet, so they are not placed on the map.
5. **Safe-route planner that combines data layers.** The user clicks two points, or picks two sample sites. The planner runs an A* least-cost search on about 515,000 cells of about 17 m each. Any step steeper than the slope limit is impassable, and steeper steps below the limit cost more. An "Avoid loose sand & dust" option adds a cost from the THEMIS thermal data, so one route draws on topography from one orbiter and thermal data from another. The planner reports what share of the route crosses loose ground. Example: from Séítah (#4) to the delta front (#10), the plain safe route crosses loose ground for 22% of its length, while the sand-avoiding route crosses 0%. It is only 90 m longer, but it climbs steeper slopes (14.7° maximum instead of 8.8°). For sample-to-sample routes it also shows how far Perseverance really drove between those sols. Example: from Sapphire Canyon to Main River, the safe route is 3.97 km against 3.39 km in a straight line, while the rover drove 6.15 km.
6. **Marswalk (crew EVA) plan.** For any planned route, the tool estimates the walk a suited astronaut would make. Walking time is computed segment by segment with Tobler's hiking function (an Earth model), multiplied by an adjustable suit-pace factor that we state as an assumption. The plan shows outbound and return times, total climb and descent, and the expected radiation dose from Curiosity RAD's average surface rate (~0.64 mSv/day). It checks the round trip against an adjustable EVA time budget (default 6.5 h). If the walk doesn't fit, it marks a turnaround point on the map and on the elevation profile. An astronaut figure can then walk the route, with the EVA clock running. Example: from sample #1 (Polygon Valley) to #28 (Broom Point on the crater rim), the safe route is 12.7 km and climbs 738 m. The round trip takes about 9 h 25 min, so the crew must turn back after 9.1 km or ride a rover for most of the way.
7. **Crew-rover expeditions: drive it yourself, read the data.** The user drives a concept pressurized crew rover with the keyboard across the real Jezero terrain, the way the challenge suggests rovers could carry crews. The physics comes from real data: the CTX DEM gives the grade under the wheels (anything steeper than 25° blocks the rover), and the THEMIS thermal data marks loose ground, which halves speed and raises rolling resistance. Energy follows a physical model, m·g·(Crr·cosθ + sinθ)·v/η plus a life-support load, using Mars gravity (3.71 m/s²). The vehicle numbers are listed in the app and marked as assumptions. Live telemetry shows battery, the energy a safe route back to base would need (recomputed with A*), daylight, speed, grade, ground type, power and score, plus a minimap and a 3D arrow to the target. At each of three expeditions' real sample sites the crew opens a field station. It shows that spot's MRO CTX orbital image, elevation, local slope, THEMIS night-IR index, coordinates and the rover's raw photo from that sol. The player must identify the rock type from the data, then sees NASA's sample-table answer and the CacheCam photo of the real core. The expedition ends at base or when battery or daylight runs out. The result screen compares the player's distance, energy and time with the A* planner over the same stops and shows an elevation profile colored by ground type. Every 100 m is logged, and the full traverse log can be downloaded as CSV. Expedition limits were balanced by exhaustive search over the same model so that collecting everything is impossible: on the rim expedition, a 16 kWh battery allows at best 4 of 6 sites.

**Why it matters**

NASA's first priority is crew safety. On a Marswalk, a suited astronaut cannot afford a slope they can't climb back up. Our planner makes that constraint visible and shows how much detour safety costs. Replaying a real mission also shows how a science team chooses targets: every sample is a real, documented decision. The tool is honest about its limits. A panel called "What this map can't see" explains that a 20 m grid smooths out boulders and sand ripples. Real drive planning uses 25 cm HiRISE imagery and the rover's onboard AutoNav, and our slope is an orbital estimate, not a guarantee.

**How it works**

- Data pipeline (Node.js): it reads the GeoTIFFs with geotiff.js and crops the elevation model and imagery to the rover's area plus a 2 km margin. Both are resampled onto the same aligned grid. The pipeline exports raw elevations as Float32, plus a texture. Rover stops are placed on the grid from the feed's projected coordinates, which use the same Mars 2000 equirectangular coordinate system as the elevation model.
- Route engine: A* on an 8-connected grid with a binary heap and a straight-line-distance heuristic, which never overestimates the remaining cost. It is plain JavaScript that runs in the browser in tens of milliseconds.
- Front end: three.js. It draws the 3D terrain with the imagery or data texture on top, lines for the paths, and labels in the scene. A small Express server serves the data and passes requests to NASA imagery.

**Tools:** JavaScript, Node.js, three.js, geotiff.js, pngjs, jpeg-js, Express.

**What we hope to achieve**

We want a template that works for any landing site: drop in a new elevation model and a rover or crew path, and you get a safety-aware field map. Next steps are mineral layers from orbital spectroscopy (CRISM), 25 cm HiRISE terrain for the high-resolution zone, and a radiation and comms-coverage cost layer for crewed excursions.

---

## Use of Super Intelligence (SI)

> ⚠️ Это поле судьи не видят, но правила требуют честно раскрыть использование ИИ. Ниже — честный текст про то, как мы реально работали. Правила также запрещают использовать ИИ, чтобы *придумать идею решения*. Перед отправкой проверь формулировку про идею: она должна честно отражать, как всё было.

Yes. We used an AI coding assistant (Claude, by Anthropic) to speed up development. It helped us find and evaluate NASA/USGS data sources, write the data-processing scripts, the route-planning algorithm and the three.js interface, and draft the English project text. The team chose the challenge, the location and the direction of the project, and reviewed and tested every result against the source data. For example, we checked sample dates against NASA's table and confirmed the rover path lines up with the terrain. No SI-generated images, video or audio are used: all imagery is real NASA/USGS data. The source code is marked as AI-assisted in the repository README.

---

## NASA Data

- **Perseverance traverse — NASA/JPL "Where is Perseverance" feed** (M20_waypoints.json, mars.nasa.gov MMGIS): 708 localized rover stops, sol 13–2022, with position, elevation and odometry. Used for the mission replay, rover position and odometry comparison.
- **Mars 2020 Perseverance sample table — NASA Science** (science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples): sol sealed, date, sample and rock names, region and rock type for all 30 samples. Used for science stops and sample cards.
- **Mars 2020 Science Investigation CTX DEM mosaic, 20 m/px** — USGS Astrogeology / NASA PDS, made from Mars Reconnaissance Orbiter Context Camera (CTX) stereo data. Used for 3D terrain, slope and route planning.
- **Mars 2020 CTX orthoimage mosaic, 5 m/px** — USGS Astrogeology / NASA MRO CTX. Used for the imagery layer (whole crater + high-res zone).
- **MRO HiRISE — USGS Mars 2020 TRN HiRISE orthomosaic (0.25 m/px) and DTM (1 m/px)**: read directly from the USGS archive with byte-range requests and cut into 1 km tiles: 1 m/px imagery and a 4 m height grid. The tiles stream in around the rover for close-up driving. The HiRISE and CTX elevation models agree to within 0.66 m (median offset), so the two layers join seamlessly.
- **Mars Odyssey THEMIS night-time infrared controlled mosaic, 100 m/px** (THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018), via the NASA Solar System Treks (Mars Trek) WMTS service. Used for the thermal layer and the planner's loose-ground cost. Shown as relative brightness, not calibrated temperature.
- **Mars 2020 raw images — NASA/JPL-Caltech** (mars.nasa.gov raw images API): Navcam, Mastcam-Z, Front Hazcam and CacheCam frames from each sample sol and each tour stop. They are shown unmodified, with credit.
- **NASA mission information** on Perseverance's science goals and on the Cheyava Falls potential biosignature (NASA/JPL news, 2025).

---

## Space Agency Partner Data and Other References

**Data**
- USGS Astrogeology Science Center — Mars 2020 Jezero Crater Landing Site Products (CTX DEM and orthomosaic), planetarymaps.usgs.gov
- NASA/JPL-Caltech — Perseverance waypoints feed and mission pages
- No Space Agency Partner datasets were used in this version.

**Software (open source)**
- three.js (MIT) — 3D rendering, OrbitControls, Line2, CSS2DRenderer
- geotiff.js (MIT) — reading GeoTIFF elevation and imagery
- pngjs (MIT) — texture export
- Express (MIT) — local server
- Fonts: Inter, JetBrains Mono (Google Fonts, SIL OFL)

**Scientific references**
- NASA Science, "Mars Rock Samples" (Perseverance sample table), retrieved Nov 2026
- NASA/JPL, "NASA Says Mars Rover Discovered Potential Biosignature Last Year" (2025)
- Hassler et al. (2014), Curiosity RAD surface radiation measurements — background for future radiation layer
- NASA Space Apps 2026 challenge: "Interplanetary Survival Guide: Martian Map"

---

## Сценарий видео-демо (≤ 30 секунд, с английскими субтитрами)

Структура взята из гайда Space Apps. Записать экран приложения + закадровый голос (можно по-русски, но с английскими субтитрами).

| Время | Что на экране | Текст (EN) |
|---|---|---|
| 0:00–0:03 | Титульник с названием | "We're `[ВСТАВИТЬ: команда]`, and this is Jezero Field Tablet." |
| 0:03–0:08 | Облёт 3D-рельефа Езеро | "The first astronauts on Mars will need maps built for a single walk, not the whole planet." |
| 0:08–0:16 | Play на таймлайне: ровер едет, клик по Cheyava Falls | "Using real NASA data, you replay Perseverance's 45-kilometer drive and see every one of its rock samples — and why it was taken." |
| 0:16–0:24 | Expeditions → едешь на ровере по кратеру (телеметрия, стрелка) → E на точке → полевая станция с данными → выбор породы → настоящий керн | "Then drive a crew rover over real terrain: slope and sand from orbital data, energy from physics — and identify each rock from real measurements." |
| 0:24–0:30 | Общий план + надпись "Real NASA data. Real decisions. Safer Marswalks." | "Real data, real decisions — safer Marswalks." |

Не больше 30 секунд, иначе проект **не допустят** к глобальному судейству.

---

## Чек-лист перед «Submit for Judging» (до 23:59 МСК, 15 ноября)
- [ ] Выложить код на GitHub (публичный репозиторий). Пометить в README, что код писался с помощью ИИ.
- [ ] (желательно) Включить GitHub Pages: приложение статическое, работает без сервера.
- [ ] Записать видео ≤30 сек, залить на YouTube/Drive с открытым доступом, проверить ссылку в приватном окне.
- [ ] Вставить ссылки в поля Demo и Final Project.
- [ ] Отметить чекбоксы Terms & Conditions и «Confirm All Work is Original» → **Submit for Judging**.
