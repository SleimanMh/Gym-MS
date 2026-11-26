# Keycloak (local)

`realm-gym.json` is imported on first start by `docker compose` (`start-dev --import-realm`).
Admin console: http://localhost:8080 (admin / admin). Demo users: `owner@ironfit.test`, `owner@pulse.test` — password `dev-password`.

## How tokens map to tenants (ADR 0003)

- One realm (`gym`) for the platform; **one Organization per tenant, with the organization alias = tenant slug**.
- The `organization` mapper on `gym-admin` / `gym-portal` puts the user's organizations in the access token.
  The API uses it when the token carries exactly one organization; a user in several gyms asks for one
  with the scope `organization:<alias>` after picking the gym.
- Keycloak authenticates; **roles and permissions live in our database** (`user_roles`). On first login the API
  links the Keycloak `sub` to the existing user by verified email.
- The `gym-api` audience mapper makes access tokens valid for the API (`KEYCLOAK_AUDIENCE=gym-api`).

## Still to do (Phase 0)

1. Create the `ironfit` and `pulse` organizations and add the demo users as members (Admin console →
   Organizations), then re-export the realm here. The platform console will do this through the Keycloak
   Admin API when it creates a tenant.
2. Wire the admin app's login to Keycloak (Authorization Code + PKCE) — today it uses dev tokens.
3. Branded login theme per tenant (`infra/keycloak/themes`).
