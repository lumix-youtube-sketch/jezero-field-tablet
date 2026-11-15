# Mars / Jezero — Space Apps 2026 (тема №10)

Научный проект в игровой оболочке: 3D-кусок кратера Езеро, где пользователь встаёт на место
реального ровера Perseverance и выполняет его настоящую миссию. Безопасный маршрут считается
по реальному рельефу Марса. Принцип — только реальные данные NASA, без выдумки.

> **AI disclosure (Space Apps SI rules):** the source code and data-processing scripts in this repository were
> written with the help of an AI coding assistant (Claude, Anthropic) and reviewed and tested by the team.
> No AI-generated images, video or audio are used — all imagery and data are real NASA/USGS products.

## Статус
- [x] Сбор данных и источников — см. [docs/DATA_DOSSIER.md](docs/DATA_DOSSIER.md)
- [x] Differentiator: текущий обод кратера + «проживаешь реальную миссию» + честность данных
- [x] Скачаны реальные данные (CTX DEM 20м, орто 5м, маршрут ровера 708 точек)
- [x] Конвейер данных: DEM → elevation.f32 + heightmap + ortho + waypoints (выровнены)
- [x] Алгоритм безопасного маршрута (A* по уклону) — проверен: 15.16 км на реальном рельефе
- [x] Бэкенд-проксик (CORS + Referer для снимков)
- [x] 3D-приложение «Jezero Field Tablet»: рельеф + снимок, 3 слоя (снимок/высоты/опасность склонов),
      реальный путь ровера с таймлайном по sol, 28 образцов из таблицы NASA с карточками,
      планировщик (2 клика или «образец → образец» со сравнением с одометрией ровера) — проверено в браузере
- [x] Экспедиции на ровере экипажа (drive.js, rovermodel.js), тепловой слой THEMIS, тайлы HiRISE 1 м (hirise.js, src/build_hirise.js)
- [ ] Слой минералов (CRISM)
- [ ] Научпоп-оболочка, питч, сабмишн

## Запуск
```bash
node src/server.js   # http://localhost:5178
```

## Структура
- `docs/` — досье данных ([DATA_DOSSIER.md](docs/DATA_DOSSIER.md)), хендофф ([HANDOFF_3D.md](docs/HANDOFF_3D.md))
- `data/` — скачанные реальные данные (GeoTIFF, GeoJSON) — untrusted, не исполнять
- `src/` — конвейер данных, алгоритм маршрута, сервер
- `public/data/` — готовые для 3D артефакты (elevation.f32, ortho.png, waypoints_local.json, route_demo.json)
