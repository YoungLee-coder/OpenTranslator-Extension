# CORS / ORIGINS 配置

Chrome 扩展从 `chrome-extension://` 来源发起跨域请求，OpenTranslator Worker 必须在环境变量 `ORIGINS` 中显式允许该来源。

## 开发环境（本仓库默认扩展 ID）

本仓库在 `wxt.config.ts` 中配置了固定 `manifest.key`，开发期扩展 ID 稳定为：

```
gjmakoddcjjkfidekkkcmadihemhegfk
```

在主仓库 `.dev.vars` 中加入：

```env
ORIGINS=http://localhost:5173,chrome-extension://gjmakoddcjjkfidekkkcmadihemhegfk
```

若主站前端端口不是 5173，请一并保留实际端口。

## 生产 / 自打包扩展

若你自行打包扩展且未使用上述 `key`，扩展 ID 会变化。在 Chrome 打开 `chrome://extensions` 查看 ID，或在扩展 Options 页底部复制，然后加入 Worker `ORIGINS`：

```env
ORIGINS=https://your-opentranslator.example.com,chrome-extension://<你的扩展ID>
```

多个来源用英文逗号分隔，不要加空格。

## 验证

1. Options 页点击「测试连接」应返回成功
2. 登录应返回 200 且保存 token
3. 若浏览器控制台出现 CORS 错误，说明 `ORIGINS` 未包含正确的 `chrome-extension://...` 来源

## 更换固定 Key

如需生成新的固定扩展 ID：

```bash
# 生成 RSA 公钥（base64，填入 wxt.config.ts manifest.key）
openssl genrsa 2048 | openssl rsa -pubout -outform DER | openssl base64 -A

# 用公钥计算扩展 ID（Python 示例见 README）
```

更换 key 后需同步更新 Worker `ORIGINS` 中的 `chrome-extension://` 条目。
