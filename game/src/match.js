// The match: rounds, money, the bomb, and every win condition, in one place. Phases run
// buy (12 s, frozen, shop open) -> live (100 s) -> over (5 s), first team to 5 rounds
// takes the match. The bomb starts on a carrier's back, drops where they fall, and once
// planted the round belongs to the bomb: defenders must defuse it or it decides alone.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const BUY_TIME = 12;
const ROUND_TIME = 100;
const OVER_TIME = 5;
const BOMB_TIME = 40;
const PLANT_TIME = 3.2;
const DEFUSE_TIME = 5;
const WIN_SCORE = 5;
const START_MONEY = 800;
const WIN_PAY = 3250;
const LOSS_PAY = 1400;
const KILL_PAY = 300;
export const ARMOR_PRICE = 650;
export const GRENADE_PRICE = 300;

export function createMatch(world, bots, player, loadout) {
  const wallets = new Map();
  const events = [];
  const noiseEvents = [];

  const playerCombatant = {
    id: 'player',
    name: 'You',
    team: 'attack',
    position: player.state.position,
    alive: true,
    crouching: false,
    speed: () => player.groundSpeed(),
  };

  const match = {
    phase: 'idle',
    phaseT: 0,
    time: 0,
    round: 0,
    scoreA: 0,
    scoreD: 0,
    timer: ROUND_TIME,
    playerHealth: 100,
    playerArmor: false,
    playerHasBomb: false,
    inventory: { frag: 0, smoke: 0 },
    bomb: { state: 'carried', pos: null, carrier: null, timer: 0 },
    plantProgress: 0,
    defuseProgress: 0,
    defuserId: null,
    winner: null,
    winReason: '',
    events,
    onBotShot: null,
    playerCombatant,
    combatants: [playerCombatant, ...bots.bots],
  };

  let lane = 'mid';
  let lurker = null;
  let lurkerNode = 'w3';
  let investigatorId = null;
  let investigateUntil = -1;
  let beepAt = 0;
  let playerSurvived = true;

  function wallet(of) {
    return wallets.get(of) || 0;
  }
  function pay(of, amount) {
    wallets.set(of, wallet(of) + amount);
  }
  Object.defineProperty(match, 'playerMoney', { get: () => wallet(playerCombatant) });

  function aliveCount(team) {
    return match.combatants.filter((c) => c.team === team && c.alive).length;
  }
  match.aliveCount = aliveCount;

  function botBuy(bot) {
    const money = wallet(bot);
    let weaponId = 'pistol';
    let armor = false;
    if (money >= WEAPONS.rifle.price + ARMOR_PRICE) { weaponId = 'rifle'; armor = true; }
    else if (money >= WEAPONS.smg.price + ARMOR_PRICE) { weaponId = 'smg'; armor = true; }
    else if (money >= WEAPONS.shotgun.price) weaponId = 'shotgun';
    else if (money >= WEAPONS.smg.price) weaponId = 'smg';
    else if (money >= ARMOR_PRICE) armor = true;
    pay(bot, -(WEAPONS[weaponId].price + (armor ? ARMOR_PRICE : 0)));
    return { weaponId, armor };
  }

  function setupRound() {
    match.round += 1;
    match.phase = 'buy';
    match.phaseT = BUY_TIME;
    match.timer = ROUND_TIME;
    match.plantProgress = 0;
    match.defuseProgress = 0;
    match.defuserId = null;
    investigatorId = null;
    noiseEvents.length = 0;

    // Death costs the player their kit; surviving keeps it. Ammo is always refilled.
    if (!playerSurvived) {
      for (const id of Object.keys(loadout.state.owned)) if (id !== 'pistol') delete loadout.state.owned[id];
      loadout.select('pistol');
      match.playerArmor = false;
      match.inventory = { frag: 0, smoke: 0 };
    }
    loadout.refillAll();
    match.playerHealth = 100;
    playerCombatant.alive = true;
    playerSurvived = true;

    const setup = {};
    bots.bots.forEach((bot, i) => {
      const bought = botBuy(bot);
      const spawn = bot.team === 'attack' ? world.spawns.attack[i % 3] : world.spawns.defend[i - 3];
      setup[bot.id] = { spawn, yaw: bot.team === 'attack' ? 0 : Math.PI, weaponId: bought.weaponId, armor: bought.armor };
    });
    bots.reset(setup);
    player.spawnAt(world.spawns.attack[3], 0);

    // The plan: one lane for the push, one lurker elsewhere, a carrier for the bomb.
    const lanes = ['west', 'mid', 'east'];
    lane = lanes[Math.floor(Math.random() * lanes.length)];
    const attackers = bots.bots.filter((b) => b.team === 'attack');
    const carrierBot = Math.random() < 0.68 ? attackers[Math.floor(Math.random() * attackers.length)] : null;
    lurker = attackers.find((b) => b !== carrierBot) || null;
    lurkerNode = lane === 'west' ? 'm4' : 'w3';
    if (carrierBot) {
      carrierBot.hasBomb = true;
      match.bomb = { state: 'carried', pos: null, carrier: carrierBot };
      match.playerHasBomb = false;
    } else {
      match.bomb = { state: 'carried', pos: null, carrier: playerCombatant };
      match.playerHasBomb = true;
    }
    events.push({ type: 'roundStart', round: match.round, carrier: match.bomb.carrier });
  }

  match.startMatch = function startMatch() {
    match.scoreA = 0;
    match.scoreD = 0;
    match.round = 0;
    match.winner = null;
    wallets.clear();
    for (const c of match.combatants) wallets.set(c, START_MONEY);
    playerSurvived = true;
    setupRound();
  };

  match.buy = function buy(id) {
    if (match.phase !== 'buy' || !playerCombatant.alive) return false;
    const money = wallet(playerCombatant);
    if (WEAPONS[id]) {
      if (loadout.state.owned[id] || money < WEAPONS[id].price) return false;
      pay(playerCombatant, -WEAPONS[id].price);
      loadout.give(id);
      loadout.select(id);
      return true;
    }
    if (id === 'armor') {
      if (match.playerArmor || money < ARMOR_PRICE) return false;
      pay(playerCombatant, -ARMOR_PRICE);
      match.playerArmor = true;
      return true;
    }
    if (id === 'frag' || id === 'smoke') {
      if (match.inventory[id] >= 1 || money < GRENADE_PRICE) return false;
      pay(playerCombatant, -GRENADE_PRICE);
      match.inventory[id] += 1;
      return true;
    }
    return false;
  };

  match.consumeGrenade = function consumeGrenade(kind) {
    if (match.inventory[kind] <= 0) return false;
    match.inventory[kind] -= 1;
    return true;
  };

  match.noise = function noise(pos, team) {
    noiseEvents.push({ pos: pos.clone(), team, t: match.time });
    if (noiseEvents.length > 24) noiseEvents.shift();
  };

  match.dealDamage = function dealDamage(victim, dmg, attacker, part) {
    if (!victim || !victim.alive || dmg <= 0) return false;
    if (victim === playerCombatant) {
      const final = dmg * (match.playerArmor ? 0.55 : 1);
      match.playerHealth -= final;
      events.push({ type: 'playerHurt', amount: final, fromPos: attacker ? attacker.position : null });
      if (match.playerHealth <= 0) {
        match.playerHealth = 0;
        playerCombatant.alive = false;
        playerSurvived = false;
        if (match.playerHasBomb) dropBomb(player.state.position);
        events.push({ type: 'kill', attacker, victim: playerCombatant, part });
        if (attacker && attacker !== playerCombatant) pay(attacker, KILL_PAY);
        return true;
      }
      return false;
    }
    const final = dmg * (victim.armor ? 0.55 : 1);
    victim.health -= final;
    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      victim.deathAt = match.time;
      if (victim.hasBomb) {
        victim.hasBomb = false;
        dropBomb(victim.position);
      }
      if (attacker && attacker !== victim) pay(attacker, KILL_PAY);
      events.push({ type: 'kill', attacker, victim, part });
      return true;
    }
    return false;
  };

  function dropBomb(at) {
    match.bomb = { state: 'dropped', pos: new THREE.Vector3(at.x, 0, at.z), carrier: null };
    match.playerHasBomb = false;
    events.push({ type: 'bombDropped', pos: match.bomb.pos });
  }

  function endRound(winner, reason) {
    match.phase = 'over';
    match.phaseT = OVER_TIME;
    match.winner = winner;
    match.winReason = reason;
    if (winner === 'attack') match.scoreA += 1;
    else match.scoreD += 1;
    for (const c of match.combatants) {
      if (c.team === winner) pay(c, WIN_PAY);
      else pay(c, LOSS_PAY);
      if (match.bomb.state === 'planted' || reason === 'explosion') {
        if (c.team === 'attack') pay(c, 250);
      }
    }
    events.push({ type: 'roundEnd', winner, reason });
  }

  function plantBomb(at) {
    match.bomb = { state: 'planted', pos: at.clone(), carrier: null, timer: BOMB_TIME };
    match.playerHasBomb = false;
    match.plantProgress = 0;
    beepAt = match.time + 1;
    pickDefuser();
    events.push({ type: 'bombPlanted', pos: match.bomb.pos });
  }

  function pickDefuser() {
    let best = null;
    let bestDist = Infinity;
    for (const bot of bots.bots) {
      if (bot.team !== 'defend' || !bot.alive) continue;
      const d = bot.position.distanceTo(match.bomb.pos || world.plantSpot);
      if (d < bestDist) {
        bestDist = d;
        best = bot;
      }
    }
    match.defuserId = best ? best.id : null;
  }

  const botCtx = {
    get time() { return match.time; },
    get phase() { return match.phase; },
    combatants: match.combatants,
    bomb: match.bomb,
    holds: world.holds,
    get defuserId() { return match.defuserId; },
    attackDest(bot) {
      if (bot === lurker) return world.nodes.get(lurkerNode);
      const idx = bots.bots.filter((b) => b.team === 'attack').indexOf(bot);
      return world.nodes.get(world.holds.attack[idx % world.holds.attack.length]);
    },
    recentNoise(pos, range) {
      for (let i = noiseEvents.length - 1; i >= 0; i -= 1) {
        const ev = noiseEvents[i];
        if (ev.team !== 'attack') continue;
        if (match.time - ev.t > 6) continue;
        if (ev.pos.distanceTo(pos) <= range) return ev.pos;
      }
      return null;
    },
    claimInvestigator(bot) {
      if (investigatorId === bot.id) return match.time < investigateUntil;
      if (!investigatorId || match.time >= investigateUntil) {
        investigatorId = bot.id;
        investigateUntil = match.time + 9;
        return true;
      }
      return false;
    },
    dealDamage: (victim, dmg, attacker, part) => match.dealDamage(victim, dmg, attacker, part),
    reportShot: (bot, muzzle, targetPoint) => {
      match.noise(bot.position, bot.team);
      if (match.onBotShot) match.onBotShot(bot, muzzle, targetPoint);
    },
  };

  match.update = function update(dt, hooks = {}) {
    match.time += dt;
    // Keep the bot context's bomb view pointing at the live bomb object.
    botCtx.bomb = match.bomb;
    playerCombatant.crouching = player.state.crouching;

    if (match.phase === 'buy') {
      match.phaseT -= dt;
      if (match.phaseT <= 0) {
        match.phase = 'live';
        events.push({ type: 'roundLive' });
      }
    } else if (match.phase === 'live') {
      updateLive(dt, hooks);
    } else if (match.phase === 'over') {
      match.phaseT -= dt;
      if (match.phaseT <= 0) {
        if (match.scoreA >= WIN_SCORE || match.scoreD >= WIN_SCORE || match.round >= 9) {
          match.phase = 'matchover';
          events.push({ type: 'matchEnd', winner: match.scoreA > match.scoreD ? 'attack' : 'defend' });
        } else {
          setupRound();
        }
      }
    }
    bots.update(dt, botCtx);
  };

  function updateLive(dt, hooks) {
    const bomb = match.bomb;
    if (bomb.state !== 'planted') {
      match.timer -= dt;
      if (match.timer <= 0) {
        endRound('defend', 'time');
        return;
      }
    }

    // Bomb pickup: any living attacker who walks over a dropped bomb takes it.
    if (bomb.state === 'dropped') {
      for (const c of match.combatants) {
        if (c.team !== 'attack' || !c.alive) continue;
        if (Math.hypot(c.position.x - bomb.pos.x, c.position.z - bomb.pos.z) < 1.3) {
          bomb.state = 'carried';
          bomb.carrier = c;
          bomb.pos = null;
          if (c === playerCombatant) match.playerHasBomb = true;
          else c.hasBomb = true;
          events.push({ type: 'bombPickup', who: c });
          break;
        }
      }
    }

    // Planting: the carrier channels at the plant spot (a bot's intent, or the player
    // holding the use key inside the site).
    if (bomb.state === 'carried') {
      let channeling = false;
      if (bomb.carrier === playerCombatant) {
        const p = player.state.position;
        channeling = !!hooks.playerPlanting
          && p.x > world.site.minX && p.x < world.site.maxX && p.z > world.site.minZ && p.z < world.site.maxZ;
        if (channeling) {
          match.plantProgress += dt;
          if (match.plantProgress >= PLANT_TIME) plantBomb(new THREE.Vector3(p.x, 0, p.z));
        }
      } else if (bomb.carrier) {
        channeling = bomb.carrier.intent === 'plant';
        if (channeling) {
          match.plantProgress += dt;
          if (match.plantProgress >= PLANT_TIME) plantBomb(world.plantSpot.clone());
        }
      }
      if (!channeling) match.plantProgress = Math.max(0, match.plantProgress - dt * 2);
    }

    if (bomb.state === 'planted') {
      bomb.timer -= dt;
      if (match.time >= beepAt) {
        const urgent = bomb.timer < 10;
        events.push({ type: 'bombBeep', final: bomb.timer < 1.2 });
        beepAt = match.time + (urgent ? 0.42 : 0.95);
      }
      // Defusing: the designated defender channels at the bomb.
      const defuser = bots.bots.find((b) => b.id === match.defuserId);
      if (!defuser || !defuser.alive) pickDefuser();
      else if (defuser.intent === 'defuse') {
        match.defuseProgress += dt;
        if (match.defuseProgress >= DEFUSE_TIME) {
          bomb.state = 'done';
          endRound('defend', 'defuse');
          return;
        }
      } else {
        match.defuseProgress = Math.max(0, match.defuseProgress - dt * 2);
      }
      if (bomb.timer <= 0) {
        bomb.state = 'done';
        events.push({ type: 'bombExploded', pos: bomb.pos });
        for (const c of match.combatants) {
          if (c.alive && bomb.pos && c.position.distanceTo(bomb.pos) < 7) match.dealDamage(c, 500, null, 'torso');
        }
        endRound('attack', 'explosion');
        return;
      }
    }

    // Elimination.
    const aAlive = aliveCount('attack');
    const dAlive = aliveCount('defend');
    if (dAlive === 0) {
      endRound('attack', 'elimination');
    } else if (aAlive === 0 && bomb.state !== 'planted') {
      endRound('defend', 'elimination');
    }
  }

  match.spectateTarget = function spectateTarget() {
    if (playerCombatant.alive) return null;
    return bots.bots.find((b) => b.team === 'attack' && b.alive) || null;
  };

  match.inSite = function inSite(pos) {
    return pos.x > world.site.minX && pos.x < world.site.maxX && pos.z > world.site.minZ && pos.z < world.site.maxZ;
  };

  return match;
}
