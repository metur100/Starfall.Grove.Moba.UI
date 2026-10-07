// Small pieces shared by the menus: coins, a rank badge, the level bar.

const RANK_COLOR: Record<string, string> = {
  Seedling: '#9fbf7a', Sapling: '#6fae5a', Grovekeeper: '#5aa8a0', Starlit: '#7f9cff', Astral: '#b98aff', Celestial: '#ffcf5a',
};
const RANK_ICON: Record<string, string> = { Seedling: '❦', Sapling: '✿', Grovekeeper: '♣', Starlit: '✦', Astral: '✷', Celestial: '☀' };

export const fmtCoins = (n: number) => n.toLocaleString('en-US');

export function Coins({ value, big = false, delta = false }: { value: number; big?: boolean; delta?: boolean }) {
  return <span className={`coins ${big ? 'big' : ''}`}><i>◉</i>{delta && value > 0 ? '+' : ''}{fmtCoins(value)}</span>;
}

export function RankBadge({ rank, rating, small = false }: { rank: string; rating?: number; small?: boolean }) {
  return (
    <span className={`rank ${small ? 'small' : ''}`} style={{ ['--rk' as string]: RANK_COLOR[rank] ?? '#cdbcb6' }}>
      <i>{RANK_ICON[rank] ?? '✦'}</i><b>{rank}</b>{rating != null && <small>{rating}</small>}
    </span>
  );
}

export function XpBar({ level, xp, next }: { level: number; xp: number; next: number }) {
  return (
    <span className="xpbar" title={`${xp} / ${next} XP`}>
      <em>Lv {level}</em><span><i style={{ width: `${Math.min(100, xp / Math.max(1, next) * 100)}%` }} /></span>
    </span>
  );
}
