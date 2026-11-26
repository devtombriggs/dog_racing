// The big words mid-screen: "Loading...", 3, 2, 1, GO! and FINISHED!
export function CountdownOverlay({ racePhase }) {
  if (!(racePhase)) return null;

  const kind = racePhase === 'Loading...' ? 'loading' : racePhase === 'GO!' ? 'go' : racePhase === 'FINISHED!' ? 'finished' : 'count';
  return (
    <div className="race-countdown">
      {/* (key: each number pops in afresh) */}
      <div key={racePhase} className={`race-countdown__word race-countdown__word--${kind}`}>{racePhase}</div>
    </div>
  );
}
