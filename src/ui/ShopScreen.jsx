import { useEffect, useState } from 'react';
import { DOGS } from '../config/dogs.js';
import { SHOP_ITEMS, SLOTS, PLACE_COINS } from '../../shared/shop.js';
import { account } from '../session/account.js';
import { useAccount } from './useAccount.js';
import { Coins, ItemArt } from './shopArt.jsx';

// The Shop (Tom, 2026-11-26): spend the coins races pay on characters, skins and things to wear.  What is bought is put on in
// the Garage.  The prices and what a race pays are in shared/shop.js; the server does the buying (server/db.js `buy`).
const SHELVES = [
  { kind: 'character', title: 'Characters', note: 'New dogs to race as' },
  { kind: 'skin', title: 'Skins', note: 'A whole new look for a dog' },
  { kind: 'accessory', title: 'Accessories', note: 'Hats, coats and other silly things' },
];
const fits = item => (item.kind !== 'accessory' ? null : item.dogs ? `For ${item.dogs.map(dog => DOGS[dog]?.displayName ?? dog).join(', ')} · ${SLOTS[item.slot]}` : `For every dog · ${SLOTS[item.slot]}`);

export function ShopScreen({ session }) {
  const { user, wallet } = useAccount();
  const [busy, setBusy] = useState(null), [problem, setProblem] = useState(''), [bought, setBought] = useState(null);
  useEffect(() => { account.refresh(); }, []);          // (the purse as it is now)

  const coins = wallet?.coins ?? 0, owned = wallet?.owned ?? [];
  const buy = async (item) => {
    setBusy(item.id); setProblem(''); setBought(null);
    try { await account.buy(item.id); setBought(item); } catch (error) { setProblem(error.message); }
    setBusy(null);
  };

  return (
    <div className="zr-page">
      <div className="zr-card zr-shop">
        <header className="zr-shop__head">
          <h1>Shop</h1>
          {user ? <Coins amount={coins} className="zr-coins--purse" /> : null}
        </header>
        <p className="zr-shop__you">
          {user ? <>Win coins by racing: <b>{PLACE_COINS[0]}</b> for a win down to <b>{PLACE_COINS.at(-1)}</b> for last, and less against easier computer dogs.</>
            : 'Sign in on the home screen to win coins from your races and spend them here.'}
        </p>
        {problem && <p className="zr-shop__problem" role="alert">{problem}</p>}
        {bought && (
          <p className="zr-shop__bought" role="status">
            <b>{bought.name}</b> is yours!{' '}
            {bought.kind === 'character' ? 'Pick them on the dog screen.' : <button className="zr-link" onClick={() => session.openGarage(bought.dogs?.[0] ?? null)}>Put it on in the Garage →</button>}
          </p>
        )}
        <div className="zr-shop__body">
          {SHELVES.map((shelf) => {
            const items = SHOP_ITEMS.filter(item => item.kind === shelf.kind);
            return (
              <section key={shelf.kind} className="zr-shelf" aria-label={shelf.title}>
                <h2>{shelf.title}<small>{shelf.note}</small></h2>
                {items.length === 0 ? <p className="zr-shelf__empty">Coming soon</p> : (
                  <div className="zr-shelf__items">
                    {items.map((item) => {
                      const mine = owned.includes(item.id), short = item.price - coins;
                      return (
                        <article key={item.id} className={`zr-item${mine ? ' zr-item--owned' : ''}`}>
                          <ItemArt id={item.id} />
                          <h3>{item.name}</h3>
                          <p>{item.blurb}</p>
                          {fits(item) && <p className="zr-item__fits">{fits(item)}</p>}
                          {mine ? <span className="zr-item__owned">Owned ✓</span> : (
                            <button className="zr-btn zr-btn--yellow zr-btn--small" disabled={!user || busy !== null || short > 0} onClick={() => buy(item)}
                              aria-label={`Buy ${item.name} for ${item.price} coins`}>
                              <Coins amount={item.price} />
                            </button>
                          )}
                          {!mine && user && short > 0 && <small className="zr-item__short">{short.toLocaleString('en-GB')} more to go</small>}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <footer className="zr-shop__foot">
          <button className="zr-btn zr-btn--quiet" data-pad-back="" onClick={session.backToMenu}>← Back</button>
          <button className="zr-btn" data-pad-first="" onClick={() => session.openGarage()}>Garage</button>
        </footer>
      </div>
    </div>
  );
}
