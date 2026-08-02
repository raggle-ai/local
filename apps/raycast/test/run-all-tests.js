#!/usr/bin/env node

/**
 * Run all extraction tests
 */

const { execSync } = require("child_process");

console.log("🧪 Complete AI Extraction Test Suite");
console.log("====================================\n");

try {
  console.log("👤 CONTACT EXTRACTION TESTS");
  console.log("===========================");
  execSync("npm run test:contact-unit", { stdio: "inherit" });

  console.log("\n\n🎉 ALL TESTS COMPLETED!");
  console.log("=======================");
  console.log("✅ Contact extraction: Deterministic unit coverage passed");
  console.log(
    "ℹ️  Live Raycast AI contact checks remain available via node test/run-contact-test.js",
  );
} catch (error) {
  console.error("❌ Test execution failed:", error.message);
  process.exit(1);
}
