// Installing Artha AI as an app, free and without the stores (same approach as SahiCar).
// Android and desktop Chrome/Edge install it in one tap from the browser's own prompt; an iPhone adds it from
// Safari's Share menu. Either way it opens full screen from its own icon, like any app.
import { useSyncExternalStore } from 'react';

export type Platform = 'android' | 'ios' | 'desktop';
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
// iPadOS reports itself as a Mac; a touch screen gives it away
const ipad = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
export const platform: Platform = /iPhone|iPad|iPod/.test(ua) || ipad ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
/** In-app browsers (WhatsApp, Instagram, Gmail…) can't install anything; the page has to open in the real browser first. */
export const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|; wv\)|GSA\//.test(ua);
/** On iPhone, Safari 26 keeps Share under the ⋯ button; older Safari has it in the bottom bar; Chrome/Edge by the address bar. */
const safariMajor = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
export const iosFlow: 'menu' | 'bar' | 'top' = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) || ipad ? 'top' : safariMajor >= 26 ? 'menu' : 'bar';
export const isSafariMac = platform === 'desktop' && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);

/** Already running as the installed app. */
export const standalone = typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

type S = { open: boolean; prompt: InstallPrompt | null; installed: boolean };
let state: S = { open: false, prompt: null, installed: standalone };
const subs = new Set<() => void>();
const set = (p: Partial<S>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const useInstall = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => state);

/** Show the browser's install dialog. Resolves true when the person installs. */
export async function installNow(): Promise<boolean> {
  const p = state.prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  set({ prompt: null }); // a prompt works once; the browser offers a fresh one later if dismissed
  return outcome === 'accepted';
}

/** "Get the app": installs straight away where the browser allows it, otherwise opens the steps sheet. */
export function openGetApp() {
  if (state.prompt && !inAppBrowser) { void installNow().then(ok => ok && set({ installed: true })); return; }
  set({ open: true });
}
export const closeGetApp = () => set({ open: false });

// listen from the very first moment: the browser fires this once, early, and never again for the page
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); set({ prompt: e as InstallPrompt }); });
  addEventListener('appinstalled', () => set({ installed: true, prompt: null, open: false }));
  // a shared "get the app" link (?app) opens the sheet straight away
  const q = new URLSearchParams(location.search);
  if (q.has('app') && !standalone) {
    q.delete('app');
    history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    queueMicrotask(() => set({ open: true }));
  }
}
