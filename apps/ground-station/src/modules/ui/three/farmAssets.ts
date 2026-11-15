import * as THREE from 'three';
import {
  createAsphaltRoadTexture,
  createBrushedMetalBumpTexture,
  createCorrugatedSteelMaps,
  createSolarCellTexture,
} from './textures';

export interface TractorRig {
  root: THREE.Group;
  wheels: THREE.Group[];
  beaconMesh: THREE.Mesh;
}

export interface HangarComplexRig {
  root: THREE.Group;
  windsockGroup: THREE.Group;
  hangarLight: THREE.PointLight;
}

export interface WeatherMastRig {
  root: THREE.Group;
  windVaneGroup: THREE.Group;
  anemometerRotor: THREE.Group;
}

export interface WindTurbineRig {
  root: THREE.Group;
  rotorGroup: THREE.Group;
  strobeMat: THREE.MeshStandardMaterial;
}

/**
 * Multi-part PBR Agricultural Tractor + Tandem Supply Trailer with Twin AgroMax IBC Tanks
 */
export function buildTractorWithTrailerModel(maxAnisotropy: number): TractorRig {
  const root = new THREE.Group();
  root.name = 'AgriculturalTractorAndTrailer';

  const bodyGreenMat = new THREE.MeshPhysicalMaterial({
    color: 0x15803d,
    metalness: 0.35,
    roughness: 0.28,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.72,
    roughness: 0.44,
  });
  const rimYellowMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.42,
    roughness: 0.32,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x17181c,
    metalness: 0.04,
    roughness: 0.88,
  });
  const cabGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x162436,
    metalness: 0.1,
    roughness: 0.08,
    transmission: 0.55,
    transparent: true,
    opacity: 0.82,
    clearcoat: 1.0,
    ior: 1.5,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    metalness: 0.92,
    roughness: 0.18,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.2,
    roughness: 0.15,
  });
  const ibcFluidMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.75,
    transparent: true,
    opacity: 0.86,
  });

  const wheels: THREE.Group[] = [];

  const makeLuggedWheel = (radius: number, width: number, isYellowRim: boolean): THREE.Group => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 24),
      tireMat,
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    wg.add(tire);

    // Sidewall torus shoulder
    const shoulder = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.88, width * 0.18, 8, 24),
      tireMat,
    );
    shoulder.rotation.y = Math.PI / 2;
    wg.add(shoulder);

    // Deep agricultural tread lugs
    const lugCount = 12;
    const lugGeo = new THREE.BoxGeometry(width * 0.82, radius * 0.12, radius * 0.14);
    for (let i = 0; i < lugCount; i++) {
      const ang = (i / lugCount) * Math.PI * 2;
      const lug = new THREE.Mesh(lugGeo, tireMat);
      lug.position.set(0, Math.cos(ang) * radius, Math.sin(ang) * radius);
      lug.rotation.x = -ang;
      wg.add(lug);
    }

    // Rim & hub bolts
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width * 1.03, 16),
      isYellowRim ? rimYellowMat : chassisMat,
    );
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width * 1.12, 12),
      chassisMat,
    );
    hub.rotation.z = Math.PI / 2;
    wg.add(hub);

    return wg;
  };

  // Tractor Chassis & Axles
  const tractorGroup = new THREE.Group();
  root.add(tractorGroup);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.36, 2.75), chassisMat);
  frame.position.set(0, 0.72, 0);
  frame.castShadow = true;
  tractorGroup.add(frame);

  // Sculpted Engine Hood (ExtrudeGeometry)
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(0, 0);
  hoodShape.lineTo(1.55, 0);
  hoodShape.lineTo(1.48, 0.62);
  hoodShape.lineTo(0.15, 0.76);
  hoodShape.lineTo(0, 0.72);
  hoodShape.closePath();

  const hoodGeo = new THREE.ExtrudeGeometry(hoodShape, {
    depth: 0.98,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  hoodGeo.rotateY(-Math.PI / 2);
  hoodGeo.translate(0.49, 0.90, 0.08);
  const hood = new THREE.Mesh(hoodGeo, bodyGreenMat);
  hood.castShadow = true;
  tractorGroup.add(hood);

  // Front grille & twin headlights
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.44, 0.08), chassisMat);
  grille.position.set(0, 1.18, 1.62);
  tractorGroup.add(grille);

  for (const hx of [-0.32, 0.32]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12), headlightMat);
    hl.rotation.x = Math.PI / 2;
    hl.position.set(hx, 1.24, 1.64);
    tractorGroup.add(hl);
  }

  // Front ballast weights
  const weightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 0.32), chassisMat);
  weightBlock.position.set(0, 0.78, 1.62);
  weightBlock.castShadow = true;
  tractorGroup.add(weightBlock);

  // Exhaust stack pipe
  const exhaustBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.45, 10), chromeMat);
  exhaustBase.position.set(0.56, 1.72, 0.42);
  exhaustBase.castShadow = true;
  const exhaustTip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.25, 10), chromeMat);
  exhaustTip.position.set(0.58, 2.48, 0.36);
  exhaustTip.rotation.x = -0.35;
  tractorGroup.add(exhaustBase, exhaustTip);

  // Operator Cabin (ROPS pillars, panoramic glass, roof cap, seat)
  const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.12, 1.38), chassisMat);
  cabFloor.position.set(0, 0.94, -0.78);
  tractorGroup.add(cabFloor);

  const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.18, 1.24), cabGlassMat);
  cabGlass.position.set(0, 1.58, -0.78);
  tractorGroup.add(cabGlass);

  // ROPS structural corner posts
  for (const px of [-0.63, 0.63]) {
    for (const pz of [-1.40, -0.16]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.24, 0.07), chassisMat);
      post.position.set(px, 1.58, pz);
      post.castShadow = true;
      tractorGroup.add(post);
    }
  }

  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 1.52), bodyGreenMat);
  cabRoof.position.set(0, 2.24, -0.78);
  cabRoof.castShadow = true;
  tractorGroup.add(cabRoof);

  // Amber safety beacon on tractor cab roof
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const beaconMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 12), beaconMat);
  beaconMesh.position.set(0, 2.38, -0.35);
  tractorGroup.add(beaconMesh);

  // Rear Mudguards
  for (const fx of [-0.94, 0.94]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.10, 1.15), bodyGreenMat);
    fender.position.set(fx, 1.52, -0.92);
    fender.castShadow = true;
    tractorGroup.add(fender);
  }

  // Tractor Wheels (2 large rear, 2 front)
  const rearCoords: [number, number, number][] = [
    [-0.96, 0.86, -0.92],
    [0.96, 0.86, -0.92],
  ];
  rearCoords.forEach(([wx, wy, wz]) => {
    const rw = makeLuggedWheel(0.86, 0.42, true);
    rw.position.set(wx, wy, wz);
    tractorGroup.add(rw);
    wheels.push(rw);
  });

  const frontCoords: [number, number, number][] = [
    [-0.86, 0.56, 1.12],
    [0.86, 0.56, 1.12],
  ];
  frontCoords.forEach(([wx, wy, wz]) => {
    const fw = makeLuggedWheel(0.56, 0.28, true);
    fw.position.set(wx, wy, wz);
    tractorGroup.add(fw);
    wheels.push(fw);
  });

  // Tandem-Axle Agricultural Supply Trailer behind Tractor
  const trailerGroup = new THREE.Group();
  trailerGroup.position.set(0, 0, -4.15);
  root.add(trailerGroup);

  const drawbar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 1.75), chassisMat);
  drawbar.position.set(0, 0.62, 1.92);
  drawbar.castShadow = true;
  trailerGroup.add(drawbar);

  const trailerBed = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 3.25), chassisMat);
  trailerBed.position.set(0, 0.72, 0);
  trailerBed.castShadow = true;
  trailerBed.receiveShadow = true;
  trailerGroup.add(trailerBed);

  // Side rails
  for (const rx of [-0.84, 0.84]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 3.2), bodyGreenMat);
    rail.position.set(rx, 0.96, 0);
    rail.castShadow = true;
    trailerGroup.add(rail);
  }

  // Twin 1000L IBC Fertilizer/Spray Solution Tanks in Steel Cages
  for (const tz of [-0.72, 0.72]) {
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.96, 1.08), ibcFluidMat);
    tank.position.set(0, 1.28, tz);
    tank.castShadow = true;
    trailerGroup.add(tank);

    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 1.02, 1.14),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, wireframe: true }),
    );
    cage.position.set(0, 1.28, tz);
    trailerGroup.add(cage);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), chassisMat);
    cap.position.set(0, 1.80, tz);
    trailerGroup.add(cap);
  }

  // 4 Tandem Trailer Wheels
  for (const tx of [-0.94, 0.94]) {
    for (const tz of [-0.62, 0.62]) {
      const tw = makeLuggedWheel(0.42, 0.24, false);
      tw.position.set(tx, 0.42, tz);
      trailerGroup.add(tw);
      wheels.push(tw);
    }
  }

  // Subtle rear amber/red tail marker bar
  const tailBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.09, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.75 }),
  );
  tailBar.position.set(0, 0.70, -1.65);
  trailerGroup.add(tailBar);

  // Subtle procedural metal detail bump on frame
  chassisMat.bumpMap = createBrushedMetalBumpTexture(maxAnisotropy);
  chassisMat.bumpScale = 0.008;

  return { root, wheels, beaconMesh };
}

