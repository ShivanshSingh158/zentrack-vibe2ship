import { transcribeSpeechSarvam } from "./sarvam";

export class SarvamAudioStreamer {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private _isStopped = false;
  private audioChunks: Blob[] = [];

  public onTranscript?: (text: string, isFinal: boolean) => void;
  public onAudioPlaybackStart?: () => void;
  public onAudioPlaybackEnd?: () => void;
  public onVolumeChange?: (volume: number) => void;

  constructor() {}

  public async startListening() {
    this._isStopped = false;
    this.audioChunks = [];
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._startVolumeMonitor();
    } catch {
      throw new Error("Microphone access denied. Please allow microphone and try again.");
    }

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: "audio/webm" });
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.onstop = async () => {
      if (this.audioChunks.length === 0) return;
      const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
      try {
        if (this.onTranscript) this.onTranscript("Transcribing...", false);
        const text = await transcribeSpeechSarvam(audioBlob);
        if (this.onTranscript && text) this.onTranscript(text, true);
      } catch (err) {
        console.error("Sarvam STT failed:", err);
      }
    };

    this.mediaRecorder.start();
    console.log("[SarvamStream] Started recording for Sarvam API");
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
      console.warn("[SarvamStream] Volume monitor failed:", e);
    }
  }

  public stopListening() {
    this._isStopped = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); }
    if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    if (this.onVolumeChange) this.onVolumeChange(0);
    this.stream = null;
    console.log("[SarvamStream] Stopped recording");
  }
}
