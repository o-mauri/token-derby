import type { Hat, HatId } from '@token-derby/shared';

export const HATS: Hat[] = [
  // ── COMMON (25) ──────────────────────────────────────────────────────
  { id: 'flat_cap', name: 'Flat Cap', rarity: 'common', width: 7, anchor_x: 25, rows: ['..AAAA.', '..AAAA.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#8B6914' } },
  { id: 'beanie', name: 'Beanie', rarity: 'common', width: 7, anchor_x: 25, rows: ['.QQQQQ.', '.AAAAA.', '.AAAAA.', 'AAAAAAA'], colors: { A: '#CC2200', Q: '#FFFFFF' } },
  { id: 'bucket_hat', name: 'Bucket Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['..AAA..', '.AAAAA.', '.AAAAA.', 'AAAAAAA'], colors: { A: '#4A7C59' } },
  { id: 'stetson', name: 'Stetson', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAAAA.', '.AAAAA.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#C49A00' } },
  { id: 'party_hat', name: 'Party Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['...A...', '..AQA..', '.AQAQA.', 'AAAAAAA'], colors: { A: '#FF69B4', Q: '#FFD700' } },
  { id: 'fez', name: 'Fez', rarity: 'common', width: 7, anchor_x: 25, rows: ['..QQQ..', '..AAA..', '..AAA..', '.AAAAA.'], colors: { A: '#CC0000', Q: '#8B0000' } },
  { id: 'beret', name: 'Beret', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAAAA.', 'AAAAAAA', 'AAAAAAA', '..AAA..'], colors: { A: '#1A237E' } },
  { id: 'sailor_hat', name: 'Sailor Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['.QQQQQ.', '.QQQQQ.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#FFFFFF', Q: '#000080' } },
  { id: 'pork_pie', name: 'Pork Pie', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAAAA.', 'AAAAAAA', 'AAAAAAA', '.AAAAA.'], colors: { A: '#2C1810' } },
  { id: 'newsboy_cap', name: 'Newsboy Cap', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAAAA.', 'AAAQAAA', 'AAAAAAA', 'AAAAAA.'], colors: { A: '#5C4033', Q: '#3D2B1F' } },
  { id: 'tam_o_shanter', name: "Tam O'Shanter", rarity: 'common', width: 7, anchor_x: 25, rows: ['..QQQ..', '.AAAAA.', 'AAAAAAA', '.AAAAA.'], colors: { A: '#006400', Q: '#FF0000' } },
  { id: 'boater', name: 'Boater', rarity: 'common', width: 7, anchor_x: 25, rows: ['.QQQQQ.', 'QQAAQQ.', 'QQAAQQ.', '.QQQQQ.'], colors: { A: '#F5F5DC', Q: '#8B0000' } },
  { id: 'trucker_cap', name: 'Trucker Cap', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAQQ..', '.AAQQ..', 'AAQQQAA', 'AAQQQAA'], colors: { A: '#2196F3', Q: '#FFFFFF' } },
  { id: 'hard_hat', name: 'Hard Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['..AAA..', '.AAAAA.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#FFD600' } },
  { id: 'chef_toque', name: "Chef's Toque", rarity: 'common', width: 7, anchor_x: 25, rows: ['.QQQQQ.', 'QQQQQQQ', '.AAAAA.', '.AAAAA.'], colors: { A: '#FFFFFF', Q: '#F0F0F0' } },
  { id: 'bobble_hat', name: 'Bobble Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['...Q...', '.AAAAA.', '.AAAAA.', 'AAAAAAA'], colors: { A: '#C62828', Q: '#FFFFFF' } },
  { id: 'pirate_bandana', name: 'Pirate Bandana', rarity: 'common', width: 7, anchor_x: 25, rows: ['AQAQAQA', 'AAAAAAA', 'AAAAAAA', '.QQQQQ.'], colors: { A: '#CC0000', Q: '#000000' } },
  { id: 'cowboy_hat', name: 'Cowboy Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAAAA.', '.AAAAA.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#8B4513' } },
  { id: 'baseball_cap', name: 'Baseball Cap', rarity: 'common', width: 7, anchor_x: 25, rows: ['AAAAAA.', 'AAAAAAA', 'AAAAAAA', 'AAAAAA.'], colors: { A: '#1565C0' } },
  { id: 'sun_hat', name: 'Sun Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['..AAA..', '..AAA..', '.AAAAA.', 'AAAAAAA'], colors: { A: '#F9A825' } },
  { id: 'ushanka', name: 'Ushanka', rarity: 'common', width: 7, anchor_x: 25, rows: ['AAAAAAA', 'AAAAAAA', 'AAAAAAA', 'A.AAA.A'], colors: { A: '#5D4037' } },
  { id: 'tinfoil_hat', name: 'Tinfoil Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['...A...', '..AAA..', '.AAAAA.', 'AAAAAAA'], colors: { A: '#B0BEC5' } },
  { id: 'dunce_cap', name: 'Dunce Cap', rarity: 'common', width: 7, anchor_x: 25, rows: ['...Q...', '..QAQ..', '.QAAAQ.', 'AAAAAAA'], colors: { A: '#F8F8F8', Q: '#F44336' } },
  { id: 'mini_top_hat', name: 'Mini Top Hat', rarity: 'common', width: 7, anchor_x: 25, rows: ['.AAAAA.', '.AAAAA.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#212121' } },
  { id: 'knit_cap', name: 'Knit Cap', rarity: 'common', width: 7, anchor_x: 25, rows: ['AQAQAQA', 'AAAAAAA', '.AAAAA.', '.AAAAA.'], colors: { A: '#7B1FA2', Q: '#F3E5F5' } },

  // ── RARE (13) ────────────────────────────────────────────────────────
  { id: 'bicorne', name: 'Bicorne', rarity: 'rare', width: 7, anchor_x: 25, rows: ['AAAQQQQ', 'AAAAAAA', 'AAAAAAA', '.QQQQQ.'], colors: { A: '#1A237E', Q: '#FFD700' } },
  { id: 'viking_helmet', name: 'Viking Helmet', rarity: 'rare', width: 7, anchor_x: 25, rows: ['A.AAA.A', 'AAAAAAA', 'AAAAAAA', 'AQQQQQA'], colors: { A: '#9E9E9E', Q: '#8D6E63' } },
  { id: 'jesters_cap', name: "Jester's Cap", rarity: 'rare', width: 7, anchor_x: 25, rows: ['AQAQAQA', 'AQAQAQA', '.AAAAA.', '.AAAAA.'], colors: { A: '#E53935', Q: '#FFD600' } },
  { id: 'plague_doctor', name: 'Plague Doctor Beak', rarity: 'rare', width: 7, anchor_x: 25, rows: ['..QQQ..', '..QQQ..', '.QQAAQ.', '.QQAAQ.'], colors: { A: '#F5F5F5', Q: '#795548' } },
  { id: 'morion', name: 'Conquistador Morion', rarity: 'rare', width: 7, anchor_x: 25, rows: ['...A...', '..AAA..', 'AAAAAAA', '.AQQQA.'], colors: { A: '#B0BEC5', Q: '#FFD600' } },
  { id: 'phrygian_cap', name: 'Phrygian Cap', rarity: 'rare', width: 7, anchor_x: 25, rows: ['...A...', '..AAAA.', '.AAAAA.', 'AAAAAAA'], colors: { A: '#C62828' } },
  { id: 'shako', name: 'Shako', rarity: 'rare', width: 7, anchor_x: 25, rows: ['AAAAAAA', 'AAAAAAA', 'AAAAAAA', 'AQQQQQA'], colors: { A: '#1A237E', Q: '#FFD700' } },
  { id: 'centurion_helm', name: 'Centurion Helm', rarity: 'rare', width: 7, anchor_x: 25, rows: ['.QQQQQ.', 'QQQAQQQ', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#B0BEC5', Q: '#C62828' } },
  { id: 'coonskin_cap', name: 'Coonskin Cap', rarity: 'rare', width: 7, anchor_x: 25, rows: ['AQAAQAQ', 'AAAAAAA', '.AAAAA.', 'AAAAAAA'], colors: { A: '#5D4037', Q: '#212121' } },
  { id: 'papal_mitre', name: 'Papal Mitre', rarity: 'rare', width: 7, anchor_x: 25, rows: ['..QQQ..', '.QQQQQ.', '.QAAAQ.', 'AAAAAAA'], colors: { A: '#FFFFFF', Q: '#FFD700' } },
  { id: 'cardinals_hat', name: "Cardinal's Hat", rarity: 'rare', width: 7, anchor_x: 25, rows: ['..AAAA.', '.AAAAAA', '.AAAAAA', 'AAAAAAA'], colors: { A: '#B71C1C' } },
  { id: 'headdress', name: 'Headdress', rarity: 'rare', width: 7, anchor_x: 25, rows: ['AQAQAQA', 'AQAQAQA', 'AAAAAAA', '.QQQQQ.'], colors: { A: '#FF8F00', Q: '#1565C0' } },
  { id: 'sombrero', name: 'Sombrero', rarity: 'rare', width: 7, anchor_x: 25, rows: ['..AAA..', '.AAAAA.', 'AAQAQAA', 'AAAAAAA'], colors: { A: '#F57F17', Q: '#BF360C' } },

  // ── EPIC (7) ─────────────────────────────────────────────────────────
  { id: 'napoleon_hat', name: 'Napoleon Hat', rarity: 'epic', width: 7, anchor_x: 25, rows: ['.AAAAAA', 'AAAAAAA', 'AAAAAAA', '.AQQQQQ', '.AQQQQQ', '.AQQQQQ'], colors: { A: '#1A237E', Q: '#FFD700' } },
  { id: 'papal_tiara', name: 'Papal Tiara', rarity: 'epic', width: 7, anchor_x: 25, rows: ['..QQ...', '.QQQQQ.', '.QAAQQ.', '.QQQQQ.', 'AAAAAAA', 'AQQQQQA'], colors: { A: '#FFFFFF', Q: '#FFD700' } },
  { id: 'samurai_kabuto', name: 'Samurai Kabuto', rarity: 'epic', width: 7, anchor_x: 25, rows: ['.AAAAAA', 'AAAAAAA', 'AAAAAAA', 'AQQQQQA', 'A.QQQ.A', 'AAAAAAA'], colors: { A: '#B0BEC5', Q: '#C62828' } },
  { id: 'gladiator_galea', name: 'Gladiator Galea', rarity: 'epic', width: 7, anchor_x: 25, rows: ['.QQQQQ.', '.QQQQQ.', '.QAAA..', 'AAAAAAA', 'AAAAAAA', 'AQQQQQA'], colors: { A: '#B0BEC5', Q: '#C62828' } },
  { id: 'pharaoh_nemes', name: 'Pharaoh Nemes', rarity: 'epic', width: 7, anchor_x: 25, rows: ['AAAAAAA', 'QAAAAAQ', 'QAAAAAQ', 'QQAAAQQ', 'QQAAAAA', '.QAQA..'], colors: { A: '#FFD700', Q: '#1565C0' } },
  { id: 'spartan_helmet', name: 'Spartan Helmet', rarity: 'epic', width: 7, anchor_x: 25, rows: ['..QQQ..', '.QQQQQ.', 'QQAAQQ.', 'AAAAAAA', 'AAAAAAA', 'AQQQQQA'], colors: { A: '#B0BEC5', Q: '#B71C1C' } },
  { id: 'conquistador_full', name: 'Conquistador Helm', rarity: 'epic', width: 7, anchor_x: 25, rows: ['...A...', '..AAA..', '.AAAAA.', 'AAAAAAA', '.AQQQA.', '.AQQQA.'], colors: { A: '#B0BEC5', Q: '#FFD700' } },

  // ── LEGENDARY (5, animated) ───────────────────────────────────────────
  { id: 'rainbow_crown', name: 'Rainbow Crown', rarity: 'legendary', width: 7, anchor_x: 25, rows: ['..AQA..', '..AQA..', '.AAAAA.', '.AAAAA.', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#FFD700', Q: '#FFFFFF' }, animation: { type: 'cycle', frames: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'], fps: 8 } },
  { id: 'inferno_cap', name: 'Inferno Cap', rarity: 'legendary', width: 7, anchor_x: 25, rows: ['...Q...', '...Q...', '..QQQ..', '..QQQ..', 'AAAAAAA', 'AAAAAAA'], colors: { A: '#FF4500', Q: '#FFD700' }, animation: { type: 'cycle', frames: ['#FF0000', '#FF2200', '#FF4500', '#FF6600', '#FF8C00', '#FFA500'], fps: 12 } },
  { id: 'void_hood', name: 'Void Hood', rarity: 'legendary', width: 7, anchor_x: 25, rows: ['.AAAAA.', '.AAAAA.', 'AAAAAAA', 'AAAAAAA', 'AAQQQAA', 'AAQQQAA'], colors: { A: '#1A0033', Q: '#330066' }, animation: { type: 'cycle', frames: ['#0D0019', '#1A0033', '#2D004D', '#3D0066', '#2D004D', '#1A0033'], fps: 3 } },
  { id: 'prismatic_jester', name: 'Prismatic Jester', rarity: 'legendary', width: 7, anchor_x: 25, rows: ['AQAQAQA', 'AQAQAQA', 'AAAAAAA', 'AAAAAAA', 'AQAQAQA', 'AQAQAQA'], colors: { A: '#FF0000', Q: '#0000FF' }, animation: { type: 'cycle', frames: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF00FF', '#00FFFF'], fps: 15 } },
  { id: 'aurora_helm', name: 'Aurora Helm', rarity: 'legendary', width: 7, anchor_x: 25, rows: ['.QQQQQ.', '.QQQQQ.', 'AAAAAAA', 'AAAAAAA', 'AQAAAQA', 'AQAAAQA'], colors: { A: '#00CED1', Q: '#00FF7F' }, animation: { type: 'cycle', frames: ['#0000FF', '#0066FF', '#00BFFF', '#00CED1', '#00FF7F', '#7CFC00', '#00FF7F', '#00CED1'], fps: 4 } },
];

export function hatById(id: HatId): Hat | undefined {
  return HATS.find(h => h.id === id);
}
