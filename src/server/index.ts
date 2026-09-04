import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { compilePlan, validateSnapshot } from "../domain/engine.js";
import { inferObjectType, inferPropertyMeaning } from "../domain/modeling.js";
import type { OntologyObject, OntologyProperty, OntologySnapshot, ObjectType } from "../domain/types.js";
import { MaxComputeClient, type MaxComputeSecret } from "./maxcompute.js";
import { SecretBox } from "./security.js";
import { Store, type MaxComputeSource, type PhysicalTable, type Principal, type Role } from "./store.js";

const stateRoot=path.resolve(process.env.SEMANTIC_STATE_ROOT||".semantic-platform");
const store=new Store(stateRoot);
const secrets=new SecretBox(stateRoot);
const maxCompute=new MaxComputeClient();
const app=Fastify({logger:true,bodyLimit:1_000_000});
await app.register(cookie);

if(store.initialPassword){app.log.warn(`首次登录账号 admin，密码 ${store.initialPassword}`);app.log.warn("请登录后创建正式管理员账号，并设置 SEMANTIC_ADMIN_PASSWORD 与 SEMANTIC_CREDENTIAL_KEY");}

declare module "fastify" { interface FastifyRequest { principal:Principal|null } }
const publicRoutes=new Set(["/api/health","/api/auth/login"]);
app.addHook("onRequest",async(request,reply)=>{
  request.principal=store.principal(request.cookies.semantic_session);
  const route=request.url.split("?")[0];
  if(!route.startsWith("/api/"))return;
  if(publicRoutes.has(route))return;
  if(!request.principal)return reply.code(401).send({message:"请先登录"});
  if(!["GET","HEAD","OPTIONS"].includes(request.method)){
    const csrf=request.headers["x-csrf-token"];
    if(!csrf||csrf!==request.cookies.semantic_csrf)return reply.code(403).send({message:"安全校验失败，请刷新页面后重试"});
  }
});

