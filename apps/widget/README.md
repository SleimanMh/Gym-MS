# Booking widget (Phase 1)

Web Components (Lit) with Shadow DOM, one small bundle (< ~60 KB gzipped), served from the CDN at
`/widget/v1.js`. Components: `<gym-schedule>`, `<gym-plans>`, `<gym-lead-form>`, member login, "my bookings".
Uses the gym's publishable API key (`x-api-key`) and only works on the gym's allowed origins.
Already available in the API: `GET /v1/public/tenant` (branding). See PLAN.md section 10.
