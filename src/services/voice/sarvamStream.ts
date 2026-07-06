// src/services/voice/sarvamStream.ts
//
// PRODUCTION FIX: SarvamAudioStreamer previously hardcoded ws://localhost:3001
// which only works when the local voice gateway is running. On Vercel (production),
// the WebSocket connection always fails and the mic button never opens.
//
// NEW STRATEGY:
//   - On localhost: Try the local Sarvam WebSocket gateway first
//   - On production (or if gateway fails): Fall back to Browser SpeechRecognition API
//     which works natively in Chrome/Edge with zero extra infrastructure.

const IS_LOCALHOST = typeof window !== "undefined"
  && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const getBrowserSpeechAPI = () =>
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null;

export class SarvamAudioStreamer {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private recognition: SpeechRecognition | null = null;
  private usingBrowserFallback = false;
  private _isStopped = false;

  public onTranscript?: (text: string, isFinal: boolean) => void;
  public onAudioPlaybackStart?: () => void;
  public onAudioPlaybackEnd?: () => void;
  public onVolumeChange?: (volume: number) => void;

  constructor(private gatewayUrl = "ws://localhost:3001") {}

  public async startListening() {
    this._isStopped = false;

    // On localhost: try gateway first, fall back to browser STT on failure
    if (IS_LOCALHOST) {
      try {
        await this._startWithGateway();
        return;
      } catch (err) {
        console.warn("[SarvamStream] Local gateway unavailable, falling back to browser STT:", err);
      }
    }

    // On production (or gateway failed): use Browser SpeechRecognition
    await this._startWithBrowserSTT();
  }

  private async _startWithGateway() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 }
    });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.gatewayUrl);
      const timeout = setTimeout(() => { ws.close(); reject(new Error("Gateway timeout")); }, 3000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        this._startRecording();
        resolve();
      };
      ws.onerror = (err) => { clearTimeout(timeout); reject(err); };
      ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "transcript" && this.onTranscript) this.onTranscript(data.text, data.isFinal);
          } catch {}
        } else if (event.data instanceof Blob) {
          this._queueAudioPlayback(event.data);
        }
      };
      ws.onclose = () => { if (!this._isStopped) this.stopListening(); };
    });
  }

  private async _startWithBrowserSTT() {
    this.usingBrowserFallback = true;
    const SpeechRecognitionAPI = getBrowserSpeechAPI();

    if (!SpeechRecognitionAPI) {
      throw new Error("Speech recognition not supported. Please use Chrome or Edge.");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._startVolumeMonitor();
    } catch {
      throw new Error("Microphone access denied. Please allow microphone and try again.");
    }

    const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
    this.recognition = recognition;
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { finalText += t + " "; }
        else { interimText = t; }
      }
      if (finalText && this.onTranscript) this.onTranscript(finalText.trim(), true);
      if (interimText && this.onTranscript) this.onTranscript(interimText, false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.warn("[SarvamStream] Browser STT error:", event.error);
    };

    recognition.onend = () => {
      if (!this._isStopped && this.recognition) {
        try { this.recognition.start(); } catch {}
      }
    };

    recognition.start();
    console.log("[SarvamStream] Browser SpeechRecognition started (production mode)");
  }

  private _startVolumeMonitor() {
    if (!this.stream || !this.onVolumeChange) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioContext = new AudioContextClass();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const analyze = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        if (this.onVolumeChange) this.onVolumeChange(Math.min(100, Math.floor((avg / 256) * 200)));
        this.animationFrameId = requestAnimationFrame(analyze);
      };
      analyze();
    } catch (e) {
      console.warn("[SarvamStream] Volume monitor failed (non-critical):", e);
    }
  }

  private _startRecording() {
    if (!this.stream) return;
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: "audio/webm;codecs=opus" });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(e.data);
    };
    this.mediaRecorder.start(250);
    this._startVolumeMonitor();
  }

  private async _queueAudioPlayback(audioBlob: Blob) {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioContext = new AudioContextClass();
    }
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(await audioBlob.arrayBuffer());
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      if (this.onAudioPlaybackStart) this.onAudioPlaybackStart();
      source.onended = () => { if (this.onAudioPlaybackEnd) this.onAudioPlaybackEnd(); };
      source.start();
    } catch (err) {
      console.error("[SarvamStream] Audio playback error:", err);
    }
  }

  public sendTTSChunk(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "tts_chunk", text }));
    }
  }

  public stopListening() {
    this._isStopped = true;
    if (this.recognition) { try { this.recognition.abort(); } catch {} this.recognition = null; }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") { try { this.mediaRecorder.stop(); } catch {} }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) { this.ws.close(); }
    if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    if (this.onVolumeChange) this.onVolumeChange(0);
    this.mediaRecorder = null; this.stream = null; this.ws = null;
    console.log("[SarvamStream] Stopped");
  }
}
