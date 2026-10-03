import type { BotDifficulty, PlayerStats, RoomSlotView } from '@conflict/shared';
import type { Settings } from '../game/settings';
import type { QualityLevel } from '../render/quality';
import { TEAM_COLORS } from '../render/models/palette';
import { formatTime, h, svgIcon } from './dom';
import { ICONS } from './icons';

const logo = (): SVGSVGElement =>
  svgIcon('<path d="M24 4 42 14v20L24 44 6 34V14z" stroke="#38d3c3" stroke-width="2.6"/><path d="M24 14 33 19v10l-9 5-9-5V19z" fill="#38d3c3" stroke="none"/>');

function screen(...children: HTMLElement[]): HTMLElement {
  return h('div', { class: 'screen grid-bg' }, ...children);
}

export interface MenuActions {
  playBot(name: string, difficulty: BotDifficulty): void;
  quickMatch(name: string): void;
  createRoom(name: string): void;
  joinRoom(name: string, code: string): void;
  openSettings(): void;
  openHelp(): void;
}

/** `offline`: the game runs in this browser only (static hosting), so online modes are unavailable. */
export function mainMenu(settings: Settings, actions: MenuActions, serverOnline: boolean, offline = false): HTMLElement {
  let difficulty: BotDifficulty = 'normal';
  const nameInput = h('input', { type: 'text', maxlength: 20, value: settings.name, autocomplete: 'nickname', 'aria-label': 'Callsign' });
  const codeInput = h('input', { type: 'text', maxlength: 8, placeholder: 'CODE', autocapitalize: 'characters', 'aria-label': 'Room code', style: 'text-transform:uppercase;letter-spacing:0.2em;font-family:var(--mono)' });
  const name = (): string => nameInput.value.trim() || settings.name;
  const segmented = h('div', { class: 'segmented' });
  for (const level of ['easy', 'normal', 'hard'] as const) {
    const button = h('button', { class: level === difficulty ? 'active' : '' }, level.toUpperCase());
    button.addEventListener('click', () => {
      difficulty = level;
      segmented.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
    });
    segmented.append(button);
  }
  const card = h(
    'div',
    { class: 'card' },
    h('h2', {}, 'Deploy'),
    h('div', { class: 'field' }, h('label', {}, 'Callsign'), nameInput),
    h('div', { class: 'stack' },
      h('div', { class: 'field', style: 'margin:0' }, h('label', {}, 'Skirmish versus AI'), segmented),
      h('button', { class: 'btn primary', onclick: () => actions.playBot(name(), difficulty) }, 'Play vs AI'),
      h('div', { class: 'divider' }),
      ...(offline
        ? [h('p', { class: 'muted', style: 'margin:0' }, 'Online matches need the game server. This page runs the game in your browser, so you can play against the AI.')]
        : [
            h('button', { class: 'btn', onclick: () => actions.quickMatch(name()) }, 'Quick Match — online 1v1'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => actions.createRoom(name()) }, 'Create private room'),
            ),
            h('div', { class: 'row' }, codeInput, h('button', { class: 'btn', onclick: () => actions.joinRoom(name(), codeInput.value.trim().toUpperCase()) }, 'Join')),
          ]),
      h('div', { class: 'divider' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => actions.openSettings() }, 'Settings'),
        h('button', { class: 'btn', onclick: () => actions.openHelp() }, 'Controls'),
      ),
    ),
  );
  const brand = h(
    'div',
    { class: 'brand' },
    h('span', { class: 'tag' }, offline ? '● Playing in your browser' : serverOnline ? '● Server online' : '○ Connecting to server…'),
    h('div', { class: 'logo' }, h('div', { style: 'width:56px;height:56px' }, logo()), h('h1', {}, 'CONFLICT', h('span', {}, ' CORE'))),
    h('p', {}, 'Real-time strategy for the browser. Build a base, run your supply lines, field combined-arms forces and break the enemy in fast, tactical online matches — on desktop, tablet or phone.'),
    h('p', { class: 'muted' }, 'Faction: Halcyon Accord · Map: Ashfall Crossing · 1v1'),
  );
  return screen(h('div', { class: 'menu' }, brand, card));
}

