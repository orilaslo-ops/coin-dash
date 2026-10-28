// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  playerSpeed: 240,
  // Difficulty presets: press 1/2/3 in game to switch. Each preset sets drone count and speed.
  difficulty: 'normal',
  difficulties: {
    easy:   { label: 'Easy',   droneCount: 2, droneSpeed: 80 },
    normal: { label: 'Normal', droneCount: 3, droneSpeed: 105 },
    hard:   { label: 'Hard',   droneCount: 5, droneSpeed: 140 }
  },
  startLives: 3,
  hitInvulnerableMs: 1500,
  colors: { background: 0xf4efe1, player: 0x5f9c8f, coin: 0xd8b04a, drone: 0xc4574d }
};
