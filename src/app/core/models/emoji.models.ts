// Khớp BE: EmojiDto
export interface Emoji {
  name: string;
  category: string;
  group: string;
  htmlCode: string[];
  unicode: string[];
}

// Category hợp lệ theo BE comment
export type EmojiCategory =
  | 'smileys-and-people'
  | 'animals-and-nature'
  | 'food-and-drink'
  | 'travel-and-places'
  | 'activities'
  | 'objects'
  | 'symbols'
  | 'flags';
