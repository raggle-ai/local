import type { RaycastProject } from "./index";
import { type RaggleProjectSnapshotOptions } from "./project-snapshot";
export type ProjectPickerProps = RaggleProjectSnapshotOptions & {
    onSelect: (project: RaycastProject) => void | Promise<void>;
    actionTitle?: string;
    navigationTitle?: string;
    searchBarPlaceholder?: string;
};
export declare function ProjectPicker({ onSelect, actionTitle, navigationTitle, searchBarPlaceholder, ...snapshotOptions }: ProjectPickerProps): import("react").JSX.Element;
