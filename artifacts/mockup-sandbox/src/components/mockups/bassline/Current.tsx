import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AudioLines, Check, CircleAlert, FileAudio, Upload } from 'lucide-react';
import './_group.css';

function Brand() {
  return (
    <div className="flex items-center gap-3">
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
      {error && <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#d97962]/30 bg-[#d97962]/[0.08] px-4 py-3 text-sm text-[#e6a293]" role="alert"><CircleAlert size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      <div className="grid items-center gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <section className="reveal">
          <div className="mb-5 flex items-center gap-3">
            <span className="font-mono-label text-[10px] font-bold text-[#6fbbb7]">いつもの音を、もっと深く</span>
            <span className="h-px w-12 bg-[#6fbbb7]/40" />
          </div>
          <h1 className="max-w-[560px] text-[clamp(3.15rem,7vw,6.2rem)] font-semibold leading-[0.92] tracking-[-0.075em] text-[#f1ece0]">
            音楽をもっと<br /><span className="text-[#e9a05d]">深く響かせる。</span>
          </h1>
          <p className="mt-7 max-w-[450px] text-base leading-7 text-[#9aabad] sm:text-lg">
            お気に入りのMP3を、もっと深く、もっと心地よく。ブラウザ内で数秒で仕上がります。
          </p>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#73868d]">
            <span className="flex items-center gap-2"><Check size={14} className="text-[#6fbbb7]" /> MP3はアップロード不要</span>
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
          >
            <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative z-10">
              <BoothGraphic />
              <h2 className="mt-3 text-xl font-semibold text-[#f1ece0]">MP3 / 動画を入れて始める</h2>
              <p className="mt-2 text-sm text-[#829399]">写真アプリや端末からファイルを選択</p>
              <input ref={inputRef} onChange={handleChange} type="file" accept=".mp3,audio/mpeg,audio/mp3,video/*,.mp4,.mov,.m4v,.webm" className="hidden" />
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#e9a05d] px-5 py-3 text-sm font-bold text-[#17222a] shadow-[0_10px_30px_rgba(225,151,73,0.18)] transition hover:-translate-y-0.5 hover:bg-[#f1b271] active:translate-y-0">
                <Upload size={17} />
                ファイルを選ぶ
              </button>
              <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-[#64777e]">
                <FileAudio size={13} /> MP3 50MB / 動画 500MBまで
              </div>
              <p className="mt-2 text-[10px] leading-5 text-[#64777e]">動画は音声抽出のため一時アップロードし、処理後に削除します。</p>
            </div>
          </div>
        </section>
      </div>
      <div className="mt-24 flex items-center gap-5 border-t border-[#afbec1]/10 pt-6 text-xs text-[#64777e] sm:mt-32">
        <span className="font-mono-label text-[9px] text-[#e9a05d]">01</span><span>曲を選ぶ</span>
        <span className="h-px w-8 bg-[#afbec1]/20" />
        <span className="font-mono-label text-[9px] text-[#e9a05d]">02</span><span>重低音を調整</span>
        <span className="h-px w-8 bg-[#afbec1]/20" />
        <span className="font-mono-label text-[9px] text-[#e9a05d]">03</span><span>保存して楽しむ</span>
      </div>
    </main>
  );
}

export function Current() {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="app-shell min-h-screen text-[#f1ece0]">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <div className="hidden items-center gap-2 text-[11px] text-[#87979c] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#6fbbb7]" /> MP3は端末内 · 動画は抽出後に削除
        </div>
      </header>
      <EmptyState
        onFile={() => undefined}
        isDragging={dragging}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); }}
        error={null}
      />
    </div>
  );
}
