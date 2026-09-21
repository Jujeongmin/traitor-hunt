import { RULE_ERRORS } from "../game/world/types";

// The rule code inside a failed server call, or the raw message when it is not one of ours.
export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  return RULE_ERRORS.find((code) => message.includes(code)) ?? message;
}
