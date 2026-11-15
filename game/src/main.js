// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js owns the player's gun (the ray, the tracers, the recoil), the camera
// (the player's eyes, or a spectate chase when they are down), the bomb's body in the
// world, and the wiring between the match's events and the HUD and the sound.
// ?shot=start|buy|play|end with &seed=N stages a deterministic scene for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout, WEAPONS, WEAPON_ORDER, damageAt, HEAD_MULT } from './weapons.js';
import { createGrenades, FRAG_RADIUS } from './grenades.js';
import { createBots } from './bots.js';
import { createMatch, ARMOR_PRICE, GRENADE_PRICE } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 88);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);
// A soft light riding the camera, so the held weapon reads against dark corners.
const weaponLight = new THREE.PointLight(new THREE.Color(PALETTE.ink), 2.2, 4.5, 1.6);
weaponLight.position.set(0.15, 0.05, 0.1);
camera.add(weaponLight);

const audio = createAudio();
const world = createWorld(scene);
const bots = createBots(scene, world);
const player = createPlayer(world.colliders);
const loadout = createLoadout(camera);
const hud = createHud({ onPlay: onPlayButton, onBuy: (id) => buy(id) });
const input = createInput(renderer.domElement, onLockChange);
const match = createMatch(world, bots, player, loadout);
const grenades = createGrenades(scene, world, {
  onThrow: () => audio.throwIt(),
  onSmoke: () => {},
  onExplode: (pos) => explodeAt(pos),
});

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const body = player.state;
const pc = match.playerCombatant;

// The bomb as a thing in the world: a dark case with a light that blinks faster as the
// timer runs down. Carried, it rides on the carrier's back; dropped or planted, it sits.
const bombGroup = new THREE.Group();
const bombCase = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.3, 0.16),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.5, metalness: 0.3 }),
);
const bombLampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.attack) });
const bombLamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), bombLampMat);
bombLamp.position.set(0.12, 0.19, 0);
bombGroup.add(bombCase, bombLamp);
scene.add(bombGroup);

// Tracers: a small pool of stretched boxes that live for a few frames per shot.
const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.5, depthWrite: false });
const tracers = [];
for (let i = 0; i < 28; i += 1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 1), tracerMat.clone());
  mesh.visible = false;
  scene.add(mesh);
  tracers.push({ mesh, until: 0 });
}
let tracerAt = 0;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function drawTracer(from, to, now, holdSeconds = 0.055) {
  const t = tracers[tracerAt];
  tracerAt = (tracerAt + 1) % tracers.length;
  const len = from.distanceTo(to);
  t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
  t.mesh.scale.set(1, 1, len);
  t.mesh.lookAt(to);
  t.mesh.visible = true;
  t.until = now + holdSeconds;
}

match.onBotShot = (bot, muzzle, targetPoint) => {
  drawTracer(muzzle, targetPoint, match.time);
  audio.shot(WEAPONS[bot.weaponId].sound, muzzle.distanceTo(body.position));
};

function explodeAt(pos) {
  audio.explosion(pos.distanceTo(body.position));
  shake = Math.min(1, 9 / Math.max(3, pos.distanceTo(body.position)));
  for (const c of match.combatants) {
    if (!c.alive) continue;
    tmpA.set(c.position.x, c.position.y + 1.1, c.position.z);
    const dist = tmpA.distanceTo(pos);
    if (dist > FRAG_RADIUS) continue;
    // Cover counts: no line from the burst to the chest, no damage.
    tmpDir.subVectors(tmpA, pos).normalize();
    raycaster.set(pos, tmpDir);
    raycaster.far = dist - 0.2;
    const blocked = raycaster.intersectObjects(world.shootables, false).length > 0;
    raycaster.far = 90;
    if (blocked) continue;
    const dmg = 105 * (1 - dist / (FRAG_RADIUS * 1.25));
    match.dealDamage(c, dmg, pc, 'torso');
  }
}

let started = false;
let buyOpen = false;
let buySignature = '';
let prevFiring = false;
let throwCooldown = 0;
let hurtSoundAt = 0;
let shake = 0;
let aiming = false;
let spectateIndex = 0;
let lastClicks = 0;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

