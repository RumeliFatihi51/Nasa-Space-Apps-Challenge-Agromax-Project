import * as THREE from 'three';
import {
  createBrushedMetalBumpTexture,
  createCarbonFiberTextures,
  createConcretePadTexture,
  createCorrugatedSteelMaps,
  createSoftContactShadowTexture,
  createSolarCellTexture,
  createWaterNormalMap,
} from './textures';

export interface GroundStationRig {
  root: THREE.Group;
  azimuthGroup: THREE.Group;
  elevationGroup: THREE.Group;
  dishScaleGroup: THREE.Group;
  feedHornMesh: THREE.Mesh;
  feedGlowMat: THREE.MeshStandardMaterial;
  serverLedMesh: THREE.Mesh;
  pcLedMat: THREE.MeshStandardMaterial;
  monitorCanvas: HTMLCanvasElement;
  monitorTex: THREE.CanvasTexture;
  pcEmitLocalPos: THREE.Vector3;
  hvacFanGroup: THREE.Group;
  cablePulses: THREE.Mesh[];
  cableCurve: THREE.CatmullRomCurve3;
}

export interface DroneRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  rotors: THREE.Group[];
  rotorBlurMats: THREE.MeshBasicMaterial[];
  gimbalCamera: THREE.Group;
  sprayBoomGroup: THREE.Group;
  fovConeMesh: THREE.Mesh;
  fovConeMat: THREE.MeshBasicMaterial;
  navBeaconMat: THREE.MeshStandardMaterial;
}

export interface IrrigationRig {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  nozzlePositions: THREE.Vector3[];
}

export interface IrrigationPondRig {
  group: THREE.Group;
  fallbackWaterMesh: THREE.Mesh;
  fallbackWaterMat: THREE.MeshPhysicalMaterial;
  waterNormalMap: THREE.DataTexture;
}

/**
 * 10-part composite PBR Satellite model
 */
export function buildSatelliteModel(maxAnisotropy = 4): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ProceduralSatelliteModel';

  const mliBump = createBrushedMetalBumpTexture(maxAnisotropy);
  const solarTex = createSolarCellTexture(maxAnisotropy);

  const goldMliMat = new THREE.MeshStandardMaterial({
    color: 0xd9a426,
    metalness: 0.90,
    roughness: 0.24,
    bumpMap: mliBump,
    bumpScale: 0.03,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.32,
  });
  const solarCellMat = new THREE.MeshPhysicalMaterial({
    map: solarTex,
    metalness: 0.45,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    emissive: 0x06152c,
    emissiveIntensity: 0.25,
  });
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.1,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.72,
    roughness: 0.24,
  });

  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 1.45, 8), goldMliMat);
  bus.castShadow = true;
  group.add(bus);

  const ringGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.14, 16);
  const topRing = new THREE.Mesh(ringGeo, chassisMat);
  topRing.position.y = 0.74;
  const botRing = new THREE.Mesh(ringGeo, chassisMat);
  botRing.position.y = -0.74;
  group.add(topRing, botRing);

  const baffle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.52, 24), chassisMat);
  baffle.position.set(0, -0.95, 0.12);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 24), lensMat);
  lens.position.set(0, -1.21, 0.12);
  group.add(baffle, lens);

  for (const side of [-1, 1]) {
    const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.48, 8), chassisMat);
    yoke.rotation.z = Math.PI / 2;
    yoke.position.set(side * 0.85, 0.1, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.04, 0.98), solarCellMat);
    wing.position.set(side * 2.35, 0.1, 0);
    wing.rotation.x = 0.22;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.025, 1.02), chassisMat);
    frame.position.set(side * 2.35, 0.08, 0);
    frame.rotation.x = 0.22;
    group.add(yoke, wing, frame);
  }

  const dishPoints = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.14, 0.03),
    new THREE.Vector2(0.28, 0.10),
    new THREE.Vector2(0.36, 0.19),
  ];
  const satDish = new THREE.Mesh(new THREE.LatheGeometry(dishPoints, 24), dishMat);
  satDish.rotation.x = Math.PI;
  satDish.position.set(0, -0.82, -0.35);
  group.add(satDish);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.55, 8), chassisMat);
  mast.position.set(0.28, 1.05, 0.22);
  const tracker = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.24, 12), chassisMat);
  tracker.position.set(-0.34, 0.88, -0.18);
  tracker.rotation.z = 0.45;
  group.add(mast, tracker);

  return group;
}

/**
 * Photorealistic 12-part Ground Station Compound:
 * Gravel apron, concrete foundation pad, brushed aluminum LatheGeometry dish with bump map,
 * quadrupod struts, LNB feed horn, waveguide cable with animated data-packet pulses,
 * SDR/Server shelter with roof solar array & HVAC cooling fins.
 */
