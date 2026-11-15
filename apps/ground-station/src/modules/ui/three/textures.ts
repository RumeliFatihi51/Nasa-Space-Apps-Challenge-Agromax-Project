import * as THREE from 'three';
import { DroneMissionPlan, SpectralAnalysisResult, SpectralIndexType } from '../../shared/types';

export function createEarthProceduralTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#0f2842');
  oceanGrad.addColorStop(0.5, '#091f38');
  oceanGrad.addColorStop(1, '#102b47');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.10)';
  ctx.lineWidth = 1;
  for (let lon = 0; lon <= 360; lon += 15) {
    const x = (lon / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const pt = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];

  const drawLandmass = (coords: [number, number][], fill: string, stroke = '#4d735c') => {
    ctx.beginPath();
    coords.forEach(([lon, lat], i) => {
      const [x, y] = pt(lon, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  drawLandmass(
    [
      [-168, 65], [-140, 70], [-95, 72], [-60, 62], [-55, 48], [-70, 42], [-80, 26],
      [-90, 21], [-98, 19], [-84, 10], [-78, 9], [-92, 14], [-105, 20], [-115, 32],
      [-125, 42], [-135, 57], [-162, 58],
    ],
    '#2c4a38',
  );

  drawLandmass(
    [
      [-78, 9], [-68, 11], [-50, 2], [-35, -6], [-40, -21], [-52, -33],
      [-64, -42], [-68, -55], [-74, -52], [-72, -35], [-70, -18], [-81, -5],
    ],
    '#30523c',
  );

  drawLandmass(
    [
      [-10, 36], [-9, 43], [-2, 44], [2, 51], [10, 56], [5, 61], [18, 70], [45, 69],
      [70, 72], [110, 75], [150, 70], [178, 66], [160, 55], [142, 46], [130, 40],
      [122, 30], [110, 20], [100, 14], [96, 18], [88, 22], [78, 8], [68, 23],
      [56, 26], [48, 30], [36, 36], [26, 36], [26, 41], [22, 38], [14, 41], [10, 44], [2, 42],
    ],
    '#324e3d',
  );

  // Anatolia highlight
  drawLandmass(
    [
      [26, 41], [35, 42], [44, 41], [44, 37], [36, 36], [27, 37],
    ],
    '#3e664f',
    '#6ee7b7',
  );

  drawLandmass(
    [
      [-17, 15], [-13, 28], [-6, 36], [10, 37], [25, 32], [33, 31], [43, 12],
      [51, 12], [41, -2], [40, -15], [33, -26], [20, -35], [15, -26], [12, -12],
      [9, 4], [2, 6], [-8, 5], [-15, 11],
    ],
    '#475435',
  );

  drawLandmass(
    [
      [114, -22], [130, -12], [142, -11], [153, -26], [150, -37], [138, -36],
      [128, -32], [115, -34],
    ],
    '#4e5235',
  );

  drawLandmass(
    [
      [-52, 60], [-42, 60], [-20, 72], [-25, 82], [-58, 81], [-70, 76],
    ],
    '#64748b',
  );

  for (let i = 0; i < 42; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const rw = 35 + Math.random() * 85;
    const rh = 8 + Math.random() * 18;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rw);
    g.addColorStop(0, 'rgba(241, 245, 249, 0.22)');
    g.addColorStop(1, 'rgba(241, 245, 249, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, (Math.random() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const rCanvas = document.createElement('canvas');
  rCanvas.width = 512;
  rCanvas.height = 256;
  const rCtx = rCanvas.getContext('2d')!;
  rCtx.fillStyle = '#4a4a4a';
  rCtx.fillRect(0, 0, 512, 256);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.needsUpdate = true;

  return { map, roughnessMap };
}

export function createSoftContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.68)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createMistSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.45, 'rgba(232, 248, 255, 0.50)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createBrushedMetalBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 2;
  for (let r = 48; r < size / 2; r += 56) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(size / 2 + Math.cos(ang) * size, size / 2 + Math.sin(ang) * size);
    ctx.stroke();
  }

  for (let i = 0; i < 3600; i++) {
    const v = 112 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 7, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCarbonFiberTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 128;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cCtx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d')!;

  const step = 8;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const diag = ((x + y) / step) % 2 === 0;
      cCtx.fillStyle = diag ? '#1a222e' : '#0f141c';
      cCtx.fillRect(x, y, step, step);
      cCtx.fillStyle = diag ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.28)';
      cCtx.fillRect(x + 1, y + 1, step - 2, 2);

      bCtx.fillStyle = diag ? '#b4b4b4' : '#585858';
      bCtx.fillRect(x, y, step, step);
    }
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 6);
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

export function createCorrugatedSteelMaps(
  maxAnisotropy: number,
  baseHex = '#9ba3ad',
): {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const heightField = new Float32Array(size * size);
  const ribs = 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2 * ribs;
      const ribVal = Math.sin(u);
      heightField[y * size + x] = ribVal * 0.65;
      const shade = Math.round(ribVal * 18);
      if (shade >= 0) {
        ctx.fillStyle = `rgba(255,255,255,${(shade / 255).toFixed(2)})`;
      } else {
        ctx.fillStyle = `rgba(0,0,0,${(-shade / 255).toFixed(2)})`;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Subtle horizontal sheet seams
  ctx.strokeStyle = 'rgba(20, 26, 35, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size, size * 0.5);
  ctx.stroke();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 1);
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const normalMap = buildNormalTextureFromHeight(heightField, size, 3.2, 2, 1, maxAnisotropy);
  return { map, normalMap };
}

export function createSolarCellTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#0a1e3b');
  bg.addColorStop(0.5, '#0f2b54');
  bg.addColorStop(1, '#08172e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Silicon wafer cells & silver busbars
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
  }
  for (let j = 0; j <= 4; j++) {
    const p = (j / 4) * size;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
  ctx.lineWidth = 1;
  for (let x = 8; x < size; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x + 8, 0);
    ctx.lineTo(x + 8, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createAsphaltRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#343941';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 14000; i++) {
    const x = hash2(i, 3.3) * w;
    const y = hash2(8.1, i) * h;
    const v = 38 + Math.floor(hash2(i, i * 0.5) * 32);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Gravel/shoulder transition edges
  const leftEdge = ctx.createLinearGradient(0, 0, 22, 0);
  leftEdge.addColorStop(0, '#72654c');
  leftEdge.addColorStop(1, 'rgba(52,57,65,0)');
  ctx.fillStyle = leftEdge;
  ctx.fillRect(0, 0, 22, h);

  const rightEdge = ctx.createLinearGradient(w - 22, 0, w, 0);
  rightEdge.addColorStop(0, 'rgba(52,57,65,0)');
  rightEdge.addColorStop(1, '#72654c');
  ctx.fillStyle = rightEdge;
  ctx.fillRect(w - 22, 0, 22, h);

  // White side stripes + dashed center line
  ctx.fillStyle = 'rgba(226, 232, 240, 0.58)';
  ctx.fillRect(24, 0, 4, h);
  ctx.fillRect(w - 28, 0, 4, h);

  ctx.fillStyle = 'rgba(245, 196, 81, 0.72)';
  for (let y = 16; y < h; y += 64) {
    ctx.fillRect(w / 2 - 2.5, y, 5, 34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 14);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createWaterNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const heightField = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const wave1 = Math.sin(u * 4 + v * 3) * 0.35 + Math.cos(u * 6 - v * 5) * 0.25;
      const wave2 = Math.sin(u * 11 + v * 9) * 0.14 + Math.cos(u * 15 - v * 13) * 0.10;
      const micro = fbm(x * 0.18, y * 0.18) * 0.22;
      heightField[y * size + x] = wave1 + wave2 + micro;
    }
  }
  return buildNormalTextureFromHeight(heightField, size, 2.2, 4, 4, maxAnisotropy);
}

export function createBarkTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const px = img.data;
  const hf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const furrow = Math.sin((x / size) * Math.PI * 2 * 14 + fbm(x * 0.09, y * 0.03) * 4.5);
      const grain = fbm(x * 0.25, y * 0.08);
      const h = furrow * 0.5 + grain * 0.5;
      hf[idx] = h;
      const shade = 0.72 + h * 0.38;
      px[idx * 4] = Math.max(20, Math.min(180, Math.round(78 * shade)));
      px[idx * 4 + 1] = Math.max(15, Math.min(150, Math.round(58 * shade)));
      px[idx * 4 + 2] = Math.max(12, Math.min(130, Math.round(42 * shade)));
      px[idx * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 3);
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const normalMap = buildNormalTextureFromHeight(hf, size, 3.6, 2, 3, maxAnisotropy);
  return { map, normalMap };
}