export function searching(waiting: number, onCancel: () => void, onBot: () => void): HTMLElement {
  return screen(
    h('div', { class: 'card center-card' },
      h('div', { class: 'spinner' }),
      h('h2', { style: 'margin:0' }, 'Searching for an opponent'),
      h('div', { class: 'muted' }, waiting > 1 ? `${waiting} commanders in queue` : 'Waiting for another commander to queue. Share the game with a friend, or practise against the AI meanwhile.'),
      h('div', { class: 'row', style: 'width:100%' },
        h('button', { class: 'btn', onclick: onCancel }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: onBot }, 'Play vs AI'),
      ),
    ),
  );
}

export interface RoomActions {
  leave(): void;
  ready(ready: boolean): void;
  start(): void;
  setBot(slot: number, difficulty: BotDifficulty | null): void;
}

export function room(code: string, slots: RoomSlotView[], canStart: boolean, actions: RoomActions): HTMLElement {
  const me = slots.find((s) => s.isYou);
  const isHost = me?.isHost ?? false;
  const link = `${location.origin}${location.pathname}?room=${code}`;
  const copy = h('button', { class: 'btn', onclick: () => void navigator.clipboard?.writeText(link).then(() => (copy.textContent = 'Link copied')) }, 'Copy invite link');
  const list = h('div', { class: 'stack' });
  for (const slot of slots) {
    const color = `#${(TEAM_COLORS[slot.slot] ?? 0xffffff).toString(16).padStart(6, '0')}`;
    const right: HTMLElement[] = [];
    if (slot.kind === 'open') {
      if (isHost) {
        for (const level of ['easy', 'normal', 'hard'] as const) {
          right.push(h('button', { class: 'btn', style: 'min-height:30px;padding:0 8px;font-size:11px', onclick: () => actions.setBot(slot.slot, level) }, `+ ${level} AI`));
        }
      } else {
        right.push(h('span', { class: 'badge' }, 'Open'));
      }
    } else if (slot.kind === 'bot') {
      right.push(h('span', { class: 'badge ok' }, 'Ready'));
      if (isHost) right.push(h('button', { class: 'btn danger', style: 'min-height:30px;padding:0 8px;font-size:11px', onclick: () => actions.setBot(slot.slot, null) }, 'Remove'));
    } else {
      right.push(h('span', { class: `badge ${slot.ready ? 'ok' : 'warn'}` }, slot.isHost ? 'Host' : slot.ready ? 'Ready' : 'Not ready'));
    }
    list.append(h('div', { class: 'slot' }, h('div', { class: 'swatch', style: `background:${color}` }), h('div', { class: 'name' }, slot.name, slot.isYou ? ' (you)' : ''), ...right));
  }
  const controls = isHost
    ? h('button', { class: 'btn primary', disabled: !canStart, onclick: () => actions.start() }, canStart ? 'Start match' : 'Waiting for players…')
    : h('button', { class: 'btn primary', onclick: () => actions.ready(!(me?.ready ?? false)) }, me?.ready ? 'Not ready' : 'Ready');
  return screen(
    h('div', { class: 'card', style: 'width:min(520px,100%)' },
      h('h2', {}, 'Private room · Ashfall Crossing'),
      h('div', { class: 'stack' },
        h('div', { class: 'muted' }, 'Share this code (or the invite link) with your opponent:'),
        h('div', { class: 'room-code' }, code),
        copy,
        list,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => actions.leave() }, 'Leave'), controls),
      ),
    ),
  );
}

