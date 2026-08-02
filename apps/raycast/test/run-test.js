#!/usr/bin/env node

/**
 * Test runner for calendar and contact extraction
 *
 * Usage:
 *   node test/run-test.js                    # Run all supported tests
 *   node test/run-test.js contact            # Run deterministic contact tests
 */

const { execSync } = require("child_process");
const path = require("path");

const testType = process.argv[2]; // contact or undefined (all)

console.log("🧪 AI Extraction Test Runner");
console.log("============================\n");

try {
  // Change to the project directory
  const projectDir = path.join(__dirname, "..");
  process.chdir(projectDir);

  console.log("📁 Project directory:", process.cwd());
  console.log("🔨 Preparing tests...");

  if (!testType || testType === "contact") {
    console.log("ℹ️  Contact tests use scripts/test-contact-unit.js");
  }

  console.log("✅ Test setup complete");

  if (!testType) {
    console.log("🏃 Running all supported tests...\n");

    console.log("👤 CONTACT EXTRACTION TESTS");
    console.log("============================");
    execSync("npm run test:contact-unit", { stdio: "inherit" });
  } else if (testType === "contact") {
    console.log("🏃 Running contact tests...\n");
    execSync("npm run test:contact-unit", { stdio: "inherit" });
  } else {
    console.error(`❌ Unknown test type: ${testType}`);
    console.error(
      "Valid options: contact, or no argument for all supported tests",
    );
    process.exit(1);
  }
} catch (error) {
  console.error("\n❌ Test execution failed:");
  console.error("Error:", error.message);

  if (error.stdout) {
    console.error("Stdout:", error.stdout.toString());
  }
  if (error.stderr) {
    console.error("Stderr:", error.stderr.toString());
  }

  process.exit(1);
}
