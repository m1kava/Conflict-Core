# Networking

Status legend: **IMPLEMENTED** / **PARTIAL** / **PLACEHOLDER** / **PLANNED**.

## 1. Model

Server-authoritative simulation with command-based input and fog-filtered delta snapshots
(rationale: [adr/0002-network-model.md](adr/0002-network-model.md)).

```
client                         match server (authoritative)
------                         ----------------------------
gesture → intent ──commands──▶ decode (bounded) → validate → queue for next tick
                               tick N: apply commands → simulate → visibility
render ◀─interpolate◀─snapshot─ per-player delta snapshot (only what that player may see)
       ◀──────────────events── shots, impacts, deaths, construction complete, alerts
```

| Parameter | Value | Reason |
|---|---|---|
| Simulation rate | 15 Hz (66.7 ms) | RTS orders don't need FPS-grade tick rates; keeps server CPU low for many matches per core |
| Snapshot rate | 15 Hz, adaptive down to 7.5 Hz per client under congestion | Bandwidth on mobile data |
| Client interpolation delay | 2 snapshots (~133 ms) + jitter buffer (adaptive) | Smooth motion under jitter |
| Command latency (perceived) | RTT/2 + ≤ 1 tick, hidden by immediate local feedback | Same feel as PC RTS |
| Reconnect grace | 90 s (configurable, `MatchServer:ReconnectGraceSeconds`) | Survive tunnels, Wi-Fi ↔ LTE handover |

## 2. Transport — PLANNED (Phase 4)

* UDP with a lightweight reliability layer; reference implementation **LiteNetLib** (MIT, runs on .NET 8 and
  Unity IL2CPP). Channels:
  * *reliable ordered*: handshake, command batches, gameplay events, chat;
  * *unreliable sequenced*: snapshots (a lost snapshot is superseded by the next one — never resent);
* MTU-safe payloads (≤ 1200 bytes); larger snapshots are split by priority, not fragmented blindly.
* Integrity: every packet after the handshake carries a truncated HMAC keyed by a per-session secret delivered
  inside the backend-signed join ticket flow; spoofed or replayed packets are dropped.
* Fallback for networks that block UDP (some corporate/hotel Wi-Fi): WebSocket over TLS — PLANNED, lower priority.
* The transport is behind an interface so it can be replaced without touching simulation or protocol code.

## 3. Protocol — PARTIAL

Implemented in `Shared/ConflictCore.Protocol`:

* **`PacketWriter` / `PacketReader`** — allocation-free little-endian encoding with LEB128 varints, zig-zag signed
  ints, quantised fixed-point, bounded strings and counts. The reader is written for hostile input: every read is
  bounds-checked, every variable-size field has an explicit maximum, and violations throw `ProtocolException`
  (fuzz-tested with 20 000 random packets).
* **Handshake** — `ClientHello { magic, protocol version, client version, game data hash, join ticket, resume token }`
  and `HelloReply { reason | slot, resume token, last processed command sequence }`. The protocol version is
  parsed before anything else so an incompatible client can always be told *why* it was rejected.
* **Commands** — `CommandBatch` with per-player monotonically increasing sequence numbers; `PlayerCommand` holds
  type, subjects (sorted, delta-encoded, duplicates rejected, max 128), target (position quantised to 1/64 m, or
  entity), argument (content index), rotation, formation and a queue flag. A 12-tank move is ~25 bytes.
* **Versioning** — `ProtocolInfo.Version` (wire format), client `SemanticVersion` (minimum enforced by server
  config) and `GameDataHash` (balance data identity). `VersionPolicy` returns a specific result for each mismatch.

Rules:

* Bump `ProtocolInfo.Version` on **any** wire-format change. Message type numbers are never reused.
* Clients send **intent only**. There is no message by which a client can assert state.

## 4. Command validation — PLANNED (Phase 2/4)

Each decoded command passes the server validator before it reaches the simulation:

1. **Rate limit** — token bucket per player (e.g. 20 commands/s sustained, burst 40); excess is dropped and
   counted; sustained abuse disconnects.
2. **Sequence** — already-applied sequences are ignored (idempotent resend after loss/reconnect).
3. **Ownership** — every subject must exist, be alive and belong to the sender (or be allowed by team rules).
4. **Capability** — the subject can execute the command type (a tank cannot `PlaceBuilding`).
5. **Target legality** — inside map bounds; target entity exists *and is visible to the sender's team*
   (prevents attacking units the client should not know about).
6. **Economy/tech** — affordability, prerequisites, power, queue limits, cooldowns — checked against
   authoritative state at application time, never against client claims.
7. **Placement** — footprint inside build radius, terrain/collision checks, no overlap.

Rejected commands produce a reason code event so the client can show "insufficient funds", "cannot build there".