export function loading(mapName: string, players: string[]): HTMLElement {
  return screen(
    h('div', { class: 'card center-card' },
      h('span', { class: 'tag' }, 'Deploying'),
      h('h2', { style: 'margin:0;font-size:22px;color:var(--text);letter-spacing:0.08em' }, mapName),
      h('div', { class: 'muted' }, players.join('  vs  ')),
      h('div', { class: 'spinner' }),
    ),
  );
}

export function results(
  youWon: boolean,
  durationSeconds: number,
  stats: { slot: number; name: string; stats: PlayerStats }[],
  onMenu: () => void,
  onRematch: () => void,
): HTMLElement {
  const table = h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Commander'), h('th', {}, 'Units built'), h('th', {}, 'Kills'), h('th', {}, 'Lost'), h('th', {}, 'Structures'), h('th', {}, 'Credits earned'))),
  );
  const body = h('tbody');
  for (const entry of stats) {
    body.append(h('tr', {},
      h('td', { style: `color:#${(TEAM_COLORS[entry.slot] ?? 0xffffff).toString(16).padStart(6, '0')};font-weight:700` }, entry.name),
      h('td', {}, String(entry.stats.unitsProduced)),
      h('td', {}, String(entry.stats.unitsKilled)),
      h('td', {}, String(entry.stats.unitsLost)),
      h('td', {}, String(entry.stats.structuresBuilt)),
      h('td', {}, entry.stats.creditsEarned.toLocaleString('en-US')),
    ));
  }
  table.append(body);
  return h('div', { class: 'screen transparent' },
    h('div', { class: 'card results', style: 'width:min(640px,100%);text-align:center' },
      h('div', { class: `outcome ${youWon ? 'win' : 'loss'}` }, youWon ? 'VICTORY' : 'DEFEAT'),
      h('div', { class: 'muted', style: 'margin-bottom:16px' }, `Match length ${formatTime(durationSeconds)}`),
      table,
      h('div', { class: 'row', style: 'margin-top:18px' },
        h('button', { class: 'btn', onclick: onMenu }, 'Main menu'),
        h('button', { class: 'btn primary', onclick: onRematch }, 'Play vs AI again'),
      ),
    ),
  );
}

export function settingsModal(settings: Settings, onChange: (settings: Settings) => void, onClose: () => void, inMatch: boolean): HTMLElement {
  const current = { ...settings };
  const commit = (): void => onChange({ ...current });
  const quality = h('select', {});
  for (const level of ['low', 'medium', 'high', 'ultra'] as const) {
    const option = h('option', { value: level }, level[0]!.toUpperCase() + level.slice(1));
    if (level === current.quality) option.selected = true;
    quality.append(option);
  }
  quality.addEventListener('change', () => {
    current.quality = quality.value as QualityLevel;
    commit();
  });
  const slider = (value: number, min: number, max: number, step: number, apply: (v: number) => void): HTMLInputElement => {
    const input = h('input', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => {
      apply(Number(input.value));
      commit();
    });
    return input;
  };
  const toggle = (value: boolean, apply: (v: boolean) => void): HTMLInputElement => {
    const input = h('input', { type: 'checkbox' });
    input.checked = value;
    input.addEventListener('change', () => {
      apply(input.checked);
      commit();
    });
    return input;
  };
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'card' },
      h('h2', {}, 'Settings'),
      h('div', { class: 'setting' }, h('span', {}, 'Graphics quality', inMatch ? h('div', { class: 'muted' }, 'Applies from the next match') : null), quality),
      h('div', { class: 'setting' }, h('span', {}, 'Camera sensitivity'), slider(current.cameraSensitivity, 0.3, 2.5, 0.1, (v) => (current.cameraSensitivity = v))),
      h('div', { class: 'setting' }, h('span', {}, 'Two-finger camera rotation'), toggle(current.cameraRotation, (v) => (current.cameraRotation = v))),
      h('div', { class: 'setting' }, h('span', {}, 'Edge scrolling (mouse)'), toggle(current.edgeScroll, (v) => (current.edgeScroll = v))),
      h('div', { class: 'setting' }, h('span', {}, 'Volume'), slider(current.volume, 0, 1, 0.05, (v) => (current.volume = v))),
      h('div', { class: 'setting' }, h('span', {}, 'Always show health bars'), toggle(current.showAllHealthBars, (v) => (current.showAllHealthBars = v))),
      h('div', { class: 'setting' }, h('span', {}, 'Performance overlay (F3)'), toggle(current.showPerformance, (v) => (current.showPerformance = v))),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn primary', onclick: onClose }, 'Done')),
    ),
  );
  modal.addEventListener('pointerdown', (e) => e.stopPropagation());
  return modal;
}

