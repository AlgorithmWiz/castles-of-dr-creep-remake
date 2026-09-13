export class CastleAudio {
  constructor() {
    this.enabled = false;
    this.volume = 0.3;
    this.context = null;
    this.drone = null;
  }
  enable(enabled) {
    this.enabled = enabled;
    if (enabled) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context ||= new AudioContext();
      this.context.resume().catch(() => {});
      if (!this.drone) {
        const output = this.context.createGain();
        output.gain.value = 0;
        output.connect(this.context.destination);
        this.drone = output;
        [55, 82.41, 110.2].forEach((f, i) => {
          const o = this.context.createOscillator();
          o.type = "sine";
          o.frequency.value = f;
          const gain = this.context.createGain();
          gain.gain.value = 0.09 / (i + 1);
          o.connect(gain);
          gain.connect(output);
          o.start();
        });
      }
    }
    if (this.drone)
      this.drone.gain.setTargetAtTime(
        enabled ? this.volume : 0,
        this.context.currentTime,
        0.3,
      );
  }
  setVolume(v) {
    this.volume = v;
    if (this.drone)
      this.drone.gain.setTargetAtTime(
        this.enabled ? v : 0,
        this.context.currentTime,
        0.1,
      );
  }
  tone(freq, duration = 0.15, type = "sine", delay = 0, gain = 0.15) {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      start = c.currentTime + delay,
      oscillator = c.createOscillator(),
      amp = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain * this.volume, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(amp);
    amp.connect(c.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }
  play(type, cause) {
    if (type === "key" || type === "win")
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) =>
        this.tone(f, 0.6, "sine", i * 0.12),
      );
    else if (type === "death")
      [146.83, 110, 73.42].forEach((f, i) =>
        this.tone(f, 0.5, "triangle", i * 0.13),
      );
    else if (type === "teleport")
      [220, 440, 880, 1760].forEach((f, i) =>
        this.tone(f, 0.3, "sine", i * 0.06),
      );
    else if (type === "switch") {
      this.tone(180, 0.08, "square", 0, 0.08);
      this.tone(95, 0.13, "triangle", 0.04);
    } else if (type === "room") {
      this.tone(146.83, 0.7, "sine");
      this.tone(220, 0.9, "sine", 0.12);
    } else if (type === "monster") {
      if (cause === "lightning")
        [880, 113, 660, 73].forEach((f, i) =>
          this.tone(f, 0.12, "sawtooth", i * 0.085, 0.09),
        );
      else if (cause === "ray") {
        this.tone(620, 0.08, "square", 0, 0.07);
        this.tone(65, 0.55, "triangle", 0.1, 0.2);
      } else {
        [150, 110, 65].forEach((f, i) =>
          this.tone(f, 0.22, "triangle", i * 0.18, 0.15),
        );
        this.tone(45, 0.4, "sine", 0.65, 0.3);
      }
    } else if (type === "shot") {
      this.tone(880, 0.09, "sawtooth", 0, 0.06);
      this.tone(220, 0.14, "triangle", 0.04, 0.1);
    } else if (type === "wake") this.tone(58, 0.8, "sawtooth", 0, 0.05);
  }
}
