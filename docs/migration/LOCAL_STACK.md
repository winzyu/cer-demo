# Local stack

How to run the CER dashboard and server locally without the credentials this machine does not hold.
Verified end to end on 2026-09-21.

## Shape

```
browser -> user-dashboard :3000 -> clean-earth-rovers-server :5001 -> live cer-api (Cloud Run)
                                        cer-demo :8010 -> Fireworks + device API
```

The only real credentials involved are the two already in `cer-demo/.env`: `DEVICE_API_TOKEN` for pod data and `FIREWORKS_API_KEY` for the LLM.
Everything else the upstream server normally needs (Firestore, Stripe, Gemini, OpenAI, nodemailer) is avoided by forwarding those requests to the deployed API, which holds its own credentials and does its own authentication.

Both upstream repositories must be on branch `local`, which is the cleaned branch; `main` and `develop` still carry the malware and must never be built or tested.

## The dev passthrough

`clean-earth-rovers-server/src/middleware/devUpstreamProxy.ts` forwards any request it is not told to serve locally to `DEV_UPSTREAM_BASE_URL`, carrying the caller's `Authorization` header unchanged.
It is mounted on `/api/v1` and `/auth`, ahead of the JSON body parser so bodies pass through as received, and it returns `null` (mounting nothing) when `NODE_ENV=production` or when `DEV_UPSTREAM_BASE_URL` is unset.

`DEV_LOCAL_PATHS` is the switch for local development: a comma-separated list of path prefixes this server answers itself.
Empty means everything is proxied.
To develop an endpoint locally, add its prefix, for example `DEV_LOCAL_PATHS=/api/v1/water`, and restart.

Authentication is the catch.
Tokens are minted by the live API with a secret this machine does not have, so `authenticateToken` rejects them on any route served locally.
Proxied routes are unaffected because the live API verifies them.
A route moved into `DEV_LOCAL_PATHS` therefore needs one of: the real `ACCESS_TOKEN_SECRET`, a dev-only unverified decode gated behind an explicit flag, or a test token minted locally with the dev secret in `.env`.

## Env files

Both are git-ignored and written with mode 600.

`clean-earth-rovers-server/.env`: `NODE_ENV=development`, `PORT=5001`, `DB_ENVIRONMENT=main`, `DEV_BASE_URL`, `DEV_FRONTEND_URL`, a locally generated `ACCESS_TOKEN_SECRET`, `DEV_UPSTREAM_BASE_URL`, `DEV_LOCAL_PATHS`, and placeholder values for `NODEMAILER_APP_EMAIL`, `NODEMAILER_APP_PASSWORD` and `STRIPE_SECRET_KEY`.
The placeholders exist only because those services are constructed at module import; see the defect note below.

`user-dashboard/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:5001` and `API_PROXY_TARGET=http://localhost:5001`.
`NEXT_PUBLIC_GOOGLE_MAP_API` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are absent, so maps render blank and billing screens fail; nothing else depends on them.

## Running it

```bash
cd clean-earth-rovers-server && npm run dev     # :5001
cd user-dashboard && yarn dev -p 3000           # :3000
```

Node 24.21 and npm 11.19 work for both; yarn 1.22 comes from `corepack enable`.
The dashboard runs Next 13.5.11.
Ports 8010 (cer-demo) and 8000 stay as they are; never kill 8000.

Smoke test, which is a live read:

```bash
TOKEN=$(grep -m1 '^DEVICE_API_TOKEN=' cer-demo/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/v1/devices     # 5 pods
curl -s -L -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/devices  # same, through the dashboard
```

Unauthenticated, `/api/v1/devices` returns 401 from the live API, and `/api/v1/` returns its placeholder message with 200.

## Defect found while setting this up

`src/routes/userRoutes.ts` constructs `UserController` at module import, which constructs `UserService` and then `EmailService`, whose constructor throws when `NODEMAILER_APP_EMAIL` or `NODEMAILER_APP_PASSWORD` is missing.
The whole server therefore fails to boot over credentials that only the password-reset mail path needs.
`PaymentService` does the same with `STRIPE_SECRET_KEY`, though it is constructed lazily enough not to block boot.
The fix is to construct these services on first use rather than at import; the placeholders above are the workaround, not the answer.

## Serving Gilligan locally (roadmap R3)

To take the three Gilligan routes away from the live API and serve them from the local server, set `DEV_LOCAL_PATHS=/api/v1/gilligan` and restart.
Everything else keeps proxying, so pods, water data, organizations and login still come from live.

The dashboard calls, from `user-dashboard/src/app/services/gilligan.js` through the `/api/v1` axios instance:

- `GET /gilligan/question?question=<text>&chatId=<uuid>`
- `GET /gilligan/chats`
- `GET /gilligan/check-quota`

cer-demo answers on `POST /api/v1/chat` with `{ query, history?, device?, stream?, retrieval? }` and returns `{ answer, model, citations, usage, tool_calls?, tool_round_cap_reached? }`.
It reads the caller's bearer token for the sensor tool and applies its own quota guard.
The shapes do not line up, which is what the R1 service contract in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md) §3 exists to settle.

Note that locally served Gilligan routes hit the authentication boundary described above, because the live token cannot be verified here.
