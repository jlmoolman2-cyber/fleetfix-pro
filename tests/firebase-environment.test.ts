import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FIREBASE_PROJECT_IDS,
  resolveFirebasePublicConfig,
  resolveServerFirebaseProject,
} from "../src/lib/firebaseEnvironment.ts";

const completePublicConfig = {
  apiKey: "test-api-key",
  authDomain: "test.firebaseapp.com",
  storageBucket: "test.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:test",
};

test("staging configuration resolves only to fleetfix-pro-staging", () => {
  const config = resolveFirebasePublicConfig({
    ...completePublicConfig,
    environment: "staging",
    projectId: FIREBASE_PROJECT_IDS.staging,
  });
  assert.equal(config.projectId, "fleetfix-pro-staging");
  assert.equal(resolveServerFirebaseProject({
    FLEETFIX_ENVIRONMENT: "staging",
    GCLOUD_PROJECT: "fleetfix-pro-staging",
  }), "fleetfix-pro-staging");
});

test("production configuration resolves only to fleetfix-pro", () => {
  const config = resolveFirebasePublicConfig({
    ...completePublicConfig,
    environment: "production",
    projectId: FIREBASE_PROJECT_IDS.production,
  });
  assert.equal(config.projectId, "fleetfix-pro");
  assert.equal(resolveServerFirebaseProject({
    FLEETFIX_ENVIRONMENT: "production",
    GOOGLE_CLOUD_PROJECT: "fleetfix-pro",
  }), "fleetfix-pro");
});

test("staging rejects the production Firebase project", () => {
  assert.throws(() => resolveFirebasePublicConfig({
    ...completePublicConfig,
    environment: "staging",
    projectId: "fleetfix-pro",
  }), /staging must target 'fleetfix-pro-staging'/);
});

test("production rejects the staging Firebase project", () => {
  assert.throws(() => resolveFirebasePublicConfig({
    ...completePublicConfig,
    environment: "production",
    projectId: "fleetfix-pro-staging",
  }), /production must target 'fleetfix-pro'/);
});

test("missing required public Firebase variables fail safely", () => {
  assert.throws(() => resolveFirebasePublicConfig({
    environment: "staging",
    projectId: "fleetfix-pro-staging",
  }), /missing required public Firebase configuration/);
});

test("conflicting server project sources fail safely", () => {
  assert.throws(() => resolveServerFirebaseProject({
    FLEETFIX_ENVIRONMENT: "staging",
    GCLOUD_PROJECT: "fleetfix-pro-staging",
    FIREBASE_CONFIG: JSON.stringify({ projectId: "fleetfix-pro" }),
  }), /staging must target 'fleetfix-pro-staging'/);
});

test("the primary initializer contains no literal Firebase project configuration", async () => {
  const source = await readFile(new URL("../src/lib/firebaseClient.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fleetfix-pro/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]+/);
  for (const variable of [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ]) assert.match(source, new RegExp(`process\\.env\\.${variable}`));
});
