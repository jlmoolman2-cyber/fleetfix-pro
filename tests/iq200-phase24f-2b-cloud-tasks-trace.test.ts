import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../next.config.js") as {
    serverExternalPackages?: string[];
    outputFileTracingIncludes?: Record<string, string[]>;
};

const UPLOAD_ROUTE = "/api/iq200/knowledge/documents/upload";
const PROTOS = "./node_modules/@google-cloud/tasks/build/protos/protos.json";
const PACKAGE_JSON = "./node_modules/@google-cloud/tasks/package.json";

test("cloud tasks and canvas stay externalized", () => {
    assert.ok(config.serverExternalPackages?.includes("@google-cloud/tasks"));
    assert.ok(config.serverExternalPackages?.includes("@napi-rs/canvas"));
});

test("upload route traces protos.json and the package manifest", () => {
    const entry = config.outputFileTracingIncludes?.[UPLOAD_ROUTE];
    assert.ok(entry, "upload route include entry is required");
    assert.ok(entry.includes(PROTOS));
    assert.ok(entry.includes(PACKAGE_JSON));
});

test("include is exact-file and scoped to the upload route only", () => {
    const includes = config.outputFileTracingIncludes || {};
    assert.deepEqual(Object.keys(includes), [UPLOAD_ROUTE]);
    assert.deepEqual([...includes[UPLOAD_ROUTE]].sort(), [PACKAGE_JSON, PROTOS].sort());
    for (const pattern of includes[UPLOAD_ROUTE]) {
        assert.equal(/[*?{}\[\]]/.test(pattern), false, `no wildcard in ${pattern}`);
    }
});

test("referenced files exist in the installed package", () => {
    assert.ok(existsSync(PROTOS));
    assert.ok(existsSync(PACKAGE_JSON));
});

test("remediation touches config only, not IQ200 orchestration or processing sources", async () => {
    const { execFileSync } = await import("node:child_process");
    const changed = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean);
    const protectedPrefixes = [
        "src/lib/iq200/knowledgeProcessing",
        "src/app/api/iq200/knowledge/documents/process/",
        "src/app/api/iq200/knowledge/documents/upload/",
        "firestore.rules",
        "storage.rules",
        "package.json",
        "package-lock.json",
    ];
    for (const path of changed) {
        assert.equal(protectedPrefixes.some((prefix) => path.startsWith(prefix)), false, path);
    }
});