const sourceSchema=z.object({name:z.string().trim().min(1).max(80),endpoint:z.string().url().startsWith("https://"),project:z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,127}$/),schema:z.string().trim().max(128).optional(),quota:z.string().trim().max(128).optional(),accessId:z.string().trim().optional(),accessKey:z.string().optional(),stsToken:z.string().optional()});
const userSchema=z.object({username:z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/),displayName:z.string().trim().min(1).max(80),role:z.enum(["ADMIN","MODELER","ANALYST","VIEWER"]),password:z.string().min(12).max(200)});
const tableNameSchema=z.object({tableName:z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/)});
const modelTableInputSchema=z.object({tableId:z.string().min(1),label:z.string().trim().min(1).max(256).optional(),objectType:z.enum(["ENTITY","EVENT","SNAPSHOT","AGGREGATE","RELATIONSHIP"]).optional(),idColumn:z.string().max(256).optional(),timeColumn:z.string().max(256).optional()});
const entityStatusSchema=z.enum(["DRAFT","VERIFIED","PUBLISHED","DEPRECATED"]);
const propertySchema=z.object({id:z.string().min(1).max(256),name:z.string().min(1).max(256),label:z.string().min(1).max(256),description:z.string().max(2000),dataType:z.string().min(1).max(128),sourceColumn:z.string().min(1).max(256),sensitive:z.boolean(),meaning:z.enum(["ID","CODE","NAME","ENTITY_REFERENCE","CATEGORY","TIME","NUMBER","BOOLEAN","GEOGRAPHY","TEXT"]),unique:z.boolean(),valueSearchable:z.boolean(),numericSpec:z.object({kind:z.enum(["GENERAL","CURRENCY","RATIO"]),unit:z.string().max(64).optional(),currency:z.string().max(16).optional(),defaultAggregation:z.enum(["SUM","AVG","MIN","MAX","NONE"]),aggregationBehavior:z.enum(["ADDITIVE","SEMI_ADDITIVE","NON_ADDITIVE"])}).optional(),visibility:z.enum(["ANALYTICAL","DETAIL_ONLY","HIDDEN"]),synonyms:z.array(z.string().max(128)).max(100),defaultDisplay:z.boolean(),exportable:z.boolean(),bindingPriority:z.number().int().min(0).max(1000)});
const objectSchema=z.object({id:z.string().min(1).max(256),name:z.string().min(1).max(256),label:z.string().min(1).max(256),description:z.string().max(2000),sourceTableId:z.string().min(1).max(512),status:entityStatusSchema,objectType:z.enum(["ENTITY","EVENT","SNAPSHOT","AGGREGATE","RELATIONSHIP"]),grainPropertyIds:z.array(z.string().min(1).max(256)).max(64),grain:z.string().min(1).max(1000),defaultTimePropertyId:z.string().min(1).max(256).optional(),defaultFilter:z.string().max(4000).optional(),synonyms:z.array(z.string().max(128)).max(100),bindingPriority:z.number().int().min(0).max(1000),properties:z.array(propertySchema).max(2000)});
const metricSchema=z.object({id:z.string().min(1).max(256),metricType:z.enum(["BASE","DERIVED"]),name:z.string().min(1).max(256),label:z.string().min(1).max(256),description:z.string().max(2000),objectId:z.string().min(1).max(256),definitionMode:z.enum(["VISUAL","SQL"]),expression:z.string().max(4000),sourcePropertyId:z.string().min(1).max(256).optional(),filterExpression:z.string().max(4000).optional(),aggregation:z.enum(["SUM","COUNT","COUNT_DISTINCT","AVG","MIN","MAX","CUSTOM"]),leftMetricId:z.string().min(1).max(256).optional(),rightMetricId:z.string().min(1).max(256).optional(),calculationOperator:z.enum(["ADD","SUBTRACT","MULTIPLY","DIVIDE","RATIO"]).optional(),scale:z.number().finite().optional(),format:z.enum(["currency","number","percent"]),unit:z.string().max(64).optional(),synonyms:z.array(z.string().max(128)).max(100),status:entityStatusSchema});
const relationSchema=z.object({id:z.string().min(1).max(256),name:z.string().min(1).max(256),sourceObjectId:z.string().min(1).max(256),targetObjectId:z.string().min(1).max(256),type:z.enum(["REFERENCE","COMPOSITION","ASSOCIATION","HIERARCHY","EVENT_PARTICIPATION","IDENTITY","DERIVED"]),cardinality:z.enum(["ONE_TO_ONE","ONE_TO_MANY","MANY_TO_ONE","MANY_TO_MANY"]),sourcePropertyId:z.string().min(1).max(256),targetPropertyId:z.string().min(1).max(256),joinExpression:z.string().min(1).max(4000),direction:z.enum(["BIDIRECTIONAL","SOURCE_TO_TARGET","TARGET_TO_SOURCE"]),required:z.boolean(),enabled:z.boolean(),fanoutRisk:z.enum(["NONE","LOW","HIGH"]),composition:z.object({parentObjectId:z.string().min(1).max(256),childObjectId:z.string().min(1).max(256),ownership:z.enum(["OWNED","SHARED"]),aggregationPolicy:z.enum(["PRE_AGGREGATE_CHILD","EXISTS_ONLY"])}).optional(),status:entityStatusSchema});
const ontologySnapshotSchema=z.object({schemaVersion:z.literal(2),version:z.number().int().positive(),baseVersion:z.number().int().positive().optional(),status:entityStatusSchema,publishedAt:z.string().datetime().optional(),objects:z.array(objectSchema).max(500),relations:z.array(relationSchema).max(2000),metrics:z.array(metricSchema).max(2000),dimensionHierarchies:z.array(z.object({id:z.string().min(1).max(256),label:z.string().min(1).max(256),kind:z.enum(["FIXED_LEVELS","ADJACENCY_LIST"]),status:entityStatusSchema})).max(500)});