/**
 * Modern Corrugated Steel AgroMax Drone Hangar + Twin Galvanized Grain Silos + Windsock Mast
 */
export function buildAgroHangarAndSilosModel(maxAnisotropy: number): HangarComplexRig {
  const root = new THREE.Group();
  root.name = 'AgroMaxHangarAndSilos';

  const steelWalls = createCorrugatedSteelMaps(maxAnisotropy, '#8d96a3');
  const roofMaps = createCorrugatedSteelMaps(maxAnisotropy, '#334155');
  const siloMaps = createCorrugatedSteelMaps(maxAnisotropy, '#cbd5e1');

  const wallMat = new THREE.MeshStandardMaterial({
    map: steelWalls.map,
    normalMap: steelWalls.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    metalness: 0.65,
    roughness: 0.42,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    metalness: 0.72,
    roughness: 0.36,
  });
  const siloMat = new THREE.MeshStandardMaterial({
    map: siloMaps.map,
    normalMap: siloMaps.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    metalness: 0.84,
    roughness: 0.28,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.38,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x5c646d,
    roughness: 0.9,
    metalness: 0.04,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x059669,
    roughness: 0.38,
    metalness: 0.3,
  });

  // Concrete apron foundation
  const apron = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.16, 14.5), concreteMat);
  apron.position.set(0, 0.08, 0);
  apron.receiveShadow = true;
  root.add(apron);

  // Main Hangar Shell (open front bay facing +X toward the field road)
  const hangarW = 8.4;
  const hangarD = 7.4;
  const hangarH = 4.1;
  const hx = -2.2;
  const hz = -1.6;

  // Back wall, Left wall, Right wall
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, hangarH, hangarD), wallMat);
  backWall.position.set(hx - hangarW / 2, 0.16 + hangarH / 2, hz);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  root.add(backWall);

  for (const side of [-1, 1]) {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(hangarW, hangarH, 0.18), wallMat);
    sideWall.position.set(hx, 0.16 + hangarH / 2, hz + side * (hangarD / 2));
    sideWall.castShadow = true;
    sideWall.receiveShadow = true;
    root.add(sideWall);
  }

  // Interior workbenches & battery charging rack
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 4.6), frameMat);
  bench.position.set(hx - 3.2, 0.64, hz);
  bench.castShadow = true;
  root.add(bench);

  const chargePad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.08, 24), accentMat);
  chargePad.position.set(hx + 1.2, 0.20, hz);
  root.add(chargePad);

  // Hangar front steel portal lintel + AgroMax green header trim
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.95, hangarD + 0.2), accentMat);
  lintel.position.set(hx + hangarW / 2, 0.16 + hangarH - 0.45, hz);
  lintel.castShadow = true;
  root.add(lintel);

  // Pitched Gable Roof Panels
  for (const side of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(hangarW + 0.7, 0.14, hangarD * 0.56), roofMat);
    slope.position.set(hx, 0.16 + hangarH + 0.55, hz + side * (hangarD * 0.26));
    slope.rotation.x = side * 0.28;
    slope.castShadow = true;
    slope.receiveShadow = true;
    root.add(slope);
  }

  // Hangar Floodlight Fixture + Warm Interior Light
  const fixture = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.14, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 1.3 }),
  );
  fixture.position.set(hx + hangarW / 2 + 0.18, 3.65, hz);
  root.add(fixture);

  const hangarLight = new THREE.PointLight(0xffedd5, 2.2, 16, 1.8);
  hangarLight.position.set(hx + 1.8, 3.3, hz);
  root.add(hangarLight);

  // Twin Galvanized Grain Silos beside the Hangar
  const siloCoords: [number, number, number][] = [
    [-2.4, 4.4, 2.15],
    [2.6, 4.4, 1.85],
  ];
  siloCoords.forEach(([sx, sz, rad]) => {
    const bodyH = 6.2;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, bodyH, 28), siloMat);
    cyl.position.set(sx, 0.16 + bodyH / 2, sz);
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    root.add(cyl);

    // Steel stiffening rings
    for (let ry = 1.4; ry <= 5.6; ry += 1.4) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.03, 0.04, 8, 28), frameMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx, ry, sz);
      root.add(ring);
    }

    // Conical Ribbed Roof
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad + 0.15, 1.65, 28), siloMat);
    cone.position.set(sx, 0.16 + bodyH + 0.82, sz);
    cone.castShadow = true;
    root.add(cone);

    const ventCap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.35, 12), frameMat);
    ventCap.position.set(sx, 0.16 + bodyH + 1.72, sz);
    root.add(ventCap);

    // Side safety ladder
    for (const lx of [-0.18, 0.18]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, bodyH, 6), frameMat);
      rail.position.set(sx + lx, 0.16 + bodyH / 2, sz - rad - 0.12);
      root.add(rail);
    }
  });

  // Aviation Windsock Mast on Hangar Corner
  const sockMast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.4, 10), siloMat);
  sockMast.position.set(5.4, 2.78, -5.2);
  sockMast.castShadow = true;
  root.add(sockMast);

  const windsockGroup = new THREE.Group();
  windsockGroup.position.set(5.4, 5.35, -5.2);
  root.add(windsockGroup);

  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.65, side: THREE.DoubleSide });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65, side: THREE.DoubleSide });

  for (let s = 0; s < 4; s++) {
    const r1 = 0.22 - s * 0.032;
    const r2 = 0.22 - (s + 1) * 0.032;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r2, r1, 0.32, 14, 1, true),
      s % 2 === 0 ? orangeMat : whiteMat,
    );
    seg.rotation.z = -Math.PI / 2;
    seg.position.set(0.28 + s * 0.32, -s * 0.04, 0);
    windsockGroup.add(seg);
  }

  return { root, windsockGroup, hangarLight };
}

