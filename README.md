# OpenTranslator Chrome 扩展

使用自托管 [OpenTranslator](https://github.com/opentranslator/opentranslator) 实例进行 Side Panel 翻译。仅支持私站模式：必须配置实例地址并登录。

## 功能

- **Options**：实例地址、测试连接、登录绑定、退出/更换实例
- **Side Panel**：语言选择、输入防抖自动翻译、SSE 流式译文、复制、语言互换
- **Email 翻译 (Beta)**：Gmail 阅读邮件时注入翻译按钮；整封走 `/api/translate/email`（整封替换或双语对照 HTML），可在原文与译文间切换；自动跳过 DeepL（改用 LLM）
- **Background**：所有 API 在 Service Worker 中执行；凭证仅存 `chrome.storage.local`
- **会话**：打开时校验 token；每 30 分钟自动检查，过期则清除凭证

## 快速开始

```bash
npm install
npm run dev
```

在 Chrome 打开 `chrome://extensions` → 开发者模式 → 加载 `.output/chrome-mv3-dev`。

### CORS / ORIGINS

开发期扩展 ID 固定为 `gjmakoddcjjkfidekkkcmadihemhegfk`（见 `wxt.config.ts` 中的 `manifest.key`）。

在主仓库 `.dev.vars` 配置：

```env
ORIGINS=http://localhost:5173,chrome-extension://gjmakoddcjjkfidekkkcmadihemhegfk
```

详见 [docs/ORIGINS.md](docs/ORIGINS.md)。

### 使用流程

1. 安装后自动打开 Side Panel
2. 在侧边栏填写 `http://localhost:8787`（或你的实例地址）→ 测试连接 → 登录
3. 点击扩展图标打开 Side Panel，输入文本翻译
4. 打开 Gmail 阅读邮件 → 点击邮件旁的 OpenTranslator 按钮 → 整封替换或双语对照写入正文；再点可切回原文

也可通过扩展右键菜单或 `chrome://extensions` 打开 **Options** 页进行配置。

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（HMR） |
| `npm run build` | 生产构建 → `.output/chrome-mv3` |
| `npm run compile` | TypeScript 检查 |
| `npm run zip` | 打包为 zip |

## 权限

| 权限 | 用途 |
|------|------|
| `storage` | 实例地址、token、语言偏好 |
| `alarms` | 定期校验登录会话 |
| `sidePanel` | 侧边栏翻译界面 |
| `host_permissions` | 开发环境 `localhost:8787`；Gmail `mail.google.com`（内容脚本） |
| `optional_host_permissions` | 用户实例地址（登录时动态申请） |

## 安全说明

- 文本仅在 Side Panel 手动输入或 Gmail 内点击翻译时，经 Background 发送到**用户自托管**的 OpenTranslator 实例
- 凭证只存在本机 `chrome.storage.local`，不同步云端；Gmail 页不持有 token
- 开源协议与主项目一致：[GPL-3.0](LICENSE)

## 联调 Checklist

- [ ] 主仓库 `pnpm dev` 运行在 `http://localhost:8787`
- [ ] `.dev.vars` 的 `ORIGINS` 包含 `chrome-extension://gjmakoddcjjkfidekkkcmadihemhegfk`
- [ ] Options 或 Side Panel 登录成功
- [ ] Side Panel 输入英文，流式输出中文
- [ ] Gmail 打开英文邮件 → 出现翻译按钮 → 整封替换成功 → 可切回原文 / 再显示译文
- [ ] Email 方式改为「双语对照」→ 正文出现原文+译文交错（译文带 `ot-email-translation` / `ot-gmail-translation`）→ 可切回原文
- [ ] 富文本邮件：链接/图片/表格仍可用；引用与签名默认保留不译
- [ ] 未登录时点击 Email 按钮有明确提示
- [ ] token 过期后自动清除并提示重新登录

## 架构

```
entrypoints/
  background.ts       # API 出口、消息路由、SSE 流式 Port
  gmail.content.ts    # Gmail 内容脚本（Email 翻译 Beta）
  options/            # 独立 Options 页（设置）
  sidepanel/          # 主翻译界面 + 内嵌设置
assets/
  email-content.css   # Email 注入样式
components/
  SettingsView.tsx    # 设置编排层
  settings/           # 账户 hub、实例绑定等子组件
hooks/
  useModels.ts        # 模型列表加载
  useExperts.ts       # 专家列表加载与校验
lib/
  api.ts              # ping / login / me / translate / translateEmail
  email/              # Email DOM / UI / 整封替换客户端（Gmail）
  storage.ts          # chrome.storage.local
  sse.ts              # SSE 解析
  messaging.ts        # sidepanel/options/content ↔ background 协议
types/                # 最小共享类型
```

## 许可证

GPL-3.0 — 与 [OpenTranslator](https://github.com/opentranslator/opentranslator) 主项目保持一致。
