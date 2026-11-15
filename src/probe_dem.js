// Probe the CTX DEM georeferencing and check waypoint alignment.
import { fromFile } from 'geotiff';
import { readFileSync } from 'node:fs';

const DEM = '/Users/matvey/mars-jezero/data/M20_JezeroCrater_CTXDEM_20m.tif';
const WP  = '/Users/matvey/mars-jezero/data/M20_waypoints.json';

const tiff = await fromFile(DEM);
const img = await tiff.getImage();
const W = img.getWidth(), H = img.getHeight();
const bbox = img.getBoundingBox();      // [minX, minY, maxX, maxY] in CRS units
const origin = img.getOrigin();
const res = img.getResolution();
const keys = img.getGeoKeys();
console.log('DEM size:', W, 'x', H);
console.log('bbox (CRS):', bbox.map(v=>v.toFixed(1)));
console.log('origin:', origin.map(v=>v.toFixed(1)), 'res:', res.map(v=>v.toFixed(3)));
console.log('GeoKeys:', JSON.stringify(keys));

// sample elevation min/max from a downsampled read
const data = await img.readRasters({ width: 300, height: Math.round(300*H/W) });
const band = data[0];
let mn=Infinity, mx=-Infinity, nod=0, n=0;
for (const v of band){ if(v===undefined||Number.isNaN(v)) {nod++; continue;} if(v<-1e6||v>1e6){nod++;continue;} mn=Math.min(mn,v); mx=Math.max(mx,v); n++; }
console.log('elev sample: min', mn.toFixed(1), 'max', mx.toFixed(1), 'valid', n, 'nodata', nod);

// waypoint ranges
const wp = JSON.parse(readFileSync(WP,'utf8')).features;
const E = wp.map(f=>f.properties.easting), N = wp.map(f=>f.properties.northing);
const lo = wp.map(f=>f.properties.lon), la = wp.map(f=>f.properties.lat);
console.log('waypoints easting:', Math.min(...E).toFixed(1), '->', Math.max(...E).toFixed(1));
console.log('waypoints northing:', Math.min(...N).toFixed(1), '->', Math.max(...N).toFixed(1));
console.log('waypoints lon:', Math.min(...lo).toFixed(4), '->', Math.max(...lo).toFixed(4));
console.log('waypoints lat:', Math.min(...la).toFixed(4), '->', Math.max(...la).toFixed(4));

const inside = Math.min(...E)>=bbox[0] && Math.max(...E)<=bbox[2] && Math.min(...N)>=bbox[1] && Math.max(...N)<=bbox[3];
console.log('waypoint easting/northing inside DEM bbox?', inside);
