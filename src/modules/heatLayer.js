// Light-pollution heat map: the AI model (v2, NASA Black Marble 2024) evaluated on a
// 0.1° grid over Iraq, under reference conditions (clear, moonless midnight), then
// painted as a smooth colour overlay. Not a point-density heat map: every pixel is a
// model prediction, so colour = predicted sky brightness, nothing else.

const REF = { moon_illum: 0, moon_alt: -10, moon_light: 0, cloud: 0, sun_alt: -40, solar_hour: 0 };
const STEP = 0.1;
const BOUNDS = { lat0: 29.0, lat1: 38.0, lon0: 39.0, lon1: 48.6 };

// 0 = pristine dark sky … 1 = inner-city glow
export const pollution = sqm => Math.max(0, Math.min(1, (21.8 - sqm) / (21.8 - 16.6)));

// Heat ramp (dark → bright). Dark skies stay almost transparent so the base map shows through.
const RAMP = [
  [0.00, [0, 40, 255, 0.00]],
  [0.18, [0, 60, 255, 0.00]],
  [0.28, [0, 100, 255, 0.60]],
  [0.40, [0, 215, 255, 0.80]],
  [0.52, [0, 235, 100, 0.88]],
  [0.64, [255, 235, 0, 0.93]],
  [0.77, [255, 130, 0, 0.97]],
  [0.89, [255, 25, 25, 1.00]],
  [1.00, [255, 245, 225, 1.00]]
];
export function heatColor(p) {
  for (let i = 1; i < RAMP.length; i++) {
    const [p1, c1] = RAMP[i];
    const [p0, c0] = RAMP[i - 1];
    if (p <= p1) {
      const t = (p - p0) / (p1 - p0);
      return c0.map((v, k) => v + (c1[k] - v) * t);
    }
  }
  return RAMP[RAMP.length - 1][1];
}
export const RAMP_CSS = `linear-gradient(to left, ${RAMP.map(([p, c]) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(c[3], 0.9)}) ${p * 100}%`).join(', ')})`;

function elevationAt(E, lat, lon) {
  const r = Math.min(E.ny - 1, Math.max(0, Math.round((lat - E.lat0) / E.step)));
  const c = Math.min(E.nx - 1, Math.max(0, Math.round((lon - E.lon0) / E.step)));
  return E.elev[r * E.nx + c] ?? 300;
}

/**
 * Evaluate the model on a grid (chunked, non-blocking). Returns {ny, nx, sqm, glow, lat0, lon0, step}.
 * Default: all of Iraq at 0.1°. Zoomed in: `area` = {lat0, lat1, lon0, lon1, step} for a finer local grid.
 * `isStale()` lets the caller abandon a build that is no longer needed.
 */
export async function buildHeatGrid(model, elevGrid, onProgress = () => {}, area = null, isStale = () => false) {
  const A = area || { ...BOUNDS, step: STEP };
  const STEP_ = A.step;
  const ny = Math.round((A.lat1 - A.lat0) / STEP_) + 1;
  const nx = Math.round((A.lon1 - A.lon0) / STEP_) + 1;
  const sqm = new Float32Array(ny * nx).fill(NaN);
  const glow = new Float32Array(ny * nx);         // NASA-measured skyglow index, for tie-breaks
  const date = new Date();
  let done = 0;
  for (let r = 0; r < ny; r++) {
    const lat = A.lat0 + r * STEP_;
    for (let c = 0; c < nx; c++) {
      const lon = A.lon0 + c * STEP_;
      if (!model.covers(lat, lon)) continue;
      const inp = model.inputsFor({ lat, lon, elevationM: elevationAt(elevGrid, lat, lon), date });
      Object.assign(inp.x, REF);
      sqm[r * nx + c] = Math.max(16, Math.min(22.3, model.predictVector(inp.x)));
      glow[r * nx + c] = inp.light.rad_skyglow;
    }
    done++;
    if (done % 6 === 0) {
      onProgress(done / ny);
      await new Promise(res => setTimeout(res, 0));
      if (isStale()) return null;
    }
  }
  onProgress(1);
  return { ny, nx, sqm, glow, lat0: A.lat0, lon0: A.lon0, step: STEP_ };
}

/** Paint the grid into a smooth image (north up) for L.imageOverlay. */
export function renderHeatImage(grid, scale = 6, { glowPass = true, alphaK = 1 } = {}) {
  const { ny, nx, sqm } = grid;
  const small = document.createElement('canvas');
  small.width = nx; small.height = ny;
  const ctx = small.getContext('2d');
  const img = ctx.createImageData(nx, ny);
  // distance (in cells) to the edge of the covered area → soft fade instead of a hard cut
  const FADE = grid.step >= 0.1 ? 6 : 2;
  const dist = new Float32Array(ny * nx);
  for (let i = 0; i < dist.length; i++) dist[i] = Number.isNaN(sqm[i]) ? 0 : FADE;
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {           // forward pass
    const i = r * nx + c;
    if (!dist[i]) continue;
    const edge = r === 0 || c === 0 || r === ny - 1 || c === nx - 1 ? 1 : FADE;
    dist[i] = Math.min(dist[i], edge, r ? dist[i - nx] + 1 : 1, c ? dist[i - 1] + 1 : 1);
  }
  for (let r = ny - 1; r >= 0; r--) for (let c = nx - 1; c >= 0; c--) {  // backward pass
    const i = r * nx + c;
    if (!dist[i]) continue;
    dist[i] = Math.min(dist[i], r < ny - 1 ? dist[i + nx] + 1 : 1, c < nx - 1 ? dist[i + 1] + 1 : 1);
  }
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const v = sqm[r * nx + c];
      const o = ((ny - 1 - r) * nx + c) * 4;           // row 0 of the image = north
      if (Number.isNaN(v)) { img.data[o + 3] = 0; continue; }
      const [R, G, B, A] = heatColor(pollution(v));
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B;
      img.data[o + 3] = Math.round(A * alphaK * 255 * Math.min(1, dist[r * nx + c] / FADE));
    }
  }
  ctx.putImageData(img, 0, 0);
  // upscale with smoothing + a soft blur → heat-map look without inventing detail
  const big = document.createElement('canvas');
  big.width = nx * scale; big.height = ny * scale;
  const b = big.getContext('2d');
  b.imageSmoothingEnabled = true;
  b.imageSmoothingQuality = 'high';
  b.filter = `blur(${scale * 0.5}px)`;
  b.drawImage(small, 0, 0, big.width, big.height);
  // glow pass: a wider, additive halo so hotspots read from across a room (projector)
  if (!glowPass) return overlayOf(big, grid);
  b.globalCompositeOperation = 'lighter';
  b.globalAlpha = 0.55;
  b.filter = `blur(${scale * 1.8}px)`;
  b.drawImage(small, 0, 0, big.width, big.height);
  return overlayOf(big, grid);
}

function overlayOf(canvas, grid) {
  const h = grid.step / 2;
  return {
    url: canvas.toDataURL('image/png'),
    bounds: [[grid.lat0 - h, grid.lon0 - h], [grid.lat0 + (grid.ny - 1) * grid.step + h, grid.lon0 + (grid.nx - 1) * grid.step + h]]
  };
}

/**
 * Most polluted cell, and the dark cell nearest to a point.
 * The model flattens out for big cities (all ≈ Bortle 8), so "most polluted" = among cells
 * within 0.25 mag (≈ the model's typical error) of the brightest prediction, the one with the
 * highest NASA-measured glow.
 */
export function extremes(grid, near) {
  const cells = [];
  for (let r = 0; r < grid.ny; r++) for (let c = 0; c < grid.nx; c++) {
    const i = r * grid.nx + c;
    if (Number.isNaN(grid.sqm[i])) continue;
    cells.push({ lat: grid.lat0 + r * grid.step, lon: grid.lon0 + c * grid.step, sqm: grid.sqm[i], glow: grid.glow[i] });
  }
  const minSqm = Math.min(...cells.map(x => x.sqm));
  const max = cells.filter(x => x.sqm <= minSqm + 0.25).sort((a, b) => b.glow - a.glow)[0];
  const dist = a => Math.hypot((a.lat - near.lat) * 111, (a.lon - near.lon) * 111 * Math.cos(near.lat * Math.PI / 180));
  const darkest = Math.max(...cells.map(x => x.sqm));
  // nearest place that is (almost) as dark as the darkest sky in the grid
  const dark = cells.filter(x => x.sqm >= darkest - 0.15).sort((a, b) => dist(a) - dist(b))[0];
  return { brightest: max, darkestNear: dark && { ...dark, km: dist(dark) } };
}
