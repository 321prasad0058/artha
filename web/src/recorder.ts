// Microphone recording with a live level meter. Works in Chrome/Android (webm) and Safari/iOS (mp4).
export type Recording = { stop: () => Promise<Blob>; cancel: () => void };

export async function startRecording(onLevel: (v: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start(250);

  const ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  let raf = 0;
  const tick = () => { an.getByteTimeDomainData(buf); let s = 0; for (const x of buf) s += ((x - 128) / 128) ** 2; onLevel(Math.min(1, Math.sqrt(s / buf.length) * 4)); raf = requestAnimationFrame(tick); };
  tick();

  const cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); onLevel(0); };
  return {
    stop: () => new Promise<Blob>(resolve => { rec.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); }; rec.stop(); }),
    cancel: () => { rec.onstop = cleanup; rec.stop(); },
  };
}
