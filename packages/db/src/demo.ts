/** Demo tenants written by prisma/seed.ts; also used by tests and docs. Development data only. */
/** Fixed ids so tests, Keycloak demo users and docs can refer to them. */
export const DEMO = {
  ironfit: {
    id: "01936a00-0000-7000-8000-000000000001",
    slug: "ironfit",
    name: "IronFit Gym",
    plan: "pro" as const,
    language: "en" as const,
    color: "#6D5DF6",
    publishableKey: "pk_dev_ironfit_publishable_key_0001",
    locations: [
      { id: "01936a00-0000-7000-8000-000000000101", slug: "downtown", name: "Downtown" },
      { id: "01936a00-0000-7000-8000-000000000102", slug: "marina", name: "Marina" },
    ],
    users: [
      { email: "owner@ironfit.test", firstName: "Rami", lastName: "Haddad", roles: ["owner"] },
      { email: "frontdesk@ironfit.test", firstName: "Lea", lastName: "Khoury", roles: ["front_desk"] },
      { email: "member@ironfit.test", firstName: "Omar", lastName: "Saleh", roles: ["member"] },
      { email: "coach@ironfit.test", firstName: "Nadim", lastName: "Aoun", roles: ["trainer"] },
      { email: "lara.coach@ironfit.test", firstName: "Lara", lastName: "Saab", roles: ["trainer"] },
      { email: "hiba.coach@ironfit.test", firstName: "Hiba", lastName: "Matar", roles: ["trainer"] },
      { email: "ziad.coach@ironfit.test", firstName: "Ziad", lastName: "Rizk", roles: ["trainer"] },
      { email: "accounts@ironfit.test", firstName: "Joelle", lastName: "Azar", roles: ["accountant"] },
    ],
  },
  pulse: {
    id: "01936a00-0000-7000-8000-000000000002",
    slug: "pulse",
    name: "نادي بالس",
    plan: "starter" as const,
    language: "ar" as const,
    color: "#059669",
    publishableKey: "pk_dev_pulse_publishable_key_00002",
    locations: [{ id: "01936a00-0000-7000-8000-000000000201", slug: "main", name: "الفرع الرئيسي" }],
    users: [{ email: "owner@pulse.test", firstName: "Maya", lastName: "Nasser", roles: ["owner"] }],
  },
} as const;