export function buildGroundStationModel(maxAnisotropy: number): GroundStationRig {
  const root = new THREE.Group();
  root.name = 'ProceduralGroundStation';

  const padTex = createConcretePadTexture(maxAnisotropy);
  const metalBump = createBrushedMetalBumpTexture(maxAnisotropy);
  const solarTex = createSolarCellTexture(maxAnisotropy);
  const shelterCorrugated = createCorrugatedSteelMaps(maxAnisotropy, '#293548');

  const gravelMat = new THREE.MeshStandardMaterial({
    color: 0x4b4a45,
    roughness: 0.95,
    metalness: 0.02,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    map: padTex,
    roughness: 0.85,
    metalness: 0.05,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x222c3a,
    metalness: 0.84,
    roughness: 0.32,
  });
  const shelterWallMat = new THREE.MeshStandardMaterial({
    map: shelterCorrugated.map,
    normalMap: shelterCorrugated.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    metalness: 0.66,
    roughness: 0.40,
  });
  const brushedAluMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.82,
    roughness: 0.24,
    bumpMap: metalBump,
    bumpScale: 0.015,
    side: THREE.DoubleSide,
  });
  const dishBackMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.65,
    roughness: 0.40,
  });
  const accentFeedMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    metalness: 0.62,
    roughness: 0.22,
  });
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.25,
    roughness: 0.65,
  });
  const solarMat = new THREE.MeshPhysicalMaterial({
    map: solarTex,
    metalness: 0.48,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  // Soft contact shadow plane
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 14),
    new THREE.MeshBasicMaterial({
      map: createSoftContactShadowTexture(),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(1.2, 0.015, 0);
  root.add(shadowPlane);

  // Gravel compound base
  const gravel = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.08, 9.6), gravelMat);
  gravel.position.set(1.3, 0.04, 0);
  gravel.receiveShadow = true;
  root.add(gravel);

  // Concrete Foundation Pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.18, 7.8), concreteMat);
  pad.position.set(1.3, 0.13, 0);
  pad.receiveShadow = true;
  root.add(pad);

  // Safety perimeter bollards
  const bollardGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.72, 10);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.4 });
  const bollardCoords: [number, number][] = [
    [-3.8, -3.5], [1.3, -3.5], [6.4, -3.5],
    [-3.8, 3.5], [6.4, 3.5],
  ];
  bollardCoords.forEach(([bx, bz]) => {
    const b = new THREE.Mesh(bollardGeo, bollardMat);
    b.position.set(bx, 0.54, bz);
    b.castShadow = true;
    root.add(b);
  });

  // Fixed Pedestal Base Flange & Pier
  const baseFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.18, 0.26, 28), darkSteelMat);
  baseFlange.position.set(-1.3, 0.34, -0.3);
  baseFlange.castShadow = true;
  baseFlange.receiveShadow = true;
  root.add(baseFlange);

  const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.66, 1.38, 28), darkSteelMat);
  pier.position.set(-1.3, 1.12, -0.3);
  pier.castShadow = true;
  root.add(pier);

  // Azimuth Turntable Group
  const azimuthGroup = new THREE.Group();
  azimuthGroup.position.set(-1.3, 1.84, -0.3);
  root.add(azimuthGroup);

  const azMotorHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.36, 28), brushedAluMat);
  azMotorHousing.castShadow = true;
  azimuthGroup.add(azMotorHousing);

  for (const side of [-0.48, 0.48]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.08, 0.36), darkSteelMat);
    arm.position.set(side, 0.62, 0);
    arm.castShadow = true;
    azimuthGroup.add(arm);
  }

  const elMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.44, 16), accentFeedMat);
  elMotor.rotation.z = Math.PI / 2;
  elMotor.position.set(0.68, 1.0, 0);
  azimuthGroup.add(elMotor);

  // Elevation Pivot Group
  const elevationGroup = new THREE.Group();
  elevationGroup.position.set(0, 1.05, 0);
  azimuthGroup.add(elevationGroup);

  const dishScaleGroup = new THREE.Group();
  elevationGroup.add(dishScaleGroup);

  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.48, 0.56), darkSteelMat);
  hub.position.set(0, 0, 0.25);
  hub.castShadow = true;
  dishScaleGroup.add(hub);

  // Parabolic Reflector Dish
  const dishProfile: THREE.Vector2[] = [];
  const R = 1.28;
  const focal = 0.94;
  for (let i = 0; i <= 16; i++) {
    const r = (i / 16) * R;
    const y = (r * r) / (4 * focal);
    dishProfile.push(new THREE.Vector2(r, y));
  }
  const dishGeo = new THREE.LatheGeometry(dishProfile, 48);
  dishGeo.computeVertexNormals();
  const reflector = new THREE.Mesh(dishGeo, brushedAluMat);
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0, -0.05);
  reflector.castShadow = true;
  reflector.receiveShadow = true;
  dishScaleGroup.add(reflector);

  // Rim flange ring
  const rimTorus = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 10, 48), darkSteelMat);
  rimTorus.position.set(0, 0, -((R * R) / (4 * focal)) - 0.05);
  dishScaleGroup.add(rimTorus);

  // Back radial ribs
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.98, 0.14), dishBackMat);
    rib.position.set(Math.cos(ang) * 0.56, Math.sin(ang) * 0.56, 0.08);
    rib.rotation.z = ang + Math.PI / 2;
    rib.rotation.x = 0.24;
    dishScaleGroup.add(rib);
  }

  // Quadrupod Feed Struts + Corrugated LNB Horn
  const feedPos = new THREE.Vector3(0, 0, -focal - 0.16);
  const strutAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  strutAngles.forEach((ang) => {
    const rimPt = new THREE.Vector3(Math.cos(ang) * (R * 0.88), Math.sin(ang) * (R * 0.88), -0.36);
    const curve = new THREE.LineCurve3(rimPt, feedPos);
    const strut = new THREE.Mesh(new THREE.TubeGeometry(curve, 4, 0.022, 8, false), darkSteelMat);
    strut.castShadow = true;
    dishScaleGroup.add(strut);
  });

  const feedHornMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.36, 18), accentFeedMat);
  feedHornMesh.rotation.x = Math.PI / 2;
  feedHornMesh.position.copy(feedPos);
  feedHornMesh.castShadow = true;
  dishScaleGroup.add(feedHornMesh);

  const feedGlowMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const feedLensTip = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.05, 18), feedGlowMat);
  feedLensTip.rotation.x = Math.PI / 2;
  feedLensTip.position.set(feedPos.x, feedPos.y, feedPos.z - 0.19);
  dishScaleGroup.add(feedLensTip);

  const feedRingGlow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 10, 24), feedGlowMat);
  feedRingGlow.position.set(feedPos.x, feedPos.y, feedPos.z - 0.14);
  dishScaleGroup.add(feedRingGlow);

  // Armored RF Coaxial Cable Run (Dish Pedestal -> SDR Rack -> Command PC Workstation)
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.3, 0.45, 0.0),
    new THREE.Vector3(0.1, 0.28, -0.8),
    new THREE.Vector3(1.1, 0.35, -1.6),
    new THREE.Vector3(2.4, 0.85, 0.4),
  ]);
  const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 32, 0.055, 8, false), cableMat);
  cableMesh.castShadow = true;
  root.add(cableMesh);

  const cablePulses: THREE.Mesh[] = [];
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  const pulseGeo = new THREE.SphereGeometry(0.095, 10, 10);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(pulseGeo, pulseMat);
    p.visible = false;
    root.add(p);
    cablePulses.push(p);
  }

  // Compact RF SDR Receiver & Edge Server Cabinet (Rear-Right of Pad)
  const shelter = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.95, 1.55), shelterWallMat);
  shelter.position.set(1.4, 1.18, -2.0);
  shelter.castShadow = true;
  shelter.receiveShadow = true;
  root.add(shelter);

  const hvacUnit = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.62, 0.62), brushedAluMat);
  hvacUnit.position.set(2.45, 1.25, -2.0);
  hvacUnit.castShadow = true;
  root.add(hvacUnit);

  const hvacFanGroup = new THREE.Group();
  hvacFanGroup.position.set(2.70, 1.25, -2.0);
  for (let b = 0; b < 3; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.38, 0.08), darkSteelMat);
    blade.rotation.x = (b / 3) * Math.PI * 2;
    hvacFanGroup.add(blade);
  }
  root.add(hvacFanGroup);

  const rackFace = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.55, 0.06), brushedAluMat);
  rackFace.position.set(1.4, 1.18, -1.21);
  root.add(rackFace);

  const serverLedMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.11, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.0,
      roughness: 0.3,
    }),
  );
  serverLedMesh.position.set(1.4, 1.72, -1.20);
  root.add(serverLedMesh);

  // Solar Panels tilted on SDR Cabinet roof
  const roofSolar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.35), solarMat);
  roofSolar.position.set(1.4, 2.28, -1.95);
  roofSolar.rotation.x = 0.28;
  roofSolar.castShadow = true;
  root.add(roofSolar);

  // =========================================================================
  // COMPREHENSIVE BIG-SCREEN COMMAND WORKSTATION PC (Front-Right of Compound)
  // =========================================================================
  const pcGroup = new THREE.Group();
  pcGroup.position.set(3.2, 0.22, 1.05);
  pcGroup.rotation.y = -0.28;
  root.add(pcGroup);

  // Heavy Command Desk Surface + Steel Frame Legs
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.65), darkSteelMat);
  deskTop.position.set(0, 1.02, 0);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  pcGroup.add(deskTop);

  for (const lx of [-2.05, 2.05]) {
    for (const lz of [-0.68, 0.68]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.02, 0.12), brushedAluMat);
      leg.position.set(lx, 0.51, lz);
      leg.castShadow = true;
      pcGroup.add(leg);
    }
  }

  // Steel Desk Operator Chair tucked slightly aside
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.34, 0.48, 12), darkSteelMat);
  chairBase.position.set(-0.35, 0.24, 1.25);
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.60), cableMat);
  chairSeat.position.set(-0.35, 0.52, 1.25);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.09), cableMat);
  chairBack.position.set(-0.35, 0.92, 1.54);
  chairBack.rotation.x = 0.12;
  pcGroup.add(chairBase, chairSeat, chairBack);

  // Dual Heavy Monitor Pedestal + Articulated Arm
  const monitorBasePlate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.65), darkSteelMat);
  monitorBasePlate.position.set(-0.35, 1.11, -0.35);
  const monitorPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.35, 14), brushedAluMat);
  monitorPillar.position.set(-0.35, 1.78, -0.42);
  monitorPillar.castShadow = true;
  pcGroup.add(monitorBasePlate, monitorPillar);

  // HUGE Ultra-Wide Primary GIS Monitor (3.55 m x 2.05 m display for crystal readability)
  const monitorCanvas = document.createElement('canvas');
  monitorCanvas.width = 1024;
  monitorCanvas.height = 576;
  const monitorTex = new THREE.CanvasTexture(monitorCanvas);
  monitorTex.colorSpace = THREE.SRGBColorSpace;
  monitorTex.anisotropy = maxAnisotropy;

  const mainMonitorGroup = new THREE.Group();
  mainMonitorGroup.position.set(-0.35, 2.35, -0.26);
  mainMonitorGroup.rotation.x = -0.06;
  pcGroup.add(mainMonitorGroup);

  const bezelMesh = new THREE.Mesh(new THREE.BoxGeometry(3.75, 2.18, 0.12), darkSteelMat);
  bezelMesh.castShadow = true;
  mainMonitorGroup.add(bezelMesh);

  const screenMat = new THREE.MeshStandardMaterial({
    map: monitorTex,
    emissiveMap: monitorTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.78,
    roughness: 0.22,
    metalness: 0.05,
  });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.54, 1.98), screenMat);
  screenMesh.position.z = 0.066;
  mainMonitorGroup.add(screenMesh);

  // Side Vertical Telemetry & RF Spectrum Screen
  const sideMonitorBezel = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.68, 0.10), darkSteelMat);
  sideMonitorBezel.position.set(-2.65, 2.25, 0.08);
  sideMonitorBezel.rotation.y = 0.42;
  sideMonitorBezel.castShadow = true;
  const sideScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.94, 1.54),
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.2,
    }),
  );
  sideScreen.position.set(-2.61, 2.25, 0.14);
  sideScreen.rotation.y = 0.42;
  pcGroup.add(sideMonitorBezel, sideScreen);

  // High-Power Workstation Tower PC with Tempered Glass Side Panel & Glowing Internals
  const pcTower = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.96, 0.88), darkSteelMat);
  pcTower.position.set(1.78, 1.56, -0.05);
  pcTower.castShadow = true;
  pcGroup.add(pcTower);

  const pcLedMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const pcGlassWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.74),
    new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.08,
      metalness: 0.2,
      clearcoat: 1.0,
    }),
  );
  pcGlassWindow.rotation.y = -Math.PI / 2;
  pcGlassWindow.position.set(1.505, 1.56, -0.05);
  pcGroup.add(pcGlassWindow);

  // Glowing GPU & Liquid Cooling LED Bars inside Tower + Front Intake Strip
  const pcFrontBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.05), pcLedMat);
  pcFrontBar.position.set(1.78, 1.56, 0.40);
  const pcGpuStrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.56), pcLedMat);
  pcGpuStrip.position.set(1.49, 1.52, -0.05);
  const pcCpuRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 20), pcLedMat);
  pcCpuRing.rotation.y = Math.PI / 2;
  pcCpuRing.position.set(1.49, 1.72, -0.10);
  pcGroup.add(pcFrontBar, pcGpuStrip, pcCpuRing);

  // Mechanical Keyboard, Mouse & Flight Control Stick on Desk
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.34), cableMat);
  keyboard.position.set(-0.45, 1.10, 0.36);
  const keyGlow = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.015, 0.26), pcLedMat);
  keyGlow.position.set(-0.45, 1.122, 0.36);
  const mousePad = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.015, 0.38), cableMat);
  mousePad.position.set(0.38, 1.09, 0.38);
  const joystickBase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.32), darkSteelMat);
  joystickBase.position.set(0.95, 1.12, 0.36);
  const joystickStick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.32, 10), cableMat);
  joystickStick.position.set(0.95, 1.30, 0.36);
  pcGroup.add(keyboard, keyGlow, mousePad, joystickBase, joystickStick);

  // Dual Telemetry Whip Antennas & Map-Data Transmitter Dome atop Giant Monitor
  for (const ax of [1.65, 1.92]) {
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.92, 6), brushedAluMat);
    whip.position.set(ax, 2.48, -0.35);
    pcGroup.add(whip);
  }
  const mapTxDome = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 16), pcLedMat);
  mapTxDome.position.set(-0.35, 3.52, -0.22);
  pcGroup.add(mapTxDome);

  // Local position inside GroundStationRig root for the top of the monitor transmitter
  const pcEmitLocalPos = new THREE.Vector3(2.85, 3.85, 0.95);

  // Telemetry & Aviation Obstruction Beacon Mast on SDR Cabinet Corner
  const beaconMast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.5, 8), brushedAluMat);
  beaconMast.position.set(2.1, 3.1, -2.55);
  beaconMast.castShadow = true;
  const beaconBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.4 }),
  );
  beaconBulb.position.set(2.1, 4.38, -2.55);
  root.add(beaconMast, beaconBulb);

  // Compound Perimeter Fence Posts & Top Rail (open front right toward Helipad)
  const fenceXs = [-4.9, -1.8, 1.3, 4.4, 6.5];
  fenceXs.forEach((fx) => {
    const backPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6), darkSteelMat);
    backPost.position.set(fx, 0.52, -4.6);
    backPost.castShadow = true;
    root.add(backPost);
  });
  const backRail = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.04, 0.04), darkSteelMat);
  backRail.position.set(0.8, 0.95, -4.6);
  root.add(backRail);

  return {
    root,
    azimuthGroup,
    elevationGroup,
    dishScaleGroup,
    feedHornMesh,
    feedGlowMat,
    serverLedMesh,
    pcLedMat,
    monitorCanvas,
    monitorTex,
    pcEmitLocalPos,
    hvacFanGroup,
    cablePulses,
    cableCurve,
  };
}

