# Deployment and CI/CD

## Branching

| Branch | Purpose | Protection |
|---|---|---|
| `main` | Released / release-candidate code | Protected: PR only, CI green, 1 approval, linear history, no force push |
| `develop` | Integration branch | Protected: PR only, CI green |
| `feature/*`, `fix/*` | Work branches → PR into `develop` | — |
| `release/*` | Stabilisation before a tag on `main` | PR only |

Branch protection must be configured in GitHub settings (*Settings → Branches*): require the **CI** workflow's
jobs (`Build, lint & test (.NET)`, `Build match server image`, `Secret scan`) as status checks, and *Unity Client*
checks once the Unity licence secret is configured.

## Workflows

| Workflow | Trigger | What it does | Status |
|---|---|---|---|
| `ci.yml` | every push/PR | restore, `dotnet format` check, build (warnings = errors), tests + coverage, data validation, server Docker build, gitleaks secret scan | **IMPLEMENTED** |
| `unity.yml` | PR/push touching Client, Shared, Data | EditMode tests; development APK artifact. Skips with a notice when the licence secret is absent | **IMPLEMENTED** (needs secrets) |
| `android-release.yml` | tag `vX.Y.Z` / manual | signed AAB in the `production` environment; checks tag == `VERSION` | **IMPLEMENTED** (needs secrets); store upload **PLANNED** |
| `server-image.yml` | push to `develop`/`main`, tags | builds and pushes `ghcr.io/<owner>/conflictcore-match-server` | **IMPLEMENTED** |
| Backend build/deploy | — | API image, migration job, staged rollout | **PLANNED** (Phase 9) |
| Fleet rollout (staging/production) | — | Agones fleet update per region, canary | **PLANNED** (Phase 9/10) |
| iOS build | — | Xcode project + signing on macOS runner | **PLANNED** (needs Apple developer account) |

## Environments

| Environment | Deployed from | Approval | Contents |
|---|---|---|---|
| `development` | every `develop` push | none | dev server images, dev-commands enabled in dev builds only |
| `staging` | `release/*`, `main` | 1 reviewer | production-like; load tests, device tests |
| `production` | tags `vX.Y.Z` | required reviewers | signed store builds, production fleets |

Configure them in *Settings → Environments* with required reviewers for `staging`/`production`. Secrets that only
production may use (signing keys) are stored **in the environment**, not at repository level.

## Secrets

| Secret | Scope | Used by |
|---|---|---|
| `UNITY_LICENSE`, `UNITY_EMAIL`, `UNITY_PASSWORD` | repository | Unity test/build workflows (game-ci activation) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEYALIAS_NAME`, `ANDROID_KEYALIAS_PASS` | `production` environment | signed AAB |
| `GITHUB_TOKEN` | automatic | GHCR push |
| Backend/database/cloud credentials | per environment | PLANNED |

Rules: never commit credentials (gitleaks runs on every push; `.gitignore` blocks keystores and `.env`);
never pass secrets on command lines that are echoed; rotate on exposure. The Android upload key is backed up
outside GitHub; Play App Signing holds the app signing key.

## Versioning

* `VERSION` (repository root) is the single source of the semantic version for client and server builds.
* Client build number = workflow run number (`androidVersionCode`).
* `ProtocolInfo.Version` is bumped on any wire change; servers reject other protocol versions.
* Servers enforce `MatchServer:MinimumClientVersion` (configuration, not code) and the game-data hash.
* Releases: bump `VERSION` in a PR → merge → tag `vX.Y.Z` on `main` → release workflows.

## Match server runtime

* Container: `Server/Dockerfile` (non-root, .NET 8 runtime, UDP 7777, data baked into the image so server and data
  versions never drift).
* Configuration via environment variables (`MatchServer__Port`, `MatchServer__TickRate`, `MatchServer__MinimumClientVersion`, ...).
* One match per process; process exits when the match ends; orchestrator (Agones) recycles it.
