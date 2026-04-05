import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { transformToMarkdown } from '../linkedin.js';

describe('transformToMarkdown', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'linkedin-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('generates correct frontmatter with all fields', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'My Great Post',
      postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
      author: 'Jane Doe',
      postDate: '2025-12-15T08:00:00Z',
      timestamp: '2025-12-20T10:00:00Z',
      postId: 'urn:li:activity:123',
      text: 'Hello, world!',
      images: [],
    };

    const filePath = transformToMarkdown(payload, [], {
      vaultPath,
      subPath: 'LinkedIn',
      tags: ['tech', 'ai'],
    });

    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain('title: "My Great Post"');
    expect(content).toContain('source: "https://www.linkedin.com/feed/update/urn:li:activity:123"');
    expect(content).toContain('author: "Jane Doe"');
    expect(content).toContain('content_type: linkedin-post');
    expect(content).toContain('type: original');
    expect(content).toContain('fetched: 2025-12-20');
    expect(content).toContain('date: 2025-12-15');
    expect(content).toContain('postId: urn:li:activity:123');
    expect(content).toContain('description: ""');
    expect(content).toContain('  - "tech"');
    expect(content).toContain('  - "ai"');
  });

  it('formats reposts as blockquotes with attribution header', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'Reposted Insight',
      postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:456',
      author: 'Original Author',
      repostedBy: 'Reposter Name',
      postDate: '2025-12-15T08:00:00Z',
      timestamp: '2025-12-20T10:00:00Z',
      postId: 'urn:li:activity:456',
      text: 'Some insightful content\nwith multiple lines',
      images: [],
    };

    const filePath = transformToMarkdown(payload, [], {
      vaultPath,
      subPath: 'LinkedIn',
      tags: [],
    });

    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain('repostedBy: "Reposter Name"');
    expect(content).toContain('type: repost');
    expect(content).toContain('**Reposter Name** reposted from **Original Author**:');
    expect(content).toContain('> Some insightful content');
    expect(content).toContain('> with multiple lines');
  });

  it('generates slug-based filenames', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'AI & Machine Learning: The Future!',
      postUrl: 'https://linkedin.com/post/789',
      timestamp: '2025-12-20T10:00:00Z',
      postDate: '2025-12-15T08:00:00Z',
      postId: 'urn:li:activity:789',
      text: 'Content here.',
      images: [],
    };

    const filePath = transformToMarkdown(payload, [], {
      vaultPath,
      subPath: 'Posts',
      tags: [],
    });

    const fileName = filePath.split('/').pop();
    expect(fileName).toBe('2025-12-15-ai-machine-learning-the-future.md');
  });

  it('only embeds images that were actually saved', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'Post with images',
      postUrl: 'https://linkedin.com/post/101',
      timestamp: '2025-12-20T10:00:00Z',
      postId: 'urn:li:activity:101',
      text: 'Look at these images.',
      images: [
        { name: 'photo1.jpg' },
        { name: 'photo2.jpg' },
        { name: 'photo3.jpg' },
      ],
    };

    // Only provide buffers for photo1 and photo3 (photo2 has empty content)
    const imageBuffers = [
      { name: 'photo1.jpg', content: Buffer.from('fake-image-1') },
      { name: 'photo2.jpg', content: Buffer.alloc(0) },
      { name: 'photo3.jpg', content: Buffer.from('fake-image-3') },
    ];

    const filePath = transformToMarkdown(payload, imageBuffers, {
      vaultPath,
      subPath: 'Posts',
      tags: [],
    });

    const content = readFileSync(filePath, 'utf-8');

    // photo1 and photo3 should be embedded
    expect(content).toContain('![[photo1.jpg]]');
    expect(content).toContain('![[photo3.jpg]]');
    // photo2 had empty content, so it should NOT be embedded
    expect(content).not.toContain('![[photo2.jpg]]');

    // Verify the actual files on disk
    const resourceDir = join(vaultPath, 'Posts', 'attachments');
    expect(existsSync(join(resourceDir, 'photo1.jpg'))).toBe(true);
    expect(existsSync(join(resourceDir, 'photo2.jpg'))).toBe(false);
    expect(existsSync(join(resourceDir, 'photo3.jpg'))).toBe(true);
  });

  it('includes [View on LinkedIn] footer', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'Footer test',
      postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:999',
      timestamp: '2025-12-20T10:00:00Z',
      postId: 'urn:li:activity:999',
      text: 'Testing footer.',
      images: [],
    };

    const filePath = transformToMarkdown(payload, [], {
      vaultPath,
      subPath: 'Posts',
      tags: [],
    });

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('[View on LinkedIn](https://www.linkedin.com/feed/update/urn:li:activity:999)');
  });

  it('handles posts with no images', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'Text only post',
      postUrl: 'https://linkedin.com/post/200',
      timestamp: '2025-12-20T10:00:00Z',
      postId: 'urn:li:activity:200',
      text: 'Just text, no images.',
      images: [],
    };

    const filePath = transformToMarkdown(payload, [], {
      vaultPath,
      subPath: 'Posts',
      tags: [],
    });

    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('![[');
    expect(content).toContain('Just text, no images.');
  });

  it('uses description: "" as empty placeholder', () => {
    const vaultPath = makeTempDir();
    const payload = {
      title: 'Description test',
      postUrl: 'https://linkedin.com/post/300',
      timestamp: '2025-12-20T10:00:00Z',
      postId: 'urn:li:activity:300',
      text: 'Content.',
      images: [],
    };

    const filePath = transformToMarkdown(payload, [], {
      vaultPath,
      subPath: 'Posts',
      tags: [],
    });

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('description: ""');
  });
});
