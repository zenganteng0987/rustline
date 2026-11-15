// The other seven people in the yard: three Ember attackers beside the player and four
// Ash defenders. Each bot is a body with a head that pays four times, a waypoint walker,
// and a small state machine — advance, hold, fight, plant, defuse — fed by what it can
// see (line of sight, field of view, smoke) and hear (the match's noise list). A bot
// stops to shoot in bursts, because in this yard accuracy counts more than speed.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, damageAt } from './weapons.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.58;
const RUN_SPEED = 4.7;
const STRAFE_SPEED = 2.1;
const PERCEPTION_GAP = 0.11;
const SIGHT_RANGE = 30;
const FOV_COS = 0.17;

const ATTACK_NAMES = ['Vex', 'Ondo', 'Pax'];
const DEFEND_NAMES = ['Rook', 'Sable', 'Havik', 'Moss'];

const scratch = {
  eye: new THREE.Vector3(),
  chest: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  probe: new THREE.Box3(),
  ray: new THREE.Raycaster(),
};

function buildBody(team) {
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'attack' ? PALETTE.attack : PALETTE.defend), roughness: 0.65, metalness: 0.05 });
  const clothMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.7 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.5, metalness: 0.3 });
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.25), clothMat);
  legs.position.y = 0.41;
  legs.userData.part = 'legs';
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.32), darkMat);
  bootL.position.set(-0.13, 0.05, -0.03);
  const bootR = bootL.clone();
  bootR.position.x = 0.13;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.27), darkMat);
  hips.position.y = 0.88;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), teamMat);
  torso.position.y = 1.28;
  torso.userData.part = 'torso';
  const rig = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.06), darkMat);
  rig.position.set(0, 1.3, -0.17);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.13), darkMat);
  pack.position.set(0, 1.3, 0.21);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.14), darkMat);
  armL.position.set(-0.33, 1.3, -0.05);
  armL.rotation.x = 0.5;
  const armR = armL.clone();
  armR.position.x = 0.33;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
  head.position.y = 1.74;
  head.userData.part = 'head';
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), teamMat);
  band.position.y = 1.79;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat);
  gun.position.set(0.18, 1.32, -0.34);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.18, 1.32, -0.72);
  flash.visible = false;
  group.add(legs, bootL, bootR, hips, torso, rig, pack, armL, armR, head, band, gun, flash);
  group.traverse((mesh) => {
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return { group, torso, head, legs, flash };
}

export function createBots(scene, world) {
  const bots = [];
  const hitMeshes = [];

  function makeBot(index, team, name) {
    const body = buildBody(team);
    scene.add(body.group);
    const bot = {
      id: `bot-${team}-${index}`,
      name,
      team,
      group: body.group,
      parts: body,
      position: body.group.position,
      yaw: 0,
      health: 100,
      armor: false,
      alive: true,
      weaponId: 'pistol',
      hasBomb: false,
      intent: 'hold',
      path: [],
      pathAt: 0,
      goal: null,
      holdYaw: 0,
      seenAt: -1,
      lastSeen: new THREE.Vector3(),
      target: null,
      targetFreshUntil: -1,
      reaction: team === 'attack' ? 0.26 : 0.34,
      skill: team === 'attack' ? 1.07 : 0.96,
      burstLeft: 0,
      burstWait: 0,
      fireTimer: 0,
      shotsInMag: 0,
      reloadUntil: -1,
      strafeDir: 1,
      strafeFlipAt: 0,
      crouching: false,
      perceiveAt: index * 0.03,
      deathAt: -1,
      walkPhase: index * 1.3,
      staged: false,
      anchorDist: Infinity,
      anchorT: 0,
      unjamUsed: false,
      unjamT: 0,
      unjamSide: index % 2 ? 1 : -1,
    };
    for (const mesh of [body.torso, body.head, body.legs]) {
      mesh.userData.bot = bot;
      hitMeshes.push(mesh);
    }
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) makeBot(i, 'attack', ATTACK_NAMES[i]);
  for (let i = 0; i < 4; i += 1) makeBot(i, 'defend', DEFEND_NAMES[i]);

  function overlaps(x, y, z) {
    scratch.probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    scratch.probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const collider of world.colliders) if (scratch.probe.intersectsBox(collider)) return true;
    return false;
  }

  function moveBot(bot, vx, vz, dt) {
    // Full step first, then slide along each axis: a diagonal into a corner keeps
    // whichever half of the motion the corner allows.
    const nx = bot.position.x + vx * dt;
    const nz = bot.position.z + vz * dt;
    if (!overlaps(nx, 0, nz)) {
      bot.position.x = nx;
      bot.position.z = nz;
    } else if (!overlaps(nx, 0, bot.position.z)) {
      bot.position.x = nx;
    } else if (!overlaps(bot.position.x, 0, nz)) {
      bot.position.z = nz;
    }
    bot.position.y = 0;
  }

  function faceToward(bot, x, z, dt, rate = 10) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * rate);
  }

  function losClear(from, to) {
    scratch.dir.subVectors(to, from);
    const dist = scratch.dir.length();
    if (dist < 0.01) return true;
    scratch.dir.divideScalar(dist);
    scratch.ray.set(from, scratch.dir);
    scratch.ray.far = dist - 0.3;
    if (scratch.ray.intersectObjects(world.shootables, false).length) return false;
    for (const smoke of world.smokes) {
      // distance from the smoke centre to the sight line, in the horizontal plane
      const t = ((smoke.pos.x - from.x) * scratch.dir.x + (smoke.pos.z - from.z) * scratch.dir.z) / Math.max(0.2, Math.hypot(scratch.dir.x, scratch.dir.z) ** 2 + 0.0001);
      if (t > 0 && t < dist) {
        const px = from.x + scratch.dir.x * t - smoke.pos.x;
        const pz = from.z + scratch.dir.z * t - smoke.pos.z;
        if (px * px + pz * pz < smoke.radius * smoke.radius * 0.8) return false;
      }
    }
    return true;
  }

  function perceive(bot, ctx) {
    scratch.eye.set(bot.position.x, EYE, bot.position.z);
    let best = null;
    let bestDist = Infinity;
    for (const enemy of ctx.combatants) {
      if (!enemy.alive || enemy.team === bot.team) continue;
      scratch.chest.set(enemy.position.x, enemy.position.y + 1.18, enemy.position.z);
      const dist = scratch.eye.distanceTo(scratch.chest);
      if (dist > SIGHT_RANGE || dist >= bestDist) continue;
      scratch.dir.subVectors(scratch.chest, scratch.eye).divideScalar(dist || 1);
      const dot = (-Math.sin(bot.yaw)) * scratch.dir.x + (-Math.cos(bot.yaw)) * scratch.dir.z;
      if (dist > 2.2 && dot < FOV_COS) continue;
      if (!losClear(scratch.eye, scratch.chest)) continue;
      best = enemy;
      bestDist = dist;
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.seenAt = ctx.time;
      }
      bot.lastSeen.set(best.position.x, 0, best.position.z);
      bot.targetFreshUntil = ctx.time + 0.45;
    } else if (ctx.time > bot.targetFreshUntil) {
      bot.target = null;
    }
  }

  function setPath(bot, dest) {
    bot.path = world.path(bot.position, dest);
    bot.pathAt = 0;
    bot.goal = dest.clone();
    bot.anchorDist = Infinity;
    bot.anchorT = 0;
    bot.unjamUsed = false;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathAt >= bot.path.length) return true;
    const point = bot.path[bot.pathAt];
    const dx = point.x - bot.position.x;
    const dz = point.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.75) {
      bot.pathAt += 1;
      bot.anchorDist = Infinity;
      bot.anchorT = 0;
      bot.unjamUsed = false;
      return bot.pathAt >= bot.path.length;
    }
    // Progress is measured toward the point, not by raw movement: sidestepping along a
    // wall is motion without progress, and only progress resets the clock. Half a
    // second without progress earns one sidestep; a second earns a skipped point.
    if (dist < bot.anchorDist - 0.05) {
      bot.anchorDist = dist;
      bot.anchorT = 0;
    } else {
      bot.anchorT += dt;
      if (bot.anchorT > 0.55 && !bot.unjamUsed) {
        bot.unjamUsed = true;
        bot.unjamT = 0.45;
        bot.unjamSide = -bot.unjamSide;
        bot.anchorT = 0;
      } else if (bot.anchorT > 0.9 && bot.unjamUsed) {
        bot.pathAt += 1;
        bot.anchorDist = Infinity;
        bot.anchorT = 0;
        bot.unjamUsed = false;
        return bot.pathAt >= bot.path.length;
      }
    }
    if (bot.unjamT > 0) {
      bot.unjamT -= dt;
      const sideX = (dz / dist) * bot.unjamSide;
      const sideZ = (-dx / dist) * bot.unjamSide;
      moveBot(bot, sideX * speed * 0.8, sideZ * speed * 0.8, dt);
      bot.walkPhase += dt * 9;
      return false;
    }
    faceToward(bot, point.x, point.z, dt);
    moveBot(bot, (dx / dist) * speed, (dz / dist) * speed, dt);
    bot.walkPhase += dt * 9;
    return false;
  }

  function combatMove(bot, dt, ctx) {
    if (ctx.time >= bot.strafeFlipAt) {
      bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      bot.strafeFlipAt = ctx.time + 0.6 + Math.random() * 0.9;
      bot.crouching = Math.random() < 0.3;
    }
    const target = bot.target;
    faceToward(bot, target.position.x, target.position.z, dt, 14);
    const dist = Math.hypot(target.position.x - bot.position.x, target.position.z - bot.position.z);
    const sideX = Math.cos(bot.yaw) * bot.strafeDir;
    const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
    let vx = sideX * STRAFE_SPEED;
    let vz = sideZ * STRAFE_SPEED;
    if (dist > 26) {
      vx += -Math.sin(bot.yaw) * 1.6;
      vz += -Math.cos(bot.yaw) * 1.6;
    }
    if (bot.burstLeft > 0) {
      vx *= 0.25;
      vz *= 0.25;
    }
    moveBot(bot, vx, vz, dt);
  }

  function tryFire(bot, dt, ctx) {
    const def = WEAPONS[bot.weaponId];
    bot.fireTimer -= dt;
    if (ctx.time < bot.reloadUntil) return;
    if (bot.burstLeft <= 0) {
      bot.burstWait -= dt;
      if (bot.burstWait > 0) return;
      bot.burstLeft = def.auto ? 3 + Math.floor(Math.random() * 3) : 1;
    }
    if (bot.fireTimer > 0) return;
    bot.fireTimer = def.interval;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) bot.burstWait = 0.4 + Math.random() * 0.45;
    bot.shotsInMag += 1;
    if (bot.shotsInMag >= def.mag) {
      bot.shotsInMag = 0;
      bot.reloadUntil = ctx.time + def.reload * 0.8;
      bot.burstLeft = 0;
    }
    const target = bot.target;
    scratch.eye.set(bot.position.x, EYE, bot.position.z);
    scratch.chest.set(target.position.x, target.position.y + 1.18, target.position.z);
    const dist = scratch.eye.distanceTo(scratch.chest);
    // Fire only on a clear line; a target that ducked behind a crate eats no rounds.
    if (!losClear(scratch.eye, scratch.chest)) {
      bot.burstLeft = 0;
      bot.targetFreshUntil = ctx.time;
      return;
    }
    bot.parts.flash.visible = true;
    bot.flashUntil = ctx.time + 0.05;
    const muzzle = new THREE.Vector3(bot.position.x - Math.sin(bot.yaw) * 0.55, 1.32, bot.position.z - Math.cos(bot.yaw) * 0.55);
    ctx.reportShot(bot, muzzle, scratch.chest.clone());
    const targetSpeed = target.speed ? target.speed() : 0;
    let chance = 0.66 - dist * 0.0075 - targetSpeed * 0.05 + (target.crouching ? -0.04 : 0);
    chance *= bot.skill;
    chance = Math.max(0.05, Math.min(0.82, chance));
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p += 1) {
      if (Math.random() > chance) continue;
      const head = Math.random() < 0.16;
      const part = head ? 'head' : (Math.random() < 0.22 ? 'legs' : 'torso');
      let dmg = damageAt(def, dist) * (part === 'head' ? 4 : part === 'legs' ? 0.75 : 1);
      ctx.dealDamage(target, dmg, bot, part);
      if (!target.alive) break;
    }
  }

  function decide(bot, dt, ctx) {
    const seesTarget = bot.target && ctx.time <= bot.targetFreshUntil;
    if (seesTarget && ctx.time - bot.seenAt >= bot.reaction) {
      bot.intent = 'fight';
      combatMove(bot, dt, ctx);
      tryFire(bot, dt, ctx);
      return;
    }
    if (bot.intent === 'fight') bot.intent = bot.team === 'defend' && ctx.bomb.state !== 'planted' ? 'hold' : 'advance';

    if (bot.team === 'attack') {
      if (ctx.bomb.state === 'planted') {
        bot.intent = 'hold';
        holdPosition(bot, dt, ctx, world.nodes.get(ctx.holds.attack[bots.indexOf(bot) % ctx.holds.attack.length]));
        return;
      }
      if (ctx.bomb.state === 'dropped' && !bot.hasBomb && ctx.bomb.pos) {
        bot.intent = 'advance';
        if (!bot.goal || bot.goal.distanceTo(ctx.bomb.pos) > 1) setPath(bot, ctx.bomb.pos);
        followPath(bot, dt, RUN_SPEED);
        return;
      }
      if (bot.hasBomb) {
        const atSite = Math.hypot(bot.position.x - world.plantSpot.x, bot.position.z - world.plantSpot.z) < 1.1;
        if (atSite) {
          bot.intent = 'plant';
          faceToward(bot, world.site.center.x, world.site.center.z - 6, dt);
          return;
        }
        bot.intent = 'advance';
        if (!bot.goal || bot.goal.distanceTo(world.plantSpot) > 1) setPath(bot, world.plantSpot);
        followPath(bot, dt, RUN_SPEED);
        return;
      }
      const dest = ctx.attackDest(bot);
      if (dest && Math.hypot(bot.position.x - dest.x, bot.position.z - dest.z) < 1.2) {
        bot.intent = 'hold';
        holdPosition(bot, dt, ctx, dest);
        return;
      }
      bot.intent = 'advance';
      if (dest && (!bot.goal || bot.goal.distanceTo(dest) > 1.2)) setPath(bot, dest);
      if (bot.goal) followPath(bot, dt, RUN_SPEED);
      return;
    }

    // Defenders.
    if (ctx.bomb.state === 'planted' && ctx.bomb.pos) {
      const nearBomb = Math.hypot(bot.position.x - ctx.bomb.pos.x, bot.position.z - ctx.bomb.pos.z) < 1.15;
      if (ctx.defuserId === bot.id && nearBomb) {
        bot.intent = 'defuse';
        faceToward(bot, ctx.bomb.pos.x, ctx.bomb.pos.z, dt);
        return;
      }
      bot.intent = 'advance';
      if (!bot.goal || bot.goal.distanceTo(ctx.bomb.pos) > 2.2) setPath(bot, ctx.bomb.pos);
      followPath(bot, dt, RUN_SPEED);
      return;
    }
    if (bot.intent === 'advance' && bot.goal) {
      const arrived = followPath(bot, dt, RUN_SPEED * 0.92);
      if (arrived) bot.intent = 'hold';
      return;
    }
    bot.intent = 'hold';
    holdPosition(bot, dt, ctx, world.nodes.get(ctx.holds.defend[bots.indexOf(bot) % ctx.holds.defend.length]));
    // A defender who hears a close fight goes to look, one at a time.
    const noise = ctx.recentNoise(bot.position, 20);
    if (noise && ctx.claimInvestigator(bot)) {
      setPath(bot, noise);
      bot.intent = 'advance';
    }
  }

  function holdPosition(bot, dt, ctx, spot) {
    if (!spot) return;
    const dist = Math.hypot(spot.x - bot.position.x, spot.z - bot.position.z);
    if (dist > 0.8) {
      if (!bot.goal || bot.goal.distanceTo(spot) > 1) setPath(bot, spot);
      followPath(bot, dt, RUN_SPEED * 0.9);
      return;
    }
    // Settle: slow look sweeps across the lane the spot watches.
    bot.holdYaw += dt * 0.24;
    const base = bot.team === 'defend' ? Math.PI : 0;
    const want = base + Math.sin(bot.holdYaw + bot.walkPhase) * 0.7;
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * 3);
  }

  function update(dt, ctx) {
    // Gentle separation: two bots never stand inside each other.
    if (ctx.phase === 'live') {
      for (let i = 0; i < bots.length; i += 1) {
        for (let j = i + 1; j < bots.length; j += 1) {
          const a = bots[i];
          const b = bots[j];
          if (!a.alive || !b.alive || a.staged || b.staged) continue;
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.01 && d < 0.55) {
            const push = ((0.55 - d) / d) * 0.5;
            moveBot(b, dx * push * 3, dz * push * 3, dt);
          }
        }
      }
    }
    for (const bot of bots) {
      if (bot.staged) continue;
      if (!bot.alive) {
        if (bot.deathAt > 0) {
          const fall = Math.min(1, (ctx.time - bot.deathAt) / 0.38);
          bot.group.rotation.x = -fall * 1.5;
          bot.group.position.y = -fall * 0.12;
        }
        continue;
      }
      bot.parts.flash.visible = ctx.time < (bot.flashUntil || 0);
      if (ctx.phase !== 'live') continue;
      bot.perceiveAt -= dt;
      if (bot.perceiveAt <= 0) {
        bot.perceiveAt = PERCEPTION_GAP;
        perceive(bot, ctx);
      }
      decide(bot, dt, ctx);
      // A walk bob while advancing, and a crouch that lowers the whole body in a fight.
      const targetY = bot.crouching && bot.intent === 'fight' ? -0.34 : 0;
      const bob = bot.intent === 'advance' ? Math.abs(Math.sin(bot.walkPhase)) * 0.045 : 0;
      bot.group.position.y += (targetY + bob - bot.group.position.y) * Math.min(1, dt * 10);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function reset(setup) {
    for (const bot of bots) {
      const s = setup[bot.id];
      bot.health = 100;
      bot.alive = true;
      bot.deathAt = -1;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.set(s.spawn.x, 0, s.spawn.z);
      bot.yaw = s.yaw;
      bot.weaponId = s.weaponId;
      bot.armor = s.armor;
      bot.hasBomb = false;
      bot.intent = 'hold';
      bot.path = [];
      bot.goal = null;
      bot.target = null;
      bot.shotsInMag = 0;
      bot.burstLeft = 0;
      bot.crouching = false;
      bot.staged = false;
      bot.anchorDist = Infinity;
      bot.anchorT = 0;
      bot.unjamUsed = false;
      bot.unjamT = 0;
    }
  }

  function stage(poses) {
    for (const bot of bots) {
      const pose = poses[bot.id];
      bot.staged = true;
      bot.alive = !pose.dead;
      bot.group.rotation.set(pose.dead ? -1.5 : 0, pose.yaw || 0, 0);
      bot.group.position.set(pose.pos.x, pose.dead ? -0.12 : 0, pose.pos.z);
      bot.yaw = pose.yaw || 0;
      if (pose.weaponId) bot.weaponId = pose.weaponId;
      bot.parts.flash.visible = !!pose.flash;
    }
  }

  return { bots, hitMeshes, update, reset, stage };
}
