import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  throw new Error(`Raycast native assets can only be prepared on macOS, received ${process.platform}`);
}

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, "..");
const localPackageEntry = require.resolve("@raggle-ai/local");
const filename = `raggle-local-scanner.${process.platform}-${process.arch}.node`;
const sourcePath = path.join(path.dirname(localPackageEntry), "native", filename);
const destinationDirectory = path.join(extensionRoot, "assets", "native");
const destinationPath = path.join(destinationDirectory, filename);

mkdirSync(destinationDirectory, { recursive: true });
copyFileSync(sourcePath, destinationPath);
console.log(`prepared ${path.relative(extensionRoot, destinationPath)}`);
