// Cosmic Starfield & Nebula Canvas with Live Wallpaper Effects
export class Starfield {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.satellites = [];
    this.comets = [];
    this.numStars = 240;
    this.animationFrame = null;

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.resize);
    this.resize();
    this.initStars();
    this.initSatellites();
    this.animate();
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < this.numStars; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: Math.random() * 1.4 + 0.4,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        color: this.randomStarColor()
      });
    }
  }

  initSatellites() {
    for (let i = 0; i < 4; i++) {
      this.satellites.push(this.spawnSatellite());
    }
  }

  spawnSatellite() {
    // Spawn off-screen
    const side = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const speed = Math.random() * 0.3 + 0.1;
    if (side === 0) { x = -10; y = Math.random() * this.height; vx = speed; vy = (Math.random() - 0.5) * speed; } // left
    if (side === 1) { x = this.width + 10; y = Math.random() * this.height; vx = -speed; vy = (Math.random() - 0.5) * speed; } // right
    if (side === 2) { x = Math.random() * this.width; y = -10; vx = (Math.random() - 0.5) * speed; vy = speed; } // top
    if (side === 3) { x = Math.random() * this.width; y = this.height + 10; vx = (Math.random() - 0.5) * speed; vy = -speed; } // bottom
    
    return { x, y, vx, vy, size: Math.random() * 1.2 + 0.8 };
  }

  spawnComet() {
    const startX = Math.random() * this.width;
    const startY = -50;
    const dirX = Math.random() > 0.5 ? 1 : -1;
    return {
      x: startX,
      y: startY,
      vx: (Math.random() * 4 + 2) * dirX,
      vy: Math.random() * 4 + 4,
      length: Math.random() * 80 + 40,
      life: 1.0,
      decay: Math.random() * 0.01 + 0.015
    };
  }

  randomStarColor() {
    const colors = [
      '#ffffff', // Pure white
      '#aadcff', // Blue-white O/B type
      '#ffe0b2', // Yellow G type
      '#ffccbc', // Red/Orange M type
      '#b3e5fc'  // Pale Cyan
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Subtle cosmic backdrop gradient
    const grad = this.ctx.createRadialGradient(
      this.width * 0.5, this.height * 0.3, 50,
      this.width * 0.5, this.height * 0.5, this.width * 0.8
    );
    grad.addColorStop(0, 'rgba(12, 17, 43, 0.4)');
    grad.addColorStop(0.5, 'rgba(8, 10, 26, 0.7)');
    grad.addColorStop(1, 'rgba(3, 4, 10, 0.95)');

    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw twinkling stars
    for (let star of this.stars) {
      star.alpha += star.twinkleSpeed;
      if (star.alpha > 0.95 || star.alpha < 0.15) {
        star.twinkleSpeed = -star.twinkleSpeed;
      }
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = star.color;
      this.ctx.globalAlpha = Math.max(0.1, Math.min(1, star.alpha));
      this.ctx.shadowBlur = star.radius > 1.2 ? 6 : 0;
      this.ctx.shadowColor = star.color;
      this.ctx.fill();
    }

    // Draw and update slow satellites
    this.ctx.globalAlpha = 0.8;
    this.ctx.shadowBlur = 4;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = '#00d4ff';
    for (let i = 0; i < this.satellites.length; i++) {
      let sat = this.satellites[i];
      sat.x += sat.vx;
      sat.y += sat.vy;
      this.ctx.beginPath();
      this.ctx.arc(sat.x, sat.y, sat.size, 0, Math.PI * 2);
      this.ctx.fill();

      // Reset if off-screen for a while
      if (sat.x < -100 || sat.x > this.width + 100 || sat.y < -100 || sat.y > this.height + 100) {
        this.satellites[i] = this.spawnSatellite();
      }
    }

    // Randomly spawn a comet (about every 3-5 seconds depending on frame rate)
    if (Math.random() < 0.003 && this.comets.length < 2) {
      this.comets.push(this.spawnComet());
    }

    // Draw and update comets (shooting stars)
    for (let i = this.comets.length - 1; i >= 0; i--) {
      let comet = this.comets[i];
      comet.x += comet.vx;
      comet.y += comet.vy;
      comet.life -= comet.decay;

      if (comet.life <= 0) {
        this.comets.splice(i, 1);
        continue;
      }

      const cometGrad = this.ctx.createLinearGradient(
        comet.x, comet.y, 
        comet.x - comet.vx * comet.length * 0.1, comet.y - comet.vy * comet.length * 0.1
      );
      cometGrad.addColorStop(0, `rgba(255, 255, 255, ${comet.life})`);
      cometGrad.addColorStop(1, `rgba(0, 212, 255, 0)`);

      this.ctx.beginPath();
      this.ctx.moveTo(comet.x, comet.y);
      this.ctx.lineTo(comet.x - comet.vx * comet.length * 0.2, comet.y - comet.vy * comet.length * 0.2);
      this.ctx.strokeStyle = cometGrad;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#00d4ff';
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}
