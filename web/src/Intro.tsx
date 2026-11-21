// The opening: what Artha is, in ten seconds, told by one field of light.
//   1. scattered voices in six scripts      "Over a billion Indians have never typed to an AI."
//   2. they become a voice wave             "They just speak."
//   3. the wave folds into Artha's orb, and structured meaning flies out: who, when, how much, what to do
//   4. the name and the promise             "Bas ishaara kaafi hai."
// Then the orb shrinks to where the app's orb lives and the app takes over.
// One Points mesh, positions blended on the CPU between four shapes; GSAP drives the blend and the words.
import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const N = 2600;
const FRAGMENTS = ['Mehta ji ko bol do', 'అమ్మకి చెప్పు', 'செல்விக்கு சொல்லு', 'दुधवाल्यांना पैसे पाठवा', 'Balwinder nu dasso', 'রিয়াকে বলো', 'khate mein likh do', 'kal 4 baje', 'dhai hazaar', 'Salma apa ko bolo'];
const CHIPS = [
  { k: 'who', t: 'Dr. Pawar · family doctor' },
  { k: 'when', t: 'Sun · 11:30 AM' },
  { k: 'money', t: '₹2,500 · Sharma ji’s khata' },
  { k: 'act', t: 'Message ready in Marathi' },
];