/**
 * 2x5 Monocrystalline Solar PV Microgrid Array on Galvanized H-Frames
 */
export function buildSolarMicrogridModel(maxAnisotropy: number): THREE.Group {
  const root = new THREE.Group();
  root.name = 'SolarMicrogridArray';

  const cellTex = createSolarCellTexture(maxAnisotropy);
  const panelMat = new THREE.MeshPhysicalMaterial({
    map: cellTex,
    metalness: 0.45,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.82,
    roughness: 0.32,
  });
  const darkCabinetMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.62,
    roughness: 0.4,
  });

  const gravelPad = new THREE.Mesh(
    new THREE.BoxGeometry(11.6, 0.08, 7.6),
    new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.94 }),
  );
  gravelPad.position.y = 0.04;
  gravelPad.receiveShadow = true;
  root.add(gravelPad);

  for (let row = 0; row < 2; row++) {
    const rz = -1.65 + row * 3.3;
    for (let col = 0; col < 5; col++) {
      const cx = -4.2 + col * 2.1;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.05, 8), frameMat);
      post.position.set(cx, 0.56, rz);
      post.castShadow = true;
      root.add(post);

      const panelGroup = new THREE.Group();
      panelGroup.position.set(cx, 1.12, rz);
      panelGroup.rotation.x = 0.48; // Tilted toward Anatolian southern sun

      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.05, 1.24), frameMat);
      frame.castShadow = true;
      const cells = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.06, 1.16), panelMat);
      panelGroup.add(frame, cells);
      root.add(panelGroup);
    }
  }

  // Grid Inverter & Battery Cabinet
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.68), darkCabinetMat);
  cabinet.position.set(5.1, 0.72, 0);
  cabinet.castShadow = true;
  root.add(cabinet);

  return root;
}

