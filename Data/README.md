# Game data

All balance and content definitions live here as JSON. **No balance value belongs in source code.**

| Path | Contents |
|---|---|
| `core/combat.json` | damage types, armor types, the full damage × armor matrix, veterancy ranks |
| `core/factions.json` | faction list and playability |
| `<faction>/weapons.json` | weapons of a faction |
| `<faction>/units.json` | unit definitions of a faction |

Rules (enforced by `Tools/ConflictCore.DataValidator`, which runs in CI):

* ids are unique `lower_snake_case`; every reference must resolve;
* unknown fields are errors (typos fail the build instead of silently using a default);
* numbers are parsed as decimals and converted to deterministic fixed-point;
* every damage type × armor type pair needs a modifier;
* units are expressed in metres, seconds, degrees and credits.

Validate locally:

```bash
dotnet run --project Tools/ConflictCore.DataValidator -- Data
```

The validator prints the **content hash**. Client and server compare it during the handshake, so a
client built with different balance data cannot join a match.

Values in this folder are a **first-pass draft** for the vertical slice (status: PARTIAL) and will be tuned
in playtests. Unit `prerequisites` and `abilities` stay empty until structures and abilities exist as validated definitions (Phase 3 / Phase 8).
