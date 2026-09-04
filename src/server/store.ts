import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import type { OntologySnapshot } from "../domain/types.js";
import { hashPassword, sessionDigest, verifyPassword } from "./security.js";

export type Role = "ADMIN" | "MODELER" | "ANALYST" | "VIEWER";
export interface Principal { id: string; username: string; displayName: string; role: Role }
export interface MaxComputeSource {
  id: string; name: string; endpoint: string; project: string; schema?: string; quota?: string;
  status: "UNTESTED" | "CONNECTED" | "FAILED"; lastTestedAt?: string; lastError?: string; credentialStored: boolean;
}
export interface PhysicalTable { id: string; sourceId: string; project: string; schema?: string; name: string; type: "TABLE" | "VIEW"; comment?: string; columns: Array<{name:string;dataType:string;nullable:boolean;comment?:string;partition:boolean}>; fingerprint:string; addedAt:string }
export interface AuditRecord { id:string; at:string; actor:string; action:string; resource:string; outcome:"SUCCESS"|"FAILED"|"REJECTED"; detail:string; durationMs:number }

type JsonRow = { payload: string };

export class Store {
  readonly db: DatabaseSync;
  readonly initialPassword?: string;

  constructor(stateRoot: string) {
    fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(stateRoot, "platform.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    this.migrate();
    const count = Number((this.db.prepare("SELECT COUNT(*) count FROM users").get() as {count:number}).count);
    if (!count) {
      const configuredPassword = process.env.SEMANTIC_ADMIN_PASSWORD;
      const password = configuredPassword || randomBytes(12).toString("base64url");
      this.db.prepare("INSERT INTO users(id,username,display_name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)")
        .run(randomUUID(), "admin", "平台管理员", "ADMIN", hashPassword(password), new Date().toISOString());
      if (!configuredPassword) this.initialPassword = password;
    }
  }

  authenticate(username:string,password:string):Principal|null {
    const row = this.db.prepare("SELECT * FROM users WHERE username=?").get(username) as Record<string,string>|undefined;
    if (!row || !verifyPassword(password,row.password_hash)) return null;
    return {id:row.id,username:row.username,displayName:row.display_name,role:row.role as Role};
  }
  createSession(userId:string):string {
    const token=randomBytes(32).toString("base64url");
    this.db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(sessionDigest(token),userId,new Date(Date.now()+12*60*60*1000).toISOString());
    return token;
  }
  principal(token?:string):Principal|null {
    if(!token)return null;
    const row=this.db.prepare(`SELECT u.id,u.username,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(sessionDigest(token),new Date().toISOString()) as Record<string,string>|undefined;
    return row?{id:row.id,username:row.username,displayName:row.display_name,role:row.role as Role}:null;
  }
  revokeSession(token?:string){if(token)this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sessionDigest(token));}
  users():Principal[]{return (this.db.prepare("SELECT id,username,display_name,role FROM users ORDER BY username").all() as Record<string,string>[]).map(r=>({id:r.id,username:r.username,displayName:r.display_name,role:r.role as Role}));}
  createUser(input:{username:string;displayName:string;role:Role;password:string}):Principal {const p={id:randomUUID(),username:input.username,displayName:input.displayName,role:input.role};this.db.prepare("INSERT INTO users(id,username,display_name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)").run(p.id,p.username,p.displayName,p.role,hashPassword(input.password),new Date().toISOString());return p;}

  source():MaxComputeSource|null {const row=this.db.prepare("SELECT payload FROM sources LIMIT 1").get() as JsonRow|undefined;return row?JSON.parse(row.payload):null;}
  saveSource(source:MaxComputeSource,secretEnvelope:string){this.db.prepare("INSERT INTO sources(id,payload,secret) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,secret=excluded.secret").run(source.id,JSON.stringify(source),secretEnvelope);}
  secret(sourceId:string):string|null {const row=this.db.prepare("SELECT secret FROM sources WHERE id=?").get(sourceId) as {secret:string}|undefined;return row?.secret??null;}
  saveTables(tables:PhysicalTable[]){const upsert=this.db.prepare("INSERT INTO catalog(id,source_id,name,payload) VALUES(?,?,?,?) ON CONFLICT(source_id,name) DO UPDATE SET id=excluded.id,payload=excluded.payload");this.db.exec("BEGIN");try{for(const table of tables)upsert.run(table.id,table.sourceId,table.name,JSON.stringify(table));this.db.exec("COMMIT");}catch(e){this.db.exec("ROLLBACK");throw e;}}
  tables():PhysicalTable[]{return (this.db.prepare("SELECT payload FROM catalog ORDER BY name").all() as JsonRow[]).map(r=>JSON.parse(r.payload));}
  ontology(status:"DRAFT"|"PUBLISHED"):OntologySnapshot|null {const row=this.db.prepare("SELECT payload FROM ontologies WHERE status=? ORDER BY version DESC LIMIT 1").get(status) as JsonRow|undefined;return row?JSON.parse(row.payload):null;}
  saveOntology(snapshot:OntologySnapshot){this.db.prepare("INSERT INTO ontologies(version,status,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(version,status) DO UPDATE SET payload=excluded.payload").run(snapshot.version,snapshot.status,JSON.stringify(snapshot),new Date().toISOString());}
  audit(record:Omit<AuditRecord,"id"|"at">){const value={...record,id:randomUUID(),at:new Date().toISOString()};this.db.prepare("INSERT INTO audit(id,at,payload) VALUES(?,?,?)").run(value.id,value.at,JSON.stringify(value));}
  audits():AuditRecord[]{return (this.db.prepare("SELECT payload FROM audit ORDER BY at DESC LIMIT 500").all() as JsonRow[]).map(r=>JSON.parse(r.payload));}
  close(){this.db.close();}

  private migrate(){this.db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,payload TEXT NOT NULL,secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,name TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(source_id,name));
    CREATE TABLE IF NOT EXISTS ontologies(version INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(version,status));
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_at ON audit(at DESC);
  `);}
}