function requireRole(principal:Principal|null,roles:Role[]){if(!principal||!roles.includes(principal.role))throw Object.assign(new Error("权限不足"),{statusCode:403});}
function sourceWithSecret(input:z.infer<typeof sourceSchema>):{source:MaxComputeSource;secret:MaxComputeSecret}{
  const existing=store.source();
  const previous=existing?store.secret(existing.id):null;
  const oldSecret=previous?secrets.decrypt<MaxComputeSecret>(previous):null;
  const secret={accessId:input.accessId||oldSecret?.accessId||"",accessKey:input.accessKey||oldSecret?.accessKey||"",stsToken:input.stsToken||oldSecret?.stsToken};
  if(!secret.accessId||!secret.accessKey)throw Object.assign(new Error("首次保存必须填写 AccessKey ID 与 AccessKey Secret"),{statusCode:400});
  return {source:{id:existing?.id||randomUUID(),name:input.name,endpoint:input.endpoint,project:input.project,schema:input.schema||undefined,quota:input.quota||undefined,status:"UNTESTED",credentialStored:true},secret};
}
function safeError(error:unknown){return error instanceof Error?error.message:"操作失败";}
function audit(principal:Principal,action:string,resource:string,outcome:"SUCCESS"|"FAILED"|"REJECTED",detail:string,started=performance.now()){store.audit({actor:principal.username,action,resource,outcome,detail,durationMs:Math.round(performance.now()-started)});}
function emptySnapshot(version=1):OntologySnapshot{return {schemaVersion:2,version,status:"DRAFT",objects:[],relations:[],metrics:[],dimensionHierarchies:[]};}
function validateCatalogBindings(snapshot:OntologySnapshot){const issues:ReturnType<typeof validateSnapshot>=[];const catalog=store.tables();for(const object of snapshot.objects){const table=catalog.find(item=>qualifiedTable(item)===object.sourceTableId);if(!table){issues.push({code:"PHYSICAL_TABLE_NOT_FOUND",level:"ERROR",entityId:object.id,message:"对象必须绑定平台目录中已确认的物理表"});continue;}for(const property of object.properties){if(!table.columns.some(column=>column.name===property.sourceColumn))issues.push({code:"PHYSICAL_COLUMN_NOT_FOUND",level:"ERROR",entityId:property.id,message:`物理字段 ${property.sourceColumn} 不存在`});}}return issues;}

app.get("/api/health",async()=>({ok:true,version:"0.2.0"}));
app.post<{Body:unknown}>("/api/auth/login",async(request,reply)=>{const parsed=z.object({username:z.string(),password:z.string()}).safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:"请输入账号和密码"});const principal=store.authenticate(parsed.data.username,parsed.data.password);if(!principal)return reply.code(401).send({message:"账号或密码错误"});const token=store.createSession(principal.id);const csrf=randomBytes(24).toString("base64url");reply.setCookie("semantic_session",token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200});reply.setCookie("semantic_csrf",csrf,{httpOnly:false,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200});audit(principal,"AUTH_LOGIN","session","SUCCESS","登录成功");return {principal,csrf};});
app.post("/api/auth/logout",async(request,reply)=>{store.revokeSession(request.cookies.semantic_session);reply.clearCookie("semantic_session",{path:"/"});reply.clearCookie("semantic_csrf",{path:"/"});return {ok:true};});
app.get("/api/bootstrap",async(request)=>({principal:request.principal,source:store.source(),tables:store.tables(),draft:store.ontology("DRAFT")||emptySnapshot((store.ontology("PUBLISHED")?.version||0)+1),published:store.ontology("PUBLISHED"),audits:store.audits(),users:request.principal?.role==="ADMIN"?store.users():[]}));

app.post<{Body:unknown}>("/api/users",async(request,reply)=>{requireRole(request.principal,["ADMIN"]);const parsed=userSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:parsed.error.issues[0]?.message});try{const user=store.createUser(parsed.data);audit(request.principal!,"USER_CREATED",user.username,"SUCCESS",`角色 ${user.role}`);return reply.code(201).send(user);}catch(error){return reply.code(409).send({message:safeError(error)});}});

