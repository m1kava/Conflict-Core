# Networking

## Model

Server-authoritative simulation with command input and fog-filtered delta snapshots (ADR 0002, transport
updated by ADR 0005).

| Parameter | Value |
|---|---|
| Transport | WebSocket (TCP) on the same port as the web page (`/ws`); `wss://` when served over HTTPS |
| Simulation rate | 15 Hz |
| Snapshot rate | every tick, per player |
| Client render delay | 2 ticks (~133 ms) + smooth drift correction |
| Reconnect grace | 90 s (`RECONNECT_GRACE_SECONDS`) |

WebSockets work everywhere browsers do (including mobile networks and most corporate proxies). Because delivery
is reliable and ordered, snapshots can be deltas against the last state sent — no acknowledgements needed.

## Messages

Control plane (JSON, `packages/shared/src/protocol/messages.ts`): `hello`, `quickMatch`, `cancelQueue`,
`playBot`, `createRoom`, `joinRoom`, `leaveRoom`, `setReady`, `setBot`, `startRoom`, `command`, `leaveMatch`,
`ping`; server → client: `welcome`, `error`, `queue`, `room`, `roomClosed`, `matchStart`, `events`, `private`,
`playerStatus`, `matchEnd`, `pong`. Every client message goes through `parseClientMessage` (strict shape, length
limits, enumerations); commands additionally through `parseCommand`.

World state (binary, `protocol/snapshot.ts`): per entity only changed fields — position as 1-byte deltas at
1/64 m (absolute when it jumps), heading, turret, health, flags, progress; new entities carry full state; entities
leaving vision are listed as removals. A moving tank costs ~6 bytes per tick; idle units and structures cost
nothing.

`PROTOCOL_VERSION` is checked in `hello`; mismatching clients are asked to reload.

## Authority and validation

1. Per-connection message rate limit (token bucket 60/s, burst 120) and 16 KB message limit.
2. Per-player command rate limit (20/s, burst 40) and sequence numbers (duplicates ignored).
3. Structural validation (`parseCommand`): known types, finite bounded numbers, ≤ 200 unique unit ids, valid ids.
4. Semantic validation in the world: units must exist and belong to the sender; targets must be visible to the
   sender's team; production requires a complete producer that lists the unit, prerequisites and credits;
   placement uses the same footprint and terrain rules as the preview plus build radius and occupancy.
5. Results (victory/defeat, stats) are computed by the server only.

## Fog of war

The server maintains a visibility grid per team (4 m cells) from unit and structure vision. Snapshot encoders
include an entity only if the recipient's team sees it; `eventsForPlayer` drops shots/impacts/deaths that happen
out of sight. The client computes its own visible/explored overlay from its own units — information it already has.

## Disconnects and reconnects

* The session token (stored in `localStorage`) identifies a browser across sockets. A new socket that presents
  the token takes over the session, its room or its running match.
* On resume the server resets that player's snapshot encoder (full state is resent) and sends `matchStart`
  with `resumed: true`; the client clears replicated state and resends commands the server has not acknowledged
  (`private.lastCommandSeq`); the server ignores any sequence it already applied.
* A player gone longer than the grace period is treated as having surrendered; if everyone leaves, the match is
  disposed.

## Tested network behaviour

* Integration tests (`packages/server/test`) drive real WebSocket clients: handshake and version rejection,
  malformed messages, bot match streaming, quick-match pairing with fog-filtered views, reconnect with full
  resync, duplicate-sequence dedupe, private rooms, surrender, dev-tool refusal.
* Snapshot codec tests: exact round-trip over 300 ticks of a battle, zero bytes for idle entities, no hidden
  enemies, truncated data rejected.

Planned: an in-process network conditioner for latency/loss/jitter test matrices, spectator streams, replays.
