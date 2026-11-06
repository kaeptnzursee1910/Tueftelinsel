// Tüftelinsel – die Blöcke der Inselwelt (nur Daten, wird auch im Hintergrund-Worker benutzt)

// Kacheln im Texturatlas (16 × 16 Kacheln zu je 16 × 16 Pixeln), gemalt in textures.js
export const TILES = [
  'bedrock', 'stone', 'dirt', 'grass_top', 'grass_side', 'sand', 'water', 'palm_side', 'palm_top', 'palm_leaves',
  'wood_side', 'wood_top', 'leaves', 'planks', 'driftwood', 'coral', 'shellstone', 'brick', 'basalt', 'glass',
  'lantern', 'lantern_top', 'thatch', 'gravel', 'cloth_r', 'cloth_b', 'cloth_y', 'cloth_g', 'cloth_w', 'cloth_p',
  'crystal', 'beachgrass', 'hibiscus', 'mossrock', 'tiles', 'coral_b', 'thatch_top', 'sandstone', 'sandstone_top',
];
export const T = {};
TILES.forEach((n, i) => { T[n] = i; });

// kind: cube (undurchsichtig), cutout (Glas, Laub), water, cross (Pflanzen aus zwei gekreuzten Flächen)
const cube = (name, top, side, bottom, o) => Object.assign({ name, top, side: side || top, bottom: bottom || top, kind: 'cube', solid: true, pick: true }, o || {});

export const B = {
  AIR: 0, BEDROCK: 1, STONE: 2, DIRT: 3, GRASS: 4, SAND: 5, WATER: 6, PALM: 7, PALM_LEAVES: 8, WOOD: 9, LEAVES: 10,
  PLANKS: 11, DRIFTWOOD: 12, CORAL: 13, SHELLSTONE: 14, BRICK: 15, BASALT: 16, GLASS: 17, LANTERN: 18, THATCH: 19,
  GRAVEL: 20, CLOTH_R: 21, CLOTH_B: 22, CLOTH_Y: 23, CLOTH_G: 24, CLOTH_W: 25, CLOTH_P: 26, CRYSTAL: 27,
  BEACHGRASS: 28, HIBISCUS: 29, MOSSROCK: 30, TILES: 31, CORAL_B: 32, SANDSTONE: 33,
};

