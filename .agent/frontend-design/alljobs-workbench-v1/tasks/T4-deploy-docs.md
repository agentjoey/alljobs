# T4 · deploy-docs — 本地常驻 + Cloudflare Tunnel/Zero Trust 部署套件

## 背景（必读）

`PRODUCT.md`（部署形态已确认：本地常驻 Next.js server + cloudflared tunnel → alljobs.agentjoey.ai，Cloudflare Access 邮件验证码承担全部登录；应用内零鉴权代码）+ brief.md「验证与回滚计划」。

**纯文档与模板任务，不改 app 代码**（package.json 仅允许加 `"start:prod": "next start -p 3456"` 一条脚本）。

## 交付物

1. `docs/deployment.md` —— 一步步可照做：
   - 本地：`npm run build && npm run start:prod`（端口 3456 为本项目约定）
   - launchd 常驻：引用 `deploy/com.agentjoey.alljobs.plist`（模板含 WorkingDirectory、KeepAlive、日志路径 ~/Library/Logs/alljobs/）与加载/卸载命令
   - cloudflared：安装（brew）、`cloudflared tunnel login`/`create alljobs`、`deploy/cloudflared-config.example.yml`（ingress: alljobs.agentjoey.ai → http://localhost:3456）、DNS 路由命令、以及 cloudflared 自身 launchd 常驻
   - Zero Trust Access：dashboard 建 Access Application（域名 alljobs.agentjoey.ai）、策略=Email OTP 仅允许 theagentjoey@gmail.com、会话时长建议；**标注哪些步骤必须 Human 在 dashboard 登录操作**
   - 安全注记：tunnel 凭证文件位置与权限、绝不入 git（.gitignore 补 deploy/*.json 凭证类）、日志不含敏感数据
   - 回滚/故障：停 tunnel（服务下线数据无损）、git revert + 重启、健康检查一行 curl
2. `deploy/com.agentjoey.alljobs.plist` 与 `deploy/cloudflared-config.example.yml` 模板（占位符用 <> 标注）
3. `README.md` 重写为本项目说明：一句产品定位、数据层约定（指向 data/README.md）、常用命令（dev/build/start:prod/test）、部署指向 docs/deployment.md、`.agent/` 记录说明

## 验收

- `npm run lint && npm run build && npm test` 全绿（不应受影响）
- deploy.md 里每条命令语法正确、路径真实；plist 与 yml 模板可直接替换占位符使用
- 明确区分「agent 可代办」与「必须 Human 在 Cloudflare dashboard 操作」两类步骤

## 证据

文件清单 + deploy.md 目录结构；plist/yml lint（plutil -lint / cloudflared --config validate 若可用）。
