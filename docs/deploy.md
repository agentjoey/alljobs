# 部署 — alljobs（本地常驻 + Cloudflare Tunnel/Zero Trust）

架构：本机 macOS 常驻 `next start`（端口 **3456**）→ cloudflared tunnel 把 `alljobs.agentjoey.ai` 指到本机 → Cloudflare Access 邮件验证码承担全部登录。**应用内零鉴权代码**（见 PRODUCT.md）。

步骤标签：

- **【Agent】** = agent 可代办（命令行即可完成的步骤）
- **【Human】** = 必须由 Human 在浏览器/Cloudflare dashboard 登录操作的步骤

## 0. 前置（一次性）

- macOS，已装 Node（本 repo `npm run build` 通过）。
- 一个 Cloudflare 账号，且 `agentjoey.ai` 域名已由 Cloudflare 托管 DNS。
- 日志目录：

```bash
mkdir -p ~/Library/Logs/alljobs
```

## 1. 本地运行【Agent】

```bash
npm run build && npm run start:prod
```

`start:prod` = `next start -p 3456 -H 127.0.0.1`（3456 为本项目约定端口；**`-H 127.0.0.1` 必须保留**：Next 的 `--hostname` 默认是 `0.0.0.0`，不显式绑回环地址会把应用对整个局域网零鉴权敞开，见 §5）。验证：

```bash
curl -fsS http://localhost:3456/ >/dev/null && echo ok
```

## 2. launchd 常驻（应用本体）【Agent】

模板：`deploy/com.agentjoey.alljobs.plist`。先把 `<>` 占位符替换为真实值：

- `<NODE_BIN_DIR>`：`dirname "$(which npm)"` 的输出（Homebrew Node 通常是 `/opt/homebrew/bin`）
- `<REPO_ABS_PATH>`：本 repo 的绝对路径（`pwd`）
- `<USERNAME>`：`whoami`

替换后安装并加载：

```bash
cp deploy/com.agentjoey.alljobs.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
```

卸载/重载：

```bash
launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist   # 停
launchctl load   ~/Library/LaunchAgents/com.agentjoey.alljobs.plist   # 起
```

`KeepAlive=true` 保证崩溃自动拉起，`RunAtLoad=true` 保证登录即启动。日志在 `~/Library/Logs/alljobs/{stdout,stderr}.log`。

## 3. cloudflared tunnel【Agent 可代办，login 一步需 Human 点链接】

安装：

```bash
brew install cloudflared
```

登录（会打印一个 https://dashboard.cloudflare.com/… 链接）：

```bash
cloudflared tunnel login
```

**【Human 必做】** 在浏览器打开该链接，登录 Cloudflare 并选择 `agentjoey.ai` 域名授权。完成后 `~/.cloudflared/cert.pem` 就位。

创建 tunnel 并记下输出的 Tunnel ID（UUID）【Agent】：

```bash
cloudflared tunnel create alljobs
```

此命令生成凭证文件 `~/.cloudflared/<TUNNEL_ID>.json`。

写配置：以 `deploy/cloudflared-config.example.yml` 为模板，替换 `<TUNNEL_ID>` 与 `<USERNAME>` 后放到 `~/.cloudflared/config.yml`（与 cert.pem、凭证 json 同目录）：

```bash
# 替换占位符后：
cp <替换好的config.yml> ~/.cloudflared/config.yml
```

ingress 含义：`alljobs.agentjoey.ai` → `http://localhost:3456`；末行 `http_status:404` 是兜底，必须保留。单主机名、单源站——不做公网预览子域名（曾短暂试过 `alljobs-preview.agentjoey.ai`，`cloudflared tunnel route dns` 报告成功但记录从未在 dashboard 落地，原因未查明；改版分支的设计评审改为本地/截图方式，不再经隧道对外暴露）。

**当前实际配置**：主仓库 `main`（工作底账版，已通过独立 Verification）→ `:3456`，launchd `com.agentjoey.alljobs` 常驻，开机自起。改分支时若需要并行跑一份不影响生产，用 `git worktree` 另开工作副本在别的端口本地起（Turbopack 不接受软链的 node_modules，worktree 需 `npm install` 装一份真实依赖），跑完销毁，不接入隧道。

cloudflared 常驻（launchd，登录即起、崩溃自愈）【Agent】：

模板：`deploy/com.agentjoey.cloudflared.plist`。把 `<CLOUDFLARED_BIN>`（`which cloudflared`，如 `/opt/homebrew/bin/cloudflared`）与 `<USERNAME>` 替换为真实值后：

```bash
cp deploy/com.agentjoey.cloudflared.plist ~/Library/LaunchAgents/   # 替换占位符后的文件
launchctl load ~/Library/LaunchAgents/com.agentjoey.cloudflared.plist
```

（卸载用 `launchctl unload ~/Library/LaunchAgents/com.agentjoey.cloudflared.plist`。）

