import { ForbiddenException } from "@nestjs/common";
import { parseHost, pickTenant } from "../../src/modules/tenancy/tenant-resolver";

const A = "01936a00-0000-7000-8000-00000000000a";
const B = "01936a00-0000-7000-8000-00000000000b";

describe("pickTenant", () => {
  it("returns null when nothing identifies a tenant", () => {
    expect(pickTenant({ token: null, apiKey: null, domain: null })).toBeNull();
  });

  it("follows the order token → api key → domain", () => {
    expect(pickTenant({ token: A, apiKey: A, domain: A })).toEqual({ tenantId: A, source: "token" });
    expect(pickTenant({ token: null, apiKey: B, domain: B })).toEqual({ tenantId: B, source: "api_key" });
    expect(pickTenant({ token: null, apiKey: null, domain: A })).toEqual({ tenantId: A, source: "domain" });
  });

  it("rejects requests whose sources disagree", () => {
    expect(() => pickTenant({ token: A, apiKey: B, domain: null })).toThrow(ForbiddenException);
    expect(() => pickTenant({ token: A, apiKey: null, domain: B })).toThrow(ForbiddenException);
    expect(() => pickTenant({ token: null, apiKey: A, domain: B })).toThrow(ForbiddenException);
  });
});

describe("parseHost", () => {
  it("reads the subdomain under the root domain", () => {
    expect(parseHost("ironfit.yourapp.com", "yourapp.com")).toEqual({ slug: "ironfit" });
    expect(parseHost("IronFit.YourApp.com:443", "yourapp.com")).toEqual({ slug: "ironfit" });
    expect(parseHost("ironfit.localhost:3000", "localhost")).toEqual({ slug: "ironfit" });
  });

  it("ignores the root, reserved and nested subdomains", () => {
    expect(parseHost("yourapp.com", "yourapp.com")).toBeNull();
    expect(parseHost("api.yourapp.com", "yourapp.com")).toBeNull();
    expect(parseHost("a.b.yourapp.com", "yourapp.com")).toBeNull();
    expect(parseHost(undefined, "yourapp.com")).toBeNull();
  });

  it("treats other hosts as custom domains, except in local dev", () => {
    expect(parseHost("book.ironfitgym.com", "yourapp.com")).toEqual({ customDomain: "book.ironfitgym.com" });
    expect(parseHost("127.0.0.1:4000", "localhost")).toBeNull();
    expect(parseHost("example.test", "localhost")).toBeNull();
  });
});
