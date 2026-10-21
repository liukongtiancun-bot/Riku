import lamejs from '@breezystack/lamejs';

type EncodeRequest = {
  type: 'encode';
  channels: number;
  sampleRate: number;
  left: Float32Array;
  right?: Float32Array;
};

self.addEventListener('message', (event: MessageEvent<EncodeRequest>) => {
  const { channels, sampleRate, left, right } = event.data;
  try {
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 192);
    const sampleBlockSize = 1152;
    const mp3Chunks: Uint8Array[] = [];
    const toInt16 = (data: Float32Array, start: number, end: number) => {
      const samples = new Int16Array(end - start);
      for (let index = start; index < end; index += 1) {
        const sample = Math.max(-1, Math.min(1, data[index]));
        samples[index - start] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      return samples;
    };

    for (let offset = 0; offset < left.length; offset += sampleBlockSize) {
      const end = Math.min(offset + sampleBlockSize, left.length);
      const encoded = right
        ? encoder.encodeBuffer(toInt16(left, offset, end), toInt16(right, offset, end))
        : encoder.encodeBuffer(toInt16(left, offset, end));
      if (encoded.length > 0) mp3Chunks.push(encoded);

      if (offset % (sampleBlockSize * 80) === 0) {
        self.postMessage({
          type: 'progress',
          percent: Math.min(99, Math.round((end / left.length) * 100)),
        });
      }
    }

    const flushed = encoder.flush();
    if (flushed.length > 0) mp3Chunks.push(flushed);
    const mp3Parts = mp3Chunks.map((chunk) => {
      const part = new Uint8Array(chunk.byteLength);
      part.set(chunk);
      return part.buffer;
    });
    self.postMessage({
      type: 'complete',
      blob: new Blob(mp3Parts, { type: 'audio/mpeg' }),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'MP3を書き出せませんでした。',
    });
  }
});
