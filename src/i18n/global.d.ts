import type messages from "./messages/en.json";
import type { Locale } from "./config";

// English is the reference catalogue: missing/typo'd keys become type errors.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