export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'Luft', kind: 'none', solid: false, pick: false };
BLOCKS[B.BEDROCK] = cube('Urgestein', 'bedrock', 0, 0, { hard: true });
BLOCKS[B.STONE] = cube('Fels', 'stone');
BLOCKS[B.DIRT] = cube('Erde', 'dirt');
BLOCKS[B.GRASS] = cube('Inselgras', 'grass_top', 'grass_side', 'dirt');
BLOCKS[B.SAND] = cube('Sand', 'sand');
BLOCKS[B.WATER] = { name: 'Wasser', top: 'water', side: 'water', bottom: 'water', kind: 'water', solid: false, pick: false };
BLOCKS[B.PALM] = cube('Palmenstamm', 'palm_top', 'palm_side');
BLOCKS[B.PALM_LEAVES] = cube('Palmenwedel', 'palm_leaves', 0, 0, { kind: 'cutout' });
BLOCKS[B.WOOD] = cube('Hartholz', 'wood_top', 'wood_side');
BLOCKS[B.LEAVES] = cube('Laub', 'leaves', 0, 0, { kind: 'cutout' });
BLOCKS[B.PLANKS] = cube('Planken', 'planks');
BLOCKS[B.DRIFTWOOD] = cube('Treibholz', 'driftwood');
BLOCKS[B.CORAL] = cube('Korallenstein', 'coral');
BLOCKS[B.SHELLSTONE] = cube('Muschelkalk', 'shellstone');
BLOCKS[B.BRICK] = cube('Lehmziegel', 'brick');
BLOCKS[B.BASALT] = cube('Basalt', 'basalt');
BLOCKS[B.GLASS] = cube('Glas', 'glass', 0, 0, { kind: 'cutout' });
BLOCKS[B.LANTERN] = cube('Laterne', 'lantern_top', 'lantern', 'lantern_top', { glow: true });
BLOCKS[B.THATCH] = cube('Strohdach', 'thatch_top', 'thatch');
BLOCKS[B.GRAVEL] = cube('Kies', 'gravel');
BLOCKS[B.CLOTH_R] = cube('Tuch rot', 'cloth_r');
BLOCKS[B.CLOTH_B] = cube('Tuch blau', 'cloth_b');
BLOCKS[B.CLOTH_Y] = cube('Tuch gelb', 'cloth_y');
BLOCKS[B.CLOTH_G] = cube('Tuch grün', 'cloth_g');
BLOCKS[B.CLOTH_W] = cube('Tuch weiß', 'cloth_w');
BLOCKS[B.CLOTH_P] = cube('Tuch lila', 'cloth_p');
BLOCKS[B.CRYSTAL] = cube('Meerkristall', 'crystal', 0, 0, { glow: true });
BLOCKS[B.BEACHGRASS] = { name: 'Strandgras', top: 'beachgrass', side: 'beachgrass', bottom: 'beachgrass', kind: 'cross', solid: false, pick: true, soft: true };
BLOCKS[B.HIBISCUS] = { name: 'Hibiskus', top: 'hibiscus', side: 'hibiscus', bottom: 'hibiscus', kind: 'cross', solid: false, pick: true, soft: true };
BLOCKS[B.MOSSROCK] = cube('Moosfels', 'mossrock');
BLOCKS[B.TILES] = cube('Fliesen', 'tiles');
BLOCKS[B.CORAL_B] = cube('Blaue Koralle', 'coral_b');
BLOCKS[B.SANDSTONE] = cube('Sandstein', 'sandstone_top', 'sandstone');

// Reihenfolge im Block-Menü
export const PALETTE = [
  B.GRASS, B.DIRT, B.SAND, B.SANDSTONE, B.GRAVEL, B.STONE, B.MOSSROCK, B.BASALT,
  B.PLANKS, B.PALM, B.WOOD, B.DRIFTWOOD, B.THATCH, B.BRICK, B.SHELLSTONE, B.TILES,
  B.CORAL, B.CORAL_B, B.GLASS, B.LANTERN, B.CRYSTAL, B.PALM_LEAVES, B.LEAVES, B.WATER,
  B.CLOTH_R, B.CLOTH_Y, B.CLOTH_G, B.CLOTH_B, B.CLOTH_P, B.CLOTH_W, B.BEACHGRASS, B.HIBISCUS,
];
export const DEFAULT_HOTBAR = [B.PLANKS, B.SANDSTONE, B.GLASS, B.THATCH, B.BRICK, B.LANTERN, B.CORAL, B.CLOTH_R, B.PALM_LEAVES];

// Schnelle Tabellen für Meshing und Kollision
export const NB = BLOCKS.length;
export const KIND = new Uint8Array(NB);      // 0 none, 1 cube, 2 cutout, 3 water, 4 cross
export const SOLID = new Uint8Array(NB);
export const OPAQUE = new Uint8Array(NB);
export const GLOW = new Uint8Array(NB);
export const FACE_TILE = new Int16Array(NB * 6); // Reihenfolge der Seiten: +x −x +y −y +z −z
const KINDS = { none: 0, cube: 1, cutout: 2, water: 3, cross: 4 };
BLOCKS.forEach((d, i) => {
  KIND[i] = KINDS[d.kind];
  SOLID[i] = d.solid ? 1 : 0;
  OPAQUE[i] = d.kind === 'cube' ? 1 : 0;
  GLOW[i] = d.glow ? 1 : 0;
  if (d.kind !== 'none') for (let f = 0; f < 6; f++) FACE_TILE[i * 6 + f] = T[f === 2 ? d.top : f === 3 ? d.bottom : d.side];
});

export function validBlock(b) { return Number.isInteger(b) && b >= 0 && b < NB && b !== B.BEDROCK; }