/**
 * Agricultural Meteorological & Anemometer Telemetry Mast (live wind direction & RPM)
 */
export function buildWeatherMastModel(): WeatherMastRig {
  const root = new THREE.Group();
  root.name = 'AgroWeatherStationMast';

  const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.78, roughness: 0.28 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.35 });

  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.4), darkMat);
  pad.position.y = 0.07;
  pad.receiveShadow = true;
  root.add(pad);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 5.2, 12), steelMat);
  mast.position.y = 2.68;
  mast.castShadow = true;
  root.add(mast);

  // Stevenson radiation louver shield
  for (let i = 0; i < 4; i++) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 14), steelMat);
    disc.position.set(0.32, 2.25 + i * 0.09, 0);
    root.add(disc);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.04), darkMat);
  arm.position.set(0.16, 2.38, 0);
  root.add(arm);

  // Wind Vane (rotates with s.windDirDeg)
  const windVaneGroup = new THREE.Group();
  windVaneGroup.position.set(0, 5.38, 0);
  root.add(windVaneGroup);

  const vaneBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8), darkMat);
  vaneBar.rotation.x = Math.PI / 2;
  const vaneFin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.24), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
  vaneFin.position.set(0, 0.04, 0.26);
  windVaneGroup.add(vaneBar, vaneFin);

  // 3-Cup Anemometer Rotor (spins proportional to s.windSpeedMs)
  const anemometerRotor = new THREE.Group();
  anemometerRotor.position.set(-0.34, 5.05, 0);
  root.add(anemometerRotor);

  const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), darkMat);
  crossArm.position.set(-0.17, 5.0, 0);
  root.add(crossArm);

  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), steelMat);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = ang;
    spoke.position.set(Math.cos(ang) * 0.14, 0, Math.sin(ang) * 0.14);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), darkMat);
    cup.position.set(Math.cos(ang) * 0.28, 0, Math.sin(ang) * 0.28);
    anemometerRotor.add(spoke, cup);
  }

  return { root, windVaneGroup, anemometerRotor };
}

