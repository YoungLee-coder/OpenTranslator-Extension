# OpenTranslator Chrome 扩展

[OpenTranslator](https://github.com/opentranslator/opentranslator) 的 Chrome 插件。

## 功能

- **Options**：实例地址、测试连接、登录绑定、退出/更换实例
- **Side Panel**：语言选择、输入防抖自动翻译、SSE 流式译文、复制、语言互换
- **Background**：所有 API 在 Service Worker 中执行；凭证仅存 `chrome.storage.local`
- **会话**：打开时校验 token；每 30 分钟自动检查，过期则清除凭证

## 快速开始

```bash
pnpm install
pnpm dev
```

在 Chrome 打开 `chrome://extensions` → 开发者模式 → 加载 `.output/chrome-mv3-dev`。

### CORS / ORIGINS

开发期扩展 ID 固定为 `gjmakoddcjjkfidekkkcmadihemhegfk`（见 `wxt.config.ts` 中的 `manifest.key`）。

在主仓库 `.dev.vars` 配置：

```env
ORIGINS=http://localhost:5173,chrome-extension://gjmakoddcjjkfidekkkcmadihemhegfk
```

详见 [docs/ORIGINS.md](docs/ORIGINS.md)。上架清单见 [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md)，隐私说明见 [docs/PRIVACY.md](docs/PRIVACY.md)。

### 使用流程

1. 点击工具栏图标打开 Side Panel
2. 填写 `http://localhost:8787`（或你的实例地址）→ 测试连接 → 登录
3. 输入或粘贴文本，侧边栏会自动翻译

也可通过扩展程序页的「扩展选项」，或右键扩展图标打开 **Options** 进行配置。

## 开发命令


| 命令             | 说明                          |
| -------------- | --------------------------- |
| `pnpm dev`     | 开发模式（HMR）                   |
| `pnpm build`   | 生产构建 → `.output/chrome-mv3` |
| `pnpm compile` | TypeScript 检查               |
| `pnpm zip`     | 打包为 zip                     |




## 权限


| 权限                          | 用途                                  |
| --------------------------- | ----------------------------------- |
| `storage`                   | 实例地址、token、语言偏好                     |
| `alarms`                    | 定期校验登录会话                            |
| `sidePanel`                 | 侧边栏翻译界面                             |
| `host_permissions`          | 开发环境 `localhost:8787`               |
| `optional_host_permissions` | 用户实例地址（登录时动态申请）                     |




## 安全说明

- 文本仅在 Side Panel 手动输入时，经 Background 发送到**用户自托管**的 OpenTranslator 实例
- 凭证只存在本机 `chrome.storage.local`，不同步云端
- 开源协议与主项目一致：[GPL-3.0](LICENSE)



## 架构

```
entrypoints/
  background.ts       # API 出口、消息路由、SSE 流式 Port
  options/            # 独立 Options 页（设置）
  sidepanel/          # 主翻译界面 + 内嵌设置
components/
  SettingsView.tsx    # 设置编排层
  settings/           # 账户 hub、实例绑定等子组件
hooks/
  useModels.ts        # 模型列表加载
  useExperts.ts       # 专家列表加载与校验
lib/
  api.ts              # ping / login / me / translate
  storage.ts          # chrome.storage.local
  sse.ts              # SSE 解析
  messaging.ts        # sidepanel/options ↔ background 协议
types/                # 最小共享类型
```



## 许可证

GPL-3.0 — 与 [OpenTranslator](https://github.com/opentranslator/opentranslator) 主项目保持一致。
