import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {knownFixMatch,parseKnownFixSearch,validateKnownFixInput,KNOWN_FIX_STATUSES,KNOWN_FIX_MAX_RESULTS,KNOWN_FIX_MAX_CANDIDATES} from "../src/lib/iq200/knownFixCore.ts";
import {effectivePermissions} from "../src/lib/permissions.ts";
import {hostedExecutionAllowed,hostedReasoningConfig,IQ200_HOSTED_COMMISSIONING_ARMED,IQ200_PHASE7_COMMISSIONING_ARMED,IQ200_PHASE7_MODEL} from "../src/lib/iq200/hostedConfig.ts";

const source=(path:string)=>readFileSync(path,"utf8");
const service=()=>source("src/lib/iq200/knownFixService.ts");
const core=()=>source("src/lib/iq200/knownFixCore.ts");
const page=()=>source("src/app/jobs/[id]/iq200/page.tsx");
const adminPage=()=>source("src/app/admin/iq200-known-fixes/page.tsx");
const rules=()=>source("firestore.rules");

const job={make:"scania",model:"g460",vehicleType:"truck",engineFamily:"dc13",faultCodes:["AST-03119"],text:"cranks but does not start hot fuel"};
const search={q:"",faultCode:"",component:"",limit:10};
const fix=(o:Record<string,unknown>={})=>({title:"Hot restart check",vehicleMake:"Scania",vehicleModel:"G460",vehicleType:"truck",engineFamily:"DC13",systemComponent:"fuel",symptoms:["cranks no start hot"],faultCodes:["AST-03119"],diagnosticProcedure:"Measure rail pressure",repairProcedure:"Repair only after tests",...o});

// P11.1 — Known Fix collection is company scoped
test("P11.1 Known Fix collection is company scoped",()=>{
  const value=service();
  assert.match(value,/companies\/\$\{companyId\}\/iq200_known_fixes/);
  assert.match(value,/collectionFor\(context\.companyId\)/);
  assert.doesNotMatch(value,/body\.companyId|searchParams\.get\("companyId"\)/);
});

// P11.2 — Creation defaults safely to DRAFT where applicable
test("P11.2 creation defaults safely to DRAFT",()=>{
  const value=service();
  assert.match(value,/status:"DRAFT",active:false/);
  assert.match(value,/approvedBy:null,approvedAt:null/);
  assert.throws(()=>validateKnownFixInput({title:"Valid",status:"APPROVED"}));
  assert.throws(()=>validateKnownFixInput({title:"Valid",approvedBy:"attacker"}));
});

// P11.3 — Draft is excluded from technician retrieval
test("P11.3 Draft is excluded from technician retrieval",()=>{
  const value=service();
  const searchFn=value.slice(value.indexOf("export async function searchKnownFixesForJob"),value.indexOf("export async function listKnownFixes"));
  assert.match(searchFn,/where\("status", "==", "APPROVED"\)/);
  assert.match(searchFn,/active === true/);
  assert.doesNotMatch(searchFn,/DRAFT/);
});

// P11.4 — Approved + active is eligible for technician retrieval
test("P11.4 Approved + active is eligible for technician retrieval",()=>{
  const value=service();
  assert.match(value,/where\("status", "==", "APPROVED"\)/);
  assert.match(value,/doc\.data\(\)\.active === true/);
  assert.match(value,/technicianDto/);
});

// P11.5 — Inactive is excluded
test("P11.5 Inactive is excluded from technician retrieval",()=>{
  const value=service();
  const searchFn=value.slice(value.indexOf("export async function searchKnownFixesForJob"),value.indexOf("export async function listKnownFixes"));
  assert.doesNotMatch(searchFn,/INACTIVE/);
  assert.match(searchFn,/APPROVED/);
  assert.match(searchFn,/active === true/);
});

// P11.6 — Approval requires correct permission
test("P11.6 approval requires correct permission",()=>{
  const value=service();
  assert.match(value,/action==="approve"\) requirePermission\(context,"Approve IQ200 Known Fixes"\)/);
  assert.match(value,/status:"APPROVED",active:true,approvedBy:context\.uid,approvedAt:FieldValue\.serverTimestamp\(\)/);
});

