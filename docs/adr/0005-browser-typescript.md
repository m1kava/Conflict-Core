# ADR 0005 — Browser-first TypeScript stack (supersedes 0001, 0003 and 0004; amends 0002)

**Status:** Accepted (2026-10)

## Context

The product owner asked for an online game that runs in the browser and requires no paid services, licences or
setup on their side. Unity (ADR 0001) requires a licence and CI activation, produces heavy web builds, and its C#
simulation could not be shared with a browser client without WebAssembly toolchains.

## Decision

* Client: TypeScript + Three.js (WebGL 2) built with Vite. Works on desktop and mobile browsers.
* Server: Node.js with the `ws` WebSocket library; serves the built client on the same port.
* One shared TypeScript package (`@conflict/shared`) with data, terrain, simulation, AI and protocol.
* Transport: WebSockets (amends ADR 0002, which assumed UDP). The authority model of ADR 0002 is unchanged:
  server simulation, command input, fog-filtered delta snapshots.
* Numbers: the simulation uses JavaScript doubles instead of fixed point (supersedes ADR 0003). Only the server
  simulates, so cross-platform bit-equality is not required for correctness; determinism for a given server build is
  kept (seeded integer PRNG, ordered iteration) and verified by tests. Replays will therefore be tied to the server
  version that recorded them.

## Consequences

* (+) Zero install, zero cost: play from a link, host with one container or `npm start`.
* (+) One language and one rules implementation for client, server, AI and tests.
* (−) Browser GPUs vary widely; quality presets and instancing are essential, and native-app polish (haptics,
  background behaviour) is limited.
* (−) TCP head-of-line blocking under packet loss; mitigated by small snapshots and reconnect. WebTransport can be
  added later behind the same message layer.
* The earlier C#/Unity prototype remains in the repository (`Client/ Shared/ Server/ Tools/ Tests/`) until its
  removal is approved.
