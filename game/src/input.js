// Vault Break — keyboard input: WASD/arrows held to walk tile by tile,
// Shift to sneak, Space to wait a tick, E to interact (hold), P pause,
// R restart, M mute, Enter to start. Also tracks the held keys the
// fixed-step loop polls once per tick.
(function (root) {
  'use strict';

  var MOVE_KEYS = {
    ArrowUp: { dx: 0, dy: -1 }, KeyW: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 }, KeyS: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 }, KeyA: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 }, KeyD: { dx: 1, dy: 0 },
  };

  function attachInput(canvas, hooks) {
    var held = {};
    var queue = [];

    function onKeyDown(e) {
      if (e.code === 'Space') { e.preventDefault(); queue.push('wait'); return; }
      if (e.code === 'Enter') { hooks.onStart(); return; }
      if (e.code === 'KeyP') { hooks.onPause(); return; }
      if (e.code === 'KeyR') { hooks.onRestart(); return; }
      if (e.code === 'KeyM') { hooks.onMute(); return; }
      if (MOVE_KEYS[e.code]) {
        held[e.code] = true;
        e.preventDefault();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') held.Shift = true;
      if (e.code === 'KeyE') held.KeyE = true;
    }

    function onKeyUp(e) {
      delete held[e.code];
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') delete held.Shift;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { held = {}; });

    // Click a floor tile to walk there step by step (BFS path, one tile
    // per tick). Clicking the vault or the panel starts the channel.
    canvas.addEventListener('click', function (e) {
      if (!hooks.onTileClick) return;
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      var mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
      hooks.onTileClick(mx, my);
    });

    return {
      pollMove: function () {
        // Last pressed direction wins; keys are checked in a fixed order
        // so holding two keys is deterministic.
        var order = ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'];
        for (var i = 0; i < order.length; i++) {
          if (held[order[i]]) return { dx: MOVE_KEYS[order[i]].dx, dy: MOVE_KEYS[order[i]].dy, sneak: !!held.Shift };
        }
        return null;
      },
      interactHeld: function () { return !!held.KeyE; },
      sneakHeld: function () { return !!held.Shift; },
      pollQueue: function () {
        var q = queue;
        queue = [];
        return q;
      },
      clearQueue: function () { queue = []; held = {}; },
    };
  }

  var api = { attachInput: attachInput };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VaultBreakInput = api;
})(typeof window !== 'undefined' ? window : globalThis);
