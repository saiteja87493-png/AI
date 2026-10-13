"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assess, matchesBrand, normalize, riskLevel, similarity } = require("./risk-engine");

test("normalization handles spaces, punctuation, and common zero look-alikes", () => {
  assert.equal(normalize("@N0va Pay!"), "novapay");
});

test("name similarity detects spaced brand names and character substitutions", () => {
  assert.ok(similarity("Nova Pay Rewards", "NovaPay") > 0.4);
  assert.ok(similarity("N0vaPay Help", "NovaPay") > 0.4);
});

test("brand prefix plus support and credential requests gets a high risk score with evidence", () => {
  const result = assess({
    kind: "social",
    name: "NovaPay Support",
    handle: "@NovaPay_Support",
    description: "Official support. Send your verification code to unlock your account.",
    age: "new"
  }, "NovaPay");

  assert.ok(result.score >= 85);
  assert.equal(result.official, false);
  assert.ok(result.reasons.some((reason) => reason.includes("look-alike")));
  assert.ok(result.reasons.some((reason) => reason.includes("sensitive credentials")));
});

test("matching registered assets are excluded before suspicious signals are scored", () => {
  const candidate = {
    kind: "app",
    platform: "Apple App Store",
    name: "NovaPay: Payment Systems",
    handle: "ua.novapay.mobile",
    publisher: "NovaPay LLC",
    description: "Official NovaPay wallet."
  };
  const official = [{
    kind: "app",
    platform: "iOS App Store",
    identifier: candidate.name,
    publisher: candidate.publisher
  }];
  assert.deepEqual(assess(candidate, "NovaPay", official), { score: 0, reasons: [], official: true });
});

test("publisher mismatch contributes risk and clear evidence", () => {
  const result = assess({
    kind: "app",
    name: "Nova Pay Rewards",
    platform: "Apple App Store",
    publisher: "Unrecognized Studio",
    description: "NovaPay payment rewards",
    age: "unknown"
  }, "NovaPay");

  assert.ok(result.score > 0);
  assert.ok(result.reasons.some((reason) => reason.includes("publisher")));
});

test("live result filtering accepts brand look-alikes and rejects unrelated listings", () => {
  assert.equal(matchesBrand({ name: "NovaPay Support", handle: "" }, "NovaPay"), true);
  assert.equal(matchesBrand({ name: "N0vaPay Help", handle: "" }, "NovaPay"), true);
  assert.equal(matchesBrand({ name: "Unrelated Example", handle: "" }, "NovaPay"), false);
});

test("risk levels use the documented score bands", () => {
  assert.equal(riskLevel(20), "Low");
  assert.equal(riskLevel(40), "Medium");
  assert.equal(riskLevel(65), "High");
  assert.equal(riskLevel(85), "Critical");
});
