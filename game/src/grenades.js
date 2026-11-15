// Grenades for the player's hand: a frag that bounces and bursts, and a smoke that pops
// into a vision-blocking cloud. Bots never throw; their line-of-sight checks read the
// smoke list on the world, so a smoked lane is a real lane change.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RADIUS = 0.09;
const GRAVITY = 13;
const FRAG_FUSE = 1.7;
const SMOKE_FUSE = 1.1;
const SMOKE_LIFE = 6.5;
export const FRAG_RADIUS = 5.6;

export function createGrenades(scene, world, fx) {
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 });
  const smokeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.8 });
  const cloudMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.muted), transparent: true, opacity: 0.5, depthWrite: false });
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.95, depthWrite: false });
  const fragGeo = new THREE.SphereGeometry(RADIUS, 10, 8);
  const cloudGeo = new THREE.SphereGeometry(2.6, 18, 14);

  const live = [];
  const clouds = [];
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 15);
  scene.add(boomLight);
  let boomFlash = 0;
  let time = 0;

  function throwOne(kind, origin, dir) {
    const mesh = new THREE.Mesh(fragGeo, kind === 'frag' ? fragMat : smokeMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    live.push({
      kind,
      mesh,
      vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: kind === 'frag' ? FRAG_FUSE : SMOKE_FUSE,
      resting: 0,
    });
    fx.onThrow?.();
  }

  function collide(item) {
    const p = item.mesh.position;
    if (p.y < RADIUS) {
      p.y = RADIUS;
      item.vel.y = Math.abs(item.vel.y) > 1.4 ? -item.vel.y * 0.42 : 0;
      item.vel.x *= 0.72;
      item.vel.z *= 0.72;
      item.resting += 1;
    }
    for (const box of world.colliders) {
      if (p.x > box.min.x - RADIUS && p.x < box.max.x + RADIUS
        && p.y > box.min.y - RADIUS && p.y < box.max.y + RADIUS
        && p.z > box.min.z - RADIUS && p.z < box.max.z + RADIUS) {
        const dxl = p.x - (box.min.x - RADIUS);
        const dxr = (box.max.x + RADIUS) - p.x;
        const dyl = p.y - (box.min.y - RADIUS);
        const dyr = (box.max.y + RADIUS) - p.y;
        const dzl = p.z - (box.min.z - RADIUS);
        const dzr = (box.max.z + RADIUS) - p.z;
        const m = Math.min(dxl, dxr, dyl, dyr, dzl, dzr);
        if (m === dyl) { p.y = box.min.y - RADIUS; item.vel.y = -Math.abs(item.vel.y) * 0.4; }
        else if (m === dyr) { p.y = box.max.y + RADIUS; item.vel.y = Math.abs(item.vel.y) > 1.4 ? Math.abs(item.vel.y) * 0.42 : 0; item.vel.x *= 0.72; item.vel.z *= 0.72; item.resting += 1; }
        else if (m === dxl) { p.x = box.min.x - RADIUS; item.vel.x = -Math.abs(item.vel.x) * 0.45; }
        else if (m === dxr) { p.x = box.max.x + RADIUS; item.vel.x = Math.abs(item.vel.x) * 0.45; }
        else if (m === dzl) { p.z = box.min.z - RADIUS; item.vel.z = -Math.abs(item.vel.z) * 0.45; }
        else { p.z = box.max.z + RADIUS; item.vel.z = Math.abs(item.vel.z) * 0.45; }
      }
    }
  }

  function burst(item) {
    const pos = item.mesh.position.clone();
    scene.remove(item.mesh);
    if (item.kind === 'frag') {
      const flash = new THREE.Mesh(cloudGeo, flashMat);
      flash.position.copy(pos);
      flash.scale.setScalar(0.3);
      scene.add(flash);
      clouds.push({ mesh: flash, until: time + 0.22, kind: 'flash', born: time });
      boomLight.position.copy(pos).y += 0.6;
      boomLight.intensity = 260;
      boomFlash = 0.22;
      fx.onExplode(pos);
    } else {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat.clone());
      cloud.position.copy(pos).y = Math.max(pos.y, 1.15);
      scene.add(cloud);
      const entry = { pos: cloud.position.clone(), radius: 2.6, until: time + SMOKE_LIFE };
      world.smokes.push(entry);
      clouds.push({ mesh: cloud, until: time + SMOKE_LIFE, kind: 'smoke', born: time, entry });
      fx.onSmoke(pos);
    }
  }

  function step(dt) {
    time += dt;
    boomFlash = Math.max(0, boomFlash - dt);
    if (boomFlash === 0) boomLight.intensity = 0;
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const item = live[i];
      item.fuse -= dt;
      item.vel.y -= GRAVITY * dt;
      item.mesh.position.addScaledVector(item.vel, dt);
      collide(item);
      if (item.fuse <= 0 || (item.kind === 'smoke' && item.resting > 2 && item.fuse < SMOKE_FUSE - 0.25)) {
        live.splice(i, 1);
        burst(item);
      }
    }
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      const cloud = clouds[i];
      const left = cloud.until - time;
      if (cloud.kind === 'flash') {
        cloud.mesh.scale.setScalar(0.3 + (0.22 - left) * 9);
        cloud.mesh.material.opacity = Math.max(0, left / 0.22) * 0.95;
      } else {
        const age = time - cloud.born;
        cloud.mesh.scale.setScalar(Math.min(1, age * 2.2));
        cloud.mesh.material.opacity = left < 1 ? Math.max(0, left) * 0.5 : 0.5;
      }
      if (left <= 0) {
        scene.remove(cloud.mesh);
        if (cloud.entry) {
          const at = world.smokes.indexOf(cloud.entry);
          if (at !== -1) world.smokes.splice(at, 1);
        }
        clouds.splice(i, 1);
      }
    }
  }

  return {
    throwOne,
    step,
    reset() {
      for (const item of live) scene.remove(item.mesh);
      for (const cloud of clouds) scene.remove(cloud.mesh);
      live.length = 0;
      clouds.length = 0;
      world.smokes.length = 0;
    },
  };
}