## 5. Snapshots — PLANNED (Phase 4)

* Per recipient, per tick: the set of entities **visible to that recipient's team** (plus own entities always).
* **Delta compression** against the last snapshot the client acknowledged; entities enter/leave the set with
  create/destroy records. Fields carry dirty bits: position (quantised, delta-coded), heading (8 bit), turret yaw
  (8 bit), health (10 bit fraction), state flags, veterancy, order target (own units only).
* **Priority & budget**: if a snapshot exceeds its byte budget, entities are ranked by
  `definition network priority × on-screen relevance × staleness`; the rest roll over to the next tick.
* Own-player private data (credits, power, production queues, research) is sent only to its owner.
* Projectiles, muzzle flashes and impacts are **events** with spawn parameters; the client simulates them
  visually. Hitscan weapons send one event per burst.

### Bandwidth estimate (1v1, heavy battle)

| Item | Size |
|---|---|
| Moving entity update (id, dirty bits, Δposition, heading, turret) | ~7 bytes |
| Static entity with health change | ~4 bytes |
| 120 moving + 40 changed-static visible entities | ~1 000 bytes/snapshot |
| Events (shots/impacts) in a large fight | ~300 bytes/snapshot |
| **Total at 15 Hz** | **≈ 20 KB/s (160 kbit/s) peak**, typical 3–8 KB/s |
| Upstream commands | < 1 KB/s typical |

Comfortably inside 4G/5G and acceptable on good 3G. Budgets are tracked in [PERFORMANCE.md](PERFORMANCE.md).

## 6. Fog of war without information leaks — PLANNED (Phase 4)

* Server keeps a visibility grid per team (cell 4 m; 128×128 for a 512 m map) updated every 3rd tick by stamping
  vision circles of units/buildings; stealth requires a detector within `detectionRadius`.
* **Interest management is the anti-maphack:** entities not visible to a team are simply never sent to it.
  Buildings once seen are remembered by the client as "last known" ghosts (client-side memory of data it
  legitimately received).
* Explored/unexplored state is computed on the client from its own units' history (own vision is not secret).
* Command validation rejects targeting entities the sender cannot see.

## 7. Latency, loss and mobile networks — PLANNED (Phase 4), test matrix fixed now

| Scenario | Expected behaviour |
|---|---|
| 20 / 50 / 100 ms RTT | Indistinguishable from LAN apart from command acknowledgement delay |
| 150 / 250 ms RTT | Playable; interpolation delay adapts; command feedback stays instant locally |
| 1 %, 5 % packet loss | Snapshots: next one supersedes; commands: reliable channel resends |
| ±40 ms jitter | Jitter buffer grows; no visible stutter |
| 2–10 s outage | "Reconnecting…" banner, game continues on server; automatic resume |
| Wi-Fi → LTE handover | New socket from new IP, resume token restores session in < 2 s typical |

Testing tool (Phase 4): an in-process **network conditioner** inserted between transport and protocol in
integration tests (latency, jitter, loss, duplication, reordering, outages), and the same conditioner available in
development client builds. Headless bot clients drive two-player matches in CI.

## 8. Disconnects and reconnects — PARTIAL (protocol), PLANNED (logic)

* On disconnect the player's slot is held for the grace period. Their units keep executing their last orders
  and defend themselves; production queues continue. (Policy is server configuration, e.g. ranked could pause.)
* The client reconnects with `ClientHello.ResumeToken`. The server answers with
  `HelloReply.LastProcessedCommandSequence`; the client discards buffered commands at or below it and resends the
  rest (implemented in the protocol). Then the server sends a **full** snapshot and resumes deltas.
* Outlasting the grace period counts as abandonment and is reported in the match result.

## 9. Security summary

* Clients are untrusted; all input is bounded-parsed, rate-limited and validated against authoritative state.
* No backend or admin credentials in the client. Join tickets are signed by the backend with an asymmetric key; the
  match server holds only the public key (`IJoinTicketVerifier`). Match results are reported by the match server
  with service credentials — the client never reports a result.
* Development commands (spawn, add resources, reveal map, force victory) exist only in development server builds
  (`#if CONFLICTCORE_DEV_COMMANDS`, never defined in release builds) and require a dev-mode match flag set by the
  backend — never by the client.

## 10. Spectators and replays — PLANNED

* **Replays:** the server records setup (map, factions, seed, data hash, server version) plus the validated command
  stream per tick. Deterministic fixed-point simulation reproduces the match exactly on the same server version.
  Viewer = headless re-simulation streaming snapshots, so replays use the same client code as live matches.
* **Spectators:** a spectator connection receives unfiltered (or team-filtered for casting) snapshots with a
  configurable delay (e.g. 2 min for ranked) to prevent ghosting.
