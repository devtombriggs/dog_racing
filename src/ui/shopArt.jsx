import { DOGS } from '../config/dogs.js';
import { SHOP_ITEM } from '../../shared/shop.js';

// Pictures for the Shop and the Garage: the coin, and each thing that can be bought.
export const Coin = ({ className = '' }) => <img className={`zr-coin ${className}`} src="/ui/coin.webp" alt="" draggable="false" />;
/** An amount of coins, with the coin beside it */
export const Coins = ({ amount, className = '' }) => (
  <span className={`zr-coins ${className}`}><Coin /><b>{Number(amount ?? 0).toLocaleString('en-GB')}</b><span className="zr-sr"> coins</span></span>
);

const portrait = dogId => DOGS[dogId]?.portrait.replace(/\.png.*$/, '.webp');
const DRAWN = {
  hat_santa: (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <path d="M18 66c6-30 24-48 46-46 12 1 20 10 22 22l-10 6c-3-8-8-12-14-12 8 10 12 20 12 32z" fill="#d3202d" stroke="#14224f" strokeWidth="4" strokeLinejoin="round" />
      <rect x="10" y="62" width="70" height="18" rx="9" fill="#f6f4ee" stroke="#14224f" strokeWidth="4" />
      <circle cx="80" cy="46" r="9" fill="#f6f4ee" stroke="#14224f" strokeWidth="4" />
    </svg>
  ),
  coat_pippa: (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <path d="M14 34c10-12 26-16 40-14l20 4c8 2 12 8 12 16v22c0 6-4 10-10 10H30c-10 0-18-8-18-18z" fill="#d3202d" stroke="#14224f" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 44h56M22 58h56M36 24v48M58 22v50" stroke="#a5121d" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 34c10-12 26-16 40-14l20 4" fill="none" stroke="#f3e6c8" strokeWidth="5" strokeLinecap="round" />
      <rect x="40" y="68" width="18" height="12" rx="4" fill="#f3e6c8" stroke="#14224f" strokeWidth="4" />
    </svg>
  ),
};
/** The picture of something from the shop: a dog's portrait for a character, a drawing for anything worn */
export function ItemArt({ id }) {
  const item = SHOP_ITEM[id];
  if (item?.kind === 'character') return <img className="zr-item__art zr-item__art--dog" src={portrait(item.dog)} alt="" draggable="false" />;
  return <span className="zr-item__art">{DRAWN[id] ?? <Coin />}</span>;
}
