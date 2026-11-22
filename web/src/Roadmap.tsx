// The setup roadmap: a road with a stop for each step of reading the person's Gmail. A green tube grows from stop to stop
// as the real sync reports progress (GSAP eases every move and creeps forward during long waits, so it never looks stuck);
// a lime traveller leads it with a soft trail. Stops pop when their step is done; the next one breathes.
//
// The road is ONE smooth wave (a cosine), with every stop on a crest, so it flows without corners.
// - Wide screens: the wave runs left to right in gentle 3D, labels above or below each stop.
// - Narrow screens (phones): it runs top to bottom in a lane on the left, drawn with a flat, pixel-exact camera,
//   and the labels sit in a column on the right that never touches the road.
// The layout follows the container's width live (rotation, resizing) and keeps the progress when it switches.
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type RoadNode = { title: string; sub?: string };
type Props = { nodes: RoadNode[]; target: number; creep?: number; creepSecs?: number; done?: boolean };

const GREEN = new THREE.Color('#00B140'), LIME = new THREE.Color('#BAFF29'), TRACK = new THREE.Color('#DCE9DD'), IDLE = new THREE.Color('#C9D9CC');
const NARROW = 700;          // below this width the road runs top to bottom
const U = 64;                // phone layout: pixels per world unit
const GAP = 1.75;            // phone layout: units between stops (about 112 px)

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function Roadmap({ nodes, target, creep, creepSecs = 12, done }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const ctl = useRef<{ go: (t: number, creep: number, secs: number) => void; finish: () => void } | null>(null);
  // kept across rebuilds (rotation, resize): where the road is, and what was last asked of it
  const prog = useRef({ p: 0, finished: false, last: { t: 0, creep: 0, secs: 10 } });
  const n = nodes.length;

  // the layout: vertical or not, and the width it was built for (rebuilt when either changes)
  const [box, setBox] = useState<{ w: number; vertical: boolean } | null>(null);
  useEffect(() => {
    const el = wrap.current!; let t = 0;
    const measure = () => { const w = Math.round(el.clientWidth); if (w > 0) setBox(b => (b && Math.abs(b.w - w) < 2 ? b : { w, vertical: w < NARROW })); };
    measure();
    const ro = new ResizeObserver(() => { clearTimeout(t); t = window.setTimeout(measure, 120); });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (!box) return;
    const el = wrap.current!, host = holder.current!, { w: W, vertical } = box;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- the road: one cosine wave with a stop on every crest
    const k = n - 1, steps = 240;
    let H: number, pts: THREE.Vector3[];
    if (vertical) {
      // a road winding down the screen: long smooth bends from one side to the other, a stop on every bend
      const cx = W / 2 / U, amp = Math.max(0.9, (W / 2 - 58) / U), top = 0.85;
      H = Math.round((top * 2 + k * GAP) * U);
      pts = Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps; return new THREE.Vector3(cx - amp * Math.cos(Math.PI * k * t), -(top + t * k * GAP), 0); });
    } else {
      H = 340;
      pts = Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps; return new THREE.Vector3(-5 + 10 * t, -0.82 * Math.cos(Math.PI * k * t), 0.3 * Math.sin(Math.PI * k * t)); });
    }
    el.style.height = `${H}px`;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    // each stop's place along the road (0..1): the crests sit at t = i/k; find them on the arc-length curve
    const crest = (i: number) => pts[Math.round((i / k) * steps)];
    const samples = 1600, along = (p: THREE.Vector3) => { let best = 0, d = Infinity; for (let i = 0; i <= samples; i++) { const e = curve.getPointAt(i / samples).distanceToSquared(p); if (e < d) { d = e; best = i / samples; } } return best; };
    const stopAt = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : i === k ? 1 : along(crest(i))));
    const uOf = (p: number) => { const i = Math.min(n - 2, Math.max(0, Math.floor(p))); const f = Math.min(1, Math.max(0, p - i)); return stopAt[i] + (stopAt[i + 1] - stopAt[i]) * f; };

    // ---- scene and camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-3, 5, 8); scene.add(sun);
    let camera: THREE.Camera;
    if (vertical) {
      // flat and exact: one world unit is U pixels, the top-left corner is (0, 0)
      const cam = new THREE.OrthographicCamera(0, W / U, 0, -H / U, 0.1, 50); cam.position.set(0, 0, 10); camera = cam;
    } else {
      const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), a = W / H;
      const dist = Math.max((5 + 1.15) / (t * a), (0.82 + 1.3) / t);
      cam.position.set(0, -0.5, dist); cam.lookAt(0, 0, 0); camera = cam;
    }
    const scale = vertical ? 1.0 : 0.95;   // stops sized to be seen at a glance

    // track, glow and the growing tube
    const SEG = 900, RAD = 10, perSeg = RAD * 6;
    const tr = vertical ? 0.045 : 0.035, fr = vertical ? 0.06 : 0.048;
    const track = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, tr, RAD, false), new THREE.MeshBasicMaterial({ color: TRACK }));
    const fillGeo = new THREE.TubeGeometry(curve, SEG, fr, RAD, false);
    // light streaks racing along the green line (uv.x runs along the road): it always feels in motion
    const flow = { value: 0 };
    const fill = new THREE.Mesh(fillGeo, new THREE.ShaderMaterial({ uniforms: { time: flow, green: { value: GREEN }, lime: { value: LIME }, reps: { value: vertical ? 14 : 22 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float time; uniform float reps; uniform vec3 green; uniform vec3 lime; varying vec2 vUv; void main(){ float f = fract(vUv.x * reps - time * 1.6); float streak = smoothstep(0.0, 0.18, f) * (1.0 - smoothstep(0.18, 0.55, f)); gl_FragColor = vec4(mix(green, lime, streak * 0.85), 1.0); }' }));
    const haloGeo = new THREE.TubeGeometry(curve, SEG, vertical ? 0.17 : 0.14, RAD, false);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.1, depthWrite: false }));
    world.add(track, halo, fill);

    // stops: a white disc in a ring; done = green with a lime heart; the next one breathes
    const glow = glowTexture();
    const stops = stopAt.map((u, i) => {
      const g = new THREE.Group(); g.position.copy(curve.getPointAt(u)); g.position.z += 0.2; g.scale.setScalar(scale);
      // a soft shadow, a crisp white border, the coloured ring, the face, and a white centre once done
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0F362D'), transparent: true, opacity: 0.12, depthWrite: false }));
      const border = new THREE.Mesh(new THREE.CircleGeometry(0.34, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFFFF') }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 64), new THREE.MeshBasicMaterial({ color: IDLE.clone() }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFFFF') }));
      const heart = new THREE.Mesh(new THREE.CircleGeometry(0.08, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFFFF'), transparent: true, opacity: 0 }));
      const pulse = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.44, 64), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0, depthWrite: false }));
      shadow.position.set(0.02, -0.04, -0.02); ring.position.z = 0.01; disc.position.z = 0.01; heart.position.z = 0.02;
      g.add(pulse, shadow, border, ring, disc, heart); world.add(g);
      return { g, ring, disc, heart, pulse, i, base: scale, state: 'todo' as 'todo' | 'now' | 'done' };
    });

    // the traveller
    const head = new THREE.Group(); head.scale.setScalar(scale * 0.8);
    head.add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 40), new THREE.MeshBasicMaterial({ color: LIME })));
    const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: GREEN, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    headGlow.scale.setScalar(0.9); head.add(headGlow); world.add(head);

    // trail and bursts
    const MAX = 260, pos = new Float32Array(MAX * 3), alpha = new Float32Array(MAX), size = new Float32Array(MAX), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX);
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pgeo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1)); pgeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const pointScale = () => renderer.getPixelRatio() * (vertical ? U * 10 : H * 0.9);   // ortho: z stays 10, so this gives pixels
    const pmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { map: { value: glow }, color: { value: new THREE.Color('#2FC85C') }, scale: { value: pointScale() } },
      vertexShader: 'attribute float alpha; attribute float size; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA); }' });
    world.add(new THREE.Points(pgeo, pmat));
    let next = 0;
    const emit = (at: THREE.Vector3, speed: number, s: number, l: number, strong?: boolean) => {
      const j = next++ % MAX; pos[j * 3] = at.x; pos[j * 3 + 1] = at.y; pos[j * 3 + 2] = at.z + 0.1;
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      vel[j * 3] = Math.cos(a) * v; vel[j * 3 + 1] = Math.sin(a) * v; vel[j * 3 + 2] = (Math.random() - 0.5) * v * 0.4;
      size[j] = s * (0.6 + Math.random() * 0.8); life[j] = l; alpha[j] = strong ? 0.95 : 0.6;
    };
    const burst = (at: THREE.Vector3, count: number, speed = 1.6) => { if (!calm) for (let i = 0; i < count; i++) emit(at, speed * scale, 0.16 * scale, 0.9 + Math.random() * 0.6, true); };

    // ---- progress (kept across rebuilds)
    const s = prog.current;
    let tween: gsap.core.Tween | gsap.core.Timeline | null = null;
    const go = (t: number, cr: number, secs: number) => {
      s.last = { t, creep: cr, secs };
      if (s.finished) return;
      const to = Math.max(s.p, Math.min(n - 1, t)), cap = Math.max(to, Math.min(n - 1.02, cr));
      tween?.kill();
      const tl = gsap.timeline();
      tl.to(s, { p: to, duration: calm ? 0.2 : Math.min(1.1, 0.35 + Math.abs(to - s.p) * 0.5), ease: 'power3.inOut' });
      if (cap > to + 0.001) tl.to(s, { p: cap, duration: secs, ease: 'power1.out' });
      tween = tl;
    };
    let celebrated = false;
    const finish = () => {
      s.finished = true; tween?.kill();
      tween = gsap.timeline()
        .to(s, { p: n - 1, duration: calm ? 0.25 : Math.min(1.0, 0.35 + (n - 1 - s.p) * 0.5), ease: 'power3.inOut' })
        .add(() => {
          if (celebrated) return; celebrated = true;
          burst(stops[n - 1].g.position, 40, 1.6);
          stops.forEach((st, i) => gsap.fromTo(st.g.scale, { x: st.base, y: st.base, z: st.base }, { x: st.base * 1.18, y: st.base * 1.18, z: st.base * 1.18, duration: 0.18, delay: i * 0.06, yoyo: true, repeat: 1, ease: 'power2.out' }));
          gsap.to(headGlow.scale, { x: 2.2, y: 2.2, duration: 0.7, ease: 'expo.out' }); gsap.to(headGlow.material, { opacity: 0, duration: 1.1, ease: 'power2.out' });
        });
    };
    ctl.current = { go, finish: () => { if (!s.finished) finish(); } };

    // ---- labels follow their stops
    const v = new THREE.Vector3(), lw = vertical ? Math.max(150, W - 58 - 34 - 12) : 184;
    // a stop on the left bend has its label to its right, and the other way round
    const leftBend = (i: number) => crest(i).x * U < W / 2;
    labels.current.forEach((l, i) => { if (l) { l.style.width = vertical ? '' : `${lw}px`; l.style.maxWidth = vertical ? `${lw}px` : ''; l.dataset.layout = vertical ? 'v' : 'h'; l.dataset.side = vertical && !leftBend(i) ? 'r' : 'l'; } });
    const placeLabels = () => {
      stops.forEach((st, i) => {
        const lab = labels.current[i]; if (!lab) return;
        st.g.getWorldPosition(v); v.project(camera);
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        if (vertical) lab.style.transform = leftBend(i) ? `translate(${x + 30}px, ${y}px) translate(0, -50%)` : `translate(${x - 30}px, ${y}px) translate(-100%, -50%)`;
        else {
          const up = crest(i).y > 0, cx = Math.min(W - lw / 2 - 2, Math.max(lw / 2 + 2, x));   // kept inside the edges
          lab.style.transform = `translate(${cx}px, ${y + (up ? -44 : 42)}px) translate(-50%, ${up ? '-100%' : '0'})`;
        }
      });
    };

    // stop states, without animation for what was already reached before a rebuild
    const setStops = (animate: boolean) => stops.forEach(st => {
      const want = s.p >= st.i - 0.002 ? 'done' : Math.ceil(s.p - 0.002) === st.i ? 'now' : 'todo';
      if (want === st.state) return;
      const was = st.state; st.state = want;
      const lab = labels.current[st.i]; if (lab) lab.dataset.state = want;
      if (want === 'done') {
        (st.ring.material as THREE.MeshBasicMaterial).color.copy(GREEN); (st.disc.material as THREE.MeshBasicMaterial).color.copy(GREEN);
        if (!animate) { (st.heart.material as THREE.MeshBasicMaterial).opacity = 1; return; }
        gsap.to(st.heart.material, { opacity: 1, duration: 0.3 });
        if (was !== 'todo' || st.i > 0) { gsap.fromTo(st.g.scale, { x: st.base * 1.3, y: st.base * 1.3, z: st.base * 1.3 }, { x: st.base, y: st.base, z: st.base, duration: calm ? 0.15 : 0.45, ease: 'power3.out' }); burst(st.g.position, 10, 0.9); }
      } else if (want === 'now') (st.ring.material as THREE.MeshBasicMaterial).color.copy(GREEN);
    });
    setStops(false);
    if (s.finished) { celebrated = true; headGlow.material.opacity = 0; }
    else go(s.last.t, s.last.creep, s.last.secs);   // carry on where the last layout was heading

    // ---- each frame
    const clock = new THREE.Clock(); let raf = 0, emitAcc = 0; const prevHead = new THREE.Vector3(); let first = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
      if (!vertical) { world.rotation.x = -0.22 + (calm ? 0 : Math.sin(t * 0.45) * 0.035); world.rotation.y = calm ? 0 : Math.sin(t * 0.32) * 0.07; }
      const u = uOf(s.p), count = Math.floor(u * SEG) * perSeg;
      fillGeo.setDrawRange(0, count); haloGeo.setDrawRange(0, count);
      const hp = curve.getPointAt(Math.max(0.0005, u)); head.position.set(hp.x, hp.y, hp.z + 0.25);
      if (!s.finished) headGlow.scale.setScalar(0.85 + Math.sin(t * 5) * 0.08);
      flow.value = calm ? 0 : t;
      if (first) { prevHead.copy(hp); first = false; }
      if (!calm && !s.finished) { emitAcc += hp.distanceTo(prevHead) * 18; while (emitAcc >= 1) { emitAcc -= 1; emit(hp, 0.1 * scale, 0.06 * scale, 0.55); } }
      prevHead.copy(hp);
      for (let j = 0; j < MAX; j++) {
        if (life[j] <= 0) { alpha[j] = 0; continue; }
        life[j] -= dt; pos[j * 3] += vel[j * 3] * dt; pos[j * 3 + 1] += vel[j * 3 + 1] * dt; pos[j * 3 + 2] += vel[j * 3 + 2] * dt;
        vel[j * 3] *= 0.94; vel[j * 3 + 1] *= 0.94; alpha[j] = Math.max(0, Math.min(alpha[j], life[j]));
      }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.alpha.needsUpdate = true; pgeo.attributes.size.needsUpdate = true;
      setStops(true);
      stops.forEach(st => { const pm = st.pulse.material as THREE.MeshBasicMaterial; if (st.state === 'now' && !calm) { const q = (t * 1.1) % 1; st.pulse.scale.setScalar(1 + q * 0.9); pm.opacity = 0.45 * (1 - q); } else pm.opacity = 0; });
      placeLabels();
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf); tween?.kill(); ctl.current = null;
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
      glow.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [box, n]);

  useEffect(() => { prog.current.last = { t: target, creep: creep ?? target, secs: creepSecs }; ctl.current?.go(target, creep ?? target, creepSecs); }, [target, creep, creepSecs]);
  useEffect(() => { if (done) { if (ctl.current) ctl.current.finish(); else prog.current.finished = true; } }, [done]);

  return (
    <div className="road" ref={wrap}>
      <div ref={holder} className="road-gl" aria-hidden="true" />
      {nodes.map((x, i) => (
        <div key={i} ref={e => { labels.current[i] = e; }} className="road-l" data-state={i === 0 ? 'done' : 'todo'}>
          <b>{x.title}</b>{x.sub && <small>{x.sub}</small>}
        </div>))}
    </div>
  );
}
