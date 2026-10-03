/** Authoritative simulation steps per second. RTS orders do not need FPS-grade tick rates. */
export const TICK_RATE = 15;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Bumped whenever messages or snapshot encoding change; client and server must match exactly. */
export const PROTOCOL_VERSION = 2;

/** Navigation grid resolution in metres. */
export const NAV_CELL_SIZE = 2;

/** Fog-of-war grid resolution in metres. */
export const FOG_CELL_SIZE = 4;

/** Spatial hash bucket size in metres (must exceed the largest common query radius / 4). */
export const SPATIAL_CELL_SIZE = 16;

/** Maximum players per match supported by the simulation (4v4 / 8-player FFA). */
export const MAX_PLAYERS = 8;

/** Owner id of neutral entities such as supply fields. */
export const NEUTRAL_OWNER = -1;

/** Seconds a disconnected player's slot is held for reconnection. */
export const RECONNECT_GRACE_SECONDS = 90;
