import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@verse8/platform", () => ({ getUser: (...args: unknown[]) => getUser(...args) }));

const { loginState } = await import("../../src/net/login");

describe("loginState", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("is a member when Verse8 signed the token", () => {
    getUser.mockReturnValue({ account: "0x1" });
    expect(loginState()).toBe("member");
  });

  it("is a guest when the token is self-signed", () => {
    getUser.mockImplementation((opts?: { requireTrustedSigner?: boolean }) => {
      if (opts?.requireTrustedSigner) throw new Error("0x1 is not the trusted Verse8 signer");
      return { account: "0x1" };
    });
    expect(loginState()).toBe("guest");
  });

  it("is unknown outside Verse8", () => {
    getUser.mockImplementation(() => {
      throw new Error("no auth query parameter found");
    });
    expect(loginState()).toBe("unknown");
  });
});