window.addEventListener('mousedown', (e) => {
  if (e.button === 2) aiming = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) aiming = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

function onPlayButton() {
  if (shot) return;
  audio.wake();
  if (!started || match.phase === 'matchover' || match.phase === 'idle') {
    started = true;
    match.startMatch();
  }
  input.requestLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (started && match.phase !== 'matchover') {
    hud.showOverlay('paused', match.scoreA, match.scoreD);
    buyOpen = false;
    hud.hideBuy();
  }
}

function buy(id) {
  if (match.buy(id)) audio.buy();
  else audio.denied();
  buySignature = '';
}

const BUY_LIST = [
  ...WEAPON_ORDER.filter((id) => id !== 'pistol').map((id, i) => ({ id, key: String(i + 1), name: WEAPONS[id].name, price: WEAPONS[id].price })),
  { id: 'armor', key: '5', name: 'Kevlar Vest', price: ARMOR_PRICE },
  { id: 'frag', key: '6', name: 'Frag Grenade', price: GRENADE_PRICE },
  { id: 'smoke', key: '7', name: 'Smoke Grenade', price: GRENADE_PRICE },
];

function refreshBuy() {
  const items = BUY_LIST.map((item) => {
    let state = 'ok';
    if (item.id === 'armor' && match.playerArmor) state = 'owned';
    else if ((item.id === 'frag' || item.id === 'smoke') && match.inventory[item.id] >= 1) state = 'owned';
    else if (WEAPONS[item.id] && loadout.state.owned[item.id]) state = 'owned';
    else if (match.playerMoney < item.price) state = 'poor';
    return { ...item, state };
  });
  const signature = items.map((i) => i.state).join(',') + match.playerMoney;
  if (signature === buySignature) return;
  buySignature = signature;
  hud.showBuy(items, match.playerMoney);
}

function syncCamera() {
  if (!pc.alive && started && !shot) {
    const mates = bots.bots.filter((b) => b.team === 'attack' && b.alive);
    if (mates.length) {
      if (input.state.clicks !== lastClicks) {
        spectateIndex = (spectateIndex + 1) % mates.length;
        lastClicks = input.state.clicks;
      }
      const target = mates[spectateIndex % mates.length];
      tmpA.set(target.position.x + Math.sin(target.yaw) * 3.4, 2.3, target.position.z + Math.cos(target.yaw) * 3.4);
      camera.position.lerp(tmpA, 0.12);
      tmpB.set(target.position.x - Math.sin(target.yaw) * 6, 1.2, target.position.z - Math.cos(target.yaw) * 6);
      camera.lookAt(tmpB);
      hud.setSpectate(target.name);
      return;
    }
  }
  hud.setSpectate(null);
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  if (shake > 0.01) {
    camera.position.x += (random() - 0.5) * shake * 0.14;
    camera.position.y += (random() - 0.5) * shake * 0.14;
  }
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function playerShoot() {
  const def = loadout.def();
  const slot = loadout.ammoOf(loadout.state.current);
  if (slot.mag <= 0) {
    audio.dryFire();
    loadout.state.cooldown = 0.3;
    return;
  }
  loadout.pullTrigger();
  audio.shot(def.sound, 0);
  match.noise(body.position, 'attack');
  camera.getWorldDirection(tmpDir);
  const muzzle = tmpA.copy(camera.position).addScaledVector(tmpDir, 0.7);
  muzzle.y -= 0.12;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < def.pellets; p += 1) {
    const spread = loadout.spread(player.groundSpeed());
    tmpB.copy(tmpDir);
    tmpB.x += (random() * 2 - 1) * spread;
    tmpB.y += (random() * 2 - 1) * spread;
    tmpB.z += (random() * 2 - 1) * spread;
    tmpB.normalize();
    raycaster.set(camera.position, tmpB);
    raycaster.far = 90;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const end = hit ? hit.point : tmpB.multiplyScalar(70).add(camera.position);
    drawTracer(muzzle, end, elapsed);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const dmg = damageAt(def, hit.distance) * (part === 'head' ? HEAD_MULT : part === 'legs' ? 0.75 : 1);
      const killed = match.dealDamage(bot, dmg, pc, part);
      anyHit = true;
      anyKill = anyKill || killed;
    }
  }
  if (anyHit) {
    hud.hitMarker(anyKill, shot ? 4000 : 100);
    audio.hit(anyKill);
  }
  player.recoil(def.kick * (0.8 + random() * 0.5), (random() * 2 - 1) * def.kick * 0.4);
  hud.setAmmo(loadout.ammoOf(loadout.state.current).mag, loadout.ammoOf(loadout.state.current).reserve, def.name);
}