export function helpModal(onClose: () => void): HTMLElement {
  const rows: [string, string][] = [
    ['Left click / tap', 'Select (Shift adds)'],
    ['Drag (mouse)', 'Box select'],
    ['Hold, then drag (touch)', 'Box select'],
    ['Double click / double tap', 'Select all visible of that type'],
    ['Right click', 'Move · attack · harvest · repair (context)'],
    ['Tap ground/enemy (touch)', 'Move or attack with selection'],
    ['Hold and release (touch)', 'Attack-move to that point'],
    ['A then click', 'Attack-move'],
    ['S / H / G', 'Stop · hold position · guard'],
    ['Ctrl+1–9, 1–9', 'Assign / recall group (double press centres)'],
    ['Wheel / pinch', 'Zoom'],
    ['Right-drag / one-finger drag', 'Pan camera'],
    ['Q / E, middle-drag / two-finger twist', 'Rotate camera'],
    ['Arrows, screen edges', 'Scroll'],
    ['Space', 'Centre on base'],
    ['Esc', 'Cancel · deselect · menu'],
  ];
  const grid = h('div', { class: 'help-grid' });
  for (const [key, action] of rows) {
    grid.append(h('kbd', {}, key), h('span', {}, action));
  }
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'card', style: 'width:min(560px,100%)' },
      h('h2', {}, 'Controls'),
      grid,
      h('div', { class: 'divider', style: 'margin:14px 0' }),
      h('div', { class: 'muted' }, 'Economy: build a Supply Depot (it comes with a truck), trucks haul credits from supply fields. Power Plants keep production at full speed. Destroy all enemy production structures, HQ and engineers to win.'),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn primary', onclick: onClose }, 'Got it')),
    ),
  );
  modal.addEventListener('pointerdown', (e) => e.stopPropagation());
  return modal;
}

export interface MatchMenuActions {
  resume(): void;
  settings(): void;
  help(): void;
  surrender(): void;
  leave(): void;
}

export function matchMenu(actions: MatchMenuActions): HTMLElement {
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'card stack', style: 'width:min(340px,100%)' },
      h('h2', {}, 'Menu'),
      h('div', { class: 'muted' }, 'The match keeps running while this menu is open.'),
      h('button', { class: 'btn primary', onclick: () => actions.resume() }, 'Resume'),
      h('button', { class: 'btn', onclick: () => actions.settings() }, 'Settings'),
      h('button', { class: 'btn', onclick: () => actions.help() }, 'Controls'),
      h('button', { class: 'btn danger', onclick: () => actions.surrender() }, 'Surrender'),
      h('button', { class: 'btn', onclick: () => actions.leave() }, 'Leave match'),
    ),
  );
  modal.addEventListener('pointerdown', (e) => e.stopPropagation());
  return modal;
}

export function fatalError(message: string): HTMLElement {
  return screen(
    h('div', { class: 'card center-card' },
      h('div', { style: 'width:48px;height:48px;color:var(--warn)' }, svgIcon(ICONS['cancel']!)),
      h('h2', { style: 'margin:0' }, 'Unable to continue'),
      h('div', { class: 'muted' }, message),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload'),
    ),
  );
}
