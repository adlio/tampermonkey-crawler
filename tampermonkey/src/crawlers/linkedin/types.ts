export interface LinkedInRawPost {
  postId: string;
  postUrl: string;
  postDate: string; // ISO datetime or relative (e.g. "5d") if <time> absent
  title: string; // first sentence, truncated to 100 chars
  author: string;
  isRepost: boolean;
  repostedBy: string;
  text: string;
  imageUrls: string[]; // URLs only, no base64
  hasVideo: boolean; // true if post contains a video container
  videoId: string; // LinkedIn video asset ID extracted from poster URL
  videoPosterUrl: string; // video thumbnail CDN URL
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
