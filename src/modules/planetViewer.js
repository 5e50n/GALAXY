// 3D telescope view of a planet (Three.js). Based on the team's first prototype
// (procedural textures, rings, rotation), rewired to real data:
//   • sky background brightness  ← AI-predicted sky quality at the site
//   • faint moons shown only if   ← the instrument's limiting magnitude reaches them
//   • image softness              ← planet altitude (more air to look through), not light pollution
// Loaded on demand so the main page stays light.

import * as THREE from 'three';

const SPECS = {
  moon: { radius: 2.6, tilt: 0.03, speed: 0.001 },
  mercury: { radius: 2.2, tilt: 0.03, speed: 0.004 },
  venus: { radius: 2.5, tilt: 0.05, speed: 0.003 },
  mars: { radius: 2.4, tilt: 0.44, speed: 0.006 },
  jupiter: { radius: 3.0, tilt: 0.05, speed: 0.010, moons: [[-6.2, 0.1], [-4.3, -0.05], [4.6, 0.08], [7.4, -0.1]] },
  saturn: { radius: 2.2, tilt: 0.47, speed: 0.008, rings: true, moons: [[7.2, 0.35]] },
  uranus: { radius: 2.4, tilt: 1.45, speed: 0.006, rings: true },
  neptune: { radius: 2.4, tilt: 0.5, speed: 0.006 },
  pluto: { radius: 1.8, tilt: 0.22, speed: 0.003 }
};

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function paint(key) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const w = 1024, h = 512, r = rng(key.length * 7919);
  const grad = (stops) => { const l = g.createLinearGradient(0, 0, 0, h); stops.forEach(([o, col]) => l.addColorStop(o, col)); g.fillStyle = l; g.fillRect(0, 0, w, h); };
  const blob = (x, y, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
  const craters = (n, a, b) => { for (let i = 0; i < n; i++) blob(r() * w, r() * h, 2 + r() * 16, 2 + r() * 16, r() > 0.5 ? a : b); };
  switch (key) {
    case 'moon':
      g.fillStyle = '#9a9894'; g.fillRect(0, 0, w, h);
      [[300, 200, 120, 80], [470, 250, 90, 70], [620, 190, 80, 60], [420, 330, 70, 45]].forEach(([x, y, a, b]) => blob(x, y, a, b, '#6f6d6a'));
      craters(500, '#83817d', '#b3b0ab');
      break;
    case 'mercury':
      g.fillStyle = '#7a7674'; g.fillRect(0, 0, w, h); craters(600, '#5a5756', '#999491');
      break;
    case 'venus':
      grad([[0, '#d8bc88'], [0.5, '#f5e4be'], [1, '#c9a56c']]);
      for (let y = 0; y < h; y += 12) {
        g.fillStyle = y % 24 === 0 ? 'rgba(230,195,130,0.4)' : 'rgba(255,245,220,0.35)';
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 30) g.lineTo(x, y + Math.sin(x * 0.02 + y * 0.05) * 8);
        g.lineTo(w, y + 20); g.lineTo(0, y + 20); g.fill();
      }
      break;
    case 'mars':
      g.fillStyle = '#be5127'; g.fillRect(0, 0, w, h);
      [[320, 260, 90, 50], [650, 240, 130, 65], [880, 300, 80, 45]].forEach(([x, y, a, b]) => blob(x, y, a, b, '#542211', 0.1));
      blob(w / 2, 22, 120, 20, '#ffffff'); blob(w / 2, h - 18, 90, 16, '#ffffff');
      break;
    case 'jupiter':
      g.fillStyle = '#efdeb8'; g.fillRect(0, 0, w, h);
      [[0.05, 0.08, '#a47248'], [0.15, 0.07, '#c89e75'], [0.25, 0.12, '#7b4322'], [0.38, 0.10, '#f6ecda'], [0.49, 0.04, '#cb9b6d'],
        [0.54, 0.14, '#803816'], [0.70, 0.08, '#d4ad82'], [0.80, 0.10, '#955830'], [0.91, 0.08, '#845331']].forEach(([y, bh, col]) => {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, y * h);
        for (let x = 0; x <= w; x += 20) g.lineTo(x, y * h + Math.sin(x * 0.03 + y * 10) * 6);
        g.lineTo(w, (y + bh) * h); g.lineTo(0, (y + bh) * h); g.fill();
      });
      blob(650, 315, 55, 34, '#b7371a'); blob(650, 315, 36, 20, '#e8623d');
      break;
    case 'saturn':
      grad([[0, '#b89d66'], [0.3, '#edd8a6'], [0.5, '#dfc48e'], [0.7, '#d2b67f'], [1, '#9e814a']]);
      for (let y = 30; y < h - 30; y += 18) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y, w, 7); }
      break;
    case 'uranus':
      grad([[0, '#53a8be'], [0.5, '#7ee4f5'], [1, '#4293a7']]);
      break;
    case 'neptune':
      grad([[0, '#1c3d94'], [0.5, '#2e5fd4'], [1, '#152e75']]);
      blob(450, 270, 60, 32, '#102359'); blob(490, 245, 45, 12, 'rgba(255,255,255,0.85)', 0.1);
      break;
    case 'pluto':
      g.fillStyle = '#9b806d'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4c3729'; g.fillRect(0, h * 0.6, w, h * 0.25);
      g.fillStyle = '#f2e8dc'; g.beginPath(); g.arc(520, 270, 60, 0, Math.PI * 2); g.arc(590, 270, 60, 0, Math.PI * 2); g.fill();
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function ringTexture(key) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 8;
  const g = c.getContext('2d');
  const l = g.createLinearGradient(0, 0, 512, 0);
  const stops = key === 'saturn'
    ? [[0, 'rgba(0,0,0,0)'], [0.15, 'rgba(180,150,105,0.3)'], [0.35, 'rgba(240,220,175,0.95)'], [0.68, 'rgba(220,195,150,0.85)'],
      [0.70, 'rgba(0,0,0,0.05)'], [0.74, 'rgba(0,0,0,0.05)'], [0.76, 'rgba(210,185,140,0.7)'], [0.96, 'rgba(190,165,120,0.4)'], [1, 'rgba(0,0,0,0)']]
    : [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(125,227,244,0.25)'], [0.8, 'rgba(125,227,244,0.5)'], [1, 'rgba(0,0,0,0)']];
  stops.forEach(([o, col]) => l.addColorStop(o, col));
  g.fillStyle = l; g.fillRect(0, 0, 512, 8);
  return new THREE.CanvasTexture(c);
}

