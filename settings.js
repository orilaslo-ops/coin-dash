// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  countdownSeconds: 3, // 3-2-1 before the round starts and after unpausing
  playerSpeed: 240,
  // Difficulty presets: press 1/2/3 in game to switch. Each preset sets drone count and speed,
  // plus how many patrol drones (fixed loop) and blink drones (vanish and reappear) join in.
  difficulty: 'normal',
  difficulties: {
    easy:   { label: 'Easy',   droneCount: 2, droneSpeed: 80,  patrolCount: 1, blinkCount: 0 },
    normal: { label: 'Normal', droneCount: 3, droneSpeed: 105, patrolCount: 1, blinkCount: 1 },
    hard:   { label: 'Hard',   droneCount: 5, droneSpeed: 140, patrolCount: 2, blinkCount: 1 }
  },
  // Patrol drones loop through these points in order; several patrols start spread along the loop.
  patrolSpeed: 110,
  patrolPath: [[150, 130], [650, 130], [650, 420], [150, 420]],
  // Blink drones bounce like normal drones, vanish every few seconds, and show a harmless faded
  // warning at their next spot for blinkWarnMs before they become solid there.
  blinkVisibleSeconds: 4,
  blinkHiddenMs: 700,
  blinkWarnMs: 600,
  // Defaults for the settings menu (O in game); the player's choice is remembered in the browser.
  // keyScheme: 'both', 'arrows' or 'wasd'. sound only stores the choice until sound effects exist.
  sound: true,
  keyScheme: 'both',
  keySchemeLabels: { both: 'Arrows + WASD', arrows: 'Arrows', wasd: 'WASD' },
  startLives: 3,
  hitInvulnerableMs: 1500,
  chaserSpeed: 130,
  chaserDelaySeconds: 5,
  chaserTurnRate: 2.5, // how quickly the chaser steers toward the player (per second)
  // The arena's edges close in evenly over the round; by roundSeconds it is this fraction of its
  // full width and height, and it stays that size for any bonus time.
  arenaMinScale: 0.55,
  // Two linked portals: step into one and come out of the other. Only the player teleports.
  portals: [[110, 280], [690, 280]],
  portalRadius: 22,
  powerupEverySeconds: 10,
  powerupLifetimeSeconds: 6,
  // Each power-up type: what the HUD calls it and how long its effect lasts.
  // 'time' is instant: it adds `bonus` seconds to the clock.
  powerups: {
    speed: { label: 'Speed', seconds: 3, multiplier: 1.6 },
    shield: { label: 'Shield', seconds: 3 },
    slow: { label: 'Slow drones', seconds: 3, multiplier: 0.5 },
    time: { bonus: 5 },
    // Coins within `radius` px glide toward the player at `pullSpeed` px/s.
    magnet: { label: 'Magnet', seconds: 5, radius: 160, pullSpeed: 320 }
  },
  // One mission is picked at random each round; finishing it adds `missionBonus` coins to the score.
  // {n} in a label is replaced by the target.
  missionBonus: 5,
  missions: {
    noHit: { label: 'Collect {n} coins in a row without getting hit', target: 10 },
    powerups: { label: 'Pick up {n} power-ups', target: 2 },
    boosted: { label: 'Collect {n} coins while a power-up is active', target: 2 }
  },
  colors: {
    background: 0xf4efe1, player: 0x5f9c8f, coin: 0xd8b04a, drone: 0xc4574d, portal: 0x7a5cc4,
    powerups: { speed: 0x2f6fd6, shield: 0x8657c9, slow: 0x3e9a4b, time: 0xe08a2e, magnet: 0xff8fb1 }
  }
};
