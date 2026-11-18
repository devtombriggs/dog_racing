import { MAPS, DEFAULT_MAP } from '../../../shared/maps.js';
import { ITEM_NAMES } from '../../../shared/items.js';
import { SPECIALS, SPECIAL_ITEM } from '../../../shared/specials.js';
import { TOTAL_LAPS } from '../../config/handling.js';
import { VOICE_CHAT } from '../../config/env.js';
import { hudStyle } from '../styles.js';

// The panel at the top right: lap, item, speed, time, the ground under the dog and the controls.
// The speed, time and ground readouts are written straight to the page by the race, every frame,
// through the three refs.
export function HudPanel({ state, speedRef, timerRef, surfaceRef }) {
  const { room, socketId, lap, heldItem, checkpoint, totalCheckpoints, accessibilityMode, voiceStatus } = state;

  return (
    <div style={hudStyle}>
      <div
        style={{
          fontSize: 12,
          color: '#b4c9b5',
          marginBottom: 6,
          letterSpacing: 1
        }}
      >
        {MAPS[room?.mapId ?? DEFAULT_MAP].name.toUpperCase()}
        {room?.grandPrix && <div style={{ color: '#ffd257', marginTop: 3 }}>🏆 {room.grandPrix.name.toUpperCase()} · RACE {room.grandPrix.round}/{room.grandPrix.of}</div>}
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          marginBottom: 12
        }}
      >
        LAP {lap}/{TOTAL_LAPS}
      </div>

      <div style={{ fontSize: 12, color: '#b4c9b5', marginBottom: 3 }}>ITEM</div>
      <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: heldItem ? '#ffd257' : '#6f8573' }}>
        {heldItem === SPECIAL_ITEM && (
          <img src="/icons/special.png" alt="" style={{ width: 30, height: 30, verticalAlign: 'middle', marginRight: 6 }} />
        )}
        {heldItem === SPECIAL_ITEM
          ? `${SPECIALS[room?.players.find(p => p.id === socketId)?.dog]?.name ?? 'Special'} · press Shift`
          : heldItem ? `${ITEM_NAMES[heldItem]} · press Shift` : 'None: run through a box'}
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#b4c9b5',
          marginBottom: 3
        }}
      >
        SPEED
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          marginBottom: 12
        }}
      >
        <span
          ref={speedRef}
          style={{
            fontSize: 32,
            fontWeight: 'bold'
          }}
        >
          0.0
        </span>

        <span
          style={{
            fontSize: 14,
            color: '#b4c9b5'
          }}
        >
          km/h
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#b4c9b5',
          marginBottom: 3
        }}
      >
        RACE TIME
      </div>

      <div
        ref={timerRef}
        style={{
          fontSize: 25,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          marginBottom: 12
        }}
      >
        0:00.0
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#b4c9b5'
        }}
      >
        Checkpoints: {checkpoint}/{totalCheckpoints}
      </div>
      <div
        ref={surfaceRef}
        style={{ fontSize: 12, marginTop: 12, color: '#9fe49b', fontWeight: 'bold' }}
      >
        ON TRACK
      </div>
      <div style={{ fontSize: 11, marginTop: 14, color: '#b4c9b5', lineHeight: 1.6 }}>
        {accessibilityMode ? (
          <>
            <div>Accessibility mode: your dog runs by itself</div>
            <div>A / D or ← / → steer</div>
            <div>↑ to jump · ↓ to use an item</div>
          </>
        ) : (
          <>
            <div>W / ↑ accelerate · S / ↓ brake / reverse</div>
            <div>A / D or ← / → steer</div>
            <div>Space or scroll down to jump · Shift to use an item</div>
          </>
        )}
        {VOICE_CHAT && room && !room.singlePlayer && (
          <div style={{ color: voiceStatus.enabled && !voiceStatus.muted ? '#9fe49b' : '#b4c9b5' }}>
            {voiceStatus.error ? `Voice chat: ${voiceStatus.error}`
              : !voiceStatus.enabled ? 'Voice chat: your microphone is off'
                : voiceStatus.muted ? 'Microphone muted · M to unmute' : 'Microphone on · M to mute'}
          </div>
        )}
        {room?.mapId === 'wendover' && <div>Amber burrows boost Ralph · Poppy swims fastest</div>}
        {room?.mapId === 'treat_road' && <div>Cyan pad launches automatically · falls return to checkpoints</div>}
        {room?.mapId === 'modbury_heights' && <div>Follow the trail · falls return you to a checkpoint</div>}
        {room?.mapId === 'mud_park' && <div>It is slippery: ease off in the bends · keep out of the deep mud · jump the logs · mind the quad bike</div>}
        {room?.mapId === 'pet_mall' && <div>Jump the cats and hamster balls · dodge the trolleys and tins · ride the escalator · leap the atrium</div>}
        {room?.mapId === 'water_park' && <div>Bounce across the rubber rings or swim · dodge the beach balls and the jets · ride the slide</div>}
        {room?.mapId === 'farmyard' && <div>Dodge the tractor, sheep, pigs, sails and rolling bales · jump the pond bridge</div>}
        {room?.mapId === 'frostpeak' && <div>Run into the cannon · it fires you to the summit · eat the bones down the black run</div>}
      </div>
    </div>
  );
}
