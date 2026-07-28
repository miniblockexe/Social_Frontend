// Khớp BE: TenorSearchResult record(Results, NextOffset)
// JSON.NET serialize positional record param name → camelCase: nextOffset ✓
export interface GifResult {
  results: GifItem[];
  nextOffset: number | null; // int? NextOffset → serialized "nextOffset"
}

export interface GifItem {
  id: string;
  title: string;
  previewUrl: string | null;
  tinyGifUrl: string | null;
  gifUrl: string | null;
  mediumGifUrl: string | null;
}
