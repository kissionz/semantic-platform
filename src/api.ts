import type { OntologySnapshot, ValidationIssue } from "./domain/types";

export interface Principal {id:string;username:string;displayName:string;role:"ADMIN"|"MODELER"|"ANALYST"|"VIEWER"}
export interface Source {id:string;name:string;endpoint:string;project:string;schema?:string;quota?:string;status:string;lastTestedAt?:string;credentialStored:boolean}
export interface Table {id:string;sourceId:string;project:string;schema?:string;name:string;type:"TABLE"|"VIEW";comment?:string;columns:Array<{name:string;dataType:string;nullable:boolean;comment?:string;partition:boolean}>;fingerprint:string;addedAt:string}
export interface Audit {id:string;at:string;actor:string;action:string;resource:string;outcome:string;detail:string;durationMs:number}
export interface Bootstrap {principal:Principal;source:Source|null;tables:Table[];draft:OntologySnapshot;published:OntologySnapshot|null;audits:Audit[];users:Principal[]}
let csrf="";
function cookie(name:string){return document.cookie.split("; ").find(value=>value.startsWith(`${name}=`))?.split("=")[1]||"";}
async function request<T>(url:string,options:RequestInit={}):Promise<T>{const response=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.method&&options.method!=="GET"?{"X-CSRF-Token":csrf||decodeURIComponent(cookie("semantic_csrf"))}:{}),...options.headers}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(payload.message||`请求失败 (${response.status})`),{status:response.status,payload});return payload as T;}
export const api={
  login:async(username:string,password:string)=>{const result=await request<{principal:Principal;csrf:string}>("/api/auth/login",{method:"POST",body:JSON.stringify({username,password})});csrf=result.csrf;return result;},
  logout:()=>request("/api/auth/logout",{method:"POST"}),
  bootstrap:()=>request<Bootstrap>("/api/bootstrap"),
  testSource:(input:Record<string,unknown>)=>request<{ok:boolean;project:string}>("/api/data-source/test",{method:"POST",body:JSON.stringify(input)}),
  saveSource:(input:Record<string,unknown>)=>request<{source:Source}>("/api/data-source",{method:"PUT",body:JSON.stringify(input)}),
  findTable:(tableName:string)=>request<{found:boolean;table?:Omit<Table,"id"|"sourceId"|"fingerprint"|"addedAt">}>("/api/catalog/find",{method:"POST",body:JSON.stringify({tableName})}),
  addTable:(tableName:string)=>request<{table:Table}>("/api/catalog/add",{method:"POST",body:JSON.stringify({tableName})}),
  modelTables:(input:{tables:Array<{tableId:string;label?:string;objectType?:string;idColumn?:string;timeColumn?:string}>})=>request<{draft:OntologySnapshot;validation:ValidationIssue[]}>("/api/ontology/from-table",{method:"POST",body:JSON.stringify(input)}),
  saveDraft:(draft:OntologySnapshot)=>request<{draft:OntologySnapshot;validation:ValidationIssue[]}>("/api/ontology/draft",{method:"PUT",body:JSON.stringify(draft)}),
  publish:()=>request<{published:OntologySnapshot}>("/api/ontology/publish",{method:"POST"}),
  execute:(input:Record<string,unknown>)=>request<{plan:{planId:string;ontologyVersion:number;sql:string};result:{instanceId:string;columns:string[];rows:Record<string,unknown>[];truncated:boolean;durationMs:number}}>("/api/query/execute",{method:"POST",body:JSON.stringify(input)}),
  createUser:(input:Record<string,unknown>)=>request<Principal>("/api/users",{method:"POST",body:JSON.stringify(input)}),
};
