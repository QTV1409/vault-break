// Vault Break — the rules: tile movement, guard patrols and chases,
// camera vision cones, a shared alarm meter, loot, the vault crack,
// the security-panel hack, and the win/lose conditions.
// Fixed 10 Hz ticks, seeded randomness only, no Date, no network:
// the same actions always replay to the same state. The module works
// in a browser (window.VaultBreakEngine) and in Node (module.exports).
(function (root) {
  'use strict';

  var TICK_HZ = 10;
  var TIME_LIMIT_TICKS = 2400; // 4 minutes on the clock.
  var CRACK_TICKS = 30; // 3 s holding E beside the vault.
  var HACK_TICKS = 20; // 2 s holding E beside the security panel.
  var CAMERA_DISABLE_TICKS = 450; // hacked cameras stay dark 45 s.
  var SUSPICIOUS_AT = 35; // a guard comes to look.
  var ALARM_AT = 100; // full alarm: every guard chases.
  var GUARD_RANGE = 5, GUARD_HALF_ANGLE = 0.61; // ~35 degrees.
  var CAMERA_RANGE = 6, CAMERA_HALF_ANGLE = 0.52; // ~30 degrees.
  var CYCLE = 60; // every patrol and camera sweep shares this cycle.

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Line of sight on the tile grid: walls and the vault block sight.
  function losBlocked(level, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return false;
      if (!(x === x0 && y === y0)) {
        var t = level.tileAt(x, y);
        if (t === '#' || t === 'V') return true;
      }
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function inCone(fx, fy, facing, halfAngle, range, tx, ty) {
    var dx = tx - fx, dy = ty - fy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > range) return false;
    if (dist < 0.5) return true;
    var ang = Math.atan2(dy, dx) - facing;
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    return Math.abs(ang) <= halfAngle;
  }

  // --- Patrol schedules ----------------------------------------------------
  // A guard's patrol is a fixed 60-tick cycle: pause at one end, walk to
  // the other (one tile every two ticks), pause, walk back. buildCycle
  // returns the pose (tile + facing) for every tick of the cycle, so the
  // live game and the level solver agree exactly on where a patrolling
  // guard is at any tick.
  function buildCycle(def) {
    var a = def.waypoints[0], b = def.waypoints[1];
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.abs(dx) + Math.abs(dy);
    var sx = dx === 0 ? 0 : dx / Math.abs(dx);
    var sy = dy === 0 ? 0 : dy / Math.abs(dy);
    var pause = def.pause || 0;
    var cycle = [];
    function leg(from, to, fx, fy) {
      for (var p = 0; p < pause; p++) cycle.push({ x: from.x, y: from.y, fx: fx, fy: fy });
      for (var s = 0; s < dist; s++) {
        var nx = from.x + sx * s, ny = from.y + sy * s;
        cycle.push({ x: nx, y: ny, fx: sx, fy: sy });
        cycle.push({ x: nx, y: ny, fx: sx, fy: sy });
      }
    }
    leg(a, b, sx, sy);
    leg(b, a, -sx, -sy);
    if (cycle.length !== CYCLE) throw new Error('patrol cycle is ' + cycle.length + ', not ' + CYCLE);
    return cycle;
  }

  function cameraAngle(cam, tick) {
    return cam.base + cam.sweep * Math.sin((2 * Math.PI * tick) / CYCLE);
  }

  function guardSees(level, pose, px, py, sneak, shadow) {
    var fx = pose.fx, fy = pose.fy;
    var facing = Math.atan2(fy, fx);
    if (!inCone(pose.x, pose.y, facing, GUARD_HALF_ANGLE, GUARD_RANGE, px, py)) return 0;
    if (losBlocked(level, pose.x, pose.y, px, py)) return 0;
    var dist = Math.sqrt((px - pose.x) * (px - pose.x) + (py - pose.y) * (py - pose.y));
    var rate = 1.1 * clamp(1 - dist / 7, 0.35, 1);
    if (sneak) rate *= 0.35;
    if (shadow) rate *= 0.5;
    return rate;
  }

  function cameraSees(level, cam, tick, px, py, sneak, shadow) {
    var facing = cameraAngle(cam, tick);
    if (!inCone(cam.x, cam.y, facing, CAMERA_HALF_ANGLE, CAMERA_RANGE, px, py)) return 0;
    if (losBlocked(level, cam.x, cam.y, px, py)) return 0;
    var dist = Math.sqrt((px - cam.x) * (px - cam.x) + (py - cam.y) * (py - cam.y));
    var rate = 1.8 * clamp(1 - dist / 8, 0.4, 1);
    if (sneak) rate *= 0.5;
    if (shadow) rate *= 0.6;
    return rate;
  }

  // Breadth-first path on walkable tiles, fixed neighbour order so it is
  // deterministic. Returns a list of tiles from start (excluded) to goal.
  function bfsPath(level, sx, sy, gx, gy) {
    if (sx === gx && sy === gy) return [];
    var key = function (x, y) { return x + ',' + y; };
    var prev = {};
    var seen = {};
    var queue = [{ x: sx, y: sy }];
    seen[key(sx, sy)] = true;
    var dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    while (queue.length) {
      var cur = queue.shift();
      for (var i = 0; i < dirs.length; i++) {
        var nx = cur.x + dirs[i].x, ny = cur.y + dirs[i].y;
        if (seen[key(nx, ny)] || !level.walkable(nx, ny)) continue;
        seen[key(nx, ny)] = true;
        prev[key(nx, ny)] = cur;
        if (nx === gx && ny === gy) {
          var path = [{ x: nx, y: ny }];
          var at = cur;
          while (!(at.x === sx && at.y === sy)) {
            path.unshift(at);
            at = prev[key(at.x, at.y)];
          }
          return path;
        }
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  function adjacentToVault(level, x, y) {
    var dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    for (var i = 0; i < dirs.length; i++) {
      if (level.isVault(x + dirs[i].x, y + dirs[i].y)) return true;
    }
    return false;
  }

  function adjacentToPanel(level, x, y) {
    var p = level.panel;
    return Math.abs(x - p.x) + Math.abs(y - p.y) === 1;
  }

  // --- Game state ----------------------------------------------------------
  function createGame(level) {
    var cycles = level.guards.map(buildCycle);
    return {
      level: level,
      cycles: cycles,
      tick: 0,
      timeLeft: TIME_LIMIT_TICKS,
      phase: 'title',
      player: { x: level.start.x, y: level.start.y, sneakReady: true, sneaking: false },
      guards: level.guards.map(function (g, i) {
        var pose = cycles[i][0];
        return {
          name: g.name, x: pose.x, y: pose.y, fx: pose.fx, fy: pose.fy,
          state: 'patrol', lastSeen: null, lookTimer: 0, lostTimer: 0,
          path: null, pathIndex: 0, moveReady: true, cycleIndex: i,
        };
      }),
      loot: level.loot.map(function (l) { return { x: l.x, y: l.y, value: l.value, taken: false }; }),
      lootValue: 0,
      vaultCracked: false,
      crackProgress: 0,
      hackProgress: 0,
      camerasDisabledUntil: -1,
      alarm: 0,
      peakAlarm: 0,
      won: false,
      over: false,
      caught: false,
      timeout: false,
      events: [],
    };
  }

  function resetGame(state) {
    var fresh = createGame(state.level);
    fresh.phase = state.phase;
    return fresh;
  }

  // One fixed tick. action: {dx, dy, sneak, crack, hack}.
  function stepGame(state, action) {
    var level = state.level;
    state.events = [];
    if (state.won || state.over) return;
    state.tick++;
    action = action || {};
    var p = state.player;
    var moved = false;
    var sneak = !!action.sneak;
    p.sneaking = sneak;

    // --- Player move -------------------------------------------------------
    var dx = action.dx || 0, dy = action.dy || 0;
    if (dx !== 0 || dy !== 0) {
      if (sneak) {
        if (p.sneakReady) {
          if (level.walkable(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; moved = true; }
          p.sneakReady = false;
        } else {
          p.sneakReady = true; // sneak steps take two ticks.
        }
      } else {
        if (level.walkable(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; moved = true; }
        p.sneakReady = true;
      }
    }
    if (moved) state.crackProgress = 0, state.hackProgress = 0;

    // Loot pickup on entering a tile.
    state.loot.forEach(function (l) {
      if (!l.taken && l.x === p.x && l.y === p.y) {
        l.taken = true;
        state.lootValue += l.value;
        state.events.push({ type: 'loot', x: l.x, y: l.y, value: l.value });
      }
    });

    // Vault crack: hold E beside the vault without moving.
    if (action.crack && !moved && !state.vaultCracked && adjacentToVault(level, p.x, p.y)) {
      state.crackProgress++;
      if (state.crackProgress >= CRACK_TICKS) {
        state.vaultCracked = true;
        state.lootValue += level.vaultValue;
        state.alarm = Math.min(ALARM_AT, state.alarm + 15);
        state.events.push({ type: 'vault', value: level.vaultValue });
        // The silent alarm trips: the meter jumps, but no guard is told
        // where the vault is — the solver's patrol model stays exact and
        // the replay is the proof that the escape still works.
      }
    } else if (!action.crack) {
      state.crackProgress = 0;
    }

    // Security-panel hack: hold E beside the panel without moving.
    if (action.hack && !moved && adjacentToPanel(level, p.x, p.y)) {
      state.hackProgress++;
      if (state.hackProgress >= HACK_TICKS) {
        state.hackProgress = 0;
        state.camerasDisabledUntil = state.tick + CAMERA_DISABLE_TICKS;
        state.events.push({ type: 'hack' });
      }
    } else if (!action.hack) {
      state.hackProgress = 0;
    }

    // --- Guards ------------------------------------------------------------
    var camerasDark = state.tick < state.camerasDisabledUntil;
    var shadow = level.isShadow(p.x, p.y);
    var seenBy = [];
    var bestRate = 0;

    state.guards.forEach(function (g) {
      if (g.state === 'patrol') {
        var pose = state.cycles[g.cycleIndex][state.tick % CYCLE];
        g.x = pose.x; g.y = pose.y; g.fx = pose.fx; g.fy = pose.fy;
      } else if (g.state === 'investigate') {
        if (!g.path) g.path = bfsPath(level, g.x, g.y, g.lastSeen.x, g.lastSeen.y) || [];
        if (g.path && g.pathIndex < g.path.length) {
          if (g.moveReady) {
            var step = g.path[g.pathIndex++];
            g.fx = Math.sign(step.x - g.x); g.fy = Math.sign(step.y - g.y);
            g.x = step.x; g.y = step.y;
          }
          g.moveReady = !g.moveReady;
        } else {
          g.lookTimer++;
          if (g.lookTimer % 5 === 0) {
            var dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
            var d = dirs[Math.floor(g.lookTimer / 5) % 4];
            g.fx = d.x; g.fy = d.y;
          }
          if (g.lookTimer >= 20) {
            g.state = 'patrol'; g.lookTimer = 0; g.path = null; g.pathIndex = 0;
          }
        }
      } else if (g.state === 'chase') {
        if (!g.path || state.tick % 8 === 0) {
          g.path = bfsPath(level, g.x, g.y, p.x, p.y) || [];
          g.pathIndex = 0;
        }
        if (g.path && g.pathIndex < g.path.length) {
          var s2 = g.path[g.pathIndex++];
          g.fx = Math.sign(s2.x - g.x); g.fy = Math.sign(s2.y - g.y);
          g.x = s2.x; g.y = s2.y;
        }
      }
    });

    // Vision: guards see with their current pose, cameras with the sweep.
    state.guards.forEach(function (g, i) {
      var rate = guardSees(level, g, p.x, p.y, sneak, shadow);
      if (rate > 0) { seenBy.push(i); if (rate > bestRate) bestRate = rate; }
    });
    if (!camerasDark) {
      level.cameras.forEach(function (cam) {
        var rate = cameraSees(level, cam, state.tick, p.x, p.y, sneak, shadow);
        if (rate > 0) { seenBy.push(-1); if (rate > bestRate) bestRate = rate; }
      });
    }

    if (bestRate > 0) {
      state.alarm = Math.min(ALARM_AT, state.alarm + bestRate);
      if (state.alarm > state.peakAlarm) state.peakAlarm = state.alarm;
      // A glimpse only fills the meter. Guards act on the thresholds,
      // never on a single sighting — that is what keeps the solver's
      // patrol model exact while the alarm stays under 35.
      state.guards.forEach(function (g) {
        g.lastSeen = { x: p.x, y: p.y };
        g.lostTimer = 0;
      });
      if (state.alarm >= ALARM_AT) {
        state.guards.forEach(function (g) {
          if (g.state !== 'chase') { g.state = 'chase'; g.path = null; g.pathIndex = 0; }
        });
        if (state.events.filter(function (e) { return e.type === 'alert'; }).length === 0) {
          state.events.push({ type: 'alert' });
        }
      } else if (state.alarm >= SUSPICIOUS_AT) {
        state.guards.forEach(function (g, i) {
          if (seenBy.indexOf(i) !== -1) {
            if (g.state !== 'chase') {
              g.state = 'chase'; g.path = null; g.pathIndex = 0;
              state.events.push({ type: 'spotted', guard: i });
            }
          } else if (g.state === 'patrol') {
            g.state = 'investigate'; g.path = null; g.pathIndex = 0;
          }
        });
      }
    } else {
      state.alarm = Math.max(0, state.alarm - 0.7);
      state.guards.forEach(function (g) {
        if (g.state === 'chase') {
          g.lostTimer++;
          if (g.lostTimer >= 40) {
            g.state = 'investigate'; g.lostTimer = 0; g.path = null; g.pathIndex = 0;
          }
        }
      });
    }

    // Running is noisy: nearby guards come to look.
    if (moved && !sneak) {
      state.guards.forEach(function (g) {
        var d = Math.abs(g.x - p.x) + Math.abs(g.y - p.y);
        if (d <= 3 && g.state === 'patrol') {
          g.state = 'investigate';
          g.lastSeen = { x: p.x, y: p.y };
          g.path = null; g.pathIndex = 0;
        }
      });
    }

    // Caught: a guard ends the tick on the player's tile.
    var caughtGuard = -1;
    state.guards.forEach(function (g, i) {
      if (g.x === p.x && g.y === p.y) caughtGuard = i;
    });
    if (caughtGuard >= 0) {
      state.caught = true;
      state.over = true;
      state.events.push({ type: 'caught', guard: caughtGuard });
      return;
    }

    // Win: vault cracked, reach the getaway van.
    if (state.vaultCracked && p.x === level.exit.x && p.y === level.exit.y) {
      state.won = true;
      state.events.push({ type: 'won', loot: state.lootValue });
      return;
    }

    // Clock.
    state.timeLeft--;
    if (state.timeLeft <= 0) {
      state.timeout = true;
      state.over = true;
      state.events.push({ type: 'timeout' });
    }
  }

  // Replay a list of actions from a fresh game; returns the outcome.
  function simulateRun(level, actions) {
    var state = createGame(level);
    state.phase = 'playing';
    var peak = 0;
    for (var i = 0; i < actions.length; i++) {
      stepGame(state, actions[i]);
      if (state.alarm > peak) peak = state.alarm;
      if (state.won || state.over) break;
    }
    return { state: state, won: state.won, over: state.over, ticks: state.tick, peakAlarm: peak, loot: state.lootValue };
  }

  // --- Level solver --------------------------------------------------------
  // Time-aware BFS over (tile, tick mod 60, vault, crack progress,
  // detection, sneak readiness). A path counts only while the alarm stays
  // under 35, so no guard ever leaves patrol and the model is exact:
  // the autopilot replays this very path through the real engine.
  // Detection rates are precomputed per (tile, tick, sneak) so the search
  // is a table lookup per step; nodes keep parent pointers so paths are
  // rebuilt only once, at the end.
  function checkLevel(level) {
    var cycles = level.guards.map(buildCycle);
    // rate[t][sneak][y][x]: alarm gained standing on (x,y) at tick t.
    var rate = [];
    for (var t = 0; t < CYCLE; t++) {
      rate[t] = [ [], [] ];
      for (var sy = 0; sy < level.height; sy++) {
        rate[t][0][sy] = [];
        rate[t][1][sy] = [];
        for (var sx = 0; sx < level.width; sx++) {
          var shadow = level.isShadow(sx, sy);
          var r0 = 0, r1 = 0;
          cycles.forEach(function (cycle) {
            var pose = cycle[t % CYCLE];
            r0 += guardSees(level, pose, sx, sy, false, shadow);
            r1 += guardSees(level, pose, sx, sy, true, shadow);
          });
          level.cameras.forEach(function (cam) {
            r0 += cameraSees(level, cam, t, sx, sy, false, shadow);
            r1 += cameraSees(level, cam, t, sx, sy, true, shadow);
          });
          rate[t][0][sy][sx] = r0;
          rate[t][1][sy][sx] = r1;
        }
      }
    }
    var start = level.start;
    var key = function (s) {
      return s.x + ',' + s.y + ',' + s.t + ',' + (s.vault ? 1 : 0) + ',' + s.crack + ',' + Math.round(s.alarm) + ',' + (s.sneakReady ? 1 : 0);
    };
    var nodes = [{
      x: start.x, y: start.y, t: 0, vault: false, crack: 0,
      alarm: 0, sneakReady: true, parent: -1, action: null,
    }];
    var seen = {};
    seen[key(nodes[0])] = true;
    var dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
    var found = -1;
    var head = 0;
    var explored = 0;
    while (head < nodes.length && found < 0) {
      var s = nodes[head++];
      explored++;
      if (explored > 3000000) break;
      // Goal: vault cracked and standing on the van.
      if (s.vault && s.x === level.exit.x && s.y === level.exit.y) { found = head - 1; break; }
      var actions = [{ dx: 0, dy: 0 }]; // wait
      if (adjacentToVault(level, s.x, s.y) && !s.vault) actions.push({ dx: 0, dy: 0, crack: true });
      dirs.forEach(function (d) {
        actions.push({ dx: d.dx, dy: d.dy });
        actions.push({ dx: d.dx, dy: d.dy, sneak: true });
      });
      for (var a = 0; a < actions.length; a++) {
        var act = actions[a];
        var nx = s.x, ny = s.y, nSneak = s.sneakReady, nCrack = 0, nVault = s.vault;
        if (act.dx || act.dy) {
          if (!level.walkable(s.x + act.dx, s.y + act.dy)) continue;
          if (act.sneak) {
            if (s.sneakReady) { nx = s.x + act.dx; ny = s.y + act.dy; nSneak = false; }
            else { nSneak = true; }
          } else {
            nx = s.x + act.dx; ny = s.y + act.dy; nSneak = true;
          }
        }
        if (act.crack) {
          nCrack = s.crack + 1;
          if (nCrack >= CRACK_TICKS) { nVault = true; nCrack = 0; }
        }
        var nt = (s.t + 1) % CYCLE;
        var r = rate[(s.t + 1) % CYCLE][act.sneak ? 1 : 0][ny][nx];
        var nAlarm = r > 0 ? s.alarm + r : Math.max(0, s.alarm - 0.7);
        if (nVault && !s.vault) nAlarm += 15; // cracking the vault trips the silent alarm.
        if (nAlarm >= SUSPICIOUS_AT) continue;
        var ns = {
          x: nx, y: ny, t: nt, vault: nVault, crack: nCrack,
          alarm: nAlarm, sneakReady: nSneak,
          parent: head - 1, action: act,
        };
        var k = key(ns);
        if (seen[k]) continue;
        seen[k] = true;
        nodes.push(ns);
      }
    }
    if (found < 0) return { pass: false, path: null, explored: explored };
    var path = [];
    var at = found;
    while (nodes[at].parent >= 0) {
      path.unshift(nodes[at].action);
      at = nodes[at].parent;
    }
    var replay = simulateRun(level, path);
    return {
      pass: replay.won,
      path: path,
      ticks: path.length,
      peakAlarm: replay.peakAlarm,
      loot: replay.loot,
      explored: explored,
      replayWon: replay.won,
    };
  }

  var api = {
    TICK_HZ: TICK_HZ, TIME_LIMIT_TICKS: TIME_LIMIT_TICKS,
    CRACK_TICKS: CRACK_TICKS, HACK_TICKS: HACK_TICKS,
    SUSPICIOUS_AT: SUSPICIOUS_AT, ALARM_AT: ALARM_AT, CYCLE: CYCLE,
    mulberry32: mulberry32, buildCycle: buildCycle, cameraAngle: cameraAngle,
    guardSees: guardSees, cameraSees: cameraSees, bfsPath: bfsPath,
    createGame: createGame, resetGame: resetGame, stepGame: stepGame,
    simulateRun: simulateRun, checkLevel: checkLevel,
    adjacentToVault: adjacentToVault, adjacentToPanel: adjacentToPanel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VaultBreakEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
