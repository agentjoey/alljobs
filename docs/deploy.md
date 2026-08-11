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

`start:prod` = `next start -p 3456`（3456 为本项目约定端口）。验证：

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

写配置：以 `deploy/cloudflared-config.example.yml` 为模板，替换 `<TUNNEL_ID>` 与 `<USERNAME>` 后放到 cloudflared 的服务配置位置：

```bash
sudo mkdir -p /opt/homebrew/etc/cloudflared
# 替换占位符后：
sudo cp <替换好的config.yml> /opt/homebrew/etc/cloudflared/config.yml
```

ingress 含义：`alljobs.agentjoey.ai` → `http://localhost:3456`；末行 `http_status:404` 是兜底，必须保留。

DNS 路由（自动在 Cloudflare DNS 建 CNAME）【Agent】：

```bash
cloudflared tunnel route dns alljobs alljobs.agentjoey.ai
```

cloudflared 常驻（launchd，登录即起、崩溃自愈）【Agent】：

```bash
sudo brew services start cloudflared
```

（卸载用 `sudo brew services stop cloudflared`。Homebrew 服务读取 `/opt/homebrew/etc/cloudflared/config.yml`。）

验证 tunnel：

```bash
cloudflared tunnel list                      # 应看到 alljobs = <TUNNEL_ID>
curl -s -o /dev/null -w "%{http_code}\n" https://alljobs.agentjoey.ai/
```

Access 配好之前，最后一条应返回 **302**（Cloudflare Access 登录跳转）；配好后未登录同样是 302，通过 Access 后是 200。

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
- **访问控制边界**：应用本身零鉴权——安全完全依赖 ① tunnel 是唯一入口（本机 3456 不对局域网暴露，Next 默认只绑 localhost 语义下请勿加 `-H 0.0.0.0`）② Access 策略仅放行一个邮箱。

## 6. 回滚与故障

- **停 tunnel（服务下线，数据无损）**：

```bash
sudo brew services stop cloudflared
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

- **排障**：应用日志 `~/Library/Logs/alljobs/stderr.log`；cloudflared 日志 `sudo brew services info cloudflared` 看路径（或 `cloudflared tunnel list` 确认 tunnel 存活）；页面 502 先查 launchd 应用是否在跑（`launchctl list | grep alljobs`）。
