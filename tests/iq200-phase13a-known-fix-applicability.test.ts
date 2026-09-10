import assert from "node:assert/strict";
import test from "node:test";
import { knownFixMatch, meaningfulKnownFixTokens } from "../src/lib/iq200/knownFixCore.ts";

const defaultSearch = { q: "", faultCode: "", component: "", limit: 10 };

test("N1: air brakes vs IVECO/P0087/low fuel pressure - no meaningful component overlap", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Air brake valve replacement", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "air brakes", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Air brakes component should not match fuel pressure job");
});

test("N2: same IVECO make but unrelated air-brake issue vs fuel-pressure complaint", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Air brake valve replacement", vehicleMake: "Iveco", vehicleModel: "Daily", vehicleType: "", engineFamily: "", systemComponent: "air brakes", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Vehicle compatibility alone should not qualify unrelated system");
});

test("N3: generic workshop vocabulary only", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "General vehicle inspection", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "Check vehicle system for fault repair problem", repairProcedure: "Replace defective parts" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Generic workshop vocabulary should not establish eligibility");
});

test("N4: generic component overlap only on filtered term 'system'", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: [], text: "engine management system problem" };
  const fix = { title: "Engine control system diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "engine control system", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const meaningfulComponent = meaningfulKnownFixTokens("engine control system");
  const meaningfulJob = meaningfulKnownFixTokens("engine management system problem");
  const overlap = meaningfulComponent.filter(t => meaningfulJob.includes(t));
  assert.equal(overlap.length, 0, "Only filtered generic terms should overlap");
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Generic component overlap should not qualify");
});


test("N6: P0088 vs P0087 with no other technical evidence", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Fuel system diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: ["P0088"], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Unrelated fault code should not match without other evidence");
});

test("N7: incompatible Mercedes applicability vs IVECO job", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Fuel system check", vehicleMake: "Mercedes", vehicleModel: "Actros", vehicleType: "", engineFamily: "", systemComponent: "fuel system", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Incompatible vehicle make should be rejected");
});

test("N8: unrelated otherApplicability", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "Brake system service", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "", otherApplicability: "for brake systems only" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Unrelated otherApplicability should not qualify");
});

test("N9: pure generic fix with no evidence", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "General check", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Pure generic fix with no evidence should be rejected");
});

test("P1: fuel system vs low fuel pressure - meaningful component overlap", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "Fuel system diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "fuel system", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Fuel system should match fuel pressure job");
  assert.ok(result.score > 0, "Score should be positive");
  assert.ok(result.reasons.some(r => r.includes("Component/system")), "Should include component reason");
});

test("P2: air system vs low air pressure - meaningful component overlap", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "low air pressure" };
  const fix = { title: "Air system diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "air system", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Air system should match air pressure job");
  assert.ok(result.score > 0);
});

test("P3: exact P0087 fault code match", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Fuel pressure diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: ["P0087"], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Exact fault code should match");
  assert.ok(result.score >= 120, "Fault code match should score at least 120");
  assert.ok(result.reasons.some(r => r.includes("Exact fault code: P0087")));
});

test("P4: explicit component search 'fuel' vs 'fuel system'", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "" };
  const fix = { title: "Fuel system check", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "fuel system", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const search = { q: "", faultCode: "", component: "fuel", limit: 10 };
  const result = knownFixMatch(job, fix, search);
  assert.ok(result, "Explicit component search should qualify fix");
  assert.ok(result.score > 0);
});

test("P5: case/spacing normalized P0087 match", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "" };
  const fix = { title: "Fuel pressure check", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: ["p0087"], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Case-normalized fault code should match");
  assert.ok(result.reasons.some(r => r.includes("P0087")));
});


test("P7: generic fix with genuine technical text relationship", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "fuel rail diagnostic needed" };
  const fix = { title: "Fuel rail diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "Inspect fuel rail and delivery", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Genuine text overlap should qualify generic fix");
  assert.ok(result.score > 0);
});

test("P8: DC13-compatible relevant technical fix", () => {
  const job = { make: "scania", model: "r500", vehicleType: "truck", engineFamily: "dc13", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "DC13 fuel pump check", vehicleMake: "Scania", vehicleModel: "R500", vehicleType: "Truck", engineFamily: "DC13", systemComponent: "fuel pump", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "DC13-compatible fix should match with component overlap");
  assert.ok(result.score >= 105, "Should include engine family and component scores");
});

