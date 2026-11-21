// The opening, about seven seconds, told by one field of light:
//   1. "Bolo" in six scripts, real voice notes floating around it      "Just say it, in your language."
//   2. the field becomes one voice wave                                  "Artha listens."
//   3. the wave folds into Artha's orb; what it understood flies out      who · when · how much
//   4. the name                                                           "Artha · Bas ishaara kaafi hai."
// Then the orb drops to where the app's orb lives and the app takes over.
// One Points cloud (plus a soft halo copy for glow), positions blended on the CPU between shapes; GSAP drives it all.
import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const N = 2800;
const FRAGMENTS = ['Mehta ji ko bol do', 'అమ్మకి చెప్పు', 'செல்விக்கு சொல்லு', 'दुधवाल्यांना पैसे पाठवा', 'Balwinder nu dasso', 'রিয়াকে বলো', 'khate mein likh do', 'Salma apa ko bolo'];
const FRAG_POS: [number, number][] = [[6, 14], [70, 10], [4, 74], [64, 80], [74, 32], [10, 40], [36, 88], [40, 6]];
const WORDS = ['बोलो', 'சொல்லு', 'చెప్పు', 'ਦੱਸੋ', 'বলো', 'Say it.'];
const CHIPS = [
  { k: 'who', heard: 'Ayush', got: 'your cricket friend' },
  { k: 'when', heard: 'kal 7 baje', got: 'Sun, 7:00 AM' },
  { k: 'money', heard: 'dhai hazaar', got: '₹2,500' },
];

export function shouldShowIntro() {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return true;
  // links that land mid-flow go straight in: a person or demo link (?p=), the return from Google sign-in, debug views.
  // Opening the installed app (?source=app), a shortcut, a "get the app" link or a campaign tag still plays it.
  const passThrough = (k: string) => k === 'source' || k === 'app' || k.startsWith('utm_');
  if ([...q.keys()].some(k => !passThrough(k))) return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try { return sessionStorage.getItem('artha.intro') !== 'seen'; } catch { return true; }
}

