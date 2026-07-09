/**
 * @file NoiseGate.ts
 * @module src/services/audio/NoiseGate
 *
 * Client-side Voice Activity Detection (VAD) using the Web Audio AnalyserNode.
 *
 * ## Purpose
 * Provides real-time ambient energy measurement from the microphone stream.
 * This is used to:
 *   1. Drive the waveform canvas with a live dB readout.
 *   2. Suppress mic auto-restart if the environment is too noisy (prevents
 *      spurious agent triggers from background noise / music / TV).
 *
 * ## How it works
 * - Connects a MediaStream to an AnalyserNode.
 * - Measures RMS (root mean square) energy over the FFT buffer on every
 *   animation frame.
 * - Converts RMS → dBFS (decibels relative to full scale).
 * - Exposes: isAboveGate (boolean), currentDb (number), onLevel (callback).
 *
 * ## Noise Gate Threshold
 * Default: -45 dBFS.
 * - Silence / quiet room: ~-60 to -50 dBFS
 * - Normal speech:        ~-35 to -20 dBFS
 * - Loud background:      ~-45 to -30 dBFS
 *
 * ## Usage
 * ```ts
 * const gate = new NoiseGate();
 * await gate.attach(mediaStream);
 * gate.onLevel = (db, isActive) => { ... };
 * // later:
 * gate.detach();
 * ```
 */

export interface NoiseGateOptions {
  /** dBFS threshold below which signal is considered silence. Default: -45 */
  thresholdDb?: number;
  /** FFT size for AnalyserNode. Must be power of 2. Default: 512 */
  fftSize?: number;
  /**
   * Smoothing time constant for the AnalyserNode (0–1).
   * Higher = smoother but slower. Default: 0.5
   */
  smoothingTimeConstant?: number;
}

export class NoiseGate {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataBuffer: Float32Array | null = null;
  private rafId = 0;
  private thresholdDb: number;
  private _currentDb = -Infinity;
  private _isAboveGate = false;

  /**
   * Callback fired every animation frame with the current dB level and
   * whether the signal is above the noise gate threshold.
   */
  public onLevel: ((db: number, isActive: boolean) => void) | null = null;

  constructor(options: NoiseGateOptions = {}) {
    this.thresholdDb = options.thresholdDb ?? -45;
  }

  /** Attach to a live MediaStream (microphone). */
  async attach(stream: MediaStream, options: NoiseGateOptions = {}): Promise<void> {
    this.detach(); // clean up any previous session

    const thresholdDb = options.thresholdDb ?? this.thresholdDb;
    const fftSize = options.fftSize ?? 512;
    const smoothingTimeConstant = options.smoothingTimeConstant ?? 0.5;

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = smoothingTimeConstant;
    this.dataBuffer = new Float32Array(this.analyser.fftSize);

    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    // Note: NOT connected to destination — we don't want to hear the mic back.

    const measure = () => {
      if (!this.analyser || !this.dataBuffer) return;

      this.analyser.getFloatTimeDomainData(this.dataBuffer);

      // RMS energy
      let sumSquares = 0;
      for (let i = 0; i < this.dataBuffer.length; i++) {
        sumSquares += this.dataBuffer[i] ** 2;
      }
      const rms = Math.sqrt(sumSquares / this.dataBuffer.length);

      // Convert to dBFS — floor at -100 to avoid -Infinity
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;

      this._currentDb = db;
      this._isAboveGate = db > thresholdDb;

      this.onLevel?.(db, this._isAboveGate);

      this.rafId = requestAnimationFrame(measure);
    };

    this.rafId = requestAnimationFrame(measure);
    console.log('[NoiseGate] ✅ Attached to mic stream, threshold:', thresholdDb, 'dBFS');
  }

  /** Detach from the stream and release all Web Audio resources. */
  detach(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    try {
      this.source?.disconnect();
    } catch {}
    this.source = null;

    try {
      this.analyser?.disconnect();
    } catch {}
    this.analyser = null;
    this.dataBuffer = null;

    this.ctx?.close().catch(() => {});
    this.ctx = null;

    this._currentDb = -Infinity;
    this._isAboveGate = false;
    console.log('[NoiseGate] 🔇 Detached');
  }

  /** Current signal level in dBFS. Updated every animation frame. */
  get currentDb(): number {
    return this._currentDb;
  }

  /**
   * Whether the current signal is above the noise gate threshold.
   * `true` = speech / loud sound detected.
   * `false` = silence / noise below threshold.
   */
  get isAboveGate(): boolean {
    return this._isAboveGate;
  }

  /** Update threshold at runtime without reattaching. */
  setThreshold(db: number): void {
    this.thresholdDb = db;
  }
}
