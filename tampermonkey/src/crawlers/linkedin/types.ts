export interface LinkedInRawPost {
  postId: string;
  postUrl: string;
  postDate: string; // from time[datetime] attribute
  title: string; // first sentence, truncated to 100 chars
  author: string;
  isRepost: boolean;
  repostedBy: string;
  text: string;
  imageUrls: string[]; // URLs only, no base64
}

export interface ExtractionResult<T> {
  items: T[];
  errors: ExtractionError[];
}

export interface ExtractionError {
  index: number;
  selector: string;
  message: string;
}
