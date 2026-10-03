import './ui/styles.css';
import { getMap, type BotDifficulty, type ServerMessage } from '@conflict/shared';
import { SoundEngine } from './audio/sound';
import { GameController } from './game/gameController';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import { Connection, type ConnectionState } from './net/connection';
import { h } from './ui/dom';
import * as screens from './ui/screens';

type View = 'menu' | 'searching' | 'room' | 'loading' | 'game' | 'results' | 'fatal';

/**
 * Application shell: owns the connection, settings and sound, switches between front-end screens and the
 * in-match GameController, and routes server messages. All gameplay authority stays on the server.
 */
class App {
  private readonly ui = document.getElementById('ui')!;
  private readonly canvas = document.getElementById('scene') as HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly sound = new SoundEngine();
  private readonly connection: Connection;
  private settings: Settings = loadSettings();
  private view: View = 'menu';
  private screenElement: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private game: GameController | null = null;
  private matchId = '';
  private connectedName = '';
  private pending: (() => void) | null = null;
  private lastDifficulty: BotDifficulty = 'normal';
  /** Match traffic that arrives while the scene is still being built; replayed in order once it exists. */
  private buffered: ((game: GameController) => void)[] = [];

  constructor() {
    this.overlay = h('canvas', { id: 'overlay' });
    this.canvas.after(this.overlay);
    this.connection = new Connection({
      onMessage: (m) => this.onMessage(m),
      onSnapshot: (s) => this.toGame((game) => game.onSnapshot(s)),
      onState: (s) => this.onConnectionState(s),
      onFatal: (message) => this.showFatal(message),
    });
    this.ensureConnected(this.settings.name);
    this.showMenu();
    const params = new URLSearchParams(location.search);
    const battle = Number(params.get('battle'));
    if (battle > 0) {
      // Development servers only: the server refuses this unless started with DEV_TOOLS=1.
      this.withConnection(this.settings.name, () => this.connection.send({ t: 'devBattle', units: battle }));
    }
    const room = params.get('room');
    if (room) {
      this.withConnection(this.settings.name, () => this.connection.send({ t: 'joinRoom', code: room.toUpperCase() }));
    }
  }

  // ---------------------------------------------------------------- connection

  private ensureConnected(name: string): void {
    if (this.connection.state === 'offline' || name !== this.connectedName) {
      if (this.connection.state !== 'offline') {
        this.connection.close();
      }
      this.connectedName = name;
      this.connection.connect(name);
    }
  }

  private withConnection(name: string, action: () => void): void {
    this.settings.name = name;
    saveSettings(this.settings);
    this.ensureConnected(name);
    if (this.connection.state === 'online') {
      action();
    } else {
      this.pending = action;
    }
  }

  private onConnectionState(state: ConnectionState): void {
    this.game?.setConnectionState(state);
    if (this.view === 'menu') {
      this.showMenu();
    }
  }