app.post<{Body:unknown}>("/api/data-source/test",async(request,reply)=>{requireRole(request.principal,["ADMIN"]);const parsed=sourceSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:parsed.error.issues[0]?.message});const started=performance.now();try{const {source,secret}=sourceWithSecret(parsed.data);const result=await maxCompute.run("test",source,secret,{},20_000);audit(request.principal!,"SOURCE_TESTED",source.name,"SUCCESS",`Project ${source.project}`,started);return {ok:true,...result};}catch(error){audit(request.principal!,"SOURCE_TESTED",parsed.data.name,"FAILED",safeError(error),started);return reply.code((error as {statusCode?:number}).statusCode||422).send({message:safeError(error)});}});
app.put<{Body:unknown}>("/api/data-source",async(request,reply)=>{requireRole(request.principal,["ADMIN"]);const parsed=sourceSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:parsed.error.issues[0]?.message});const started=performance.now();try{const {source,secret}=sourceWithSecret(parsed.data);await maxCompute.run("test",source,secret,{},20_000);const saved={...source,status:"CONNECTED" as const,lastTestedAt:new Date().toISOString()};store.saveSource(saved,secrets.encrypt(secret));audit(request.principal!,"SOURCE_SAVED",source.name,"SUCCESS",`Project ${source.project}`,started);return {source:saved};}catch(error){audit(request.principal!,"SOURCE_SAVED",parsed.data.name,"FAILED",safeError(error),started);return reply.code((error as {statusCode?:number}).statusCode||422).send({message:safeError(error)});}});

async function findTable(tableName:string){const source=store.source();if(!source)throw Object.assign(new Error("请先配置 MaxCompute 数据源"),{statusCode:409});const envelope=store.secret(source.id);if(!envelope)throw new Error("数据源凭据不可用");return {source,result:await maxCompute.run("find_table",source,secrets.decrypt<MaxComputeSecret>(envelope),{tableName},30_000)};}
app.post<{Body:unknown}>("/api/catalog/find",async(request,reply)=>{requireRole(request.principal,["ADMIN","MODELER"]);const parsed=tableNameSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:"请输入准确的表名"});try{const {result}=await findTable(parsed.data.tableName);audit(request.principal!,"TABLE_LOOKED_UP",parsed.data.tableName,"SUCCESS",result.found?"已找到":"未找到");return result;}catch(error){audit(request.principal!,"TABLE_LOOKED_UP",parsed.data.tableName,"FAILED",safeError(error));return reply.code((error as {statusCode?:number}).statusCode||422).send({message:safeError(error)});}});
app.post<{Body:unknown}>("/api/catalog/add",async(request,reply)=>{requireRole(request.principal,["ADMIN","MODELER"]);const parsed=tableNameSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:"请输入准确的表名"});try{const {source,result}=await findTable(parsed.data.tableName);if(!result.found||!result.table)return reply.code(404).send({message:"MaxCompute 中未找到该表"});const raw=result.table as Omit<PhysicalTable,"id"|"sourceId"|"fingerprint"|"addedAt">;const fingerprint=createHash("sha256").update(JSON.stringify(raw)).digest("hex");const table:PhysicalTable={...raw,id:createHash("sha256").update(`${source.id}:${raw.name}`).digest("hex").slice(0,24),sourceId:source.id,fingerprint,addedAt:new Date().toISOString()};store.saveTables([table]);audit(request.principal!,"TABLE_ADDED",table.name,"SUCCESS",`${table.columns.length} 个字段`);return {table};}catch(error){audit(request.principal!,"TABLE_ADDED",parsed.data.tableName,"FAILED",safeError(error));return reply.code((error as {statusCode?:number}).statusCode||422).send({message:safeError(error)});}});