> **为什么不用 `brew services` 或 `cloudflared service install`**：cloudflared 2026.x 裸跑（不带参数）不会启动 tunnel，只打印 "Use `cloudflared tunnel run` to start tunnel" 并退出；而 Homebrew 的 service 定义与 `cloudflared service install` 生成的 plist 都是裸跑形态，两者实测均空转（exit 1 崩溃循环）。必须用本模板这样显式带 `tunnel --config … run` 参数的 LaunchAgent。日志在 `~/.cloudflared/logs/alljobs.{log,err}`。

> **⚠️ 暴露窗口警告**：从此刻起到 §4 Access 策略建好之前，`route dns` 一执行应用就对**整个互联网零鉴权敞开**（没有 Access 拦截时公网访问直接拿到 200）。因此**推荐顺序：先做完 §4 建好 Access 策略，再回来执行下面的 DNS 路由**；若先跑本节，请在 §4 完成前先别执行 `route dns`。

DNS 路由（自动在 Cloudflare DNS 建 CNAME）【Agent】：

```bash
cloudflared tunnel route dns alljobs alljobs.agentjoey.ai
```

验证 tunnel：

```bash
cloudflared tunnel list                      # 应看到 alljobs = <TUNNEL_ID>
curl -s -o /dev/null -w "%{http_code}\n" https://alljobs.agentjoey.ai/
```

Access 配好之前，最后一条返回 **200**——这正是上面的暴露窗口：没有 Access 拦截，公网直接拿到应用。§4 配好后未登录访问应变为 **302**（Access 登录跳转），通过 Access 后是 200。

## 4. Zero Trust Access【Human 必做，全程 dashboard】

> 以下每一步都在浏览器 Cloudflare One dashboard（one.dash.cloudflare.com）操作，agent 无法代办。

1. **进入**：one.dash.cloudflare.com → 选账号 → **Access** → **Applications** → **Add an application** → **Self-hosted**。
2. **应用**：Application name 随意（如 `alljobs`）；Session Duration 建议 **24 小时**（手机每天输一次验证码可接受；嫌烦可到 7 天，别更长）；Application domain：Subdomain `alljobs`、Domain `agentjoey.ai`。
3. **策略**：Add a policy → Action = **Allow**；Include 规则选 **Emails**，值 = `theagentjoey@gmail.com`（仅此一个邮箱）。
4. **登录方式**：默认 One-time PIN（邮件验证码）即可，无需额外配置 IdP。
5. 保存后用手机/无痕窗口打开 `https://alljobs.agentjoey.ai/`，应看到 Access 登录页；输邮箱 → 收验证码 → 进入应用。

## 5. 安全注记

- **凭证文件**：`~/.cloudflared/cert.pem`（登录证书）与 `~/.cloudflared/<TUNNEL_ID>.json`（tunnel 凭证）。权限收紧：

```bash
chmod 600 ~/.cloudflared/cert.pem ~/.cloudflared/*.json
```

- **绝不入 git**：tunnel 凭证若导出/复制到 repo，一律放 `deploy/*.json`——`.gitignore` 已忽略该模式，勿提交。
- **日志**：`~/Library/Logs/alljobs/` 与 cloudflared 日志只含请求/运行信息，不含 Access 验证码或用户数据；应用数据（`data/`）只在本机文件系统与 git 历史中。
- **访问控制边界**：应用本身零鉴权——安全完全依赖 ① tunnel 是唯一入口 ② Access 策略仅放行一个邮箱。边界①的成立条件：**Next 的 `--hostname` 默认是 `0.0.0.0`**（见 `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`），即 `next start` 默认对整个局域网敞开，任何同网设备可绕过 Access 直接读写工作台。因此 `start:prod` 与 launchd plist（经 `npm run start:prod`）都显式加了 `-H 127.0.0.1` 绑死回环地址，tunnel 才是唯一入口——**改脚本时请勿去掉这个参数**。

## 6. 回滚与故障

- **停 tunnel（服务下线，数据无损）**：

```bash
launchctl unload ~/Library/LaunchAgents/com.agentjoey.cloudflared.plist
```

数据层是纯文件（`data/`），应用/tunnel 全停也不影响读写；本地 3456 仍可直接访问。

- **应用回滚**：

```bash
git revert <commit>            # 或 git checkout <已知好的commit>
npm run build
launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist && \
launchctl load   ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
```

- **健康检查一行**：

```bash
curl -fsS http://localhost:3456/ >/dev/null && echo ok
```

- **排障**：应用日志 `~/Library/Logs/alljobs/stderr.log`；cloudflared 日志 `~/.cloudflared/logs/alljobs.err`（或 `cloudflared tunnel list` 确认 tunnel 存活、`launchctl list | grep cloudflared` 确认 agent 在跑）；页面 502 先查 launchd 应用是否在跑（`launchctl list | grep alljobs`）。
