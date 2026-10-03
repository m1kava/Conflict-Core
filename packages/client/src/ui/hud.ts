import type { Terrain } from '@conflict/shared';
import type { ClientEntity } from '../game/clientWorld';
import { h, formatTime, svgIcon } from './dom';
import { ICONS, iconFor } from './icons';
import { Minimap, type MinimapActions } from './minimap';

export interface CommandButton {
  key: string;
  icon: string;
  label: string;
  cost?: number;
  hotkey?: string;
  disabled?: boolean;
  locked?: string;
  progress?: number;
  count?: number;
  active?: boolean;
  onClick(): void;
}

export interface HudView {
  credits: number;
  powerProduced: number;
  powerUsed: number;
  lowPower: boolean;
  time: number;
  selection: ClientEntity[];
  selectionIsOwn: boolean;
  commands: CommandButton[];
  /** Production queue of a single selected building (shown in the selection panel). */
  queue: { unitId: string; model: string; progress: number; onCancel(): void }[];
}

export interface HudActions extends MinimapActions {
  openMenu(): void;
  selectArmy(): void;
  deselect(): void;
  toggleAttackMove(): void;
  rotatePlacement(): void;
  confirmPlacement(): void;
  cancelMode(): void;
  selectEntity(id: number): void;
}

type ToastKind = 'info' | 'ok' | 'warn' | 'danger';

/** In-match HUD, built once and updated in place (DOM is only rebuilt when its content signature changes). */
export class Hud {
  readonly root: HTMLElement;
  readonly minimap: Minimap;
  private readonly creditsValue = h('span', { class: 'stat-value' }, '0');
  private readonly powerValue = h('span', { class: 'stat-value' }, '0/0');
  private readonly powerFill = h('div');
  private readonly powerBox: HTMLElement;
  private readonly clock = h('span', { class: 'stat-value' }, '00:00');
  private readonly net = h('div', { class: 'net' }, h('span', { class: 'dot' }), h('span', {}, '—'));
  private readonly selectionPanel = h('div', { class: 'panel selection-panel hidden' });
  private readonly commandCard = h('div', { class: 'panel command-card' });
  private readonly toasts = h('div', { class: 'toast-host' });
  private readonly placementBar: HTMLElement;
  private readonly attackMoveButton: HTMLButtonElement;
  private readonly banner = h('div', { class: 'status-banner' });
  private readonly perf = h('div', { class: 'panel perf' });
  private selectionSignature = '\u0000';
  private commandSignature = '\u0000';
  private readonly progressBars = new Map<string, HTMLElement>();
  private readonly lastToast = new Map<string, number>();