// P11.7 — Management requires correct permission
test("P11.7 management requires correct permission",()=>{
  const value=service();
  assert.match(value,/requirePermission\(context,"Manage IQ200 Known Fixes"\)/);
  assert.match(value,/createKnownFix/);
  assert.match(value,/updateKnownFix/);
  assert.match(value,/action==="inactivate"\) requirePermission\(context,"Manage IQ200 Known Fixes"\)/);
});

// P11.8 — View permission does not imply approval permission
test("P11.8 view permission does not imply approval permission",()=>{
  const viewOnly=effectivePermissions({primaryRole:"Other",permissions:{"View IQ200 Known Fixes":true,"Manage IQ200 Known Fixes":false,"Approve IQ200 Known Fixes":false}});
  assert.equal(viewOnly["View IQ200 Known Fixes"],true);
  assert.equal(viewOnly["Manage IQ200 Known Fixes"],false);
  assert.equal(viewOnly["Approve IQ200 Known Fixes"],false);
});

// P11.6 — Approval requires correct permission
test("P11.6 approval requires correct permission",()=>{
  const value=service();
  assert.match(value,/action==="approve"\) requirePermission\(context,"Approve IQ200 Known Fixes"\)/);
  assert.match(value,/status:"APPROVED",active:true,approvedBy:context\.uid,approvedAt:FieldValue\.serverTimestamp\(\)/);
});

// P11.7 — Management requires correct permission
test("P11.7 management requires correct permission",()=>{
  const value=service();
  assert.match(value,/requirePermission\(context,"Manage IQ200 Known Fixes"\)/);
  assert.match(value,/createKnownFix/);
  assert.match(value,/updateKnownFix/);
  assert.match(value,/action==="inactivate"\) requirePermission\(context,"Manage IQ200 Known Fixes"\)/);
});

// P11.8 — View permission does not imply approval permission
test("P11.8 view permission does not imply approval permission",()=>{
  const viewOnly=effectivePermissions({primaryRole:"Other",permissions:{"View IQ200 Known Fixes":true,"Manage IQ200 Known Fixes":false,"Approve IQ200 Known Fixes":false}});
  assert.equal(viewOnly["View IQ200 Known Fixes"],true);
  assert.equal(viewOnly["Manage IQ200 Known Fixes"],false);
  assert.equal(viewOnly["Approve IQ200 Known Fixes"],false);
});

// P11.9 — Cross-company access/retrieval denied
test("P11.9 cross-company access/retrieval denied",()=>{
  const value=service();
  assert.match(value,/companies\/\$\{companyId\}\/iq200_known_fixes/);
  assert.match(value,/authorisedJob\(context, jobId\)/);
  assert.doesNotMatch(value,/body\.companyId|searchParams\.get\("companyId"\)/);
  const rulesValue=rules();
  assert.match(rulesValue,/match \/iq200_known_fixes\/\{knownFixId\}\/\{document=\*\*\}[\s\S]*allow read, write: if false/);
});

// P11.10 — Approval audit information retained
test("P11.10 approval audit information retained",()=>{
  const value=service();
  assert.match(value,/approvedBy:context\.uid/);
  assert.match(value,/approvedAt:FieldValue\.serverTimestamp\(\)/);
  assert.match(value,/approvedBy: data\.approvedBy/);
  assert.match(value,/approvedAt: iso\(data\.approvedAt\)/);
});

// P11.11 — Provenance retained
test("P11.11 provenance retained",()=>{
  const value=service();
  assert.match(value,/createdBy:context\.uid/);
  assert.match(value,/createdAt:FieldValue\.serverTimestamp\(\)/);
  assert.match(value,/updatedBy:context\.uid/);
  assert.match(value,/updatedAt:FieldValue\.serverTimestamp\(\)/);
  assert.match(value,/sourceReference/);
});