/**
 * Heavy-Duty 6-Arm Industrial Agricultural Hexacopter (Agras T40/T50 class):
 * - Carbon-fiber folding truss arms with anodized CNC locking collars
 * - Finned brushless motor pods, swept dual-blade props + high-RPM rotor blur discs
 * - Twin RTK-GNSS mushroom antennas, forward phased-array obstacle radar dome, twin LED headlights
 * - Hot-swap smart battery bay, 40L translucent spray tank with liquid core & 6-nozzle folding boom
 * - Dual-lens 3-axis multispectral + RGB gimbal & truss-braced landing skids with damper feet
 */
export function buildDroneModel(maxAnisotropy = 4): DroneRig {
  const root = new THREE.Group();
  root.name = 'ProceduralAgroHexacopter';

  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  const carbonTex = createCarbonFiberTextures(maxAnisotropy);
  const carbonMat = new THREE.MeshStandardMaterial({
    map: carbonTex.map,
    bumpMap: carbonTex.bumpMap,
    bumpScale: 0.018,
    color: 0x1e293b,
    metalness: 0.48,
    roughness: 0.34,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f766e,
    metalness: 0.36,
    roughness: 0.18,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
  });
  const cncAccentMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    metalness: 0.65,
    roughness: 0.28,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.88,
    roughness: 0.22,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.78,
    roughness: 0.32,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.25,
    roughness: 0.45,
    transparent: true,
    opacity: 0.92,
  });
  const tipStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.3,
    metalness: 0.2,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.6,
    roughness: 0.15,
  });
  const navBeaconMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.4,
  });

  // 1. Armored Hexagonal Core Deck + Sculpted Industrial Canopy
  const deckGeo = new THREE.CylinderGeometry(0.62, 0.56, 0.12, 6);
  const deck = new THREE.Mesh(deckGeo, carbonMat);
  deck.position.y = 0.56;
  deck.castShadow = true;
  bodyTiltGroup.add(deck);

  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.34, -0.68);
  hullShape.lineTo(0.34, -0.68);
  hullShape.lineTo(0.48, -0.15);
  hullShape.lineTo(0.42, 0.48);
  hullShape.lineTo(0.24, 0.68);
  hullShape.lineTo(-0.24, 0.68);
  hullShape.lineTo(-0.42, 0.48);
  hullShape.lineTo(-0.48, -0.15);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.center();
  const hull = new THREE.Mesh(hullGeo, canopyMat);
  hull.position.y = 0.66;
  hull.castShadow = true;
  bodyTiltGroup.add(hull);

  // Armored Spine Cowling & Smart Battery Bay
  const batteryPack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.62), carbonMat);
  batteryPack.position.set(0, 0.86, 0.10);
  batteryPack.castShadow = true;
  bodyTiltGroup.add(batteryPack);

  const batteryHandle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.12), cncAccentMat);
  batteryHandle.position.set(0, 0.99, 0.10);
  bodyTiltGroup.add(batteryHandle);

  const batteryStatusStrip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.05), navBeaconMat);
  batteryStatusStrip.position.set(0, 0.88, 0.42);
  bodyTiltGroup.add(batteryStatusStrip);

  // 2. Twin RTK-GNSS Mushroom Antennas (Aft Left & Right)
  for (const sx of [-0.22, 0.22]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.34, 8), metalMat);
    mast.position.set(sx, 1.04, -0.34);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), cncAccentMat);
    collar.position.set(sx, 0.89, -0.34);
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.055, 16), canopyMat);
    dome.position.set(sx, 1.22, -0.34);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), metalMat);
    cap.scale.y = 0.35;
    cap.position.set(sx, 1.245, -0.34);
    bodyTiltGroup.add(mast, collar, dome, cap);
  }

  // 3. Forward Phased-Array Obstacle Avoidance Radar Dome + Twin LED Headlights
  const radarMount = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.10, 14), darkMetalMat);
  radarMount.rotation.x = Math.PI / 2;
  radarMount.position.set(0, 0.66, -0.72);
  const radarDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 14, 10),
    new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.25, clearcoat: 1.0 }),
  );
  radarDome.scale.set(1, 0.85, 0.65);
  radarDome.position.set(0, 0.66, -0.78);
  bodyTiltGroup.add(radarMount, radarDome);

  for (const hx of [-0.26, 0.26]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.09, 10), darkMetalMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(hx, 0.63, -0.66);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), headlightMat);
    lens.rotation.y = Math.PI;
    lens.position.set(hx, 0.63, -0.708);
    bodyTiltGroup.add(pod, lens);
  }

  // 4. 6 Folding Carbon-Fiber Truss Arms + CNC Clamps + Finned Motor Pods + Swept Rotors
  const rotors: THREE.Group[] = [];
  const rotorBlurMats: THREE.MeshBasicMaterial[] = [];
  const rotorBlurGeo = new THREE.RingGeometry(0.15, 0.62, 32);
  rotorBlurGeo.rotateX(-Math.PI / 2);

  const armAnglesDeg = [-32, 32, 90, 148, 212, 270];
  const armRadius = 1.38;

  armAnglesDeg.forEach((deg, idx) => {
    const rad = THREE.MathUtils.degToRad(deg);
    const ax = Math.sin(rad) * armRadius;
    const az = -Math.cos(rad) * armRadius;
    const sx = Math.sin(rad) * 0.44;
    const sz = -Math.cos(rad) * 0.44;

    const start = new THREE.Vector3(sx, 0.58, sz);
    const end = new THREE.Vector3(ax, 0.72, az);
    const armCurve = new THREE.LineCurve3(start, end);
    const armMesh = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 4, 0.052, 10, false), carbonMat);
    armMesh.castShadow = true;
    bodyTiltGroup.add(armMesh);

    // Lower diagonal reinforcement strut per arm
    const strutStart = new THREE.Vector3(sx * 0.85, 0.42, sz * 0.85);
    const strutEnd = new THREE.Vector3(ax * 0.72, 0.64, az * 0.72);
    const strutMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(strutStart, strutEnd), 3, 0.022, 6, false),
      darkMetalMat,
    );
    bodyTiltGroup.add(strutMesh);

    // CNC folding hinge clamp near hull root
    const clampPos = start.clone().lerp(end, 0.18);
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.14, 12), cncAccentMat);
    clamp.position.copy(clampPos);
    clamp.lookAt(end);
    clamp.rotateX(Math.PI / 2);
    bodyTiltGroup.add(clamp);

    // Brushless Motor Bell + Cooling Fins + Under-Motor Strobe LED
    const motorHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.138, 0.16, 18), darkMetalMat);
    motorHousing.position.set(ax, 0.77, az);
    motorHousing.castShadow = true;
    const motorCap = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.125, 0.04, 18), metalMat);
    motorCap.position.set(ax, 0.86, az);
    bodyTiltGroup.add(motorHousing, motorCap);

    const isFrontLeft = deg < 0;
    const isFrontRight = deg > 0 && deg < 60;
    const ledColor = isFrontLeft ? 0xef4444 : isFrontRight ? 0x10b981 : 0x38bdf8;
    const ledMat =
      isFrontLeft || isFrontRight
        ? new THREE.MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 1.6 })
        : navBeaconMat;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), ledMat);
    led.position.set(ax, 0.65, az);
    bodyTiltGroup.add(led);

    // Swept Carbon Dual-Blade Rotor + Yellow Safety Tip Stripes + Spinner Cap
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(ax, 0.90, az);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 12), cncAccentMat);
    spinner.position.y = 0.03;
    rotorGroup.add(spinner);

    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.016, 0.095), rotorMat);
      blade.position.set(side * 0.30, 0, side * 0.015);
      blade.rotation.y = side * 0.08;
      blade.rotation.x = side * 0.07;
      rotorGroup.add(blade);

      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.088), tipStripeMat);
      tip.position.set(side * 0.56, 0, side * 0.038);
      tip.rotation.y = side * 0.08;
      rotorGroup.add(tip);
    }

    const blurMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const blurDisc = new THREE.Mesh(rotorBlurGeo, blurMat);
    blurDisc.position.y = 0.008;
    rotorGroup.add(blurDisc);
    rotorBlurMats.push(blurMat);

    bodyTiltGroup.add(rotorGroup);
    rotors.push(rotorGroup);
  });

  // 5. Dual-Lens 3-Axis Multispectral + RGB Gimbal Camera Pod
  const gimbalCamera = new THREE.Group();
  gimbalCamera.position.set(0, 0.34, -0.44);
  const gimbalYoke = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.22), darkMetalMat);
  const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 0.28), carbonMat);
  cameraBody.position.y = -0.12;
  const mainLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.08, 0.09, 18),
    new THREE.MeshPhysicalMaterial({ color: 0x06b6d4, roughness: 0.08, metalness: 0.25, clearcoat: 1.0 }),
  );
  mainLens.rotation.x = Math.PI / 2;
  mainLens.position.set(-0.06, -0.12, -0.16);
  const spectralLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.08, 16),
    new THREE.MeshPhysicalMaterial({ color: 0x10b981, roughness: 0.08, metalness: 0.25, clearcoat: 1.0 }),
  );
  spectralLens.rotation.x = Math.PI / 2;
  spectralLens.position.set(0.08, -0.12, -0.15);
  gimbalCamera.add(gimbalYoke, cameraBody, mainLens, spectralLens);
  bodyTiltGroup.add(gimbalCamera);

  // 6. 40L Translucent Liquid Spray Tank + Visible Fluid Core + 6-Nozzle Folding Boom
  const sprayBoomGroup = new THREE.Group();
  const tankOuterMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.85,
    transparent: true,
    opacity: 0.72,
  });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.42, 20), tankOuterMat);
  tank.position.set(0, 0.32, 0.18);
  const fluidCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.23, 0.28, 18),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.2, metalness: 0.1 }),
  );
  fluidCore.position.set(0, 0.27, 0.18);
  const tankCap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), cncAccentMat);
  tankCap.position.set(0.12, 0.54, 0.28);

  const boomBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.85, 10), carbonMat);
  boomBar.rotation.z = Math.PI / 2;
  boomBar.position.set(0, 0.16, 0.26);
  sprayBoomGroup.add(tank, fluidCore, tankCap, boomBar);

  [-1.32, -0.80, -0.28, 0.28, 0.80, 1.32].forEach((nx) => {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.07), cncAccentMat);
    clamp.position.set(nx, 0.16, 0.26);
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.10, 8), metalMat);
    nozzle.position.set(nx, 0.09, 0.26);
    sprayBoomGroup.add(clamp, nozzle);
  });
  bodyTiltGroup.add(sprayBoomGroup);

  // 7. Braced Dual Carbon Landing Skids with Truss Struts & Rubber Damper Feet
  for (const sx of [-0.56, 0.56]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.48, 10), carbonMat);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx, 0.035, 0);
    skid.castShadow = true;
    bodyTiltGroup.add(skid);

    for (const sz of [-0.66, 0.66]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), rotorMat);
      foot.scale.set(1.2, 0.7, 1.2);
      foot.position.set(sx, 0.035, sz);
      bodyTiltGroup.add(foot);
    }

    for (const sz of [-0.38, 0.38]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 8), carbonMat);
      leg.position.set(sx * 0.84, 0.27, sz);
      leg.rotation.z = sx > 0 ? -0.28 : 0.28;
      leg.castShadow = true;
      bodyTiltGroup.add(leg);
    }

    // Diagonal cross-brace on skid
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.84, 6), darkMetalMat);
    brace.position.set(sx * 0.86, 0.25, 0);
    brace.rotation.x = Math.PI / 3;
    brace.rotation.z = sx > 0 ? -0.24 : 0.24;
    bodyTiltGroup.add(brace);
  }

  // 8. Downward Optical Camera FOV Pyramid
  const fovConeGeo = new THREE.ConeGeometry(0.55, 1.0, 4, 1, true);
  fovConeGeo.translate(0, -0.5, 0);
  fovConeGeo.rotateY(Math.PI / 4);
  const fovConeMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fovConeMesh = new THREE.Mesh(fovConeGeo, fovConeMat);
  fovConeMesh.position.set(0, 0.16, -0.44);
  fovConeMesh.visible = false;
  root.add(fovConeMesh);

  return {
    root,
    bodyTiltGroup,
    rotors,
    rotorBlurMats,
    gimbalCamera,
    sprayBoomGroup,
    fovConeMesh,
    fovConeMat,
    navBeaconMat,
  };
}

