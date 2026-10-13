"use strict";

const initialState = {
  brand: { name: "NovaPay", website: "https://www.novapay.com", logo: "" },
  official: [
    { kind: "social", platform: "Instagram", identifier: "@NovaPay", publisher: "" },
    { kind: "social", platform: "X", identifier: "@NovaPay", publisher: "" },
    { kind: "app", platform: "iOS App Store", identifier: "NovaPay Wallet", publisher: "NovaPay Inc." }
  ],
  alerts: [
    {
      id: "demo-1", kind: "social", platform: "X", name: "@NovaPay_Support",
      handle: "@NovaPay_Support",
      description: "Official NovaPay customer support. DM your account details for help.",
      publisher: "", age: "new", score: 92,
      reasons: [
        "Look-alike username closely matches the brand",
        "Claims official customer support",
        "Requests sensitive information",
        "New account; verify before trusting"
      ],
      status: "Investigating", source: "Demo sample"
    },
    {
      id: "demo-2", kind: "app", platform: "Google Play", name: "Nova Pay Rewards",
      handle: "com.rewards.novapay",
      description: "Get NovaPay rewards and manage your wallet.",
      publisher: "Rewards Hub Studio", age: "unknown", score: 76,
      reasons: [
        "Application name closely resembles the brand",
        "Publisher is not registered as official"
      ],
      status: "Open", source: "Demo sample"
    },
    {
      id: "demo-3", kind: "social", platform: "Instagram", name: "N0vaPay Help",
      handle: "@n0vapay_help",
      description: "NovaPay help desk — message us to unlock your payment.",
      publisher: "", age: "new", score: 68,
      reasons: [
        "Character substitution in brand name",
        "Uses support and account-help language",
        "Recently created account"
      ],
      status: "Open", source: "Demo sample"
    },
    {
      id: "demo-4", kind: "app", platform: "Google Play", name: "NovaPay Lite",
      handle: "com.novapay.lite",
      description: "A lightweight payment tracker for NovaPay customers.",
      publisher: "Blue Peak Apps", age: "established", score: 51,
      reasons: [
        "Brand name appears in an unregistered app listing",
        "Developer is not on the official publisher list"
      ],
      status: "Open", source: "Demo sample"
    },
    {
      id: "demo-5", kind: "social", platform: "Facebook", name: "NovaPay Giveaways",
      handle: "@novapay.prize",
      description: "Claim your prize. Send your verification code to get started.",
      publisher: "", age: "unknown", score: 46,
      reasons: [
        "Prize claim and verification-code language may be suspicious",
        "Brand reference in an unregistered profile"
      ],
      status: "Open", source: "Demo sample"
    },
    {
      id: "demo-6", kind: "social", platform: "X", name: "NovaPay", handle: "@NovaPay",
      description: "Official NovaPay account.", publisher: "", age: "established", score: 0,
      reasons: [], status: "Excluded — official", source: "Registered official asset"
    },
    {
      id: "demo-7", kind: "app", platform: "iOS App Store", name: "NovaPay Wallet",
      handle: "com.novapay.wallet", description: "The official NovaPay wallet.",
      publisher: "NovaPay Inc.", age: "established", score: 0,
      reasons: [], status: "Excluded — official", source: "Registered official asset"
    }
  ]
};

module.exports = { initialState };