test("P9: multiple supporting technical signals", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Fuel system diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "fuel system", faultCodes: ["P0087"], symptoms: ["low pressure"], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Multiple evidence signals should qualify");
  assert.ok(result.score >= 155, "Should include fault code and component scores");
});

test("P10: explicit technician query 'fuel' vs fuel-system fix", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "" };
  const fix = { title: "Fuel system check", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "Check fuel delivery", repairProcedure: "" };
  const search = { q: "fuel", faultCode: "", component: "", limit: 10 };
  const result = knownFixMatch(job, fix, search);
  assert.ok(result, "Explicit technician query should qualify fix");
  assert.ok(result.score > 0);
});

test("P11: meaningful otherApplicability relationship", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "high mileage vehicle with oil leak" };
  const fix = { title: "Engine service", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "", otherApplicability: "high mileage engines" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Meaningful otherApplicability overlap should qualify");
  assert.ok(result.reasons.some(r => r.includes("Other applicability")));
});
test("P6: IVECO-compatible fuel system vs IVECO fuel-pressure job", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Fuel system diagnostic", vehicleMake: "Iveco", vehicleModel: "Daily", vehicleType: "", engineFamily: "", systemComponent: "fuel system", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "IVECO-compatible fix should match IVECO job with component overlap");
  assert.ok(result.score >= 125, "Should include vehicle compatibility score");
  assert.ok(result.reasons.some(r => r.includes("Component/system")));
});

test("Phase 9 compatibility: exact fault and make/model rank strongly", () => {
  const job = { make: "scania", model: "r500", vehicleType: "truck", engineFamily: "dc13", faultCodes: ["P0087"], text: "low rail pressure" };
  const fix = { title: "Fuel pressure check", vehicleMake: "Scania", vehicleModel: "R500", vehicleType: "Truck", engineFamily: "DC13", faultCodes: ["P0087"], diagnosticProcedure: "Measure pressure", systemComponent: "", symptoms: [], category: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.ok(result, "Phase 9 test case should still match");
  assert.ok(result.score >= 210, "Should have strong score for exact match");
});

test("Phase 9 compatibility: incompatible fixes are excluded", () => {
  const job = { make: "scania", model: "r500", vehicleType: "truck", engineFamily: "dc13", faultCodes: ["P0087"], text: "low rail pressure" };
  const fix = { title: "Fuel pressure check", vehicleMake: "Mercedes", vehicleModel: "R500", vehicleType: "Truck", engineFamily: "DC13", faultCodes: ["P0087"], diagnosticProcedure: "Measure pressure", systemComponent: "", symptoms: [], category: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Incompatible vehicle make should be rejected");
});

test("Generic bonus cannot bypass evidence gate", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "General inspection", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.equal(result, null, "Generic bonus alone should not qualify fix");
});

test("Vehicle compatibility alone cannot bypass evidence gate", () => {
  const job = { make: "iveco", model: "daily", vehicleType: "", engineFamily: "", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "General service", vehicleMake: "Iveco", vehicleModel: "Daily", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.equal(result, null, "Vehicle compatibility without technical evidence should not qualify");
});

test("Component existence alone cannot bypass evidence gate", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "low fuel pressure" };
  const fix = { title: "Brake service", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "brake assembly", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  const result = knownFixMatch(job, fix, defaultSearch);
  assert.equal(result, null, "Component without meaningful overlap should not qualify");
});

test("N10: P008 vs P0087 partial fault code with no other evidence", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: ["P0087"], text: "low fuel pressure" };
  const fix = { title: "Fuel diagnostic", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "", faultCodes: ["P008"], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "Partial fault code should not match");
});
test("N5: DPF/aftertreatment vs ABS fault - unrelated systems", () => {
  const job = { make: "", model: "", vehicleType: "", engineFamily: "", faultCodes: [], text: "ABS wheel speed sensor fault" };
  const fix = { title: "DPF regeneration procedure", vehicleMake: "", vehicleModel: "", vehicleType: "", engineFamily: "", systemComponent: "exhaust aftertreatment", faultCodes: [], symptoms: [], category: "", diagnosticProcedure: "", repairProcedure: "" };
  assert.equal(knownFixMatch(job, fix, defaultSearch), null, "DPF system should not match ABS sensor job");
});