/**
 * Agricultural Irrigation Reservoir Pond with embankment, pump house, suction pipe & water normal map
 */
export function buildIrrigationPond(maxAnisotropy = 4): IrrigationPondRig {
  const group = new THREE.Group();
  group.name = 'IrrigationReservoirPond';

  const waterNormalMap = createWaterNormalMap(maxAnisotropy);
  const bermMat = new THREE.MeshStandardMaterial({
    color: 0x5c533c,
    roughness: 0.92,
    metalness: 0.02,
  });
  const fallbackWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c4a6e,
    normalMap: waterNormalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.09,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    reflectivity: 0.92,
  });

  const berm = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.8, 0.42, 32), bermMat);
  berm.position.y = 0.21;
  berm.receiveShadow = true;
  berm.castShadow = true;
  group.add(berm);

  const fallbackWaterMesh = new THREE.Mesh(new THREE.CircleGeometry(4.92, 32), fallbackWaterMat);
  fallbackWaterMesh.rotation.x = -Math.PI / 2;
  fallbackWaterMesh.position.y = 0.44;
  fallbackWaterMesh.receiveShadow = true;
  group.add(fallbackWaterMesh);

  const pumpHouse = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.9, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.48, metalness: 0.55 }),
  );
  pumpHouse.position.set(5.6, 0.45, 0);
  pumpHouse.castShadow = true;
  group.add(pumpHouse);

  const intakePipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.28 }),
  );
  intakePipe.rotation.z = Math.PI / 2;
  intakePipe.position.set(4.5, 0.52, 0);
  intakePipe.castShadow = true;
  group.add(intakePipe);

  return { group, fallbackWaterMesh, fallbackWaterMat, waterNormalMap };
}

