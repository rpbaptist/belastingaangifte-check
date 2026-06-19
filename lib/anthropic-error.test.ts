import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { classifyError, isUserFacingError } from "./anthropic-error";

const h = new Headers();

describe("isUserFacingError", () => {
  it("returns true for AuthenticationError", () => {
    expect(isUserFacingError(new Anthropic.AuthenticationError(401, undefined, "", h))).toBe(true);
  });

  it("returns true for PermissionDeniedError", () => {
    expect(isUserFacingError(new Anthropic.PermissionDeniedError(403, undefined, "", h))).toBe(
      true
    );
  });

  it("returns true for RateLimitError", () => {
    expect(isUserFacingError(new Anthropic.RateLimitError(429, undefined, "", h))).toBe(true);
  });

  it("returns false for a generic server error", () => {
    expect(isUserFacingError(new Anthropic.APIError(500, undefined, "", h))).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isUserFacingError(new Error("network failure"))).toBe(false);
  });
});

describe("classifyError", () => {
  it("maps AuthenticationError to 401 in Dutch", () => {
    const result = classifyError(new Anthropic.AuthenticationError(401, undefined, "", h));
    expect(result).toEqual({ status: 401, message: "Ongeldige API-sleutel" });
  });

  it("maps AuthenticationError to 401 in English", () => {
    const result = classifyError(new Anthropic.AuthenticationError(401, undefined, "", h), "en");
    expect(result).toEqual({ status: 401, message: "Invalid API key" });
  });

  it("maps PermissionDeniedError to 403 in Dutch", () => {
    const result = classifyError(new Anthropic.PermissionDeniedError(403, undefined, "", h));
    expect(result).toEqual({ status: 403, message: "Geen toegang met deze API-sleutel" });
  });

  it("maps PermissionDeniedError to 403 in English", () => {
    const result = classifyError(new Anthropic.PermissionDeniedError(403, undefined, "", h), "en");
    expect(result).toEqual({ status: 403, message: "No access with this API key" });
  });

  it("maps RateLimitError to 429 in Dutch", () => {
    const result = classifyError(new Anthropic.RateLimitError(429, undefined, "", h));
    expect(result).toEqual({
      status: 429,
      message: "Te veel verzoeken, probeer het later opnieuw",
    });
  });

  it("maps RateLimitError to 429 in English", () => {
    const result = classifyError(new Anthropic.RateLimitError(429, undefined, "", h), "en");
    expect(result).toEqual({ status: 429, message: "Too many requests, try again later" });
  });

  it("maps a 5xx APIError to 502 in Dutch", () => {
    const result = classifyError(new Anthropic.APIError(503, undefined, "", h));
    expect(result).toEqual({
      status: 502,
      message: "Anthropic-serverfout, probeer het later opnieuw",
    });
  });

  it("maps a 5xx APIError to 502 in English", () => {
    const result = classifyError(new Anthropic.APIError(503, undefined, "", h), "en");
    expect(result).toEqual({ status: 502, message: "Anthropic server error, try again later" });
  });

  it("maps a plain Error to 500 with its message", () => {
    const result = classifyError(new Error("network failure"));
    expect(result).toEqual({ status: 500, message: "network failure" });
  });

  it("maps unknown throws to 500 with Dutch fallback", () => {
    const result = classifyError("not an error");
    expect(result).toEqual({ status: 500, message: "Er is een onbekende fout opgetreden" });
  });

  it("maps unknown throws to 500 with English fallback", () => {
    const result = classifyError("not an error", "en");
    expect(result).toEqual({ status: 500, message: "An unknown error occurred" });
  });
});