// P11.12 — Revision handling remains valid
test("P11.12 revision handling remains valid",()=>{
  const value=service();
  assert.match(value,/revision:1/);
  assert.match(value,/knownFixEditBehavior/);
  assert.match(value,/shouldIncrementRevision\?currentRevision\+1:currentRevision/);
  assert.match(value,/status:"DRAFT",active:false,revision:/);
});

// P11.13 — Applicability matching works using actual existing rules
test("P11.13 applicability matching works using actual existing rules",()=>{
  const match=knownFixMatch(job,fix(),search);
  assert.ok(match&&match.score>0);
  assert.ok(match.score>=210);
  assert.ok(match.reasons.includes("Exact fault code: AST-03119"));
  assert.ok(match.reasons.includes("Exact make/model applicability"));
});

// P11.14 — Applicability does not equal confirmed diagnosis
test("P11.14 applicability does not equal confirmed diagnosis",()=>{
  const value=page();
  assert.match(value,/Applicability is evidence, not confirmation of the current fault/);
  assert.match(value,/Only approved, active guidance is shown/);
  assert.match(value,/Why this may apply/);
  assert.doesNotMatch(value,/confirmed diagnosis|definitive diagnosis|guaranteed/);
});

// P11.15 — Technician UI does not expose approval controls
test("P11.15 technician UI does not expose approval controls",()=>{
  const value=page();
  assert.doesNotMatch(value,/Approve Known Fix|Mark inactive|changeKnownFixStatus/);
  assert.doesNotMatch(value,/admin.*known.*fix|\/admin\/iq200/);
  assert.match(value,/Approved Known Fixes/);
});


// P11.16 — Known Fix evidence references are bounded/deterministic
test("P11.16 Known Fix evidence references are bounded/deterministic",()=>{
  const value=page();
  assert.match(value,/EvidenceBadge reference=\{`KNOWN_FIX_\$\{index\+1\}`\}/);
  assert.ok(KNOWN_FIX_MAX_RESULTS===20);
  assert.ok(KNOWN_FIX_MAX_CANDIDATES===100);
});

// P11.17 — Draft/Inactive cannot become evidence references
test("P11.17 Draft/Inactive cannot become evidence references",()=>{
  const value=service();
  const searchFn=value.slice(value.indexOf("export async function searchKnownFixesForJob"),value.indexOf("export async function listKnownFixes"));
  assert.match(searchFn,/where\("status", "==", "APPROVED"\)/);
  assert.match(searchFn,/active === true/);
  assert.doesNotMatch(searchFn,/technicianDto.*DRAFT|technicianDto.*INACTIVE/);
});

// P11.18 — Safety warnings remain visible
test("P11.18 safety warnings remain visible",()=>{
  const value=page();
  assert.match(value,/Safety warning/);
  assert.match(value,/fix\.safetyWarnings/);
  assert.match(value,/rounded-xl border border-red-300 bg-red-50/);
});

// P11.19 — No raw HTML rendering introduced
test("P11.19 no raw HTML rendering introduced",()=>{
  const value=page();
  assert.doesNotMatch(value,/dangerouslySetInnerHTML/);
  assert.doesNotMatch(adminPage(),/dangerouslySetInnerHTML/);
});

// P11.20 — No hidden reasoning exposed
test("P11.20 no hidden reasoning exposed",()=>{
  const value=page();
  assert.doesNotMatch(value,/chainOfThought|chain_of_thought|hiddenReasoning|internalReasoning|reasoningText|rawProvider|providerEnvelope|systemPrompt|fullPrompt/);
});

