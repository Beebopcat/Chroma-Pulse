import { SkinTheme } from './types';

export const BUILTIN_SKINS: SkinTheme[] = [
  {
    id: 'shinjuku-pulse',
    index: 1,
    name: '01. Shinjuku Pulse',
    subtitle: 'Deep House · Electric Cyan & Coral',
    bpm: 116,
    bgCanvas: '#070A12',
    gridSurface: '#0D1322',
    gridLine: 'rgba(148, 163, 184, 0.12)',
    color1Fill: '#00F0FF',
    color1Inner: '#B8FCFF',
    color1Border: '#00A8CC',
    color1Name: 'Cyan',
    color2Fill: '#FF2E63',
    color2Inner: '#FF9EBB',
    color2Border: '#C81D4E',
    color2Name: 'Coral',
    timelineAccent: '#FFE600',
    rootMidi: 58, // A#3
    scaleIntervals: [0, 3, 5, 7, 10, 12, 15, 17], // Minor pentatonic
    bassPattern: [0, 0, 12, 0, 3, 3, 5, 7],
    arpPattern: [0, 3, 7, 10, 12, 10, 7, 3],
  },
  {
    id: 'solar-kinetic',
    index: 2,
    name: '02. Solar Kinetic',
    subtitle: 'Electro Groove · Amber Gold & Cobalt',
    bpm: 124,
    bgCanvas: '#0B0C10',
    gridSurface: '#141720',
    gridLine: 'rgba(245, 158, 11, 0.13)',
    color1Fill: '#FFB800',
    color1Inner: '#FFF0B3',
    color1Border: '#D97706',
    color1Name: 'Amber',
    color2Fill: '#3B82F6',
    color2Inner: '#BFDBFE',
    color2Border: '#1D4ED8',
    color2Name: 'Cobalt',
    timelineAccent: '#FFFFFF',
    rootMidi: 60, // C4
    scaleIntervals: [0, 2, 3, 7, 9, 12, 14, 15], // Dorian
    bassPattern: [0, 12, 0, 7, 3, 15, 2, 7],
    arpPattern: [0, 7, 9, 12, 14, 12, 9, 7],
  },
  {
    id: 'acid-shibuya',
    index: 3,
    name: '03. Acid Shibuya',
    subtitle: 'Breakbeat Techno · Acid Lime & Berry',
    bpm: 132,
    bgCanvas: '#080C0A',
    gridSurface: '#101815',
    gridLine: 'rgba(163, 230, 53, 0.14)',
    color1Fill: '#CCFF00',
    color1Inner: '#F4FFBD',
    color1Border: '#84CC16',
    color1Name: 'Volt',
    color2Fill: '#EC4899',
    color2Inner: '#FBCFE8',
    color2Border: '#BE185D',
    color2Name: 'Magenta',
    timelineAccent: '#38BDF8',
    rootMidi: 55, // G3
    scaleIntervals: [0, 1, 5, 7, 8, 12, 13, 17], // Phrygian
    bassPattern: [0, 0, 1, 0, 7, 8, 5, 0],
    arpPattern: [0, 5, 7, 12, 8, 7, 5, 1],
  },
  {
    id: 'velvet-horizon',
    index: 4,
    name: '04. Velvet Horizon',
    subtitle: 'Progressive Synth · Mint & Tangerine',
    bpm: 140,
    bgCanvas: '#090914',
    gridSurface: '#121226',
    gridLine: 'rgba(52, 211, 153, 0.14)',
    color1Fill: '#10B981',
    color1Inner: '#A7F3D0',
    color1Border: '#059669',
    color1Name: 'Mint',
    color2Fill: '#F97316',
    color2Inner: '#FED7AA',
    color2Border: '#C2410C',
    color2Name: 'Orange',
    timelineAccent: '#FDE047',
    rootMidi: 62, // D4
    scaleIntervals: [0, 2, 4, 7, 9, 12, 14, 16], // Major pentatonic
    bassPattern: [0, 12, 7, 9, 4, 12, 7, 2],
    arpPattern: [0, 4, 7, 9, 12, 16, 14, 9],
  },
  {
    id: 'supernova-overdrive',
    index: 5,
    name: '05. Supernova 150',
    subtitle: 'Peak Overdrive · Ivory & Crimson',
    bpm: 150,
    bgCanvas: '#050508',
    gridSurface: '#110F18',
    gridLine: 'rgba(244, 63, 94, 0.15)',
    color1Fill: '#F8FAFC',
    color1Inner: '#FFFFFF',
    color1Border: '#94A3B8',
    color1Name: 'Ivory',
    color2Fill: '#F43F5E',
    color2Inner: '#FECDD3',
    color2Border: '#BE123C',
    color2Name: 'Crimson',
    timelineAccent: '#00F0FF',
    rootMidi: 64, // E4
    scaleIntervals: [0, 3, 5, 7, 10, 12, 15, 19],
    bassPattern: [0, 12, 0, 10, 7, 12, 5, 3],
    arpPattern: [0, 7, 12, 15, 19, 15, 12, 7],
  },
];

