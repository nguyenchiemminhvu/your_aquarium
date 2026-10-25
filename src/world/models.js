import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const unitX = new THREE.Vector3(1, 0, 0);

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function smoothPath(points, tension = 0.55) {
  return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', tension);
}

function tubeBetween(points, radius, material, radialSegments = 8) {
  const curve = smoothPath(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 8), radius, radialSegments, false), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeFishBody(spec) {
  const profile = [
    [-1.15, 0.035], [-1.02, 0.15], [-0.82, 0.27], [-0.48, 0.405],
    [-0.05, 0.49], [0.34, 0.455], [0.66, 0.335], [0.9, 0.20], [1.06, 0.075], [1.11, 0.018],
  ];
  const curve = new THREE.SplineCurve(profile.map(([x, r]) => new THREE.Vector2(x, r)));
  const samples = curve.getPoints(54);
  const radial = 48;
  const positions = [];
  const colors = [];
  const indices = [];
  const base = new THREE.Color(spec.body);
  const highlight = new THREE.Color(spec.highlight);
  const belly = new THREE.Color(spec.belly);

  for (let i = 0; i < samples.length; i++) {
    const { x, y } = samples[i];
    const radius = Math.max(0.006, y);
    const t = i / (samples.length - 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ry = radius * c;
      const rz = radius * 0.69 * s;
      positions.push(x, ry, rz);
      const dorsal = THREE.MathUtils.smoothstep(c, 0.2, 0.92);
      const underside = THREE.MathUtils.smoothstep(-c, 0.2, 0.95);
      const along = Math.sin(t * Math.PI) * 0.13;
      const col = base.clone().lerp(highlight, dorsal * 0.38 + along);
      col.lerp(belly, underside * 0.60);
      if (spec.stripe && (Math.abs(x + 0.15) < 0.12 || Math.abs(x - 0.48) < 0.11)) {
        col.lerp(new THREE.Color('#fff4d9'), 0.75);
      }
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finShape(points, depth = 0.035) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    if (points[i].length === 6) shape.bezierCurveTo(...points[i]);
    else if (points[i].length === 4) shape.quadraticCurveTo(...points[i]);
    else shape.lineTo(...points[i]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 2, steps: 1,
    bevelSize: 0.025, bevelThickness: 0.018, curveSegments: 12,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function createEye(parent, zSign, spec) {
  const eye = new THREE.Group();
  eye.position.set(0.77, 0.145, zSign * 0.255);
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.078, 18, 14), new THREE.MeshStandardMaterial({ color: '#fff9e8', roughness: 0.23 }));
  white.scale.set(1, 1, 0.58);
  eye.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.041, 16, 12), new THREE.MeshStandardMaterial({ color: '#101820', roughness: 0.12 }));
  pupil.position.set(0.012, 0, zSign * 0.035);
  eye.add(pupil);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  glint.position.set(0.03, 0.022, zSign * 0.052);
  eye.add(glint);
  parent.add(eye);
}

export function makeFishModel(species = 'clown') {
  const specs = {
    clown: { body: '#e87936', highlight: '#ffb26e', belly: '#ffe8cb', fin: '#ef7c39', stripe: true },
    tang: { body: '#176bc6', highlight: '#58bafa', belly: '#c0e8f7', fin: '#f2d34f', stripe: false },
    gold: { body: '#d99a20', highlight: '#ffd96c', belly: '#fff0bd', fin: '#f3a33a', stripe: false },
  };
  const spec = specs[species] || specs.clown;
  const root = new THREE.Group();
  root.name = `fish-${species}`;
  const bodyMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.32, metalness: 0.03,
    clearcoat: 0.72, clearcoatRoughness: 0.22,
  });
  const body = new THREE.Mesh(makeFishBody(spec), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  const finMat = new THREE.MeshPhysicalMaterial({ color: spec.fin, roughness: 0.38, metalness: 0.02, clearcoat: 0.5, side: THREE.DoubleSide });
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.9, 0, 0);
  const tail = new THREE.Mesh(finShape([
    [0, 0], [-0.28, 0.10, -0.52, 0.60], [-0.76, 0.57, -0.98, 0.44],
    [-0.78, 0.18, -0.67, 0.015], [-0.78, -0.18, -0.98, -0.44],
    [-0.76, -0.57, -0.52, -0.60], [-0.28, -0.10, 0, 0],
  ], 0.045), finMat);
  tail.position.x = -0.01;
  tail.castShadow = true;
  tailPivot.add(tail);
  root.add(tailPivot);

  const dorsal = new THREE.Mesh(finShape([
    [-0.52, 0.36], [-0.28, 0.66, 0.08, 0.70], [0.38, 0.43, 0.57, 0.40], [0.26, 0.38, -0.52, 0.36],
  ], 0.035), finMat);
  dorsal.position.z = 0;
  root.add(dorsal);

  const anal = new THREE.Mesh(finShape([
    [-0.56, -0.34], [-0.30, -0.58, 0.05, -0.61], [0.36, -0.39, 0.43, -0.33], [0.14, -0.34, -0.56, -0.34],
  ], 0.03), finMat);
  root.add(anal);

  const pectorals = [];
  for (const sign of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.03, -0.06, sign * 0.315);
    const fin = new THREE.Mesh(finShape([
      [0, 0], [-0.18, -0.02, -0.26, -0.30], [-0.69, -0.52, -0.78, -0.43],
      [-0.60, -0.14, -0.16, 0.04], [0, 0],
    ], 0.025), finMat);
    fin.rotation.y = sign * -0.18;
    fin.castShadow = true;
    pivot.add(fin);
    root.add(pivot);
    pectorals.push({ pivot, sign });
  }

  for (const sign of [-1, 1]) createEye(root, sign, spec);

  const gillMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.body).multiplyScalar(0.62), roughness: 0.56 });
  for (const sign of [-1, 1]) {
    const gill = new THREE.Mesh(
      new THREE.TubeGeometry(smoothPath([[0.48, 0.21, sign * 0.282], [0.43, 0.02, sign * 0.315], [0.48, -0.18, sign * 0.275]]), 18, 0.012, 7, false),
      gillMat,
    );
    root.add(gill);
  }

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: '#392c27', roughness: 0.7 }));
  mouth.position.set(1.06, -0.025, 0);
  mouth.scale.set(0.8, 0.35, 0.55);
  root.add(mouth);

  return { root, tailPivot, pectorals, body, species };
}