// P11.21 — Hosted commissioning remains false
test("P11.21 hosted commissioning remains false",()=>{
  assert.equal(IQ200_HOSTED_COMMISSIONING_ARMED,false);
  assert.equal(IQ200_PHASE7_COMMISSIONING_ARMED,false);
  const config=hostedReasoningConfig({FLEETFIX_ENVIRONMENT:"staging",IQ200_PHASE7_COMMISSIONING_ENABLED:"false",IQ200_REASONING_ENABLED:"true",IQ200_HOSTED_PROVIDER_ENABLED:"true",IQ200_HOSTED_PROVIDER:"openai",IQ200_HOSTED_MODEL:IQ200_PHASE7_MODEL,IQ200_HOSTED_CREDENTIAL_PRESENT:"true",IQ200_PHASE7_COMPANY_ID:"company-a",IQ200_PHASE7_JOB_ID:"job-a",IQ200_PHASE7_SESSION_ID:"session-a",IQ200_RATE_USER_PER_HOUR:"1",IQ200_RATE_COMPANY_PER_HOUR:"1",IQ200_RATE_SESSION_PER_HOUR:"1",IQ200_COMPANY_PERIOD_REQUESTS:"1",IQ200_LIMIT_PERIOD_SECONDS:"3600",IQ200_MAX_INPUT_CHARS:"20000",IQ200_MAX_OUTPUT_CHARS:"10000",IQ200_MAX_OUTPUT_TOKENS:"4096"});
  assert.equal(config.commissioningEnabled,false);
  assert.equal(hostedExecutionAllowed(config),false);
});

// P11.22 — No Retry 6 exists
test("P11.22 no Retry 6 exists",()=>{
  const hosted=source("src/lib/iq200/hostedReasoningService.ts");
  assert.doesNotMatch(hosted,/retry6/i);
});

