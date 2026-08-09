import "@/assets/email-content.css";
import { startEmailTranslateRuntime } from "@/lib/email/runtime";
import { gmailProvider } from "@/lib/email/providers/gmail";

export default defineContentScript({
  matches: ["https://mail.google.com/*"],
  main() {
    startEmailTranslateRuntime(gmailProvider);
  },
});
