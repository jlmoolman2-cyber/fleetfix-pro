import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ServerAccessError } from "../src/lib/serverAuthCore.ts";
import { hashProcessingContent, buildKnowledgePageId } from "../src/lib/iq200/knowledgePageProcessingCore.ts";
import { retrieveKnowledgePages } from "../src/lib/iq200/knowledgeRetrievalCore.ts";
import { handleKnowledgeRequest, parseKnowledgeInput, PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES, resolveTechnicalImage, resolveTechnicalPage, searchTechnicalKnowledge, validateProtectedPngMetadata, type KnowledgeAccessContext, type KnowledgeReadDependencies, type ServicePage, type AssetMetadata } from "../src/lib/iq200/knowledgeRetrievalServiceCore.ts";
import type { RetrievalDocument } from "../src/lib/iq200/knowledgeRetrievalContracts.ts";

function png(width = 2481, height = 3508) {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(8,13); bytes.set([73,72,68,82],12); view.setUint32(16,width); view.setUint32(20,height);
  return bytes;
}
function setup() {
  const context: KnowledgeAccessContext = { companyId: "company-a", companyUser: { active: true, permissions: { "View jobs": true, "Use IQ200 Technician Assist": true, "View IQ200 Knowledge": false } } };
  const document: RetrievalDocument = { companyId: "company-a", documentId: "doc-a", title: "Fuel pressure manual", originalFilename: "manual.pdf", contentHash: hashProcessingContent("pdf"), processingStatus: "READY", approvalStatus: "APPROVED", publishedProcessingAttemptId: "attempt-a", publishedProcessingInvocationId: "invocation-a" };
  const page: ServicePage = { documentId: "doc-a", pageId: "page-000001", pageIndex: 0, displayPageNumber: "1", extractedText: "Measure fuel pressure P0087 safely.", textContentHash: hashProcessingContent("Measure fuel pressure P0087 safely."), processingAttemptId: "attempt-a", processingInvocationId: "invocation-a", imageStorageRef: "companies/company-a/iq200/documents/doc-a/processing/attempt-a/invocation-a/pages/page-000001.png", imageWidth: 2481, imageHeight: 3508 };
  const calls: Array<{ kind: string; limit?: number; company?: string; cursor?: string }> = [];
  const state = { allowedJob: true, metadata: { size: 33, contentType: "image/png", generation: "123" } as AssetMetadata | null, body: png() };
  const deps: KnowledgeReadDependencies = {
    async authorizeJob(ctx, jobId) { calls.push({kind:"authorize"}); if (!state.allowedJob || jobId !== "job-a" || ctx.companyId !== "company-a") throw new ServerAccessError("NOT_FOUND","Job unavailable",404); return { faultCodes:["P0087"], complaint:"fuel pressure" }; },
    async documents(company,cursor,limit) { calls.push({kind:"documents",company,cursor,limit}); return [document]; },
    async pages(company,_id,limit) { calls.push({kind:"pages",company,limit}); return [page]; },
    async currentPage() { calls.push({kind:"current"}); return {document,page}; },
    async assetMetadata() { calls.push({kind:"metadata"}); return state.metadata; },
    async imageBytes(path,generation,maximum) { calls.push({kind:"body"}); assert.equal(path,page.imageStorageRef); assert.equal(generation,"123"); assert.equal(maximum,16777216); return state.body; },
  };
  const input = {question:"fuel pressure"};
  const reference = retrieveKnowledgePages("company-a",[{document,page}],{...input,faultCodes:["P0087"],complaint:"fuel pressure"}).results[0].citation.evidenceReference;
  const pageInput = {...input,evidenceReference:reference};
  return {context,document,page,calls,state,deps,input,pageInput};
}
const denied = (error: unknown) => error instanceof ServerAccessError;

