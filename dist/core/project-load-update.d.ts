import type { LocalProject, LocalProjectDelta, LocalProjectLoadPhase, LocalProjectUpdate } from "./types";
export declare function createLocalProjectUpdate(previousItems: readonly LocalProject[], items: LocalProject[], phase: LocalProjectLoadPhase): LocalProjectUpdate;
export declare function applyLocalProjectDelta(currentItems: LocalProject[], delta: LocalProjectDelta): LocalProject[];
