// The armoury: five hitscan weapons as data (the bots read the same table), plus the
// player's loadout — view models, magazines, reloads, bloom — that main.js fires through.
// Damage falls off with distance; a head shot always pays four times.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, damage: 26, interval: 0.24, auto: false, pellets: 1,
    mag: 12, reserve: 48, reload: 1.25, spreadStill: 0.004, spreadMove: 0.032,
    falloffFrom: 16, falloffTo: 46, falloffMin: 0.55, speed: 1.0, kick: 0.011, sound: 'pistol',
  },
  smg: {
    name: 'K7 SMG', price: 1200, damage: 19, interval: 0.07, auto: true, pellets: 1,
    mag: 32, reserve: 96, reload: 1.7, spreadStill: 0.009, spreadMove: 0.046,
    falloffFrom: 12, falloffTo: 38, falloffMin: 0.5, speed: 1.05, kick: 0.006, sound: 'smg',
  },
  shotgun: {
    name: 'M870 Scatter', price: 1600, damage: 11, interval: 0.88, auto: false, pellets: 8,
    mag: 6, reserve: 24, reload: 2.6, spreadStill: 0.034, spreadMove: 0.05,
    falloffFrom: 6, falloffTo: 22, falloffMin: 0.3, speed: 0.97, kick: 0.03, sound: 'shotgun',
  },
  rifle: {
    name: 'AR-4 Rifle', price: 2700, damage: 33, interval: 0.098, auto: true, pellets: 1,
    mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028,
    falloffFrom: 20, falloffTo: 55, falloffMin: 0.65, speed: 1.0, kick: 0.009, sound: 'rifle',
  },
  dmr: {
    name: 'Longshot DMR', price: 3400, damage: 68, interval: 0.64, auto: false, pellets: 1,
    mag: 10, reserve: 40, reload: 2.2, spreadStill: 0.0008, spreadMove: 0.055,
    falloffFrom: 30, falloffTo: 80, falloffMin: 0.8, speed: 0.94, kick: 0.02, sound: 'dmr', zoom: 1.55,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'dmr'];
export const HEAD_MULT = 4;

export function damageAt(def, dist) {
  if (dist <= def.falloffFrom) return def.damage;
  if (dist >= def.falloffTo) return def.damage * def.falloffMin;
  const t = (dist - def.falloffFrom) / (def.falloffTo - def.falloffFrom);
  return def.damage * (1 - (1 - def.falloffMin) * t);
}

const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.45, metalness: 0.35 });
const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.3 });

function part(geo, mat, x, y, z, parent) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// One view model per weapon, all boxes: the silhouette is what sells it at a glance.
function buildModel(id) {
  const model = new THREE.Group();
  if (id === 'pistol') {
    part(new THREE.BoxGeometry(0.07, 0.09, 0.24), bodyMat, 0, 0, -0.05, model);
    part(new THREE.BoxGeometry(0.06, 0.12, 0.08), gripMat, 0, -0.09, 0.05, model);
    part(new THREE.BoxGeometry(0.02, 0.03, 0.02), darkMat, 0, 0.06, -0.15, model);
  } else if (id === 'smg') {
    part(new THREE.BoxGeometry(0.08, 0.1, 0.34), bodyMat, 0, 0, -0.08, model);
    part(new THREE.BoxGeometry(0.05, 0.16, 0.06), gripMat, 0, -0.12, -0.06, model);
    part(new THREE.BoxGeometry(0.04, 0.04, 0.2), darkMat, 0, 0.01, -0.32, model);
    part(new THREE.BoxGeometry(0.07, 0.05, 0.12), gripMat, 0, -0.01, 0.14, model);
  } else if (id === 'shotgun') {
    part(new THREE.BoxGeometry(0.09, 0.1, 0.5), bodyMat, 0, 0, -0.14, model);
    part(new THREE.BoxGeometry(0.07, 0.06, 0.18), gripMat, 0, -0.06, -0.2, model);
    part(new THREE.BoxGeometry(0.08, 0.11, 0.2), gripMat, 0, -0.05, 0.2, model);
  } else if (id === 'dmr') {
    part(new THREE.BoxGeometry(0.085, 0.1, 0.52), bodyMat, 0, 0, -0.16, model);
    part(new THREE.BoxGeometry(0.04, 0.04, 0.34), darkMat, 0, 0.02, -0.55, model);
    part(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 10), darkMat, 0, 0.09, -0.12, model).rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.07, 0.14, 0.06), gripMat, 0, -0.11, 0.02, model);
    part(new THREE.BoxGeometry(0.07, 0.08, 0.24), gripMat, 0, -0.02, 0.3, model);
  } else {
    part(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat, 0, 0, -0.1, model);
    part(new THREE.BoxGeometry(0.045, 0.045, 0.4), gripMat, 0, 0.025, -0.48, model);
    part(new THREE.BoxGeometry(0.06, 0.15, 0.07), gripMat, 0, -0.11, -0.05, model);
    part(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat, 0, -0.02, 0.2, model);
    part(new THREE.BoxGeometry(0.02, 0.05, 0.02), darkMat, 0, 0.075, -0.3, model);
  }
  model.position.set(0.24, -0.21, -0.42);
  return model;
}

export function createLoadout(camera) {
  const holder = new THREE.Group();
  camera.add(holder);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.19, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.7);
  camera.add(flashLight);

  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = {
    owned: { pistol: true },
    current: 'pistol',
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    model: null,
  };

  function showModel() {
    if (state.model) holder.remove(state.model);
    state.model = buildModel(state.current);
    holder.add(state.model);
  }
  showModel();

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 2.4);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    if (state.model) {
      const reloading = state.reloadLeft > 0;
      state.model.position.z = -0.42 + state.kick;
      state.model.rotation.x = state.kick * 2.4 + (reloading ? -0.5 * Math.sin(Math.PI * (1 - state.reloadLeft / def().reload)) : 0);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 34;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const slot = ammo[state.current];
        const take = Math.min(def().mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    ammoOf(id) {
      return ammo[id];
    },
    step,
    ready() {
      const slot = ammo[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      ammo[state.current].mag -= 1;
      state.cooldown = d.interval;
      state.flash = 0.055;
      state.kick = 0.05;
      state.bloom = Math.min(1.6, state.bloom + 0.34);
    },
    reload() {
      const slot = ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def().mag || slot.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    select(id) {
      if (!state.owned[id] || id === state.current) return false;
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.28);
      state.bloom = 0;
      showModel();
      return true;
    },
    give(id) {
      state.owned[id] = true;
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    },
    refillAll() {
      for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    },
    spread(speed) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      return (d.spreadStill + move * d.spreadMove) * (1 + state.bloom * 0.9);
    },
  };
}