function throwGrenade(kind) {
  if (throwCooldown > 0 || !pc.alive) return;
  if (!match.consumeGrenade(kind)) {
    audio.denied();
    return;
  }
  throwCooldown = 0.65;
  camera.getWorldDirection(tmpDir);
  tmpA.copy(camera.position).addScaledVector(tmpDir, 0.45);
  grenades.throwOne(kind, tmpA, tmpDir.clone());
}

function drainEvents() {
  for (const ev of match.events.splice(0)) {
    if (ev.type === 'kill') {
      const a = ev.attacker ? ev.attacker.name : 'The bomb';
      const head = ev.part === 'head' ? ' ⌖' : '';
      hud.killfeed(`${a} ▸ ${ev.victim.name}${head}`, ev.attacker && ev.attacker.team === 'attack' ? 'feed-a' : 'feed-d');
      if (ev.victim === pc) hud.banner('YOU ARE DOWN', 'Spectating your team until the round ends', 2200);
    } else if (ev.type === 'playerHurt') {
      hud.damageFlash();
      if (elapsed - hurtSoundAt > 0.12) {
        audio.hurt();
        hurtSoundAt = elapsed;
      }
    } else if (ev.type === 'roundStart') {
      hud.banner(`ROUND ${ev.round}`, ev.carrier === pc ? 'You carry the bomb — plant it at Site A' : 'Buy phase — press B', 2400);
      buyOpen = true;
    } else if (ev.type === 'roundLive') {
      hud.banner('GO', '', 700);
      buyOpen = false;
      hud.hideBuy();
    } else if (ev.type === 'bombPlanted') {
      hud.banner('BOMB PLANTED', 'Ash must defuse it — hold the site', 2600);
      audio.beep();
    } else if (ev.type === 'bombBeep') {
      audio.beep(ev.final);
    } else if (ev.type === 'bombDropped') {
      hud.banner('BOMB DROPPED', '', 1200);
    } else if (ev.type === 'bombPickup') {
      if (ev.who === pc) hud.banner('YOU HAVE THE BOMB', 'Plant it at Site A — hold E in the zone', 2000);
    } else if (ev.type === 'roundEnd') {
      const won = ev.winner === 'attack';
      const reasons = {
        elimination: won ? 'Ash eliminated' : 'Ember eliminated',
        explosion: 'The bomb went off',
        defuse: 'The bomb was defused',
        time: 'Time ran out',
      };
      hud.banner(won ? 'EMBER WINS THE ROUND' : 'ASH WINS THE ROUND', reasons[ev.reason] || '', 3400);
      if (won) audio.roundWin();
      else audio.roundLose();
      buyOpen = false;
      hud.hideBuy();
    } else if (ev.type === 'matchEnd') {
      hud.showOverlay(ev.winner === 'attack' ? 'won' : 'lost', match.scoreA, match.scoreD);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
}

function pushHud() {
  const slot = loadout.ammoOf(loadout.state.current);
  hud.setAmmo(slot.mag, slot.reserve, loadout.def().name);
  hud.setHealth(match.playerHealth, match.playerArmor);
  hud.setMoney(match.playerMoney);
  hud.setGrenades(match.inventory.frag, match.inventory.smoke);
  hud.setBombTag(match.playerHasBomb && pc.alive);
  hud.setScores(match.scoreA, match.scoreD, match.aliveCount('attack'), match.aliveCount('defend'));
  hud.setRound(Math.max(1, match.round));
  let timerText = '—';
  let urgent = false;
  if (match.phase === 'buy') timerText = `BUY 0:${String(Math.max(0, Math.ceil(match.phaseT))).padStart(2, '0')}`;
  else if (match.phase === 'live') {
    const t = match.bomb.state === 'planted' ? match.bomb.timer : match.timer;
    timerText = `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
    urgent = t < 10 || match.bomb.state === 'planted';
  }
  hud.setTimer(timerText, urgent);
  hud.setCrosshairGap(7 + loadout.spread(player.groundSpeed()) * 620);
  if (match.plantProgress > 0.05 && match.bomb.state === 'carried') hud.setPlant(match.plantProgress / 3.2, 'PLANTING THE BOMB');
  else if (match.defuseProgress > 0.05) hud.setPlant(match.defuseProgress / 5, 'ASH IS DEFUSING');
  else hud.setPlant(null);
}

function updateBombView() {
  const bomb = match.bomb;
  if (bomb.state === 'carried' && bomb.carrier && bomb.carrier !== pc) {
    const c = bomb.carrier;
    bombGroup.position.set(c.position.x - Math.sin(c.yaw) * -0.24, 1.32, c.position.z - Math.cos(c.yaw) * -0.24);
    bombGroup.rotation.y = c.yaw;
    bombGroup.visible = true;
    bombLampMat.color.set(PALETTE.muted);
  } else if (bomb.state === 'dropped' || bomb.state === 'planted') {
    bombGroup.position.set(bomb.pos.x, 0.16, bomb.pos.z);
    bombGroup.rotation.y = 0.4;
    bombGroup.visible = true;
    const rate = bomb.state === 'planted' ? (bomb.timer < 10 ? 6 : 2.2) : 1.2;
    bombLampMat.color.set(Math.sin(elapsed * rate * Math.PI) > 0 ? PALETTE.attack : PALETTE.canvas);
  } else if (bomb.state === 'dropped' || bomb.state === 'planted') {
    bombGroup.position.set(bomb.pos.x, 0.16, bomb.pos.z);
    bombGroup.rotation.y = 0.4;
    bombGroup.visible = true;
    const rate = bomb.state === 'planted' ? (bomb.timer < 10 ? 6 : 2.2) : 1.2;
    bombLampMat.color.set(Math.sin(elapsed * rate * Math.PI) > 0 ? PALETTE.attack : PALETTE.canvas);
  } else {
    // Carried by the player (it is on your back, announced by the HUD tag) or done.
    bombGroup.visible = false;
  }
}

function step(dt) {
  elapsed += dt;
  throwCooldown = Math.max(0, throwCooldown - dt);
  shake = Math.max(0, shake - dt * 2.2);
  const canAct = started && pc.alive && (match.phase === 'live' || match.phase === 'buy');
  if (canAct && match.phase === 'live') player.step(dt, input.state.keys);
  loadout.step(dt);
  const planting = input.state.keys.has('KeyE') && match.playerHasBomb && player.groundSpeed() < 0.6;
  match.update(dt, { playerPlanting: planting });
  grenades.step(dt);
  for (const t of tracers) if (t.mesh.visible && elapsed > t.until) t.mesh.visible = false;
  updateBombView();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    if (started && !shot && input.state.locked) {
      const look = input.takeLook();
      if (pc.alive) player.look(look.x, look.y);
      // Buy menu keys and toggles.
      if (input.wasPressed('KeyB') && match.phase === 'buy') {
        buyOpen = !buyOpen;
        if (!buyOpen) hud.hideBuy();
      }
      if (buyOpen && match.phase === 'buy') {
        for (let i = 0; i < BUY_LIST.length; i += 1) {
          if (input.wasPressed(`Digit${i + 1}`)) buy(BUY_LIST[i].id);
        }
        refreshBuy();
      } else if (pc.alive && match.phase === 'live') {
        for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
          if (input.wasPressed(`Digit${i + 1}`)) loadout.select(WEAPON_ORDER[i]);
        }
        if (input.state.wheel !== 0) {
          const owned = WEAPON_ORDER.filter((id) => loadout.state.owned[id]);
          const at = owned.indexOf(loadout.state.current);
          const next = owned[(at + Math.sign(input.state.wheel) + owned.length) % owned.length];
          loadout.select(next);
          input.state.wheel = 0;
        }
        if (input.wasPressed('KeyG')) throwGrenade('frag');
        if (input.wasPressed('KeyF')) throwGrenade('smoke');
      }
      if (pc.alive && match.phase === 'live') {
        if (input.state.firing && loadout.ready()) {
          const def = loadout.def();
          if (def.auto || !prevFiring) playerShoot();
        }
        prevFiring = input.state.firing;
        if (input.wasPressed('KeyR') && loadout.reload()) audio.reload();
      }
      input.clearPressed();
    } else if (!shot) {
      input.clearPressed();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    drainEvents();
    pushHud();
    // DMR optic: right mouse narrows the view while the Longshot is up.
    const targetFov = aiming && loadout.def().zoom && pc.alive ? 74 / loadout.def().zoom : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 11);
      camera.updateProjectionMatrix();
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}

// --- Deterministic scenes for screenshots -------------------------------------
function stageCommon() {
  hud.hideOverlay();
  hud.setHealth(100, false);
  hud.setMoney(800);
  hud.setScores(0, 0, 4, 4);
  hud.setRound(1);
  hud.setTimer('0:12', false);
  hud.setGrenades(0, 0);
  hud.setBombTag(false);
  hud.setSpectate(null);
}

function stageShot(name) {
  stageCommon();
  const A = (i) => `bot-attack-${i}`;
  const D = (i) => `bot-defend-${i}`;
  const poses = {};
  if (name === 'start') {
    poses[A(0)] = { pos: new THREE.Vector3(-3, 0, 16.5), yaw: 0.3 };
    poses[A(1)] = { pos: new THREE.Vector3(1.5, 0, 17.5), yaw: -0.2 };
    poses[A(2)] = { pos: new THREE.Vector3(5, 0, 15.5), yaw: 0.9 };
    poses[D(0)] = { pos: new THREE.Vector3(-13.5, 0, -16.5), yaw: Math.PI };
    poses[D(1)] = { pos: new THREE.Vector3(-6.5, 0, -13.5), yaw: Math.PI - 0.4 };
    poses[D(2)] = { pos: new THREE.Vector3(1.5, 0, -16.5), yaw: Math.PI + 0.3 };
    poses[D(3)] = { pos: new THREE.Vector3(12.5, 0, -18.5), yaw: Math.PI };
    bots.stage(poses);
    body.position.set(0, 0, 20.6);
    body.yaw = 0.12;
    body.pitch = -0.02;
    loadout.give('rifle');
    loadout.select('rifle');
    hud.setAmmo(30, 90, 'AR-4 Rifle');
    hud.banner('RUSTLINE', 'Ember vs Ash — plant at Site A, or clear the yard', 60000);
  } else if (name === 'buy') {
    poses[A(0)] = { pos: new THREE.Vector3(-3.4, 0, 17.8), yaw: 0.2 };
    poses[A(1)] = { pos: new THREE.Vector3(2.2, 0, 18.8), yaw: -0.5 };
    poses[A(2)] = { pos: new THREE.Vector3(5.6, 0, 17.2), yaw: 0.7 };
    poses[D(0)] = { pos: new THREE.Vector3(-13.5, 0, -16.5), yaw: Math.PI };
    poses[D(1)] = { pos: new THREE.Vector3(-6.5, 0, -13.5), yaw: Math.PI };
    poses[D(2)] = { pos: new THREE.Vector3(1.5, 0, -16.5), yaw: Math.PI };
    poses[D(3)] = { pos: new THREE.Vector3(12.5, 0, -18.5), yaw: Math.PI };
    bots.stage(poses);
    body.position.set(0, 0, 20.2);
    body.yaw = 0;
    body.pitch = 0;
    loadout.give('smg');
    loadout.select('smg');
    hud.setAmmo(32, 96, 'K7 SMG');
    hud.setMoney(4150);
    hud.setTimer('BUY 0:09', false);
    hud.setRound(3);
    hud.setScores(1, 1, 4, 4);
    hud.showBuy([
      { id: 'smg', key: '1', name: 'K7 SMG', price: 1200, state: 'owned' },
      { id: 'shotgun', key: '2', name: 'M870 Scatter', price: 1600, state: 'ok' },
      { id: 'rifle', key: '3', name: 'AR-4 Rifle', price: 2700, state: 'ok' },
      { id: 'dmr', key: '4', name: 'Longshot DMR', price: 3400, state: 'ok' },
      { id: 'armor', key: '5', name: 'Kevlar Vest', price: 650, state: 'ok' },
      { id: 'frag', key: '6', name: 'Frag Grenade', price: 300, state: 'ok' },
      { id: 'smoke', key: '7', name: 'Smoke Grenade', price: 300, state: 'ok' },
    ], 4150);
  } else if (name === 'play') {
    poses[A(0)] = { pos: new THREE.Vector3(-4.6, 0, 5.8), yaw: -0.5, flash: true, weaponId: 'rifle' };
    poses[A(1)] = { pos: new THREE.Vector3(3.8, 0, -3.4), yaw: 2.6 };
    poses[A(2)] = { pos: new THREE.Vector3(-9.5, 0, -6), yaw: -0.4 };
    poses[D(0)] = { pos: new THREE.Vector3(-1.2, 0, -6.8), yaw: Math.PI - 0.3, flash: true, weaponId: 'rifle' };
    poses[D(1)] = { pos: new THREE.Vector3(0.5, 0, -10.5), yaw: Math.PI + 0.2 };
    poses[D(2)] = { pos: new THREE.Vector3(4.2, 0, -1.5), yaw: 2.2, dead: true };
    poses[D(3)] = { pos: new THREE.Vector3(-6.5, 0, -13.5), yaw: Math.PI };
    bots.stage(poses);
    body.position.set(-1.6, 0, 7.4);
    body.yaw = 0.1;
    body.pitch = -0.03;
    loadout.give('rifle');
    loadout.select('rifle');
    loadout.ammoOf('rifle').mag = 17;
    hud.setAmmo(17, 90, 'AR-4 Rifle');
    hud.setHealth(72, true);
    hud.setMoney(2350);
    hud.setScores(2, 1, 3, 2);
    hud.setRound(4);
    hud.setTimer('0:47', false);
    hud.setGrenades(1, 0);
    hud.killfeed('Vex ▸ Havik ⌖', 'feed-a');
    hud.killfeed('Rook ▸ Ondo', 'feed-d');
    drawTracer(new THREE.Vector3(-4.6, 1.35, 5.2), new THREE.Vector3(-1.4, 1.2, -6.2), 0, 4000);
    drawTracer(new THREE.Vector3(-1.2, 1.35, -6.2), new THREE.Vector3(-1.7, 1.3, 6.8), 0, 4000);
  } else if (name === 'end') {
    poses[A(0)] = { pos: new THREE.Vector3(-13.5, 0, -16.5), yaw: 2.6 };
    poses[A(1)] = { pos: new THREE.Vector3(-6.2, 0, -11.8), yaw: -2.8 };
    poses[A(2)] = { pos: new THREE.Vector3(-14.5, 0, -9.5), yaw: 0.6 };
    poses[D(0)] = { pos: new THREE.Vector3(-4.6, 0, -10.2), yaw: 0, dead: true };
    poses[D(1)] = { pos: new THREE.Vector3(1.5, 0, -16.5), yaw: Math.PI };
    poses[D(2)] = { pos: new THREE.Vector3(8, 0, -15.5), yaw: Math.PI - 0.5 };
    poses[D(3)] = { pos: new THREE.Vector3(12.5, 0, -18.5), yaw: Math.PI };
    bots.stage(poses);
    body.position.set(-10.5, 0, -4.2);
    body.yaw = 0.05;
    body.pitch = -0.02;
    bombGroup.position.set(-10, 0.16, -14);
    bombGroup.visible = true;
    bombLampMat.color.set(PALETTE.attack);
    loadout.give('rifle');
    loadout.select('rifle');
    hud.setAmmo(24, 60, 'AR-4 Rifle');
    hud.setHealth(58, true);
    hud.setMoney(3900);
    hud.setScores(3, 1, 3, 3);
    hud.setRound(5);
    hud.setTimer('0:31', true);
    hud.setGrenades(0, 1);
    hud.banner('BOMB PLANTED', 'Hold the site — Ash is coming to defuse', 60000);
  }
  syncCamera();
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 3) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Populate the yard behind the menu before the first match starts.
{
  const setup = {};
  bots.bots.forEach((bot, i) => {
    setup[bot.id] = {
      spawn: bot.team === 'attack' ? world.spawns.attack[i % 3] : world.spawns.defend[i - 3],
      yaw: bot.team === 'attack' ? 0 : Math.PI,
      weaponId: 'rifle',
      armor: false,
    };
  });
  bots.reset(setup);
  player.spawnAt(world.spawns.attack[3], 0);
  hud.setAmmo(12, 48, 'P9 Sidearm');
  hud.setHealth(100, false);
  hud.setMoney(800);
  hud.setScores(0, 0, 4, 4);
  hud.setRound(1);
  hud.setTimer('—', false);
}

syncCamera();
if (params.get('debug')) {
  // Test hooks: cheaper rendering, and a fast-forward that steps the simulation
  // without waiting for the display (software rendering makes real time crawl).
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false;
  window.__game = {
    match, bots, player, loadout,
    fastForward(seconds) {
      const steps = Math.round(seconds / FIXED_STEP);
      for (let i = 0; i < steps; i += 1) {
        step(FIXED_STEP);
        if (i % 6 === 5) scene.updateMatrixWorld(true);
      }
      scene.updateMatrixWorld(true);
    },
  };
}
if (shot) stageShot(shot);
else requestAnimationFrame(frame);
