/* global Phaser, COIN_DASH */
// System hand-written fonts only; no external font files.
const HAND_FONT = '"Chalkboard SE", "Comic Sans MS", "Marker Felt", cursive';
// Chosen preset survives restarts; switching keys restart the round.
let difficulty = COIN_DASH.difficulty;
const DIFFICULTY_KEYS = { ONE: 'easy', TWO: 'normal', THREE: 'hard' };
// Hand-drawn circle: radius jitters per point, so each redraw looks slightly different.
function wobblyCircle(g, r, jitter) {
  const points = Array.from({ length: 16 }, (_, i) => {
    const a = i * Math.PI / 8, rr = r + Phaser.Math.FloatBetween(-jitter, jitter);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
  });
  return g.strokePoints(points, true, true);
}
// Classic heart curve, about 16px wide, for the HUD lives.
const HEART = Array.from({ length: 30 }, (_, i) => {
  const t = i / 30 * Math.PI * 2;
  return { x: 8 * Math.sin(t) ** 3,
    y: -0.5 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
});
const SCRIBBLE = [[-8, -4], [6, -6], [-8, 0], [8, -2], [-6, 5], [6, 4], [-2, 9]];
const STAMP_COLORS = { easy: 0x3f8a4a, normal: 0x2b2a33, hard: 0xc0392b };

class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    const preset = c.difficulties[difficulty];
    this.score = 0;
    this.lives = c.startLives;
    this.invulnerableUntil = 0;
    this.finished = false;
    this.paused = false;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    // Power-up timestamps; all are shifted forward on resume so pausing freezes them.
    this.powerupNextAt = this.time.now + c.powerupEverySeconds * 1000;
    this.powerupExpiresAt = 0;
    this.activePowerup = null;
    this.powerupUntil = 0;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    // Slightly uneven pencil grid, drawn once so the paper look stays static.
    const lines = this.add.graphics().lineStyle(1, 0x5a6b8c, 0.25);
    for (let x = 40; x < c.width; x += 40) lines.lineBetween(x, 0, x + Math.sin(x) * 3, c.height);
    for (let y = 40; y < c.height; y += 40) lines.lineBetween(0, y, c.width, y + Math.cos(y) * 3);
    // Fixed pool of trail dots, created before the player so they draw behind it.
    this.trail = Array.from({ length: 7 }, () =>
      this.add.circle(c.width / 2, c.height / 2, 4, c.colors.player).setAlpha(0));
    this.trailIndex = 0;
    // Sticky-note HUD strip; stays inside the top 44px, above the physics bounds.
    const ink = 0x2b2a33;
    const edge = [{ x: 6, y: 5 }, { x: 300, y: 3 }, { x: 560, y: 6 }, { x: 795, y: 4 },
      { x: 793, y: 39 }, { x: 420, y: 37 }, { x: 7, y: 40 }];
    const note = this.add.graphics().fillStyle(0xfdeea0).fillPoints(edge, true)
      .lineStyle(1.5, ink).strokePoints(edge, true).lineStyle(1, ink, 0.35);
    for (let i = 0; i < 6; i++) note.lineBetween(758 + i * 5, 38, 768 + i * 5, 26);
    note.fillStyle(c.colors.coin).fillCircle(28, 21, 8).lineStyle(1.5, ink)
      .strokeCircle(28, 21, 8).lineBetween(28, 17, 28, 25);
    this.add.rectangle(44, 4, 46, 12, 0xffffff, 0.45).setStrokeStyle(1, ink, 0.2).setAngle(-6);
    this.add.rectangle(756, 4, 46, 12, 0xffffff, 0.45).setStrokeStyle(1, ink, 0.2).setAngle(5);
    const font = { fontFamily: HAND_FONT, fontSize: '18px', color: '#2b2a33' };
    this.coinsText = this.add.text(42, 22, '', font).setOrigin(0, 0.5);
    this.hearts = this.add.graphics();
    this.drawHearts();
    const timeX = 172 + c.startLives * 24;
    this.timeText = this.add.text(timeX, 22, '', font).setOrigin(0, 0.5);
    // Difficulty only changes on restart, so the stamp is drawn once.
    const stampColor = STAMP_COLORS[difficulty];
    const stamp = this.add.text(timeX + 150, 22, preset.label.toUpperCase(), { fontFamily: HAND_FONT,
      fontSize: '15px', fontStyle: 'bold', color: `#${stampColor.toString(16).padStart(6, '0')}` })
      .setOrigin(0.5).setAngle(-6).setAlpha(0.85);
    this.add.rectangle(stamp.x, stamp.y, stamp.width + 14, 24).setStrokeStyle(2, stampColor, 0.85)
      .setAngle(-6);
    this.powerupText = this.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.powerupBar = this.add.rectangle(110, 0, 140, 10, 0xffffff).setOrigin(0, 0.5);
    this.powerupHud = this.add.container(timeX + 220, 22, [this.powerupText, this.powerupBar,
      this.add.rectangle(110, 0, 140, 10).setOrigin(0, 0.5).setStrokeStyle(1.5, ink)]).setVisible(false);
    // Unfilled 24x24 rectangle keeps the hit box; the ship below is visual only.
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24);
    this.physics.add.existing(this.player);
    // A separate ring shows the shield, so the player's own look is untouched.
    this.shieldRing = this.add.graphics().setVisible(false);
    this.speedLines = this.add.graphics().setVisible(false);
    this.drawShieldAndSpeedLines();
    this.events.on('postupdate', () => {
      const left = this.powerupUntil - this.time.now;
      this.shieldRing.setPosition(this.player.x, this.player.y)
        .setVisible(this.activePowerup === 'shield')
        .setAlpha(!this.paused && left < 1000 && Math.floor(left / 125) % 2 ? 0.25 : 1);
    });
    this.player.body.setCollideWorldBounds(true);
    const hull = [{ x: 13, y: 0 }, { x: -11, y: -11 }, { x: -5, y: 0 }, { x: -11, y: 11 }];
    this.ship = this.add.graphics().fillStyle(c.colors.player).fillPoints(hull, true)
      .lineStyle(2, 0x2b2a33).strokePoints(hull, true)
      .fillStyle(0x2b2a33).fillCircle(2, 0, 3.5).setRotation(-Math.PI / 2);
    // Follow after physics so the ship never lags the body; keep last heading when stopped.
    const followPlayer = () => {
      const v = this.player.body.velocity;
      this.ship.setPosition(this.player.x, this.player.y).setVisible(this.player.visible);
      if (v.x || v.y) this.ship.setRotation(Math.atan2(v.y, v.x));
    };
    this.events.on('postupdate', followPlayer);
    this.events.once('shutdown', () => this.events.off('postupdate', followPlayer));
    this.coin = this.add.circle(100, 100, 9, c.colors.coin).setStrokeStyle(2, 0x2b2a33).setVisible(false);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    // Bodies follow scale, so the spin is drawn on a body-less copy of the coin.
    this.coinLook = this.add.circle(100, 100, 9, c.colors.coin).setStrokeStyle(2, 0x2b2a33);
    this.glint = this.add.star(0, 0, 4, 1, 5, 0x2b2a33).setAlpha(0);
    this.tweens.add({ targets: this.coinLook, scaleX: 0.15, duration: 450, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut', onRepeat: () => {
        if (Math.random() > 0.35) return;
        this.glint.setPosition(this.coin.x + 3, this.coin.y - 4).setScale(0.4);
        this.tweens.add({ targets: this.glint, alpha: 1, scale: 1, duration: 140, yoyo: true });
      } });
    this.placeCoin();
    // The star keeps the hit area but is never seen; the sticker below bobs and blinks instead.
    this.powerup = this.add.star(0, 0, 5, 6, 13, 0xffffff).setVisible(false).setAlpha(0);
    this.powerupLook = this.add.graphics().setVisible(false);
    this.physics.add.existing(this.powerup);
    this.powerup.body.setCircle(12, 1, 1).setEnable(false);
    this.drones = this.physics.add.group();
    // Spread drones across the top; keeps the original 270px gap when it fits.
    const gap = Math.min(270, (c.width - 180) / Math.max(1, preset.droneCount - 1));
    for (let i = 0; i < preset.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * gap, 100, 26, 26, c.colors.drone)
        .setStrokeStyle(2, 0x2b2a33);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * preset.droneSpeed, Math.sin(angle) * preset.droneSpeed);
    }
    // One sleepy "z" per drone, shown while Slow is active.
    this.sleepZs = this.drones.getChildren().map(() => this.add.text(0, 0, 'z',
      { fontFamily: HAND_FONT, fontSize: '15px', color: '#2b2a33' }).setOrigin(0.5).setVisible(false));
    const drawPowerupFx = () => {
      const now = this.time.now;
      const left = this.powerupExpiresAt - now;
      // Hold everything still while paused or after the round ends.
      const still = this.paused || this.finished;
      const blinkOff = !still && left < 2000 && Math.floor(left / 125) % 2;
      this.powerupLook.setVisible(this.powerup.visible && !blinkOff);
      if (still) return;
      // Bob from the time left (shifted on resume), so pausing causes no jump.
      this.powerupLook.setPosition(this.powerup.x, this.powerup.y + Math.sin(left / 250) * 3);
      if (this.game.loop.frame % 6 === 0) this.drawShieldAndSpeedLines();
      const v = this.player.body.velocity;
      this.speedLines.setVisible(this.activePowerup === 'speed' && (v.x !== 0 || v.y !== 0))
        .setPosition(this.player.x, this.player.y);
      if (v.x || v.y) this.speedLines.setRotation(Math.atan2(v.y, v.x));
      this.drones.getChildren().forEach((d, i) => {
        const t = ((now + i * 400) % 1200) / 1200;
        this.sleepZs[i].setVisible(this.activePowerup === 'slow')
          .setPosition(d.x + 6 + t * 8, d.y - 20 - t * 12).setAlpha(1 - t);
      });
    };
    this.events.on('postupdate', drawPowerupFx);
    this.events.once('shutdown', () => this.events.off('postupdate', drawPowerupFx));
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      this.collectEffect(this.coin.x, this.coin.y);
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.powerup, () => {
      if (this.finished || !this.powerup.visible) return;
      this.pickupEffect(this.powerup.x, this.powerup.y, this.powerup.kind);
      this.hidePowerup();
      this.startPowerup(this.powerup.kind);
    });
    this.physics.add.overlap(this.player, this.drones, () => {
      if (this.activePowerup === 'shield') return;
      this.loseLife();
    });
    // Spawn time is a timestamp so pausing can shift it like the other timers.
    this.chaser = null;
    this.chaserAt = this.time.now + c.chaserDelaySeconds * 1000;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R,P');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    for (const [key, name] of Object.entries(DIFFICULTY_KEYS)) {
      this.input.keyboard.on(`keydown-${key}`, () => {
        difficulty = name;
        this.scene.restart();
      });
    }
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    const inkFont = { fontFamily: HAND_FONT, color: '#2b2a33' };
    this.pauseText = this.add.text(0, -18, 'PAUSED', { ...inkFont, fontSize: '56px' }).setOrigin(0.5);
    const card = this.add.container(c.width / 2, c.height / 2, [
      this.add.rectangle(0, 0, 460, 170, c.colors.background).setStrokeStyle(2, 0x2b2a33),
      this.add.rectangle(-225, -80, 80, 24, 0xe6d6a0, 0.8).setAngle(-35),
      this.add.rectangle(225, -80, 80, 24, 0xe6d6a0, 0.8).setAngle(35),
      this.pauseText,
      this.add.text(0, 45, 'press P to resume', { ...inkFont, fontSize: '22px' }).setOrigin(0.5)
    ]).setAngle(-2);
    this.pauseBox = this.add.container(0, 0, [
      this.add.rectangle(0, 0, c.width, c.height, c.colors.background, 0.7).setOrigin(0), card
    ]).setVisible(false).setDepth(10);
  }

  loseLife() {
    if (this.finished || this.time.now < this.invulnerableUntil) return;
    this.lives--;
    if (this.lives <= 0) {
      this.drawHearts();
      this.finish('A drone caught you!');
      return;
    }
    // Brief invulnerability so one touch cannot drain every life; blinking only toggles visibility.
    this.invulnerableUntil = this.time.now + COIN_DASH.hitInvulnerableMs;
    this.time.addEvent({
      delay: 125,
      repeat: Math.floor(COIN_DASH.hitInvulnerableMs / 125) - 1,
      callback: () => this.player.setVisible(!this.player.visible)
    });
    this.time.delayedCall(COIN_DASH.hitInvulnerableMs, () => this.player.setVisible(true));
  }

  // Redrawn only when lives change; lost lives become scribbled-out outlines.
  drawHearts() {
    this.livesShown = this.lives;
    this.hearts.clear().lineStyle(1.5, 0x2b2a33);
    for (let i = 0; i < COIN_DASH.startLives; i++) {
      const x = 160 + i * 24, y = 21;
      const points = HEART.map(p => ({ x: p.x + x, y: p.y + y }));
      if (i < this.lives) this.hearts.fillStyle(0xd0524a).fillPoints(points, true);
      else this.hearts.strokePoints(SCRIBBLE.map(([sx, sy]) => ({ x: sx + x, y: sy + y })));
      this.hearts.strokePoints(points, true);
    }
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
    this.coinLook.setPosition(x, y);
  }

  collectEffect(x, y) {
    const color = COIN_DASH.colors.coin;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const spark = this.add.circle(x, y, 3, color);
      this.tweens.add({ targets: spark, x: x + Math.cos(angle) * 28, y: y + Math.sin(angle) * 28,
        alpha: 0, scale: 0.3, duration: 400, onComplete: () => spark.destroy() });
    }
    const label = this.add.text(x, y, '+1',
      { font: '16px monospace', color: `#${color.toString(16).padStart(6, '0')}` }).setOrigin(0.5);
    this.tweens.add({ targets: label, y: y - 30, alpha: 0, duration: 500,
      onComplete: () => label.destroy() });
  }

  // Ink-splash burst plus a handwritten label for the picked-up power-up.
  pickupEffect(x, y, kind) {
    const color = COIN_DASH.colors.powerups[kind];
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + Math.random() * 0.4;
      const dist = Phaser.Math.Between(18, 34);
      const blot = this.add.circle(x, y, Phaser.Math.Between(2, 4), i % 2 ? color : 0x2b2a33);
      this.tweens.add({ targets: blot, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
        alpha: 0, scale: 0.4, duration: 450, onComplete: () => blot.destroy() });
    }
    const text = kind === 'time' ? `+${COIN_DASH.powerups.time.bonus}s` : `${kind.toUpperCase()}!`;
    const label = this.add.text(x, y - 12, text, { fontFamily: HAND_FONT, fontSize: '20px',
      color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#2b2a33', strokeThickness: 1 })
      .setOrigin(0.5).setAngle(-6);
    this.tweens.add({ targets: label, y: y - 50, alpha: 0, duration: 900,
      onComplete: () => label.destroy() });
  }

  // Redrawn every few frames so the lines "boil"; the shield's blink alpha is set elsewhere.
  drawShieldAndSpeedLines() {
    const shield = COIN_DASH.colors.powerups.shield;
    wobblyCircle(this.shieldRing.clear().lineStyle(3, shield), 22, 1.5);
    wobblyCircle(this.shieldRing.lineStyle(1.5, 0x2b2a33, 0.7), 26, 1.5);
    this.speedLines.clear().lineStyle(2, 0x2b2a33, 0.6);
    for (const y of [-7, 0, 7]) {
      const x = -16 - Math.random() * 4;
      this.speedLines.lineBetween(x, y, x - 10 - Math.random() * 8, y + Phaser.Math.FloatBetween(-1, 1));
    }
  }

  // Round paper sticker with hatched shading, a tape strip and a doodled icon per kind.
  drawSticker(kind) {
    const color = COIN_DASH.colors.powerups[kind];
    const g = this.powerupLook.clear().fillStyle(0xfffdf5).fillCircle(0, 0, 15).lineStyle(1.5, color, 0.6);
    for (let a = 0.15; a < 1.5; a += 0.4) {
      const x = Math.cos(a) * 13, y = Math.sin(a) * 13;
      g.lineBetween(x, y, x - 4, y - 4);
    }
    wobblyCircle(g.lineStyle(2, 0x2b2a33), 15, 1);
    g.fillStyle(color).lineStyle(1.5, 0x2b2a33);
    if (kind === 'speed') {
      const bolt = [{ x: 3, y: -11 }, { x: -6, y: 1 }, { x: 0, y: 1 }, { x: -3, y: 11 }, { x: 6, y: -2 }, { x: 0, y: -2 }];
      g.fillPoints(bolt, true).strokePoints(bolt, true);
    } else if (kind === 'shield') {
      const crest = [{ x: 0, y: -10 }, { x: 8, y: -6 }, { x: 7, y: 3 }, { x: 0, y: 10 }, { x: -7, y: 3 }, { x: -8, y: -6 }];
      g.fillPoints(crest, true).strokePoints(crest, true).lineBetween(0, -7, 0, 7);
    } else if (kind === 'slow') {
      g.lineBetween(-8, 6, -11, -2).lineBetween(-6, 6, -6, -1)
        .fillRect(-10, 5, 20, 3).strokeRect(-10, 5, 20, 3)
        .fillCircle(2, -1, 6).strokeCircle(2, -1, 6).strokeCircle(2, -1, 2.5);
    } else {
      g.fillStyle(0x2b2a33).fillRect(-2, -11, 4, 3).fillStyle(color)
        .fillCircle(0, 1, 8).strokeCircle(0, 1, 8).lineBetween(0, 1, 0, -4).lineBetween(0, 1, 4, 1);
    }
    g.fillStyle(0xe9dfb0, 0.8).fillPoints([{ x: -8, y: -18 }, { x: 8, y: -20 }, { x: 9, y: -14 }, { x: -7, y: -12 }], true);
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.pausedAt = this.time.now;
      this.physics.pause();
    } else {
      const pausedFor = this.time.now - this.pausedAt;
      this.deadline += pausedFor;
      this.powerupNextAt += pausedFor;
      this.powerupExpiresAt += pausedFor;
      this.powerupUntil += pausedFor;
      this.chaserAt += pausedFor;
      this.physics.resume();
    }
    this.pauseBox.setVisible(this.paused);
    this.pauseText.setVisible(this.paused);
  }

  showPowerup() {
    const c = COIN_DASH;
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 120);
    // Only one type exists so far; new types in settings.js join the random pick.
    this.powerup.kind = Phaser.Utils.Array.GetRandom(Object.keys(c.powerups));
    this.drawSticker(this.powerup.kind);
    this.powerup.setPosition(x, y).setVisible(true);
    this.powerup.body.reset(x, y);
    this.powerup.body.setEnable(true);
    this.powerupExpiresAt = this.time.now + c.powerupLifetimeSeconds * 1000;
  }

  hidePowerup() {
    this.powerup.setVisible(false);
    this.powerup.body.setEnable(false);
    this.powerupNextAt = this.time.now + COIN_DASH.powerupEverySeconds * 1000;
  }

  // Speed and shield are checked where they apply; slow and time act here.
  startPowerup(kind) {
    const p = COIN_DASH.powerups[kind];
    this.endPowerup();
    if (kind === 'time') {
      this.deadline += p.bonus * 1000;
      return;
    }
    if (kind === 'slow') this.scaleDrones(p.multiplier);
    this.activePowerup = kind;
    this.powerupUntil = this.time.now + p.seconds * 1000;
  }

  endPowerup() {
    if (this.activePowerup === 'slow') this.scaleDrones(1 / COIN_DASH.powerups.slow.multiplier);
    this.activePowerup = null;
  }

  scaleDrones(factor) {
    this.drones.getChildren().forEach(d => d.body.velocity.scale(factor));
  }

  spawnChaser() {
    if (this.finished) return;
    const c = COIN_DASH;
    // Start in the corner farthest from the player so it never spawns on top of them.
    const corners = [[30, 74], [c.width - 30, 74], [30, c.height - 30], [c.width - 30, c.height - 30]];
    const [x, y] = corners.reduce((best, p) =>
      Phaser.Math.Distance.Between(p[0], p[1], this.player.x, this.player.y)
        > Phaser.Math.Distance.Between(best[0], best[1], this.player.x, this.player.y) ? p : best);
    const redInk = 0x9e1b22;
    this.chaser = this.add.rectangle(x, y, 22, 22, c.colors.drone).setStrokeStyle(2, redInk).setAngle(45);
    this.physics.add.existing(this.chaser);
    this.chaser.body.setCollideWorldBounds(true);
    // The chaser follows the same hit rules as the other drones: shield blocks it, a hit costs a life.
    this.physics.add.overlap(this.player, this.chaser, () => {
      if (this.activePowerup === 'shield') return;
      this.loseLife();
    });
    // Body-less doodles drawn over the chaser: scribbled motion lines (local +x = heading),
    // angry brows and an eye whose pupil looks at the player.
    const streaks = this.add.graphics().lineStyle(2, 0x2b2a33, 0.6);
    [[-6, -30], [0, -36], [6, -28]].forEach(([dy, end]) =>
      streaks.strokePoints([{ x: -19, y: dy }, { x: (end - 19) / 2, y: dy + 1.5 }, { x: end, y: dy - 1 }]));
    const face = this.add.graphics().lineStyle(2, 0x2b2a33)
      .lineBetween(-8, -8, -1, -4).lineBetween(1, -4, 8, -7.5)
      .fillStyle(0xffffff).fillCircle(0, 2, 4.5).lineStyle(1.5, 0x2b2a33).strokeCircle(0, 2, 4.5);
    const pupil = this.add.circle(0, 0, 2, 0x2b2a33);
    const followChaser = () => {
      const { x: cx, y: cy } = this.chaser;
      const v = this.chaser.body.velocity;
      const look = Math.atan2(this.player.y - cy, this.player.x - cx);
      face.setPosition(cx, cy);
      pupil.setPosition(cx + Math.cos(look) * 2.5, cy + 2 + Math.sin(look) * 2.5);
      streaks.setPosition(cx, cy).setVisible(v.x !== 0 || v.y !== 0).setRotation(Math.atan2(v.y, v.x));
    };
    followChaser();
    this.events.on('postupdate', followChaser);
    this.events.once('shutdown', () => this.events.off('postupdate', followChaser));
    // Visual-only "!" next to the spawn corner, nudged toward the field; gone after about 1 s.
    const warn = this.add.text(x + (x < c.width / 2 ? 24 : -24), y + (y < c.height / 2 ? 22 : -22), '!',
      { fontFamily: HAND_FONT, fontSize: '26px', color: '#9e1b22' }).setOrigin(0.5).setAngle(-10);
    const ring = this.add.ellipse(warn.x, warn.y, 30, 26).setStrokeStyle(2, redInk).setAngle(-10);
    this.time.delayedCall(1000, () => { warn.destroy(); ring.destroy(); });
  }

  steerChaser(delta) {
    const c = COIN_DASH;
    const toPlayer = new Phaser.Math.Vector2(this.player.x - this.chaser.x, this.player.y - this.chaser.y)
      .normalize().scale(c.chaserSpeed);
    // Blend toward the wanted direction so the chaser lags on sharp turns and can be dodged.
    const t = Math.min(1, c.chaserTurnRate * delta / 1000);
    const v = this.chaser.body.velocity;
    this.chaser.body.setVelocity(v.x + (toPlayer.x - v.x) * t, v.y + (toPlayer.y - v.y) * t);
  }

  update(time, delta) {
    this.updateTrail();
    if (this.finished || this.paused) return;
    const now = this.time.now;
    if (!this.powerup.visible && now >= this.powerupNextAt) this.showPowerup();
    if (this.powerup.visible && now >= this.powerupExpiresAt) this.hidePowerup();
    if (this.activePowerup && now >= this.powerupUntil) this.endPowerup();
    if (!this.chaser && now >= this.chaserAt) this.spawnChaser();
    if (this.chaser) this.steerChaser(delta);
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const speed = COIN_DASH.playerSpeed
      * (this.activePowerup === 'speed' ? COIN_DASH.powerups.speed.multiplier : 1);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(speed);
    this.player.body.setVelocity(direction.x, direction.y);
    const seconds = Math.max(0, Math.ceil((this.deadline - now) / 1000));
    this.coinsText.setText(`Coins: ${this.score}`);
    this.timeText.setText(`Time: ${seconds}s`);
    if (this.lives !== this.livesShown) this.drawHearts();
    const kind = this.activePowerup;
    this.powerupHud.setVisible(Boolean(kind));
    if (kind) {
      this.powerupText.setText(COIN_DASH.powerups[kind].label);
      this.powerupBar.setFillStyle(COIN_DASH.colors.powerups[kind]).setScale(
        Math.max(0, (this.powerupUntil - now) / (COIN_DASH.powerups[kind].seconds * 1000)), 1);
    }
    if (seconds === 0) this.finish('Time is up!');
  }

  updateTrail() {
    this.trail.forEach(dot => dot.setAlpha(Math.max(0, dot.alpha - 0.03)));
    const last = this.trail[(this.trailIndex + this.trail.length - 1) % this.trail.length];
    // Spawn by distance moved, so standing still or pushing into a wall leaves no trail.
    if (Phaser.Math.Distance.Between(last.x, last.y, this.player.x, this.player.y) < 10) return;
    this.trail[this.trailIndex].setPosition(this.player.x, this.player.y).setAlpha(0.5);
    this.trailIndex = (this.trailIndex + 1) % this.trail.length;
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, c.colors.background, 0.95)
      .setStrokeStyle(2, 0x2b2a33).setAngle(-1);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\nPress R to try again`,
      { fontFamily: HAND_FONT, fontSize: '24px', color: '#2b2a33', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5).setAngle(-1);
  }
}
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});
// Background music: a looping square-wave tune, started once per page on the first key press
// (browsers block audio before a user gesture). It lives outside the scene, so R never restarts it.
const MUSIC_NOTES = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047, 988, 784, 587, 0];
window.addEventListener('keydown', () => {
  const ctx = new AudioContext();
  const volume = ctx.createGain();
  volume.gain.value = 0.03;
  volume.connect(ctx.destination);
  const step = 0.18;
  let next = ctx.currentTime + 0.05, i = 0;
  // Schedule notes ahead on the audio clock so the loop stays gapless even if timers jitter.
  setInterval(() => {
    for (; next < ctx.currentTime + 1.5; next += step, i = (i + 1) % MUSIC_NOTES.length) {
      if (!MUSIC_NOTES[i]) continue;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = MUSIC_NOTES[i];
      env.gain.setValueAtTime(1, next);
      env.gain.exponentialRampToValueAtTime(0.001, next + step * 0.9);
      osc.connect(env).connect(volume);
      osc.start(next);
      osc.stop(next + step);
    }
  }, 250);
}, { once: true });