/**
 * Generates a deterministic procedural geometric backdrop Data URL on an offscreen canvas
 * so users can also synthesize and edit artwork without requiring external image URLs.
 */
export function synthesizeGeometricBackdropDataUrl(
  skin: SkinTheme,
  variantSeed = 1,
  customLabel = ''
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Rich base gradient
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, skin.bgCanvas);
  grad.addColorStop(0.5, skin.gridSurface);
  grad.addColorStop(1, skin.bgCanvas);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle isometric / equalizer geometric bars
  const cols = 24;
  const colW = canvas.width / cols;
  for (let i = 0; i < cols; i++) {
    const hash = Math.sin((i + 1) * 12.9898 + variantSeed * 78.233) * 43758.5453;
    const norm = hash - Math.floor(hash);
    const barH = (0.18 + norm * 0.65) * canvas.height;
    ctx.fillStyle = i % 2 === 0 ? skin.color1Fill : skin.color2Fill;
    ctx.globalAlpha = 0.12 + norm * 0.14;
    ctx.fillRect(i * colW + 4, canvas.height - barH, colW - 8, barH);
  }

  // Concentric geometric rings
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = skin.timelineAccent;
  ctx.lineWidth = 2;
  for (let r = 1; r <= 5; r++) {
    ctx.beginPath();
    ctx.arc(canvas.width * 0.72, canvas.height * 0.36, r * 48 + (variantSeed % 3) * 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Diagonal luminous vector slices
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = skin.color1Fill;
  ctx.lineWidth = 3;
  for (let k = -2; k < 8; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 160 + (variantSeed * 29) % 80, 0);
    ctx.lineTo(k * 160 - 180 + (variantSeed * 29) % 80, canvas.height);
    ctx.stroke();
  }

  if (customLabel) {
    // Use prompt hash to add distinct polygon shards
    let promptHash = 0;
    for (let i = 0; i < customLabel.length; i++) {
      promptHash = (promptHash * 31 + customLabel.charCodeAt(i)) & 0xffffffff;
    }
    ctx.globalAlpha = 0.22;
    for (let p = 0; p < 6; p++) {
      const px = ((Math.abs(promptHash >> (p * 2)) % 80) / 80) * canvas.width;
      const py = ((Math.abs(promptHash >> (p * 3 + 1)) % 80) / 80) * canvas.height;
      const size = 40 + (p * 18);
      ctx.fillStyle = p % 2 === 0 ? skin.color1Fill : skin.color2Fill;
      ctx.beginPath();
      ctx.moveTo(px, py - size);
      ctx.lineTo(px + size, py);
      ctx.lineTo(px, py + size);
      ctx.lineTo(px - size, py);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  return canvas.toDataURL('image/png');
}
