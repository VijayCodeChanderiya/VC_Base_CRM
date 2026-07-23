import "dotenv/config";

const BASE = `http://localhost:${process.env.PORT ?? 4000}`;

let failures = 0;

function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json: json as never };
}

async function main() {
  // 1. Log in as super admin (platform view — no org selected)
  const superLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: "superadmin@alphatech.local", password: process.env.SUPERADMIN_PASSWORD },
  });
  if (superLogin.status !== 200) {
    console.error("Could not log in as super admin — set SUPERADMIN_PASSWORD env var. Aborting.");
    process.exit(1);
  }
  const superToken = superLogin.json.token as string;

  // 2. Create a throwaway second organization
  const orgSlug = `isolation-test-${Date.now()}`;
  const createOrg = await api("/api/organizations", {
    method: "POST",
    token: superToken,
    body: { name: "Isolation Test Org", slug: orgSlug },
  });
  check("create second organization", createOrg.status === 201);
  const orgB = createOrg.json.id as string;

  // 3. Create a STAFF user inside org B
  const createUserB = await api(`/api/organizations/${orgB}/users`, {
    method: "POST",
    token: superToken,
    body: { name: "Org B Staff", email: `orgb-${Date.now()}@isolation-test.local`, password: "TestPass@123", role: "STAFF" },
  });
  check("create user in org B", createUserB.status === 201);
  const orgBEmail = createUserB.json.email;

  const loginB = await api("/api/auth/login", { method: "POST", body: { email: orgBEmail, password: "TestPass@123" } });
  check("login as org B user", loginB.status === 200);
  const tokenB = loginB.json.token as string;

  // 4. As the seeded org A admin, create a customer (org A = alphatech-default)
  const loginA = await api("/api/auth/login", {
    method: "POST",
    body: { email: "admin@alphatech.local", password: "Admin@123" },
  });
  check("login as org A admin", loginA.status === 200);
  const tokenA = loginA.json.token as string;

  const rand = Math.floor(Math.random() * 1_000_000_000);
  const createCustomerA = await api("/api/customers", {
    method: "POST",
    token: tokenA,
    body: {
      name: "Org A Secret Customer",
      email: `org-a-secret-${rand}@isolation-test.local`,
      phone: `9${rand}`.slice(0, 10),
      username: `orgasecret${rand}`,
      password: "TestPass@123",
    },
  });
  check("create customer in org A", createCustomerA.status === 201);
  const customerAId = createCustomerA.json.id as string | undefined;

  if (customerAId) {
    // 5. As org B staff, try to fetch org A's customer directly by id — must 404
    const directFetch = await api(`/api/customers/${customerAId}`, { token: tokenB });
    check("org B cannot fetch org A's customer by id (expect 404)", directFetch.status === 404);

    // 6. As org B staff, list customers — org A's customer must not appear
    const listB = await api("/api/customers?pageSize=100", { token: tokenB });
    const items = (listB.json.items ?? listB.json) as Array<{ id: string }>;
    check("org B customer list does not contain org A's customer", !items.some((c) => c.id === customerAId));

    // 7. As org B staff, try to update org A's customer — must fail
    const updateAttempt = await api(`/api/customers/${customerAId}`, {
      method: "PATCH",
      token: tokenB,
      body: { name: "Hacked" },
    });
    check("org B cannot update org A's customer (expect 404)", updateAttempt.status === 404);
  }

  console.log(failures === 0 ? "\nAll tenant isolation checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
