# Backend and database

Status: **PLANNED (Phase 9)**. Protocol hooks already exist (join tickets, resume tokens, version policy).
This document fixes the architecture now so that client and match server are built against it.

## Separation of concerns

| Component | Owns | Never does |
|---|---|---|
| **Game client** | Presentation, input, intents | Decide outcomes, hold secrets, report results |
| **Match server** | One live match: simulation, validation, snapshots, reconnects, result report | Store persistent data, talk to the database |
| **Backend API** | Auth, profiles, matchmaking, lobbies, results ingestion, leaderboards, inventory, remote config | Simulate gameplay |
| **Database** | Persistent player and match data | High-frequency simulation state |

## Services (ASP.NET Core, stateless, horizontally scaled)

Starts as one deployable ("modular monolith") with clear module boundaries; modules split into services only when
load or team structure justifies it.

* **Auth** — guest accounts (device-bound credential + server-generated secret stored in the platform keystore),
  Google Sign-In and Sign in with Apple (ID token verified server-side), account linking (guest → registered,
  merge rules), short-lived JWT access tokens (15 min) + rotating refresh tokens. Rate-limited.
* **Profiles** — display name (validated, profanity-filtered), avatar, level/XP, stats, settings sync, cosmetics.
* **Matchmaking** — Quick Match queue per region/mode/MMR band in Redis; widening search window over time;
  party support later. On match found: request a server from the regional fleet allocator, then issue each player
  a **join ticket** (JWT signed with the backend's private key, 60 s expiry: match id, account id, slot, server
  address, faction). Clients connect directly to the match server.
* **Lobbies** — custom/private rooms: host, slots (player/bot/closed/spectator), team, faction, map, settings,
  ready state, 6-character private code or password (hashed). Host starts → same allocation flow.
* **Match results** — accepts results only from match servers (mTLS or per-allocation service token), validates,
  writes `matches`/`match_players`/`match_results`, updates ratings (Glicko-2) and stats in one transaction.
  Idempotent by match id.
* **Remote config** — region list with QoS beacon addresses, minimum client version, feature flags, maintenance
  messages. The client never hard-codes endpoints beyond one bootstrap config URL per environment.
* **Leaderboards, match history, inventory** — read-mostly, cacheable.

### Regions and fleet

* Regions (EU, ME, Asia, NA…) each run a Kubernetes cluster with **Agones** managing match server fleets
  (Ready buffer, autoscaling, allocation API). One match per server process (multiple processes per node).
* Client measures latency to each region's UDP QoS beacon and sends the results with its matchmaking request.
* Match servers are disposable: crash → match marked as aborted (no rating change) and reported.

## Database (PostgreSQL)

Conventions: `snake_case`, `uuid` primary keys (v7, time-ordered), `timestamptz`, soft deletes only where legally
needed, all writes through the API. Migrations are versioned SQL files (`Backend/Database/migrations/V0001__*.sql`)
applied by a dedicated migration job in the deployment pipeline **before** the new API version rolls out;
migrations are backwards compatible with the previous API version (expand → migrate → contract).

| Table | Key columns |
|---|---|
| `users` | id, created_at, status (active/banned/deleted), last_login_at |
| `auth_identities` | id, user_id → users, provider (guest/google/apple), provider_subject (unique per provider), created_at |
| `refresh_tokens` | id, user_id, token_hash, expires_at, revoked_at, device_info |
| `profiles` | user_id (PK), display_name (unique, case-insensitive), avatar_id, level, xp, region_preference, settings jsonb |
| `matches` | id, mode, map_id, region, server_version, protocol_version, data_hash, started_at, ended_at, status, replay_uri |
| `match_players` | match_id, user_id, slot, team, faction_id, is_bot, disconnects, abandoned |
| `match_results` | match_id, user_id, outcome (win/loss/draw/abandon), score, stats jsonb (units built/lost, credits) |
| `ratings` | user_id, season_id, mode, rating, deviation, volatility, games_played, updated_at |
| `statistics` | user_id, mode, wins, losses, play_time_seconds, favourite_faction, ... |
| `seasons` | id, name, starts_at, ends_at |
| `inventory` | user_id, item_id, acquired_at, source |
| `cosmetics` | id, type (banner/avatar/unit skin), rarity, metadata jsonb |
| `friends` | user_id, friend_id, status (pending/accepted), created_at |
| `blocked_users` | user_id, blocked_user_id, created_at |
| `reports` | id, reporter_id, reported_id, match_id, reason, details, status, created_at |

Cosmetics are visual only; nothing in inventory alters gameplay. Gameplay-affecting data never lives on the client.

## Security

* TLS everywhere; HSTS; JWT signed with rotating keys (JWKS endpoint for match servers to fetch the public key).
* Per-IP and per-account rate limits on auth, matchmaking and profile writes; request size limits; input validation
  on every DTO.
* Admin tooling is a separate service behind SSO and network policy — never reachable with player tokens.
* Secrets come from the cluster secret store (populated from GitHub Environments / cloud secret manager), never
  from the repository or the client.

## Privacy-respecting analytics

Events: match_started, match_completed, match_abandoned, disconnect, reconnect, crash, performance_sample
(device tier, FPS percentile, frame-time spikes), match_duration. Pseudonymous user id only; no contacts, no precise
location, no advertising identifiers; opt-out in settings; retention limits documented before launch.
