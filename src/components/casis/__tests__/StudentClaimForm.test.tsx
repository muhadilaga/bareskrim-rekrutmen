import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ refresh: vi.fn(), set: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => [initial, state.set], useRef: (value: unknown) => ({ current: value }) };
});
import { StudentClaimForm } from "../StudentClaimForm";

function fixture() {
  const element = StudentClaimForm();
  const registration = { value: "SYNTHETIC-REG" }, token = { value: "SYNTHETIC-TOKEN" };
  const event = { preventDefault: vi.fn(), currentTarget: { elements: { namedItem: (name: string) => name === "registrationId" ? registration : token } } };
  return { element, token, registration, submit: () => element.props.onSubmit(event) };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Student Claim form", () => {
  it("renders password input and makes no request before submission", () => {
    const html = renderToStaticMarkup(<StudentClaimForm />);
    expect(html).toContain('type="password"'); expect(html).toContain('maxLength="256"');
    expect(html).not.toMatch(/SYNTHETIC|localStorage|sessionStorage|href="\/ujian|href="\/absen/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("clears credentials before refreshing after success", async () => {
    const form = fixture();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: "CLAIM_OK" }), { status: 200 }));
    state.refresh.mockImplementation(() => { expect(form.token.value).toBe(""); });
    await form.submit();
    expect(form.token.value).toBe(""); expect(form.registration.value).toBe("");
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/applications/claim", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }));
  });
  it.each(["CLAIM_REJECTED", "AUTH_REQUIRED", "RATE_LIMITED", "UNKNOWN", "__proto__"])("clears token on %s and never echoes raw server text", async code => {
    const form = fixture();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code, message: "SYNTHETIC-PRIVATE" }), { status: 400 }));
    await form.submit();
    expect(form.token.value).toBe(""); expect(state.refresh).not.toHaveBeenCalled();
    expect(JSON.stringify(state.set.mock.calls)).not.toMatch(/SYNTHETIC-PRIVATE|SYNTHETIC-TOKEN/);
  });
  it("clears token on network failure without retrying or logging", async () => {
    const error = vi.spyOn(console, "error");
    const form = fixture();
    vi.mocked(fetch).mockRejectedValue(new Error("SYNTHETIC-TOKEN"));
    await form.submit();
    expect(form.token.value).toBe(""); expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled();
  });
  it("prevents duplicate in-flight submit and clears token after malformed response", async () => {
    const form = fixture(); let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = form.submit(); await form.submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(new Response("invalid json")); await first;
    expect(form.token.value).toBe(""); expect(state.refresh).not.toHaveBeenCalled();
  });
});