/**
 * Agricultural Linear / Pivot Irrigation System on Bölge C (Low NDMI zone)
 */
export function buildIrrigationRig(): IrrigationRig {
  const root = new THREE.Group();
  root.name = 'AgriculturalIrrigationSystem';

  const galvSteelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.82,
    roughness: 0.30,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    metalness: 0.45,
    roughness: 0.35,
  });

  // Main overhead irrigation pipe spanning 18 scene units (180 meters) across Bölge C
  const spanLen = 18;
  const pipeHeight = 1.65;
  const mainPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, spanLen, 12),
    galvSteelMat,
  );
  mainPipe.rotation.z = Math.PI / 2;
  mainPipe.position.set(0, pipeHeight, 0);
  mainPipe.castShadow = true;
  root.add(mainPipe);

  // 3 Wheeled A-Frame Support Towers
  const wheels: THREE.Mesh[] = [];
  const towerXs = [-7.5, 0, 7.5];
  towerXs.forEach((tx) => {
    for (const sz of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 8), galvSteelMat);
      leg.position.set(tx, 0.85, sz * 0.5);
      leg.rotation.x = sz > 0 ? -0.35 : 0.35;
      leg.castShadow = true;
      root.add(leg);

      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 16), tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(tx, 0.32, sz * 0.9);
      wheel.castShadow = true;
      root.add(wheel);
      wheels.push(wheel);
    }
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.4), galvSteelMat);
    crossbar.position.set(tx, 0.34, 0);
    root.add(crossbar);
  });

  // Sprinkler Drop Tubes & Nozzles
  const nozzlePositions: THREE.Vector3[] = [];
  for (let nx = -8; nx <= 8; nx += 2) {
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), nozzleMat);
    drop.position.set(nx, pipeHeight - 0.28, 0);
    root.add(drop);
    nozzlePositions.push(new THREE.Vector3(nx, pipeHeight - 0.55, 0));
  }

  return { root, wheels, nozzlePositions };
}