export function shouldShowIntro() {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return true;
  if ([...q.keys()].length) return false;                                   // demo and recording links go straight in
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try { return sessionStorage.getItem('artha.intro') !== 'seen'; } catch { return true; }
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function Intro({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const host = canvasHost.current!, el = root.current!;
    const w = () => host.clientWidth, h = () => host.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w(), h(), false);   // CSS sizes the canvas; we only size the drawing buffer
    host.appendChild(renderer.domElement);
    let lastW = 0, lastH = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w() / h(), 0.1, 100);
    camera.position.set(0, 0, 13);
    const narrow = () => w() < 640;

    // four shapes for the same points
    const cloud = new Float32Array(N * 3), wave = new Float32Array(N * 3), sphere = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seed[i] = Math.random();
      cloud.set([(Math.random() - .5) * 22, (Math.random() - .5) * 12, (Math.random() - .5) * 8], i * 3);
      const strand = i % 3, u = (i / N) * 2 - 1;
      wave.set([u * 9, 0, (strand - 1) * .35], i * 3);
      const y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
      sphere.set([Math.cos(th) * rr * 2.3, y * 2.3, Math.sin(th) * rr * 2.3], i * 3);
    }
    const pos = new Float32Array(cloud);
    const col = new Float32Array(N * 3);
    const cA = new THREE.Color('#5b6cff'), cB = new THREE.Color('#b18cff'), cC = new THREE.Color('#5fd1c4'), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) { tmp.copy(cA).lerp(seed[i] > .5 ? cB : cC, Math.abs(seed[i] - .5) * 1.6); col.set([tmp.r, tmp.g, tmp.b], i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: .11, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    // a soft glow behind the orb
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: dotTexture(), color: '#3f4fff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.z = -1; scene.add(glow);

    const s = { a: 0, b: 0, c: 0, d: 0, amp: 0 };   // cloud→wave, wave→orb, orb burst, exit
    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { mouse.x = (e.clientX / innerWidth - .5); mouse.y = (e.clientY / innerHeight - .5); };
    addEventListener('pointermove', onMove);

    let raf = 0; const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (w() !== lastW || h() !== lastH) { lastW = w(); lastH = h(); renderer.setSize(lastW, lastH, false); camera.aspect = lastW / lastH; camera.updateProjectionMatrix(); }
      const scale = narrow() ? .62 : 1;
      for (let i = 0; i < N; i++) {
        const k = i * 3, sd = seed[i];
        // the wave lives: three strands, a travelling envelope like a voice
        const x = wave[k], env = Math.exp(-((x / 9) ** 2) * 2.2);
        const wy = Math.sin(x * 1.25 - t * 4 + (i % 3) * 1.9) * s.amp * env * (0.6 + .4 * Math.sin(x * .4 + t * 1.3)) + (sd - .5) * .12;
        let px = cloud[k] + Math.sin(t * .3 + sd * 6) * .3, py = cloud[k + 1] + Math.cos(t * .25 + sd * 5) * .3, pz = cloud[k + 2];
        px += (x - px) * s.a; py += (wy - py) * s.a; pz += (wave[k + 2] - pz) * s.a;
        const br = 1 + s.c * (.25 + sd * .5) * (0.5 + .5 * Math.sin(t * 2 + sd * 9));
        px += (sphere[k] * br - px) * s.b; py += (sphere[k + 1] * br - py) * s.b; pz += (sphere[k + 2] * br - pz) * s.b;
        const ex = 1 - s.d * .82;
        pos[k] = px * scale * ex; pos[k + 1] = py * scale * ex - s.d * (narrow() ? 4.2 : 3.4); pos[k + 2] = pz * ex;
      }
      geo.attributes.position.needsUpdate = true;
      points.rotation.y = s.b * t * .25 + mouse.x * .3;
      points.rotation.x = mouse.y * .2;
      glow.position.y = -s.d * (narrow() ? 4.2 : 3.4);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();
    const onResize = () => { renderer.setSize(w(), h(), false); camera.aspect = w() / h(); camera.updateProjectionMatrix(); };
    addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize); ro.observe(host);

    const q = (sel: string) => el.querySelectorAll<HTMLElement>(sel);
    gsap.ticker.lagSmoothing(0);   // the story keeps its real length even when a slow phone drops frames
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    // beat 1: scattered voices
    tl.to(mat, { opacity: .9, duration: 1.2 }, 0)
      .fromTo(q('.frag'), { opacity: 0, y: 12, scale: .96 }, { opacity: (i: number) => .35 + (i % 3) * .2, y: 0, scale: 1, duration: 1, stagger: .07 }, .2)
      .fromTo(q('.b1 .w'), { opacity: 0, y: 18, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .8, stagger: .05 }, .5)
      // beat 2: they just speak (the cloud becomes a voice)
      .to(q('.frag'), { opacity: 0, y: -10, duration: .6, stagger: .03 }, 2.6)
      .to(q('.b1'), { opacity: 0, y: -14, duration: .5 }, 2.7)
      .to(s, { a: 1, duration: 1.6, ease: 'power2.inOut' }, 2.6)
      .to(s, { amp: 1.4, duration: 1.2, ease: 'sine.inOut' }, 2.9)
      .fromTo(q('.b2'), { opacity: 0, scale: .92, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .8 }, 3.2)
      // beat 3: the wave folds into the orb, and meaning comes out
      .to(q('.b2'), { opacity: 0, y: -16, duration: .5 }, 4.9)
      .to(s, { b: 1, duration: 1.4, ease: 'expo.inOut' }, 4.9)
      .to(s, { amp: 0, duration: .8 }, 5)
      .to(glow.material, { opacity: .55, duration: 1.2 }, 5.4)
      .to(s, { c: 1, duration: .5, ease: 'back.out(3)' }, 6.1).to(s, { c: .25, duration: 1.2, ease: 'power2.out' }, 6.6)
      .fromTo(q('.chip-i'), { opacity: 0, scale: .6, x: 0, y: 0, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, x: (i: number) => (narrow() ? 0 : [-1, 1, -1, 1][i] * 250), y: (i: number) => (narrow() ? [-205, -150, 150, 205][i] : [-1, -1, 1, 1][i] * 120), duration: .9, stagger: .12, ease: 'back.out(1.6)' }, 6.15)
      .fromTo(q('.b3'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .7 }, 6.4)
      // beat 4: the name
      .to(q('.chip-i'), { opacity: 0, scale: .8, x: 0, y: 0, duration: .6, stagger: .05, ease: 'power2.in' }, 8.4)
      .to(q('.b3'), { opacity: 0, duration: .4 }, 8.4)
      .fromTo(q('.b4 > *'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .8, stagger: .12 }, 8.9);
    const finish = () => {
      if (done.current) return; done.current = true;
      try { sessionStorage.setItem('artha.intro', 'seen'); } catch { /* */ }
      tl.pause();
      gsap.timeline({ onComplete: onDone })
        .to(q('.b4, .b1, .b2, .b3, .chip-i, .skip'), { opacity: 0, duration: .35 }, 0)
        .to(s, { d: 1, duration: 1, ease: 'expo.inOut' }, 0)
        .to(el, { backgroundColor: 'rgba(11,12,16,0)', duration: .9, ease: 'power2.inOut' }, .2)
        .to(mat, { opacity: 0, duration: .5 }, .7)
        .to(glow.material, { opacity: 0, duration: .5 }, .6);
    };
    tl.call(() => { /* wait on the name, then hand over */ }, [], 11.6).call(finish, [], 11.7);
    const onKey = (e: KeyboardEvent) => { if (['Enter', ' ', 'Escape'].includes(e.key)) finish(); };
    addEventListener('keydown', onKey);
    (el as any)._finish = finish;

    return () => {
      tl.kill(); cancelAnimationFrame(raf); gsap.ticker.lagSmoothing(500, 33);
      removeEventListener('pointermove', onMove); removeEventListener('resize', onResize); ro.disconnect(); removeEventListener('keydown', onKey);
      geo.dispose(); mat.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [onDone]);

  const finish = () => (root.current as any)?._finish?.();
  return (
    <div className="intro" ref={root} role="dialog" aria-label="Artha introduction" onClick={finish}>
      <div className="intro-gl" ref={canvasHost} />
      <div className="frags" aria-hidden="true">{FRAGMENTS.map((f, i) => <span key={f} className="frag" style={{ left: `${[8, 64, 22, 70, 6, 52, 30, 78, 14, 44][i]}%`, top: `${[16, 12, 30, 34, 62, 70, 82, 58, 44, 22][i]}%` }}>{f}</span>)}</div>
      <div className="beat b1"><p className="eyebrow">India speaks</p><h1>{'Over a billion Indians have never typed to an AI.'.split(' ').map((x, i) => <span key={i} className="w">{x}</span>)}</h1></div>
      <div className="beat b2"><h1 className="big">They just speak.</h1></div>
      <div className="chips-i" aria-hidden="true">{CHIPS.map(c => <span key={c.k} className={`chip-i ${c.k}`}><i />{c.t}</span>)}</div>
      <div className="beat b3 low"><p>Artha hears <b>who</b>, <b>when</b> and <b>how much</b>, from your own world, and gets it done.</p></div>
      <div className="beat b4">
        <span className="mark">A</span>
        <h1 className="name">Artha</h1>
        <p className="tag">Bas ishaara kaafi hai.</p>
        <button className="go" onClick={e => { e.stopPropagation(); finish(); }}>Start talking</button>
      </div>
      <button className="skip" onClick={e => { e.stopPropagation(); finish(); }}>Skip</button>
    </div>
  );
}