/**
 * Distant Hillside Utility Wind Turbine
 */
export function buildWindTurbineModel(): WindTurbineRig {
  const root = new THREE.Group();
  root.name = 'HillsideWindTurbine';

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.34,
    metalness: 0.22,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.28,
    metalness: 0.35,
  });

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.05, 24, 16), whiteMat);
  tower.position.y = 12;
  tower.castShadow = true;
  root.add(tower);

  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.35, 3.4), whiteMat);
  nacelle.position.set(0, 24.3, -0.3);
  nacelle.castShadow = true;
  root.add(nacelle);

  const strobeMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
  });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), strobeMat);
  strobe.position.set(0, 25.15, -1.6);
  root.add(strobe);

  const rotorGroup = new THREE.Group();
  rotorGroup.position.set(0, 24.3, 1.65);
  root.add(rotorGroup);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.4, 16), hubMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.5;
  rotorGroup.add(nose);

  // Tapered aerodynamic turbine blades
  const bladeGeo = new THREE.BoxGeometry(0.62, 11.2, 0.16);
  bladeGeo.translate(0, 5.8, 0);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, whiteMat);
    blade.rotation.z = (i / 3) * Math.PI * 2;
    blade.rotation.y = 0.14; // Pitch twist
    blade.castShadow = true;
    rotorGroup.add(blade);
  }

  return { root, rotorGroup, strobeMat };
}

