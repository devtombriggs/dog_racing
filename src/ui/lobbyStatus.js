import { useEffect, useRef, useState } from 'react';

// What the players of a room are doing, and a race's clock, for the lobby (LobbyPlayers.jsx) and the list of games (JoinScreen.jsx)

export const IN_A_RACE = ['loading', 'countdown', 'racing', 'finished'];

/** What a player is doing, in a word or two: [words, kind] (kind: 'race' | 'done' | 'lobby' | 'away', for its colour) */
export function playerStatus(room, player) {
  const racing = IN_A_RACE.includes(room.status);
  // (connected but gone quiet in a race, a hidden tab say: the dog is running itself until their game speaks again)
  if (player.away === 'stalled' && room.status !== 'finished') return ['Racing · dog running itself', 'away'];
  if (player.away && player.away !== 'lobby' && !player.inLobby) return ['Lost connection', 'away'];
  if (racing && !player.inLobby) {
    if (room.status === 'finished') return ['Race over', 'done'];
    if (player.finished) return ['Finished · watching', 'done'];
    return [room.status === 'racing' ? 'Racing' : 'Starting', 'race'];
  }
  if (player.where === 'garage') return ['In the Garage', 'lobby'];
  if (player.where === 'shop') return ['In the Shop', 'lobby'];
  if (room.status === 'voting') return ['Voting on a map', 'lobby'];
  return [player.dog || racing ? 'In the lobby' : 'Choosing a dog', 'lobby'];
}

/** 2:14 */
export const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** How long a race has been going, counted on from what the server said (`raceMs`, when `stamp` arrived); null before GO */
export function useRaceClock(raceMs, stamp) {
  const started = useRef(null), [elapsed, setElapsed] = useState(null);
  useEffect(() => {
    started.current = raceMs == null ? null : performance.now() - raceMs;
    if (started.current === null) return undefined;
    const tick = () => setElapsed(Math.max(0, performance.now() - started.current));
    const first = setTimeout(tick, 0), timer = setInterval(tick, 500);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [raceMs, stamp]);
  return raceMs == null ? null : elapsed ?? raceMs;
}
