// Vault Break — the level: the Meridian Bank, one rainy night.
// Legend: # wall, . floor, S shadow floor (dark, hard to be seen in),
// + door (floor), P player start, V vault block, E getaway van,
// L loot pile, D security panel, C camera mount.
// The vault is a 2x2 steel block; crack it from an adjacent floor tile.
// Cameras and guards are defined below the grid with their own data.
(function (root) {
  'use strict';

  var GRID = [
    '########################',
    '#......#......#...VV...#',
    '#.L....#..L...#...VV...#',
    '#......#......#........#',
    '#..S...+....D.+........#',
    '#......#......#........#',
    '###.####......####.##..#',
    '#......................#',
    '#.S....######.....S....#',
    '#......#....#..........#',
    '#..L...#....#.L....C...#',
    '#......#....#..........#',
    '#P.....#....#.....E....#',
    '########################',
  ];

  var TILE_WALKABLE = {
    '#': false, '.': true, S: true, '+': true,
    P: true, V: false, E: true, L: true, D: true, C: true,
  };

  function buildLevel() {
    var height = GRID.length, width = GRID[0].length;
    var start = null, exit = null, panel = null;
    var vault = [], loot = [], cameras = [];
    for (var y = 0; y < height; y++) {
      if (GRID[y].length !== width) throw new Error('level row ' + y + ' is not ' + width + ' wide');
      for (var x = 0; x < width; x++) {
        var t = GRID[y][x];
        if (t === 'P') start = { x: x, y: y };
        if (t === 'E') exit = { x: x, y: y };
        if (t === 'D') panel = { x: x, y: y };
        if (t === 'V') vault.push({ x: x, y: y });
        if (t === 'L') loot.push({ x: x, y: y, value: 0, taken: false });
        if (t === 'C') cameras.push({ x: x, y: y });
      }
    }
    // Loot values, in dollars, by position.
    var values = { '2,2': 800, '9,2': 1200, '3,10': 800, '13,10': 1500 };
    loot.forEach(function (l) { l.value = values[l.x + ',' + l.y] || 500; });

    // Cameras: wall/ceiling mounts with a base facing, a sweep and a range.
    // base is radians (0 = east, PI/2 = south). They sweep +-sweep around it.
    var camDefs = [
      { x: 22, y: 1, base: Math.PI * 0.75, sweep: 0.6, range: 6, name: 'Vault Cam' },
      { x: 3, y: 8, base: 0, sweep: 0.7, range: 6, name: 'Lobby Cam' },
      { x: 19, y: 10, base: Math.PI, sweep: 0.6, range: 6, name: 'Office Cam' },
    ];
    cameras = camDefs;

    return {
      name: 'The Meridian Bank',
      width: width, height: height, grid: GRID,
      start: start, exit: exit, panel: panel,
      vault: vault, loot: loot, cameras: cameras,
      vaultValue: 5000,
      // All patrols share one 60-tick cycle so the player can learn the
      // timing (and so the solver can search time modulo 60).
      guards: [
        { name: 'Vault Guard', waypoints: [{ x: 16, y: 3 }, { x: 21, y: 3 }], pause: 20 },
        { name: 'Lobby Guard', waypoints: [{ x: 4, y: 7 }, { x: 19, y: 7 }], pause: 0 },
        { name: 'Office Guard', waypoints: [{ x: 16, y: 11 }, { x: 21, y: 11 }], pause: 20 },
      ],
      tileAt: function (x, y) {
        if (x < 0 || y < 0 || x >= width || y >= height) return '#';
        return GRID[y][x];
      },
      isWall: function (x, y) {
        return this.tileAt(x, y) === '#';
      },
      walkable: function (x, y) {
        var t = this.tileAt(x, y);
        return !!TILE_WALKABLE[t];
      },
      isShadow: function (x, y) {
        return this.tileAt(x, y) === 'S';
      },
      isVault: function (x, y) {
        return this.tileAt(x, y) === 'V';
      },
    };
  }

  var api = { GRID: GRID, buildLevel: buildLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VaultBreakLevel = api;
})(typeof window !== 'undefined' ? window : globalThis);