  constructor(
    container: HTMLElement,
    terrain: Terrain,
    private readonly actions: HudActions,
  ) {
    this.minimap = new Minimap(terrain, actions);
    this.powerBox = h('div', { class: 'power' }, h('span', { class: 'stat-label' }, 'Power'), h('div', { class: 'power-meter' }, this.powerFill), this.powerValue);

    const top = h(
      'div',
      { class: 'hud-top' },
      h(
        'div',
        { style: 'display:flex;gap:8px;align-items:flex-start' },
        this.iconButton('menu', 'Menu (Esc)', () => actions.openMenu()),
        h(
          'div',
          { class: 'resource-bar' },
          h('div', { class: 'credits' }, h('span', { class: 'stat-label' }, 'Credits'), this.creditsValue),
          this.powerBox,
          h('div', {}, h('span', { class: 'stat-label' }, 'Time'), this.clock),
        ),
      ),
      h('div', { class: 'panel', style: 'padding:8px 12px' }, this.net),
    );

    this.attackMoveButton = this.iconButton('attackMove', 'Attack-move: next tap attacks along the way', () => actions.toggleAttackMove());
    const touch = h(
      'div',
      { class: 'touch-actions' },
      this.iconButton('army', 'Select all combat units', () => actions.selectArmy()),
      this.attackMoveButton,
      this.iconButton('deselect', 'Clear selection', () => actions.deselect()),
    );

    this.placementBar = h(
      'div',
      { class: 'panel placement-bar' },
      h('button', { class: 'btn', onclick: () => actions.rotatePlacement() }, svgIcon(ICONS['rotate']!), 'Rotate'),
      h('button', { class: 'btn primary', onclick: () => actions.confirmPlacement() }, svgIcon(ICONS['confirm']!), 'Build here'),
      h('button', { class: 'btn danger', onclick: () => actions.cancelMode() }, svgIcon(ICONS['cancel']!), 'Cancel'),
    );
    this.placementBar.style.display = 'none';
    this.banner.style.display = 'none';
    this.perf.style.display = 'none';

    const bottom = h('div', { class: 'hud-bottom' }, this.minimap.element, this.selectionPanel, this.commandCard);
    this.root = h('div', { class: 'hud' }, top, bottom, touch, this.placementBar, this.toasts, this.banner, this.perf);
    for (const element of [top, bottom, touch, this.placementBar]) {
      element.addEventListener('pointerdown', (e) => e.stopPropagation());
      element.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    container.append(this.root);
  }

  update(view: HudView): void {
    this.creditsValue.textContent = view.credits.toLocaleString('en-US');
    this.powerValue.textContent = `${view.powerProduced}/${view.powerUsed}`;
    const ratio = view.powerProduced > 0 ? Math.min(1, view.powerUsed / view.powerProduced) : 1;
    this.powerFill.style.width = `${Math.round(ratio * 100)}%`;
    this.powerFill.style.background = view.lowPower ? 'var(--danger)' : ratio > 0.85 ? 'var(--warn)' : 'var(--ok)';
    this.powerBox.classList.toggle('low', view.lowPower);
    this.clock.textContent = formatTime(view.time);
    this.updateSelection(view);
    this.updateCommands(view.commands);
  }

  setConnection(state: string, rttMs: number): void {
    const label = this.net.lastElementChild as HTMLElement;
    if (state !== 'online') {
      label.textContent = state === 'reconnecting' ? 'Reconnecting…' : 'Offline';
      this.net.className = 'net bad';
      return;
    }
    label.textContent = `${Math.round(rttMs)} ms`;
    this.net.className = rttMs > 180 ? 'net bad' : rttMs > 90 ? 'net mid' : 'net';
  }

  setBanner(text: string | null): void {
    this.banner.style.display = text ? 'block' : 'none';
    this.banner.textContent = text ?? '';
  }

  setPlacementMode(active: boolean, touchDevice: boolean): void {
    this.placementBar.style.display = active && touchDevice ? 'flex' : 'none';
  }

  setAttackMove(active: boolean): void {
    this.attackMoveButton.classList.toggle('active', active);
  }

  setPerformance(text: string | null): void {
    this.perf.style.display = text ? 'block' : 'none';
    if (text) {
      this.perf.textContent = text;
    }
  }

  /** Short notification; identical messages are throttled. */
  toast(text: string, kind: ToastKind = 'info', throttleMs = 2500): void {
    const now = performance.now();
    if (now - (this.lastToast.get(text) ?? -Infinity) < throttleMs) {
      return;
    }
    this.lastToast.set(text, now);
    const element = h('div', { class: `toast ${kind}` }, text);
    this.toasts.prepend(element);
    while (this.toasts.childElementCount > 4) {
      this.toasts.lastElementChild?.remove();
    }
    window.setTimeout(() => element.remove(), 3200);
  }

  dispose(): void {
    this.root.remove();
  }

  private iconButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
    return h('button', { class: 'icon-btn', title, 'aria-label': title, onclick: onClick }, svgIcon(ICONS[icon]!));
  }

  private updateSelection(view: HudView): void {
    const selection = view.selection;
    const first = selection[0];
    const signature = selection.length === 0 ? '' : `${selection.map((e) => e.id).join(',')}|${view.queue.map((q) => q.unitId).join(',')}`;
    if (signature !== this.selectionSignature) {
      this.selectionSignature = signature;
      this.selectionPanel.replaceChildren();
      this.selectionPanel.classList.toggle('hidden', selection.length === 0);
      if (first && selection.length === 1) {
        this.selectionPanel.append(this.single(first, view));
      } else if (selection.length > 1) {
        this.selectionPanel.append(this.group(selection));
      }
    }
    if (first && selection.length === 1) {
      const bar = this.selectionPanel.querySelector<HTMLElement>('.hp > div');
      if (bar) {
        bar.style.width = `${Math.round(first.health * 100)}%`;
        bar.style.background = first.health > 0.6 ? 'var(--ok)' : first.health > 0.3 ? 'var(--warn)' : 'var(--danger)';
      }
      view.queue.forEach((item, index) => {
        const progress = this.selectionPanel.querySelector<HTMLElement>(`[data-queue="${index}"] .progress`);
        if (progress) {
          progress.style.width = `${Math.round(item.progress * 100)}%`;
        }
      });
    }
  }