export function createFoliageTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3d6131';
  ctx.fillRect(0, 0, size, size);

  // Overlapping organic botanical leaves for rich micro-silhouette and depth
  for (let i = 0; i < 640; i++) {
    const lx = hash2(i, 1.3) * size;
    const ly = hash2(4.7, i) * size;
    const ang = hash2(i, i * 0.31) * Math.PI * 2;
    const rx = 5 + hash2(i * 1.9, 2.2) * 8;
    const ry = 2.5 + hash2(3.1, i * 1.7) * 4.5;
    const tone = hash2(i * 0.7, 9.1);
    if (tone < 0.30) ctx.fillStyle = 'rgba(26, 48, 22, 0.86)';
    else if (tone < 0.72) ctx.fillStyle = 'rgba(72, 114, 52, 0.85)';
    else ctx.fillStyle = 'rgba(116, 158, 70, 0.82)';

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function drawWorldCalloutCanvas(
  canvas: HTMLCanvasElement,
  title: string,
  subtitle: string,
  accentColor: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Rounded high-contrast telemetry pill card
  const r = 14;
  ctx.fillStyle = 'rgba(7, 12, 22, 0.92)';
  ctx.beginPath();
  ctx.moveTo(r, 2);
  ctx.lineTo(w - r, 2);
  ctx.quadraticCurveTo(w - 2, 2, w - 2, r);
  ctx.lineTo(w - 2, h - r - 10);
  ctx.quadraticCurveTo(w - 2, h - 10, w - r, h - 10);
  ctx.lineTo(w / 2 + 8, h - 10);
  ctx.lineTo(w / 2, h - 1);
  ctx.lineTo(w / 2 - 8, h - 10);
  ctx.lineTo(r, h - 10);
  ctx.quadraticCurveTo(2, h - 10, 2, h - r - 10);
  ctx.lineTo(2, r);
  ctx.quadraticCurveTo(2, 2, r, 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Accent status bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(14, 14, 6, h - 38);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 30, 12);

  ctx.fillStyle = accentColor;
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.fillText(subtitle, 30, 42);
}

export function createConcretePadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5c636c';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 74 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = 'rgba(28, 34, 42, 0.78)';
  ctx.lineWidth = 4;
  for (let g = 128; g < size; g += 256) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, size);
    ctx.moveTo(0, g);
    ctx.lineTo(size, g);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.78)';
  ctx.setLineDash([22, 14]);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(size / 2 - 120, size / 2, 210, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

// Fast deterministic 2D hash & smooth value noise for soil/foliage synthesis
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  return (
    smoothNoise(x, y) * 0.55 +
    smoothNoise(x * 2.13 + 7.1, y * 2.13 + 3.4) * 0.30 +
    smoothNoise(x * 4.47 + 19.3, y * 4.47 + 11.7) * 0.15
  );
}

