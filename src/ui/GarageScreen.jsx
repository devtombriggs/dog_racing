import { useEffect, useState } from 'react';
import { DOGS } from '../config/dogs.js';
import { SHOP_ITEMS, SLOTS, dogUnlocked, fitsDog, cosmeticsFor } from '../../shared/shop.js';
import { account } from '../session/account.js';
import { useAccount } from './useAccount.js';
import { Coins, ItemArt } from './shopArt.jsx';
import { DogPreview } from './DogPreview.jsx';

// The Garage (Tom, 2026-11-26: "a dog garage or something where you can equip what you've just bought"): pick a dog, see it,
// and put on it what has been bought in the Shop.  One thing in each place (head, body) at a time; what a dog wears is kept
// with the account, and every player sees it in a race.
const DOG_IDS = Object.keys(DOGS).sort((a, b) => DOGS[a].displayName.localeCompare(DOGS[b].displayName));
const portrait = dogId => DOGS[dogId]?.portrait.replace(/\.png.*$/, '.webp');

export function GarageScreen({ session, state }) {
  const { user, wallet } = useAccount();
  const owned = wallet?.owned ?? [], equipped = wallet?.equipped ?? {};
  const dogs = DOG_IDS.filter(id => dogUnlocked(id, owned));
  const [dog, setDog] = useState(() => (dogs.includes(state.garageDog) ? state.garageDog : dogs.includes('gsp') ? 'gsp' : dogs[0]));
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  useEffect(() => { account.refresh(); }, []);

  const wearing = cosmeticsFor(dog, owned, equipped);
  const put = async (slot, itemId) => {
    setBusy(true); setProblem('');
    try { await account.equip(dog, slot, itemId); } catch (error) { setProblem(error.message); }
    setBusy(false);
  };
  const forDog = SHOP_ITEMS.filter(item => fitsDog(item, dog));

  return (
    <div className="zr-page">
      <div className="zr-card zr-garage">
        <header className="zr-shop__head">
          <h1>Garage</h1>
          {user ? <Coins amount={wallet?.coins ?? 0} className="zr-coins--purse" /> : null}
        </header>
        {problem && <p className="zr-shop__problem" role="alert">{problem}</p>}
        <div className="zr-garage__body">
          <div className="zr-garage__dogs" role="group" aria-label="Choose a dog">
            {dogs.map(id => (
              <button key={id} className={`zr-garage__dog${id === dog ? ' zr-garage__dog--on' : ''}`} aria-pressed={id === dog} onClick={() => { setDog(id); setProblem(''); }} title={DOGS[id].displayName}>
                <img src={portrait(id)} alt={DOGS[id].displayName} draggable="false" />
              </button>
            ))}
          </div>
          <div className="zr-garage__stage">
            <DogPreview key={dog} dogId={dog} cosmetics={wearing} />
            <h2>{DOGS[dog].displayName}</h2>
          </div>
          <div className="zr-garage__slots">
            {Object.entries(SLOTS).map(([slot, label]) => {
              const mine = forDog.filter(item => item.slot === slot && owned.includes(item.id)), others = forDog.filter(item => item.slot === slot && !owned.includes(item.id));
              return (
                <section key={slot} className="zr-slot" aria-label={label}>
                  <h3>{label}</h3>
                  <div className="zr-slot__items">
                    <button className={`zr-wear${!wearing[slot] ? ' zr-wear--on' : ''}`} aria-pressed={!wearing[slot]} disabled={busy || !user} onClick={() => put(slot, null)}>
                      <span className="zr-item__art zr-item__art--none" aria-hidden="true">∅</span><span>Nothing</span>
                    </button>
                    {mine.map(item => (
                      <button key={item.id} className={`zr-wear${wearing[slot] === item.id ? ' zr-wear--on' : ''}`} aria-pressed={wearing[slot] === item.id} disabled={busy} onClick={() => put(slot, item.id)}>
                        <ItemArt id={item.id} /><span>{item.name}</span>
                      </button>
                    ))}
                    {others.map(item => (
                      <button key={item.id} className="zr-wear zr-wear--shop" onClick={session.openShop} title="In the Shop">
                        <ItemArt id={item.id} /><span>{item.name}</span><Coins amount={item.price} />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!user && <p className="zr-shop__you">Sign in on the home screen to buy things and dress your dogs.</p>}
          </div>
        </div>
        <footer className="zr-shop__foot">
          <button className="zr-btn zr-btn--quiet" data-pad-back="" onClick={session.backToMenu}>← Back</button>
          <button className="zr-btn zr-btn--yellow" data-pad-first="" onClick={session.openShop}>Shop</button>
        </footer>
      </div>
    </div>
  );
}
