// Interactive 3D WebGL Planetary Telescope Simulator using Three.js
// Renders realistic continuous 3D rotating planets of the Solar System
// with dynamic optical seeing, atmospheric skyglow, and light pollution blur.

import * as THREE from 'three';
import { getLang } from './i18n.js';

export class PlanetSimulator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.currentPlanet = 'jupiter';
    this.viewMode = 'current'; // 'current' or 'calibrated'
    this.baseMag = 17.00;
    this.targetMag = 17.50;
    this.siteName = 'Mosul Downtown';

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planetMesh = null;
    this.cloudMesh = null;
    this.ringMesh = null;
    this.planetGroup = null;
    this.dirLight = null;

    this.textures = {};
    this.animId = null;
    this.isRunning = false;

    // Fixed planet astronomical specs (target threshold mag for clear resolution + ephemeris + guidance)
    this.planetSpecs = {
      mercury: {
        nameEn: 'Mercury', nameAr: 'عطارد', targetMag: 19.80, radius: 2.2, tilt: 0.03, speed: 0.004,
        ra: '23h 12m 45s', dec: '-02° 15\' 30"', alt: 28.5, az: 258.4,
        tracking: 'Solar Rate (15.000"/s)', trackingAr: 'معدل شمسي (15.000"/ث)',
        filterPolluted: 'UHC / Light Pollution Yellow #8', filterPollutedAr: 'فلتر UHC لحجب التلوث / أصفر #8',
        filterClean: 'Broadband Clear Aperture', filterCleanAr: 'سماء نقية — فتحة بصرية كاملة',
        eyepiece: '6mm Plössl (200x)', bestWindow: '18:45 - 20:15 (Twilight)', bestWindowAr: '١٨:٤٥ - ٢٠:١٥ (شفق المساء)'
      },
      venus: {
        nameEn: 'Venus', nameAr: 'الزهرة', targetMag: 18.80, radius: 2.5, tilt: 0.05, speed: 0.003,
        ra: '02h 45m 18s', dec: '+16° 32\' 12"', alt: 44.2, az: 240.2,
        tracking: 'Solar Rate (15.000"/s)', trackingAr: 'معدل شمسي (15.000"/ث)',
        filterPolluted: 'ND96 Neutral Density / Violet #47', filterPollutedAr: 'فلتر ND96 لخفض التوهج / بنفسجي #47',
        filterClean: 'Variable Polarizer (Glare Control)', filterCleanAr: 'مستقطب بصري للتحكم بالسطوع',
        eyepiece: '9mm Orthoscopic (133x)', bestWindow: '19:30 - 22:00', bestWindowAr: '١٩:٣٠ - ٢٢:٠٠'
      },
      earth: {
        nameEn: 'Earth & Moon', nameAr: 'الأرض والقمر', targetMag: 19.20, radius: 2.5, tilt: 0.41, speed: 0.006,
        ra: '12h 00m 00s', dec: '+00° 00\' 00"', alt: 65.0, az: 180.0,
        tracking: 'Lunar Rate (14.685"/s)', trackingAr: 'معدل قمري (14.685"/ث)',
        filterPolluted: 'Polarizing Moon Filter / CLS', filterPollutedAr: 'فلتر استقطابي قمري / CLS',
        filterClean: '13% Transmission Neutral Density', filterCleanAr: 'فلتر رمادي حيادي ١٣٪ نفاذية',
        eyepiece: '15mm Wide-Field (80x)', bestWindow: '20:00 - 02:00', bestWindowAr: '٢٠:٠٠ - ٠٢:٠٠'
      },
      mars: {
        nameEn: 'Mars', nameAr: 'المريخ', targetMag: 20.20, radius: 2.3, tilt: 0.44, speed: 0.006,
        ra: '08h 14m 50s', dec: '+21° 18\' 40"', alt: 58.7, az: 165.8,
        tracking: 'Sidereal Rate (15.041"/s)', trackingAr: 'معدل نجمي (15.041"/ث)',
        filterPolluted: 'Orange #21 / Baader Neodymium', filterPollutedAr: 'فلتر برتقالي #21 / بادر نيوديميوم',
        filterClean: 'Red #23A Contrast Filter', filterCleanAr: 'فلتر أحمر #23A لتعزيز تباين السطح',
        eyepiece: '7mm Nagler (171x)', bestWindow: '21:00 - 03:30', bestWindowAr: '٢١:٠٠ - ٠٣:٣٠'
      },
      jupiter: {
        nameEn: 'Jupiter', nameAr: 'المشتري', targetMag: 20.00, radius: 3.1, tilt: 0.05, speed: 0.012,
        ra: '03h 48m 14s', dec: '+19° 24\' 10"', alt: 54.2, az: 148.5,
        tracking: 'Sidereal Rate (15.041"/s)', trackingAr: 'معدل نجمي (15.041"/ث)',
        filterPolluted: 'Light Blue #82A / UHC Anti-Pollution', filterPollutedAr: 'فلتر أزرق فاتح #82A / فلتر UHC لحجب أضواء المدينة',
        filterClean: 'Broadband / Light Yellow #8', filterCleanAr: 'سماء نقية / فلتر أصفر فاتح #8',
        eyepiece: '9mm Wide-Field + 2x Barlow (244x)', bestWindow: '21:30 - 03:00', bestWindowAr: '٢١:٣٠ - ٠٣:٠٠'
      },
      saturn: {
        nameEn: 'Saturn', nameAr: 'زحل', targetMag: 20.50, radius: 2.6, tilt: 0.47, speed: 0.010, hasRings: true,
        ra: '22h 32m 45s', dec: '-10° 48\' 22"', alt: 46.8, az: 195.2,
        tracking: 'Sidereal Rate (15.041"/s)', trackingAr: 'معدل نجمي (15.041"/ث)',
        filterPolluted: 'Yellow #12 Ring Enhancer / CLS', filterPollutedAr: 'فلتر أصفر #12 لإبراز الحلقات وفجوة كاسيني / CLS',
        filterClean: 'Broadband Optical Glass', filterCleanAr: 'فتحة بصرية كاملة فائقة النقاء',
        eyepiece: '8mm Delos (150x)', bestWindow: '20:15 - 01:45', bestWindowAr: '٢٠:١٥ - ٠١:٤٥'
      },
      uranus: {
        nameEn: 'Uranus', nameAr: 'أورانوس', targetMag: 21.00, radius: 2.5, tilt: 1.45, speed: 0.007, hasRings: true,
        ra: '03h 15m 02s', dec: '+17° 35\' 18"', alt: 52.8, az: 135.1,
        tracking: 'Sidereal Rate (15.041"/s)', trackingAr: 'معدل نجمي (15.041"/ث)',
        filterPolluted: 'CLS Deep Sky Broadband Filter', filterPollutedAr: 'فلتر CLS عريض النطاق لعزل الوهج الحضري',
        filterClean: 'Broadband Full Aperture', filterCleanAr: 'فتحة بصرية نقية للسماء العميقة',
        eyepiece: '6mm High-Power (200x)', bestWindow: '22:00 - 02:30', bestWindowAr: '٢٢:٠٠ - ٠٢:٣٠'
      },
      neptune: {
        nameEn: 'Neptune', nameAr: 'نبتون', targetMag: 21.50, radius: 2.5, tilt: 0.50, speed: 0.007,
        ra: '23h 58m 10s', dec: '-01° 42\' 05"', alt: 42.1, az: 210.4,
        tracking: 'Sidereal Rate (15.041"/s)', trackingAr: 'معدل نجمي (15.041"/ث)',
        filterPolluted: 'High-Transmission Narrowband Filter', filterPollutedAr: 'فلتر ضيق النطاق عالي النفاذية',
        filterClean: 'Zero-Loss Optical Path', filterCleanAr: 'مسار بصري مباشر بدون فلتر',
        eyepiece: '5mm Planetary (240x)', bestWindow: '21:00 - 01:00', bestWindowAr: '٢١:٠٠ - ٠١:٠٠'
      },
      pluto: {
        nameEn: 'Pluto', nameAr: 'بلوتو', targetMag: 21.85, radius: 1.8, tilt: 0.22, speed: 0.004,
        ra: '20h 14m 22s', dec: '-22° 15\' 40"', alt: 31.4, az: 182.3,
        tracking: 'High-Precision Micro-Stepping (15.041"/s)', trackingAr: 'تعقب ميكرو دقيق عالي التردد',
        filterPolluted: 'Dark Sky Mountain Summit Required', filterPollutedAr: 'يتطلب سماء جبلية مظلمة تماماً (Bortle 1-2)',
        filterClean: 'Aperture-Dominant Light Collection', filterCleanAr: 'تجميع فوتونات بدون حجب ضوئي',
        eyepiece: '12" Aperture + Low-Noise Astrophotography', bestWindow: '23:00 - 02:00 (Summit Only)', bestWindowAr: '٢٣:٠٠ - ٠٢:٠٠ (من قمم الجبال فقط)'
      }
    };

    this.initThree();
    this.buildPlanet(this.currentPlanet);
    this.updateHUD();
    this.start();
  }

  initThree() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 250;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 8.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Lighting
    const ambient = new THREE.AmbientLight(0xddeeff, 0.45);
    this.scene.add(ambient);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
    this.dirLight.position.set(6, 3, 5);
    this.scene.add(this.dirLight);

    // Secondary subtle rim light from opposite side
    const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.35);
    rimLight.position.set(-6, -2, -3);
    this.scene.add(rimLight);

    // Planet master group
    this.planetGroup = new THREE.Group();
    this.scene.add(this.planetGroup);

    // Background Stars in 3D Space
    this.createBackgroundStarfield();

    // Resize event
    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 250;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  createBackgroundStarfield() {
    const starCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = -10 - Math.random() * 20;

      // Color variation (white, blue, gold)
      const c = Math.random();
      if (c > 0.8) {
        colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
      } else if (c > 0.6) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.6;
      } else {
        colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.95; colors[i * 3 + 2] = 1.0;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });

    const starPoints = new THREE.Points(geometry, material);
    this.scene.add(starPoints);
  }

  // Procedural NASA-Accurate Planetary Textures (1024x512)
  getPlanetTexture(planetKey) {
    if (this.textures[planetKey]) return this.textures[planetKey];

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const w = 1024;
    const h = 512;

    switch (planetKey) {
      case 'mercury': {
        // Grey rocky terrain with impact craters
        ctx.fillStyle = '#7a7674';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 600; i++) {
          const cx = Math.random() * w;
          const cy = Math.random() * h;
          const cr = Math.random() * 18 + 2;
          ctx.fillStyle = Math.random() > 0.5 ? '#5a5756' : '#999491';
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'venus': {
        // Thick swirling pale-yellow sulfuric atmosphere
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#d8bc88');
        grad.addColorStop(0.5, '#f5e4be');
        grad.addColorStop(1, '#c9a56c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 12) {
          ctx.fillStyle = y % 24 === 0 ? 'rgba(230, 195, 130, 0.4)' : 'rgba(255, 245, 220, 0.35)';
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x <= w; x += 30) {
            ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.05) * 8);
          }
          ctx.lineTo(w, y + 20); ctx.lineTo(0, y + 20);
          ctx.fill();
        }
        break;
      }
      case 'earth': {
        // Deep blue ocean base
        ctx.fillStyle = '#0d2b59';
        ctx.fillRect(0, 0, w, h);
        // Continents (Africa, Eurasia, Americas, Australia)
        ctx.fillStyle = '#2f633a';
        const continents = [
          { x: 300, y: 180, rx: 90, ry: 70 }, // Europe/Asia
          { x: 500, y: 220, rx: 110, ry: 80 },
          { x: 480, y: 320, rx: 60, ry: 90 }, // Africa
          { x: 800, y: 200, rx: 80, ry: 90 }, // North America
          { x: 860, y: 360, rx: 60, ry: 100 }, // South America
          { x: 200, y: 380, rx: 50, ry: 40 }  // Australia
        ];
        continents.forEach(c => {
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
          ctx.fill();
        });
        // Deserts & mountain browns
        ctx.fillStyle = '#8a774b';
        ctx.beginPath();
        ctx.ellipse(470, 270, 70, 35, 0, 0, Math.PI * 2); // Sahara
        ctx.fill();
        // White polar ice caps
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, 28);
        ctx.fillRect(0, h - 35, w, 35);
        break;
      }
      case 'mars': {
        // Rust-orange terracotta base
        ctx.fillStyle = '#be5127';
        ctx.fillRect(0, 0, w, h);
        // Dark Martian volcanic maria (Syrtis Major, Acidalia)
        ctx.fillStyle = '#542211';
        const darkBeds = [
          { x: 320, y: 260, rx: 90, ry: 50 },
          { x: 650, y: 240, rx: 130, ry: 65 },
          { x: 880, y: 300, rx: 80, ry: 45 }
        ];
        darkBeds.forEach(b => {
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, b.rx, b.ry, 0.1, 0, Math.PI * 2);
          ctx.fill();
        });
        // Polar ice caps
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(w / 2, 22, 120, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(w / 2, h - 18, 90, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'jupiter': {
        // Cream base with turbulent multi-band stripes
        ctx.fillStyle = '#efdeb8';
        ctx.fillRect(0, 0, w, h);
        const jBands = [
          { y: 0.05, h: 0.08, c: '#a47248' },
          { y: 0.15, h: 0.07, c: '#c89e75' },
          { y: 0.25, h: 0.12, c: '#7b4322' }, // North Equatorial Belt
          { y: 0.38, h: 0.10, c: '#f6ecda' }, // Equatorial Zone
          { y: 0.49, h: 0.04, c: '#cb9b6d' },
          { y: 0.54, h: 0.14, c: '#803816' }, // South Equatorial Belt
          { y: 0.70, h: 0.08, c: '#d4ad82' },
          { y: 0.80, h: 0.10, c: '#955830' },
          { y: 0.91, h: 0.08, c: '#845331' }
        ];
        jBands.forEach(b => {
          ctx.fillStyle = b.c;
          ctx.beginPath();
          const startY = b.y * h;
          ctx.moveTo(0, startY);
          for (let x = 0; x <= w; x += 20) {
            const wave = Math.sin(x * 0.03 + b.y * 10) * 6;
            ctx.lineTo(x, startY + wave);
          }
          ctx.lineTo(w, startY + b.h * h);
          ctx.lineTo(0, startY + b.h * h);
          ctx.fill();
        });
        // Great Red Spot (GRS)
        ctx.fillStyle = '#b7371a';
        ctx.beginPath();
        ctx.ellipse(650, 315, 55, 34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8623d';
        ctx.beginPath();
        ctx.ellipse(650, 315, 36, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'saturn': {
        // Elegant golden-amber butterscotch bands
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#b89d66');
        grad.addColorStop(0.3, '#edd8a6');
        grad.addColorStop(0.5, '#dfc48e');
        grad.addColorStop(0.7, '#d2b67f');
        grad.addColorStop(1, '#9e814a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        for (let y = 30; y < h - 30; y += 18) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.fillRect(0, y, w, 7);
        }
        break;
      }
      case 'uranus': {
        // Pale cyan ice giant gradient
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#53a8be');
        grad.addColorStop(0.5, '#7ee4f5');
        grad.addColorStop(1, '#4293a7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(0, h * 0.4, w, h * 0.2);
        break;
      }
      case 'neptune': {
        // Deep royal azure blue with methane cloud streaks
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#1c3d94');
        grad.addColorStop(0.5, '#2e5fd4');
        grad.addColorStop(1, '#152e75');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Great Dark Spot
        ctx.fillStyle = '#102359';
        ctx.beginPath();
        ctx.ellipse(450, 270, 60, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        // White methane storm cirrus
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.ellipse(490, 245, 45, 12, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(250, 340, 70, 10, -0.05, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pluto': {
        // Pale tan/brown with famous Tombaugh Regio heart glacier
        ctx.fillStyle = '#9b806d';
        ctx.fillRect(0, 0, w, h);
        // Dark equatorial plains
        ctx.fillStyle = '#4c3729';
        ctx.fillRect(0, h * 0.6, w, h * 0.25);
        // Bright nitrogen heart glacier
        ctx.fillStyle = '#f2e8dc';
        ctx.beginPath();
        ctx.arc(520, 270, 60, 0, Math.PI * 2);
        ctx.arc(590, 270, 60, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.textures[planetKey] = texture;
    return texture;
  }

  // Create Saturn / Uranus Ring texture
  getRingTexture(planetKey) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    if (planetKey === 'saturn') {
      const grad = ctx.createLinearGradient(0, 0, 512, 0);
      grad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.15, 'rgba(180, 150, 105, 0.3)'); // C ring
      grad.addColorStop(0.35, 'rgba(240, 220, 175, 0.95)'); // B ring bright
      grad.addColorStop(0.68, 'rgba(220, 195, 150, 0.85)');
      grad.addColorStop(0.70, 'rgba(0, 0, 0, 0.05)'); // Cassini division
      grad.addColorStop(0.74, 'rgba(0, 0, 0, 0.05)');
      grad.addColorStop(0.76, 'rgba(210, 185, 140, 0.7)'); // A ring
      grad.addColorStop(0.96, 'rgba(190, 165, 120, 0.4)');
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 32);
    } else {
      // Uranus faint thin rings
      const grad = ctx.createLinearGradient(0, 0, 512, 0);
      grad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.6, 'rgba(125, 227, 244, 0.45)');
      grad.addColorStop(0.8, 'rgba(125, 227, 244, 0.85)');
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 32);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  buildPlanet(planetKey) {
    // Clear previous planet meshes
    while (this.planetGroup.children.length > 0) {
      const obj = this.planetGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      this.planetGroup.remove(obj);
    }
    this.cloudMesh = null;
    this.ringMesh = null;

    const spec = this.planetSpecs[planetKey] || this.planetSpecs.jupiter;
    const texture = this.getPlanetTexture(planetKey);

    // Planet Sphere Geometry
    const geometry = new THREE.SphereGeometry(spec.radius, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.75,
      metalness: 0.05
    });

    this.planetMesh = new THREE.Mesh(geometry, material);
    this.planetGroup.add(this.planetMesh);

    // Earth gets realistic rotating cloud layer
    if (planetKey === 'earth') {
      const cloudGeo = new THREE.SphereGeometry(spec.radius * 1.02, 64, 64);
      const cloudCanvas = document.createElement('canvas');
      cloudCanvas.width = 1024; cloudCanvas.height = 512;
      const cctx = cloudCanvas.getContext('2d');
      cctx.fillStyle = 'rgba(0,0,0,0)';
      cctx.fillRect(0, 0, 1024, 512);
      cctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      for (let i = 0; i < 80; i++) {
        cctx.beginPath();
        cctx.ellipse(Math.random() * 1024, Math.random() * 512, Math.random() * 90 + 30, Math.random() * 25 + 8, Math.random() * 0.3, 0, Math.PI * 2);
        cctx.fill();
      }
      const cloudTex = new THREE.CanvasTexture(cloudCanvas);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
      this.planetGroup.add(this.cloudMesh);
    }

    // Saturn / Uranus 3D Ring System
    if (spec.hasRings) {
      const innerR = spec.radius * 1.35;
      const outerR = spec.radius * 2.45;
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 96);

      // Map UVs along radius for concentric rings
      const pos = ringGeo.attributes.position;
      const uvs = ringGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const d = Math.sqrt(x * x + y * y);
        const u = (d - innerR) / (outerR - innerR);
        uvs.setXY(i, u, 0.5);
      }
      uvs.needsUpdate = true;

      const ringTex = this.getRingTexture(planetKey);
      const ringMat = new THREE.MeshStandardMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
        roughness: 0.6,
        metalness: 0.1
      });

      this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
      this.ringMesh.rotation.x = Math.PI / 2;
      this.planetGroup.add(this.ringMesh);
    }

    // Apply natural axial tilt
    this.planetGroup.rotation.z = spec.tilt;
    this.planetGroup.rotation.x = 0.2;
  }

  setPlanet(planetKey) {
    if (!this.planetSpecs[planetKey]) return;
    this.currentPlanet = planetKey;
    this.buildPlanet(planetKey);
    this.updateHUD();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.updateHUD();
  }

  setSiteData(siteName, baseMag, targetMag, lat, lon) {
    this.siteName = siteName || this.siteName;
    if (baseMag !== undefined) this.baseMag = parseFloat(baseMag);
    if (targetMag !== undefined) this.targetMag = parseFloat(targetMag);
    if (lat !== undefined) this.siteLat = parseFloat(lat);
    if (lon !== undefined) this.siteLon = parseFloat(lon);
    this.updateHUD();
  }

  updateHUD() {
    const isCalib = this.viewMode === 'calibrated';
    const spec = this.planetSpecs[this.currentPlanet] || this.planetSpecs.jupiter;
    const requiredMag = spec.targetMag;

    let clarity = 98;
    let blurPx = 0;
    let skyglowOpacity = 0.0;

    if (isCalib) {
      // After Auto-Calibration: target is achieved! Razor-sharp view
      clarity = 98;
      blurPx = 0;
      skyglowOpacity = 0.0;
    } else {
      // Current Sky at Site
      if (this.baseMag >= requiredMag) {
        // Site already darker than target! Perfect seeing
        clarity = Math.min(100, Math.round(92 + (this.baseMag - requiredMag) * 12));
        blurPx = 0;
        skyglowOpacity = 0.0;
      } else {
        // Light pollution blur based on deficit
        const deficit = requiredMag - this.baseMag; // e.g. 20.0 - 17.5 = 2.5
        clarity = Math.max(15, Math.round(85 - deficit * 26));
        blurPx = Math.min(7.5, deficit * 2.8);
        skyglowOpacity = Math.min(0.55, deficit * 0.22);
      }
    }

    // Apply visual blur & contrast to the canvas element via CSS filter
    if (this.canvas) {
      if (blurPx > 0.2) {
        const contrast = Math.max(0.40, (clarity / 100) * 0.9 + 0.2);
        const bright = 1.0 + skyglowOpacity * 0.55;
        this.canvas.style.filter = `blur(${blurPx.toFixed(1)}px) contrast(${contrast.toFixed(2)}) brightness(${bright.toFixed(2)})`;
      } else {
        this.canvas.style.filter = 'contrast(1.1) brightness(1.02)';
      }
    }

    // Update Clarity Badge
    const clarityEl = document.getElementById('planet-clarity-pct');
    if (clarityEl) clarityEl.textContent = clarity + '%';

    // Update Eyepiece Condition Banner
    const condEl = document.getElementById('eyepiece-condition');
    if (condEl) {
      if (clarity < 45) {
        condEl.textContent = '⚠️ Severe Skyglow Blur — Features Drowned by City Light';
        condEl.className = 'eyepiece-condition text-red';
      } else if (clarity < 80) {
        condEl.textContent = '🟡 Moderate Atmospheric Glare — Surface Details Hazy';
        condEl.className = 'eyepiece-condition text-amber';
      } else {
        condEl.textContent = '✨ Crystal Clear — Razor Sharp Diffraction-Limited View!';
        condEl.className = 'eyepiece-condition text-green';
      }
    }

    // Update Site Subtitle
    const siteSubEl = document.getElementById('eyepiece-site-sub');
    if (siteSubEl) {
      if (isCalib) {
        siteSubEl.textContent = `✨ Calibrated Sky (Target Quality Achieved: ${this.targetMag.toFixed(2)} mag)`;
      } else {
        siteSubEl.textContent = `📍 ${this.siteName} (${this.baseMag.toFixed(2)} mag/arcsec²)`;
      }
    }

    // Update Target Planet Name in HUD
    const targetNameEl = document.getElementById('eyepiece-target-name');
    if (targetNameEl) {
      targetNameEl.textContent = `${spec.nameEn} · كوكب ${spec.nameAr}`;
    }

    // Update Telescope Guidance & Ephemeris HUD elements
    const isAr = typeof getLang === 'function' ? getLang() === 'ar' : false;
    const lat = this.siteLat || 36.3587;
    const alt = Math.max(12, Math.min(88, spec.alt + (lat - 36.0) * 0.4)).toFixed(1);

    const elRa = document.getElementById('tele-val-ra');
    if (elRa) elRa.textContent = spec.ra;

    const elDec = document.getElementById('tele-val-dec');
    if (elDec) elDec.textContent = spec.dec;

    const elAlt = document.getElementById('tele-val-alt');
    if (elAlt) elAlt.textContent = `+${alt}° (${parseFloat(alt) > 40 ? (isAr ? 'مرتفع / رصد ممتاز' : 'High Elevation') : (isAr ? 'أفق منخفض' : 'Low Horizon')})`;

    const elAz = document.getElementById('tele-val-az');
    if (elAz) elAz.textContent = `${spec.az.toFixed(1)}° (${isAr ? 'سمت' : 'Az'})`;

    const elPolar = document.getElementById('tele-val-polar');
    if (elPolar) elPolar.textContent = `${lat.toFixed(2)}° N (${isAr ? 'محاذاة قطبية' : 'Polar Wedge'})`;

    const elTrack = document.getElementById('tele-val-track');
    if (elTrack) elTrack.textContent = isAr ? spec.trackingAr : spec.tracking;

    const elFilter = document.getElementById('tele-val-filter');
    if (elFilter) {
      if (isCalib || this.baseMag >= requiredMag) {
        elFilter.textContent = isAr ? spec.filterCleanAr : spec.filterClean;
        elFilter.className = 'tele-guide-val text-green';
      } else {
        elFilter.textContent = isAr ? spec.filterPollutedAr : spec.filterPolluted;
        elFilter.className = 'tele-guide-val text-amber';
      }
    }

    const elEyepiece = document.getElementById('tele-val-eyepiece');
    if (elEyepiece) elEyepiece.textContent = spec.eyepiece;

    const elWindow = document.getElementById('tele-val-window');
    if (elWindow) elWindow.textContent = isAr ? spec.bestWindowAr : spec.bestWindow;

    const elStatus = document.getElementById('tele-val-status');
    if (elStatus) {
      if (isCalib) {
        elStatus.textContent = isAr ? '🟢 معاير بنجاح · تباين بصري فائق' : '🟢 CALIBRATED · OPTIMAL CONTRAST';
        elStatus.className = 'tele-guide-badge badge-green';
      } else if (this.baseMag < requiredMag) {
        elStatus.textContent = isAr ? '⚠️ وهج حضري · يتطلب فلترة أو معايرة' : '⚠️ URBAN GLOW · FILTER REQUIRED';
        elStatus.className = 'tele-guide-badge badge-amber';
      } else {
        elStatus.textContent = isAr ? '🟢 رصد مثالي · سماء مظلمة طبيعية' : '🟢 NATURAL DARK SKY · TRACKING';
        elStatus.className = 'tele-guide-badge badge-green';
      }
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const animate = () => {
      if (!this.isRunning) return;
      this.render();
      this.animId = requestAnimationFrame(animate);
    };
    this.animId = requestAnimationFrame(animate);
  }

  stop() {
    this.isRunning = false;
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  render() {
    if (!this.renderer || !this.scene || !this.camera) return;

    const spec = this.planetSpecs[this.currentPlanet] || this.planetSpecs.jupiter;

    // Continuous 3D Natural Rotation
    if (this.planetMesh) {
      this.planetMesh.rotation.y += spec.speed;
    }
    if (this.cloudMesh) {
      this.cloudMesh.rotation.y += spec.speed * 1.15;
    }
    if (this.ringMesh && this.currentPlanet === 'saturn') {
      this.ringMesh.rotation.z += spec.speed * 0.3;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