function mergeColoredGeometries(
  parts: Array<{
    geo: THREE.BufferGeometry;
    ox: number;
    oy: number;
    oz: number;
    sx: number;
    sy: number;
    sz: number;
    rx?: number;
    rz?: number;
    noiseAmp?: number;
    seed?: number;
    aoBase?: number;
    aoSpan?: number;
    minY?: number;
  }>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();

  parts.forEach((p, idx) => {
    const pos = p.geo.attributes.position as THREE.BufferAttribute;
    const uv = p.geo.attributes.uv as THREE.BufferAttribute | undefined;
    euler.set(p.rx ?? 0, 0, p.rz ?? 0);
    const amp = p.noiseAmp ?? 0;
    const seed = p.seed ?? idx * 1.7;
    const aoBase = p.aoBase ?? 0.55;
    const aoSpan = p.aoSpan ?? 0.45;
    const minY = p.minY ?? 1.5;

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const ly = pos.getY(i);
      const lz = pos.getZ(i);
      const disp =
        amp > 0
          ? 1.0 +
            Math.sin(lx * 3.8 + ly * 2.9 + seed) * amp +
            Math.cos(lz * 3.4 - ly * 2.3 + seed * 0.7) * (amp * 0.75)
          : 1.0;

      vec.set(lx * p.sx * disp, ly * p.sy * disp, lz * p.sz * disp).applyEuler(euler);
      const wx = vec.x + p.ox;
      const wy = vec.y + p.oy;
      const wz = vec.z + p.oz;
      positions.push(wx, wy, wz);

      if (uv) {
        uvs.push(uv.getX(i), uv.getY(i));
      } else {
        uvs.push(lx * 0.5 + 0.5, ly * 0.5 + 0.5);
      }

      const t = Math.max(0, Math.min(1, (wy - minY) / 3.5));
      const ao = Math.max(0.38, Math.min(1.08, aoBase + t * aoSpan));
      colors.push(ao, ao * 1.02, ao * 0.90);
    }

    if (p.geo.index) {
      const idxArr = p.geo.index.array;
      for (let k = 0; k < idxArr.length; k++) {
        indices.push(idxArr[k] + vertexOffset);
      }
    } else {
      for (let k = 0; k < pos.count; k++) {
        indices.push(k + vertexOffset);
      }
    }
    vertexOffset += pos.count;
    p.geo.dispose();
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Natural Upright Anatolian Oak / Almond Tree Geometries:
 * - Strictly vertical, rooted main trunk (-0.35..3.05) + 4 symmetric upper boughs
 * - Balanced overlapping foliage crown centered cleanly around (0, y, 0) so trees stand tall & straight
 */
export function createOakTreeGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
} {
  const trunkGeo = mergeColoredGeometries([
    {
      geo: new THREE.CylinderGeometry(0.20, 0.36, 3.4, 10),
      ox: 0,
      oy: 1.35,
      oz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      aoBase: 0.72,
      aoSpan: 0.25,
      minY: 0,
    },
    {
      geo: new THREE.CylinderGeometry(0.08, 0.14, 1.3, 7),
      ox: -0.34,
      oy: 2.95,
      oz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      rz: 0.42,
      aoBase: 0.65,
      aoSpan: 0.2,
      minY: 0,
    },
    {
      geo: new THREE.CylinderGeometry(0.08, 0.14, 1.3, 7),
      ox: 0.34,
      oy: 2.95,
      oz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      rz: -0.42,
      aoBase: 0.65,
      aoSpan: 0.2,
      minY: 0,
    },
    {
      geo: new THREE.CylinderGeometry(0.07, 0.12, 1.25, 7),
      ox: 0,
      oy: 2.95,
      oz: 0.32,
      sx: 1,
      sy: 1,
      sz: 1,
      rx: 0.40,
      aoBase: 0.65,
      aoSpan: 0.2,
      minY: 0,
    },
    {
      geo: new THREE.CylinderGeometry(0.07, 0.12, 1.25, 7),
      ox: 0,
      oy: 2.95,
      oz: -0.32,
      sx: 1,
      sy: 1,
      sz: 1,
      rx: -0.40,
      aoBase: 0.65,
      aoSpan: 0.2,
      minY: 0,
    },
  ]);

  const lobes: Array<[number, number, number, number, number, number]> = [
    [0.0, 4.15, 0.0, 1.32, 1.22, 1.32],
    [-0.92, 3.55, 0.0, 0.92, 0.88, 0.92],
    [0.92, 3.55, 0.0, 0.92, 0.88, 0.92],
    [0.0, 3.55, 0.92, 0.92, 0.88, 0.92],
    [0.0, 3.55, -0.92, 0.92, 0.88, 0.92],
    [-0.55, 4.55, 0.55, 0.82, 0.84, 0.82],
    [0.55, 4.55, -0.55, 0.82, 0.84, 0.82],
    [-0.55, 4.55, -0.55, 0.80, 0.82, 0.80],
    [0.55, 4.55, 0.55, 0.80, 0.82, 0.80],
    [0.0, 5.15, 0.0, 0.78, 0.82, 0.78],
  ];

  const canopyGeo = mergeColoredGeometries(
    lobes.map(([ox, oy, oz, sx, sy, sz], i) => ({
      geo: new THREE.SphereGeometry(1.0, 12, 10),
      ox,
      oy,
      oz,
      sx,
      sy,
      sz,
      noiseAmp: 0.06,
      seed: i * 2.13,
      aoBase: 0.50,
      aoSpan: 0.52,
      minY: 2.4,
    })),
  );

  return { trunkGeo, canopyGeo };
}

/**
 * Upright Tall Windbreak Anatolian Poplar / Cypress Tree Geometries (strictly vertical & symmetrical)
 */
export function createPoplarTreeGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
} {
  const trunkGeo = mergeColoredGeometries([
    {
      geo: new THREE.CylinderGeometry(0.12, 0.25, 3.6, 10),
      ox: 0,
      oy: 1.45,
      oz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      aoBase: 0.75,
      aoSpan: 0.2,
      minY: 0,
    },
  ]);

  const tiers: Array<[number, number, number, number, number, number]> = [
    [0, 2.85, 0, 0.90, 1.38, 0.90],
    [0, 4.05, 0, 0.82, 1.45, 0.82],
    [0, 5.15, 0, 0.70, 1.32, 0.70],
    [0, 6.15, 0, 0.54, 1.15, 0.54],
    [0, 7.00, 0, 0.34, 0.88, 0.34],
  ];

  const canopyGeo = mergeColoredGeometries(
    tiers.map(([ox, oy, oz, sx, sy, sz], i) => ({
      geo: new THREE.SphereGeometry(1.0, 12, 10),
      ox,
      oy,
      oz,
      sx,
      sy,
      sz,
      noiseAmp: 0.04,
      seed: i * 3.1,
      aoBase: 0.52,
      aoSpan: 0.50,
      minY: 2.0,
    })),
  );

  return { trunkGeo, canopyGeo };
}