/**
 * 3D Volumetric Cloud Cluster for Bölge D cloud-mask visualization
 */
export function buildCloudCluster(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'FieldCloudCluster';

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.95,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });

  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 3.6],
    [-3.1, -0.4, 1.1, 2.7],
    [3.2, -0.3, -0.8, 2.9],
    [-1.4, 0.7, -2.0, 2.6],
    [1.8, 0.5, 1.9, 2.4],
    [4.8, -0.8, 0.6, 2.0],
    [-4.6, -0.7, -0.7, 2.1],
  ];

  puffs.forEach(([x, y, z, r]) => {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), cloudMat);
    puff.position.set(x, y, z);
    puff.scale.set(1.25, 0.62, 1.1);
    group.add(puff);
  });

  return group;
}

/**
 * Solar-powered Field IoT Soil Moisture & Micro-Weather Telemetry Mast
 */
export function buildSoilSensorNode(statusColorHex = 0x10b981): {
  root: THREE.Group;
  statusLedMat: THREE.MeshStandardMaterial;
} {
  const root = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.3 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.3, roughness: 0.5 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x0f2744, metalness: 0.6, roughness: 0.2 });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 8), poleMat);
  mast.position.y = 0.75;
  mast.castShadow = true;
  root.add(mast);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.18), boxMat);
  housing.position.set(0, 0.9, 0.08);
  housing.castShadow = true;
  root.add(housing);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.28), solarMat);
  panel.position.set(0, 1.48, 0.04);
  panel.rotation.x = 0.45;
  root.add(panel);

  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 10), poleMat);
  shield.position.set(0.18, 1.25, 0);
  root.add(shield);

  const statusLedMat = new THREE.MeshStandardMaterial({
    color: statusColorHex,
    emissive: statusColorHex,
    emissiveIntensity: 1.4,
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), statusLedMat);
  led.position.set(0, 1.08, 0.18);
  root.add(led);

  return { root, statusLedMat };
}

