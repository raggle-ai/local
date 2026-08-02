function raycastExport(name) {
  const api = globalThis.__raggleRaycastApi;
  if (!api || !(name in api)) {
    throw new Error(`@raggle/plugins export "${name}" is only available inside the Raggle plugin manager`);
  }

  return api[name];
}

function raycastProxy(name) {
  return new Proxy(function raggleRaycastProxy() {}, {
    apply(_target, thisArg, args) {
      return Reflect.apply(raycastExport(name), thisArg, args);
    },
    construct(_target, args) {
      return Reflect.construct(raycastExport(name), args);
    },
    get(_target, property) {
      return raycastExport(name)[property];
    },
    has(_target, property) {
      return property in raycastExport(name);
    },
    ownKeys() {
      return Reflect.ownKeys(raycastExport(name));
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(raycastExport(name), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set(_target, property, value) {
      raycastExport(name)[property] = value;
      return true;
    },
  });
}

export const Action = raycastProxy("Action");
export const ActionPanel = raycastProxy("ActionPanel");
export const Alert = raycastProxy("Alert");
export const Clipboard = raycastProxy("Clipboard");
export const Color = raycastProxy("Color");
export const Detail = raycastProxy("Detail");
export const Form = raycastProxy("Form");
export const Icon = raycastProxy("Icon");
export const Keyboard = raycastProxy("Keyboard");
export const List = raycastProxy("List");
export const Toast = raycastProxy("Toast");
export const closeMainWindow = raycastProxy("closeMainWindow");
export const confirmAlert = raycastProxy("confirmAlert");
export const getPreferenceValues = raycastProxy("getPreferenceValues");
export const launchCommand = raycastProxy("launchCommand");
export const open = raycastProxy("open");
export const openCommandPreferences = raycastProxy("openCommandPreferences");
export const openExtensionPreferences = raycastProxy("openExtensionPreferences");
export const popToRoot = raycastProxy("popToRoot");
export const showHUD = raycastProxy("showHUD");
export const showInFinder = raycastProxy("showInFinder");
export const showToast = raycastProxy("showToast");

export function defineProjectActions(factory) {
  return factory;
}

export function defineProjectConfig(config) {
  return config;
}

export async function resolveProjectActions(actions, context) {
  if (!actions) return [];

  return typeof actions === "function" ? actions(context) : actions;
}

export function projectActionsFromModule(module) {
  if (typeof module === "function" || Array.isArray(module)) return module;

  return module.projectActions ?? module.default;
}

export function projectConfigFromModule(module) {
  if (typeof module === "function" || Array.isArray(module)) return undefined;

  return module.projectConfig ?? module.config;
}
