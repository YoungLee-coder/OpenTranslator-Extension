# Privacy Policy for OpenTranslator

Last updated: 2026-08-27

OpenTranslator is a Chrome extension that talks only to the OpenTranslator instance **you** configure. There is no vendor cloud, analytics, or advertising.

## What Data We Collect

- **Instance address** — the URL of your self-hosted OpenTranslator service, so the extension can connect to it.
- **Account credentials** — email and password are sent to your instance at login. The password is not stored in the extension after login.
- **Session token and account profile** — returned by your instance after login, used to keep you signed in and show your account.
- **Language, model, and expert preferences** — so the side panel can restore your last translation settings.
- **Text you type or paste to translate** — sent to your instance only when you use the side panel to translate.

The extension does not read web-page content, browsing history, cookies, or other tabs.

## How Data Is Stored

Instance address, session token, account profile, language/model/expert preferences, and a draft instance URL are stored on this device in Chrome local storage. They are not synced to other devices and are not sent to the extension author.

## How Data Is Used

- Instance address and host permission: connect to the service you chose.
- Email and password: sign in to that service.
- Session token: authenticated API calls (session check, model list, translation).
- Preferences: restore languages, model, and expert in the side panel.
- Source text: produce a translation on your instance.

## Third-Party Services

This extension does not call analytics, ads, crash reporting, or any service other than the OpenTranslator instance you enter. That instance is operated by you or your administrator; their privacy policy applies to data they receive.

## Data Sharing

The extension author does not receive, sell, or share your data. Text and login details go only to the instance you configured.

## Data Retention and Deletion

Local data stays on this device until you sign out, switch instance, or remove the extension. Sign out clears the stored token and account, and drops optional host access for that instance. Uninstalling the extension removes remaining local storage.

## Changes to This Policy

If storage, transmission, or collection practices change, this policy will be updated in the repository. Check the date above.

## Contact

Privacy questions: open an issue at [OpenTranslator-Extension](https://github.com/YoungLee-coder/OpenTranslator-Extension/issues), or use the contact listed on the [OpenTranslator](https://github.com/opentranslator/opentranslator) project.
