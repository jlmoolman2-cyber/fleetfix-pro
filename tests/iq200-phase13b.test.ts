import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = (path: string) => readFileSync(path, "utf8");

// Phase 13B — Privacy Boundary Tests
// These tests prove that sensitive internal fields do not leak to the browser

test("P13B.1 companyId does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  // Verify companyId is NOT in the return object
  assert.doesNotMatch(contextFunction, /companyId:\s*context\.companyId/);

  // Verify the return object structure
  assert.match(contextFunction, /return\s*{\s*job:/);
  assert.match(contextFunction, /currentUser:\s*{\s*name:/);
});

test("P13B.2 currentUser.id does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  // Verify currentUser.id is NOT in the return object
  assert.doesNotMatch(contextFunction, /currentUser:\s*{\s*id:/);
  assert.doesNotMatch(contextFunction, /id:\s*context\.uid/);

  // Verify currentUser.name is still present
  assert.match(contextFunction, /currentUser:\s*{\s*name:/);
});

test("P13B.3 vehicle.id does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  // Verify vehicle.id is NOT in the return object
  assert.doesNotMatch(contextFunction, /vehicle:\s*{\s*id:/);
  assert.doesNotMatch(contextFunction, /id:\s*text\(vehicleData\.id/);

  // Verify other vehicle fields are still present
  assert.match(contextFunction, /registrationNumber:/);
  assert.match(contextFunction, /fleetNumber:/);
  assert.match(contextFunction, /make:/);
  assert.match(contextFunction, /model:/);
});

test("P13B.4 bookingDateTime does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  // Verify bookingDateTime is NOT in the return object
  assert.doesNotMatch(contextFunction, /bookingDateTime:/);
});

test("P13B.5 assignedTechnicians does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  // Verify assignedTechnicians is NOT in the return object
  assert.doesNotMatch(contextFunction, /assignedTechnicians:/);
});

test("P13B.6 previousJobNumber does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  assert.doesNotMatch(contextFunction, /previousJobNumber:/);
});

test("P13B.7 statusHistory does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  assert.doesNotMatch(contextFunction, /statusHistory:/);
});

test("P13B.8 note.id does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );

  const notesMapping = contextFunction.slice(
    contextFunction.indexOf("notes: notesSnapshot.docs.map"),
    contextFunction.indexOf("diagnostics: diagnosticEntries")
  );

  assert.doesNotMatch(notesMapping, /id:\s*doc\.id/);
  assert.match(notesMapping, /text:/);
  assert.match(notesMapping, /author:/);
  assert.match(notesMapping, /createdAt:/);
});

test("P13B.9 diagnostic.id does not leak to technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const diagnosticFunction = service.slice(
    service.indexOf("function diagnosticEntry"),
    service.indexOf("function sessionEntry")
  );

  assert.doesNotMatch(diagnosticFunction, /id:\s*text\(data\.id\)/);
  assert.match(diagnosticFunction, /code:/);
  assert.match(diagnosticFunction, /description:/);
  assert.match(diagnosticFunction, /status:/);
  assert.match(diagnosticFunction, /source:/);
  assert.match(diagnosticFunction, /value:/);
  assert.match(diagnosticFunction, /recordedAt:/);
});

test("P13B.10 session.updatedAt does not leak to technician session DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const sessionFunction = service.slice(
    service.indexOf("function sessionEntry"),
    service.indexOf("function validateJobId")
  );

  assert.doesNotMatch(sessionFunction, /updatedAt:\s*dateValue/);
  assert.match(sessionFunction, /id,/);
  assert.match(sessionFunction, /initialQuestion:/);
  assert.match(sessionFunction, /state:/);
  assert.match(sessionFunction, /responseStatus:/);
  assert.match(sessionFunction, /createdAt:/);
});

test("P13B.11 Known Fix approvedAt does not leak to technician DTO", () => {
  const service = source("src/lib/iq200/knownFixService.ts");
  const technicianDtoFunction = service.slice(
    service.indexOf("function technicianDto"),
    service.indexOf("export async function searchKnownFixesForJob")
  );

  assert.doesNotMatch(technicianDtoFunction, /approvedAt:/);
  assert.match(technicianDtoFunction, /id:/);
  assert.match(technicianDtoFunction, /title:/);
  assert.match(technicianDtoFunction, /revision:/);
  assert.match(technicianDtoFunction, /relevanceScore:/);
  assert.match(technicianDtoFunction, /relevanceReasons:/);
});