app.post<{Body:unknown}>("/api/ontology/from-table",async(request,reply)=>{
  requireRole(request.principal,["ADMIN","MODELER"]);
  const parsed=z.union([modelTableInputSchema,z.object({tables:z.array(modelTableInputSchema).min(1).max(100)})]).safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({message:"建模参数不完整"});
  const inputs="tables" in parsed.data?parsed.data.tables:[parsed.data];
  if(new Set(inputs.map(input=>input.tableId)).size!==inputs.length)return reply.code(400).send({message:"物理表不能重复选择"});
  const catalog=store.tables();
  const selected=inputs.map(input=>({input,table:catalog.find(table=>table.id===input.tableId)}));
  if(selected.some(item=>!item.table))return reply.code(404).send({message:"存在已失效的物理表，请刷新后重试"});
  const draft=store.ontology("DRAFT")||emptySnapshot((store.ontology("PUBLISHED")?.version||0)+1);
  const modeledTables=new Set(draft.objects.map(object=>object.sourceTableId));
  const repeated=selected.find(item=>modeledTables.has(qualifiedTable(item.table!)));
  if(repeated)return reply.code(409).send({message:`${repeated.table!.name} 已经加入当前草稿`});

  const objects:OntologyObject[]=selected.map(({input,table:resolvedTable})=>{
    const table=resolvedTable!;
    const objectType=input.objectType||inferObjectType(table.name,table.columns);
    const supportsId=objectType==="ENTITY"||objectType==="EVENT";
    const inferredId=supportsId?(input.idColumn||table.columns.find(column=>/(^|_)(id|key)$/.test(column.name))?.name):undefined;
    const inferredTime=input.timeColumn||table.columns.find(column=>column.partition||/date|time/i.test(column.dataType)||/(^|_)(date|time|dt|at)$/.test(column.name))?.name;
    const properties:OntologyProperty[]=table.columns.map(column=>{
      const meaning=inferPropertyMeaning(column.name,column.dataType,inferredId,inferredTime);
      return {id:randomUUID(),name:column.name,label:column.comment||column.name,description:column.comment||"",dataType:column.dataType,sourceColumn:column.name,sensitive:/phone|mobile|email|address|id_card|password|secret|token/i.test(column.name),meaning,unique:meaning==="ID",valueSearchable:["CODE","NAME","CATEGORY","GEOGRAPHY"].includes(meaning),visibility:"ANALYTICAL",synonyms:[],defaultDisplay:meaning==="NAME",exportable:true,bindingPriority:50,...(meaning==="NUMBER"?{numericSpec:{kind:"GENERAL" as const,defaultAggregation:"SUM" as const,aggregationBehavior:"ADDITIVE" as const}}:{})};
    });
    const id=properties.find(property=>property.meaning==="ID");
    const time=properties.find(property=>property.meaning==="TIME");
    const fallbackGrain=properties.filter(property=>property.meaning!=="NUMBER").slice(0,2);
    const grainProperties=id?[id]:(time?[time]:fallbackGrain);
    const label=input.label||table.comment||table.name;
    return {id:randomUUID(),name:`object_${table.name}`,label,description:`${label}业务对象`,sourceTableId:qualifiedTable(table),status:"DRAFT",objectType:objectType as ObjectType,grainPropertyIds:grainProperties.map(property=>property.id),grain:grainProperties.length?grainProperties.map(property=>property.label).join(" + "):"待配置业务粒度",defaultTimePropertyId:time?.id,synonyms:[],bindingPriority:50,properties};
  });
  const next={...draft,objects:[...draft.objects,...objects]};
  store.saveOntology(next);
  audit(request.principal!,"ONTOLOGY_OBJECTS_CREATED",`${objects.length} 个对象`,"SUCCESS",objects.map(object=>object.label).join("、"));
  return {draft:next,validation:validateSnapshot(next)};
});
app.put<{Body:unknown}>("/api/ontology/draft",async(request,reply)=>{requireRole(request.principal,["ADMIN","MODELER"]);const parsed=ontologySnapshotSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:"本体草稿格式无效"});const snapshot=parsed.data as OntologySnapshot;if(snapshot.status!=="DRAFT")return reply.code(400).send({message:"只能保存草稿"});const validation=[...validateSnapshot(snapshot),...validateCatalogBindings(snapshot)];store.saveOntology(snapshot);audit(request.principal!,"ONTOLOGY_DRAFT_SAVED",`v${snapshot.version}`,"SUCCESS",`${snapshot.objects.length} 个对象`);return {draft:snapshot,validation};});
app.post("/api/ontology/publish",async(request,reply)=>{requireRole(request.principal,["ADMIN","MODELER"]);const draft=store.ontology("DRAFT");if(!draft)return reply.code(409).send({message:"当前没有草稿"});const validation=[...validateSnapshot(draft),...validateCatalogBindings(draft)];if(validation.some(issue=>issue.level==="ERROR")){audit(request.principal!,"ONTOLOGY_PUBLISHED",`v${draft.version}`,"REJECTED",`${validation.length} 项校验结果`);return reply.code(422).send({message:"草稿未通过校验",validation});}const published={...draft,status:"PUBLISHED" as const,publishedAt:new Date().toISOString(),objects:draft.objects.map(o=>({...o,status:"PUBLISHED" as const})),metrics:draft.metrics.map(m=>({...m,status:"PUBLISHED" as const})),relations:draft.relations.map(r=>({...r,status:"PUBLISHED" as const}))};store.saveOntology(published);audit(request.principal!,"ONTOLOGY_PUBLISHED",`v${published.version}`,"SUCCESS",`${published.objects.length} 个对象`);return {published};});

