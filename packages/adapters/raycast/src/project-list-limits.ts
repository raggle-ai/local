export const initialFavoriteProjectRenderLimit = 150;
export const initialNonFavoriteProjectRenderLimit = 250;
export const initialSearchProjectRenderLimit = 500;
export const projectRenderLimitIncrement = 250;
export const maxProgressiveIconHydrationProjects = 300;

export function nextProjectRenderLimit(currentLimit: number, totalItems: number) {
  return Math.min(totalItems, currentLimit + projectRenderLimitIncrement);
}
