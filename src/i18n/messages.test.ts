import { describe, expect, it } from "vitest";
import ar from "./messages/ar.json";
import en from "./messages/en.json";
import fr from "./messages/fr.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations", () => {
  const reference = keys(en).sort();
  it.each([
    ["fr", fr],
    ["ar", ar],
  ])("%s has exactly the same keys as en", (_, messages) => {
    expect(keys(messages).sort()).toEqual(reference);
  });
});
