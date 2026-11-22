// Vault Break — canvas rendering: the bank at night, vision cones on the
// floor, the HUD (loot, alarm, clock, objective) and the title/win/lose
// overlays. Pure canvas 2D, no images, no network.
(function (root) {
  'use strict';

  var VIEW_W = 960, VIEW_H = 600;
  var TILE = 36;
  var OX = 48, OY = 68; // map offset: HUD above, status line below.
  var MAP_W = 24 * TILE, MAP_H = 14 * TILE;

  function tileCenter(x, y) {
    return { x: OX + x * TILE + TILE / 2, y: OY + y * TILE + TILE / 2 };
  }

  function drawCone(ctx, cx, cy, facing, halfAngle, rangePx, color) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rangePx, facing - halfAngle, facing + halfAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawGame(ctx, state) {
    var level = state.level;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    // Night backdrop.
    ctx.fillStyle = '#070a13';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawMap(ctx, state);
    drawCones(ctx, state);
    drawEntities(ctx, state);
    drawHud(ctx, state);
    drawStatus(ctx, state);
    if (state.phase === 'title') drawTitle(ctx, state);
    else if (state.won) drawWin(ctx, state);
    else if (state.over) drawLose(ctx, state);
    else if (state.phase === 'paused') drawPaused(ctx);
    // Alarm vignette: the screen edges burn red as the alarm climbs.
    if (state.alarm > 20 && !state.won && !state.over) {
      var a = Math.min(0.35, (state.alarm - 20) / 200);
      var grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
      grad.addColorStop(0, 'rgba(255,40,40,0)');
      grad.addColorStop(1, 'rgba(255,40,40,' + a + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (state.flashRed > 0) {
      ctx.fillStyle = 'rgba(255,40,40,' + (state.flashRed * 0.25) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  function drawMap(ctx, state) {
    var level = state.level;
    for (var y = 0; y < level.height; y++) {
      for (var x = 0; x < level.width; x++) {
        var t = level.tileAt(x, y);
        var px = OX + x * TILE, py = OY + y * TILE;
        if (t === '#') {
          ctx.fillStyle = '#2b3350';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#3d4a6e';
          ctx.fillRect(px, py, TILE, 5);
          ctx.fillStyle = '#1d2438';
          ctx.fillRect(px, py + TILE - 3, TILE, 3);
          continue;
        }
        // Floor: faint checker, darker in the shadows.
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1a2238' : '#1d2540';
        ctx.fillRect(px, py, TILE, TILE);
        if (t === 'S') {
          ctx.fillStyle = 'rgba(6,10,24,0.55)';
          ctx.fillRect(px, py, TILE, TILE);
        }
        if (t === '+') {
          ctx.fillStyle = '#8a6d2f';
          ctx.fillRect(px, py + TILE - 4, TILE, 4);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
    // Room labels, faint on the floor.
    ctx.fillStyle = 'rgba(180,200,255,0.16)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('V A U L T', OX + 19.5 * TILE, OY + 5.2 * TILE);
    ctx.fillText('L O B B Y', OX + 12 * TILE, OY + 7.5 * TILE);
    ctx.fillText('O F F I C E S', OX + 18 * TILE, OY + 10.6 * TILE);
    ctx.fillText('L O A D I N G   B A Y', OX + 17.5 * TILE, OY + 12.6 * TILE);

    // The vault block: steel door with gold trim and a dial.
    level.vault.forEach(function (v) {
      var px = OX + v.x * TILE, py = OY + v.y * TILE;
      ctx.fillStyle = '#5b6478';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.lineWidth = 1;
    });
    var vc = tileCenter(18.5, 1.5);
    ctx.beginPath();
    ctx.arc(vc.x, vc.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = state.vaultCracked ? '#2dd4bf' : '#d4af37';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(vc.x, vc.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2238';
    ctx.fill();
    if (state.vaultCracked) {
      ctx.fillStyle = '#2dd4bf';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('OPEN', vc.x, vc.y + 26);
    }

    // Getaway van on the exit tile.
    var e = tileCenter(level.exit.x, level.exit.y);
    ctx.fillStyle = '#facc15';
    roundRect(ctx, e.x - 15, e.y - 11, 30, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#1a2238';
    ctx.fillRect(e.x - 15, e.y - 11, 10, 22);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('VAN', e.x + 5, e.y + 3);

    // Security panel: a small wall console.
    var pc = tileCenter(level.panel.x, level.panel.y);
    ctx.fillStyle = '#334155';
    ctx.fillRect(pc.x - 8, pc.y - 8, 16, 16);
    ctx.fillStyle = state.tick < state.camerasDisabledUntil ? '#475569' : '#22c55e';
    ctx.fillRect(pc.x - 4, pc.y - 4, 8, 8);

    // Loot piles.
    state.loot.forEach(function (l) {
      if (l.taken) return;
      var c = tileCenter(l.x, l.y);
      ctx.fillStyle = '#b8860b';
      ctx.beginPath();
      ctx.arc(c.x, c.y - 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(c.x, c.y - 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7c5a00';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('$', c.x, c.y - 1);
    });
  }

  function drawCones(ctx, state) {
    var level = state.level;
    // Camera cones first (green), then guard cones (amber/red).
    if (state.tick >= state.camerasDisabledUntil) {
      level.cameras.forEach(function (cam) {
        var c = tileCenter(cam.x, cam.y);
        var ang = state.level && window.VaultBreakEngine
          ? window.VaultBreakEngine.cameraAngle(cam, state.tick) : cam.base;
        drawCone(ctx, c.x, c.y, ang, 0.52, 6 * TILE, 'rgba(34,197,94,0.13)');
        ctx.strokeStyle = 'rgba(34,197,94,0.35)';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(ang - 0.52) * 6 * TILE, c.y + Math.sin(ang - 0.52) * 6 * TILE);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(ang + 0.52) * 6 * TILE, c.y + Math.sin(ang + 0.52) * 6 * TILE);
        ctx.stroke();
      });
    }
    state.guards.forEach(function (g) {
      var c = tileCenter(g.x, g.y);
      var facing = Math.atan2(g.fy, g.fx);
      var color = g.state === 'chase' ? 'rgba(239,68,68,0.22)'
        : g.state === 'investigate' ? 'rgba(249,115,22,0.20)' : 'rgba(245,158,11,0.15)';
      drawCone(ctx, c.x, c.y, facing, 0.61, 5 * TILE, color);
    });
  }

  function drawEntities(ctx, state) {
    var level = state.level;
    // Cameras: ceiling mounts with a sweeping lens.
    level.cameras.forEach(function (cam) {
      var c = tileCenter(cam.x, cam.y);
      var dark = state.tick < state.camerasDisabledUntil;
      ctx.fillStyle = dark ? '#475569' : '#e2e8f0';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark ? '#334155' : '#22c55e';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Guards: navy uniform, cap, facing wedge, state mark.
    state.guards.forEach(function (g) {
      var c = tileCenter(g.x, g.y);
      var col = g.state === 'chase' ? '#ef4444' : g.state === 'investigate' ? '#f97316' : '#f59e0b';
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      // Facing wedge.
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      var fa = Math.atan2(g.fy, g.fx);
      ctx.arc(c.x, c.y, 13, fa - 0.5, fa + 0.5);
      ctx.closePath();
      ctx.fill();
      // Cap.
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(c.x - 7, c.y - 13, 14, 5);
      // State mark.
      if (g.state !== 'patrol') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.state === 'chase' ? '!' : '?', c.x, c.y - 18);
      }
    });

    // Player: teal hood, mask band, direction tick, sneak = crouched ring.
    var p = state.player;
    var pc = tileCenter(p.x, p.y);
    if (p.sneaking) {
      ctx.strokeStyle = 'rgba(45,212,191,0.7)';
      ctx.beginPath();
      ctx.arc(pc.x, pc.y, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#134e4a';
    ctx.fillRect(pc.x - 8, pc.y - 3, 16, 6);
    ctx.fillStyle = '#ccfbf1';
    ctx.beginPath();
    ctx.arc(pc.x - 3, pc.y - 1, 1.6, 0, Math.PI * 2);
    ctx.arc(pc.x + 3, pc.y - 1, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Crack / hack progress ring above the player.
    var prog = 0, label = '';
    if (state.crackProgress > 0 && !state.vaultCracked) {
      prog = state.crackProgress / 30;
      label = 'CRACKING ' + Math.round(prog * 100) + '%';
    } else if (state.hackProgress > 0) {
      prog = state.hackProgress / 20;
      label = 'HACKING ' + Math.round(prog * 100) + '%';
    }
    if (prog > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(pc.x - 22, pc.y - 30, 44, 8);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(pc.x - 21, pc.y - 29, 42 * prog, 6);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, pc.x, pc.y - 34);
    }

    // Particles (pickups, alerts).
    (state.particles || []).forEach(function (pt) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawHud(ctx, state) {
    ctx.fillStyle = '#0d1226';
    ctx.fillRect(0, 0, VIEW_W, 56);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 56, VIEW_W, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('VAULT BREAK', 16, 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText('the Meridian Bank · one rainy night', 16, 47);

    // Loot.
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('$' + state.lootValue.toLocaleString('en-US'), 300, 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('LOOT  (vault $5,000)', 300, 47);

    // Alarm meter.
    var ax = 470, ay = 16, aw = 200, ah = 16;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(ax, ay, aw, ah);
    var ac = state.alarm < 35 ? '#22c55e' : state.alarm < 100 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = ac;
    ctx.fillRect(ax, ay, aw * (state.alarm / 100), ah);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('ALARM ' + Math.round(state.alarm), ax, ay + 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(state.alarm >= 100 ? 'FULL ALARM — RUN!' : state.alarm >= 35 ? 'suspicious…' : 'undetected', ax + 90, ay + 30);

    // Clock.
    var secs = Math.max(0, Math.ceil(state.timeLeft / 10));
    var mm = Math.floor(secs / 60), ss = secs % 60;
    ctx.fillStyle = secs <= 30 ? '#ef4444' : '#e2e8f0';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(mm + ':' + (ss < 10 ? '0' : '') + ss, VIEW_W - 16, 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('until the police arrive', VIEW_W - 16, 47);
    ctx.textAlign = 'left';

    // Cameras status.
    var dark = state.tick < state.camerasDisabledUntil;
    ctx.fillStyle = dark ? '#475569' : '#22c55e';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(dark ? '● CAMERAS DARK ' + Math.ceil((state.camerasDisabledUntil - state.tick) / 10) + 's' : '● CAMERAS LIVE', 700, 47);
  }

  function drawStatus(ctx, state) {
    ctx.fillStyle = '#0d1226';
    ctx.fillRect(0, VIEW_H - 28, VIEW_W, 28);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    var msg;
    if (state.won) msg = 'Clean getaway. The crew is already counting it.';
    else if (state.over) msg = state.caught ? 'Caught in the act. Press R to run it back.' : 'Time ran out — the police sealed the bank. Press R to try again.';
    else if (state.phase === 'paused') msg = 'Paused — P to resume, R to restart.';
    else if (!state.vaultCracked) msg = 'Grab the loot, crack the vault (hold E beside it), then reach the van. Shift sneaks · E hacks the panel · Space waits.';
    else msg = 'Vault open! Get to the yellow van — and stay out of the cones.';
    ctx.fillText(msg, VIEW_W / 2, VIEW_H - 10);
    ctx.textAlign = 'left';
  }

  function overlay(ctx, title, lines, color) {
    ctx.fillStyle = 'rgba(4,6,14,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(title, VIEW_W / 2, 190);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '16px sans-serif';
    var y = 240;
    lines.forEach(function (ln) { ctx.fillText(ln, VIEW_W / 2, y); y += 26; });
    ctx.textAlign = 'left';
  }

  function drawTitle(ctx, state) {
    overlay(ctx, 'VAULT BREAK', [
      'One crew. One bank. One vault full of gold.',
      'Slip past the guards and the cameras, crack the vault,',
      'and be in the van before the police arrive.',
      '',
      'WASD / arrows — move      Shift — sneak (slow, quiet, hard to spot)',
      'E (hold) — crack the vault · hack the security panel      Space — wait',
      'P — pause      R — restart      M — mute',
      '',
      'Press ENTER to start the heist.',
    ], '#d4af37');
  }

  function drawWin(ctx, state) {
    var secs = Math.max(0, Math.ceil((2400 - state.timeLeft) / 10));
    overlay(ctx, 'CLEAN GETAWAY', [
      'The vault is empty and the van is already three blocks away.',
      'Loot: $' + state.lootValue.toLocaleString('en-US') + '   ·   Time: ' + Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60),
      'Peak alarm: ' + Math.round(state.peakAlarm) + '   ·   Guards outrun: ' + state.guards.length,
      '',
      'Press R to run the heist again.',
    ], '#2dd4bf');
  }

  function drawLose(ctx, state) {
    overlay(ctx, state.caught ? 'BUSTED' : 'TOO SLOW', [
      state.caught ? 'A guard put hands on you mid-heist. The crew left without you.'
        : 'The clock hit zero and the police sealed every exit.',
      'Loot grabbed: $' + state.lootValue.toLocaleString('en-US'),
      '',
      'Press R to run it back.',
    ], '#ef4444');
  }

  function drawPaused(ctx) {
    ctx.fillStyle = 'rgba(4,6,14,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2);
    ctx.textAlign = 'left';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var api = {
    VIEW_W: VIEW_W, VIEW_H: VIEW_H, TILE: TILE,
    tileCenter: tileCenter, drawGame: drawGame,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VaultBreakRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
