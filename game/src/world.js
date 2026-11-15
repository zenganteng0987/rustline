// The map: Rustline Yard, a container yard at dusk, built from boxes and cylinders.
// Three lanes (west corridor, open mid, east depot) run from the Ember spawn in the south
// to the dock site in the north-west. Every solid is a collider for movement and a surface
// a bullet stops on. The waypoint graph at the bottom is how the bots cross the yard.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const CONTAINER_H = 2.6;
const CRATE = 1.1;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'attack' || name === 'defend' ? 0.5 : 0.9,
      metalness: 0.04,
    });
  }
  const lampGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const sitePaint = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.attack) });

  const colliders = [];
  const shootables = [];

  function register(mesh, solid = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    return register(mesh, solid);
  }

  function barrel(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14), materials.hairline);
    mesh.position.set(x, 0.525, z);
    return register(mesh);
  }

  // A shipping container: a long box with a darker roof line and a painted end band, so a
  // stack reads as cargo and not as one grey slab.
  function container(x, z, level, alongX, material) {
    const w = alongX ? 6.1 : 2.44;
    const d = alongX ? 2.44 : 6.1;
    const y = CONTAINER_H / 2 + level * CONTAINER_H;
    box(w, CONTAINER_H, d, x, y, z, material);
    box(w + 0.06, 0.12, d + 0.06, x, y + CONTAINER_H / 2 - 0.06, z, 'hairline');
    if (alongX) box(0.18, CONTAINER_H - 0.5, d - 0.3, x - w / 2 + 0.09, y, z, 'canvas');
    else box(w - 0.3, CONTAINER_H - 0.5, 0.18, x, y, z - d / 2 + 0.09, 'canvas');
  }

  function crate(x, z, material = 'hairline') {
    return box(1.15, CRATE, 1.15, x, CRATE / 2, z, material);
  }

  function lamp(x, z, withLight) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8), materials.hairline);
    pole.position.set(x, 2.2, z);
    register(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.3), lampGlow);
    head.position.set(x, 4.42, z);
    head.castShadow = false;
    group.add(head);
    shootables.push(head);
    if (withLight) {
      const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 110, 19, 1.9);
      light.position.set(x, 4.25, z);
      scene.add(light);
    }
  }

  // Ground and the yard fence. The yard is 44 x 44 m; play stays inside x, z in [-21, 21].
  const ground = new THREE.Mesh(new THREE.BoxGeometry(46, 0.4, 46), materials.surface);
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3().setFromObject(ground));
  shootables.push(ground);
  box(0.4, 5, 44.4, -22, 2.5, 0, 'surface');
  box(0.4, 5, 44.4, 22, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -22, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 22, 'surface');

  // Painted ground lines: the site boundary, its centre ring, and the two spawn pads.
  function paint(w, d, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), material);
    mesh.position.set(x, 0.015, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  paint(12.4, 0.28, -10, -19.1, sitePaint);
  paint(12.4, 0.28, -10, -8.9, sitePaint);
  paint(0.28, 10.4, -16.1, -14, sitePaint);
  paint(0.28, 10.4, -3.9, -14, sitePaint);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.32, 40), sitePaint);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(-10, 0.02, -14);
  group.add(ring);
  paint(7, 0.24, 0, 15.4, materials.muted);
  paint(7, 0.24, 13, -19.4, materials.muted);

  // West lane: a container wall on its east side makes a corridor with two gaps.
  container(-13.5, 12, 0, false, 'surface');
  container(-13.5, 5.6, 0, false, 'hairline');
  container(-13.5, -1.2, 0, false, 'surface');
  container(-13.5, 5.6, 1, false, 'muted');
  crate(-18.5, 3);
  crate(-19.6, -3.4, 'surface');
  barrel(-17.5, -7.4);
  barrel(-17.3, -5.9);

  // Mid: an open yard broken by a parked truck, crate islands and a low wall.
  box(2.5, 2.5, 6.4, 1.8, 1.25, -1.5, 'muted'); // truck cargo bed and cab read as one block
  box(2.5, 1.15, 1.6, 1.8, 0.575, 2.6, 'hairline');
  crate(-2.6, 2.2);
  crate(-2.6, 3.4);
  crate(-3.8, 2.8, 'surface');
  box(4.6, 1.05, 0.5, -1.5, 0.525, 8.6, 'hairline'); // low wall, south mid
  crate(5.6, -6.4);
  crate(5.6, -5.2);
  crate(4.4, -5.8, 'surface');
  box(1.15, 2.2, 1.15, 4.98, 1.1, -5.8, 'surface'); // steps up to the crate island roof
  crate(-5.2, -8.6);
  barrel(3.4, 11.8);
  barrel(4.2, 11.2);

  // East lane: the depot, container stacks forming an S with door gaps at both ends.
  container(13.5, 9, 0, false, 'hairline');
  container(13.5, 9, 1, false, 'surface');
  container(18.5, 1.5, 0, true, 'surface');
  container(13.5, -4.5, 0, false, 'muted');
  crate(18.6, -3.2);
  crate(19.7, 4.6, 'surface');
  barrel(11.8, -1.5);

  // North-mid and the run into the site from the east.
  container(4, -13.5, 0, true, 'hairline');
  crate(-0.5, -11);
  barrel(8.5, -9.5);
  crate(10.6, -18.9);

  // The site: a raised dock along the north wall, the portal crane over it, hold cover.
  box(13, 0.5, 4.6, -10, 0.25, -19.2, 'surface');
  box(1.6, 0.25, 3.4, -3.6, 0.125, -19.2, 'hairline'); // dock ramp
  container(-15.2, -11.5, 0, true, 'hairline');
  crate(-6.2, -10.6);
  crate(-6.2, -12.4, 'surface');
  barrel(-15.8, -15.2);
  barrel(-17.3, -15.4);
  box(0.5, 7.2, 0.5, -17, 3.6, -14, 'hairline'); // crane legs and beam
  box(0.5, 7.2, 0.5, -3, 3.6, -14, 'hairline');
  box(14.6, 0.6, 0.7, -10, 7.1, -14, 'accent');
  box(2.44, CONTAINER_H, 6.1, -10, 5.6, -14, 'muted'); // the hanging container

  // Defender spawn cover, north-east corner.
  crate(16.5, -15.5);
  crate(17.6, -16.6, 'surface');
  container(19, -11, 0, false, 'hairline');

  lamp(0, 6.5, true);
  lamp(-10, -7.5, true);
  lamp(17.5, 5.5, false);
  lamp(-18.5, -1, false);

  // The sky: a gradient dome, deep blue overhead warming to ember at the horizon.
  {
    const cv = document.createElement('canvas');
    cv.width = 4;
    cv.height = 256;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, PALETTE.canvas);
    grad.addColorStop(0.42, PALETTE.sky);
    grad.addColorStop(0.75, PALETTE.hairline);
    grad.addColorStop(0.93, PALETTE.dusk);
    grad.addColorStop(1, PALETTE.dusk);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(130, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    dome.renderOrder = -1;
    scene.add(dome);
  }

  // Dusk light: a low warm sun from the south-west, a cool sky fill, long shadows.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.hairline), new THREE.Color(PALETTE.canvas), 2.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 3.1);
  sun.position.set(-14, 17, 15);
  sun.target.position.set(2, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -27;
  sun.shadow.camera.right = 27;
  sun.shadow.camera.top = 27;
  sun.shadow.camera.bottom = -27;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 1.35);
  fill.position.set(10, 12, -12);
  scene.add(fill);

  // Waypoints: named spots a bot can stand on, joined where a straight walk stays in the
  // open. Lanes are chains: west w*, mid m*, east e*, with cross links at both crossings.
  const NODES = {
    a0: [0, 18.5], w0: [-15.8, 17.5], w1: [-15.8, 10], w2: [-15.8, 0.5], w3: [-15.8, -7.5], w4: [-13.8, -9.5],
    m0: [2.2, 8.6], m1: [0, 12], m2: [0.5, 4.5], m3: [-2.5, -4.5], m4: [0.5, -10.5],
    e1: [17.5, 11], e2: [15.4, 4.6], e3: [11.5, -4.5], e4: [3.5, -16.8], n1: [0.5, -16.8],
    c1: [-9.2, -5.6], c2: [9, 2.5],
    s1: [-13.5, -16.5], s2: [-6.8, -14.3], plant: [-10, -14],
    d0: [14.5, -18], d1: [7.5, -14.8], hold1: [-15, -9.2], hold2: [1.5, -16.5],
  };
  const EDGES = [
    ['a0', 'w0'], ['a0', 'm0'], ['a0', 'e1'],
    ['w0', 'w1'], ['w1', 'w2'], ['w2', 'w3'], ['w3', 'w4'], ['w3', 'c1'],
    ['m0', 'm1'], ['m0', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m2', 'c2'],
    ['e1', 'e2'], ['e2', 'e3'], ['e2', 'c2'], ['e3', 'e4'],
    ['c1', 'm3'], ['c1', 's2'], ['c2', 'e3'],
    ['w4', 'c1'], ['w4', 'hold1'], ['m4', 'n1'], ['n1', 'e4'], ['n1', 's2'], ['e4', 's2'], ['e4', 'd1'],
    ['s2', 'plant'], ['s1', 'plant'], ['s1', 'c1'],
    ['d0', 'd1'], ['d1', 'hold2'], ['hold2', 'n1'], ['hold2', 's2'],
  ];
  const nodes = new Map();
  for (const [id, [x, z]] of Object.entries(NODES)) nodes.set(id, new THREE.Vector3(x, 0, z));
  const links = new Map();
  for (const id of nodes.keys()) links.set(id, []);
  for (const [a, b] of EDGES) {
    links.get(a).push(b);
    links.get(b).push(a);
  }

  function nearestNode(pos) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, point] of nodes) {
      const d = (point.x - pos.x) ** 2 + (point.z - pos.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  // Breadth-first over the graph; the walk itself is steered corner to corner by the bots.
  function path(fromPos, toPos) {
    const start = nearestNode(fromPos);
    const goal = nearestNode(toPos);
    if (start === goal) return [toPos.clone()];
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of links.get(cur)) {
        if (!prev.has(next)) {
          prev.set(next, cur);
          queue.push(next);
        }
      }
    }
    if (!prev.has(goal)) return [toPos.clone()];
    const ids = [];
    for (let cur = goal; cur !== null; cur = prev.get(cur)) ids.push(cur);
    ids.reverse();
    const points = ids.map((id) => nodes.get(id).clone());
    points.push(toPos.clone());
    return points;
  }

  return {
    colliders,
    shootables,
    group,
    path,
    nearestNode,
    nodes,
    site: { minX: -16.1, maxX: -3.9, minZ: -19.1, maxZ: -8.9, center: new THREE.Vector3(-10, 0, -14) },
    plantSpot: new THREE.Vector3(-10, 0, -14),
    spawns: {
      attack: [
        new THREE.Vector3(-3, 0, 18.5), new THREE.Vector3(0, 0, 19.2),
        new THREE.Vector3(3, 0, 18.5), new THREE.Vector3(6, 0, 19.2),
      ],
      defend: [
        new THREE.Vector3(12.5, 0, -18.5), new THREE.Vector3(15, 0, -17),
        new THREE.Vector3(-13.5, 0, -16.5), new THREE.Vector3(1.5, 0, -16.5),
      ],
    },
    holds: {
      attack: ['s1', 's2', 'w4', 'e4'],
      defend: ['s1', 'hold2', 'm4', 'd1'],
    },
    lanes: {
      west: ['a0', 'w1', 'w2', 'w3', 'w4'],
      mid: ['a0', 'm1', 'm2', 'm3', 'm4', 'e4'],
      east: ['a0', 'e1', 'e2', 'e3', 'e4'],
    },
    smokes: [],
  };
}
