export type {
  LinkedInRawPost,
  CarMaxRawListing,
  ExtractionResult,
  ExtractionError,
} from './types.js';

export {
  extractPost,
  extractAllPosts,
  matchesLinkedIn,
  queryWithFallbacks,
  POST_SELECTORS,
  TEXT_SELECTORS,
  IMAGE_SELECTORS,
  IGNORE_IMAGE_PATTERNS,
  ACTOR_SELECTORS,
  REPOST_HEADER_SELECTORS,
  PERMALINK_SELECTORS,
  TIME_SELECTORS,
} from './linkedin.js';

export {
  extractListing,
  extractAllListings,
  matchesCarMax,
} from './carmax.js';
