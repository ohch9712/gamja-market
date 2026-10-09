import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("구조 규칙", () => {
  it("fetch는 lib/api-client.ts에서만 직접 호출한다", () => {
    const offenders = sourceFiles(srcDir)
      .map((path) => relative(srcDir, path))
      .filter((path) => path !== join("lib", "api-client.ts"))
      .filter((path) => /\bfetch\s*\(/.test(readFileSync(join(srcDir, path), "utf8")));
    expect(offenders).toEqual([]);
  });
});
