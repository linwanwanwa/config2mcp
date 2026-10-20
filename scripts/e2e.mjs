import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "examples/git.yaml");
const proc = spawn(process.execPath, [path.join(root, "dist/index.js"), "serve", configPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const pending = new Map();
let id = 0;
proc.stdout.on("data", d => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});
let stderrAll = "";
proc.stderr.on("data", d => { stderrAll += d.toString(); });

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const myId = ++id;
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15000);
    pending.set(myId, msg => { clearTimeout(timer); resolve(msg); });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}

// 造一个临时 git 仓库当测试目标
const repo = mkdtempSync(path.join(tmpdir(), "e2e-repo-"));
function run(cmd, argsArr) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argsArr);
    let err = "";
    p.stderr.on("data", d => { err += d; });
    p.on("close", code => code === 0 ? resolve() : reject(new Error(cmd + " failed: " + err)));
  });
}
await run("git", ["init", "-q", repo]);
// git 需要身份才能 commit；空仓库无 commit 也能 status，直接用 status 验证即可


const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "e2e-test", version: "0.0.1" },
});
console.log("== initialize ==");
console.log(JSON.stringify(init.result?.serverInfo), "protocol:", init.result?.protocolVersion);

proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const list = await rpc("tools/list", {});
console.log("\n== tools/list ==");
for (const t of list.result.tools) {
  console.log(`- ${t.name}: ${(t.description ?? "").split("\n")[0].slice(0, 70)}`);
  console.log(`  required: ${JSON.stringify(t.inputSchema.required ?? [])}, props: ${Object.keys(t.inputSchema.properties ?? {}).join(", ")}`);
}

const call1 = await rpc("tools/call", { name: "git_status", arguments: { repoPath: repo } });
console.log("\n== tools/call git_status (fresh repo) ==");
console.log((call1.result?.content?.[0]?.text ?? "").slice(0, 200));

const call2 = await rpc("tools/call", { name: "git_status", arguments: { repoPath: "/definitely/not/a/repo" } });
console.log("\n== tools/call git_status (bad path → graceful failure) ==");
console.log((call2.result?.content?.[0]?.text ?? "").slice(0, 220));
console.log("isError:", call2.result?.isError);

const call3 = await rpc("tools/call", { name: "git_log", arguments: { repoPath: repo, count: "5" } });
console.log("\n== tools/call git_log ==");
console.log((call3.result?.content?.[0]?.text ?? "").slice(0, 200));

// dry-run 模式：另一个 server 实例
const proc2 = spawn(process.execPath, [path.join(root, "dist/index.js"), "serve", path.join(root, "examples/git.yaml"), "--dry-run"], {
  stdio: ["pipe", "pipe", "pipe"],
});
let buf2 = "";
const pending2 = new Map();
let id2 = 100;
proc2.stdout.on("data", d => {
  buf2 += d.toString();
  let idx2;
  while ((idx2 = buf2.indexOf("\n")) >= 0) {
    const line = buf2.slice(0, idx2).trim();
    buf2 = buf2.slice(idx2 + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending2.has(msg.id)) {
        pending2.get(msg.id)(msg);
        pending2.delete(msg.id);
      }
    } catch {}
  }
});
function rpc2(method, params) {
  return new Promise((resolve, reject) => {
    const myId = ++id2;
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 15000);
    pending2.set(myId, msg => { clearTimeout(timer); resolve(msg); });
    proc2.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}
await rpc2("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } });
proc2.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const dry = await rpc2("tools/call", { name: "git_status", arguments: { repoPath: tmpdir() } });
console.log("\n== tools/call with --dry-run ==");
console.log((dry.result?.content?.[0]?.text ?? "").slice(0, 200));
console.log("isError:", dry.result?.isError);
proc2.kill();

proc.kill();
console.log("\nstderr:", stderrAll.slice(0, 300) || "(empty)");