// Sky colour through the eyepiece: black under a dark sky, grey-orange under city glow
function skyColour(sqm) {
  const t = Math.max(0, Math.min(1, (21.8 - sqm) / 5));      // 0 = pristine, 1 = inner city
  const dark = [4, 6, 14], city = [74, 60, 52];
  return new THREE.Color(...dark.map((d, i) => (d + (city[i] - d) * t) / 255));
}

export class PlanetViewer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.textures = {};
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 2, 0.1, 100);
    this.camera.position.set(0, 0, 11);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(6, 3, 5);
    this.scene.add(sun);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.moons = [];
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.running = false;
  }

  resize() {
    const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 300;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.render();
  }

  clear() {
    for (const obj of [...this.group.children, ...this.moons]) {
      obj.geometry?.dispose();
      if (obj.material && obj.material.map && !Object.values(this.textures).includes(obj.material.map)) obj.material.map.dispose();
      obj.material?.dispose();
      obj.parent?.remove(obj);
    }
    this.moons = [];
  }

  /**
   * @param key       body key
   * @param sqm       sky brightness to show (mag/arcsec²)
   * @param showMoons whether the faint moons are within reach
   * @param altitude  planet altitude (deg) — low = softer image
   */
  show({ key, sqm, showMoons, altitude }) {
    const spec = SPECS[key] || SPECS.jupiter;
    if (this.key !== key) {
      this.clear();
      this.key = key;
      this.textures[key] = this.textures[key] || paint(key);
      this.planet = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, 64, 48),
        new THREE.MeshStandardMaterial({ map: this.textures[key], roughness: 0.8, metalness: 0 }));
      this.group.add(this.planet);
      if (spec.rings) {
        const inner = spec.radius * 1.3, outer = spec.radius * (key === 'saturn' ? 2.3 : 1.9);
        const geo = new THREE.RingGeometry(inner, outer, 128);
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
        const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ringTexture(key), side: THREE.DoubleSide, transparent: true }));
        ring.rotation.x = Math.PI / 2;
        this.group.add(ring);
      }
      this.group.rotation.set(0.25, 0, spec.tilt);
      for (const [x, y] of spec.moons || []) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf2efe6 }));
        m.position.set(x, y, 0);
        this.scene.add(m);
        this.moons.push(m);
      }
    }
    this.scene.background = skyColour(sqm);
    this.moons.forEach(m => { m.visible = showMoons; });
    // Seeing: the lower the planet, the more turbulent air → softer image (≤ 2.5 px)
    const soft = Math.max(0, Math.min(2.5, (35 - altitude) / 10));
    this.canvas.style.filter = soft > 0.2 ? `blur(${soft.toFixed(1)}px)` : 'none';
    this.render();
    if (!this.reducedMotion) this.start();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const spec = SPECS[this.key];
      if (this.planet && spec) this.planet.rotation.y += spec.speed;
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