// P11.23 — Retry 5 namespace remains unchanged
test("P11.23 Retry 5 namespace remains unchanged",()=>{
  const hosted=source("src/lib/iq200/hostedReasoningService.ts");
  assert.match(hosted,/ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"/);
  assert.match(hosted,/iq200_hosted_commissioning\/phase7_retry5/);
});

// P11.24 — Phase 11 tests cannot import/construct live OpenAI transport
test("P11.24 Phase 11 tests cannot import/construct live OpenAI transport",()=>{
  const self=source("tests/iq200-phase11.test.ts");
  const imports=self.slice(0,self.indexOf("const source"));
  assert.doesNotMatch(imports,/hostedProvider|openaiTransport|OpenAIReasoningTransport|ReasoningService|firebase|serverAuth/);
  assert.doesNotMatch(imports,/fetch|OpenAI|apiKey|authorization/i);
});

// P11.25 — No automatic FleetFix action is introduced
test("P11.25 no automatic FleetFix action is introduced",()=>{
  const value=page();
  assert.doesNotMatch(value,/updateJob|changeJobStatus|sendWhatsApp|sendEmail|orderParts|createPurchaseOrder|setInterval|schedule|background/i);
  assert.match(value,/cannot authorize repairs, change this job, contact customers, or order parts/);
  const adminValue=adminPage();
  assert.doesNotMatch(adminValue,/autoApprove|autoInactivate|bulkAction|batchApprove/i);
});

// P11.16 — Known Fix evidence references are bounded/deterministic
test("P11.16 Known Fix evidence references are bounded/deterministic",()=>{
  const value=page();
  assert.match(value,/EvidenceBadge reference=\{`KNOWN_FIX_\$\{index\+1\}`\}/);
  assert.ok(KNOWN_FIX_MAX_RESULTS===20);
  assert.ok(KNOWN_FIX_MAX_CANDIDATES===100);
});

// P11.17 — Draft/Inactive cannot become evidence references
test("P11.17 Draft/Inactive cannot become evidence references",()=>{
  const value=service();
  const searchFn=value.slice(value.indexOf("export async function searchKnownFixesForJob"),value.indexOf("export async function listKnownFixes"));
  assert.match(searchFn,/where\("status", "==", "APPROVED"\)/);
  assert.match(searchFn,/active === true/);
  assert.doesNotMatch(searchFn,/technicianDto.*DRAFT|technicianDto.*INACTIVE/);
});

// P11.18 — Safety warnings remain visible
test("P11.18 safety warnings remain visible",()=>{
  const value=page();
  assert.match(value,/Safety warning/);
  assert.match(value,/fix\.safetyWarnings/);
  assert.match(value,/rounded-xl border border-red-300 bg-red-50/);
});

// P11.19 — No raw HTML rendering introduced
test("P11.19 no raw HTML rendering introduced",()=>{
  const value=page();
  assert.doesNotMatch(value,/dangerouslySetInnerHTML/);
  assert.doesNotMatch(adminPage(),/dangerouslySetInnerHTML/);
});

// P11.20 — No hidden reasoning exposed
test("P11.20 no hidden reasoning exposed",()=>{
  const value=page();
  assert.doesNotMatch(value,/chainOfThought|chain_of_thought|hiddenReasoning|internalReasoning|reasoningText|rawProvider|providerEnvelope|systemPrompt|fullPrompt/);
});

// P11.21 — Hosted commissioning remains false
test("P11.21 hosted commissioning remains false",()=>{
  assert.equal(IQ200_HOSTED_COMMISSIONING_ARMED,false);
  assert.equal(IQ200_PHASE7_COMMISSIONING_ARMED,false);
  const config=hostedReasoningConfig({FLEETFIX_ENVIRONMENT:"staging",IQ200_PHASE7_COMMISSIONING_ENABLED:"false",IQ200_REASONING_ENABLED:"true",IQ200_HOSTED_PROVIDER_ENABLED:"true",IQ200_HOSTED_PROVIDER:"openai",IQ200_HOSTED_MODEL:IQ200_PHASE7_MODEL,IQ200_HOSTED_CREDENTIAL_PRESENT:"true",IQ200_PHASE7_COMPANY_ID:"company-a",IQ200_PHASE7_JOB_ID:"job-a",IQ200_PHASE7_SESSION_ID:"session-a",IQ200_RATE_USER_PER_HOUR:"1",IQ200_RATE_COMPANY_PER_HOUR:"1",IQ200_RATE_SESSION_PER_HOUR:"1",IQ200_COMPANY_PERIOD_REQUESTS:"1",IQ200_LIMIT_PERIOD_SECONDS:"3600",IQ200_MAX_INPUT_CHARS:"20000",IQ200_MAX_OUTPUT_CHARS:"10000",IQ200_MAX_OUTPUT_TOKENS:"4096"});
  assert.equal(config.commissioningEnabled,false);
  assert.equal(hostedExecutionAllowed(config),false);
});

// P11.22 — No Retry 6 exists
test("P11.22 no Retry 6 exists",()=>{
  const hosted=source("src/lib/iq200/hostedReasoningService.ts");
  assert.doesNotMatch(hosted,/retry6/i);
});

// P11.23 — Retry 5 namespace remains unchanged
test("P11.23 Retry 5 namespace remains unchanged",()=>{
  const hosted=source("src/lib/iq200/hostedReasoningService.ts");
  assert.match(hosted,/ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"/);
  assert.match(hosted,/iq200_hosted_commissioning\/phase7_retry5/);
});

// P11.24 — Phase 11 tests cannot import/construct live OpenAI transport
test("P11.24 Phase 11 tests cannot import/construct live OpenAI transport",()=>{
  const self=source("tests/iq200-phase11.test.ts");
  const imports=self.slice(0,self.indexOf("const source"));
  assert.doesNotMatch(imports,/hostedProvider|openaiTransport|OpenAIReasoningTransport|ReasoningService|firebase|serverAuth/);
  assert.doesNotMatch(imports,/fetch|OpenAI|apiKey|authorization/i);
});

// P11.25 — No automatic FleetFix action is introduced
test("P11.25 no automatic FleetFix action is introduced",()=>{
  const value=page();
  assert.doesNotMatch(value,/updateJob|changeJobStatus|sendWhatsApp|sendEmail|orderParts|createPurchaseOrder|setInterval|schedule|background/i);
  assert.match(value,/cannot authorize repairs, change this job, contact customers, or order parts/);
  const adminValue=adminPage();
  assert.doesNotMatch(adminValue,/autoApprove|autoInactivate|bulkAction|batchApprove/i);
});
