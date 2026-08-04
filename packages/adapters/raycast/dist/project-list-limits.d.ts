export declare const initialFavoriteProjectRenderLimit = 150;
export declare const initialNonFavoriteProjectRenderLimit = 250;
export declare const initialSearchProjectRenderLimit = 500;
export declare const projectRenderLimitIncrement = 250;
export declare const maxProgressiveIconHydrationProjects = 300;
export declare function nextProjectRenderLimit(currentLimit: number, totalItems: number): number;
