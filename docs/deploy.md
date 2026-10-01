---
id: 2026-10-01-1410-deploying-on-zeroserver
title: Deploying on the ZeroServer Community Cloud
type: guide
status: accepted
domain: [deployment, operations]
projects: [river-raid-game]
ai_context: false
ai_scope:
  - global
created: 2026-10-01
updated: 2026-10-01
---

How the game goes from a commit on `main` to a public URL, and how to run it there. The reasoning, and why it is one instance and not several, is in [ADR 0004](adr/0004-single-instance-on-zeroserver.md).

## What runs where

```
push to main ─▶ GitHub Actions ─▶ verify ─▶ image (amd64 + arm64) ─▶ ghcr.io/iuriandreazza/river-raid-game:sha-<commit>
                                                                         │
                                                  zs deploy (pinned zs, API key)
                                                                         ▼
                              ZeroServer Community Cloud: one instance, SQLite on the volume "leaderboard" (/data)
                                                                         ▼
                                                      https://app-xxxx.apps.zeroserver.cc
```

- [`zs.yaml`](../zs.yaml) is the manifest: one service, one exposed port (8080), one named volume. The deploy job replaces `:latest` in it with the tag of the commit.
- [`zs.toml`](../zs.toml) pins the `zs` profile of the project to `iuripersonal`, so a deploy from this folder never runs as another account of the same machine.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) has three jobs:
  1. **verify**, on every pull request and push: lint, tests, build (which type-checks) and `pnpm audit` for high and critical advisories;
  2. **image**, on a push to `main`: builds the image for both architectures (the community nodes are a mix of amd64 and arm64) and publishes it as `sha-<commit>` and `latest`;
  3. **deploy**, on a push to `main`, only when the repository variable `DEPLOY_ENABLED` is `true`: installs the `zs` release recorded in the workflow after checking its SHA-256, logs in with the API key, points the manifest at the new image, runs `zs deploy` and checks `/api/health`.
- Actions are pinned by commit, the workflow asks for read access only (the image job also writes packages), and pull requests never see a secret.

## One-time setup

1. **Let the workflow publish packages.** Nothing to do: the job asks for `packages: write` itself.
2. **Make the image public.** The platform pulls without credentials. On GitHub: *Packages → river-raid-game → Package settings → Change visibility → Public* (after the first image was published). Or keep it private and store a token that can only read packages with `zs --profile iuripersonal registry login ghcr.io --username iuriandreazza`.
3. **Create the API key** in the ZeroServer portal, logged in as the personal account, and store it where only the workflow can read it (the command asks for the value without echoing it):
   ```bash
   gh secret set ZS_API_KEY --repo iuriandreazza/river-raid-game
   ```
4. **First deploy**, by hand, with the tag of the image you want (the repository file keeps `:latest`):
   ```bash
   mkdir /tmp/river-raid-deploy && cp zs.yaml zs.toml /tmp/river-raid-deploy && cd /tmp/river-raid-deploy
   sed -i '' 's|river-raid-game:latest|river-raid-game:sha-<commit>|' zs.yaml   # GNU sed: -i without ''
   zs --profile iuripersonal deploy
   zs --profile iuripersonal list          # the URL and the instance id, once RUNNING
   ```
5. **Switch the pipeline on**, with the address `zs list` showed:
   ```bash
   gh variable set APP_URL --body https://app-xxxx.apps.zeroserver.cc --repo iuriandreazza/river-raid-game
   gh variable set DEPLOY_ENABLED --body true --repo iuriandreazza/river-raid-game
   ```
6. **Check which address the server sees**, because the rate limit depends on it. `TRUST_PROXY` in `zs.yaml` says how many proxies stand in front of the container and append to `X-Forwarded-For`. Redeploy once with `LOG_CLIENT_ADDRESS=true`, send a request that is refused and read the log:
   ```bash
   curl -s -X POST -H 'content-type: text/plain' -d x "$APP_URL/api/sessions"      # 415, logged
   zs --profile iuripersonal logs <instance-id> | tail -3
   ```
   The `client` field has to be your own public address. If it is the address of a proxy, or `unknown`, every player shares one allowance and the value of `TRUST_PROXY` is wrong. Turn `LOG_CLIENT_ADDRESS` off again afterwards: the log is better without addresses.

## Day to day

| What | How |
| --- | --- |
| Deploy | merge to `main`; the pipeline does the rest |
| Deploy by hand | the commands of step 4, with the tag of any published image |
| Roll back | deploy the tag of the previous commit by hand; `zs --profile iuripersonal deployments river-raid` lists what was deployed and how it ended |
| Logs | `zs --profile iuripersonal logs <instance-id>` (security events are JSON lines) |
| Restart | `zs --profile iuripersonal restart <instance-id>` |
| Volumes and snapshots | `zs --profile iuripersonal volume ls <application-id>`; `volume restore <application-id>` queues a restore from the latest snapshot |
| Moderate the board | on the machine that runs the container: `docker exec <container> node dist-server/server/cli.js list` (the CLI of `zs` has no `exec`) |
| Update `zs` in the workflow | take the new release, put its `zs-linux-x64.sha256` in `ZS_SHA256` and its tag in `ZS_VERSION` |

## What to expect

- **One instance.** While the node that runs it is down, or while the platform moves the app, the board is unavailable.
- **Snapshots, not replication.** After a failover the board comes back from the latest snapshot of the volume: the scores of the minutes since then are lost. `zs volume ls` shows when the last snapshot was taken.
- **Redeploys keep the data**, because the volume is named and survives them.
- When that is not enough, the next step is the platform's managed PostgreSQL, which is replicated (see ADR 0004).
