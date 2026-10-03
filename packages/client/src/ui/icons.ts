/** Line-art icons (48×48 viewBox) for units, structures and commands. Original artwork, code-defined. */
export const ICONS: Record<string, string> = {
  mbt: '<rect x="6" y="26" width="36" height="10" rx="5"/><path d="M10 26l3-6h20l4 6"/><path d="M19 20v-4h10v4"/><path d="M29 18h15"/><circle cx="12" cy="31" r="2"/><circle cx="20" cy="31" r="2"/><circle cx="28" cy="31" r="2"/><circle cx="36" cy="31" r="2"/>',
  recon_vehicle: '<path d="M6 30h36l-3-8H26l-4-5H11l-5 8z"/><circle cx="14" cy="32" r="4"/><circle cx="34" cy="32" r="4"/><path d="M18 17v-3h6v3"/><path d="M24 15h12"/>',
  aa_vehicle: '<rect x="6" y="28" width="36" height="9" rx="4.5"/><path d="M12 28l2-6h20l2 6"/><rect x="16" y="13" width="8" height="9" rx="1"/><rect x="26" y="13" width="8" height="9" rx="1"/><path d="M38 10a6 6 0 0 1-6 6"/>',
  spg: '<rect x="6" y="28" width="36" height="9" rx="4.5"/><path d="M10 28V20h18v8"/><path d="M28 22L44 12"/><circle cx="14" cy="32" r="2"/><circle cx="34" cy="32" r="2"/>',
  supply_truck: '<path d="M4 30V18h22v12"/><path d="M26 22h9l6 6v2H26"/><circle cx="12" cy="32" r="4"/><circle cx="34" cy="32" r="4"/><path d="M9 18v-4h12v4"/>',
  rifle_squad: '<circle cx="17" cy="12" r="4"/><path d="M17 16v14l-5 10M17 30l5 10"/><path d="M11 22h16l9-4"/><circle cx="33" cy="16" r="3"/><path d="M33 19v11l-3 8M33 30l3 8"/>',
  at_team: '<circle cx="20" cy="13" r="4"/><path d="M20 17v13l-5 10M20 30l5 10"/><path d="M8 18l30-6"/><path d="M38 12l4-1"/>',
  engineer: '<circle cx="22" cy="12" r="4"/><path d="M16 10h12"/><path d="M22 16v13l-5 11M22 29l5 11"/><path d="M14 22h16"/><path d="M34 18l6 6-3 3-6-6z"/>',
  hq: '<path d="M6 40h36"/><rect x="9" y="20" width="22" height="20"/><path d="M31 40V26h8v14"/><path d="M20 20V12"/><path d="M14 12h12"/><path d="M35 26V16"/><path d="M14 27h4M22 27h4M14 33h4M22 33h4"/>',
  power_plant: '<path d="M6 40h36"/><path d="M10 40c2-8 2-16 0-24h12c-2 8-2 16 0 24"/><path d="M26 40V24h14v16"/><path d="M33 20l-3 6h6l-3 6"/>',
  supply_depot: '<path d="M6 40h36"/><path d="M8 40V22l14-8 14 8v18"/><rect x="16" y="28" width="12" height="12"/><rect x="36" y="32" width="8" height="8"/>',
  barracks: '<path d="M6 40h36"/><path d="M8 40V26a16 10 0 0 1 32 0v14"/><rect x="20" y="30" width="8" height="10"/><path d="M40 26V10"/><path d="M40 10h7l-2 3 2 3h-7"/>',
  vehicle_plant: '<path d="M4 40h40"/><path d="M6 40V22a18 10 0 0 1 36 0v18"/><rect x="14" y="28" width="20" height="12"/><path d="M14 32h20M14 36h20"/>',
  guard_tower: '<path d="M12 40h24"/><path d="M17 40l2-20h10l2 20"/><rect x="15" y="12" width="18" height="8" rx="1"/><path d="M33 16h11"/>',
  radar_uplink: '<path d="M6 40h36"/><path d="M24 40V22"/><path d="M18 40l6-18 6 18"/><path d="M12 14a14 14 0 0 1 24 0"/><path d="M16 18a9 9 0 0 1 16 0"/><circle cx="24" cy="21" r="1.5"/>',
  stop: '<rect x="13" y="13" width="22" height="22" rx="2"/>',
  hold: '<path d="M14 36V14l20 0"/><path d="M14 24h14"/><rect x="10" y="34" width="28" height="4"/>',
  guard: '<path d="M24 6l14 6v10c0 9-6 16-14 20-8-4-14-11-14-20V12z"/>',
  attackMove: '<path d="M8 40L40 8"/><path d="M28 8h12v12"/><path d="M10 26l12 12"/>',
  sell: '<circle cx="24" cy="24" r="16"/><path d="M29 17c-2-2-9-3-10 1-2 6 12 3 10 10-1 4-8 3-10 1"/><path d="M24 12v4M24 32v4"/>',
  rally: '<path d="M14 42V8"/><path d="M14 9h20l-5 6 5 6H14"/>',
  repair: '<path d="M30 8a8 8 0 0 0-8 11L8 33l7 7 14-14a8 8 0 0 0 11-8l-5 5-5-1-1-5z"/>',
  cancel: '<path d="M14 14l20 20M34 14L14 34"/>',
  build: '<path d="M8 40h32"/><path d="M12 40V20h24v20"/><path d="M8 20l16-12 16 12"/>',
  army: '<path d="M8 30h32"/><rect x="10" y="22" width="12" height="8" rx="2"/><rect x="26" y="22" width="12" height="8" rx="2"/><path d="M16 22v-6h14"/>',
  deselect: '<rect x="10" y="10" width="28" height="28" rx="3" stroke-dasharray="4 4"/><path d="M18 18l12 12M30 18L18 30"/>',
  menu: '<path d="M10 14h28M10 24h28M10 34h28"/>',
  rotate: '<path d="M36 18a14 14 0 1 0 2 10"/><path d="M38 8v10H28"/>',
  confirm: '<path d="M10 25l9 9 19-20"/>',
  harvest: '<path d="M8 40h32"/><rect x="12" y="26" width="10" height="10"/><rect x="24" y="22" width="12" height="14"/><path d="M14 16l6-6 6 6"/>',
};

export function iconFor(model: string): string {
  return ICONS[model] ?? ICONS['build']!;
}