/**
 * Multi-blade botanical wheat/maize crop tuft BufferGeometry with baked root-to-tip vertex AO.
 * Keeps triangle count compact (~36 tris per clump) for high-density InstancedMesh rendering.
 */
export function createCropClumpGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const bladeCount = 5;
  for (let b = 0; b < bladeCount; b++) {
    const az = (b / bladeCount) * Math.PI * 2 + (b % 2) * 0.25;
    const cosA = Math.cos(az);
    const sinA = Math.sin(az);
    const perpX = -sinA;
    const perpZ = cosA;

    const height = 0.42 + (b % 3) * 0.09;
    const arch = 0.16 + (b % 2) * 0.08;
    const baseHalfW = 0.048;
    const midHalfW = 0.032;

    const baseIdx = positions.length / 3;

    // 0,1: root left/right (shaded AO 0.46)
    positions.push(perpX * -baseHalfW, 0, perpZ * -baseHalfW);
    colors.push(0.46, 0.48, 0.42);
    positions.push(perpX * baseHalfW, 0, perpZ * baseHalfW);
    colors.push(0.46, 0.48, 0.42);

    // 2,3: mid arched blade left/right (AO 0.78)
    const mx = cosA * arch * 0.45;
    const mz = sinA * arch * 0.45;
    positions.push(mx + perpX * -midHalfW, height * 0.56, mz + perpZ * -midHalfW);
    colors.push(0.78, 0.84, 0.72);
    positions.push(mx + perpX * midHalfW, height * 0.56, mz + perpZ * midHalfW);
    colors.push(0.78, 0.84, 0.72);

    // 4: sunlit blade tip (bright AO 1.0)
    positions.push(cosA * arch, height, sinA * arch);
    colors.push(1.0, 1.0, 0.92);

    indices.push(
      baseIdx, baseIdx + 1, baseIdx + 2,
      baseIdx + 1, baseIdx + 3, baseIdx + 2,
      baseIdx + 2, baseIdx + 3, baseIdx + 4,
    );
  }

  // Central wheat spike / stalk tip
  const stalkBase = positions.length / 3;
  positions.push(-0.024, 0, -0.024, 0.024, 0, 0.024, 0, 0.58, 0);
  colors.push(0.50, 0.52, 0.44, 0.50, 0.52, 0.44, 1.0, 0.96, 0.74);
  indices.push(stalkBase, stalkBase + 1, stalkBase + 2);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Organic irregular tree crown geometry with baked bottom-to-top ambient occlusion
 */
export function createTreeCanopyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1.45, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const disp = 1.0 + Math.sin(x * 2.4 + y * 1.9) * 0.16 + Math.cos(z * 2.7 - y * 1.5) * 0.12;
    const ny = y * 1.15 * disp + 3.15;
    pos.setXYZ(i, x * disp, ny, z * disp);

    // Darker underside, sunlit upper crown
    const shade = Math.max(0.45, Math.min(1.05, 0.72 + (y / 1.45) * 0.32));
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade * 0.94;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

