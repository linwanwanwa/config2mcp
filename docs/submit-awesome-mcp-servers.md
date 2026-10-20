# 提交到 awesome-mcp-servers 的材料包

## 前置条件（按顺序）

1. **先发布 npm 包**（见下方「发布步骤」）
2. **把项目推到 GitHub**：

```bash
cd cli2mcp
git init && git add -A && git commit -m "feat: config2mcp v0.1.0 — turn any CLI into an MCP server from YAML"
# 在 github.com 上新建仓库 config2mcp（不要初始化 README）
git remote add origin git@github.com:<你的用户名>/config2mcp.git
git branch -M main
git push -u origin main
```

## PR 步骤

1. Fork [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
2. 编辑 fork 的 `README.md`，在 **Server Implementations → Developer tools** 分类的字母序位置插入下面的条目行
3. 开 PR，标题和描述用下面的模板

## 提交的条目行（README.md 中插入）

> 把 `<你的用户名>` 替换成真实 GitHub 用户名。

```markdown
- [<你的用户名>/config2mcp](https://github.com/<你的用户名>/config2mcp) 📇 🏠 🍎 🪟 🐧 - Turn any CLI tool into an MCP server from a single YAML config file. Zero code, no shell (injection-proof argv), bounded execution (timeout + output cap), dry-run mode for safe review. `npx config2mcp serve tools.yaml`
```

图标含义（与列表 Legend 一致）：📇 TypeScript / 🏠 本地服务 / 🍎🪟🐧 跨平台。

## PR 标题

```
Add config2mcp — turn any CLI into an MCP server from YAML
```

## PR 描述模板

```markdown
## What does this PR do?

Adds [config2mcp](https://github.com/<你的用户名>/config2mcp) to **Developer tools**.

config2mcp turns any CLI tool into an MCP server from a single declarative YAML
config file — zero code. Key properties:

- **The config is the allow-list**: only commands declared in the YAML are
  reachable by the agent, making permissions reviewable like code.
- **No shell, ever**: commands are spawned directly; every value becomes
  exactly one argv token, so shell injection is structurally impossible.
- **Bounded execution**: per-tool timeout (default 30 s) and a 256 KiB output
  cap protect the agent's context window.
- **Dry-run mode**: `config2mcp serve --dry-run` prints the argv each call
  would run without executing anything.
- Typed params (string/number/boolean/enum), flag/positional/equals-form
  rendering, JSON output passthrough, 25 unit tests + E2E MCP protocol tests.

Install: `npx config2mcp serve tools.yaml`

## Checklist

- [x] Not a duplicate of an existing entry (the existing `cli2mcp` infers
      schemas from `--help` output automatically; config2mcp is declarative —
      the author hand-curates exactly which commands/flags the agent may use,
      a different trust model for a security-sensitive gateway.)
- [x] The repo is public and has a README with install/usage instructions
- [x] Entry placed in alphabetical order within its section
```

## 配置自动发布（GitHub Actions）

发版完全自动化：推 `v*` tag → 跑全量测试 → npm publish → GitHub Release。

一次性配置（GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret）：

- Name: `NPM_TOKEN`
- Value: 在 npmjs.com → Access Tokens → Generate New Token（选 **Publish** 类型）复制

之后发版只需：

```bash
npm version patch   # 或 minor / major
git push --tags
```

## 发布 npm 的步骤（需要你本机操作，含浏览器 OTP）

```bash
cd cli2mcp
npm login          # 浏览器打开 npmjs.com 完成 OTP 授权
npm publish        # 包名 config2mcp 已确认可用
```

如果 `~/.npm` 权限报错（这台机器有这个问题），先修：

```bash
sudo chown -R $(whoami) ~/.npm
```

## 发布后自查

```bash
npx config2mcp validate examples/ffmpeg.yaml   # 应输出 ✓ valid — 3 tool(s)
npm view config2mcp version                     # 应输出 0.1.0
```

## 其他流量入口（发布后顺手做）

- [ ] 提交到 [glama.ai/mcp/servers](https://glama.ai/mcp/servers)（页面右上角有提交入口）
- [ ] 提交到 [PulseMCP](https://www.pulsemcp.com/) 的 server 目录
- [ ] 发一篇 r/ClaudeAI 或 r/mcp 的帖子（附 demo GIF）
