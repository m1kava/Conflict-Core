# Architecture decision records

| # | Decision | Status |
|---|---|---|
| [0001](0001-engine-unity.md) | Unity 6 LTS + URP for the client | Superseded by 0005 |
| [0002](0002-network-model.md) | Server-authoritative simulation with fog-filtered delta snapshots | Accepted (transport amended by 0005) |
| [0003](0003-fixed-point-simulation.md) | Deterministic fixed-point simulation | Superseded by 0005 |
| [0004](0004-shared-csharp-code.md) | One C# codebase shared by Unity, server and tools | Superseded by 0005 |
| [0005](0005-browser-typescript.md) | Browser-first TypeScript stack (Three.js, Node.js, WebSockets) | Accepted |

New ADRs: copy the structure (Context, Decision, Alternatives, Consequences), number sequentially, never rewrite an
accepted ADR — supersede it with a new one.
