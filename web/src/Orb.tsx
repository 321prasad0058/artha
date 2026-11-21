// The Artha orb: a living sphere that breathes when idle, swells with your voice, swirls while thinking.
// One WebGL canvas, drawn at a fixed size and scaled with CSS, so moving it costs nothing.
import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type OrbMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done';

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERT = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uFreq;
varying vec3 vNormal; varying vec3 vPos; varying float vNoise;
${NOISE}
void main(){
  float n = snoise(normal * uFreq + vec3(uTime * 0.6, uTime * 0.4, uTime * 0.5));
  float n2 = snoise(normal * uFreq * 2.3 - vec3(uTime * 0.3));
  float d = n * uAmp + n2 * uAmp * 0.25;
  vNoise = n;
  vec3 pos = position + normal * d;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uTime; uniform float uGlow;
varying vec3 vNormal; varying vec3 vPos; varying float vNoise;
void main(){
  vec3 n = normalize(vNormal);
  vec3 v = normalize(-vPos);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  float g = n.y * 0.5 + 0.5;
  vec3 col = mix(uA, uB, smoothstep(0.05, 0.95, g + vNoise * 0.28 + sin(uTime * 0.7) * 0.06));
  col = mix(col, uC, smoothstep(0.45, 1.0, n.x * 0.5 + 0.5 + vNoise * 0.22) * 0.65);
  vec3 L = normalize(vec3(-0.45, 0.65, 1.0));
  float spec = pow(max(dot(n, normalize(L + v)), 0.0), 42.0);
  float diff = 0.78 + 0.22 * max(dot(n, L), 0.0);
  col = col * diff + spec * 0.55 + fres * (0.45 + uGlow * 0.6) * mix(uC, vec3(1.0), 0.45);
  gl_FragColor = vec4(col, 0.97);
}`;

const PALETTE: Record<OrbMode, [string, string, string]> = {
  idle: ['#3550e6', '#8a63ff', '#3fd0ff'],
  listening: ['#e0457b', '#ff8a5b', '#ffd166'],
  thinking: ['#4054ff', '#b36bff', '#3fe0d0'],
  speaking: ['#3a4dff', '#9b6bff', '#45e0ff'],
  done: ['#2f4fe0', '#7a5cff', '#5fd3ff'],
};

export function Orb({ mode, level, size = 320 }: { mode: OrbMode; level: number; size?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ mode, level });
  live.current = { mode, level };

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { el.classList.add('orb-fallback'); return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(size, size);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.z = 4.2;
    const u = {
      uTime: { value: 0 }, uAmp: { value: 0.075 }, uFreq: { value: 1.15 }, uGlow: { value: 0 },
      uA: { value: new THREE.Color(PALETTE.idle[0]) }, uB: { value: new THREE.Color(PALETTE.idle[1]) }, uC: { value: new THREE.Color(PALETTE.idle[2]) },
    };
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 96), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true }));
    scene.add(mesh);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let speed = 0.25, raf = 0, last = performance.now(), lastMode: OrbMode | null = null, t = 0, smooth = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { mode: m, level: lv } = live.current;
      if (m !== lastMode) {
        lastMode = m;
        const [a, b, c] = PALETTE[m];
        for (const [k, hex] of [['uA', a], ['uB', b], ['uC', c]] as const) {
          const col = new THREE.Color(hex);
          gsap.to(u[k].value, { r: col.r, g: col.g, b: col.b, duration: 0.8, ease: 'power2.out' });
        }
        const target = { idle: [0.22, 0.075, 1.15, 0.1], speaking: [0.7, 0.13, 1.4, 0.6], listening: [0.55, 0.15, 1.35, 0.45], thinking: [1.3, 0.14, 1.8, 0.7], done: [0.35, 0.06, 1.1, 0.5] }[m];
        gsap.to({ s: speed }, { s: reduce ? target[0] * 0.3 : target[0], duration: 0.9, onUpdate() { speed = (this as any).targets()[0].s; } });
        gsap.to(u.uAmp, { value: target[1], duration: 0.9, ease: 'power2.out' });
        gsap.to(u.uFreq, { value: target[2], duration: 0.9 });
        gsap.to(u.uGlow, { value: target[3], duration: 0.9 });
        if (m === 'done') gsap.fromTo(mesh.scale, { x: 1.12, y: 1.12, z: 1.12 }, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'elastic.out(1, 0.45)' });
      }
      const target = live.current.mode === 'speaking' ? 0.35 + 0.35 * Math.abs(Math.sin(now / 95)) * Math.abs(Math.sin(now / 230)) : lv;
      smooth += (target - smooth) * 0.25;
      t += dt * speed;
      u.uTime.value = t;
      const swell = live.current.mode === 'listening' || live.current.mode === 'speaking' ? 1 + smooth * 0.22 : 1;
      if (live.current.mode !== 'done') mesh.scale.setScalar(mesh.scale.x + (swell - mesh.scale.x) * 0.2);
      mesh.rotation.y += dt * speed * 0.5; mesh.rotation.x = Math.sin(t * 0.3) * 0.2;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); renderer.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); renderer.domElement.remove(); };
  }, [size]);

  return <div ref={host} className="orb-gl" style={{ width: size, height: size }} aria-hidden="true" />;
}
