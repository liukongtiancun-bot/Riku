import { useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react';
import {
  AudioLines,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  FileAudio2,
  Film,
  Headphones,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import './_group.css';

type MediaKind = 'mp3' | 'video';
type ScreenState = 'idle' | 'loading' | 'ready' | 'processing' | 'complete' | 'error';

const presets = [
  { name: 'さりげなく', value: 28, caption: '自然な厚み' },
  { name: 'バランス', value: 56, caption: 'ほどよい重低音' },
  { name: 'しっかり', value: 82, caption: '深く、力強く' },
];

const bars = [22, 38, 29, 57, 42, 68, 34, 48, 76, 44, 31, 59, 80, 39, 54, 70, 34, 49, 27, 63, 43, 74, 51, 33, 58, 40, 69, 46, 30, 55, 78, 38, 62, 45, 73, 35, 53, 81, 48, 30, 60, 42, 71, 50, 34, 58, 77, 40, 54, 32, 64, 79, 43, 57, 36, 68, 47, 31, 59, 72, 41, 53, 29, 65, 46, 82, 38, 60, 44, 71, 34, 57, 76, 41, 55, 33, 63, 48, 74, 39, 58, 35, 68, 46, 60, 37, 79, 44, 52, 31, 65, 42, 72, 49, 35, 59, 77, 43, 56, 34, 67, 45, 61, 39, 80, 44, 58, 32, 64, 48, 73, 40, 60];

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function classifyFile(file: File): MediaKind | null {
  if (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name)) return 'video';
  if (file.type === 'audio/mpeg' || file.type === 'audio/mp3' || /\.mp3$/i.test(file.name)) return 'mp3';
  return null;
}

export function Improved() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [screen, setScreen] = useState<ScreenState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MediaKind | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [strength, setStrength] = useState(56);
  const [activePreset, setActivePreset] = useState('バランス');
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setScreen('idle');
    setFile(null);
    setKind(null);
    setError('');
    setNotice('');
    setPlaying(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    const nextKind = classifyFile(nextFile);
    const maxSize = nextKind === 'video' ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (!nextKind) {
      setFile(null);
      setKind(null);
      setScreen('error');
      setError('MP3または動画ファイルを選んでください。');
      return;
    }
    if (nextFile.size > maxSize) {
      setFile(null);
      setKind(null);
      setScreen('error');
      setError(nextKind === 'video'
        ? '動画は500MB以下のファイルを選んでください。'
        : 'MP3は50MB以下のファイルを選んでください。');
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setFile(nextFile);
    setKind(nextKind);
    setStrength(56);
    setActivePreset('バランス');
    setError('');
    setNotice('');
    setScreen('loading');
    timerRef.current = setTimeout(() => setScreen('ready'), 1050);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const setPreset = (name: string, value: number) => {
    setActivePreset(name);
    setStrength(value);
  };

  const startProcessing = () => {
    if (screen !== 'ready') return;
    setScreen('processing');
    setNotice('');
    timerRef.current = setTimeout(() => {
      setScreen('complete');
      setNotice('加工プレビューができました。');
    }, 1400);
  };

  return (
    <div className="bassline-v2">
      <style>{`
        .bassline-v2 {
          --ink: #202923;
          --muted: #727b72;
          --line: #d9ded2;
          --paper: #f3f3eb;
          --card: #fbfbf6;
          --green: #315e4c;
          --green-dark: #244636;
          --acid: #d8ee83;
          --orange: #d7764e;
          color: var(--ink);
          min-height: 100dvh;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 93% 7%, rgba(216, 238, 131, .24), transparent 29rem),
            var(--paper);
          font-family: 'DM Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;
        }
        .bassline-v2 *, .bassline-v2 *::before, .bassline-v2 *::after { box-sizing: border-box; }
        .bassline-v2 button, .bassline-v2 input { font: inherit; }
        .bassline-v2 button { cursor: pointer; }
        .b2-frame { width: min(100% - 48px, 1100px); margin: 0 auto; }
        .b2-header { display:flex; align-items:center; justify-content:space-between; padding:24px 0; border-bottom:1px solid rgba(46,69,55,.13); }
        .b2-brand { display:flex; align-items:center; gap:11px; }
        .b2-brand-icon { width:39px; height:39px; border-radius:13px; display:grid; place-items:center; color:#f5f4e8; background:var(--green); }
        .b2-brand-name { font:700 12px/1 'Space Mono', monospace; letter-spacing:.16em; }
        .b2-brand-sub { color:#798278; margin-top:5px; font-size:10px; letter-spacing:.03em; }
        .b2-trust { display:flex; align-items:center; gap:8px; font-size:11px; color:#587261; }
        .b2-trust-icon { width:28px; height:28px; display:grid; place-items:center; border-radius:50%; background:#e3eadb; }
        .b2-main { padding:40px 0 29px; }
        .b2-hero { display:grid; grid-template-columns: .95fr 1.05fr; gap:48px; align-items:center; }
        .b2-kicker { display:flex; align-items:center; gap:9px; color:var(--green); font:700 10px 'Space Mono', monospace; letter-spacing:.1em; }
        .b2-kicker::before { content:''; width:23px; height:2px; background:var(--orange); }
        .b2-title { margin:19px 0 14px; max-width:480px; font-size:clamp(42px, 5.2vw, 70px); line-height:1.1; letter-spacing:-.075em; font-weight:700; }
        .b2-title em { font-style:normal; color:var(--green); white-space:nowrap; }
        .b2-lede { max-width:385px; margin:0; color:#69746a; font-size:14px; line-height:1.9; }
        .b2-points { display:flex; flex-wrap:wrap; gap:9px 16px; margin-top:22px; }
        .b2-point { display:flex; align-items:center; gap:6px; font-size:10px; color:#637166; }
        .b2-point svg { color:#4d7a61; }
        .b2-dropzone { position:relative; overflow:hidden; padding:22px; border:1px solid #ccd6c8; border-radius:24px; background:var(--card); box-shadow:0 17px 48px rgba(39,58,43,.075), inset 0 1px rgba(255,255,255,.85); transition:border-color .2s, transform .2s, background .2s; }
        .b2-dropzone:hover { border-color:#8aa58e; transform:translateY(-2px); }
        .b2-dropzone.is-dragging { border-color:var(--green); background:#f0f6e5; transform:scale(1.01); }
        .b2-dropzone::after { content:''; position:absolute; width:160px; height:160px; border:1px solid rgba(49,94,76,.08); border-radius:50%; right:-77px; top:-88px; pointer-events:none; }
        .b2-drop-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .b2-card-kicker { display:flex; align-items:center; gap:7px; color:#768274; font:700 9px 'Space Mono', monospace; letter-spacing:.08em; }
        .b2-card-kicker svg { color:var(--green); }
        .b2-step { color:#899286; font:10px 'Space Mono', monospace; }
        .b2-empty { text-align:center; padding:19px 5px 2px; }
        .b2-visual { position:relative; display:grid; place-items:center; width:104px; height:104px; margin:0 auto 12px; border-radius:50%; background:#f0f3e8; }
        .b2-disc { display:grid; place-items:center; width:70px; height:70px; border-radius:50%; border:1px solid #d4decf; background:repeating-radial-gradient(circle, #f9faf3 0 7px, #e5ebdc 8px 9px); }
        .b2-disc-core { width:26px; height:26px; display:grid; place-items:center; border:1px solid #d6e0c9; border-radius:50%; background:var(--acid); color:var(--green); }
        .b2-visual-mark { position:absolute; inset:5px; border:1px dashed rgba(49,94,76,.18); border-radius:50%; animation:b2-spin 28s linear infinite; }
        .b2-drop-title { margin:0; font-size:16px; font-weight:700; letter-spacing:-.035em; }
        .b2-drop-help { margin:5px 0 15px; font-size:11px; color:#828a7e; }
        .b2-primary { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:43px; padding:0 18px; border:0; border-radius:12px; color:#f7f6ed; background:var(--green); font-size:12px; font-weight:700; transition:background .18s, transform .18s, box-shadow .18s; box-shadow:0 7px 16px rgba(49,94,76,.17); }
        .b2-primary:hover { background:var(--green-dark); transform:translateY(-1px); box-shadow:0 10px 20px rgba(49,94,76,.22); }
        .b2-primary:active { transform:translateY(0); }
        .b2-primary:focus-visible, .b2-quiet:focus-visible, .b2-preset:focus-visible, .b2-play:focus-visible, .b2-range:focus-visible { outline:3px solid #a3bf57; outline-offset:3px; }
        .b2-filetypes { display:grid; grid-template-columns:1fr 1fr; gap:9px; padding-top:17px; margin-top:18px; border-top:1px solid #e8eae2; text-align:left; }
        .b2-type { display:flex; align-items:flex-start; gap:9px; min-width:0; }
        .b2-type-icon { width:30px; height:30px; flex:none; display:grid; place-items:center; border-radius:9px; color:var(--green); background:#eaf0e3; }
        .b2-type-icon.video { color:#a95638; background:#f7ebe3; }
        .b2-type strong { display:block; font-size:10px; line-height:1.4; }
        .b2-type span { display:block; margin-top:3px; color:#7c8479; font-size:9px; line-height:1.55; }
        .b2-safe-line { display:flex; align-items:flex-start; gap:7px; padding-top:13px; color:#747e73; font-size:9px; line-height:1.6; text-align:left; }
        .b2-safe-line svg { flex:none; margin-top:1px; color:#4d7a61; }
        .b2-error { display:flex; align-items:flex-start; gap:10px; padding:12px 13px; margin-bottom:12px; color:#914f3c; border:1px solid #ebc7b6; border-radius:12px; background:#fbf0e9; text-align:left; }
        .b2-error svg { flex:none; margin-top:1px; }
        .b2-error-text { flex:1; font-size:11px; line-height:1.6; }
        .b2-error-action { border:0; background:none; color:#914f3c; padding:2px; }
        .b2-loading { padding:24px 4px 4px; text-align:center; }
        .b2-loader { width:54px; height:54px; display:grid; place-items:center; margin:7px auto 14px; border-radius:17px; color:var(--green); background:#edf1e5; animation:b2-pulse 1.05s ease-in-out infinite alternate; }
        .b2-loading h2, .b2-ready-title { margin:0; font-size:15px; font-weight:700; }
        .b2-loading p { margin:6px 0 15px; color:#7d867b; font-size:10px; }
        .b2-skeleton { width:min(100%, 280px); height:6px; margin:0 auto; overflow:hidden; border-radius:9px; background:#e8eae2; }
        .b2-skeleton::after { content:''; display:block; width:40%; height:100%; border-radius:inherit; background:var(--green); animation:b2-progress 1.25s ease-in-out infinite; }
        .b2-track-head { display:flex; align-items:center; gap:11px; padding:16px 0 12px; }
        .b2-track-icon { width:39px; height:39px; flex:none; display:grid; place-items:center; border-radius:12px; color:#f7f5eb; background:var(--green); }
        .b2-track-info { min-width:0; flex:1; }
        .b2-track-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:700; }
        .b2-track-meta { margin-top:4px; font-size:9px; color:#7d867b; }
        .b2-quiet { display:inline-flex; align-items:center; gap:6px; border:0; padding:8px; border-radius:9px; background:transparent; color:#69766b; font-size:10px; transition:background .16s; }
        .b2-quiet:hover { background:#eef1e8; }
        .b2-wave-wrap { position:relative; height:76px; overflow:hidden; padding:7px 10px 20px; border:1px solid #e0e5d9; border-radius:12px; background:linear-gradient(180deg,#f5f7ef,#f9faf5); }
        .b2-wave { display:flex; align-items:center; justify-content:space-between; gap:2px; height:100%; }
        .b2-wave span { display:block; flex:1; max-width:4px; min-width:1px; border-radius:4px; background:#91a892; }
        .b2-wave span:nth-child(3n) { background:#d77750; }
        .b2-wave-caption { position:absolute; bottom:5px; left:10px; right:10px; display:flex; justify-content:space-between; color:#879084; font:8px 'Space Mono', monospace; }
        .b2-slider-head { display:flex; justify-content:space-between; align-items:center; margin:16px 0 10px; }
        .b2-slider-label { display:flex; align-items:center; gap:7px; font-size:10px; font-weight:700; }
        .b2-slider-value { color:var(--green); font:700 11px 'Space Mono', monospace; }
        .b2-range { display:block; width:100%; height:5px; margin:0; appearance:none; border-radius:9px; background:linear-gradient(to right, var(--green) 0%, var(--green) var(--range-value), #dfe4d8 var(--range-value), #dfe4d8 100%); }
        .b2-range::-webkit-slider-thumb { appearance:none; width:16px; height:16px; border:3px solid #f8f8f0; border-radius:50%; background:var(--green); box-shadow:0 0 0 1px #7c9a81; }
        .b2-range::-moz-range-thumb { width:11px; height:11px; border:3px solid #f8f8f0; border-radius:50%; background:var(--green); box-shadow:0 0 0 1px #7c9a81; }
        .b2-presets { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:11px; }
        .b2-preset { min-width:0; padding:9px 5px; border:1px solid #e2e5dc; border-radius:10px; color:#606b60; background:#fbfbf6; text-align:center; transition:border-color .16s, background .16s, transform .16s; }
        .b2-preset:hover { border-color:#9cad8d; transform:translateY(-1px); }
        .b2-preset.active { border-color:#8da17b; background:#edf2e3; color:#315e4c; }
        .b2-preset strong { display:block; font-size:10px; }
        .b2-preset span { display:block; margin-top:3px; font-size:8px; opacity:.75; }
        .b2-processing { display:flex; align-items:center; gap:9px; width:100%; min-height:41px; margin-top:14px; padding:0 13px; border:1px solid #dce3d6; border-radius:11px; color:#42634d; background:#edf3e7; font-size:10px; font-weight:700; }
        .b2-processing svg { animation:b2-spin 1.3s linear infinite; }
        .b2-processing-track { height:4px; overflow:hidden; flex:1; border-radius:9px; background:#d9e4d1; }
        .b2-processing-track::after { content:''; display:block; width:40%; height:100%; border-radius:inherit; background:#4f805f; animation:b2-progress 1s ease-in-out infinite; }
        .b2-submit { width:100%; margin-top:14px; }
        .b2-complete { display:flex; align-items:flex-start; gap:9px; margin-top:12px; padding:11px 12px; border:1px solid #cddfc6; border-radius:11px; background:#edf5e8; color:#42634d; text-align:left; }
        .b2-complete svg { flex:none; margin-top:1px; }
        .b2-complete strong { display:block; font-size:10px; }
        .b2-complete span { display:block; margin-top:3px; color:#718170; font-size:9px; line-height:1.5; }
        .b2-steps { display:grid; grid-template-columns:repeat(3,1fr); margin-top:29px; border-top:1px solid rgba(46,69,55,.15); padding-top:15px; }
        .b2-step-item { display:flex; align-items:center; gap:9px; min-width:0; }
        .b2-step-num { width:23px; height:23px; flex:none; display:grid; place-items:center; border:1px solid #d2dacb; border-radius:50%; color:#54705b; font:9px 'Space Mono', monospace; }
        .b2-step-item span:last-child { color:#647064; font-size:9px; }
        .b2-footer { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 0 24px; color:#7f887c; font-size:9px; }
        .b2-footer-note { display:flex; align-items:center; gap:6px; }
        .b2-footer-note svg { color:#65806a; }
        .b2-mini-label { color:#879184; font:8px 'Space Mono', monospace; letter-spacing:.09em; }
        @keyframes b2-spin { to { transform:rotate(360deg); } }
        @keyframes b2-pulse { to { transform:scale(1.06); opacity:.72; } }
        @keyframes b2-progress { 0% { transform:translateX(-110%); } 100% { transform:translateX(270%); } }
        @media (max-width:760px) {
          .b2-frame { width:min(100% - 36px, 520px); }
          .b2-header { padding:18px 0; }
          .b2-brand-icon { width:35px; height:35px; }
          .b2-trust { max-width:150px; font-size:9px; line-height:1.45; }
          .b2-trust-icon { width:25px; height:25px; flex:none; }
          .b2-main { padding:25px 0 22px; }
          .b2-hero { grid-template-columns:1fr; gap:24px; align-items:start; }
          .b2-title { margin:13px 0 9px; font-size:clamp(39px, 11vw, 54px); }
          .b2-lede { max-width:440px; font-size:12px; line-height:1.8; }
          .b2-points { margin-top:13px; gap:7px 12px; }
          .b2-point { font-size:9px; }
          .b2-dropzone { padding:17px; border-radius:20px; }
          .b2-empty { padding-top:14px; }
          .b2-visual { width:86px; height:86px; margin-bottom:9px; }
          .b2-disc { width:60px; height:60px; }
          .b2-drop-title { font-size:14px; }
          .b2-drop-help { margin-bottom:12px; font-size:10px; }
          .b2-filetypes { padding-top:13px; margin-top:14px; gap:7px; }
          .b2-type { gap:7px; }
          .b2-type-icon { width:27px; height:27px; }
          .b2-type strong { font-size:9px; }
          .b2-type span { font-size:8px; }
          .b2-safe-line { font-size:8px; }
          .b2-steps { margin-top:23px; gap:6px; padding-top:13px; }
          .b2-step-item { gap:6px; }
          .b2-step-num { width:20px; height:20px; font-size:8px; }
          .b2-step-item span:last-child { font-size:8px; }
          .b2-footer { padding-bottom:18px; font-size:8px; }
        }
        @media (max-width:370px) {
          .b2-frame { width:calc(100% - 28px); }
          .b2-trust { max-width:128px; }
          .b2-filetypes { grid-template-columns:1fr; }
          .b2-type { align-items:center; }
          .b2-footer { align-items:flex-start; flex-direction:column; gap:7px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bassline-v2 *, .bassline-v2 *::before, .bassline-v2 *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
        }
      `}</style>
      <header className="b2-frame b2-header">
        <div className="b2-brand" aria-label="BASSLINE">
          <div className="b2-brand-icon"><AudioLines size={20} strokeWidth={2.3} /></div>
          <div>
            <div className="b2-brand-name">BASSLINE</div>
            <div className="b2-brand-sub">いつもの音に、深みを。</div>
          </div>
        </div>
        <div className="b2-trust">
          <span className="b2-trust-icon"><ShieldCheck size={15} /></span>
          <span>MP3は端末内で処理</span>
        </div>
      </header>

      <main className="b2-frame b2-main">
        <div className="b2-hero">
          <section aria-labelledby="b2-heading">
            <div className="b2-kicker">LOW END, MADE SIMPLE</div>
            <h1 className="b2-title" id="b2-heading">いつもの曲に、<br /><em>もっと深い響き。</em></h1>
            <p className="b2-lede">MP3を選ぶだけ。むずかしい編集ソフトは必要ありません。自分の音源を、聴きたい低音に。</p>
            <div className="b2-points">
              <span className="b2-point"><Check size={13} /> 操作はかんたん</span>
              <span className="b2-point"><Check size={13} /> 低音を好みに調整</span>
              <span className="b2-point"><Check size={13} /> エフェクトは端末内</span>
            </div>
          </section>

          <section aria-label="音源を選択">
            <div
              className={`b2-dropzone${dragging ? ' is-dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={onDrop}
              aria-label="MP3または動画をドロップ"
            >
              <div className="b2-drop-head">
                <div className="b2-card-kicker"><SlidersHorizontal size={13} /> YOUR SOUND, YOUR WAY</div>
                <span className="b2-step">01 / 03</span>
              </div>
              {screen === 'loading' ? (
                <div className="b2-loading" role="status" aria-live="polite">
                  <div className="b2-loader"><AudioLines size={24} /></div>
                  <h2>音源を準備しています</h2>
                  <p>{kind === 'video' ? '動画から音声を取り出す準備中' : 'ファイルを読み込んでいます'}</p>
                  <div className="b2-skeleton" />
                </div>
              ) : screen === 'ready' || screen === 'processing' || screen === 'complete' ? (
                <div>
                  <div className="b2-track-head">
                    <div className="b2-track-icon">{kind === 'video' ? <Film size={19} /> : <FileAudio2 size={19} />}</div>
                    <div className="b2-track-info">
                      <div className="b2-track-name" title={file?.name}>{file?.name}</div>
                      <div className="b2-track-meta">{kind === 'video' ? '動画から抽出' : 'MP3'} · {file ? formatBytes(file.size) : ''}</div>
                    </div>
                    <button type="button" className="b2-quiet" onClick={reset} aria-label="別の音源を選ぶ"><RotateCcw size={13} />変更</button>
                  </div>
                  <div className="b2-wave-wrap" aria-label="音源の波形プレビュー">
                    <div className="b2-wave">{bars.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div>
                    <div className="b2-wave-caption"><span>00:00</span><span>音源プレビュー</span><span>--:--</span></div>
                  </div>
                  <div className="b2-slider-head">
                    <div className="b2-slider-label"><AudioLines size={14} /> 低音の量</div>
                    <span className="b2-slider-value">{strength}%</span>
                  </div>
                  <input
                    className="b2-range"
                    type="range"
                    min="0"
                    max="100"
                    value={strength}
                    aria-label="低音の量"
                    aria-valuetext={`${strength}%`}
                    onChange={(event) => {
                      setStrength(Number(event.target.value));
                      setActivePreset('');
                    }}
                    style={{ '--range-value': `${strength}%` } as CSSProperties}
                  />
                  <div className="b2-presets" aria-label="低音プリセット">
                    {presets.map((preset) => (
                      <button
                        type="button"
                        key={preset.name}
                        className={`b2-preset${activePreset === preset.name ? ' active' : ''}`}
                        aria-pressed={activePreset === preset.name}
                        onClick={() => setPreset(preset.name, preset.value)}
                      >
                        <strong>{preset.name}</strong><span>{preset.caption}</span>
                      </button>
                    ))}
                  </div>
                  {screen === 'processing' ? (
                    <div className="b2-processing" role="status" aria-live="polite">
                      <AudioLines size={14} /> 低音を整えています
                      <span className="b2-processing-track" />
                    </div>
                  ) : screen === 'complete' ? (
                    <div className="b2-complete" role="status" aria-live="polite">
                      <BadgeCheck size={16} />
                      <div><strong>{notice}</strong><span>これは操作感を確認するためのプレビューです。音声の書き出しは接続されていません。</span></div>
                    </div>
                  ) : (
                    <button type="button" className="b2-primary b2-submit" onClick={startProcessing}>
                      <Zap size={15} /> 低音を整える <ChevronRight size={15} />
                    </button>
                  )}
                  {screen === 'complete' && (
                    <button type="button" className="b2-quiet" onClick={() => setPlaying(!playing)} aria-label={playing ? '試聴を一時停止' : '試聴する'}>
                      {playing ? <Pause size={14} /> : <Play size={14} fill="currentColor" />} {playing ? '一時停止' : '試聴する'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="b2-empty">
                  <div className="b2-visual" aria-hidden="true">
                    <div className="b2-visual-mark" />
                    <div className="b2-disc"><div className="b2-disc-core"><AudioLines size={14} /></div></div>
                  </div>
                  <h2 className="b2-drop-title">{dragging ? 'ここにドロップ' : '音源を選んで始める'}</h2>
                  <p className="b2-drop-help">ファイルをここにドロップ、または選択</p>
                  <input ref={inputRef} className="b2-file-input" type="file" accept=".mp3,audio/mpeg,audio/mp3,video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv" onChange={handleInput} aria-label="MP3または動画を選ぶ" style={{ display: 'none' }} />
                  {screen === 'error' && (
                    <div className="b2-error" role="alert">
                      <CircleAlert size={16} />
                      <span className="b2-error-text">{error}</span>
                      <button type="button" className="b2-error-action" onClick={() => { setScreen('idle'); setError(''); }} aria-label="エラーを閉じる"><X size={14} /></button>
                    </div>
                  )}
                  <button type="button" className="b2-primary" onClick={() => inputRef.current?.click()}>
                    <Upload size={15} /> ファイルを選ぶ
                  </button>
                  <div className="b2-filetypes">
                    <div className="b2-type">
                      <div className="b2-type-icon"><FileAudio2 size={15} /></div>
                      <div><strong>MP3 · 50MBまで</strong><span>アップロードなし<br />端末内で処理します</span></div>
                    </div>
                    <div className="b2-type">
                      <div className="b2-type-icon video"><Film size={15} /></div>
                      <div><strong>動画 · 500MBまで</strong><span>音声抽出のため一時送信<br />抽出後すぐに削除します</span></div>
                    </div>
                  </div>
                  <div className="b2-safe-line"><LockKeyhole size={12} /> 音声エフェクトは端末内で適用。動画は音声抽出後に削除します。</div>
                </div>
              )}
            </div>
          </section>
        </div>

        <nav className="b2-steps" aria-label="使い方">
          <div className="b2-step-item"><span className="b2-step-num">01</span><span>音源を選ぶ</span></div>
          <div className="b2-step-item"><span className="b2-step-num">02</span><span>低音を調整</span></div>
          <div className="b2-step-item"><span className="b2-step-num">03</span><span>聴いて仕上げる</span></div>
        </nav>
      </main>

      <footer className="b2-frame b2-footer">
        <span className="b2-footer-note"><Headphones size={13} /> 自分の音源を、好きな響きで。</span>
        <span className="b2-mini-label">MADE FOR LISTENING</span>
      </footer>
    </div>
  );
}
