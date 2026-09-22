import { describe, expect, it } from "vitest";
import { objectParticle } from "../../src/ui/korean";

describe("objectParticle", () => {
  it("picks 을 after a final consonant and 를 after a vowel", () => {
    expect(objectParticle("버섯왕")).toBe("을");
    expect(objectParticle("15마리")).toBe("를");
    expect(objectParticle("박쥐")).toBe("를");
  });
});
