import { showToast, Toast } from "@raycast/api";

export function showToggleFavoriteToast(title: string, isFavourite: boolean) {
  void showToast({
    style: Toast.Style.Success,
    title: isFavourite ? "Removed from Favorites" : "Added to Favorites",
    message: `"${title}" ${isFavourite ? "removed from" : "added to"} favorites`,
  });
}

export function showMoveFavoriteToast(title: string, direction: "up" | "down") {
  void showToast({
    style: Toast.Style.Success,
    title: direction === "up" ? "Moved Up" : "Moved Down",
    message: `"${title}" moved ${direction} in favorites`,
  });
}
