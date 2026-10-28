/* global Phaser, COIN_DASH */
// System hand-written fonts only; no external font files.
const HAND_FONT = '"Chalkboard SE", "Comic Sans MS", "Marker Felt", cursive';
// Chosen preset survives restarts; switching keys restart the round.
let difficulty = COIN_DASH.difficulty;
const DIFFICULTY_KEYS = { ONE: 'easy', TWO: 'normal', THREE: 'hard' };
// Menu settings survive restarts and reloads; storage can be blocked, so fall back to defaults.
const SETTINGS_KEY = 'coinDashSettings';
const KEY_SCHEMES = Object.keys(COIN_DASH.keySchemeLabels);
const playerSettings = { sound: COIN_DASH.sound, keyScheme: COIN_DASH.keyScheme };
try {
  Object.assign(playerSettings, JSON.parse(localStorage.getItem(SETTINGS_KEY)));
} catch (e) { /* keep defaults */ }
if (!KEY_SCHEMES.includes(playerSettings.keyScheme)) playerSettings.keyScheme = COIN_DASH.keyScheme;
// Future sound effects can read this, or rely on Phaser's mute set in create().
window.coinDashSettings = playerSettings;
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(playerSettings)); } catch (e) { /* not saved */ }
}

const INK = '#2b2a33';

// Best score per difficulty lives in localStorage; storage can be blocked, so failures just read as 0.
function bestScore(name) {
  try { return Number(localStorage.getItem(`coinDash.best.${name}`)) || 0; } catch (e) { return 0; }
}
function saveBestScore(name, score) {
  if (score <= bestScore(name)) return;
  try { localStorage.setItem(`coinDash.best.${name}`, String(score)); } catch (e) { /* not saved */ }
}

// First scene: title, difficulty choice, best score and a Start button.
class StartScreen extends Phaser.Scene {
  constructor() { super('StartScreen'); }

