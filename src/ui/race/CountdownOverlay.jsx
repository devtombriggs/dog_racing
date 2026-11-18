// The big words mid-screen: "Loading...", 3, 2, 1, GO! and FINISHED!
export function CountdownOverlay({ racePhase }) {
  if (!(racePhase)) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          fontSize:
            racePhase === 'Loading...'
              ? 42
              : 100,
          fontWeight: 900,
          fontFamily:
            'Arial, sans-serif',
          color:
            racePhase === 'GO!'
              ? '#70e76d'
              : racePhase === 'FINISHED!'
                ? '#ffd966'
                : 'white',
          textShadow:
            '0 4px 25px rgba(0,0,0,0.95)',
          textAlign: 'center'
        }}
      >
        {racePhase}
      </div>
    </div>
  );
}