function dotTexture(soft = false) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) { r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.25, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(255,255,255,.8)'); r.addColorStop(.6, 'rgba(255,255,255,.15)'); r.addColorStop(1, 'rgba(255,255,255,0)'); }
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
    renderer.setSize(w(), h(), false);
    host.appendChild(renderer.domElement);
    let lastW = 0, lastH = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w() / h(), 0.1, 100);
    camera.position.set(0, 0, 13);
    const narrow = () => w() < 640;

    // the same points take four shapes: a scattered field, a voice wave, the orb, and the exit
    const cloud = new Float32Array(N * 3), wave = new Float32Array(N * 3), sphere = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seed[i] = Math.random();
      const r = 4 + Math.random() * 9, a = Math.random() * Math.PI * 2;           // a ring-ish field, so the centre stays clear for words
      cloud.set([Math.cos(a) * r * 1.25, Math.sin(a) * r * .62, (Math.random() - .5) * 9], i * 3);
      const strand = i % 4, u = (i / N) * 2 - 1;
      wave.set([u * 10, 0, (strand - 1.5) * .3], i * 3);
      const y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
      sphere.set([Math.cos(th) * rr * 2.3, y * 2.3, Math.sin(th) * rr * 2.3], i * 3);
    }
    const pos = new Float32Array(cloud);
    const col = new Float32Array(N * 3);
    const blue = new THREE.Color('#3cd070'), violet = new THREE.Color('#baff29'), teal = new THREE.Color('#7dffb0'), saffron = new THREE.Color('#ffb347'), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      if (seed[i] > .93) tmp.copy(saffron);                                       // a few warm sparks
      else tmp.copy(blue).lerp(seed[i] > .5 ? violet : teal, Math.abs(seed[i] - .5) * 1.7);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: .12, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const halo = new THREE.PointsMaterial({ size: .62, map: dotTexture(true), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    // the glow uses a third of the points (they are in random order), so weaker phones keep 60 fps
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', geo.getAttribute('position')); haloGeo.setAttribute('color', geo.getAttribute('color')); haloGeo.setDrawRange(0, Math.floor(N / 3));
    const points = new THREE.Points(geo, mat), glowPts = new THREE.Points(haloGeo, halo);
    scene.add(glowPts, points);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: dotTexture(true), color: '#00b140', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.z = -1.5; scene.add(glow);

    const s = { a: 0, b: 0, c: 0, d: 0, amp: 0, spin: 0 };   // field→wave, wave→orb, orb burst, exit
    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { mouse.x = (e.clientX / innerWidth - .5); mouse.y = (e.clientY / innerHeight - .5); };
    addEventListener('pointermove', onMove);

    let raf = 0; const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (w() !== lastW || h() !== lastH) { lastW = w(); lastH = h(); renderer.setSize(lastW, lastH, false); camera.aspect = lastW / lastH; camera.updateProjectionMatrix(); }
      const scale = narrow() ? .6 : 1, drop = narrow() ? 4.4 : 3.4;
      for (let i = 0; i < N; i++) {
        const k = i * 3, sd = seed[i];
        const x = wave[k], env = Math.exp(-((x / 10) ** 2) * 2.4);                     // a voice: loud in the middle, quiet at the ends
        const wy = Math.sin(x * 1.15 - t * 4.2 + (i % 4) * 1.6) * s.amp * env * (0.55 + .45 * Math.sin(x * .45 + t * 1.6)) + (sd - .5) * .1;
        let px = cloud[k] + Math.sin(t * .35 + sd * 6) * .35, py = cloud[k + 1] + Math.cos(t * .3 + sd * 5) * .3, pz = cloud[k + 2];
        px += (x - px) * s.a; py += (wy - py) * s.a; pz += (wave[k + 2] - pz) * s.a;
        const br = 1 + s.c * (.3 + sd * .6) * (0.5 + .5 * Math.sin(t * 2.2 + sd * 9));
        px += (sphere[k] * br - px) * s.b; py += (sphere[k + 1] * br - py) * s.b; pz += (sphere[k + 2] * br - pz) * s.b;
        const ex = 1 - s.d * .82;
        pos[k] = px * scale * ex; pos[k + 1] = (py * scale - (narrow() && s.b < .5 ? 0 : 0)) * ex - s.d * drop; pos[k + 2] = pz * scale * ex;   // shrink depth too, or the spinning orb looks oval on phones
      }
      geo.attributes.position.needsUpdate = true;
      const ry = s.spin * t * .28 + mouse.x * .35, rx = mouse.y * .22;
      points.rotation.set(rx, ry, 0); glowPts.rotation.set(rx, ry, 0);
      glow.position.y = -s.d * drop;
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
    // 1. Bolo, in six scripts, with real voice notes around it
    tl.to(mat, { opacity: 1, duration: .8 }, 0).to(halo, { opacity: .13, duration: 1 }, 0)
      .fromTo(q('.frag'), { opacity: 0, y: 14, scale: .94 }, { opacity: 1, y: 0, scale: 1, duration: .7, stagger: .05 }, .15)
      .fromTo(q('.b1'), { opacity: 0 }, { opacity: 1, duration: .3 }, .2)
      .fromTo(q('.b1 .sub'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .6 }, .7);
    const words = [...q('.vw')];
    words.forEach((wd, i) => {
      const at = .25 + i * .26;
      tl.fromTo(wd, { opacity: 0, yPercent: 40, filter: 'blur(8px)' }, { opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: .22, ease: 'power2.out' }, at);
      if (i < words.length - 1) tl.to(wd, { opacity: 0, yPercent: -40, filter: 'blur(8px)', duration: .2, ease: 'power2.in' }, at + .24);
    });
    // 2. it becomes one voice
    tl.to(q('.frag'), { opacity: 0, y: -10, duration: .4, stagger: .02 }, 2.1)
      .to(q('.b1'), { opacity: 0, y: -14, duration: .4 }, 2.1)
      .to(s, { a: 1, duration: 1.1, ease: 'power2.inOut' }, 2.05)
      .to(s, { amp: 1.45, duration: .8, ease: 'sine.inOut' }, 2.3)
      .fromTo(q('.b2'), { opacity: 0, y: 16, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: .6 }, 2.4)
      // 3. Artha understands: who, when, how much
      .to(q('.b2'), { opacity: 0, y: -12, duration: .35 }, 3.55)
      .to(s, { b: 1, duration: 1.05, ease: 'expo.inOut' }, 3.5)
      .to(s, { amp: 0, duration: .6 }, 3.5).to(s, { spin: 1, duration: 1.2 }, 3.6)
      .to(glow.material, { opacity: .6, duration: .9 }, 3.9)
      .to(s, { c: .7, duration: .35, ease: 'back.out(3)' }, 4.35).to(s, { c: .22, duration: .9 }, 4.7)
      .fromTo(q('.chip-i'), { opacity: 0, scale: .6, x: 0, y: 0, xPercent: -50, yPercent: -50 },
        { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, x: (i: number) => (narrow() ? 0 : [-300, 300, 0][i]), y: (i: number) => (narrow() ? [-235, -170, 175][i] : [-70, -70, 175][i]), duration: .8, stagger: .12, ease: 'back.out(1.5)' }, 4.4)
      .fromTo(q('.b3'), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .5 }, 4.7)
      // 4. the name
      .to(q('.chip-i'), { opacity: 0, scale: .85, x: 0, y: 0, duration: .45, stagger: .04, ease: 'power2.in' }, 6.0)
      .to(q('.b3'), { opacity: 0, duration: .3 }, 6.0)
      .fromTo(q('.b4 > *'), { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: .7, stagger: .1 }, 6.25)
      .fromTo(q('.name'), { backgroundPosition: '120% 0' }, { backgroundPosition: '-20% 0', duration: 1.6, ease: 'power1.inOut' }, 6.3);
    const finish = () => {
      if (done.current) return; done.current = true;
      try { sessionStorage.setItem('artha.intro', 'seen'); } catch { /* */ }
      tl.pause();
      gsap.timeline({ onComplete: onDone })
        .to(q('.b1, .b2, .b3, .b4, .chip-i, .frag, .skip'), { opacity: 0, duration: .3 }, 0)
        .to(s, { b: 1, a: 1, amp: 0, d: 1, duration: 1, ease: 'expo.inOut' }, 0)
        .to(el, { '--fade': 0, duration: .9, ease: 'power2.inOut' } as any, .2)
        .to([mat, halo], { opacity: 0, duration: .5 }, .7)
        .to(glow.material, { opacity: 0, duration: .5 }, .6);
    };
    tl.call(finish, [], 7.9);
    // ?intro=1&introAt=4.6 freezes the intro at that second (for checking a beat)
    const at = Number(new URLSearchParams(location.search).get('introAt'));
    if (at > 0) { tl.seek(Math.min(at, 7.8)).pause(); }
    const onKey = (e: KeyboardEvent) => { if (['Enter', ' ', 'Escape'].includes(e.key)) finish(); };
    addEventListener('keydown', onKey);
    (el as any)._finish = finish;

    return () => {
      tl.kill(); cancelAnimationFrame(raf); gsap.ticker.lagSmoothing(500, 33);
      removeEventListener('pointermove', onMove); removeEventListener('resize', onResize); ro.disconnect(); removeEventListener('keydown', onKey);
      geo.dispose(); haloGeo.dispose(); mat.dispose(); halo.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [onDone]);

  const finish = () => (root.current as any)?._finish?.();
  return (
    <div className="intro" ref={root} role="dialog" aria-label="Artha introduction" onClick={finish}>
      <div className="intro-sky" aria-hidden="true" />
      <div className="intro-gl" ref={canvasHost} />
      <div className="frags" aria-hidden="true">{FRAGMENTS.map((f, i) => <span key={f} className={`frag ${FRAG_POS[i][0] > 50 ? 'r' : ''}`} style={{ left: `${FRAG_POS[i][0]}%`, top: `${FRAG_POS[i][1]}%` }}>{f}</span>)}</div>
      <div className="beat b1">
        <div className="vwords" aria-label="Bolo, in six languages">{WORDS.map(wd => <span key={wd} className="vw">{wd}</span>)}</div>
        <p className="sub">Just say it, in your language.</p>
      </div>
      <div className="beat b2"><h2 className="big">Artha listens.</h2></div>
      <div className="chips-i" aria-hidden="true">{CHIPS.map(c => <span key={c.k} className={`chip-i ${c.k}`}><i /><em>“{c.heard}”</em><span className="arr">→</span><b>{c.got}</b></span>)}</div>
      <div className="beat b3 low"><p>Knows who you mean, and when, and how much.</p></div>
      <div className="beat b4">
        <span className="mark">A</span>
        <h1 className="name">Artha AI</h1>
        <p className="tag">Bas ishaara kaafi hai.</p>
      </div>
      <button className="skip" onClick={e => { e.stopPropagation(); finish(); }}>Skip</button>
    </div>
  );
}
