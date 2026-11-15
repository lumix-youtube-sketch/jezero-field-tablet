// Minimal backend for the Mars/Jezero app:
//  - serves ./public (3D app + prepared data)
//  - /api/img?url=   proxies NASA imagery with a Referer (bypasses 403 hotlink),
//    host-whitelisted to avoid being an open proxy
//  - /api/waypoints  refreshes the live "Where is Perseverance" feed (adds CORS)
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 5178;
const ALLOW = ['mars.nasa.gov', 'nasa.gov', 'jpl.nasa.gov', 'planetarymaps.usgs.gov'];
const WAYPOINTS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';

const app = express();
// dev server: never let the browser keep a stale copy of the app
app.use(express.static(PUBLIC, { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));

const hostOk = (u) => { try { const h = new URL(u).hostname; return ALLOW.some(d => h === d || h.endsWith('.' + d)); } catch { return false; } };

app.get('/api/img', async (req, res) => {
  const url = req.query.url;
  if (!url || !hostOk(url)) return res.status(400).send('bad or disallowed url');
  try {
    const r = await fetch(url, { headers: { 'Referer': 'https://mars.nasa.gov/', 'User-Agent': 'Mozilla/5.0 (research)' } });
    if (!r.ok) return res.status(r.status).send(`upstream ${r.status}`);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).send('proxy error: ' + e.message); }
});

app.get('/api/waypoints', async (_req, res) => {
  try {
    const r = await fetch(WAYPOINTS, { headers: { 'User-Agent': 'Mozilla/5.0 (research)' } });
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).send('proxy error: ' + e.message); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, public: PUBLIC }));

app.listen(PORT, () => console.log(`Mars/Jezero server on http://localhost:${PORT}`));
