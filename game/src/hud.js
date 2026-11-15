// The DOM HUD: top bar (timer, scores, alive counts), health and armour, money, ammo and
// weapon, grenades, killfeed, centre banners, the buy menu, and the start/pause/end
// overlay. It never touches the simulation; main.js pushes state in and reads the play
// and buy callbacks out.
const OVERLAY_COPY = {
  start: {
    title: 'RUSTLINE',
    copy: 'A tactical FPS in a container yard at dusk. You lead Ember: plant the bomb at Site A or eliminate Ash. First to 5 rounds. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'RUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  won: {
    title: 'Match won',
    copy: 'Ember takes the yard.',
    action: 'Play again',
  },
  lost: {
    title: 'Match lost',
    copy: 'Ash holds the yard this time.',
    action: 'Play again',
  },
};

function el(id) {
  return document.getElementById(id);
}

export function createHud({ onPlay, onBuy }) {
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const finalScore = el('final-score');
  const ammoBox = el('ammo');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const healthNum = el('health-num');
  const healthFill = el('health-fill');
  const armorTag = el('armor-tag');
  const money = el('money');
  const timer = el('timer');
  const roundLabel = el('round-label');
  const scoreA = el('score-a');
  const scoreD = el('score-d');
  const aliveA = el('alive-a');
  const aliveD = el('alive-d');
  const feed = el('killfeed');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyMenu = el('buymenu');
  const buyItems = el('buy-items');
  const buyMoney = el('buy-money');
  const hitmarker = el('hitmarker');
  const vignette = el('vignette');
  const plantWrap = el('plantbar');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const spectate = el('spectate');
  const bombTag = el('bombtag');
  const nades = el('nades');
  const crosshair = el('crosshair');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  play.addEventListener('click', onPlay);

  function set(key, node, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      set('mag', ammoMag, String(mag));
      set('reserve', ammoReserve, `/ ${reserve}`);
      set('wname', weaponName, name);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      set('hp', healthNum, String(Math.ceil(hp)));
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.style.background = hp <= 30 ? 'var(--attack)' : 'var(--accent)';
      armorTag.style.visibility = armor ? 'visible' : 'hidden';
    },
    setMoney(n) {
      set('money', money, `$${n}`);
      set('bmoney', buyMoney, `$${n}`);
    },
    setTimer(text, urgent) {
      set('timer', timer, text);
      timer.classList.toggle('urgent', !!urgent);
    },
    setRound(n) {
      set('round', roundLabel, `ROUND ${n} / 9`);
    },
    setScores(a, d, aAlive, dAlive) {
      set('sa', scoreA, String(a));
      set('sd', scoreD, String(d));
      set('aa', aliveA, '●'.repeat(aAlive) + '○'.repeat(Math.max(0, 4 - aAlive)));
      set('ad', aliveD, '●'.repeat(dAlive) + '○'.repeat(Math.max(0, 4 - dAlive)));
    },
    setGrenades(frag, smoke) {
      set('nades', nades, `${frag ? '◉ FRAG' : '◎ FRAG'}   ${smoke ? '◉ SMOKE' : '◎ SMOKE'}`);
    },
    setBombTag(has) {
      bombTag.style.display = has ? 'block' : 'none';
    },
    setSpectate(name) {
      spectate.style.display = name ? 'block' : 'none';
      if (name) set('spec', spectate, `SPECTATING ${name} — click to switch`);
    },
    setPlant(frac, label) {
      if (frac === null) {
        plantWrap.style.display = 'none';
        return;
      }
      plantWrap.style.display = 'block';
      plantFill.style.width = `${Math.round(frac * 100)}%`;
      set('plantlabel', plantLabel, label);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    killfeed(text, cls) {
      const row = document.createElement('div');
      row.className = `feed-row ${cls || ''}`;
      row.textContent = text;
      feed.appendChild(row);
      while (feed.children.length > 5) feed.removeChild(feed.firstChild);
      setTimeout(() => row.classList.add('fade'), 3600);
      setTimeout(() => row.remove(), 4300);
    },
    banner(big, sub, holdMs = 2600) {
      bannerTitle.textContent = big;
      bannerSub.textContent = sub || '';
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : 'translate(-50%, -50%) rotate(45deg)';
      hitmarker.style.setProperty('--hm', killed ? 'var(--attack)' : 'var(--accent)');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), holdMs);
    },
    damageFlash() {
      vignette.classList.remove('on');
      void vignette.offsetWidth;
      vignette.classList.add('on');
    },
    showBuy(items, moneyNow) {
      buyMoney.textContent = `$${moneyNow}`;
      buyItems.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `buy-item ${item.state}`;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">${item.state === 'owned' ? 'OWNED' : `$${item.price}`}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        buyItems.appendChild(row);
      }
      buyMenu.style.display = 'block';
    },
    hideBuy() {
      buyMenu.style.display = 'none';
    },
    buyVisible() {
      return buyMenu.style.display !== 'none';
    },
    showOverlay(mode, a, d) {
      const text = OVERLAY_COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      finalScore.textContent = mode === 'won' || mode === 'lost' ? `Final score — Ember ${a} · Ash ${d}` : '';
      overlay.hidden = false;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
  };
}