function buildNormalTextureFromHeight(
  heightField: Float32Array,
  size: number,
  strength: number,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heightField[y * size + xp] - heightField[y * size + xm]) * strength;
      const dy = (heightField[yp * size + x] - heightField[ym * size + x]) * strength;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx * invLen;
      const ny = -dy * invLen;
      const nz = invLen;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Natural Central Anatolian Plateau & Farmland Landscape Texture (zero repetitive square grid look)
 */
export function createSurroundTerrainTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
} {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const px = imgData.data;

  // Pixel-synthesized organic Anatolian valley soil, dry grass steppe, and distant plowed sub-fields
  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const macro = fbm(nx * 5.5 + 1.2, ny * 5.5 + 2.8);
      const detail = fbm(nx * 24.0 + 9.4, ny * 24.0 + 4.1);
      const fine = hash2(x * 0.7, y * 0.7);

      // Large organic field-tone patches (sage steppe, olive wheat, warm fallow clay, limestone ridge)
      const patchSelector = fbm(nx * 3.1 + 4.7, ny * 3.1 + 8.3);
      const furrowWave = Math.sin((nx * 140 + macro * 2.5) * Math.PI) * 0.5 + 0.5;

      let r = 84;
      let g = 92;
      let b = 58;

      if (patchSelector < 0.36) {
        // Warm golden fallow Anatolian soil
        r = 122 + macro * 28 + furrowWave * 10;
        g = 104 + macro * 22 + furrowWave * 8;
        b = 70 + macro * 14;
      } else if (patchSelector < 0.64) {
        // Dry olive steppe grass
        r = 92 + macro * 22;
        g = 102 + macro * 24;
        b = 62 + macro * 14;
      } else {
        // Deep verdant neighboring winter wheat
        r = 66 + macro * 20 + furrowWave * 6;
        g = 94 + macro * 26 + furrowWave * 10;
        b = 50 + macro * 14;
      }

      // Micro soil & pebble grain
      const microMod = (detail - 0.5) * 26 + (fine - 0.5) * 14;
      const idx = (y * size + x) * 4;
      px[idx] = Math.max(15, Math.min(235, Math.round(r + microMod)));
      px[idx + 1] = Math.max(15, Math.min(235, Math.round(g + microMod)));
      px[idx + 2] = Math.max(15, Math.min(235, Math.round(b + microMod * 0.85)));
      px[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Subtle dirt tracks & organic dry-stream gullies
  ctx.strokeStyle = 'rgba(128, 110, 78, 0.34)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 280);
  ctx.bezierCurveTo(320, 260, 680, 340, size, 300);
  ctx.moveTo(220, 0);
  ctx.bezierCurveTo(250, 360, 190, 680, 240, size);
  ctx.stroke();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const nSize = 512;
  const heightField = new Float32Array(nSize * nSize);
  const roughData = new Uint8Array(nSize * nSize * 4);
  for (let y = 0; y < nSize; y++) {
    for (let x = 0; x < nSize; x++) {
      const idx = y * nSize + x;
      const clod = fbm(x * 0.08, y * 0.08);
      const micro = fbm(x * 0.32 + 13.2, y * 0.32 + 5.7);
      heightField[idx] = clod * 0.65 + micro * 0.35;

      const roughVal = Math.max(170, Math.min(250, Math.round(205 + (clod - 0.5) * 60)));
      roughData[idx * 4] = roughVal;
      roughData[idx * 4 + 1] = roughVal;
      roughData[idx * 4 + 2] = roughVal;
      roughData[idx * 4 + 3] = 255;
    }
  }

  const normalMap = buildNormalTextureFromHeight(heightField, nSize, 3.8, 12, 12, maxAnisotropy);
  const roughnessMap = new THREE.DataTexture(roughData, nSize, nSize, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(12, 12);
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.needsUpdate = true;

  return { map, normalMap, roughnessMap };
}

/**
 * High-detail tangent-space normal & roughness maps for Parcel 104:
 * Simulates plowed 75cm planting ridges, soil clods, tractor wheel tramlines, and leaf-vs-soil specular contrast.
 */
export function createParcelSoilAndCropMaps(maxAnisotropy: number): {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
} {
  const size = 512;
  const heightField = new Float32Array(size * size);
  const roughData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;

      const ridgePhase = Math.sin(u * Math.PI * 2 * 64);
      const soilGrain = fbm(x * 0.22, y * 0.22);
      const leafCluster = fbm(x * 0.09 + 4.2, y * 0.14 + 9.1);
      const tramMask = Math.abs(((u * 64) % 16) - 8) < 0.45 ? -0.35 : 0;

      heightField[idx] = ridgePhase * 0.42 + soilGrain * 0.35 + leafCluster * 0.25 + tramMask;

      const isCanopy = ridgePhase > -0.15 && tramMask === 0;
      const roughFloat = isCanopy
        ? 0.54 + (1 - leafCluster) * 0.18
        : 0.86 + soilGrain * 0.11;
      const rByte = Math.max(120, Math.min(250, Math.round(roughFloat * 255)));
      roughData[idx * 4] = rByte;
      roughData[idx * 4 + 1] = rByte;
      roughData[idx * 4 + 2] = rByte;
      roughData[idx * 4 + 3] = 255;
    }
  }

  const normalMap = buildNormalTextureFromHeight(heightField, size, 4.4, 2, 2, maxAnisotropy);
  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

export function ndviColor(val: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (val - 0.05) / 0.78));
  if (t < 0.25) {
    const k = t / 0.25;
    return [Math.round(185 + k * 45), Math.round(45 + k * 95), 40];
  } else if (t < 0.5) {
    const k = (t - 0.25) / 0.25;
    return [Math.round(230 - k * 60), Math.round(140 + k * 65), Math.round(40 + k * 25)];
  } else if (t < 0.75) {
    const k = (t - 0.5) / 0.25;
    return [Math.round(170 - k * 120), Math.round(205 - k * 15), Math.round(65 + k * 25)];
  } else {
    const k = (t - 0.75) / 0.25;
    return [Math.round(50 - k * 34), Math.round(190 - k * 45), Math.round(90 - k * 20)];
  }
}

