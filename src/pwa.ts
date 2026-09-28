/** Install-as-app and phone notifications (Web Push). */
import { api } from "./api";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.VITE_STATIC) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

export type PushState = "unsupported" | "needs-install" | "denied" | "on" | "off";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  // iPhone/iPad only allow notifications for apps added to the Home Screen.
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush(publicKey: string): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications weren't allowed. You can turn them on in your browser or phone settings.");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  await api.pushSubscribe(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
}

/** Show a notification through the service worker when possible (required on phones). */
export async function showLocalNotification(title: string, body: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    // With phone notifications on, the server already sends this one.
    if (await reg?.pushManager?.getSubscription()) return;
    if (reg) await reg.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png" });
    else new Notification(title, { body });
  } catch {
    /* notifications unavailable */
  }
}

/* Chrome/Edge/Android offer an install prompt we can trigger from a button. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined")
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
export const canPromptInstall = () => Boolean(deferred);
export const onInstallAvailable = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
}
export const platform = () => (isIos() ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop");
