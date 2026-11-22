// Vault Break — boot, fixed-step loop, click-to-move, screenshot mode
// and wiring. The game ticks at 10 Hz; rendering draws every frame.
// Screenshot mode (?shot=<name>&seed=1) replays the level solver's own
// safe path and freezes, so a headless capture shows the game mid-heist:
//   start  — the title screen
//   play   — mid-heist, loot in hand, a guard getting suspicious
//   vault  — the vault crack in progress
//   escape — the clean getaway (win screen)
(function () {
  'use strict';

  var E = window.VaultBreakEngine;
  var R = window.VaultBreakRender;
  var L = window.VaultBreakLevel;

  var params = new URLSearchParams(window.location.search);
  var shotName = params.get('shot') || '';
  var shotSeconds = shotName && !isNaN(parseFloat(shotName)) ? parseFloat(shotName) : -1;
  var seed = parseInt(params.get('seed') || '7', 10) || 7;
  var rng = E.mulberry32(seed);

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  canvas.width = R.VIEW_W; canvas.height = R.VIEW_H;

  var sfx = new window.VaultBreakAudio.SoundFX();
  var level = L.buildLevel();
  var state = E.createGame(level);
  state.phase = 'title';
  state.particles = [];
  state.peakAlarm = 0;
  state.flashRed = 0;
  state.lastWalkAt = 0;

  var frozen = false;
  var clickPath = null;
  var clickAction = null;

  function spawnParticles(cx, cy, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = rng() * Math.PI * 2, v = (0.4 + rng() * 0.8) * (speed || 60);
      state.particles.push({
        x: cx + (rng() - 0.5) * 10, y: cy + (rng() - 0.5) * 10,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: 2 + rng() * 3, life: 0.6 + rng() * 0.5, maxLife: 1.1,
        color: color,
      });
    }
  }

  function handleEvents(events) {
    events.forEach(function (ev) {
      var at = R.tileCenter(state.player.x, state.player.y);
      if (ev.type === 'loot') {
        sfx.loot();
        spawnParticles(at.x, at.y, '#ffd76a', 16, 70);
      }
      if (ev.type === 'vault') {
        sfx.vault();
        var vc = R.tileCenter(18.5, 1.5);
        spawnParticles(vc.x, vc.y, '#2dd4bf', 26, 90);
      }
      if (ev.type === 'hack') sfx.hack();
      if (ev.type === 'spotted') {
        sfx.suspicious();
        var g = R.tileCenter(state.guards[ev.guard].x, state.guards[ev.guard].y);
        spawnParticles(g.x, g.y, '#f59e0b', 10, 60);
      }
      if (ev.type === 'alert') {
        sfx.alert();
        state.flashRed = 1;
      }
      if (ev.type === 'caught') {
        sfx.caught();
        state.flashRed = 1;
        spawnParticles(at.x, at.y, '#ff5252', 22, 90);
      }
      if (ev.type === 'won') sfx.win();
      if (ev.type === 'timeout') sfx.caught();
    });
    if (state.alarm > state.peakAlarm) state.peakAlarm = state.alarm;
    if (state.flashRed > 0) state.flashRed = Math.max(0, state.flashRed - 0.06);
  }

  function stepOnce(action) {
    var before = { x: state.player.x, y: state.player.y };
    E.stepGame(state, action || {});
    if ((state.player.x !== before.x || state.player.y !== before.y) && action && (action.dx || action.dy) && !action.sneak) {
      state.lastWalkAt = performance.now();
      sfx.step();
    }
    handleEvents(state.events);
  }

  var queued = { wait: false };
  var input = window.VaultBreakInput.attachInput(canvas, {
    onWait: function () { queued.wait = true; },
    onPause: function () {
      if (state.phase === 'playing') state.phase = 'paused';
      else if (state.phase === 'paused') state.phase = 'playing';
      setStatus();
    },
    onRestart: function () { restart(); },
    onMute: function () { sfx.muted = !sfx.muted; setStatus(); },
    onStart: function () {
      if (state.phase === 'title') { state.phase = 'playing'; setStatus(); }
    },
    onTileClick: function (mx, my) {
      if (state.phase !== 'playing' || state.won || state.over) return;
      var tx = Math.floor((mx - 48) / 36), ty = Math.floor((my - 68) / 36);
      if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) return;
      if (level.isVault(tx, ty)) {
        // Clicking the vault walks to the nearest adjacent floor tile,
        // then starts cracking.
        var best = null, bestD = 1e9;
        [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }].forEach(function (d) {
          var ax = tx + d.x, ay = ty + d.y;
          if (!level.walkable(ax, ay)) return;
          var dist = Math.abs(ax - state.player.x) + Math.abs(ay - state.player.y);
          if (dist < bestD) { bestD = dist; best = { x: ax, y: ay }; }
        });
        if (best) {
          clickPath = E.bfsPath(level, state.player.x, state.player.y, best.x, best.y) || [];
          clickAction = 'crack';
        }
        return;
      }
      if (tx === level.panel.x && ty === level.panel.y) {
        var bp = null, bd = 1e9;
        [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }].forEach(function (d) {
          var ax2 = tx + d.x, ay2 = ty + d.y;
          if (!level.walkable(ax2, ay2)) return;
          var dist2 = Math.abs(ax2 - state.player.x) + Math.abs(ay2 - state.player.y);
          if (dist2 < bd) { bd = dist2; bp = { x: ax2, y: ay2 }; }
        });
        if (bp) {
          clickPath = E.bfsPath(level, state.player.x, state.player.y, bp.x, bp.y) || [];
          clickAction = 'hack';
        }
        return;
      }
      if (!level.walkable(tx, ty)) return;
      clickPath = E.bfsPath(level, state.player.x, state.player.y, tx, ty) || [];
      clickAction = null;
    },
  });

  function restart() {
    state = E.createGame(level);
    state.phase = 'playing';
    state.particles = [];
    state.peakAlarm = 0;
    state.flashRed = 0;
    state.lastWalkAt = 0;
    clickPath = null;
    clickAction = null;
    input.clearQueue();
    setStatus();
  }

  function setStatus() {
    var el = document.getElementById('status');
    if (!el) return;
    var msg = state.phase === 'title' ? 'Vault Break. Press Enter to start the heist.'
      : state.won ? 'Clean getaway — $' + state.lootValue.toLocaleString('en-US') + ' in the van.'
      : state.over ? (state.caught ? 'Busted. Press R to run it back.' : 'Time ran out. Press R to try again.')
      : state.phase === 'paused' ? 'Paused.'
      : (state.vaultCracked ? 'Vault open. Reach the yellow van. ' : 'Crack the vault, then reach the van. ')
      + 'Loot $' + state.lootValue.toLocaleString('en-US') + ' · Alarm ' + Math.round(state.alarm)
      + ' · ' + Math.ceil(state.timeLeft / 10) + 's left.';
    el.textContent = msg;
  }

  function wireButton(id, fn) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', fn);
  }
  wireButton('btn-start', function () { if (state.phase === 'title') { state.phase = 'playing'; setStatus(); } });
  wireButton('btn-pause', function () {
    if (state.phase === 'playing') state.phase = 'paused';
    else if (state.phase === 'paused') state.phase = 'playing';
    setStatus();
  });
  wireButton('btn-restart', restart);
  wireButton('btn-sound', function () { sfx.muted = !sfx.muted; setStatus(); });

  // --- Screenshot mode -----------------------------------------------------
  function runShot() {
    sfx.muted = true;
    state.phase = 'playing';
    var check = E.checkLevel(level);
    if (!check.pass || !check.path) return false;
    var path = check.path;
    var ticks = path.length;
    if (shotName === 'start') {
      state.phase = 'title';
      return true;
    }
    if (shotName === 'play') ticks = Math.floor(path.length * 0.20); // mid-travel, before the crack.
    else if (shotName === 'vault') {
      // Run to the first crack tick, then 15 ticks into the crack.
      var firstCrack = -1;
      for (var i = 0; i < path.length; i++) {
        if (path[i].crack) { firstCrack = i; break; }
      }
      ticks = firstCrack < 0 ? path.length : Math.min(path.length, firstCrack + 15);
    } else if (shotName === 'escape') {
      ticks = path.length; // full run: the win screen.
    } else if (shotSeconds >= 0) {
      ticks = Math.min(Math.round(shotSeconds * 10), path.length);
    }
    for (var j = 0; j < ticks; j++) stepOnce(path[j]);
    return true;
  }

  if (shotName !== '' || shotSeconds >= 0) {
    runShot();
    frozen = true;
    R.drawGame(ctx, state);
    setStatus();
  }

  // --- Main loop: fixed 10 Hz steps, render every frame -------------------
  var STEP = 0.1, last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000; last = ts;
    if (dt > 0.25) dt = 0.25;
    if (!frozen && state.phase === 'playing' && !state.won && !state.over) {
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        var action = input.pollMove();
        var q = input.pollQueue();
        if (q.indexOf('wait') !== -1) action = { dx: 0, dy: 0 };
        // Click-to-move: one tile per tick along the queued path.
        if (!action && clickPath && clickPath.length) {
          var next = clickPath[0];
          var ddx = Math.sign(next.x - state.player.x), ddy = Math.sign(next.y - state.player.y);
          if (ddx === 0 && ddy === 0) { clickPath.shift(); }
          else action = { dx: ddx, dy: ddy };
        }
        if (!action && clickPath && clickPath.length === 0 && clickAction) {
          if (clickAction === 'crack' && E.adjacentToVault(level, state.player.x, state.player.y)) action = { crack: true };
          if (clickAction === 'hack' && E.adjacentToPanel(level, state.player.x, state.player.y)) action = { hack: true };
          if (state.vaultCracked || state.tick >= state.camerasDisabledUntil) clickAction = null;
        }
        // Hold E to crack / hack when standing beside the vault / panel.
        if (input.interactHeld()) {
          action = action || { dx: 0, dy: 0 };
          if (E.adjacentToVault(level, state.player.x, state.player.y) && !state.vaultCracked) action.crack = true;
          else if (E.adjacentToPanel(level, state.player.x, state.player.y)) action.hack = true;
        }
        stepOnce(action);
        state.particles.forEach(function (pt) {
          pt.x += pt.vx * STEP; pt.y += pt.vy * STEP; pt.life -= STEP;
        });
        state.particles = state.particles.filter(function (pt) { return pt.life > 0; });
        if (state.won || state.over) { setStatus(); break; }
      }
    }
    R.drawGame(ctx, state);
  }
  requestAnimationFrame(frame);
  setStatus();

  // Test hooks (the checker and the autopilot use these).
  window.__game = {
    state: function () { return state; },
    step: stepOnce,
    restart: restart,
    checkLevel: function () { return E.checkLevel(level); },
  };
})();
