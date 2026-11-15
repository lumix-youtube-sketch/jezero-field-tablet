// Fetch real Perseverance raw-image URLs (NASA raw images API) for each sample sol
// and each tour sol. Output public/data/media.json: { "<sol>": [ {cam, url, full, caption} ] }
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '/Users/matvey/mars-jezero/public/data';
const samples = JSON.parse(readFileSync(`${OUT}/samples.json`, 'utf8')).samples.filter(s => s.placed);
const TOUR_SOLS = [13, 58, 59, 262, 490, 660, 749, 1088, 1212, 1401, 2022];
const API = (cam, sol) => `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=12&page=0&order=sol+desc&search=%7C${cam}&condition_2=${sol}:sol:gte&condition_3=${sol}:sol:lte`;

async function get(cam, sol) {
  try {
    const r = await fetch(API(cam, sol), { headers: { 'User-Agent': 'Mozilla/5.0 (research)' } });
    const j = await r.json();
    let imgs = j.images || [];
    if (cam === 'MCZ_LEFT') { const color = imgs.filter(i => i.imageid.includes('ECM')); if (color.length) imgs = color; }
    imgs = imgs.filter(i => !/thumbnail/i.test(i.sample_type || ''));
    const i = imgs[0]; if (!i) return null;
    return { cam: i.camera.instrument, url: i.image_files.medium, full: i.image_files.large || i.image_files.full_res,
      sol: i.sol, date: (i.date_taken_utc || '').slice(0, 10), caption: (i.caption || '').slice(0, 220) };
  } catch { return null; }
}

const media = {};
const jobs = [];
for (const s of samples) jobs.push([s.sol, ['CACHECAM', 'MCZ_LEFT', 'NAVCAM_LEFT']]);
for (const sol of TOUR_SOLS) jobs.push([sol, ['MCZ_LEFT', 'NAVCAM_LEFT', 'FRONT_HAZCAM_LEFT_A']]);
for (const [sol, cams] of jobs) {
  media[sol] = media[sol] || [];
  for (const cam of cams) {
    if (media[sol].some(m => m.cam === cam)) continue;
    const m = await get(cam, sol); if (m) media[sol].push(m);
  }
  process.stdout.write(`sol ${sol}: ${media[sol].map(m => m.cam).join(', ') || 'none'}\n`);
}
writeFileSync(`${OUT}/media.json`, JSON.stringify({ source: 'NASA/JPL-Caltech Mars 2020 raw images (mars.nasa.gov)', media }, null, 1));
console.log('wrote media.json');
