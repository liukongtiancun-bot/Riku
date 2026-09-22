import { createContext, type ChangeEvent, type CSSProperties, type DragEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Check, CircleAlert, Copy, Download, ExternalLink, FileAudio, Headphones, ListMusic, Pause, Play, Repeat2, RotateCcw, Share2, ShieldCheck, Sparkles, Upload, Volume2, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import type { SharedAudio } from '@workspace/api-client-react';
import lamejs from 'lamejs';

type Track = 'original' | 'processed';
type AppStatus = 'idle' | 'ready' | 'processing' | 'error';
type InputKind = 'audio' | 'video';

const presets = [
  { name: 'やさしく', detail: '自然なあたたかさ', amount: 34, color: 'teal' },
  { name: 'しっかり', detail: 'バランスのよい厚み', amount: 62, color: 'amber' },
  { name: 'ずっしり', detail: '迫力のある低音', amount: 86, color: 'coral' },
] as const;

const waveform = [19, 35, 26, 50, 34, 64, 30, 42, 73, 44, 29, 52, 78, 35, 55, 69, 31, 47, 26, 61, 38, 76, 50, 28, 54, 36, 67, 44, 25, 49, 72, 33, 57, 40, 68, 30, 50, 76, 43, 26, 56, 37, 67, 46, 31, 53, 72, 35, 48, 26, 58, 74, 39, 52, 31, 63, 42, 28, 54, 69, 36, 47, 25, 61, 43, 76, 34, 56, 40, 68, 29, 53, 72, 36, 49, 27, 60, 45, 70, 34, 52, 29, 64, 42, 55, 31, 73, 39, 47, 26, 60, 36, 68, 44, 31, 55, 71, 37, 49, 28, 63, 41, 57, 33, 74, 38, 52, 25, 59, 43, 69, 35, 55];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSemitones(semitones: number) {
  if (semitones === 0) return '±0';
  return `${semitones > 0 ? '+' : ''}${semitones}`;
}

function getSharePageUrl(objectPath: string, fileName: string) {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const url = new URL(`${base}share`, window.location.origin);
  url.searchParams.set('file', objectPath);
  url.searchParams.set('name', fileName);
  return url.toString();
}

function getSharedAudioUrl(objectPath: string) {
  return `/api/storage${objectPath}`;
}

function getFileStem(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '');
}

function sanitizeFileStem(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim() || 'bassline';
}

function getInputKind(file: File): InputKind | null {
  const lowerName = file.name.toLowerCase();
  if (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(lowerName)) return 'video';
  if (file.type === 'audio/mpeg' || file.type === 'audio/mp3' || /\.mp3$/i.test(lowerName)) return 'audio';
  return null;
}

