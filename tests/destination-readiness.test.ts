import test from "node:test";
import assert from "node:assert/strict";
import { dedupeLegacyWebsiteAccounts, installationToConnection } from "../src/studio/destination-readiness";

const base = { id: "i1", displayName: "GuiaTV", verifiedAt: null, lastError: null, siteId: "s1", site: { name: "GuiaTV" } };

test("active installation without verification is not connected", () => {
  const c = installationToConnection(base);
  assert.equal(c.readiness, "not_verified");
  assert.equal(c.connectionState, "not_verified");
  assert.ok(c.reason);
});

test("verified installation is ready; lastError wins", () => {
  assert.equal(installationToConnection({ ...base, verifiedAt: new Date() }).connectionState, "connected");
  assert.equal(installationToConnection({ ...base, verifiedAt: new Date(), lastError: "x" }).readiness, "error");
});

test("legacy website account is hidden when an installation covers the site", () => {
  const accounts = [
    { platform: "website", siteId: "s1" },
    { platform: "website", siteId: "s2" },
    { platform: "x", siteId: "s1" },
  ];
  assert.deepEqual(dedupeLegacyWebsiteAccounts(accounts, [{ siteId: "s1" }]), [accounts[1], accounts[2]]);
});
