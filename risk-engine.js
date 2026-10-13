"use strict";

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@]/g, "")
    .replace(/[0]/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

function similarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function platformKey(platform) {
  const value = normalize(platform);
  if (value.includes("bluesky")) return "bluesky";
  if (value.includes("appstore") || value.includes("itunes")) return "applestore";
  if (value.includes("googleplay")) return "googleplay";
  return value;
}

function isOfficial(candidate, officialAssets) {
  return officialAssets.some((official) => {
    if (official.kind !== candidate.kind) return false;
    const sameIdentifier = normalize(official.identifier) === normalize(candidate.handle)
      || normalize(official.identifier) === normalize(candidate.name);
    const samePlatform = !official.platform || !candidate.platform
      || platformKey(official.platform) === platformKey(candidate.platform);
    const samePublisher = !official.publisher || !candidate.publisher
      || normalize(official.publisher) === normalize(candidate.publisher);
    return sameIdentifier && samePlatform && (candidate.kind !== "app" || samePublisher);
  });
}

function assess(candidate, brandName, officialAssets = []) {
  if (isOfficial(candidate, officialAssets)) {
    return { score: 0, reasons: [], official: true };
  }

  const brandKey = normalize(brandName);
  const labelSimilarity = Math.max(
    similarity(candidate.name, brandName),
    similarity(candidate.handle, brandName),
    ...[candidate.name, candidate.handle].map((value) => (
      brandKey && normalize(value).startsWith(brandKey) ? 0.92 : 0
    ))
  );
  const description = String(candidate.description ?? "").toLocaleLowerCase();
  const normalizedDescription = normalize(description);
  const reasons = [];
  let score = 0;

  if (labelSimilarity >= 0.9) {
    score += 48;
    reasons.push("Name or username is a close look-alike of the brand");
  } else if (labelSimilarity >= 0.72) {
    score += 34;
    reasons.push("Name or username resembles the brand");
  } else if (labelSimilarity >= 0.48) {
    score += 18;
    reasons.push("Name or username contains a partial brand match");
  }
  if (brandKey && normalizedDescription.includes(brandKey)) {
    score += 12;
    reasons.push("Description refers to the protected brand");
  }
  if (/\b(support|help|verify|verification|claim|prize|giveaway|unlock|refund|official|urgent|dm|wallet)\b/i.test(description)) {
    score += 16;
    reasons.push("Description uses support, urgency, or prize-claim language");
  }
  if (/\b(password|passcode|otp|verification code|seed phrase|bank details|account details)\b/i.test(description)) {
    score += 22;
    reasons.push("Requests sensitive credentials or account information");
  }
  if (candidate.kind === "app" && candidate.publisher
    && !officialAssets.some((item) => item.kind === "app" && item.publisher
      && normalize(item.publisher) === normalize(candidate.publisher))) {
    score += 19;
    reasons.push("App developer does not match a registered official publisher");
  }
  if (candidate.kind === "app" && !candidate.publisher) {
    score += 8;
    reasons.push("App publisher was not provided for verification");
  }
  if (candidate.age === "new") {
    score += 13;
    reasons.push("Recently created account or listing");
  }
  if (!reasons.length) {
    reasons.push("No strong impersonation indicators found; manually verify if uncertain");
  }
  return { score: Math.max(0, Math.min(100, score)), reasons, official: false };
}

function riskLevel(score) {
  if (score >= 85) return "Critical";
  if (score >= 65) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function matchesBrand(candidate, brandName) {
  const target = normalize(brandName);
  const matchesLabel = [candidate.name, candidate.handle].some((value) => {
    const normalized = normalize(value);
    return (target && normalized.includes(target)) || similarity(value, brandName) >= 0.7;
  });
  return matchesLabel || Boolean(target && normalize(candidate.description).includes(target));
}

module.exports = { assess, isOfficial, matchesBrand, normalize, platformKey, riskLevel, similarity };
