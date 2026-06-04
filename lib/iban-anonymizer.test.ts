import { describe, expect, it } from "vitest";
import { buildSharedIbanMaps, applyPrivacyFilter } from "./iban-anonymizer";

const INGB001 = "[IBAN:INGB:001]";
const INGB_FORWARD = { NL00INGB0000000001: INGB001 };

describe("applyPrivacyFilter", () => {
  it("replaces a plain IBAN in text with its pseudonym", () => {
    const result = applyPrivacyFilter("Saldo NL00INGB0000000001 bedraagt €3.080", INGB_FORWARD);
    expect(result).toContain(INGB001);
    expect(result).not.toContain("NL00INGB0000000001");
  });

  it("replaces a spaced IBAN with the same pseudonym as the compact form", () => {
    const result = applyPrivacyFilter("NL22 INGB 0673 3457 85 bedrag €3.080", INGB_FORWARD);
    expect(result).toContain(INGB001);
    expect(result).not.toContain("NL22");
  });

  it("leaves an IBAN that is not in the forward map unchanged", () => {
    const result = applyPrivacyFilter("NL00RABO0000000001 bedrag €97", INGB_FORWARD);
    expect(result).toContain("NL00RABO0000000001");
  });

  it("scrubs BSN when preceded by BSN: label", () => {
    const result = applyPrivacyFilter("BSN: 123456789 naam Jan", {});
    expect(result).toContain("[verwijderd]");
    expect(result).not.toContain("123456789");
  });

  it("scrubs BSN when preceded by Burgerservicenummer label", () => {
    const result = applyPrivacyFilter("Burgerservicenummer 987654321", {});
    expect(result).toContain("[verwijderd]");
    expect(result).not.toContain("987654321");
  });

  it("does NOT scrub a 9-digit number not preceded by a BSN label", () => {
    const result = applyPrivacyFilter("Loonheffingsnummer 135689600", {});
    expect(result).toContain("135689600");
    expect(result).not.toContain("[verwijderd]");
  });
});

describe("buildSharedIbanMaps", () => {
  it("assigns [IBAN:BANKCODE:001] format to a detected IBAN", () => {
    const { forward } = buildSharedIbanMaps(["NL00INGB0000000001"]);
    expect(forward["NL00INGB0000000001"]).toBe("[IBAN:INGB:001]");
  });

  it("maps the same IBAN regardless of spacing to the same pseudonym", () => {
    const { forward: a } = buildSharedIbanMaps(["NL00INGB0000000001"]);
    const { forward: b } = buildSharedIbanMaps(["NL22 INGB 0673 3457 85"]);
    expect(a["NL00INGB0000000001"]).toBe(b["NL00INGB0000000001"]);
  });

  it("gives two IBANs at the same bank sequential numbers", () => {
    const { forward } = buildSharedIbanMaps(["NL00INGB0000000001 NL00INGB0000000002"]);
    expect(forward["NL00INGB0000000001"]).toBe("[IBAN:INGB:001]");
    expect(forward["NL00INGB0000000002"]).toBe("[IBAN:INGB:002]");
  });

  it("gives IBANs at different banks each their own :001", () => {
    const { forward } = buildSharedIbanMaps(["NL00INGB0000000001 NL00RABO0000000001"]);
    expect(forward["NL00INGB0000000001"]).toBe("[IBAN:INGB:001]");
    expect(forward["NL00RABO0000000001"]).toBe("[IBAN:RABO:001]");
  });

  it("produces the same pseudonym for an IBAN that appears in multiple texts", () => {
    const { forward } = buildSharedIbanMaps(["NL00INGB0000000001", "NL00INGB0000000001"]);
    const entries = Object.entries(forward);
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toBe("[IBAN:INGB:001]");
  });

  it("extending an existing map: new IBAN continues numbering, existing unchanged", () => {
    const first = buildSharedIbanMaps(["NL00INGB0000000001"]);
    const extended = buildSharedIbanMaps(["NL00INGB0000000002"], first);
    expect(extended.forward["NL00INGB0000000001"]).toBe("[IBAN:INGB:001]");
    expect(extended.forward["NL00INGB0000000002"]).toBe("[IBAN:INGB:002]");
  });
});