function bufferToMp3(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels > 1 ? 2 : 1;
  const encoder = new lamejs.Mp3Encoder(channels, buffer.sampleRate, 192);
  const sampleBlockSize = 1152;
  const left = buffer.getChannelData(0);
  const right = channels === 2 ? buffer.getChannelData(1) : undefined;
  const mp3Data: Int8Array[] = [];

  const toInt16 = (data: Float32Array, start: number, end: number) => {
    const samples = new Int16Array(end - start);
    for (let index = start; index < end; index += 1) {
      const sample = Math.max(-1, Math.min(1, data[index]));
      samples[index - start] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return samples;
  };

  for (let offset = 0; offset < buffer.length; offset += sampleBlockSize) {
    const end = Math.min(offset + sampleBlockSize, buffer.length);
    const encoded = right
      ? encoder.encodeBuffer(toInt16(left, offset, end), toInt16(right, offset, end))
      : encoder.encodeBuffer(toInt16(left, offset, end));
    if (encoded.length > 0) mp3Data.push(encoded);
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Data.push(flushed);
  const mp3Parts = mp3Data.map((chunk) => {
    const part = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(part).set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    return part;
  });
  return new Blob(mp3Parts, { type: 'audio/mpeg' });
}

async function decodeAudioFile(file: File) {
  const audioContext = new AudioContext();
  try {
    return await audioContext.decodeAudioData(await file.arrayBuffer());
  } finally {
    await audioContext.close();
  }
}

function waitForEvent<T extends Event>(target: EventTarget, eventName: string) {
  return new Promise<T>((resolve, reject) => {
    const handleEvent = (event: Event) => {
      cleanup();
      resolve(event as T);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Media event failed: ${eventName}`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, handleEvent);
      target.removeEventListener('error', handleError);
    };
    target.addEventListener(eventName, handleEvent, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });
}

async function extractVideoAudio(file: File) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser does not support audio recording.');
  }

  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);
  const audioContext = new AudioContext();
  let recorder: MediaRecorder | null = null;

  try {
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    video.src = objectUrl;
    video.load();
    await waitForEvent(video, 'loadedmetadata');

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Video duration is unavailable.');
    }

    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    await audioContext.resume();
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    recorder = new MediaRecorder(
      destination.stream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const recordingFinished = new Promise<void>((resolve, reject) => {
      recorder?.addEventListener('stop', () => resolve(), { once: true });
      recorder?.addEventListener('error', () => reject(new Error('Video recording failed.')), { once: true });
    });

    recorder.start(250);
    await video.play();
    await waitForEvent(video, 'ended');
    recorder.requestData();
    recorder.stop();
    await recordingFinished;

    const recordedAudio = new Blob(chunks, {
      type: recorder.mimeType || mimeType || 'audio/webm',
    });
    if (recordedAudio.size === 0) {
      throw new Error('No audio was found in the video.');
    }
    return await audioContext.decodeAudioData(await recordedAudio.arrayBuffer());
  } finally {
    recorder?.stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
    await audioContext.close();
  }
}

async function decodeInputAudio(file: File) {
  return getInputKind(file) === 'video'
    ? extractVideoAudio(file)
    : decodeAudioFile(file);
}

async function enhanceAudio(decoded: AudioBuffer, amount: number, use8D: boolean, cleanAudio: boolean, semitones: number) {
  const channels = decoded.numberOfChannels;
  const pitchRate = Math.pow(2, semitones / 12);
  const tailPaddingSeconds = 0.25;
  const renderedDuration = decoded.duration / pitchRate + tailPaddingSeconds;
  const renderedLength = Math.max(1, Math.ceil(renderedDuration * decoded.sampleRate));
  const offline = new OfflineAudioContext(decoded.numberOfChannels, renderedLength, decoded.sampleRate);
  const bufferSource = offline.createBufferSource();
  bufferSource.buffer = decoded;
  bufferSource.playbackRate.value = pitchRate;
  const clarityCut = offline.createBiquadFilter();
  clarityCut.type = 'peaking';
  clarityCut.frequency.value = 260;
  clarityCut.Q.value = 0.8;
  clarityCut.gain.value = cleanAudio ? -2.2 : 0;
  const clarityPresence = offline.createBiquadFilter();
  clarityPresence.type = 'peaking';
  clarityPresence.frequency.value = 2800;
  clarityPresence.Q.value = 0.7;
  clarityPresence.gain.value = cleanAudio ? 1.4 : 0;
  const clarityAir = offline.createBiquadFilter();
  clarityAir.type = 'highshelf';
  clarityAir.frequency.value = 6800;
  clarityAir.gain.value = cleanAudio ? 2.2 : 0;
  const lowShelf = offline.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 145;
  lowShelf.gain.value = 2 + amount * 0.105;
  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.18;
  const safetyGain = offline.createGain();
  safetyGain.gain.value = 0.86;
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const spatialPanner = offline.createStereoPanner();
  if (use8D) {
    const curveLength = 512;
    const movementCycles = Math.max(1, Math.ceil(renderedDuration / 8));
    const panCurve = new Float32Array(curveLength);
    for (let index = 0; index < curveLength; index += 1) {
      panCurve[index] = Math.sin((index / (curveLength - 1)) * Math.PI * 2 * movementCycles);
    }
    spatialPanner.pan.setValueCurveAtTime(panCurve, 0, renderedDuration);
  } else {
    spatialPanner.pan.value = 0;
  }
  const input = cleanAudio
    ? bufferSource.connect(clarityCut).connect(clarityPresence).connect(clarityAir)
    : bufferSource;
  input.connect(lowShelf).connect(compressor).connect(safetyGain).connect(spatialPanner).connect(limiter).connect(offline.destination);
  bufferSource.start();
  const rendered = await offline.startRendering();
  return bufferToMp3(rendered);
}

function Brand() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-bassline">
      <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9a05d] text-[#152029]">
        <AudioLines size={21} strokeWidth={2.5} />
      </div>
      <div>
        <div className="font-mono-label text-[10px] font-bold tracking-[0.2em] text-[#efa960]">BASSLINE</div>
        <div className="text-[11px] text-[#87979c]">音楽を深く楽しむ場所</div>
      </div>
    </div>
  );
}

function Header({ hasTrack, onReset }: { hasTrack: boolean; onReset: () => void }) {
  return (
    <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10" data-testid="header-main">
      <Brand />
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden items-center gap-2 text-[11px] text-[#87979c] sm:flex" data-testid="status-local">
          <span className="h-1.5 w-1.5 rounded-full bg-[#6fbbb7]" />
            ブラウザ内だけで処理
        </div>
        {hasTrack && (
          <button type="button" onClick={onReset} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-[#9aabad] transition hover:bg-[#1b2831] hover:text-[#f1ece0]" data-testid="button-reset-track">
            <RotateCcw size={14} />
            <span className="hidden sm:inline">最初からやり直す</span>
          </button>
        )}
      </div>
    </header>
  );
}

function BoothGraphic() {
  return (
    <div className="relative mx-auto h-56 w-56 sm:h-64 sm:w-64" aria-hidden="true">
      <div className="booth-orbit absolute inset-0 rounded-full" />
      <div className="absolute inset-[15%] rounded-full border border-[#efaa60]/15" />
      <div className="absolute inset-[29%] rounded-full bg-[#202d35] shadow-[0_0_70px_rgba(232,157,78,0.09)]" />
      <div className="absolute inset-[38%] flex items-center justify-center rounded-full border border-[#efaa60]/30 bg-[#18232b]">
        <div className="flex items-end gap-[3px]">
          {[12, 23, 17, 34, 22, 15, 28].map((height, index) => (
            <span key={index} className="wave-bar block w-[3px] rounded-full bg-[#e9a05d]" style={{ height }} />
          ))}
        </div>
      </div>
      <span className="absolute left-[5%] top-1/2 h-px w-4 bg-[#6fbbb7]/70" />
      <span className="absolute right-[5%] top-1/2 h-px w-4 bg-[#6fbbb7]/70" />
      <span className="absolute left-1/2 top-[5%] h-4 w-px bg-[#e9a05d]/60" />
      <span className="absolute bottom-[5%] left-1/2 h-4 w-px bg-[#e9a05d]/60" />
    </div>
  );
}

function EmptyState({ onFile, isDragging, onDragOver, onDragLeave, onDrop, error }: {
  onFile: (file?: File) => void;
  isDragging: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0]);
  return (
    <main className="mx-auto w-full max-w-[1180px] px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:px-10 lg:pt-20">
      {error && <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#d97962]/30 bg-[#d97962]/[0.08] px-4 py-3 text-sm text-[#e6a293]" role="alert" data-testid="alert-upload-error"><CircleAlert size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      <div className="grid items-center gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <section className="reveal">
          <div className="mb-5 flex items-center gap-3">
            <span className="font-mono-label text-[10px] font-bold text-[#6fbbb7]" data-testid="text-kicker">いつもの音を、もっと深く</span>
            <span className="h-px w-12 bg-[#6fbbb7]/40" />
          </div>
           <h1 className="max-w-[560px] text-[clamp(3.15rem,7vw,6.2rem)] font-semibold leading-[0.92] tracking-[-0.075em] text-[#f1ece0]" data-testid="heading-empty">
             音楽をもっと<br /><span className="text-[#e9a05d]">深く響かせる。</span>
          </h1>
          <p className="mt-7 max-w-[450px] text-base leading-7 text-[#9aabad] sm:text-lg">
            お気に入りのMP3を、もっと深く、もっと心地よく。ブラウザ内で数秒で仕上がります。
          </p>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#73868d]">
            <span className="flex items-center gap-2"><Check size={14} className="text-[#6fbbb7]" /> アップロード不要</span>
            <span className="flex items-center gap-2"><Check size={14} className="text-[#6fbbb7]" /> すぐに試聴</span>
            <span className="flex items-center gap-2"><Check size={14} className="text-[#6fbbb7]" /> 無料で利用</span>
          </div>
        </section>
        <section className="reveal reveal-delay-1">
          <div
            className={`upload-panel group relative flex min-h-[425px] flex-col items-center justify-center overflow-hidden rounded-[2rem] p-7 text-center transition-all duration-300 sm:min-h-[475px] ${isDragging ? 'is-dragging' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            data-testid="dropzone-audio"
          >
            <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative z-10">
              <BoothGraphic />
               <h2 className="mt-3 text-xl font-semibold text-[#f1ece0]" data-testid="heading-upload">MP3 / 動画を入れて始める</h2>
               <p className="mt-2 text-sm text-[#829399]">写真アプリや端末からファイルを選択</p>
               <input ref={inputRef} onChange={handleChange} type="file" accept=".mp3,audio/mpeg,audio/mp3,video/*,.mp4,.mov,.m4v,.webm" className="hidden" data-testid="input-audio-file" />
               <button type="button" onClick={() => inputRef.current?.click()} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#e9a05d] px-5 py-3 text-sm font-bold text-[#17222a] shadow-[0_10px_30px_rgba(225,151,73,0.18)] transition hover:-translate-y-0.5 hover:bg-[#f1b271] active:translate-y-0" data-testid="button-choose-mp3">
                <Upload size={17} />
                 ファイルを選ぶ
              </button>
              <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-[#64777e]">
                 <FileAudio size={13} /> MP3 / 動画 · 50MBまで
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="mt-24 flex items-center gap-5 border-t border-[#afbec1]/10 pt-6 text-xs text-[#64777e] sm:mt-32" data-testid="text-privacy-note">
        <span className="font-mono-label text-[9px] text-[#e9a05d]">01</span>
        <span>曲を選ぶ</span>
        <span className="h-px w-8 bg-[#afbec1]/20" />
        <span className="font-mono-label text-[9px] text-[#e9a05d]">02</span>
        <span>重低音を調整</span>
        <span className="h-px w-8 bg-[#afbec1]/20" />
        <span className="font-mono-label text-[9px] text-[#e9a05d]">03</span>
        <span>保存して楽しむ</span>
      </div>
    </main>
  );
}

function TrackWaveform({ progress, duration }: { progress: number; duration: number }) {
  return (
    <div className="relative mt-8 h-24 overflow-hidden rounded-xl border border-[#afbec1]/10 bg-[#17232b] px-3" data-testid="visual-waveform">
      <div className="absolute inset-y-0 left-0 bg-[#e9a05d]/[0.07]" style={{ width: `${progress}%` }} />
      <div className="relative flex h-full items-center justify-between gap-[2px]">
        {waveform.map((height, index) => (
          <span key={index} className={`block w-full max-w-[5px] rounded-full transition-colors duration-300 ${index / waveform.length * 100 < progress ? 'bg-[#e9a05d]' : 'bg-[#73868d]/50'}`} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="absolute bottom-2 left-3 right-3 flex justify-between font-mono-label text-[8px] text-[#62757b]">
        <span>00:00</span><span>再生ビュー</span><span data-testid="text-waveform-duration">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function PlayerCard({ track, title, subtitle, src, duration, onPlay, isPlaying, currentTime, onSeek, disabled }: {
  track: Track;
  title: string;
  subtitle: string;
  src?: string;
  duration: number;
  onPlay: () => void;
  isPlaying: boolean;
  currentTime: number;
  onSeek: (value: number) => void;
  disabled?: boolean;
}) {
  const progress = duration ? (currentTime / duration) * 100 : 0;
  return (
    <div className={`rounded-[1.5rem] border p-5 transition-colors ${track === 'processed' ? 'border-[#e9a05d]/30 bg-[#1f2c34]' : 'border-[#afbec1]/10 bg-[#19252d]'}`} data-testid={`card-player-${track}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" disabled={disabled} onClick={onPlay} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:scale-105 disabled:opacity-40 ${track === 'processed' ? 'bg-[#e9a05d] text-[#17222a]' : 'bg-[#29414a] text-[#d4e1df]'}`} data-testid={`button-play-${track}`}>
            {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <div>
            <div className="text-sm font-semibold text-[#f1ece0]" data-testid={`text-title-${track}`}>{title}</div>
            <div className="mt-1 text-xs text-[#829399]">{subtitle}</div>
          </div>
        </div>
        <span className={`font-mono-label rounded-md px-2 py-1 text-[9px] ${track === 'processed' ? 'bg-[#e9a05d]/10 text-[#e9a05d]' : 'bg-[#afbec1]/[0.07] text-[#829399]'}`}>{track === 'processed' ? '加工済み' : '元音源'}</span>
      </div>
      <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => onSeek(Number(event.target.value))} disabled={disabled} className="audio-progress mt-5 w-full disabled:opacity-30" style={{ '--progress': `${progress}%` } as CSSProperties} data-testid={`input-seek-${track}`} />
      <div className="mt-2 flex justify-between font-mono-label text-[9px] text-[#64777e]"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
      {src && <audio src={src} preload="metadata" className="hidden" />}
    </div>
  );
}

type AudioPlaybackContextValue = {
  currentTrack: SharedAudio | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  repeat: boolean;
  playTrack: (track: SharedAudio) => Promise<void>;
  seek: (value: number) => void;
  setRepeat: (repeat: boolean) => void;
  stop: () => void;
};

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(null);

function useSharedAudioPlayback() {
  const context = useContext(AudioPlaybackContext);
  if (!context) {
    throw new Error('Shared audio playback must be used inside its provider');
  }
  return context;
}

function SharedAudioPlaybackProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<SharedAudio | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeat] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleMetadata = () => setDuration(audio.duration || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = repeat;
  }, [repeat]);

  const playTrack = useCallback(async (track: SharedAudio) => {
    const audio = audioRef.current;
    if (!audio) return;
    const isSameTrack = currentTrack?.id === track.id;
    if (isSameTrack && !audio.paused) {
      audio.pause();
      return;
    }
    if (!isSameTrack) {
      audio.src = getSharedAudioUrl(track.objectPath);
      audio.load();
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(0);
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [currentTrack?.id]);

  const seek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(value, 0), audio.duration || value);
    setCurrentTime(audio.currentTime);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setCurrentTrack(null);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    if (!currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const mediaSession = navigator.mediaSession;
    mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: 'BASSLINE 公開音源',
      album: 'みんなの編集済み音源',
    });
    const audio = audioRef.current;
    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers expose Media Session but do not support every action.
      }
    };
    setAction('play', () => { void audio?.play(); });
    setAction('pause', () => audio?.pause());
    setAction('seekbackward', (details) => seek(Math.max(0, (audio?.currentTime || 0) - (details.seekOffset || 10))));
    setAction('seekforward', (details) => seek((audio?.currentTime || 0) + (details.seekOffset || 10)));
    return () => {
      try {
        mediaSession.metadata = null;
        mediaSession.setActionHandler('play', null);
        mediaSession.setActionHandler('pause', null);
        mediaSession.setActionHandler('seekbackward', null);
        mediaSession.setActionHandler('seekforward', null);
      } catch {
        // Ignore cleanup errors from unsupported Media Session actions.
      }
    };
  }, [currentTrack, seek]);

  const value = useMemo(() => ({
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    repeat,
    playTrack,
    seek,
    setRepeat,
    stop,
  }), [currentTrack, currentTime, duration, isPlaying, playTrack, repeat, seek, stop]);

  return (
    <AudioPlaybackContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" playsInline className="hidden" aria-hidden="true" />
      {children}
    </AudioPlaybackContext.Provider>
  );
}

function GlobalSharedAudioPlayer() {
  const { currentTrack, isPlaying, currentTime, duration, repeat, playTrack, seek, setRepeat, stop } = useSharedAudioPlayback();
  if (!currentTrack) return null;
  const progress = duration ? (currentTime / duration) * 100 : 0;
  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e9a05d]/25 bg-[#111b22]/[0.97] px-4 py-3 shadow-[0_-12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl" data-testid="global-audio-player">
      <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3">
        <button type="button" onClick={() => void playTrack(currentTrack)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e9a05d] text-[#17222a] transition hover:scale-105" aria-label={isPlaying ? '一時停止' : '再生'} data-testid="button-global-play">
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-[#f1ece0]">{currentTrack.title}</div>
          <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} className="audio-progress mt-1.5 w-full" style={{ '--progress': `${progress}%` } as CSSProperties} aria-label="再生位置" />
        </div>
        <span className="hidden font-mono-label text-[9px] text-[#73868d] sm:inline">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <button type="button" onClick={() => setRepeat(!repeat)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${repeat ? 'bg-[#6fbbb7]/20 text-[#9ed4d0]' : 'bg-[#afbec1]/[0.08] text-[#829399] hover:text-[#f1ece0]'}`} aria-pressed={repeat} aria-label="リピート再生" data-testid="button-global-repeat">
          <Repeat2 size={16} />
        </button>
        <button type="button" onClick={stop} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#73868d] transition hover:bg-[#afbec1]/[0.08] hover:text-[#f1ece0]" aria-label="プレイヤーを閉じる" data-testid="button-global-stop">
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}

function SharedAudioLibrary({ refreshToken }: { refreshToken: number }) {
  const [tracks, setTracks] = useState<SharedAudio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentTrack, isPlaying, playTrack } = useSharedAudioPlayback();

  const loadTracks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/storage/tracks');
      if (!response.ok) throw new Error('list');
      const data = await response.json() as SharedAudio[];
      setTracks(data);
      setError(null);
    } catch {
      setError('公開音源を読み込めませんでした。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks, refreshToken]);

  return (
    <section className="mx-auto w-full max-w-[1180px] px-5 pb-28 pt-5 sm:px-8 lg:px-10" data-testid="section-shared-audio-library">
      <div className="soft-card rounded-[1.5rem] p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono-label text-[10px] font-bold text-[#6fbbb7]">PUBLIC AUDIO LIBRARY</div>
            <h2 className="mt-2 text-xl font-semibold text-[#f1ece0]">みんなの編集済み音源</h2>
            <p className="mt-2 text-sm leading-6 text-[#829399]">公開された音源を、画面を閉じずにバックグラウンドで聴けます。</p>
          </div>
          <ListMusic size={21} className="shrink-0 text-[#e9a05d]" />
        </div>
        {isLoading && <div className="mt-6 rounded-xl border border-[#afbec1]/10 bg-[#17232b]/60 px-4 py-5 text-sm text-[#829399]">公開音源を読み込み中…</div>}
        {!isLoading && error && <div className="mt-6 rounded-xl border border-[#d97962]/30 bg-[#d97962]/[0.08] px-4 py-5 text-sm text-[#e6a293]" role="alert">{error}</div>}
        {!isLoading && !error && tracks.length === 0 && <div className="mt-6 rounded-xl border border-dashed border-[#afbec1]/15 bg-[#17232b]/45 px-4 py-8 text-center text-sm text-[#829399]">まだ公開された音源はありません。加工後に「公開して一覧に追加」から追加できます。</div>}
        {!isLoading && !error && tracks.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {tracks.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <article key={track.id} className={`rounded-xl border p-4 transition ${isCurrent ? 'border-[#e9a05d]/50 bg-[#e9a05d]/[0.07]' : 'border-[#afbec1]/10 bg-[#17232b]/55 hover:border-[#afbec1]/25'}`}>
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => void playTrack(track)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:scale-105 ${isCurrent ? 'bg-[#e9a05d] text-[#17222a]' : 'bg-[#29414a] text-[#d4e1df]'}`} aria-label={`${track.title}を${isCurrent && isPlaying ? '一時停止' : '再生'}`} data-testid={`button-play-shared-${track.id}`}>
                      {isCurrent && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#f1ece0]">{track.title}</div>
                      <div className="mt-1 text-[10px] leading-5 text-[#829399]">重低音 {track.amount}% · キー {formatSemitones(track.semitones)}{track.cleanAudio ? ' · 音質調整' : ''}{track.use8D ? ' · 8D' : ''}</div>
                      <div className="mt-1 font-mono-label text-[9px] text-[#5f7379]">{new Date(track.createdAt).toLocaleDateString('ja-JP')} · {formatBytes(track.fileSize)}</div>
                    </div>
                  </div>
                  <a href={getSharePageUrl(track.objectPath, track.title)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#829399] hover:text-[#dce5e1]"><ExternalLink size={12} /> 共有ページを開く</a>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Controls({ amount, onAmount, activePreset, onPreset, semitones, onSemitones, use8D, onUse8D, cleanAudio, onCleanAudio, onEnhance, isProcessing, hasProcessed }: {
  amount: number;
  onAmount: (amount: number) => void;
  activePreset: number | null;
  onPreset: (amount: number) => void;
  semitones: number;
  onSemitones: (semitones: number) => void;
  use8D: boolean;
  onUse8D: (enabled: boolean) => void;
  cleanAudio: boolean;
  onCleanAudio: (enabled: boolean) => void;
  onEnhance: () => void;
  isProcessing: boolean;
  hasProcessed: boolean;
}) {
  return (
    <div className="soft-card rounded-[1.5rem] p-5 sm:p-6" data-testid="panel-controls">
      <div className="flex items-start justify-between gap-4">
        <div>
            <div className="font-mono-label text-[10px] font-bold text-[#6fbbb7]">重低音シェイパー</div>
            <h2 className="mt-2 text-xl font-semibold text-[#f1ece0]">重低音の強さを調整</h2>
        </div>
           <div className="rounded-lg bg-[#e9a05d]/10 px-3 py-2 text-right">
             <div className="font-mono-label text-[9px] text-[#9aabad]">強さ</div>
             <div className="font-mono-label mt-0.5 text-base font-bold text-[#e9a05d]" data-testid="text-boost-value">{amount}%</div>
        </div>
      </div>
       <p className="mt-3 text-sm leading-6 text-[#829399]">スライダーで重低音の強さを決めてから、加工を開始してください。</p>
       <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#6fbbb7]/20 bg-[#6fbbb7]/[0.06] px-3 py-2.5 text-xs text-[#9ed4d0]" data-testid="status-clipping-protection">
         <ShieldCheck size={15} className="shrink-0" />
         <span className="font-semibold">音割れ防止：自動</span>
         <span className="text-[#6fbbb7]/75">ピークを安全に抑えます</span>
       </div>
       <div className="mt-7">
         <div className="mb-3 flex items-center justify-between">
           <span className="font-mono-label text-[10px] text-[#829399]">キー調整</span>
           <span className="font-mono-label text-sm font-bold text-[#e9a05d]" data-testid="text-key-value">{formatSemitones(semitones)} 半音</span>
         </div>
         <input type="range" min="-12" max="12" step="1" value={semitones} aria-label="キー調整" onChange={(event) => onSemitones(Number(event.target.value))} className="bass-slider w-full" style={{ '--bass-progress': `${((semitones + 12) / 24) * 100}%` } as CSSProperties} data-testid="input-key-shift" />
         <div className="mt-3 flex justify-between font-mono-label text-[9px] text-[#5f7379]"><span>-12</span><span>±0</span><span>+12</span></div>
         <p className="mt-2 text-[10px] leading-5 text-[#73868d]">半音単位で音の高さを変えます。キーを変えると曲の長さも変わります。</p>
       </div>
      <div className="mt-7">
         <div className="mb-3 flex justify-between text-xs text-[#829399]"><span>ほんのり</span><span>迫力重視</span></div>
         <input type="range" min="0" max="100" value={amount} aria-label="重低音の強さ" onChange={(event) => onAmount(Number(event.target.value))} className="bass-slider w-full" style={{ '--bass-progress': `${amount}%` } as CSSProperties} data-testid="input-bass-amount" />
         <div className="mt-3 flex justify-between font-mono-label text-[9px] text-[#5f7379]"><span>0</span><span>50</span><span>100</span></div>
      </div>
      <div className="mt-7">
        <div className="mb-3 flex items-center justify-between">
           <span className="font-mono-label text-[10px] text-[#829399]">かんたんプリセット</span>
           <span className="text-[10px] text-[#5f7379]">ワンタップで試す</span>
        </div>
        <div className="grid gap-2">
          {presets.map((preset) => (
            <button key={preset.name} type="button" onClick={() => onPreset(preset.amount)} className={`preset-button flex items-center justify-between rounded-xl border px-3 py-3 text-left ${activePreset === preset.amount ? 'is-active' : 'border-[#afbec1]/10 bg-[#18242c]'}`} data-testid={`button-preset-${preset.name.toLowerCase().replace(' ', '-')}`}>
              <span className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${preset.color === 'teal' ? 'bg-[#6fbbb7]' : preset.color === 'coral' ? 'bg-[#d97962]' : 'bg-[#e9a05d]'}`} />
                <span><span className="block text-sm font-medium text-[#dce5e1]">{preset.name}</span><span className="mt-0.5 block text-[10px] text-[#73868d]">{preset.detail}</span></span>
              </span>
              <span className="font-mono-label text-[10px] text-[#87979c]">+{preset.amount}%</span>
            </button>
          ))}
        </div>
      </div>
       <button
         type="button"
         onClick={() => onUse8D(!use8D)}
         className={`mt-6 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${use8D ? 'border-[#6fbbb7]/70 bg-[#6fbbb7]/[0.11]' : 'border-[#afbec1]/10 bg-[#18242c] hover:border-[#6fbbb7]/40'}`}
         aria-pressed={use8D}
         data-testid="button-toggle-8d"
       >
         <span className="flex items-center gap-3">
           <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${use8D ? 'bg-[#6fbbb7] text-[#17222a]' : 'bg-[#29414a] text-[#9ed4d0]'}`}><Headphones size={15} /></span>
           <span><span className="block text-sm font-semibold text-[#dce5e1]">8D立体音響</span><span className="mt-0.5 block text-[10px] text-[#73868d]">音が左右をゆっくり移動します</span></span>
         </span>
         <span className={`rounded-full px-2 py-1 font-mono-label text-[9px] ${use8D ? 'bg-[#6fbbb7]/20 text-[#9ed4d0]' : 'bg-[#afbec1]/[0.08] text-[#73868d]'}`}>{use8D ? 'オン' : 'オフ'}</span>
       </button>
       <button
         type="button"
         onClick={() => onCleanAudio(!cleanAudio)}
         className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${cleanAudio ? 'border-[#e9a05d]/70 bg-[#e9a05d]/[0.11]' : 'border-[#afbec1]/10 bg-[#18242c] hover:border-[#e9a05d]/40'}`}
         aria-pressed={cleanAudio}
         data-testid="button-toggle-clean-audio"
       >
         <span className="flex items-center gap-3">
           <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${cleanAudio ? 'bg-[#e9a05d] text-[#17222a]' : 'bg-[#3b3540] text-[#f0bd88]'}`}><Sparkles size={15} /></span>
           <span><span className="block text-sm font-semibold text-[#dce5e1]">音を綺麗にする</span><span className="mt-0.5 block text-[10px] text-[#73868d]">こもりを抑えて、音の輪郭を整えます</span></span>
         </span>
         <span className={`rounded-full px-2 py-1 font-mono-label text-[9px] ${cleanAudio ? 'bg-[#e9a05d]/20 text-[#f0bd88]' : 'bg-[#afbec1]/[0.08] text-[#73868d]'}`}>{cleanAudio ? 'オン' : 'オフ'}</span>
       </button>
      <button type="button" onClick={onEnhance} disabled={isProcessing} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e9a05d] px-4 py-3.5 text-sm font-bold text-[#17222a] transition hover:bg-[#f1b271] disabled:cursor-wait disabled:opacity-70" data-testid="button-enhance-audio">
         {isProcessing ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#17222a]/30 border-t-[#17222a]" /> 重低音を加工中…</> : <><Sparkles size={16} /> {hasProcessed ? 'この設定で再加工' : '重低音をつける'}</>}
      </button>
    </div>
  );
}

function LoadedState({ file, inputKind, originalUrl, processedUrl, outputName, setOutputName, amount, setAmount, activePreset, setActivePreset, semitones, setSemitones, use8D, setUse8D, cleanAudio, setCleanAudio, status, error, shareUrl, isSharing, shareError, onEnhance, onShare, onReset }: {
  file: File;
  inputKind: InputKind;
  originalUrl: string;
  processedUrl?: string;
  outputName: string;
  setOutputName: (name: string) => void;
  amount: number;
  setAmount: (amount: number) => void;
  activePreset: number | null;
  setActivePreset: (amount: number | null) => void;
  semitones: number;
  setSemitones: (semitones: number) => void;
  use8D: boolean;
  setUse8D: (enabled: boolean) => void;
  cleanAudio: boolean;
  setCleanAudio: (enabled: boolean) => void;
  status: AppStatus;
  error: string | null;
  shareUrl?: string;
  isSharing: boolean;
  shareError: string | null;
  onEnhance: () => void;
  onShare: () => void;
  onReset: () => void;
}) {
  const [duration, setDuration] = useState(0);
  const [processedDuration, setProcessedDuration] = useState(0);
  const [playing, setPlaying] = useState<Track | null>(null);
  const [time, setTime] = useState(0);
  const originalAudio = useRef<HTMLAudioElement | null>(null);
  const processedAudio = useRef<HTMLAudioElement | null>(null);
  const isProcessing = status === 'processing';

  useEffect(() => {
    const original = new Audio(originalUrl);
    const processed = processedUrl ? new Audio(processedUrl) : null;
    setProcessedDuration(0);
    originalAudio.current = original;
    processedAudio.current = processed;
    const handleMetadata = () => setDuration(original.duration || 0);
    const handleProcessedMetadata = () => setProcessedDuration(processed?.duration || 0);
     const handleOriginalTime = () => setTime(original.currentTime || 0);
     const handleProcessedTime = () => setTime(processed?.currentTime || 0);
    const handleEnded = () => { setPlaying(null); setTime(0); };
    original.addEventListener('loadedmetadata', handleMetadata);
     original.addEventListener('timeupdate', handleOriginalTime);
    original.addEventListener('ended', handleEnded);
    if (processed) {
      processed.addEventListener('loadedmetadata', handleProcessedMetadata);
       processed.addEventListener('timeupdate', handleProcessedTime);
      processed.addEventListener('ended', handleEnded);
    }
    return () => {
      original.pause();
      processed?.pause();
      original.removeEventListener('loadedmetadata', handleMetadata);
       original.removeEventListener('timeupdate', handleOriginalTime);
      original.removeEventListener('ended', handleEnded);
       processed?.removeEventListener('timeupdate', handleProcessedTime);
      processed?.removeEventListener('ended', handleEnded);
      processed?.removeEventListener('loadedmetadata', handleProcessedMetadata);
    };
   }, [originalUrl, processedUrl]);

  const togglePlay = (track: Track) => {
    const audio = track === 'original' ? originalAudio.current : processedAudio.current;
    if (!audio) return;
    if (playing === track) {
      audio.pause();
      setPlaying(null);
      return;
    }
    originalAudio.current?.pause();
    processedAudio.current?.pause();
    audio.currentTime = time;
    void audio.play().then(() => setPlaying(track)).catch(() => setPlaying(null));
  };

   const seek = (value: number, track: Track) => {
     const activeAudio = track === 'processed' ? processedAudio.current : originalAudio.current;
     const target = Math.min(value, activeAudio?.duration || value);
     if (originalAudio.current) originalAudio.current.currentTime = Math.min(target, originalAudio.current.duration || target);
     if (processedAudio.current) processedAudio.current.currentTime = Math.min(target, processedAudio.current.duration || target);
     setTime(target);
  };

  const download = () => {
    if (!processedUrl) return;
    const link = document.createElement('a');
    link.href = processedUrl;
    link.download = `${sanitizeFileStem(outputName)}.mp3`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <main className="mx-auto w-full max-w-[1180px] px-5 pb-20 pt-7 sm:px-8 sm:pt-12 lg:px-10">
      <div className="reveal flex flex-col justify-between gap-6 border-b border-[#afbec1]/10 pb-7 sm:flex-row sm:items-end">
        <div>
           <div className="mb-4 flex items-center gap-2 font-mono-label text-[10px] font-bold text-[#6fbbb7]"><span className="h-1.5 w-1.5 rounded-full bg-[#6fbbb7]" /> 準備完了</div>
           <h1 className="text-[clamp(2.4rem,5vw,4.6rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#f1ece0]" data-testid="heading-ready">音をもっと<span className="text-[#e9a05d]">響かせる。</span></h1>
           <p className="mt-4 text-sm text-[#829399]">ファイルは端末内にあります。重低音を調整して、違いを聴いてみましょう。</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#afbec1]/10 bg-[#17232b] px-3 py-2.5">
          <FileAudio size={17} className="text-[#e9a05d]" />
           <div className="min-w-0"><div className="max-w-[205px] truncate text-xs font-medium text-[#dce5e1]" data-testid="text-file-name">{file.name}</div><div className="mt-0.5 text-[10px] text-[#6f8389]">{formatBytes(file.size)} · {inputKind === 'video' ? '動画の音声' : 'MP3'}</div></div>
          <Check size={15} className="ml-2 text-[#6fbbb7]" />
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-[#afbec1]/10 bg-[#17232b]/70 p-4" data-testid="panel-output-name">
        <label htmlFor="output-file-name" className="font-mono-label text-[10px] font-bold text-[#6fbbb7]">変換後のファイル名</label>
        <div className="mt-2 flex items-center gap-2">
          <input id="output-file-name" value={outputName} onChange={(event) => setOutputName(event.target.value.replace(/\.mp3$/i, ''))} className="min-w-0 flex-1 rounded-lg border border-[#afbec1]/15 bg-[#111b22] px-3 py-2.5 text-sm text-[#f1ece0] outline-none transition focus:border-[#6fbbb7]/60" placeholder="bassline" data-testid="input-output-file-name" />
          <span className="font-mono-label text-xs text-[#829399]">.mp3</span>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-[#73868d]">保存・公開するときにこの名前が使われます。</p>
      </div>
      {error && <div className="reveal mt-6 flex items-start gap-3 rounded-xl border border-[#d97962]/30 bg-[#d97962]/[0.08] px-4 py-3 text-sm text-[#e6a293]" role="alert" data-testid="alert-processing-error"><CircleAlert size={17} className="mt-0.5 shrink-0" /> <span>{error}</span><button type="button" onClick={onReset} className="ml-auto p-1 text-[#e6a293] hover:text-[#f1ece0]" aria-label="Dismiss error" data-testid="button-dismiss-error"><X size={15} /></button></div>}
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="soft-card reveal reveal-delay-1 rounded-[1.5rem] p-5 sm:p-7" data-testid="panel-listening">
          <div className="flex items-center justify-between">
           <div><div className="font-mono-label text-[10px] text-[#6fbbb7]">試聴スペース</div><h2 className="mt-2 text-xl font-semibold text-[#f1ece0]">保存する前に聴いてみる</h2></div>
            <Headphones size={21} className="text-[#e9a05d]" />
          </div>
           <TrackWaveform progress={(playing === 'processed' ? processedDuration || duration : duration) ? (time / (playing === 'processed' ? processedDuration || duration : duration)) * 100 : 0} duration={playing === 'processed' ? processedDuration || duration : duration} />
           <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <PlayerCard track="original" title="元の音源" subtitle="加工前の音" src={originalUrl} duration={duration} onPlay={() => togglePlay('original')} isPlaying={playing === 'original'} currentTime={playing === 'original' ? time : 0} onSeek={(value) => seek(value, 'original')} />
              <PlayerCard track="processed" title="加工済みバージョン" subtitle={processedUrl ? `重低音 ${amount}% · キー ${formatSemitones(semitones)}${cleanAudio ? ' · 音質調整' : ''}${use8D ? ' · 8D' : ''}` : '加工すると試聴できます'} src={processedUrl} duration={processedDuration || duration} onPlay={() => togglePlay('processed')} isPlaying={playing === 'processed'} currentTime={playing === 'processed' ? time : 0} onSeek={(value) => seek(value, 'processed')} disabled={!processedUrl || isProcessing} />
          </div>
           <div className="mt-6 flex items-center justify-between border-t border-[#afbec1]/10 pt-5">
              <div className="flex items-center gap-2 text-xs text-[#73868d]"><Volume2 size={14} /><span>無理のない音量で試聴してください</span></div>
             <span className="font-mono-label text-[9px] text-[#5f7379]" data-testid="text-duration">{formatTime(playing === 'processed' ? processedDuration || duration : duration)}</span>
          </div>
        </section>
        <section className="reveal reveal-delay-2">
            <Controls amount={amount} onAmount={(value) => { setAmount(value); setActivePreset(null); }} activePreset={activePreset} onPreset={(value) => { setAmount(value); setActivePreset(value); }} semitones={semitones} onSemitones={setSemitones} use8D={use8D} onUse8D={setUse8D} cleanAudio={cleanAudio} onCleanAudio={setCleanAudio} onEnhance={onEnhance} isProcessing={isProcessing} hasProcessed={Boolean(processedUrl)} />
            {processedUrl && !isProcessing && <button type="button" onClick={download} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#6fbbb7]/35 bg-[#6fbbb7]/[0.08] px-4 py-3.5 text-sm font-bold text-[#9ed4d0] transition hover:border-[#6fbbb7]/70 hover:bg-[#6fbbb7]/[0.13]" data-testid="button-download-enhanced"><Download size={17} /> 加工済みMP3を保存</button>}
            {processedUrl && !isProcessing && <button type="button" onClick={onShare} disabled={isSharing || Boolean(shareUrl)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e9a05d]/35 bg-[#e9a05d]/[0.08] px-4 py-3.5 text-sm font-bold text-[#f0bd88] transition hover:border-[#e9a05d]/70 hover:bg-[#e9a05d]/[0.13] disabled:cursor-default disabled:opacity-70" data-testid="button-share-enhanced"><Share2 size={17} /> {isSharing ? '公開中…' : shareUrl ? '公開済み' : '公開して一覧に追加'}</button>}
            {shareUrl && !isSharing && <div className="mt-3 rounded-xl border border-[#6fbbb7]/25 bg-[#172d30]/50 p-3" data-testid="panel-share-link">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-[#9ed4d0]"><Check size={13} /> このリンクを送ると誰でも聴けます</div>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} aria-label="共有リンク" className="min-w-0 flex-1 rounded-lg border border-[#afbec1]/10 bg-[#17232b] px-2.5 py-2 text-[10px] text-[#9aabad] outline-none" data-testid="input-share-link" />
                <button type="button" onClick={() => void navigator.clipboard?.writeText(shareUrl)} className="flex shrink-0 items-center gap-1 rounded-lg bg-[#6fbbb7]/15 px-2.5 py-2 text-[10px] font-semibold text-[#9ed4d0] transition hover:bg-[#6fbbb7]/25" data-testid="button-copy-share-link"><Copy size={13} /> コピー</button>
              </div>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-[10px] text-[#829399] hover:text-[#dce5e1]"><ExternalLink size={12} /> 共有ページを開く</a>
            </div>}
            {shareError && <p className="mt-3 text-xs leading-5 text-[#e6a293]" role="alert" data-testid="text-share-error">{shareError}</p>}
        </section>
      </div>
      <div className="reveal reveal-delay-3 mt-6 grid gap-3 sm:grid-cols-3">
        {[
           { icon: Zap, title: '音に厚みをプラス', body: '低音域を強調し、音がこもりすぎないように整えます。' },
           { icon: Headphones, title: '耳で聴き比べ', body: '元の音と加工後の音を切り替えて確認できます。' },
           { icon: Download, title: '端末に保存', body: '加工結果を保存できます。音源が外部へ送られることはありません。' },
        ].map(({ icon: Icon, title, body }) => <div key={title} className="rounded-xl border border-[#afbec1]/10 bg-[#17232b]/50 p-4"><Icon size={16} className="text-[#e9a05d]" /><div className="mt-3 text-xs font-semibold text-[#dce5e1]">{title}</div><p className="mt-1 text-[11px] leading-5 text-[#71848a]">{body}</p></div>)}
      </div>
    </main>
  );
}

function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [outputName, setOutputName] = useState('bassline');
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [amount, setAmount] = useState(62);
  const [activePreset, setActivePreset] = useState<number | null>(62);
  const [semitones, setSemitones] = useState(0);
  const [use8D, setUse8D] = useState(false);
  const [cleanAudio, setCleanAudio] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string>();
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  const chooseFile = (next?: File) => {
    if (!next) return;
    setError(null);
    const nextInputKind = getInputKind(next);
    if (!nextInputKind) {
      setStatus('error');
       setError('MP3または動画ファイルを選択してください。');
      return;
    }
    if (next.size > 50 * 1024 * 1024) {
      setStatus('error');
       setError('50MBを超えています。より小さいファイルを選ぶと、すばやく処理できます。');
      return;
    }
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    setProcessedUrl(undefined);
    setShareUrl(undefined);
    setShareError(null);
    setOutputName(getFileStem(next.name));
    setAmount(62);
    setActivePreset(62);
    setSemitones(0);
    setUse8D(false);
    setCleanAudio(false);
    setFile(next);
    setStatus('ready');
  };

  const enhance = async () => {
    if (!file || status === 'processing') return;
    setError(null);
    setStatus('processing');
    try {
      const decoded = await decodeInputAudio(file);
      const result = await enhanceAudio(decoded, amount, use8D, cleanAudio, semitones);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
      setProcessedUrl(URL.createObjectURL(result));
      setShareUrl(undefined);
      setShareError(null);
      setStatus('ready');
    } catch {
      setStatus('ready');
       setError('このブラウザで音声を読み込めませんでした。動画に音声があるか確認し、別のファイルをお試しください。');
    }
  };

  const share = async () => {
    if (!processedUrl || isSharing || shareUrl) return;
    setIsSharing(true);
    setShareError(null);
    try {
      const baseName = sanitizeFileStem(outputName || getFileStem(file?.name || 'bassline'));
      const fileName = `${baseName}.mp3`;
      const title = `${baseName}（加工済み）`;
      const audioResponse = await fetch(processedUrl);
      const audioBlob = await audioResponse.blob();
      const response = await fetch('/api/storage/shares/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, size: audioBlob.size, contentType: 'audio/mpeg' }),
      });
      if (!response.ok) throw new Error('request');
      const { uploadURL, objectPath } = await response.json() as { uploadURL: string; objectPath: string };
      const upload = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: audioBlob,
      });
      if (!upload.ok) throw new Error('upload');
      const publishResponse = await fetch('/api/storage/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          fileName,
          objectPath,
          fileSize: audioBlob.size,
          amount,
          semitones,
          use8D,
          cleanAudio,
        }),
      });
      if (!publishResponse.ok) throw new Error('publish');
      const published = await publishResponse.json() as SharedAudio;
      setShareUrl(getSharePageUrl(published.objectPath, published.title));
      setLibraryRefreshToken((value) => value + 1);
    } catch {
      setShareError('音源を公開できませんでした。時間をおいて、もう一度お試しください。');
    } finally {
      setIsSharing(false);
    }
  };

  const reset = () => {
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    setFile(null);
    setProcessedUrl(undefined);
    setShareUrl(undefined);
    setShareError(null);
    setStatus('idle');
    setError(null);
    setAmount(62);
    setActivePreset(62);
    setSemitones(0);
    setUse8D(false);
    setCleanAudio(false);
    setOutputName('bassline');
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="app-shell min-h-[100dvh] text-[#f1ece0]">
      <Header hasTrack={Boolean(file)} onReset={reset} />
       {file && status !== 'error' ? <LoadedState file={file} inputKind={getInputKind(file) || 'audio'} originalUrl={objectUrl} processedUrl={processedUrl} outputName={outputName} setOutputName={setOutputName} amount={amount} setAmount={setAmount} activePreset={activePreset} setActivePreset={setActivePreset} semitones={semitones} setSemitones={setSemitones} use8D={use8D} setUse8D={setUse8D} cleanAudio={cleanAudio} setCleanAudio={setCleanAudio} status={status} error={error} shareUrl={shareUrl} isSharing={isSharing} shareError={shareError} onEnhance={enhance} onShare={share} onReset={reset} /> : <EmptyState onFile={chooseFile} error={error} isDragging={dragging} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} />}
       <SharedAudioLibrary refreshToken={libraryRefreshToken} />
      <footer className="mx-auto flex w-full max-w-[1180px] items-center justify-between border-t border-[#afbec1]/10 px-5 py-6 text-[10px] text-[#5e7178] sm:px-8 lg:px-10" data-testid="footer-main">
         <span className="font-mono-label">BASSLINE / 2024</span>
           <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#6fbbb7]" /> 音声は端末内で処理 · 公開時のみ保存</span>
      </footer>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/share" component={SharedTrackPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function SharedTrackPage() {
  const params = new URLSearchParams(window.location.search);
  const objectPath = params.get('file');
  const title = params.get('name') || '加工済みの音源';
  const isValidPath = Boolean(objectPath && /^\/objects\/uploads\/[a-z0-9-]+$/i.test(objectPath));
  const { currentTrack, isPlaying, repeat, playTrack, setRepeat } = useSharedAudioPlayback();
  const sharedTrack: SharedAudio | null = isValidPath && objectPath ? {
    id: objectPath,
    title,
    fileName: `${title}.mp3`,
    objectPath,
    fileSize: 0,
    amount: 0,
    semitones: 0,
    use8D: false,
    cleanAudio: false,
    createdAt: new Date().toISOString(),
  } : null;
  const isCurrentTrack = sharedTrack ? currentTrack?.id === sharedTrack.id : false;

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-150px)] w-full max-w-[760px] items-center justify-center px-5 py-12 pb-32 sm:px-8">
      <section className="soft-card w-full rounded-[1.75rem] p-6 sm:p-10" data-testid="page-shared-track">
        <div className="mb-8 flex items-center gap-3"><div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9a05d] text-[#152029]"><AudioLines size={21} strokeWidth={2.5} /></div><div><div className="font-mono-label text-[10px] font-bold tracking-[0.2em] text-[#efa960]">BASSLINE</div><div className="text-[11px] text-[#87979c]">共有音源</div></div></div>
         {isValidPath && sharedTrack ? <><div className="mb-2 font-mono-label text-[10px] font-bold text-[#6fbbb7]">SHARED AUDIO</div><h1 className="break-words text-3xl font-semibold tracking-[-0.04em] text-[#f1ece0] sm:text-4xl" data-testid="heading-shared-track">{title}</h1><p className="mt-3 text-sm leading-6 text-[#829399]">この音源はBASSLINEで加工されました。画面を移動しても再生を続けられます。</p><div className="mt-8 rounded-2xl border border-[#e9a05d]/25 bg-[#17232b] p-5"><div className="flex items-center gap-3"><button type="button" onClick={() => void playTrack(sharedTrack)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e9a05d] text-[#17222a] transition hover:scale-105" aria-label={isCurrentTrack && isPlaying ? '一時停止' : '再生'} data-testid="button-play-shared-track">{isCurrentTrack && isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[#f1ece0]">{title}</div><div className="mt-1 text-xs text-[#829399]">バックグラウンド再生に対応</div></div><button type="button" onClick={() => setRepeat(!repeat)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${repeat ? 'bg-[#6fbbb7]/20 text-[#9ed4d0]' : 'bg-[#afbec1]/[0.08] text-[#829399]'}`} aria-pressed={repeat} aria-label="リピート再生" data-testid="button-repeat-shared-track"><Repeat2 size={17} /></button></div></div><p className="mt-5 text-center text-xs text-[#64777e]">リピートをオンにすると曲が終わっても繰り返し再生します</p></> : <><div className="mb-2 font-mono-label text-[10px] font-bold text-[#d97962]">LINK ERROR</div><h1 className="text-3xl font-semibold text-[#f1ece0]">共有音源が見つかりません</h1><p className="mt-3 text-sm leading-6 text-[#829399]">リンクが正しくないか、音源が削除されています。</p></>}
      </section>
    </main>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <SharedAudioPlaybackProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <GlobalSharedAudioPlayer />
    </SharedAudioPlaybackProvider>
  );
}

export default App;