export function ndmiColor(val: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (val + 0.15) / 0.65));
  if (t < 0.45) {
    const k = t / 0.45;
    return [Math.round(205 - k * 65), Math.round(110 + k * 75), Math.round(45 + k * 75)];
  }
  const k = (t - 0.45) / 0.55;
  return [Math.round(140 - k * 115), Math.round(185 - k * 35), Math.round(120 + k * 115)];
}

export function buildFieldOverlayCanvasTexture(
  analysis: SpectralAnalysisResult | null,
  indexType: SpectralIndexType,
  maxAnisotropy: number,
  irrigationActive = false,
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (!analysis) {
    const baseGrad = ctx.createLinearGradient(0, 0, size, size);
    baseGrad.addColorStop(0, '#365c29');
    baseGrad.addColorStop(0.5, '#426b30');
    baseGrad.addColorStop(1, '#335325');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 42; i++) {
      const cx = hash2(i, 4.1) * size;
      const cy = hash2(9.3, i) * size;
      const rad = 45 + hash2(i * 2, 1.7) * 90;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
      g.addColorStop(0, i % 2 === 0 ? 'rgba(30, 56, 20, 0.26)' : 'rgba(96, 134, 52, 0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }

    const dryPatch = ctx.createRadialGradient(size * 0.28, size * 0.72, 14, size * 0.28, size * 0.72, 145);
    if (irrigationActive) {
      dryPatch.addColorStop(0, 'rgba(34, 48, 32, 0.68)');
      dryPatch.addColorStop(1, 'rgba(34, 48, 32, 0.0)');
    } else {
      dryPatch.addColorStop(0, 'rgba(138, 114, 62, 0.64)');
      dryPatch.addColorStop(1, 'rgba(138, 114, 62, 0.0)');
    }
    ctx.fillStyle = dryPatch;
    ctx.fillRect(0, 0, size, size);

    const stressPatch = ctx.createRadialGradient(size * 0.72, size * 0.30, 12, size * 0.72, size * 0.30, 130);
    stressPatch.addColorStop(0, 'rgba(134, 116, 56, 0.60)');
    stressPatch.addColorStop(1, 'rgba(134, 116, 56, 0.0)');
    ctx.fillStyle = stressPatch;
    ctx.fillRect(0, 0, size, size);

    for (let x = 0; x < size; x += 16) {
      ctx.fillStyle = 'rgba(42, 34, 22, 0.48)';
      ctx.fillRect(x, 0, 5, size);
      ctx.fillStyle = 'rgba(122, 168, 72, 0.24)';
      ctx.fillRect(x + 7, 0, 5, size);
    }

    ctx.fillStyle = 'rgba(84, 70, 48, 0.55)';
    for (let x = 128; x < size; x += 256) {
      ctx.fillRect(x, 0, 6, size);
      ctx.fillRect(x + 18, 0, 6, size);
    }

    for (let i = 0; i < 22000; i++) {
      const px = hash2(i, 7.7) * size;
      const py = hash2(3.1, i) * size;
      ctx.fillStyle = (i & 1) === 0 ? 'rgba(16, 28, 12, 0.20)' : 'rgba(162, 198, 98, 0.14)';
      ctx.fillRect(px, py, 2, 3);
    }

    ctx.strokeStyle = '#736145';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, size - 14, size - 14);
  } else {
    const gw = analysis.gridWidth;
    const gh = analysis.gridHeight;
    const cellW = size / gw;
    const cellH = size / gh;

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = y * gw + x;
        if (analysis.cloudMask[idx] === 1) {
          ctx.fillStyle = '#e2e8f0';
        } else if (indexType === 'RGB') {
          const r = Math.min(255, Math.round(analysis.red[idx] * 950));
          const g = Math.min(255, Math.round(analysis.green[idx] * 950));
          const b = Math.min(255, Math.round(analysis.blue[idx] * 950));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else if (indexType === 'FALSE_COLOR') {
          const r = Math.min(255, Math.round(analysis.nir[idx] * 480));
          const g = Math.min(255, Math.round(analysis.red[idx] * 900));
          const b = Math.min(255, Math.round(analysis.green[idx] * 800));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else if (indexType === 'NDMI' || indexType === 'NDWI') {
          const val = indexType === 'NDMI' ? analysis.ndmi[idx] : analysis.ndwi[idx];
          const [r, g, b] = ndmiColor(val);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          const val =
            indexType === 'NDRE'
              ? analysis.ndre[idx] * 1.35
              : indexType === 'CHANGE_DETECTION'
                ? analysis.changeDeltaNdvi[idx] + 0.55
                : analysis.ndvi[idx];
          const [r, g, b] = ndviColor(val);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    for (let x = 0; x < size; x += 16) {
      ctx.fillStyle = 'rgba(12, 16, 10, 0.14)';
      ctx.fillRect(x, 0, 4, size);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(x + 7, 0, 4, size);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders the live AgroMax GIS Workstation Display onto the large Ground Station PC Monitor:
 * - Left pane: Parcel NDVI/NDMI map + priority zone circles + planned Drone flight waypoints
 * - Right pane: Satellite ingest -> Map export -> Drone upload pipeline readout
 */
export function drawPcMonitorCanvas(
  canvas: HTMLCanvasElement,
  analysis: SpectralAnalysisResult | null,
  indexType: SpectralIndexType,
  plan: DroneMissionPlan | null,
  rfCompletionPct: number,
  localServerConnected: boolean,
  isExportingToDrone: boolean,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Crisp dark workstation UI background
  ctx.fillStyle = '#07111d';
  ctx.fillRect(0, 0, w, h);

  // Header bar
  ctx.fillStyle = '#0f1e33';
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = localServerConnected ? '#10b981' : '#ef4444';
  ctx.fillRect(0, 52, w, 3);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('AGROMAX GIS İSTASYONU · HARİTA & İHA KOMUTA PC', 20, 27);

  ctx.fillStyle = isExportingToDrone ? '#34d399' : '#38bdf8';
  ctx.font = '700 16px "IBM Plex Mono", monospace';
  const statusTag = !localServerConnected
    ? 'SUNUCU ÇEVRİMDIŞI'
    : isExportingToDrone
      ? 'HARİTA -> DRONE AKTARIMI AKTİF'
      : analysis
        ? 'HARİTA HAZIR'
        : 'UYDU VERİSİ BEKLENİYOR';
  ctx.fillText(statusTag, w - 340, 27);

  // Left GIS Map Frame
  const mapX = 20;
  const mapY = 72;
  const mapW = 540;
  const mapH = h - 94;

  ctx.fillStyle = '#0b1829';
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  // Render Parcel Map Grid (NDVI / RGB / Pre-pass green field)
  const pad = 12;
  const gx = mapX + pad;
  const gy = mapY + pad;
  const gwPx = mapW - pad * 2;
  const ghPx = mapH - pad * 2;

  if (analysis) {
    const gw = analysis.gridWidth;
    const gh = analysis.gridHeight;
    const cw = gwPx / gw;
    const ch = ghPx / gh;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = y * gw + x;
        if (analysis.cloudMask[idx] === 1) {
          ctx.fillStyle = '#cbd5e1';
        } else if (indexType === 'NDMI' || indexType === 'NDWI') {
          const [r, g, b] = ndmiColor(indexType === 'NDMI' ? analysis.ndmi[idx] : analysis.ndwi[idx]);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          const [r, g, b] = ndviColor(analysis.ndvi[idx]);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }
        ctx.fillRect(gx + x * cw, gy + y * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
  } else {
    const grad = ctx.createLinearGradient(gx, gy, gx + gwPx, gy + ghPx);
    grad.addColorStop(0, '#2c5322');
    grad.addColorStop(0.5, '#3b6a2c');
    grad.addColorStop(1, '#2a4a20');
    ctx.fillStyle = grad;
    ctx.fillRect(gx, gy, gwPx, ghPx);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + (gwPx * i) / 6, gy);
      ctx.lineTo(gx + (gwPx * i) / 6, gy + ghPx);
      ctx.moveTo(gx, gy + (ghPx * i) / 6);
      ctx.lineTo(gx + gwPx, gy + (ghPx * i) / 6);
      ctx.stroke();
    }
  }

  // Overlay Priority Zones on Monitor Map
  if (analysis) {
    analysis.priorityZones.forEach((z) => {
      const zx = gx + z.centerNormalized[0] * gwPx;
      const zy = gy + z.centerNormalized[1] * ghPx;
      ctx.strokeStyle =
        z.category === 'LOW_NDVI' ? '#f59e0b' : z.category === 'LOW_NDMI' ? '#06b6d4' : '#e2e8f0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(zx, zy, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px "IBM Plex Mono", monospace';
      ctx.fillText(z.code, zx - 24, zy - 32);
    });
  }

  // Overlay Planned Drone Waypoints directly on PC Screen
  if (plan && plan.waypoints.length > 1) {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    plan.waypoints.forEach((wp, i) => {
      const px = gx + Math.max(0.02, Math.min(0.98, (wp.localX + 584) / 1168)) * gwPx;
      const py = gy + Math.max(0.02, Math.min(0.98, (wp.localZ + 478) / 956)) * ghPx;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    plan.waypoints.forEach((wp) => {
      const px = gx + Math.max(0.02, Math.min(0.98, (wp.localX + 584) / 1168)) * gwPx;
      const py = gy + Math.max(0.02, Math.min(0.98, (wp.localZ + 478) / 956)) * ghPx;
      ctx.fillStyle = wp.visited ? '#10b981' : '#f8fafc';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Right Telemetry & Map-Export Pipeline Panel
  const rx = 582;
  const rw = w - rx - 20;
  ctx.fillStyle = '#0d1b2e';
  ctx.fillRect(rx, mapY, rw, mapH);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, mapY, rw, mapH);

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 15px "IBM Plex Mono", monospace';
  ctx.fillText('1. UYDU HAM VERİ ALIMI', rx + 18, mapY + 18);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px "IBM Plex Mono", monospace';
  ctx.fillText(`%${rfCompletionPct.toFixed(0)} TAMAMLANDI`, rx + 18, mapY + 42);

  // Progress Bar 1
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(rx + 18, mapY + 74, rw - 36, 12);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(rx + 18, mapY + 74, ((rw - 36) * Math.min(100, rfCompletionPct)) / 100, 12);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 15px "IBM Plex Mono", monospace';
  ctx.fillText('2. HARİTA & REÇETE ÇIKTISI', rx + 18, mapY + 106);
  ctx.fillStyle = analysis ? '#34d399' : '#fbbf24';
  ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    analysis ? `${indexType} · NDVI Ort ${analysis.meanNdvi.toFixed(2)}` : 'Analiz Bekleniyor',
    rx + 18,
    mapY + 132,
  );
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 15px "IBM Plex Mono", monospace';
  ctx.fillText(
    analysis ? `Parsel: 111.7 ha · ${analysis.priorityZones.length} Zon` : 'Polatlı Parsel 104 (1168×956 m)',
    rx + 18,
    mapY + 162,
  );

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 15px "IBM Plex Mono", monospace';
  ctx.fillText('3. İHA ROTA AKTARIMI', rx + 18, mapY + 206);
  ctx.fillStyle = plan ? '#22d3ee' : '#64748b';
  ctx.font = '700 20px "IBM Plex Mono", monospace';
  ctx.fillText(
    plan ? `${plan.waypoints.length} NOKTA · ${plan.totalDistanceM} m` : 'Rota Oluşturulmadı',
    rx + 18,
    mapY + 232,
  );

  // Active transfer highlight card
  ctx.fillStyle = isExportingToDrone ? 'rgba(16, 185, 129, 0.22)' : 'rgba(14, 165, 233, 0.14)';
  ctx.fillRect(rx + 18, mapY + 282, rw - 36, 98);
  ctx.strokeStyle = isExportingToDrone ? '#10b981' : '#0284c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(rx + 18, mapY + 282, rw - 36, 98);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    isExportingToDrone ? '>>> HARİTA VERİSİ AKTARILIYOR' : 'RTK-GCS TELEMETRİ BAĞLANTISI',
    rx + 32,
    mapY + 300,
  );
  ctx.fillStyle = isExportingToDrone ? '#6ee7b7' : '#7dd3fc';
  ctx.font = '600 15px "IBM Plex Mono", monospace';
  ctx.fillText(
    plan ? `HEDEF: AGROMAX İHA · ${plan.altitudeM} m` : 'GÖREV PLANLAMA BEKLEMEDE',
    rx + 32,
    mapY + 336,
  );
}
