/**
 * Are we online? The browser's flag, plus a manual "Simulate offline" switch in the engineer's profile menu
 * (handy for a demo, and for testing without switching the phone to flight mode).
 */
const KEY = "bf-simulate-offline";
const EVENT = "bf-net-change";

export const isSimulatedOffline = () => {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"; } catch { return false; }
};
export const isOffline = () => (typeof navigator !== "undefined" && navigator.onLine === false) || isSimulatedOffline();

export function setSimulatedOffline(on: boolean) {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage blocked: ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeNet(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Errors that mean "no connection" rather than "the server said no". */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message));