  create() {
    const c = COIN_DASH;
    const names = Object.keys(c.difficulties);
    this.add.text(c.width / 2, 90, 'Coin Dash',
      { fontFamily: HAND_FONT, fontSize: '56px', color: INK }).setOrigin(0.5).setAngle(-2);
    this.add.text(c.width / 2, 185, 'Difficulty',
      { fontFamily: HAND_FONT, fontSize: '20px', color: INK }).setOrigin(0.5);
    this.options = names.map((name, i) => {
      const option = this.add.text(c.width / 2 + (i - (names.length - 1) / 2) * 150, 225,
        `${i + 1}. ${c.difficulties[name].label}`,
        { fontFamily: HAND_FONT, fontSize: '22px', color: INK, padding: { x: 10, y: 4 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      option.on('pointerdown', () => this.choose(name));
      return { name, option };
    });
    this.bestText = this.add.text(c.width / 2, 285, '',
      { fontFamily: HAND_FONT, fontSize: '20px', color: INK }).setOrigin(0.5);
    const start = this.add.text(c.width / 2, 370, 'Start',
      { fontFamily: HAND_FONT, fontSize: '30px', color: INK, padding: { x: 28, y: 8 },
        backgroundColor: `#${c.colors.coin.toString(16).padStart(6, '0')}` })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on('pointerdown', () => this.startGame());
    this.add.text(c.width / 2, 440, 'Enter / Space to start · 1 / 2 / 3 or ← → to pick difficulty',
      { fontFamily: HAND_FONT, fontSize: '16px', color: INK }).setOrigin(0.5).setAlpha(0.7);
    for (const [key, name] of Object.entries(DIFFICULTY_KEYS)) {
      this.input.keyboard.on(`keydown-${key}`, () => this.choose(name));
    }
    const step = d => this.choose(names[(names.indexOf(difficulty) + d + names.length) % names.length]);
    this.input.keyboard.on('keydown-LEFT', () => step(-1));
    this.input.keyboard.on('keydown-RIGHT', () => step(1));
    this.input.keyboard.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard.on('keydown-SPACE', () => this.startGame());
    this.choose(difficulty);
  }

  choose(name) {
    difficulty = name;
    // The chosen preset is bold and fully opaque; the others fade.
    this.options.forEach(({ name: n, option }) => option
      .setAlpha(n === name ? 1 : 0.45).setStyle({ fontStyle: n === name ? 'bold' : 'normal' }));
    this.bestText.setText(`Best on ${COIN_DASH.difficulties[name].label}: ${bestScore(name)} coins`);
  }

  startGame() { this.scene.start('CoinDash'); }
}

class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    const preset = c.difficulties[difficulty];
    // This scene's clock was booted with the game and is stale after the start screen; sync it
    // so the round timers below do not lose the time spent on the start screen.
    this.time.now = this.game.loop.time;
    this.score = 0;
    this.lives = c.startLives;
    this.invulnerableUntil = 0;
    this.finished = false;
    this.paused = false;
    this.countingDown = false;
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
    this.hud = this.add.text(18, 12, '', { fontFamily: HAND_FONT, fontSize: '18px', color: '#2b2a33' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player)
      .setStrokeStyle(2, 0x2b2a33);
    this.physics.add.existing(this.player);
    // A separate ring shows the shield, so the player's own look is untouched.
    this.shieldRing = this.add.circle(0, 0, 22).setStrokeStyle(3, c.colors.powerups.shield)
      .setVisible(false);
    this.events.on('postupdate', () => {
      const left = this.powerupUntil - this.time.now;
      this.shieldRing.setPosition(this.player.x, this.player.y)
        .setVisible(this.activePowerup === 'shield')
        .setAlpha(!this.paused && !this.countingDown && left < 1000 && Math.floor(left / 125) % 2 ? 0.25 : 1);
    });
    this.player.body.setCollideWorldBounds(true);
    this.coin = this.add.circle(100, 100, 9, c.colors.coin).setStrokeStyle(2, 0x2b2a33);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
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
    this.sound.mute = !playerSettings.sound;
    this.settingsOpen = false;
    // Game keys are ignored while the settings menu is open.
    this.input.keyboard.on('keydown-R', () => { if (!this.settingsOpen) this.scene.restart(); });
    for (const [key, name] of Object.entries(DIFFICULTY_KEYS)) {
      this.input.keyboard.on(`keydown-${key}`, () => {
        if (this.settingsOpen) return;
        difficulty = name;
        this.scene.restart();
      });
    }
    this.input.keyboard.on('keydown-P', () => { if (!this.settingsOpen) this.togglePause(); });
    this.input.keyboard.on('keydown-O', () => this.toggleSettings());
    this.input.keyboard.on('keydown-ESC', () => { if (this.settingsOpen) this.toggleSettings(); });
    this.input.keyboard.on('keydown-M', () => {
      if (!this.settingsOpen) return;
      playerSettings.sound = !playerSettings.sound;
      this.sound.mute = !playerSettings.sound;
      saveSettings();
      this.showSettings();
    });
    this.input.keyboard.on('keydown-K', () => {
      if (!this.settingsOpen) return;
      const next = (KEY_SCHEMES.indexOf(playerSettings.keyScheme) + 1) % KEY_SCHEMES.length;
      playerSettings.keyScheme = KEY_SCHEMES[next];
      saveSettings();
      this.showSettings();
    });
    this.pauseBox = this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.pauseText = this.add.text(c.width / 2, c.height / 2, 'Paused\nPress P to resume',
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
    this.pauseBox.setVisible(false).setDepth(10);
    this.pauseText.setVisible(false).setDepth(11);
    this.countdownText = this.add.text(c.width / 2, c.height / 2, '',
      { fontFamily: HAND_FONT, fontSize: '72px', color: '#2b2a33' }).setOrigin(0.5).setDepth(11);
    // The round starts frozen and only begins once the countdown ends.
    this.drawHud(this.time.now);
    this.freeze();
    this.startCountdown();
    // Settings reuse the pause overlay's look; styling is left to the visuals owner.
    this.settingsBox = this.add.rectangle(c.width / 2, c.height / 2, 460, 210, 0x0a1120, 0.95)
      .setVisible(false).setDepth(12);
    this.settingsText = this.add.text(c.width / 2, c.height / 2, '',
      { font: '22px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5).setVisible(false).setDepth(13);
  }

  // Opening settings pauses the round; closing resumes it unless P had paused it first.
  toggleSettings() {
    // Like P, the menu waits for the countdown to finish.
    if (this.countingDown) return;
    this.settingsOpen = !this.settingsOpen;
    if (this.settingsOpen) {
      this.pausedBySettings = !this.paused && !this.finished;
      if (this.pausedBySettings) this.togglePause();
      this.showSettings();
    } else if (this.pausedBySettings) {
      this.togglePause();
    }
    this.settingsBox.setVisible(this.settingsOpen);
    this.settingsText.setVisible(this.settingsOpen);
    this.pauseBox.setVisible(this.paused && !this.settingsOpen);
    this.pauseText.setVisible(this.paused && !this.settingsOpen);
  }

  showSettings() {
    this.settingsText.setText([
      'Settings',
      `M  Sound: ${playerSettings.sound ? 'On' : 'Off'}`,
      `K  Keys: ${COIN_DASH.keySchemeLabels[playerSettings.keyScheme]}`,
      'O / Esc to close'
    ].join('\n'));
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

  // Freezing stops physics; thawing shifts every timer forward by the frozen time.
  freeze() {
    this.frozenAt = this.time.now;
    this.physics.pause();
  }

  thaw() {
    const frozenFor = this.time.now - this.frozenAt;
    this.deadline += frozenFor;
    this.powerupNextAt += frozenFor;
    this.powerupExpiresAt += frozenFor;
    this.powerupUntil += frozenFor;
    this.chaserAt += frozenFor;
    this.physics.resume();
  }

  togglePause() {
    if (this.finished || this.countingDown) return;
    this.paused = !this.paused;
    // Resuming goes through the countdown, which thaws the game when it ends.
    if (this.paused) this.freeze();
    else this.startCountdown();
    this.pauseBox.setVisible(this.paused);
    this.pauseText.setVisible(this.paused);
  }

  startCountdown() {
    let left = COIN_DASH.countdownSeconds;
    this.countingDown = true;
    this.countdownText.setText(left).setVisible(true);
    this.time.addEvent({
      delay: 1000,
      repeat: left - 1,
      callback: () => {
        left--;
        if (left > 0) {
          this.countdownText.setText(left);
          return;
        }
        this.countdownText.setVisible(false);
        this.countingDown = false;
        this.thaw();
      }
    });
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
    if (this.finished || this.paused || this.countingDown) return;
    const now = this.time.now;
    if (!this.powerup.visible && now >= this.powerupNextAt) this.showPowerup();
    if (this.powerup.visible && now >= this.powerupExpiresAt) this.hidePowerup();
    if (this.activePowerup && now >= this.powerupUntil) this.endPowerup();
    if (!this.chaser && now >= this.chaserAt) this.spawnChaser();
    if (this.chaser) this.steerChaser(delta);
    const arrows = playerSettings.keyScheme !== 'wasd';
    const wasd = playerSettings.keyScheme !== 'arrows';
    const held = (arrow, letter) => (arrows && arrow.isDown) || (wasd && letter.isDown);
    const dx = Number(held(this.cursors.right, this.keys.D)) - Number(held(this.cursors.left, this.keys.A));
    const dy = Number(held(this.cursors.down, this.keys.S)) - Number(held(this.cursors.up, this.keys.W));
    const speed = COIN_DASH.playerSpeed
      * (this.activePowerup === 'speed' ? COIN_DASH.powerups.speed.multiplier : 1);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(speed);
    this.player.body.setVelocity(direction.x, direction.y);
    if (this.drawHud(now) === 0) this.finish('Time is up!');
  }

  // Returns the seconds left so update() can end the round.
  drawHud(now) {
    const seconds = Math.max(0, Math.ceil((this.deadline - now) / 1000));
    const label = COIN_DASH.difficulties[difficulty].label;
    const status = this.activePowerup
      ? `      ${COIN_DASH.powerups[this.activePowerup].label}: ${Math.ceil((this.powerupUntil - now) / 1000)}s`
      : '';
    this.hud.setText(`Coins: ${this.score}      Lives: ${this.lives}      Time: ${seconds}s      ${label}${status}`);
    return seconds;
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const best = bestScore(difficulty);
    const newBest = this.score > best;
    saveBestScore(difficulty, this.score);
    const c = COIN_DASH;
    const cx = c.width / 2, cy = c.height / 2;
    const style = { fontFamily: HAND_FONT, fontSize: '24px', color: INK, align: 'center' };
    this.add.rectangle(cx, cy, 460, 260, c.colors.background, 0.95)
      .setStrokeStyle(2, 0x2b2a33).setAngle(-1).setDepth(10);
    this.add.text(cx, cy - 90, reason, style).setOrigin(0.5).setDepth(11);
    this.add.text(cx, cy - 45, `${this.score} coins`, { ...style, fontSize: '36px' })
      .setOrigin(0.5).setDepth(11);
    this.add.text(cx, cy + 5, newBest ? 'New best!' : `Best on ${c.difficulties[difficulty].label}: ${best}`,
      { ...style, fontSize: '20px', fontStyle: newBest ? 'bold' : 'normal' }).setOrigin(0.5).setDepth(11);
    this.gameOverButton(cx - 90, cy + 75, 'Again (R)', () => this.scene.restart());
    this.gameOverButton(cx + 90, cy + 75, 'Menu (M)', () => this.goToMenu());
    // M is also the sound toggle inside settings, so it only means Menu while settings are closed.
    this.input.keyboard.on('keydown-M', () => { if (!this.settingsOpen) this.goToMenu(); });
  }

  gameOverButton(x, y, label, onClick) {
    this.add.text(x, y, label, { fontFamily: HAND_FONT, fontSize: '22px', color: INK,
      padding: { x: 16, y: 6 }, backgroundColor: `#${COIN_DASH.colors.coin.toString(16).padStart(6, '0')}` })
      .setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
  }

  goToMenu() { this.scene.start('StartScreen'); }
}
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: [StartScreen, CoinDash]
});
