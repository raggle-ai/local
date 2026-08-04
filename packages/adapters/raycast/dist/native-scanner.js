"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureRaycastNativeScanner = configureRaycastNativeScanner;
const api_1 = require("@raycast/api");
const node_path_1 = __importDefault(require("node:path"));
function configureRaycastNativeScanner() {
    process.env.NAPI_RS_NATIVE_LIBRARY_PATH = node_path_1.default.join(api_1.environment.assetsPath, "native", `raggle-local-scanner.${process.platform}-${process.arch}.node`);
}
