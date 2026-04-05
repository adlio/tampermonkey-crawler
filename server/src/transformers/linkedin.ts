import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface LinkedInTransformOptions {
  vaultPath: string;
  subPath: string;
  tags: string[];
}

/**
 * Transform a raw LinkedIn post payload into an Obsidian-compatible markdown file.
 * Writes images to an attachments subdirectory and returns the path of the created file.
 */
export function transformToMarkdown(
  rawPayload: any,
  imageBuffers: Array<{ name: string; content: Buffer }>,
  options: LinkedInTransformOptions,
): string {
  const { vaultPath, subPath, tags } = options;

  // Create output directory and attachments subdirectory
  const outputDir = join(vaultPath, subPath);
  const resourceDir = join(outputDir, 'attachments');
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(resourceDir, { recursive: true });

  // Only write images that actually have content
  const savedImageNames: Set<string> = new Set();
  imageBuffers.forEach((img) => {
    if (img.content && img.content.length > 0) {
      writeFileSync(join(resourceDir, img.name), img.content);
      savedImageNames.add(img.name);
    }
  });

  // Build slug-based filename like: 2025-12-20-first-few-words.md
  const postDate = rawPayload.postDate
    ? new Date(rawPayload.postDate)
    : new Date(rawPayload.timestamp);
  const dateStr = postDate.toISOString().split('T')[0];
  const slug = (rawPayload.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
    .replace(/-$/, '');
  const fileName = slug
    ? `${dateStr}-${slug}.md`
    : `${dateStr}-${rawPayload.postId.replace(/[^a-z0-9]/gi, '-')}.md`;

  const isRepost = !!rawPayload.repostedBy;

  // Frontmatter matching the existing hand-curated format
  let frontmatter = `---\n`;
  frontmatter += `title: "${(rawPayload.title || '').replace(/"/g, '\\"')}"\n`;
  frontmatter += `source: "${rawPayload.postUrl || ''}"\n`;
  if (rawPayload.author) frontmatter += `author: "${rawPayload.author}"\n`;
  if (isRepost) frontmatter += `repostedBy: "${rawPayload.repostedBy}"\n`;
  frontmatter += `content_type: linkedin-post\n`;
  frontmatter += `type: ${isRepost ? 'repost' : 'original'}\n`;
  frontmatter += `fetched: ${new Date(rawPayload.timestamp).toISOString().split('T')[0]}\n`;
  if (rawPayload.postDate) frontmatter += `date: ${dateStr}\n`;
  frontmatter += `postId: ${rawPayload.postId}\n`;
  frontmatter += `description: ""\n`;
  if (tags.length > 0) {
    frontmatter += `tags:\n`;
    tags.forEach((tag: string) => {
      frontmatter += `  - "${tag}"\n`;
    });
  }
  frontmatter += `---\n`;

  // Only reference images that were actually saved to disk
  const imageEmbeds: string[] = (rawPayload.images || [])
    .filter((img: any) => savedImageNames.has(img.name))
    .map((img: any) => `![[${img.name}]]`);

  let content = frontmatter + '\n';

  if (isRepost) {
    content += `**${rawPayload.repostedBy}** reposted from **${rawPayload.author || 'unknown'}**:\n\n`;
    content += `> ${rawPayload.text.replace(/\n/g, '\n> ')}\n`;
    if (imageEmbeds.length > 0) {
      content += `>\n`;
      imageEmbeds.forEach((embed: string) => {
        content += `> ${embed}\n`;
      });
    }
  } else {
    content += `${rawPayload.text}\n`;
    if (imageEmbeds.length > 0) {
      content += `\n`;
      imageEmbeds.forEach((embed: string) => {
        content += `${embed}\n`;
      });
    }
  }

  content += `\n---\n[View on LinkedIn](${rawPayload.postUrl || ''})\n`;

  const filePath = join(outputDir, fileName);
  writeFileSync(filePath, content);

  return filePath;
}
