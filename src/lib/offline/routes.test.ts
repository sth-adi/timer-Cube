import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OFFLINE_ROUTES } from "./routes";

function pageRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(dir, entry.name);
    // Dynamic ([id]) segments and the offline fallback page can't be saved ahead of time.
    if (entry.name.startsWith("[") || entry.name === "offline") continue;
    if (fs.existsSync(path.join(sub, "page.tsx"))) out.push(`${prefix}/${entry.name}`);
    out.push(...pageRoutes(sub, `${prefix}/${entry.name}`));
  }
  return out;
}

describe("OFFLINE_ROUTES", () => {
  it("lists every static page under src/app", () => {
    const appDir = path.resolve(__dirname, "../../app");
    const found = ["/", ...pageRoutes(appDir)].sort();
    expect([...OFFLINE_ROUTES].sort()).toEqual(found);
  });
});
