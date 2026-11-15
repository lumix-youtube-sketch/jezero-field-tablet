// Build science points from NASA's official Perseverance sample table and
// place each sample at the rover's position on the sol it was sealed.
// Source: https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/
// (retrieved 2026-11-14). Samples 29-30 have no published sol yet (TBD).
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '/Users/matvey/mars-jezero/public/data';
const SRC = 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/';

// [no, date, sol, name, feature, location, rockType, heightCm, type]
const T = [
  [1,'2021-08-06',164,'Roubion','Roubion','Polygon Valley','n/a',null,'Atmospheric'],
  [2,'2021-09-06',194,'Montdenier','Rochette','Artuby Ridge','Igneous',5.98,'Rock Core'],
  [3,'2021-09-08',196,'Montagnac','Rochette','Artuby Ridge','Igneous',6.14,'Rock Core'],
  [4,'2021-11-15',262,'Salette','Brac','South Séítah','Igneous',6.28,'Rock Core'],
  [5,'2021-11-24',271,'Coulettes','Brac','South Séítah','Igneous',3.30,'Rock Core'],
  [6,'2021-12-22',298,'Robine','Issole','South Séítah','Igneous',6.08,'Rock Core'],
  [7,'2022-01-31',337,'Malay','Issole','South Séítah','Igneous',3.07,'Rock Core'],
  [8,'2022-03-07',371,"Ha'ahóni",'Sid','Octavia E. Butler Landing / Ch’ał outcrop','Igneous',6.50,'Rock Core'],
  [9,'2022-03-13',377,'Atsá','Sid','Octavia E. Butler Landing / Ch’ał outcrop','Igneous',6.00,'Rock Core'],
  [10,'2022-07-07',490,'Swift Run','Skinner Ridge','Delta Front','Sedimentary',6.69,'Rock Core'],
  [11,'2022-07-12',495,'Skyland','Skinner Ridge','Delta Front','Sedimentary',5.85,'Rock Core'],
  [12,'2022-07-27',509,'Hazeltop','Wildcat Ridge','Delta Front','Sedimentary',5.97,'Rock Core'],
  [13,'2022-08-03',516,'Bearwallow','Wildcat Ridge','Delta Front','Sedimentary',6.24,'Rock Core'],
  [14,'2022-10-02',575,'Shuyak','Amalik','Delta Front','Sedimentary',5.55,'Rock Core'],
  [15,'2022-11-16',619,'Mageik','Amalik','Delta Front','Sedimentary',7.36,'Rock Core'],
  [16,'2022-11-29',631,'Kukaklek','Hidden Harbor','Delta Front','Sedimentary',4.97,'Rock Core'],
  [17,'2022-12-02',634,'Atmo Mountain','Observation Mountain','Delta Front','Mixed sedimentary/igneous grains',5.30,'Regolith'],
  [18,'2022-12-07',639,'Crosswind Lake','Observation Mountain','Delta Front','Mixed sedimentary/igneous grains',5.30,'Regolith'],
  [19,'2023-03-30',749,'Melyn','Berea','Upper Fan','Sedimentary',6.04,'Rock Core'],
  [20,'2023-06-23',832,'Otis Peak','Emerald Lake','Upper Fan','Sedimentary',5.77,'Rock Core'],
  [21,'2023-09-15',913,'Pilot Mountain','Dream Lake','Upper Fan','Sedimentary',6.00,'Rock Core'],
  [22,'2023-09-25',923,'Pelican Point','Hans Amundsen Memorial Workspace','Margin Unit','Sedimentary',6.10,'Rock Core'],
  [23,'2023-10-21',949,'Lefroy Bay','Turquoise Bay','Margin Unit','Sedimentary',4.70,'Rock Core'],
  [24,'2024-03-12',1088,'Comet Geyser','Bunsen Peak','Margin Unit','Silica-cemented carbonate',5.78,'Rock Core'],
  [25,'2024-07-21',1215,'Sapphire Canyon','Cheyava Falls','Neretva Vallis','Sedimentary',6.2,'Rock Core'],
  [26,'2025-01-28',1401,'Silver Mountain','Shallow Bay','Crater Rim (Witch Hazel Hill)','Igneous/impactite',2.91,'Rock Core'],
  [27,'2025-03-02',1433,'Green Gardens','Tablelands','Crater Rim (Witch Hazel Hill)','Serpentinite',7.19,'Rock Core'],
  [28,'2025-03-10',1441,'Main River','Broom Point','Crater Rim (Witch Hazel Hill)','Igneous/impactite',4.32,'Rock Core'],
  [29,null,null,'Bell Island','Pine Pond','Crater Rim (Witch Hazel Hill)','Igneous/impactite',null,'Rock Core'],
  [30,null,null,'Gallants','Salmon Point','Crater Rim (Krokodillen)','Igneous or sedimentary',1.91,'Rock Core'],
];

const wp = JSON.parse(readFileSync(`${OUT}/waypoints_local.json`, 'utf8')).waypoints;

// rover position on sol s = last waypoint with sol <= s (rover is parked while sampling)
function posAtSol(s) {
  let best = null;
  for (const w of wp) { if (w.sol <= s) best = w; else break; }
  return best;
}

const samples = T.map(([no, date, sol, name, feature, location, rock, h, type]) => {
  const p = sol != null ? posAtSol(sol) : null;
  return {
    no, date, sol, name, feature, location, rock_type: rock, height_cm: h, sample_type: type,
    placed: !!p,
    wp_sol: p?.sol ?? null, u: p?.u ?? null, v: p?.v ?? null, elev_m: p?.elev_m ?? null,
  };
});

writeFileSync(`${OUT}/samples.json`, JSON.stringify({ source: SRC, retrieved: '2026-11-14', samples }, null, 2));
const placed = samples.filter(s => s.placed).length;
console.log(`wrote samples.json: ${samples.length} samples, ${placed} placed on the map (rest have no published sol)`);
for (const s of samples.filter(s=>s.placed)) console.log(`  #${s.no} ${s.name.padEnd(16)} sol ${String(s.sol).padStart(4)} -> wp sol ${String(s.wp_sol).padStart(4)}  ${s.location}`);
