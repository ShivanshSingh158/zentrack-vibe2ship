/**
 * @file GaplessPlayer.ts
 * @module src/services/audio/GaplessPlayer
 *
 * Real-time, gapless audio buffer player using the Web Audio API.
 *
 * ## Why not <audio> tag?
 * The HTML <audio> tag has a ~50ms initialization gap when swapping src
 * attributes between sentences. GaplessPlayer uses AudioContext scheduling
 * to queue AudioBufferSourceNodes back-to-back with zero gap.
 *
 * ## Barge-in (Interruption)
 * Call flush() at any time to instantly stop playback and clear the queue.
 * This is called by VoiceContext when the VAD detects the user speaking
 * while the AI is talking.
 *
 * ## Bug Fixes (v2)
 * - Bug 1: isPumping is now reset inside flush() so enqueue() after a
 *   barge-in correctly starts playback of the next response.
 * - Bug 2: onSpeakingEnd now uses a pendingSourceCount to avoid firing
 *   between consecutive sentence buffers (mid-queue false-end).
 *
 * ## Usage
 * const player = new GaplessPlayer();
 * await player.init(); // call once after user gesture
 * await player.enqueue(base64AudioString);  // queue a sentence
 * player.flush(); // interrupt mid-sentence
 */

export class GaplessPlayer {
  private ctx: AudioContext | null = null;
  private queue: (ArrayBuffer | AudioBuffer)[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextScheduledTime = 0;

  // Bug 2 fix: track ALL scheduled sources, not just the current one.
  // onSpeakingEnd only fires when this reaches 0 AND queue is empty.
  private pendingSourceCount = 0;

  // Callbacks for UI state sync
  public onSpeakingStart: (() => void) | null = null;
  public onSpeakingEnd: (() => void) | null = null;

  /** Initialize the AudioContext. Must be called after a user gesture. */
  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 22050 });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /**
   * Decode and enqueue a base64-encoded audio chunk for gapless playback.
   * Playback starts automatically when the first chunk is enqueued.
   */
  async enqueue(base64: string): Promise<void> {
    if (!this.ctx) await this.init();

    // FIX: Browser autoplay policy can suspend AudioContext after inactivity.
    // Without resuming, audio decodes successfully but plays silently or at wrong speed.
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }

    try {
      // Decode base64 → binary → ArrayBuffer
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      this.queue.push(bytes.buffer);
      if (!this.isPumping) this._pump();
    } catch (err) {
      console.error('[GaplessPlayer] Failed to decode audio chunk:', err);
    }
  }

  /**
   * Play raw PCM (16-bit mono) directly from Gemini Live.
   * Converts Int16 PCM into Float32 and schedules it gaplessly.
   */
  async enqueuePcm(base64Pcm: string, sampleRate: number = 24000): Promise<void> {
    if (!this.ctx) await this.init();

    try {
      const binary = atob(base64Pcm);
      const pcmLength = binary.length / 2;

      const float32Array = new Float32Array(pcmLength);
      const dataView = new DataView(new ArrayBuffer(2));

      for (let i = 0; i < pcmLength; i++) {
        dataView.setUint8(0, binary.charCodeAt(i * 2));
        dataView.setUint8(1, binary.charCodeAt(i * 2 + 1));
        // little endian 16-bit
        const int16 = dataView.getInt16(0, true);
        float32Array[i] = int16 / 32768.0;
      }

      const audioBuffer = this.ctx!.createBuffer(1, pcmLength, sampleRate);
      audioBuffer.copyToChannel(float32Array, 0);

      this.queue.push(audioBuffer);
      if (!this.isPumping) this._pump();
    } catch (err) {
      console.error('[GaplessPlayer] Failed to process PCM chunk:', err);
    }
  }

  /** Instantly stop all audio and clear the queue. Used for barge-in. */
  flush(): void {
    this.queue = [];
    this.isPlaying = false;

    // Bug 1 fix: reset isPumping so the next enqueue() call starts _pump() correctly.
    this.isPumping = false;

    // Bug 2 fix: reset pending count — we're throwing away all scheduled work.
    this.pendingSourceCount = 0;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // Already stopped — ignore
      }
      this.currentSource = null;
    }
    this.nextScheduledTime = 0;
    this.onSpeakingEnd?.();
    console.log('[GaplessPlayer] 🔇 Flushed — barge-in or stop detected');
  }

  private isPumping = false;

  /** Internal: drain the queue by scheduling buffers proactively ahead of time. */
  private async _pump(): Promise<void> {
    if (!this.ctx || this.isPumping) return;
    this.isPumping = true;

    try {
      while (this.queue.length > 0) {
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.onSpeakingStart?.();
        }

        const raw = this.queue.shift()!;

        try {
          const audioBuffer = raw instanceof AudioBuffer
            ? raw
            : await this.ctx.decodeAudioData(raw as ArrayBuffer);

          const source = this.ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.ctx.destination);

          // Add a tiny 20ms safety buffer if we are starting from scratch or falling behind
          const startAt = Math.max(this.ctx.currentTime + 0.02, this.nextScheduledTime);
          source.start(startAt);

          this.nextScheduledTime = startAt + audioBuffer.duration;
          this.currentSource = source;

          // Bug 2 fix: increment BEFORE scheduling — decrement only in onended.
          this.pendingSourceCount++;

          source.onended = () => {
            this.pendingSourceCount = Math.max(0, this.pendingSourceCount - 1);

            // Only fire onSpeakingEnd when ALL scheduled buffers have finished
            // AND the queue is empty (no more audio is coming).
            if (this.pendingSourceCount === 0 && this.queue.length === 0) {
              this.isPlaying = false;
              this.onSpeakingEnd?.();
            }
          };
        } catch (err) {
          console.error('[GaplessPlayer] Failed to decode/schedule buffer:', err);
          if (this.pendingSourceCount === 0 && this.queue.length === 0) {
            this.isPlaying = false;
            this.onSpeakingEnd?.();
          }
        }
      }
    } finally {
      this.isPumping = false;
    }
  }

  /** Check if currently playing. */
  get speaking(): boolean {
    return this.isPlaying;
  }

  /** Fully destroy the AudioContext (call on component unmount). */
  destroy(): void {
    this.flush();
    this.ctx?.close();
    this.ctx = null;
  }
}
