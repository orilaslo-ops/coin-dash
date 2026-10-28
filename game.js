/* global Phaser, COIN_DASH */
// System hand-written fonts only; no external font files.
const HAND_FONT = '"Chalkboard SE", "Comic Sans MS", "Marker Felt", cursive';
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.finished = false;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    // Slightly uneven pencil grid, drawn once so the paper look stays static.
    const lines = this.add.graphics().lineStyle(1, 0x5a6b8c, 0.25);
    for (let x = 40; x < c.width; x += 40) lines.lineBetween(x, 0, x + Math.sin(x) * 3, c.height);
    for (let y = 40; y < c.height; y += 40) lines.lineBetween(0, y, c.width, y + Math.cos(y) * 3);
    this.hud = this.add.text(18, 12, '', { fontFamily: HAND_FONT, fontSize: '18px', color: '#2b2a33' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player)
      .setStrokeStyle(2, 0x2b2a33);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
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
    this.drones = this.physics.add.group();
    for (let i = 0; i < c.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * 270, 100, 26, 26, c.colors.drone)
        .setStrokeStyle(2, 0x2b2a33);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * c.droneSpeed, Math.sin(angle) * c.droneSpeed);
    }
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      this.collectEffect(this.coin.x, this.coin.y);
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => this.finish('A drone caught you!'));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
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

  update() {
    if (this.finished) return;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    this.hud.setText(`Coins: ${this.score}                       Time: ${seconds}s`);
    if (seconds === 0) this.finish('Time is up!');
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