test("P13B.12 reasoning browser response interactionId does not leak", () => {
  const service = source("src/lib/iq200/reasoningService.ts");

  assert.doesNotMatch(service, /return\s*{\s*featureState:\s*"TEST_ENABLED"[^}]*interactionId:/);

  const hostedPath = service.slice(
    service.indexOf("if(hostedExecutionAllowed(hostedConfig))"),
    service.indexOf("if(!reasoningEnabled())")
  );

  assert.match(hostedPath, /const\s*{\s*interactionId/);
  assert.match(hostedPath, /\.\.\.safeOutcome\s*}/);
  assert.match(hostedPath, /return\s*{\s*featureState:\s*safeOutcome\.featureState/);
});


test("P13B.13 required job fields remain in technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );
  assert.match(contextFunction, /id:\s*snapshot\.id/);
  assert.match(contextFunction, /number:/);
  assert.match(contextFunction, /status:/);
  assert.match(contextFunction, /description:/);
  assert.match(contextFunction, /location:/);
  assert.match(contextFunction, /faultCodes:/);
  assert.match(contextFunction, /vehicle:/);
  assert.match(contextFunction, /notes:/);
  assert.match(contextFunction, /diagnostics:/);
});

test("P13B.14 required vehicle operational fields remain", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );
  const vehicleSection = contextFunction.slice(
    contextFunction.indexOf("vehicle: {"),
    contextFunction.indexOf("description:")
  );
  assert.match(vehicleSection, /registrationNumber:/);
  assert.match(vehicleSection, /fleetNumber:/);
  assert.match(vehicleSection, /make:/);
  assert.match(vehicleSection, /model:/);
  assert.match(vehicleSection, /type:/);
  assert.match(vehicleSection, /engineFamily:/);
});

test("P13B.15 required note fields remain", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );
  const notesMapping = contextFunction.slice(
    contextFunction.indexOf("notes: notesSnapshot.docs.map"),
    contextFunction.indexOf("diagnostics: diagnosticEntries")
  );
  assert.match(notesMapping, /text:/);
  assert.match(notesMapping, /author:/);
  assert.match(notesMapping, /createdAt:/);
});

test("P13B.16 required diagnostic fields remain", () => {
  const service = source("src/lib/iq200/service.ts");
  const diagnosticFunction = service.slice(
    service.indexOf("function diagnosticEntry"),
    service.indexOf("function sessionEntry")
  );
  assert.match(diagnosticFunction, /code:/);
  assert.match(diagnosticFunction, /description:/);
  assert.match(diagnosticFunction, /status:/);
  assert.match(diagnosticFunction, /source:/);
  assert.match(diagnosticFunction, /value:/);
  assert.match(diagnosticFunction, /recordedAt:/);
});

test("P13B.17 currentUser.name remains in technician context DTO", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );
  assert.match(contextFunction, /currentUser:\s*{\s*name:/);
});

test("P13B.18 required session fields remain", () => {
  const service = source("src/lib/iq200/service.ts");
  const sessionFunction = service.slice(
    service.indexOf("function sessionEntry"),
    service.indexOf("function validateJobId")
  );
  assert.match(sessionFunction, /id,/);
  assert.match(sessionFunction, /initialQuestion:/);
  assert.match(sessionFunction, /state:/);
  assert.match(sessionFunction, /responseStatus:/);
  assert.match(sessionFunction, /createdAt:/);
});

test("P13B.19 required Known Fix operational fields remain", () => {
  const service = source("src/lib/iq200/knownFixService.ts");
  const technicianDtoFunction = service.slice(
    service.indexOf("function technicianDto"),
    service.indexOf("export async function searchKnownFixesForJob")
  );
  assert.match(technicianDtoFunction, /id:/);
  assert.match(technicianDtoFunction, /title:/);
  assert.match(technicianDtoFunction, /category:/);
  assert.match(technicianDtoFunction, /vehicleMake:/);
  assert.match(technicianDtoFunction, /vehicleModel:/);
  assert.match(technicianDtoFunction, /vehicleType:/);
  assert.match(technicianDtoFunction, /engineFamily:/);
  assert.match(technicianDtoFunction, /systemComponent:/);
  assert.match(technicianDtoFunction, /symptoms:/);
  assert.match(technicianDtoFunction, /faultCodes:/);
  assert.match(technicianDtoFunction, /diagnosticProcedure:/);
  assert.match(technicianDtoFunction, /expectedValues:/);
  assert.match(technicianDtoFunction, /findingsConditions:/);
  assert.match(technicianDtoFunction, /repairProcedure:/);
  assert.match(technicianDtoFunction, /requiredTools:/);
  assert.match(technicianDtoFunction, /partsComponents:/);
  assert.match(technicianDtoFunction, /safetyWarnings:/);
  assert.match(technicianDtoFunction, /technicalCautions:/);
  assert.match(technicianDtoFunction, /notes:/);
  assert.match(technicianDtoFunction, /sourceReference:/);
  assert.match(technicianDtoFunction, /revision:/);
  assert.match(technicianDtoFunction, /relevanceScore:/);
  assert.match(technicianDtoFunction, /relevanceReasons:/);
});

