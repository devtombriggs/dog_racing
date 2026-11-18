// Small text helpers shared by the screens and the race HUD

export function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return n + (teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'));
}

export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60)
    .toFixed(1)
    .padStart(4, '0');

  return `${minutes}:${remaining}`;
}
