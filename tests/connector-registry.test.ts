import test from "node:test";
import assert from "node:assert/strict";
import {
  connectorCapabilityView,
  getConnectorDescriptor,
  listConnectorDescriptors,
} from "../src/studio/connectors/registry";

test("connector registry exposes capability-driven descriptors", () => {
  const descriptors = listConnectorDescriptors();
  assert.ok(descriptors.length >= 4, "registry must contain at least website + social connectors");

  const websiteConnectors = descriptors.filter((descriptor) => descriptor.kind === "website");
  assert.ok(websiteConnectors.length >= 2, "generic website connectors registered");

  for (const descriptor of descriptors) {
    assert.ok(descriptor.id, "descriptor has an id");
    assert.ok(descriptor.configSchemaVersion >= 1, "config schema is versioned");
    assert.equal(descriptor.configSchema.type, "object");
    assert.equal(descriptor.configSchema.version, descriptor.configSchemaVersion);
    assert.ok(descriptor.capabilities.length > 0, "descriptor lists capabilities");
    for (const method of descriptor.authMethods) {
      assert.equal(typeof method.available, "boolean");
      assert.ok(Array.isArray(method.requiredFields));
    }
  }
});

test("capability view renders UI metadata without hard-coded brands", () => {
  const view = connectorCapabilityView();
  const kinds = view.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["website", "instagram", "x"]);
  for (const kind of view) {
    for (const connector of kind.connectors) {
      assert.ok(connector.name);
      assert.ok(Array.isArray(connector.capabilities));
      // Availability must be honest: a connector without an available OAuth
      // method reports not ready plus a human hint.
      if (!connector.ready) {
        assert.ok(connector.actionHint, "unready connectors explain why");
      }
    }
  }
  const raw = JSON.stringify(view);
  assert.ok(!/tecnoria|guiatv|talkaris/i.test(raw), "capability metadata must not hard-code brands");
});

test("website connectors require a destination URL; social connectors do not", () => {
  for (const descriptor of listConnectorDescriptors()) {
    if (descriptor.kind === "website") {
      assert.equal(descriptor.requiresDestinationUrl, true);
    } else {
      assert.equal(descriptor.requiresDestinationUrl, false);
    }
  }
});

test("unknown connector ids resolve to null", () => {
  assert.equal(getConnectorDescriptor("does_not_exist"), null);
});
