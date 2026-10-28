/* global Phaser, COIN_DASH */
// System hand-written fonts only; no external font files.
const HAND_FONT = '"Chalkboard SE", "Comic Sans MS", "Marker Felt", cursive';
// Chosen preset survives restarts; switching keys restart the round.
let difficulty = COIN_DASH.difficulty;
const DIFFICULTY_KEYS = { ONE: 'easy', TWO: 'normal', THREE: 'hard' };

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
    this.hud = this.add.text(18, 12, '', { fontFamily: HAND_FONT, fontSize: '18px', color: '#2b2a33' });
    // Unfilled 24x24 rectangle keeps the hit box; the ship below is visual only.
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24);
    this.physics.add.existing(this.player);
    // A separate ring shows the shield, so the player's own look is untouched.
    this.shieldRing = this.add.circle(0, 0, 22).setStrokeStyle(3, c.colors.powerups.shield)
      .setVisible(false);
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
    this.powerup = this.add.star(0, 0, 5, 6, 13, 0xffffff).setVisible(false);
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
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      this.collectEffect(this.coin.x, this.coin.y);
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.powerup, () => {
      if (this.finished || !this.powerup.visible) return;
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
    const ink = { fontFamily: HAND_FONT, color: '#2b2a33' };
    this.pauseText = this.add.text(0, -18, 'PAUSED', { ...ink, fontSize: '56px' }).setOrigin(0.5);
    const card = this.add.container(c.width / 2, c.height / 2, [
      this.add.rectangle(0, 0, 460, 170, c.colors.background).setStrokeStyle(2, 0x2b2a33),
      this.add.rectangle(-225, -80, 80, 24, 0xe6d6a0, 0.8).setAngle(-35),
      this.add.rectangle(225, -80, 80, 24, 0xe6d6a0, 0.8).setAngle(35),
      this.pauseText,
      this.add.text(0, 45, 'press P to resume', { ...ink, fontSize: '22px' }).setOrigin(0.5)
    ]).setAngle(-2);
    this.pauseBox = this.add.container(0, 0, [
      this.add.rectangle(0, 0, c.width, c.height, c.colors.background, 0.7).setOrigin(0), card
    ]).setVisible(false).setDepth(10);
  }

  loseLife() {
    if (this.finished || this.time.now < this.invulnerableUntil) return;
    this.lives--;
    if (this.lives <= 0) {
      this.hud.setText(this.hud.text.replace(/Lives: \d+/, 'Lives: 0'));
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
    this.powerup.setFillStyle(c.colors.powerups[this.powerup.kind]);
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
    this.chaser = this.add.rectangle(x, y, 22, 22, c.colors.drone).setAngle(45);
    this.physics.add.existing(this.chaser);
    this.chaser.body.setCollideWorldBounds(true);
    // The chaser follows the same hit rules as the other drones: shield blocks it, a hit costs a life.
    this.physics.add.overlap(this.player, this.chaser, () => {
      if (this.activePowerup === 'shield') return;
      this.loseLife();
    });
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
    const label = COIN_DASH.difficulties[difficulty].label;
    const status = this.activePowerup
      ? `      ${COIN_DASH.powerups[this.activePowerup].label}: ${Math.ceil((this.powerupUntil - now) / 1000)}s`
      : '';
    this.hud.setText(`Coins: ${this.score}      Lives: ${this.lives}      Time: ${seconds}s      ${label}${status}`);
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
