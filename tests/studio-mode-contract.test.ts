import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { MODE_FLAGS } from "../src/studio/automation-mode";

test("frontend MODE_FLAGS mirror the backend contract exactly", () => {
  const file = path.resolve(process.cwd(), "apps/studio-web/src/app/utils/automation-mode.ts");
  const text = readFileSync(file, "utf8");
  for (const [mode, flags] of Object.entries(MODE_FLAGS)) {
    const line = text.split("\n").find((l) => l.trim().startsWith(`${mode}:`));
    assert.ok(line, `missing ${mode}`);
    const parsed = Object.fromEntries([...line.matchAll(/(\w+): (true|false)/g)].map((m) => [m[1], m[2] === "true"]));
    assert.deepEqual(parsed, flags, mode);
  }
});