test("P13B.20 reasoning response featureState/message/response remain", () => {
  const service = source("src/lib/iq200/reasoningService.ts");
  assert.match(service, /featureState:\s*"TEST_ENABLED"/);
  assert.match(service, /message:\s*"Deterministic test reasoning generated\."/);
  assert.match(service, /response\s*}/);
  const hostedPath = service.slice(
    service.indexOf("if(hostedExecutionAllowed(hostedConfig))"),
    service.indexOf("if(!reasoningEnabled())")
  );
  assert.match(hostedPath, /featureState:\s*safeOutcome\.featureState/);
  assert.match(hostedPath, /message:\s*safeOutcome\.message/);
  assert.match(hostedPath, /response:\s*safeOutcome\.response/);
});


test("P13B.21 client types match hardened DTO shapes", () => {
  const page = source("src/app/jobs/[id]/iq200/page.tsx");
  const contextType = page.slice(
    page.indexOf("type Context ="),
    page.indexOf("type Session =")
  );
  assert.doesNotMatch(contextType, /companyId:/);
  assert.doesNotMatch(contextType, /currentUser:\s*{\s*id:/);
  assert.doesNotMatch(contextType, /vehicle:\s*{\s*id:/);
  assert.doesNotMatch(contextType, /notes:\s*Array<{\s*id:/);
  assert.doesNotMatch(contextType, /diagnostics:\s*Array<{\s*id:/);
  assert.match(contextType, /job:\s*{/);
  assert.match(contextType, /currentUser:\s*{\s*name:/);
  const sessionType = page.slice(
    page.indexOf("type Session ="),
    page.indexOf("type HistoricalResult =")
  );
  assert.doesNotMatch(sessionType, /updatedAt:/);
  const knownFixType = page.slice(
    page.indexOf("type KnownFix ="),
    page.indexOf("type ReasoningResponse=")
  );
  assert.doesNotMatch(knownFixType, /approvedAt:/);
});

test("P13B.22 server-side authorization remains intact", () => {
  const service = source("src/lib/iq200/service.ts");
  assert.match(service, /companies\/\$\{context\.companyId\}/);
  assert.match(service, /requireIQ200Access\(context\)/);
  assert.match(service, /companyId:\s*context\.companyId/);
});

test("P13B.23 server-side historical matching logic preserved", () => {
  const historyService = source("src/lib/iq200/historyService.ts");
  assert.match(historyService, /vehicleId:/);
  assert.match(historyService, /date:\s*iso\(data\.completedAt.*bookingDateTime/);
  const historyCore = source("src/lib/iq200/historyCore.ts");
  assert.match(historyCore, /previousJobNumber/);
});

test("P13B.24 server-side session ordering preserved", () => {
  const service = source("src/lib/iq200/service.ts");
  assert.match(service, /orderBy\("updatedAt",\s*"desc"\)/);
});

test("P13B.25 server-side interaction persistence preserved", () => {
  const service = source("src/lib/iq200/reasoningService.ts");

  // Verify interaction document is created
  assert.match(service, /batch\.create\(interaction/);

  // Verify session state is updated after interaction
  assert.match(service, /batch\.update\(sessionRef/);

  // Verify batch commit occurs
  assert.match(service, /await batch\.commit\(\)/);

  // Verify interactionId is NOT returned in browser response
  const testEnabledReturn = service.slice(
    service.indexOf('return{featureState:"TEST_ENABLED"'),
    service.indexOf('return{featureState:"TEST_ENABLED"') + 150
  );
  assert.doesNotMatch(testEnabledReturn, /interactionId/);
});

test("P13B.26 no sensitive sentinel values in serialized DTO output", () => {
  const service = source("src/lib/iq200/service.ts");
  const contextFunction = service.slice(
    service.indexOf("export async function getIQ200JobContext"),
    service.indexOf("export async function listIQ200Sessions")
  );
  assert.doesNotMatch(contextFunction, /return\s*{\s*\.\.\.(job|data|snapshot)/);
  assert.match(contextFunction, /return\s*{\s*job:\s*{/);
});

test("P13B.27 safety constants remain unchanged", () => {
  const hostedConfig = source("src/lib/iq200/hostedConfig.ts");
  assert.match(hostedConfig, /IQ200_HOSTED_COMMISSIONING_ARMED\s*=\s*false/);
  assert.match(hostedConfig, /IQ200_PHASE7_COMMISSIONING_ARMED\s*=\s*false/);
  const hostedService = source("src/lib/iq200/hostedReasoningService.ts");
  assert.match(hostedService, /ledger:\s*"phase7_retry5"/);
  assert.match(hostedService, /idempotencyNamespace:\s*"phase7_retry5"/);
  assert.doesNotMatch(hostedService, /retry6/i);
});
