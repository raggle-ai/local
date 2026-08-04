import { environment } from "@raycast/api";
import path from "node:path";

export function configureRaycastNativeScanner(): void {
  process.env.NAPI_RS_NATIVE_LIBRARY_PATH = path.join(
    environment.assetsPath,
    "native",
    `raggle-local-scanner.${process.platform}-${process.arch}.node`,
  );
}