  private single(entity: ClientEntity, view: HudView): HTMLElement {
    const def = entity.unitDef ?? entity.buildingDef;
    const name = entity.kind === 'resource' ? 'Supply Field' : (def?.displayName ?? entity.defId);
    const description = entity.kind === 'resource' ? `${Math.round(entity.progress * 100)}% supplies remaining` : (def?.description ?? '');
    const model = entity.kind === 'resource' ? 'harvest' : (def?.model ?? 'build');
    const children: HTMLElement[] = [
      h('div', { class: 'title' }, name, entity.veterancy > 0 ? ` ${'★'.repeat(entity.veterancy)}` : ''),
      h('div', { class: 'desc' }, entity.ghost ? 'Last known position' : description),
    ];
    if (entity.kind !== 'resource') {
      children.push(h('div', { class: 'hp' }, h('div', { style: `width:${Math.round(entity.health * 100)}%` })));
    }
    if (view.queue.length > 0) {
      const queue = h('div', { class: 'queue' });
      view.queue.forEach((item, index) => {
        const chip = h('button', { class: 'group-chip', 'data-queue': String(index), title: 'Cancel', onclick: () => item.onCancel() }, svgIcon(iconFor(item.model)), h('div', { class: 'progress', style: 'position:absolute;left:0;bottom:0;height:3px;background:var(--accent);width:0%' }));
        queue.append(chip);
      });
      children.push(queue);
    }
    return h('div', { class: 'row', style: 'gap:12px;width:100%' }, h('div', { class: 'portrait', style: 'flex:none' }, svgIcon(iconFor(model))), h('div', { class: 'selection-info' }, ...children));
  }

  private group(selection: ClientEntity[]): HTMLElement {
    const counts = new Map<string, { model: string; ids: number[] }>();
    for (const entity of selection) {
      const model = entity.unitDef?.model ?? entity.buildingDef?.model ?? 'build';
      const entry = counts.get(entity.defId) ?? { model, ids: [] };
      entry.ids.push(entity.id);
      counts.set(entity.defId, entry);
    }
    const grid = h('div', { class: 'group-grid' });
    for (const [, entry] of counts) {
      grid.append(h('button', { class: 'group-chip', title: 'Select only these', onclick: () => this.actions.selectEntity(entry.ids[0]!) }, svgIcon(iconFor(entry.model)), h('span', { class: 'count' }, String(entry.ids.length))));
    }
    return h('div', { class: 'selection-info' }, h('div', { class: 'title' }, `${selection.length} selected`), grid);
  }

  private updateCommands(commands: CommandButton[]): void {
    const signature = commands.map((c) => `${c.key}:${c.disabled ? 1 : 0}:${c.locked ?? ''}:${c.count ?? 0}:${c.active ? 1 : 0}`).join('|');
    if (signature !== this.commandSignature) {
      this.commandSignature = signature;
      this.progressBars.clear();
      this.commandCard.replaceChildren();
      this.commandCard.style.display = commands.length ? 'grid' : 'none';
      for (const command of commands) {
        const title = command.locked ? `${command.label} — requires ${command.locked}` : `${command.label}${command.cost ? ` (${command.cost})` : ''}${command.hotkey ? ` [${command.hotkey}]` : ''}`;
        const button = h(
          'button',
          {
            class: `cmd${command.locked ? ' locked' : ''}${command.active ? ' active' : ''}`,
            title,
            'aria-label': title,
            disabled: command.disabled === true,
            onclick: () => command.onClick(),
          },
          command.hotkey ? h('span', { class: 'hotkey' }, command.hotkey) : null,
          command.count ? h('span', { class: 'badge-count' }, String(command.count)) : null,
          svgIcon(ICONS[command.icon] ?? iconFor(command.icon)),
          h('span', { class: 'label' }, command.label),
          command.cost !== undefined ? h('span', { class: 'cost' }, `$${command.cost}`) : null,
        );
        const progress = h('div', { class: 'progress', style: 'width:0%' });
        button.append(progress);
        this.progressBars.set(command.key, progress);
        this.commandCard.append(button);
      }
    }
    for (const command of commands) {
      const bar = this.progressBars.get(command.key);
      if (bar) {
        bar.style.width = `${Math.round((command.progress ?? 0) * 100)}%`;
      }
    }
  }
}
