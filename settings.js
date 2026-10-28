// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  playerSpeed: 240,
  droneSpeed: 105,
  droneCount: 3,
  powerupEverySeconds: 10,
  powerupLifetimeSeconds: 6,
  // Each power-up type: what the HUD calls it and how long its effect lasts.
  // 'time' is instant: it adds `bonus` seconds to the clock.
  powerups: {
    speed: { label: 'Speed', seconds: 3, multiplier: 1.6 },
    shield: { label: 'Shield', seconds: 3 },
    slow: { label: 'Slow drones', seconds: 3, multiplier: 0.5 },
    time: { bonus: 5 }
  },
  colors: {
    background: 0x101c31, player: 0x71e8ce, coin: 0xffd166, drone: 0xff657a,
    powerups: { speed: 0x7fb2ff, shield: 0xc9a7ff, slow: 0x9cf28a, time: 0xffffff }
  }
};