/**
 * Drone Helipad RTK-GNSS Reference Base & Ruggedized Field GCS Tripod Station
 */
export function buildDroneGcsStation(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DroneRtkAndGcsStation';

  const tripodMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.36 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.25, roughness: 0.38 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });

  // RTK Base Station Tripod
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 1.48, 6), tripodMat);
    leg.position.set(Math.cos(ang) * 0.28, 0.70, Math.sin(ang) * 0.28);
    leg.rotation.z = Math.cos(ang) * 0.32;
    leg.rotation.x = -Math.sin(ang) * 0.32;
    leg.castShadow = true;
    group.add(leg);
  }
  const rtkPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.15, 8), tripodMat);
  rtkPole.position.set(0, 1.85, 0);
  rtkPole.castShadow = true;
  const rtkDome = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.10, 16), orangeMat);
  rtkDome.position.set(0, 2.45, 0);
  group.add(rtkPole, rtkDome);

  // Ruggedized GCS Operator Case & Telemetry Whip Antennas beside tripod
  const tableStand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.18, 0.92, 10), tripodMat);
  tableStand.position.set(1.1, 0.46, 0.3);
  const gcsCase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.44), tripodMat);
  gcsCase.position.set(1.1, 0.95, 0.3);
  gcsCase.castShadow = true;
  const gcsScreen = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.04), screenMat);
  gcsScreen.position.set(1.1, 1.15, 0.14);
  gcsScreen.rotation.x = -0.32;
  group.add(tableStand, gcsCase, gcsScreen);

  for (const ax of [0.9, 1.3]) {
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.58, 6), tripodMat);
    whip.position.set(ax, 1.38, 0.08);
    group.add(whip);
  }

  return group;
}

