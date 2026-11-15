// Crew rover model — shared by the game (drive.js) and mission balancing (build_expeditions.js).
// No crewed Mars rover exists yet, so the vehicle numbers are ASSUMED design values, shown as such
// in the app. Physics: traction power = m·g·(Crr·cosθ + sinθ)·v / η, plus a constant "hotel" load
// for life support, avionics and thermal control. Mars surface gravity is a real constant.
export const ROVER = {
  name: 'Crew rover (concept)',
  massKg: 3000,          // loaded, assumed
  g: 3.71,               // Mars surface gravity, m/s²
  crrFirm: 0.08,         // rolling resistance on firm ground, assumed
  crrLoose: 0.25,        // rolling resistance in loose sand/dust, assumed
  eta: 0.8,              // drivetrain efficiency, assumed
  hotelKW: 1.5,          // life support + avionics + heaters, assumed
  vmaxKmh: 12,           // top speed on flat firm ground, assumed
  maxSlopeDeg: 25,       // climb limit, assumed
  stopMin: 30,           // crew time outside per sample site, assumed
};
export const LOOSE_T = 0.3;   // THEMIS night-IR normalized index below this = loose ground

export function maxSpeed(gradeDeg, loose) {             // km/h
  let v = ROVER.vmaxKmh * (1 - 0.75 * Math.max(0, gradeDeg) / ROVER.maxSlopeDeg);
  if (gradeDeg < -10) v *= 0.7;                           // careful on steep descents
  if (loose) v *= 0.55;
  return Math.max(1.2, v);
}
export function powerKW(vKmh, gradeDeg, loose) {        // total electrical power draw
  const v = vKmh / 3.6, th = gradeDeg * Math.PI / 180, crr = loose ? ROVER.crrLoose : ROVER.crrFirm;
  const F = ROVER.massKg * ROVER.g * (crr * Math.cos(th) + Math.sin(th));
  return ROVER.hotelKW + Math.max(0, F * v) / ROVER.eta / 1000;
}
// energy (kWh), time (h), km along a grid path driven at the model's max safe speed
export function pathCost(path, elev, therm, W, mpx, mpy) {
  let kwh = 0, h = 0, km = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], d = Math.hypot((b.x - a.x) * mpx, (b.y - a.y) * mpy);
    const grade = Math.atan2(elev[b.y * W + b.x] - elev[a.y * W + a.x], d) * 180 / Math.PI;
    const loose = therm ? therm[b.y * W + b.x] < LOOSE_T : false;
    const v = maxSpeed(grade, loose), dt = d / 1000 / v;
    kwh += powerKW(v, grade, loose) * dt; h += dt; km += d / 1000;
  }
  return { kwh, h, km };
}