test("technician retrieves without administrative knowledge permission, delegates exact B3 output", async () => {
  const f=setup(); const result=await searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps);
  const expected=retrieveKnowledgePages("company-a",[{document:f.document,page:f.page}],{...f.input,faultCodes:["P0087"],complaint:"fuel pressure"});
  assert.deepEqual(result.results,expected.results); assert.equal(result.results.length,1); assert.equal(result.continuationCursor,null);
});
for(const permission of ["View jobs","Use IQ200 Technician Assist"]) test(`deny missing ${permission}`,async()=>{
  const f=setup(); (f.context.companyUser as {permissions:Record<string,boolean>}).permissions[permission]=false;
  await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps),denied); assert.equal(f.calls.length,0);
});
test("inactive membership denied",async()=>{const f=setup();(f.context.companyUser as {active:boolean}).active=false;await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps),denied);assert.equal(f.calls.length,0);});
test("unauthorized job denied before knowledge reads",async()=>{const f=setup();f.state.allowedJob=false;await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps),denied);assert.deepEqual(f.calls.map(c=>c.kind),["authorize"]);});
test("cross-company returned document fails closed before pages",async()=>{const f=setup();f.document.companyId="company-b";await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="pages"));});
for(const field of ["companyId","company","storagePath","assetPath","url","imageUrl","downloadUrl","size","contentType"]) test(`reject caller authority ${field}`,async()=>{
  const f=setup();await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",{...f.input,[field]:"override"},f.deps),denied);await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",{...f.pageInput,[field]:"override"},f.deps),denied);assert.equal(f.calls.length,0);
});
for(const approval of ["DRAFT","REJECTED","INACTIVE","UNKNOWN",undefined]) test(`exclude ${approval} before page reads and deny old citation`,async()=>{const f=setup();f.document.approvalStatus=approval;const r=await searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps);assert.equal(r.results.length,0);await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="pages"));});
for(const processing of ["PENDING","PROCESSING","FAILED","UNKNOWN",undefined]) test(`exclude ${processing}`,async()=>{const f=setup();f.document.processingStatus=processing;assert.equal((await searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps)).results.length,0);await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
for(const [documentId,pageId] of [["forged","page-000001"],["doc-a","page-000002"],["doc-a","page-0001"],["../other","page-000001"]])test(`deny forged identity ${documentId}/${pageId}`,async()=>{const f=setup();await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a",documentId,pageId,f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="metadata"));});
for(const field of ["processingAttemptId","processingInvocationId"] as const)test(`deny stale page ${field}`,async()=>{const f=setup();f.page[field]="stale";await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="body"));});
test("changed document hash denies old reference",async()=>{const f=setup();f.document.contentHash=hashProcessingContent("changed pdf");await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
test("changed text with old or updated hash denies old reference",async()=>{const f=setup();f.page.extractedText+=" changed";await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);f.page.textContentHash=hashProcessingContent(f.page.extractedText);await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
test("altered evidence reference denied",async()=>{const f=setup();await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",{...f.pageInput,evidenceReference:"TECHNICAL_DOCUMENT_"+"0".repeat(64)},f.deps),denied);});
test("permission withdrawal invalidates earlier citation",async()=>{const f=setup();await resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps);(f.context.companyUser as {permissions:Record<string,boolean>}).permissions["Use IQ200 Technician Assist"]=false;f.calls.length=0;await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.equal(f.calls.length,0);});
test("page outside current results denied",async()=>{const f=setup();f.document.title="Unrelated";f.page.extractedText="Unrelated content";f.page.textContentHash=hashProcessingContent(f.page.extractedText);f.deps.authorizeJob=async()=>({});await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
test("fresh targeted snapshot revocation after search fails closed",async()=>{const f=setup();f.deps.currentPage=async()=>({document:{...f.document,approvalStatus:"INACTIVE"},page:f.page});await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="metadata"));});
test("missing current page denied",async()=>{const f=setup();f.deps.currentPage=async()=>null;await assert.rejects(()=>resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
test("owned persisted path required",async()=>{const f=setup();f.page.imageStorageRef="companies/company-b/private.png";await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="metadata"));});
test("document limit sentinel and continuation preserved",async()=>{const f=setup();f.deps.documents=async(company,cursor,limit)=>{assert.equal(limit,51);assert.equal(company,"company-a");return Array.from({length:51},(_,i)=>({...f.document,documentId:`doc-${String(i).padStart(3,"0")}`,approvalStatus:"DRAFT"}));};const r=await searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps);assert.equal(r.coverage.candidateDocumentsConsidered,50);assert.equal(r.continuationCursor,"doc-049");assert.equal(r.coverage.coverageLimited,true);});
test("shared page read ceiling and sentinel preserve coverage",async()=>{const f=setup();f.deps.pages=async(_company,_doc,limit)=>{assert.equal(limit,201);return Array.from({length:201},(_,i)=>({...f.page,pageId:buildKnowledgePageId(i),pageIndex:i,displayPageNumber:String(i+1)}));};const r=await searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps);assert.equal(r.coverage.candidatePagesConsidered,200);assert.equal(r.results.length,5);assert.equal(r.coverage.coverageLimited,true);});
test("shared page budget across documents",async()=>{const f=setup();f.deps.documents=async()=>[f.document,{...f.document,documentId:"doc-b"}];const limits:number[]=[];f.deps.pages=async(_c,id,limit)=>{limits.push(limit);return Array.from({length:id==="doc-a"?150:51},(_,i)=>({...f.page,documentId:id,pageId:buildKnowledgePageId(i),pageIndex:i,displayPageNumber:String(i+1)}));};const r=await searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps);assert.deepEqual(limits,[201,51]);assert.equal(r.coverage.candidatePagesConsidered,200);assert.equal(r.coverage.coverageLimited,true);});
test("cursor valid, deterministic, no authority and ordered windows enforced",async()=>{const f=setup();assert.deepEqual(parseKnowledgeInput({...f.input,cursor:"doc-0"}),{...f.input,cursor:"doc-0"});await searchTechnicalKnowledge(f.context,"job-a",{...f.input,cursor:"doc-0"},f.deps);assert.equal(f.calls.find(c=>c.kind==="documents")!.cursor,"doc-0");assert.throws(()=>parseKnowledgeInput({...f.input,cursor:"../company"}),denied);await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",{...f.input,cursor:"doc-z"},f.deps),denied);});
for(const size of [100,16777216])test(`PNG metadata size ${size} accepted`,()=>{assert.equal(validateProtectedPngMetadata({size,contentType:"image/png",generation:"123"}).size,size);});
test("16777217 denied before download with no mutation",async()=>{const f=setup();f.state.metadata!.size=16777217;const before=structuredClone({document:f.document,page:f.page,metadata:f.state.metadata});await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),e=>e instanceof ServerAccessError&&e.status===413);assert.ok(!f.calls.some(c=>c.kind==="body"));assert.deepEqual({document:f.document,page:f.page,metadata:f.state.metadata},before);assert.equal(PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES,16777216);});
test("missing object denied before download",async()=>{const f=setup();f.state.metadata=null;await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="body"));});
test("non-PNG below ceiling denied before download",async()=>{const f=setup();f.state.metadata!.contentType="image/jpeg";await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="body"));});
test("malformed size or absent generation rejected",()=>{for(const size of [NaN,-1,0,0.5])assert.throws(()=>validateProtectedPngMetadata({size,contentType:"image/png",generation:"123"}),denied);assert.throws(()=>validateProtectedPngMetadata({size:33,contentType:"image/png",generation:""}),denied);});
test("dimension mismatch denied after bounded body",async()=>{const f=setup();f.state.body=png(1,1);await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
test("body signature or metadata size mismatch denied",async()=>{const f=setup();f.state.body[0]=0;await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);f.state.body=png();f.state.metadata!.size=34;await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);});
test("protected image success: generation pinned, ordered metadata before body, headers and no public URL",async()=>{const f=setup();const response=await resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps);assert.equal(response.headers.get("content-type"),"image/png");assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");assert.equal(response.headers.get("location"),null);assert.ok(f.calls.findIndex(c=>c.kind==="metadata")<f.calls.findIndex(c=>c.kind==="body"));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.state.body);});
test("metadata result excludes asset path, company authority and URLs",async()=>{const f=setup();const value=await resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps);assert.equal(value.imageWidth,2481);assert.equal(value.imageHeight,3508);assert.ok(!JSON.stringify(value).includes("companies/"));assert.ok(!JSON.stringify(value).includes("https://"));});
test("question schema rejects missing, blank, oversized and unexpected fields",()=>{for(const input of [null,[],{}, {question:" "},{question:"x".repeat(2001)},{question:"valid",evidenceReference:"extra"}])assert.throws(()=>parseKnowledgeInput(input),denied);});
const errorResponse=(error:unknown)=>error instanceof ServerAccessError?Response.json({error:{code:error.code,message:error.message}},{status:error.status}):Response.json({error:{code:"INTERNAL"}},{status:500});
test("route orchestration authenticates before reads and returns protected JSON",async()=>{const f=setup();let authenticated=false;const response=await handleKnowledgeRequest(new Request("https://local/knowledge",{method:"POST",body:JSON.stringify(f.input)}),{jobId:"job-a"},"search",async()=>{authenticated=true;return f.context;},()=>{assert.ok(authenticated);return f.deps;},errorResponse);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal((await response.json()).results.length,1);});
test("route auth failure, invalid JSON, and oversized body denied without knowledge reads",async()=>{const f=setup();const make=(body:string)=>new Request("https://local",{method:"POST",body});const failed=await handleKnowledgeRequest(make("{}"),{jobId:"job-a"},"search",async()=>{throw new ServerAccessError("AUTH_REQUIRED","Required",401);},()=>f.deps,errorResponse);assert.equal(failed.status,401);for(const body of ["invalid","x".repeat(16385)]){const response=await handleKnowledgeRequest(make(body),{jobId:"job-a"},"search",async()=>f.context,()=>f.deps,errorResponse);assert.equal(response.status,400);}assert.equal(f.calls.length,0);});
test("all three route files delegate read-only POST to shared authenticated handler",()=>{for(const [path,operation] of [["src/app/api/iq200/jobs/[jobId]/knowledge/route.ts","search"],["src/app/api/iq200/jobs/[jobId]/knowledge/[documentId]/pages/[pageId]/route.ts","page"],["src/app/api/iq200/jobs/[jobId]/knowledge/[documentId]/pages/[pageId]/image/route.ts","image"]]){const source=readFileSync(path,"utf8");assert.match(source,/export async function POST/);assert.ok(source.includes(`await params, "${operation}"`));assert.match(source,/runtime = "nodejs"/);}});
test("adapters and core contain no write/provider/processing execution boundary",()=>{const service=readFileSync("src/lib/iq200/knowledgeRetrievalService.ts","utf8");assert.match(service,/readOnly: true/);assert.match(service,/getMetadata\(\)/);assert.match(service,/file\(path, \{ generation \}\)/);assert.match(service,/size > maximum/);assert.ok(!/\.save\(|\.delete\(|\.update\(|\.set\(|\.create\(|createTask\(|processClaimedKnowledgeDocument\(|runHostedReasoning\(/.test(service));});

test("invalid persisted dimensions denied before asset/body reads",async()=>{const f=setup();f.page.imageWidth=NaN;await assert.rejects(()=>resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps),denied);assert.ok(!f.calls.some(c=>c.kind==="metadata"));});
test("absent dimensions not invented; body dimensions still structurally checked",async()=>{const f=setup();delete f.page.imageWidth;delete f.page.imageHeight;const meta=await resolveTechnicalPage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps);assert.equal(meta.imageWidth,null);assert.equal(meta.imageHeight,null);assert.equal((await resolveTechnicalImage(f.context,"job-a","doc-a","page-000001",f.pageInput,f.deps)).status,200);});
test("server detects adapter over-return rather than exceed read budgets",async()=>{const f=setup();f.deps.documents=async()=>Array.from({length:52},(_,i)=>({...f.document,documentId:`doc-${i}`}));await assert.rejects(()=>searchTechnicalKnowledge(f.context,"job-a",f.input,f.deps),denied);});
test("page and image route orchestration return protected successful responses",async()=>{for(const operation of ["page","image"] as const){const f=setup();const response=await handleKnowledgeRequest(new Request("https://local/page",{method:"POST",body:JSON.stringify(f.pageInput)}),{jobId:"job-a",documentId:"doc-a",pageId:"page-000001"},operation,async()=>f.context,()=>f.deps,errorResponse);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");if(operation==="image")assert.equal(response.headers.get("x-content-type-options"),"nosniff");else assert.equal((await response.json()).citation.pageId,"page-000001");}});
import { registerHooks } from "node:module";

// Import the actual server adapter with module-boundary doubles, using the
// repository's existing registerHooks test pattern. No production text is rewritten.
const bridgeKey = "__iq200B4AdapterBehaviouralTest";
const bridge = () => `Reflect.get(globalThis, ${JSON.stringify(bridgeKey)})`;
const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const errorModule = new URL("../src/lib/serverAuthCore.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: moduleUrl("export {}"), shortCircuit: true };
    if (specifier === "@/lib/firebaseAdmin") return { url: moduleUrl(`export const adminDb = {collection(...args){return ${bridge()}.db.collection(...args)},doc(...args){return ${bridge()}.db.doc(...args)},runTransaction(...args){return ${bridge()}.db.runTransaction(...args)}}; export const adminStorage={bucket(){return ${bridge()}.storage.bucket()}};`), shortCircuit: true };
    if (specifier === "@/lib/serverAuth") return { url: moduleUrl(`export {ServerAccessError} from ${JSON.stringify(errorModule)}; export async function authenticateServerRequest(){return ${bridge()}.context}; export function safeServerErrorResponse(error){return ${bridge()}.errorResponse(error)}`), shortCircuit: true };
    if (specifier === "firebase-admin/firestore" && context.parentURL?.endsWith("knowledgeRetrievalService.ts")) return { url: moduleUrl('export const FieldPath={documentId(){return "__name__"}}'), shortCircuit: true };
    if (specifier === "./service" && context.parentURL?.endsWith("knowledgeRetrievalService.ts")) return { url: moduleUrl(`export async function authorisedJob(){return {data:{}}};export async function getIQ200JobContext(){return {job:{vehicle:{make:"",model:""},faultCodes:["P0087"],description:"fuel pressure",notes:[]}}}`), shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/lib/iq200/") && !/\.(ts|js|mjs)$/.test(specifier)) return { url: new URL(`${specifier}.ts`,context.parentURL).href, shortCircuit: true };
    return nextResolve(specifier,context);
  },
});
const productionAdapter = await import("../src/lib/iq200/knowledgeRetrievalService.ts");
hooks.deregister();

function adapterFixture(mode: "replacement" | "missing" | "overflow") {
  const f = setup();
  const events: string[] = [];
  const a = Buffer.from(png()), b = Buffer.from(png()); b[32] = 99;
  const repeatedChunk = Buffer.alloc(1024 * 1024, 7);
  let latest = "123", destroyed = false, chunksConsumed = 0;
  const paths: string[] = [];
  const snapshot = (id: string, data: object) => ({id,exists:true,data:()=>data});
  const query = (pages: boolean) => ({
    orderBy(field: string){assert.equal(field,"__name__");return this;},
    limit(limit: number){assert.equal(limit,pages?201:51);return this;},
    select(){return this;},
    async get(){return {docs:[pages?snapshot(f.page.pageId,f.page):snapshot(f.document.documentId,f.document)]};},
  });
  const db = {
    collection(path: string) { paths.push(path); assert.equal(path,"companies/company-a/iq200_documents"); return query(false); },
    doc(path: string) {
      paths.push(path); assert.equal(path,"companies/company-a/iq200_documents/doc-a");
      return { path, collection(name: string) {
        assert.equal(name,"pages");
        return Object.assign(query(true), { doc(id: string) { assert.equal(id,"page-000001"); return {path:path+"/pages/"+id}; } });
      } };
    },
    async runTransaction(work: (transaction: {getAll:()=>Promise<unknown[]>})=>Promise<unknown>, options: {readOnly:boolean}) {
      assert.equal(options.readOnly,true);
      return work({getAll:async()=>[snapshot(f.document.documentId,f.document),snapshot(f.page.pageId,f.page)]});
    },
  };
  const storage = { bucket() { return { file(path: string, options?: {generation:string}) {
    assert.equal(path,f.page.imageStorageRef);
    return {
      async getMetadata() { events.push("metadata:A"); latest="456"; return [{size:"33",contentType:"image/png",generation:"123"}]; },
      createReadStream() {
        const generation=options?.generation || latest;
        events.push(`read:${generation}`);
        return {
          destroy() { destroyed=true; events.push("destroy"); },
          async *[Symbol.asyncIterator]() {
            if(mode==="missing" && generation==="123") throw new Error("Generation A unavailable");
            if(mode==="overflow") {
              for(let i=0;i<64;i++) { if(destroyed)break; chunksConsumed++; yield repeatedChunk; }
            } else { chunksConsumed++; yield generation==="123"?a:b; }
          },
        };
      },
    };
  } }; } };
  Reflect.set(globalThis,bridgeKey,{context:f.context,db,storage,errorResponse});
  const before = structuredClone({document:f.document,page:f.page});
  return {f,a,b,events,paths,before,get destroyed(){return destroyed;},get chunksConsumed(){return chunksConsumed;}};
}
async function requestProductionImage(f: ReturnType<typeof setup>) {
  return productionAdapter.technicalKnowledgeRequest(new Request("https://local/image",{method:"POST",body:JSON.stringify(f.pageInput)}),{jobId:"job-a",documentId:"doc-a",pageId:"page-000001"},"image");
}
test("R1 production adapter serves validated generation A when B becomes latest",async()=>{
  const fixture=adapterFixture("replacement");try {
    const response=await requestProductionImage(fixture.f);assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,fixture.a);assert.notDeepEqual(bytes,fixture.b);
    assert.deepEqual(fixture.events,["metadata:A","read:123"]);
    assert.deepEqual({document:fixture.f.document,page:fixture.f.page},fixture.before);
  }finally{Reflect.deleteProperty(globalThis,bridgeKey);}
});
test("R1 production adapter missing generation A fails closed without latest/B fallback",async()=>{
  const fixture=adapterFixture("missing");try {
    const response=await requestProductionImage(fixture.f);assert.equal(response.status,404);assert.notEqual(response.headers.get("content-type"),"image/png");
    assert.deepEqual(fixture.events,["metadata:A","read:123","destroy"]);assert.equal(fixture.destroyed,true);
    assert.deepEqual({document:fixture.f.document,page:fixture.f.page},fixture.before);
  }finally{Reflect.deleteProperty(globalThis,bridgeKey);}
});
test("R1 actual production reader rejects overflow, terminates early, returns no image and performs no mutations",async()=>{
  const fixture=adapterFixture("overflow");try {
    const response=await requestProductionImage(fixture.f);assert.equal(response.status,413);assert.notEqual(response.headers.get("content-type"),"image/png");
    assert.equal((await response.json()).error.code,"IMAGE_TOO_LARGE");
    assert.equal(fixture.chunksConsumed,17);assert.ok(fixture.chunksConsumed<64);assert.equal(fixture.destroyed,true);
    assert.deepEqual(fixture.events,["metadata:A","read:123","destroy","destroy"]);
    assert.deepEqual({document:fixture.f.document,page:fixture.f.page},fixture.before);
  }finally{Reflect.deleteProperty(globalThis,bridgeKey);}
});