function addCoralBranch(group, points, radius, material) {
  const curve = smoothPath(points, 0.7);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 9, false), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeBranchCoral(seed = 1) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: '#bc6d62', roughness: 0.6 });
  const branchMats = [
    new THREE.MeshStandardMaterial({ color: '#e58d79', roughness: 0.52 }),
    new THREE.MeshStandardMaterial({ color: '#d27a70', roughness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: '#f0a48a', roughness: 0.48 }),
  ];
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.43, 0.25, 10), baseMat);
  base.position.y = 0.13;
  base.castShadow = true;
  group.add(base);
  const stems = [
    [[0, 0.2, 0], [-0.08, 0.55, 0.02], [-0.32, 0.95, 0.10], [-0.38, 1.35, 0.18]],
    [[0.05, 0.2, -0.04], [0.12, 0.58, -0.13], [0.42, 0.88, -0.22], [0.55, 1.25, -0.25]],
    [[0.02, 0.2, 0.08], [0.18, 0.58, 0.18], [0.12, 0.98, 0.38], [0.28, 1.40, 0.42]],
    [[-0.07, 0.2, -0.08], [-0.38, 0.55, -0.20], [-0.68, 0.87, -0.32], [-0.8, 1.18, -0.36]],
    [[0.00, 0.2, 0.02], [-0.04, 0.72, -0.12], [0.02, 1.12, -0.36], [-0.12, 1.57, -0.48]],
  ];
  stems.forEach((stem, index) => {
    const jittered = stem.map(([x, y, z], i) => [x + (random() - 0.5) * 0.08, y, z + (random() - 0.5) * 0.08]);
    addCoralBranch(group, jittered, 0.11 - index * 0.008, branchMats[index % branchMats.length]);
    const [x, y, z] = jittered[2];
    if (index !== 4) {
      const side = index % 2 ? 1 : -1;
      addCoralBranch(group, [[x, y, z], [x + side * 0.24, y + 0.2, z + 0.05], [x + side * 0.38, y + 0.48, z + 0.09]], 0.065, branchMats[(index + 1) % branchMats.length]);
      addCoralBranch(group, [[x, y, z], [x - side * 0.24, y + 0.22, z - 0.08], [x - side * 0.36, y + 0.40, z - 0.1]], 0.052, branchMats[(index + 2) % branchMats.length]);
    }
  });
  return { group, radius: 0.86, height: 1.8 };
}

function makeFanCoral(seed = 2) {
  const random = seededRandom(seed + 88);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#bc789a', roughness: 0.5, side: THREE.DoubleSide });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.31, 0.2, 9), new THREE.MeshStandardMaterial({ color: '#795768', roughness: 0.8 }));
  base.position.y = 0.1;
  group.add(base);
  const center = [0, 0.18, 0];
  const endpoints = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 10) * Math.PI * 0.96 - Math.PI * 0.48;
    const x = Math.sin(a) * 0.86;
    const y = 1.42 + Math.cos(a) * 0.22;
    const z = (random() - 0.5) * 0.08;
    endpoints.push([x, y, z]);
    addCoralBranch(group, [center, [x * 0.35, 0.58 + Math.abs(x) * 0.06, z], [x * 0.72, 1.05, z], [x, y, z]], 0.035, material);
  }
  // Fine cross ribs create a fan silhouette while leaving generous swim-through gaps.
  for (let row = 1; row <= 4; row++) {
    const t = row / 5;
    for (let i = 0; i < endpoints.length - 1; i++) {
      const a = endpoints[i]; const b = endpoints[i + 1];
      const p1 = [a[0] * t, 0.35 + (a[1] - 0.35) * t, a[2]];
      const p2 = [b[0] * t, 0.35 + (b[1] - 0.35) * t, b[2]];
      addCoralBranch(group, [p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + 0.035, (p1[2] + p2[2]) / 2], p2], 0.012, material);
    }
  }
  return { group, radius: 0.9, height: 1.65 };
}

