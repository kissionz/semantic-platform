import { spawn } from "node:child_process";
import path from "node:path";
import type { MaxComputeSource } from "./store.js";

export interface MaxComputeSecret { accessId:string; accessKey:string; stsToken?:string }
type RunnerResult = Record<string, unknown> & { error?:string };

export class MaxComputeClient {
  constructor(private readonly runner=path.resolve("src/server/maxcompute_runner.py")){}
  run(action:string,source:MaxComputeSource,secret:MaxComputeSecret,input:Record<string,unknown>={},timeoutMs=180_000):Promise<RunnerResult>{
    return new Promise((resolve,reject)=>{
      const child=spawn(process.env.PYTHON_BIN||"python3",[this.runner],{stdio:["pipe","pipe","pipe"]});
      let stdout="",stderr="";
      const timer=setTimeout(()=>{child.kill("SIGTERM");reject(new Error("MaxCompute 操作超时"));},timeoutMs);
      child.stdout.setEncoding("utf8").on("data",chunk=>stdout+=chunk);
      child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
      child.on("error",error=>{clearTimeout(timer);reject(error);});
      child.on("close",code=>{clearTimeout(timer);try{const result=JSON.parse(stdout.trim()||"{}");if(code!==0||result.error)reject(new Error(result.error||stderr.trim()||"MaxCompute 操作失败"));else resolve(result);}catch(error){reject(new Error(stderr.trim()||`MaxCompute 返回无效: ${String(error)}`));}});
      child.stdin.end(JSON.stringify({action,source,secret,...input}));
    });
  }
}
