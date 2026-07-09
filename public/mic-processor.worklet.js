/**
 * mic-processor.worklet.js
 *
 * AudioWorklet processor that runs in the browser's audio rendering thread.
 * - Captures raw float32 microphone samples from the browser
 * - Downsamples from browser native rate (48000Hz) to 16000Hz for Gemini Live
 * - Converts float32 → int16 PCM (little-endian)
 * - Posts 4096-sample chunks (~256ms) to the main thread
 *
 * Registered as: 'mic-processor'
 * Usage:
 *   await audioCtx.audioWorklet.addModule('/mic-processor.worklet.js');
 *   const node = new AudioWorkletNode(audioCtx, 'mic-processor');
 *   node.port.onmessage = (e) => { const pcm = e.data; // Int16Array };
 */

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SIZE = 4096; // samples at 16kHz = ~256ms per chunk

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = []; // accumulator for downsampled int16 samples
    this._phase = 0;   // fractional position for sample-rate conversion
  }

  process(inputs) {
    const inputChannel = inputs[0]?.[0]; // mono channel, float32
    if (!inputChannel || inputChannel.length === 0) return true;

    // Calculate decimation ratio: e.g. 48000 / 16000 = 3
    // sampleRate is a global in AudioWorklet context = the AudioContext's rate
    const ratio = sampleRate / TARGET_SAMPLE_RATE;

    for (let i = 0; i < inputChannel.length; i++) {
      this._phase += 1;
      if (this._phase >= ratio) {
        this._phase -= ratio;
        // Clamp float32 [-1, 1] → int16 [-32768, 32767]
        const clamped = Math.max(-1, Math.min(1, inputChannel[i]));
        this._buffer.push(Math.round(clamped * 32767));
      }
    }

    // Emit complete chunks to the main thread
    while (this._buffer.length >= CHUNK_SIZE) {
      const chunk = new Int16Array(this._buffer.splice(0, CHUNK_SIZE));
      this.port.postMessage(chunk, [chunk.buffer]); // transfer buffer for zero-copy
    }

    return true; // keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