function makeRock(seed = 1, pebble = false) {
  const random = seededRandom(seed * 827 + (pebble ? 19 : 0));
  const baseRadius = pebble ? 0.48 : 0.72;
  // Weld coincident vertices before deformation. The previous per-face random
  // offsets could move duplicate vertices differently and open visible cracks.
  const sourceGeometry = new THREE.IcosahedronGeometry(baseRadius, 3);
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute('position', sourceGeometry.getAttribute('position').clone());
  if (sourceGeometry.index) positionOnly.setIndex(sourceGeometry.index.clone());
  sourceGeometry.dispose();
  const geometry = mergeVertices(positionOnly, 1e-5);
  positionOnly.dispose();
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const direction = v.clone().normalize();
    const broadVariation = 1 + Math.sin(direction.x * 4.1 + seed * 0.17) * 0.035
      + Math.cos(direction.z * 3.7 - seed * 0.11) * 0.028;
    const fineVariation = 0.975 + random() * 0.05;
    v.multiplyScalar(broadVariation * fineVariation);
    v.y *= pebble ? 0.48 : 0.76 + random() * 0.08;
    v.x *= 1.0 + random() * 0.07;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: pebble ? '#9b9b8d' : '#777b76',
    roughness: 0.94,
    metalness: 0.01,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, radius: pebble ? 0.4 : 0.74, height: pebble ? 0.46 : 1.1 };
}

function makeSeaweed(seed = 1) {
  const random = seededRandom(seed * 13 + 7);
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.23, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: '#76684e', roughness: 0.9 }),
  );
  base.position.y = 0.08;
  base.castShadow = true;
  group.add(base);
  const greens = ['#438f68', '#2f7c5a', '#69a86a', '#3b9a79'];
  const grassBlades = [];
  for (let blade = 0; blade < 9; blade++) {
    const a = (blade / 9) * TAU + random() * 0.25;
    const height = 0.9 + random() * 1.15;
    const lean = 0.20 + random() * 0.32;
    const material = new THREE.MeshStandardMaterial({
      color: greens[blade % greens.length], roughness: 0.48, side: THREE.DoubleSide,
    });
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.1, 0.15, Math.sin(a) * 0.1);
    const points = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      const sway = Math.sin(t * Math.PI * 0.5) * lean;
      points.push([Math.cos(a) * sway, t * height, Math.sin(a) * sway]);
    }
    const bladeMesh = tubeBetween(points, 0.022 + random() * 0.012, material, 7);
    bladeMesh.castShadow = true;
    pivot.add(bladeMesh);
    group.add(pivot);
    grassBlades.push({
      pivot,
      phase: random() * TAU,
      amplitude: 0.055 + random() * 0.065,
      secondary: 0.035 + random() * 0.045,
    });
  }
  group.userData.grassBlades = grassBlades;
  return { group, radius: 0.48, height: 1.8 };
}

function makeAirStone() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#263b43', roughness: 0.5, metalness: 0.42 });
  const ceramic = new THREE.MeshStandardMaterial({ color: '#9eaaa4', roughness: 0.95 });
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.38), dark);
  pump.position.set(-0.2, 0.12, 0);
  pump.castShadow = true;
  group.add(pump);
  const diffuser = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.28, 16), ceramic);
  diffuser.rotation.z = Math.PI / 2;
  diffuser.position.set(0.12, 0.2, 0);
  diffuser.castShadow = true;
  group.add(diffuser);
  const hoseCurve = smoothPath([[-0.4, 0.16, 0.12], [-0.48, 0.34, 0.28], [-0.28, 0.55, 0.34], [-0.08, 0.46, 0.12]]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 28, 0.025, 8, false), new THREE.MeshStandardMaterial({ color: '#263b43', roughness: 0.62 })));
  return { group, radius: 0.52, height: 0.58 };
}

export function makeDecoration(type, seed = 1) {
  switch (type) {
    case 'coral': return makeBranchCoral(seed);
    case 'fan': return makeFanCoral(seed);
    case 'rock': return makeRock(seed, false);
    case 'pebble': return makeRock(seed, true);
    case 'seaweed': return makeSeaweed(seed);
    case 'air': return makeAirStone();
    default: return makeRock(seed, false);
  }
}

export function makeFoodPellet() {
  const geometry = new THREE.SphereGeometry(0.075, 10, 8);
  const material = new THREE.MeshStandardMaterial({ color: '#d6a34e', roughness: 0.7, emissive: '#5a3510', emissiveIntensity: 0.12 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function makeBubble() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.035 + Math.random() * 0.025, 8, 7),
    new THREE.MeshPhysicalMaterial({ color: '#c9f1ff', transparent: true, opacity: 0.52, roughness: 0.04, metalness: 0.05, clearcoat: 1 }),
  );
  return mesh;
}
