/** Gameplay events produced by a tick. Positional events are filtered by fog before being sent to a player. */
export type NoticeCode =
  | 'insufficientFunds'
  | 'cannotBuildThere'
  | 'requirementsMissing'
  | 'queueFull'
  | 'lowPower'
  | 'underAttack'
  | 'unitReady'
  | 'constructionComplete'
  | 'buildingLost'
  | 'unitLost'
  | 'supplyDepleted';

export type SimEvent =
  | {
      type: 'fire';
      shooter: number;
      weapon: string;
      x: number;
      y: number;
      tx: number;
      ty: number;
      target: number;
      /** Ticks until impact (0 = instant / hitscan). */
      flight: number;
      hit: boolean;
    }
  | { type: 'impact'; weapon: string; x: number; y: number }
  | { type: 'death'; id: number; defId: string; owner: number; x: number; y: number; kind: 'unit' | 'building' }
  | { type: 'built'; id: number; owner: number; defId: string }
  | { type: 'produced'; id: number; owner: number; defId: string }
  | { type: 'promoted'; id: number; owner: number; level: number }
  | { type: 'notice'; player: number; code: NoticeCode; x?: number; y?: number }
  | { type: 'defeated'; player: number }
  | { type: 'gameOver'; winnerTeam: number };

/** World position of an event for fog filtering, or null if it is not positional. */
export function eventPosition(event: SimEvent): { x: number; y: number } | null {
  switch (event.type) {
    case 'fire':
    case 'impact':
    case 'death':
      return { x: event.x, y: event.y };
    default:
      return null;
  }
}