  private onMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        if (this.pending) {
          const action = this.pending;
          this.pending = null;
          action();
        }
        return;
      case 'queue':
        if (message.searching) {
          this.show('searching', screens.searching(message.waitingPlayers, () => this.connection.send({ t: 'cancelQueue' }), () => this.playBot(this.lastDifficulty)));
        } else if (this.view === 'searching') {
          this.showMenu();
        }
        return;
      case 'room':
        this.show(
          'room',
          screens.room(message.code, message.slots, message.canStart, {
            leave: () => {
              this.connection.send({ t: 'leaveRoom' });
              history.replaceState(null, '', location.pathname);
              this.showMenu();
            },
            ready: (ready) => this.connection.send({ t: 'setReady', ready }),
            start: () => this.connection.send({ t: 'startRoom' }),
            setBot: (slot, difficulty) => this.connection.send({ t: 'setBot', slot, difficulty }),
          }),
        );
        return;
      case 'roomClosed':
        this.showMenu();
        this.flash(message.reason);
        return;
      case 'matchStart':
        if (this.game && message.matchId === this.matchId) {
          this.game.onResync();
          return;
        }
        this.startMatch(message);
        return;
      case 'events':
        this.toGame((game) => game.onEvents(message.tick, message.events));
        return;
      case 'private':
        this.toGame((game) => game.onPrivate(message.state));
        return;
      case 'playerStatus':
        this.toGame((game) => game.onPlayerStatus(message.slot, message.connected, message.graceSeconds));
        return;
      case 'matchEnd':
        this.showResults(message.youWon, message.durationSeconds, message.stats);
        return;
      case 'error':
        if (message.code !== 'versionMismatch') {
          this.flash(message.message);
        }
        return;
      case 'pong':
        return;
    }
  }

  private toGame(action: (game: GameController) => void): void {
    if (this.game) {
      action(this.game);
    } else if (this.matchId) {
      this.buffered.push(action);
    }
  }

  // ---------------------------------------------------------------- screens

  private show(view: View, element: HTMLElement | null): void {
    this.view = view;
    this.screenElement?.remove();
    this.screenElement = element;
    if (element) {
      this.ui.append(element);
    }
  }

  private showMenu(): void {
    this.leaveGame();
    this.show(
      'menu',
      screens.mainMenu(
        this.settings,
        {
          playBot: (name, difficulty) => this.withConnection(name, () => this.playBot(difficulty)),
          quickMatch: (name) => this.withConnection(name, () => this.connection.send({ t: 'quickMatch' })),
          createRoom: (name) => this.withConnection(name, () => this.connection.send({ t: 'createRoom' })),
          joinRoom: (name, code) => {
            if (/^[A-Z0-9]{4,8}$/.test(code)) {
              this.withConnection(name, () => this.connection.send({ t: 'joinRoom', code }));
            } else {
              this.flash('Enter the room code you were given.');
            }
          },
          openSettings: () => this.openSettings(),
          openHelp: () => this.openModal(screens.helpModal(() => this.closeModal())),
        },
        this.connection.state === 'online',
      ),
    );
  }

  private playBot(difficulty: BotDifficulty): void {
    this.lastDifficulty = difficulty;
    this.connection.send({ t: 'playBot', difficulty });
  }

  private startMatch(message: Extract<ServerMessage, { t: 'matchStart' }>): void {
    this.leaveGame();
    this.matchId = message.matchId;
    const map = getMap(message.mapId);
    this.show('loading', screens.loading(map.name, message.players.map((p) => p.name)));
    // Let the loading screen paint before the (synchronous) scene build.
    window.setTimeout(() => {
      if (this.matchId !== message.matchId) {
        return;
      }
      const game = new GameController(this.canvas, this.overlay, this.ui, this.connection, this.sound, this.settings, message, {
        openMenu: () => this.openMatchMenu(),
      });
      this.game = game;
      const buffered = this.buffered;
      this.buffered = [];
      buffered.forEach((action) => action(game));
      this.show('game', null);
    }, 50);
  }

  private leaveGame(): void {
    this.game?.dispose();
    this.game = null;
    this.matchId = '';
    this.buffered = [];
    const ctx = this.overlay.getContext('2d');
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private showResults(youWon: boolean, duration: number, stats: Parameters<typeof screens.results>[2]): void {
    this.closeModal();
    this.sound.play(youWon ? 'ready' : 'alert');
    this.show(
      'results',
      screens.results(
        youWon,
        duration,
        stats,
        () => {
          this.connection.send({ t: 'leaveMatch' });
          this.showMenu();
        },
        () => {
          this.connection.send({ t: 'leaveMatch' });
          this.playBot(this.lastDifficulty);
        },
      ),
    );
  }

  private openMatchMenu(): void {
    this.openModal(
      screens.matchMenu({
        resume: () => this.closeModal(),
        settings: () => this.openSettings(),
        help: () => this.openModal(screens.helpModal(() => this.closeModal())),
        surrender: () => {
          if (window.confirm('Surrender this match?')) {
            this.connection.command({ type: 'surrender' });
            this.closeModal();
          }
        },
        leave: () => {
          if (window.confirm('Leave the match? This counts as a surrender.')) {
            this.connection.send({ t: 'leaveMatch' });
            this.closeModal();
            this.showMenu();
          }
        },
      }),
    );
  }

  private openSettings(): void {
    this.openModal(
      screens.settingsModal(
        this.settings,
        (settings) => {
          this.settings = settings;
          saveSettings(settings);
          this.sound.setVolume(settings.volume);
          this.game?.updateSettings(settings);
        },
        () => this.closeModal(),
        this.game !== null,
      ),
    );
  }

  private openModal(element: HTMLElement): void {
    this.closeModal();
    this.modal = element;
    this.ui.append(element);
  }

  private closeModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  private showFatal(message: string): void {
    this.leaveGame();
    this.show('fatal', screens.fatalError(message));
  }

  private flash(text: string): void {
    const toast = h('div', { class: 'toast warn' }, text);
    const host = h('div', { class: 'toast-host' }, toast);
    this.ui.append(host);
    window.setTimeout(() => host.remove(), 3500);
  }
}

new App();
