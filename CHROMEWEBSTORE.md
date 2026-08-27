# Chrome Web Store Listing — OpenTranslator

> Last Updated: 2026-08-27

## Store Listing

**Extension Name** [REQUIRED]
OpenTranslator

**Short Description** [REQUIRED]
在浏览器侧边栏连接你的自托管 OpenTranslator 实例，输入或粘贴文本即可翻译。

**Detailed Description** [REQUIRED]
OpenTranslator 在 Chrome 侧边栏里连接你自己部署的翻译服务，把输入或粘贴的文本译成目标语言。

打开侧边栏后填写实例地址并登录。选择源语言和目标语言，输入或粘贴文本后会自动开始翻译，译文随输入逐步显示。可以复制译文、互换语言、选择翻译模型和 AI 专家。设置也可在扩展选项页完成。

使用步骤：点击工具栏图标打开侧边栏；填写实例地址并测试连接；用账号登录；输入或粘贴文本即可翻译。

文本和登录信息只发往你填写的自托管实例，凭证保存在本机，不会同步到其他设备，也不会发给扩展作者。扩展不读取你正在浏览的网页内容。

问题与反馈：https://github.com/YoungLee-coder/OpenTranslator-Extension/issues
主项目：https://github.com/opentranslator/opentranslator

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Connect to a self-hosted OpenTranslator instance and translate text in the Chrome side panel.

**Primary Language** [REQUIRED]
Chinese (Simplified)

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | public/icon/128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. Side panel with source text and streaming translation (main feature).
2. Language selectors, swap, copy, and character count.
3. Options / settings: instance URL, test connection, and login.
4. Signed-in account hub with model and expert pickers.

Toolbar and store icons: `public/icon/16.png`, `32.png`, `48.png`, `96.png`, `128.png` (pixel sizes match filenames).

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Saves the instance URL, login token, and language/model/expert preferences on this device so the side panel can restore them. |
| alarms | permissions | Rechecks the login session about every 30 minutes and clears expired credentials. |
| sidePanel | permissions | Shows the translation UI beside the current page. |
| http://localhost:8787/* | host_permissions | Lets developers reach a local OpenTranslator instance during setup without an extra permission prompt. |
| https://*/* | optional_host_permissions | Requested only when the user connects to their own HTTPS instance, so the extension can call that origin. |
| http://*/* | optional_host_permissions | Requested only when the user connects to an HTTP instance (for example a LAN or local server that is not localhost:8787). |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes (email shown after login; instance URL) | Yes, to the user's instance only | Sign-in and instance binding | No (only the user's server) |
| Health info | No | | | |
| Financial info | No | | | |
| Authentication info | Yes (password at login; session token stored locally) | Password and token go to the user's instance | Sign in and stay signed in | No (only the user's server) |
| Personal communications | Yes (text the user types or pastes to translate) | Yes, to the user's instance only | Produce a translation | No (only the user's server) |
| Location | No | | | |
| Web history | No | | | |
| User activity | No | | | |
| Website content | No | | | |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

https://github.com/YoungLee-coder/OpenTranslator-Extension/blob/main/docs/PRIVACY.md

Source: `docs/PRIVACY.md`. This URL is live only after that file is on the default branch. If GitHub blob pages are rejected at review, publish a GitHub Pages copy and update this field.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
OpenTranslator

**Contact Email** [REQUIRED]
<!-- Fill in the public CWS contact email before submission. -->


**Support URL / Email** [RECOMMENDED]
https://github.com/YoungLee-coder/OpenTranslator-Extension/issues

**Homepage URL** [RECOMMENDED]
https://github.com/opentranslator/opentranslator

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.0.1 | 2026-08-27 | Persist model/expert catalogs across service worker sleep; options open in a tab; accessibility and store listing docs | Draft |
| 2.0.0 | 2026-08-15 | Removed in-page Gmail translation; side-panel translation against a self-hosted instance | Draft |

## Review Notes

### Known Issues / Limitations
- Requires a reachable OpenTranslator instance. The extension does not provide a hosted translation API.
- `http://localhost:8787/*` is a required host permission for local development. Production users typically grant optional host access for their own origin at login.
- After publishing, the Chrome Web Store assigns a new extension ID. Update the OAuth / CORS `ORIGINS` list on the Worker to include `chrome-extension://<store-assigned-id>`. The unpacked `manifest.key` keeps the development ID stable; see `docs/ORIGINS.md`.
- ZIP for the store should be produced with `pnpm zip` and must exclude `.git/`, `node_modules/`, `.env`, and `CHROMEWEBSTORE.md`.

### Rejection History
<!-- None yet. -->
