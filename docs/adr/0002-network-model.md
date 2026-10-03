# ADR 0002 — Server-authoritative simulation with fog-filtered delta snapshots

**Status:** Accepted (2026-10)

## Context

Online multiplayer between real players is the main priority. Requirements: no trust in clients, no fog-of-war
information leaks, survive mobile network conditions (250 ms RTT, loss, jitter, brief outages, IP changes),
reconnect, spectators and replays, 100–300 units, modest phone CPU and battery.

## Options

1. **Deterministic lockstep (P2P or relayed)** — clients exchange commands, everyone simulates. Tiny bandwidth,
   unlimited unit counts. But every client holds the full world (maphack), the slowest/lagging client stalls all
   players, every phone pays full simulation cost, reconnect requires fast-forwarding the whole match, and
   cross-platform determinism must hold on every client device.
2. **Authoritative lockstep (server relays commands, clients still simulate)** — fixes trust in commands but not
   maphacks, stalls or client cost.
3. **Server simulation + state snapshots with interest management** — server is the only simulator; clients
   receive only what they may see. Higher bandwidth, server CPU per match.
4. **Snapshots + client-side prediction of own units** — as 3, plus prediction; RTS commands are tolerant of
   ~100 ms latency, so the extra complexity is not justified initially.

## Decision

Option 3: authoritative server at 15 Hz, command intents upstream, per-player fog-filtered delta snapshots and
gameplay events downstream, client interpolation. Keep the simulation deterministic (ADR 0003) so option 4 and
replays remain possible.

## Consequences

* (+) Fog cannot leak; clients cannot invent state; a lagging player does not stall the opponent; reconnect is
  "send a full snapshot"; spectators are just another (delayed) recipient.
* (+) Phones only interpolate and render — better battery and thermals.
* (−) Bandwidth ~3–8 KB/s typical, ~20 KB/s peak — acceptable on 4G; mitigated by delta, quantisation, priority
  budgets and event-based projectiles.
* (−) Hosting cost per match — mitigated by a cheap 15 Hz tick and efficient data layout; budget ≤ 3 ms per tick.
* (−) Command latency equals RTT/2 + up to one tick — hidden with immediate local acknowledgement (voice, markers,
  turret slew), as PC RTS games always have.