app.post<{Body:unknown}>("/api/query/execute",async(request,reply)=>{requireRole(request.principal,["ADMIN","MODELER","ANALYST"]);const parsed=z.object({metricId:z.string(),dimensionId:z.string().optional(),timeGrain:z.enum(["DAY","WEEK","MONTH","QUARTER","YEAR"]).optional()}).safeParse(request.body);if(!parsed.success)return reply.code(400).send({message:"查询参数不完整"});const snapshot=store.ontology("PUBLISHED");const source=store.source();if(!snapshot||!source)return reply.code(409).send({message:"请先完成数据接入并发布本体"});const envelope=store.secret(source.id);if(!envelope)return reply.code(409).send({message:"数据源凭据不可用"});const started=performance.now();try{const plan=compilePlan(snapshot,{query:"",...parsed.data});let index=0;const parameters:Record<string,unknown>={};const sql=plan.sql.replace(/\?/g,()=>{const name=`p${index}`;parameters[name]=plan.params[index++];return `:${name}`;});if(!/^SELECT\b/i.test(sql.trim())||sql.includes(";"))throw new Error("查询未通过只读检查");const result=await maxCompute.run("query",source,secrets.decrypt<MaxComputeSecret>(envelope),{sql,parameters,maxRows:200},180_000);audit(request.principal!,"QUERY_EXECUTED",plan.planId,"SUCCESS",String(result.instanceId||""),started);return {plan:{...plan,sql},result};}catch(error){audit(request.principal!,"QUERY_EXECUTED","semantic-query","FAILED",safeError(error),started);return reply.code(422).send({message:safeError(error)});}});
app.get("/api/audits",async()=>({audits:store.audits()}));

function qualifiedTable(table:PhysicalTable){return [table.project,(table as PhysicalTable&{schema?:string}).schema,table.name].filter(Boolean).join(".");}

const webRoot=path.resolve("dist");
if(process.env.NODE_ENV==="production"&&fs.existsSync(path.join(webRoot,"index.html"))){await app.register(fastifyStatic,{root:webRoot});app.setNotFoundHandler((request,reply)=>request.url.startsWith("/api/")?reply.code(404).send({message:"API 不存在"}):reply.sendFile("index.html"));}
const shutdown=async()=>{store.close();await app.close();};process.once("SIGINT",()=>void shutdown());process.once("SIGTERM",()=>void shutdown());
await app.listen({host:process.env.HOST||"127.0.0.1",port:Number(process.env.PORT||4310)});
