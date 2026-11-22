// What the browser was doing when its connection to the server dropped (Tom, 2026-11-22: a friend was dropped
// two or three times a race).  Once the game is connected again it sends this to the server, which writes it
// in its log beside the server's own reason (docker logs dog-racing-backend), so a stuck page (a map loading),
// a tab in the background and a lost Wi-Fi connection can be told apart.
//
//   const watch = createConnectionWatch();
//   watch.dropped(reason, screen)   on 'disconnect'
//   watch.report()                  on 'connect': the report on the last drop (or null), once
//   watch.dispose()

const TICK = 250;        // ms between checks that the page is still running
const LOOK_BACK = 30000; // ms before a drop in which a stuck page counts (the server gives up on a silent game in about 25 s)

export function createConnectionWatch() {
  if (typeof window === 'undefined') return { dropped() {}, report: () => null, dispose() {} };
  const now = () => performance.now();
  let last = now(), longestStall = 0, stalls = [], hiddenSince = document.hidden ? now() : null, hiddenTotal = 0, drop = null;

  // (a timer that comes round late means the page was stuck: a map loading, a slow frame, or a background tab)
  const timer = setInterval(() => {
    const t = now(), late = t - last - TICK;
    last = t;
    if (late < 500 || document.hidden) return;              // (a background tab's timers are slowed on purpose: counted as hidden instead)
    if (drop) longestStall = Math.max(longestStall, late);
    else { stalls.push({ at: t, ms: late }); stalls = stalls.filter(stall => stall.at > t - LOOK_BACK); }
  }, TICK);
  const onVisibility = () => {
    if (document.hidden) hiddenSince = now();
    else if (hiddenSince != null) { if (drop) hiddenTotal += now() - Math.max(hiddenSince, drop.at); hiddenSince = null; }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    dropped(reason, screen) {
      // (the longest the page was stuck in the half minute before, or is stuck right now: a stall is what ends a connection)
      const t = now(), stuck = Math.max(0, t - last - TICK);
      drop = { reason: String(reason ?? ''), screen, at: t, online: navigator.onLine,
        hiddenBefore: document.hidden && hiddenSince != null ? t - hiddenSince : 0 };      // (in the background when it dropped: for how long)
      longestStall = Math.max(stuck, ...stalls.filter(stall => stall.at > t - LOOK_BACK).map(stall => stall.ms)); stalls = []; hiddenTotal = 0;
      console.warn('[connection] lost:', reason, document.hidden ? '(tab in the background)' : '');
    },
    report() {
      if (!drop) return null;
      const t = now();
      const hidden = hiddenTotal + (document.hidden && hiddenSince != null ? t - Math.max(hiddenSince, drop.at) : 0);
      const out = {
        reason: drop.reason, screen: drop.screen, online: drop.online,
        offlineSeconds: (t - drop.at) / 1000,
        hiddenSeconds: (drop.hiddenBefore + hidden) / 1000,
        longestStallSeconds: longestStall / 1000,
      };
      drop = null;
      console.warn('[connection] back after', out.offlineSeconds.toFixed(1), 's', out);
      return out;
    },
    dispose() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); },
  };
}
