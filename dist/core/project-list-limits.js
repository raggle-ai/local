"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maxProgressiveIconHydrationProjects = exports.projectRenderLimitIncrement = exports.initialSearchProjectRenderLimit = exports.initialNonFavoriteProjectRenderLimit = exports.initialFavoriteProjectRenderLimit = void 0;
exports.nextProjectRenderLimit = nextProjectRenderLimit;
exports.initialFavoriteProjectRenderLimit = 150;
exports.initialNonFavoriteProjectRenderLimit = 250;
exports.initialSearchProjectRenderLimit = 500;
exports.projectRenderLimitIncrement = 250;
exports.maxProgressiveIconHydrationProjects = 300;
function nextProjectRenderLimit(currentLimit, totalItems) {
    return Math.min(totalItems, currentLimit + exports.projectRenderLimitIncrement);
}
