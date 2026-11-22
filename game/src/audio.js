// Vault Break — tiny WebAudio sound effects, no audio files.
// Everything is a short oscillator blip; muted in screenshot mode.
(function (root) {
  'use strict';

  function SoundFX() {
    this.muted = false;
    this.ctx = null;
  }

  SoundFX.prototype.ensure = function () {
    if (!this.ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = AC ? new AC() : null;
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  };

  SoundFX.prototype.blip = function (freq, dur, type, vol, slideTo) {
    if (this.muted) return;
    var ctx = this.ensure();
    if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  SoundFX.prototype.step = function () { this.blip(180, 0.05, 'triangle', 0.03); };
  SoundFX.prototype.loot = function () { this.blip(880, 0.12, 'sine', 0.09, 1320); };
  SoundFX.prototype.vault = function () {
    this.blip(220, 0.25, 'square', 0.06, 440);
    var self = this;
    setTimeout(function () { self.blip(660, 0.3, 'sine', 0.09, 990); }, 120);
  };
  SoundFX.prototype.hack = function () { this.blip(1200, 0.1, 'square', 0.05, 600); };
  SoundFX.prototype.suspicious = function () { this.blip(440, 0.15, 'sawtooth', 0.05, 330); };
  SoundFX.prototype.alert = function () {
    this.blip(520, 0.2, 'sawtooth', 0.08, 780);
    var self = this;
    setTimeout(function () { self.blip(520, 0.2, 'sawtooth', 0.08, 780); }, 220);
  };
  SoundFX.prototype.caught = function () { this.blip(300, 0.5, 'sawtooth', 0.1, 90); };
  SoundFX.prototype.win = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) {
      setTimeout(function () { self.blip(f, 0.25, 'sine', 0.09); }, i * 130);
    });
  };

  var api = { SoundFX: SoundFX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VaultBreakAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
