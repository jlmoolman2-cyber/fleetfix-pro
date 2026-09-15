import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const technician = () => source("src/app/api/iq200/jobs/[jobId]/known-fixes/route.ts");
const admin = () => source("src/app/api/iq200/known-fixes/route.ts");
const adminById = () => source("src/app/api/iq200/known-fixes/[id]/route.ts");

const noStorePattern = /"cache-control"\s*:\s*"no-store"/;
const legacyCachePattern = /Pragma|Expires/i;

test("P16C.1 technician Known Fix GET remains explicit no-store", () => {
    assert.match(technician(), noStorePattern);
    assert.doesNotMatch(technician(), legacyCachePattern);
});

test("P16C.2 admin Known Fix GET remains explicit no-store", () => {
    assert.match(admin(), /GET\s*\([^)]*\)[\s\S]*"cache-control"\s*:\s*"no-store"/);
    assert.doesNotMatch(admin(), legacyCachePattern);
});

test("P16C.3 admin Known Fix POST success is explicit no-store", () => {
    assert.match(admin(), /POST\s*\([^)]*\)[\s\S]*"cache-control"\s*:\s*"no-store"/);
    assert.match(admin(), /status:\s*201/);
    assert.doesNotMatch(admin(), legacyCachePattern);
});

test("P16C.4 admin Known Fix PATCH update success is explicit no-store", () => {
    assert.match(adminById(), /PATCH\s*\([^)]*\)[\s\S]*"cache-control"\s*:\s*"no-store"/);
    assert.doesNotMatch(adminById(), legacyCachePattern);
});

test("P16C.5 admin Known Fix lifecycle/status success is explicit no-store", () => {
    const patchSection = adminById().slice(adminById().indexOf("export async function PATCH"));
    assert.match(patchSection, /body\?\.action\s*\?\s*await\s*changeKnownFixStatus/);
    assert.match(patchSection, /Response\.json\([\s\S]*\{\s*headers\s*:\s*\{\s*"cache-control"\s*:\s*"no-store"\s*\}\s*\}/);
    assert.doesNotMatch(patchSection, legacyCachePattern);
});

test("P16C.6 Known Fix GET error response is explicit no-store", () => {
    assert.match(admin(), /catch\s*\(error\)[\s\S]*safeServerErrorResponse\(error\)[\s\S]*"cache-control"\s*:\s*"no-store"/);
    assert.doesNotMatch(admin(), legacyCachePattern);
});

test("P16C.7 Known Fix POST error response is explicit no-store", () => {
    const postSection = admin().slice(admin().indexOf("export async function POST"));
    assert.match(postSection, /catch\s*\(error\)/);
    assert.match(postSection, /const\s+response\s*=\s*safeServerErrorResponse\(error\);/);
    assert.match(postSection, /response\.headers\.set\s*\(\s*"cache-control"\s*,\s*"no-store"\s*\);/);
    assert.match(postSection, /return\s+response;/);
    assert.doesNotMatch(postSection, legacyCachePattern);
});

test("P16C.8 Known Fix PATCH error response is explicit no-store", () => {
    const patchSection = adminById().slice(adminById().indexOf("export async function PATCH"));
    assert.match(patchSection, /catch\s*\(error\)/);
    assert.match(patchSection, /const\s+response\s*=\s*safeServerErrorResponse\(error\);/);
    assert.match(patchSection, /response\.headers\.set\s*\(\s*"cache-control"\s*,\s*"no-store"\s*\);/);
    assert.match(patchSection, /return\s+response;/);
    assert.doesNotMatch(patchSection, legacyCachePattern);
});

test("P16C.9 status behavior remains unchanged", () => {
    assert.match(admin(), /status:\s*201/);
    assert.match(adminById(), /body\?\.action\s*\?\s*await\s*changeKnownFixStatus/);
});

test("P16C.10 no service/core or Firestore rules change", () => {
    assert.doesNotMatch(source("src/lib/iq200/knownFixService.ts"), /cache-control|no-store/i);
    assert.doesNotMatch(source("src/lib/iq200/knownFixCore.ts"), /cache-control|no-store/i);
    assert.doesNotMatch(source("firestore.rules"), /cache-control|no-store/i);
});

test("P16C.11 no provider/reasoning behavior introduced", () => {
    assert.doesNotMatch(source("src/lib/iq200/reasoningService.ts"), /cache-control|no-store/i);
    assert.doesNotMatch(source("src/lib/iq200/hostedReasoningService.ts"), /cache-control|no-store/i);
});
