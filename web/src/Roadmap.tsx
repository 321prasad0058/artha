// The setup roadmap: a 3D road with a stop for each step of reading the person's Gmail. A green tube grows from stop to
// stop as the real sync reports progress (GSAP eases every move and creeps forward during long waits, so it never looks
// stuck); a lime traveller leads it, leaving a soft trail. Stops pop when their step is done. On a phone the road runs
// top to bottom with the labels on the right.
import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type RoadNode = { title: string; sub?: string };
type Props = { nodes: RoadNode[]; target: number; creep?: number; creepSecs?: number; done?: boolean };

const GREEN = new THREE.Color('#00B140'), LIME = new THREE.Color('#BAFF29'), TRACK = new THREE.Color('#DCE9DD'), IDLE = new THREE.Color('#C9D9CC');

/** A soft round glow, drawn once on a canvas. */
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
  const n = nodes.length;

  useEffect(() => {
    const el = wrap.current!, host = holder.current!;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W = () => el.clientWidth, vertical = W() < 560;
    const H = vertical ? 520 : 340;

    // ---- the road: control points alternate up and down; every other point is a stop
    const base: [number, number, number][] = [[-5, -0.35, 0], [-3.9, 0.55, 0.25], [-2.6, 0.95, 0], [-1.3, 0.1, -0.25], [0, -0.85, 0], [1.3, -0.1, 0.25], [2.6, 0.9, 0], [3.9, 0.45, -0.25], [5, -0.35, 0]];
    const pts = base.map(([x, y, z]) => vertical ? new THREE.Vector3(y * 1.15, -x * 0.92, z) : new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    // where each stop sits along the road (0..1), found by sampling: the bar moves stop to stop at these marks
    const samples = 1200, along = (p: THREE.Vector3) => { let best = 0, d = Infinity; for (let i = 0; i <= samples; i++) { const q = curve.getPointAt(i / samples); const e = q.distanceToSquared(p); if (e < d) { d = e; best = i / samples; } } return best; };
    const stopAt = [0, 2, 4, 6, 8].slice(0, n).map(i => (i === 0 ? 0 : i === 8 ? 1 : along(pts[i])));
    const uOf = (p: number) => { const i = Math.min(n - 2, Math.max(0, Math.floor(p))); const f = Math.min(1, Math.max(0, p - i)); return stopAt[i] + (stopAt[i + 1] - stopAt[i]) * f; };

    // ---- scene
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H); renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-3, 5, 8); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(32, W() / H, 0.1, 100);
    const fit = () => {
      const box = new THREE.Box3().setFromPoints(curve.getPoints(200)), size = box.getSize(new THREE.Vector3());
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), a = W() / H;
      // room for the labels: above and below on a wide screen, to the right on a phone
      const halfW = vertical ? size.x / 2 + 0.6 : size.x / 2 + 0.9, halfH = vertical ? size.y / 2 + 0.5 : size.y / 2 + 1.25;
      const dist = Math.max(halfW / (t * a), halfH / t);
      const off = vertical ? halfW * 0 + dist * t * a * 0.42 : 0;   // on a phone, the road sits on the left
      camera.position.set(off, vertical ? 0 : -0.6, dist); camera.lookAt(off, 0, 0); camera.aspect = a; camera.updateProjectionMatrix();
    };
    fit();

    // track, glow and the growing tube
    const SEG = 900, RAD = 12, perSeg = RAD * 6;
    const track = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.07, RAD, false), new THREE.MeshStandardMaterial({ color: TRACK, roughness: 0.7 }));
    const fillGeo = new THREE.TubeGeometry(curve, SEG, 0.092, RAD, false);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshStandardMaterial({ color: GREEN, emissive: GREEN, emissiveIntensity: 0.35, roughness: 0.35 }));
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.26, RAD, false), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.12, depthWrite: false }));
    world.add(track, halo, fill);

    // stops: a white disc in a ring; done = green with a lime heart; the next one pulses
    const glow = glowTexture();
    const stops = stopAt.map((u, i) => {
      const g = new THREE.Group(); g.position.copy(curve.getPointAt(u)); g.position.z += 0.06;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 48), new THREE.MeshBasicMaterial({ color: IDLE.clone() }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.25, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFFFF') }));
      const heart = new THREE.Mesh(new THREE.CircleGeometry(0.1, 32), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0 }));
      const pulse = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 48), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0, depthWrite: false }));
      heart.position.z = 0.01; g.add(pulse, ring, disc, heart); world.add(g);
      return { g, ring, disc, heart, pulse, i, state: 'todo' as 'todo' | 'now' | 'done' };
    });

    // the traveller: a lime core inside a green glow
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), new THREE.MeshStandardMaterial({ color: LIME, emissive: LIME, emissiveIntensity: 0.9 })));
    const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: GREEN, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    headGlow.scale.setScalar(1.1); head.add(headGlow); world.add(head);

    // a soft trail and bursts: one small particle system
    const MAX = 260, pos = new Float32Array(MAX * 3), alpha = new Float32Array(MAX), size = new Float32Array(MAX), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX);
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pgeo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1)); pgeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const pmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      uniforms: { map: { value: glow }, color: { value: new THREE.Color('#2FC85C') }, scale: { value: renderer.getPixelRatio() * H * 0.9 } },
      vertexShader: 'attribute float alpha; attribute float size; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA); }' });
    world.add(new THREE.Points(pgeo, pmat));
    let next = 0;
    const emit = (at: THREE.Vector3, speed: number, s: number, l: number, color?: boolean) => {
      const k = next++ % MAX; pos[k * 3] = at.x; pos[k * 3 + 1] = at.y; pos[k * 3 + 2] = at.z + 0.1;
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      vel[k * 3] = Math.cos(a) * v; vel[k * 3 + 1] = Math.sin(a) * v; vel[k * 3 + 2] = (Math.random() - 0.5) * v * 0.4;
      size[k] = s * (0.6 + Math.random() * 0.8); life[k] = l; alpha[k] = color ? 0.95 : 0.6;
    };
    const burst = (at: THREE.Vector3, count: number, speed = 1.6) => { if (!calm) for (let i = 0; i < count; i++) emit(at, speed, 0.16, 0.9 + Math.random() * 0.6, true); };

    // ---- progress: one number, 0..(n-1) stops reached
    const s = { p: 0 };
    let tween: gsap.core.Tween | gsap.core.Timeline | null = null, finished = false;
    ctl.current = {
      go(t, cr, secs) {
        if (finished) return;
        const to = Math.max(s.p, Math.min(n - 1, t)), cap = Math.max(to, Math.min(n - 1.02, cr));
        tween?.kill();
        const tl = gsap.timeline();
        tl.to(s, { p: to, duration: calm ? 0.25 : Math.min(1.8, 0.55 + Math.abs(to - s.p) * 0.9), ease: 'power2.inOut' });
        if (cap > to + 0.001) tl.to(s, { p: cap, duration: secs, ease: 'power1.out' });
        tween = tl;
      },
      finish() {
        if (finished) return; finished = true; tween?.kill();
        tween = gsap.timeline()
          .to(s, { p: n - 1, duration: calm ? 0.3 : Math.min(1.6, 0.5 + (n - 1 - s.p) * 0.9), ease: 'power2.inOut' })
          .add(() => {
            burst(stops[n - 1].g.position, 120, 2.6);
            stops.forEach((st, i) => gsap.fromTo(st.g.scale, { x: 1, y: 1, z: 1 }, { x: 1.35, y: 1.35, z: 1.35, duration: 0.25, delay: i * 0.08, yoyo: true, repeat: 1, ease: 'power2.out' }));
            gsap.to(headGlow.scale, { x: 3.2, y: 3.2, duration: 0.9, ease: 'expo.out' }); gsap.to(headGlow.material, { opacity: 0, duration: 1.1, ease: 'power2.out' });
          });
      },
    };

    // ---- labels follow their stops on screen
    const v = new THREE.Vector3();
    const placeLabels = () => {
      stops.forEach((st, i) => {
        const lab = labels.current[i]; if (!lab) return;
        st.g.getWorldPosition(v); v.project(camera);
        const x = (v.x * 0.5 + 0.5) * W(), y = (-v.y * 0.5 + 0.5) * H;
        if (vertical) lab.style.transform = `translate(${x + 24}px, ${y}px) translate(0, -50%)`;
        else { const up = pts[[0, 2, 4, 6, 8][i]].y > 0; lab.style.transform = `translate(${x}px, ${y + (up ? -38 : 36)}px) translate(-50%, ${up ? '-100%' : '0'})`; }
      });
    };

    // ---- each frame
    const clock = new THREE.Clock(); let raf = 0, prevHead = new THREE.Vector3(), emitAcc = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
      if (!calm) { world.rotation.x = vertical ? 0 : -0.22 + Math.sin(t * 0.45) * 0.035; world.rotation.y = Math.sin(t * 0.32) * (vertical ? 0.06 : 0.07); }
      else world.rotation.x = vertical ? 0 : -0.22;
      const u = uOf(s.p);
      const count = Math.floor(u * SEG) * perSeg;
      fillGeo.setDrawRange(0, count); halo.geometry.setDrawRange(0, count);
      const hp = curve.getPointAt(Math.max(0.0005, u)); head.position.set(hp.x, hp.y, hp.z + 0.04);
      if (!finished) headGlow.scale.setScalar(1.05 + Math.sin(t * 4) * 0.12);
      // trail: a few particles per unit of movement, plus a gentle idle shimmer
      if (!calm && !finished) { emitAcc += hp.distanceTo(prevHead) * 26 + dt * 3; while (emitAcc >= 1) { emitAcc -= 1; emit(hp, 0.25, 0.11, 0.9); } }
      prevHead.copy(hp);
      for (let k = 0; k < MAX; k++) {
        if (life[k] <= 0) { alpha[k] = 0; continue; }
        life[k] -= dt; pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        vel[k * 3] *= 0.94; vel[k * 3 + 1] *= 0.94; alpha[k] = Math.max(0, Math.min(alpha[k], life[k]));
      }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.alpha.needsUpdate = true; pgeo.attributes.size.needsUpdate = true;
      // stops change state as the bar reaches them
      stops.forEach(st => {
        const want = s.p >= st.i - 0.002 ? 'done' : Math.ceil(s.p - 0.002) === st.i ? 'now' : 'todo';
        if (want !== st.state) {
          const was = st.state; st.state = want;
          const lab = labels.current[st.i]; if (lab) lab.dataset.state = want;
          if (want === 'done') {
            (st.ring.material as THREE.MeshBasicMaterial).color.copy(GREEN); (st.disc.material as THREE.MeshBasicMaterial).color.copy(GREEN);
            gsap.to(st.heart.material, { opacity: 1, duration: 0.3 });
            if (was !== 'todo' || st.i > 0) { gsap.fromTo(st.g.scale, { x: 1.7, y: 1.7, z: 1.7 }, { x: 1, y: 1, z: 1, duration: calm ? 0.2 : 0.9, ease: 'elastic.out(1, 0.45)' }); burst(st.g.position, 34); }
          } else if (want === 'now') (st.ring.material as THREE.MeshBasicMaterial).color.copy(GREEN);
        }
        // the next stop breathes
        const pm = st.pulse.material as THREE.MeshBasicMaterial;
        if (st.state === 'now' && !calm) { const k = (t * 0.9) % 1; st.pulse.scale.setScalar(1 + k * 1.1); pm.opacity = 0.55 * (1 - k); } else pm.opacity = 0;
      });
      placeLabels();
      renderer.render(scene, camera);
    };
    frame();

    const onResize = () => { renderer.setSize(W(), H); fit(); pmat.uniforms.scale.value = renderer.getPixelRatio() * H * 0.9; };
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf); removeEventListener('resize', onResize); tween?.kill(); ctl.current = null;
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
      glow.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [n]);

  useEffect(() => { ctl.current?.go(target, creep ?? target, creepSecs); }, [target, creep, creepSecs]);
  useEffect(() => { if (done) ctl.current?.finish(); }, [done]);

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
