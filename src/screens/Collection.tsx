import { useEffect, useState } from 'react';
import { net } from '../net/connection';
import type { Catalog, Profile, SkinDef } from '../net/protocol';
import { HEROES, HERO_ORDER, ROLE_ICON } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { HeroStage } from '../ui/HeroStage';
import { Coins } from '../ui/Bits';
import { TIER_COLOR, TIER_NAME, skinLook } from '../game/skins';
import { sfx } from '../game/audio';
import { buzz } from '../game/settings';
import type { HeroId } from '../game/types';

/** The heroes and their skins: see them, buy them with coins, choose what each hero wears. Buying asks twice. */
export function Collection({ catalog, profile }: { catalog: Catalog; profile: Profile }) {
  const shop = catalog.shop;
  const [sel, setSel] = useState<HeroId>(() => HERO_ORDER.find(h => !profile.heroes.includes(h)) ?? 'mira');
  const [skin, setSkin] = useState<string | null>(profile.equipped[sel] ?? null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  useEffect(() => { setSkin(profile.equipped[sel] ?? null); setConfirm(null); setMsg(null); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = catalog.heroes.find(h => h.id === sel)!;
  const owned = profile.heroes.includes(sel), free = profile.rotation.includes(sel);
  const price = shop.heroPrices[sel] ?? 0;
  const skins = shop.skins.filter(s => s.hero === sel);
  const skinDef = skins.find(s => s.id === skin);
  const skinOwned = !skin || profile.skins.includes(skin);
  const equipped = (profile.equipped[sel] ?? null) === skin;

  const act = async (key: string, fn: () => Promise<string | null>, done: string) => {
    if (confirm !== key) { setConfirm(key); sfx.play('page'); return; }
    setConfirm(null);
    const e = await fn();
    if (e) { setMsg({ text: e, good: false }); sfx.play('nope'); }
    else { setMsg({ text: done, good: true }); sfx.play('questDone'); buzz([20, 40, 30]); }
  };
  const equip = async () => {
    const e = await net.equipSkin(sel, skin);
    setMsg(e ? { text: e, good: false } : { text: `${def.name} now wears ${skinDef?.name ?? 'the classic look'}.`, good: true });
    sfx.play(e ? 'nope' : 'learn');
  };

  return (
    <div className="collection">
      <div className="coll-grid">
        {HERO_ORDER.map(id => {
          const h = catalog.heroes.find(x => x.id === id)!;
          const own = profile.heroes.includes(id), rot = profile.rotation.includes(id);
          const nSkins = profile.skins.filter(s => s.startsWith(id + '_')).length;
          return (
            <button key={id} className={`hero-card ${sel === id ? 'on' : ''} ${own ? '' : 'locked'}`} style={{ ['--hc' as string]: HEROES[id].color }} onClick={() => { setSel(id); sfx.play('page'); }}>
              <img src={heroBust(id, profile.equipped[id])} alt="" />
              <b>{h.name}</b>
              <small>{own ? `${nSkins}/3 skins` : rot ? 'Free this week' : <Coins value={shop.heroPrices[id]} />}</small>
              {!own && <em className={rot ? 'free' : ''}>{rot ? 'Free' : '🔒'}</em>}
            </button>
          );
        })}
      </div>

      <article className="coll-detail parchment">
        <div className="coll-top">
          <HeroStage hero={sel} skin={skin} size={150} />
          <div className="coll-info">
            <h1>{skinDef?.name ?? def.name}</h1>
            <h4>{skinDef ? <span style={{ color: TIER_COLOR[skinDef.tier] }}>{TIER_NAME[skinDef.tier]} skin · {def.name}</span> : <>{def.title} · {ROLE_ICON[def.role]} {def.role}</>}</h4>
            <p className="blurb">{HEROES[sel].blurb}</p>
            <div className="coll-actions">
              {!owned ? (
                <button className={`btn primary ${confirm === 'hero' ? 'confirm' : ''}`} disabled={profile.coins < price} onClick={() => act('hero', () => net.buyHero(sel), `${def.name} joins your heroes!`)}>
                  {confirm === 'hero' ? 'Tap again to buy' : `Unlock ${def.name}`} <Coins value={price} />
                </button>
              ) : !skinOwned && skinDef ? (
                <button className={`btn primary ${confirm === skinDef.id ? 'confirm' : ''}`} disabled={profile.coins < skinDef.price} onClick={() => act(skinDef.id, () => net.buySkin(skinDef.id), `${skinDef.name} is yours — and equipped!`)}>
                  {confirm === skinDef.id ? 'Tap again to buy' : 'Buy skin'} <Coins value={skinDef.price} />
                </button>
              ) : equipped ? <span className="equipped">✓ Equipped</span> : <button className="btn" onClick={equip}>Wear this look</button>}
              {!owned && free && <small className="hint dark">Free to play this week — unlock to keep it.</small>}
              {((!owned && profile.coins < price) || (owned && !skinOwned && skinDef && profile.coins < skinDef.price)) && <small className="hint dark">Win matches to earn coins.</small>}
            </div>
            {msg && <p className={msg.good ? 'ok-msg' : 'err'}>{msg.text}</p>}
          </div>
        </div>
        <div className="skin-row">
          <SkinCard hero={sel} skin={null} name="Classic" owned picked={skin === null} worn={!profile.equipped[sel]} onPick={() => { setSkin(null); setConfirm(null); }} />
          {skins.map(s => <SkinCard key={s.id} hero={sel} skin={s.id} def={s} name={s.name} owned={profile.skins.includes(s.id)} picked={skin === s.id} worn={profile.equipped[sel] === s.id} onPick={() => { setSkin(s.id); setConfirm(null); sfx.play('page'); }} />)}
        </div>
      </article>
    </div>
  );
}

function SkinCard({ hero, skin, def, name, owned, picked, worn, onPick }: { hero: HeroId; skin: string | null; def?: SkinDef; name: string; owned: boolean; picked: boolean; worn: boolean; onPick: () => void }) {
  const look = skinLook(skin), tier = def?.tier;
  return (
    <button className={`skin-card ${picked ? 'on' : ''} ${tier ?? 'classic'}`} style={{ ['--tc' as string]: tier ? TIER_COLOR[tier] : '#cdbcb6', ['--ac' as string]: look?.accent ?? '#fff1d6' }} onClick={onPick}>
      <img src={heroBust(hero, skin)} alt="" />
      <b>{name}</b>
      <small>{worn ? '✓ Worn' : owned ? 'Owned' : def ? <Coins value={def.price} /> : ''}</small>
      {tier && <i className="tier">{TIER_NAME[tier]}</i>}
    </button>
  );
}