/**
 * Paved Asphalt Rural Service Road + Roadside Concrete Utility Poles (placed west of the 116x96 parcel)
 */
export function buildRuralRoadAndPoles(maxAnisotropy: number): {
  group: THREE.Group;
  roadMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  group.name = 'RuralRoadAndUtilityCorridor';

  const roadTex = createAsphaltRoadTexture(maxAnisotropy);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.84,
    metalness: 0.04,
  });

  // Main N-S paved rural road along the west edge (-67.5)
  const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.05, 176), roadMat);
  mainRoad.position.set(-67.5, 0.025, 2);
  mainRoad.receiveShadow = true;
  group.add(mainRoad);

  // Spur apron into Ground Station & Command PC Compound (-62, 35)
  const gsSpur = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.045, 3.0), roadMat);
  gsSpur.position.set(-62.2, 0.022, 41.0);
  gsSpur.receiveShadow = true;
  group.add(gsSpur);

  const hangarSpur = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.045, 4.6), roadMat);
  hangarSpur.position.set(-71.2, 0.022, 14.0);
  hangarSpur.receiveShadow = true;
  group.add(hangarSpur);

  // Roadside Concrete Utility Poles + Crossarms
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.85, metalness: 0.08 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 });
  const poleZs = [-68, -42, -14, 14, 42, 68];

  poleZs.forEach((pz) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 6.8, 10), poleMat);
    pole.position.set(-70.2, 3.4, pz);
    pole.castShadow = true;
    group.add(pole);

    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.09), armMat);
    cross.position.set(-70.2, 6.45, pz);
    cross.castShadow = true;
    group.add(cross);
  });

  // Overhead power cables spanning utility poles
  for (const offset of [-0.52, 0, 0.52]) {
    const pts = poleZs.map((pz) => new THREE.Vector3(-70.2 + offset, 6.48, pz));
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 44, 0.018, 5, false),
      armMat,
    );
    group.add(wire);
  }

  return { group, roadMat };
}
