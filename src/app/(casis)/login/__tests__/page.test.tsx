import React from "react";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`TEST_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: spies.redirect }));

import LoginPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Roblox login route", () => {
  it("redirects directly to /dashboard without requiring Roblox OAuth login", () => {
    expect(() => LoginPage()).toThrow("TEST_REDIRECT:/dashboard");
    expect(spies.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("has exactly one /login page after route migration", () => {
    const root = path.join(process.cwd(), "src/app");
    function pages(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory()
          ? pages(full)
          : /^page\.(tsx|ts|jsx|js)$/.test(entry.name)
          ? [full]
          : [];
      });
    }
    const logins = pages(root).filter((file) => {
      const segments = path
        .relative(root, path.dirname(file))
        .split(path.sep)
        .filter((part) => !/^\(.*\)$/.test(part));
      return segments.join("/") === "login";
    });
    expect(logins).toEqual([path.join(root, "(casis)/login/page.tsx")]);
    expect(existsSync(path.join(root, "(app)/login/page.tsx"))).toBe(false);
  });
});
