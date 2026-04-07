import { execFile } from 'node:child_process';
import { createWriteStream, unlinkSync } from 'node:fs';

/** Decode XML entities in attribute values. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse a LinkedIn DASH MPD manifest and return the segment URLs
 * for the highest-bandwidth representation.
 */
export function parseMpdSegments(xml: string): { initUrl: string; segmentUrls: string[] } | null {
  // Find all Representation blocks — pick the highest bandwidth
  const repRegex = /<Representation[^>]*bandwidth="(\d+)"[^>]*>([\s\S]*?)<\/Representation>/g;
  let bestBandwidth = 0;
  let bestBlock = '';

  let match: RegExpExecArray | null;
  while ((match = repRegex.exec(xml)) !== null) {
    const bw = parseInt(match[1], 10);
    if (bw > bestBandwidth) {
      bestBandwidth = bw;
      bestBlock = match[2];
    }
  }

  if (!bestBlock) return null;

  // Extract Initialization sourceURL
  const initMatch = bestBlock.match(/<Initialization\s+sourceURL="([^"]+)"/);
  if (!initMatch) return null;

  // Extract all SegmentURL media attributes
  const segmentUrls: string[] = [];
  const segRegex = /<SegmentURL\s+media="([^"]+)"/g;
  let seg: RegExpExecArray | null;
  while ((seg = segRegex.exec(bestBlock)) !== null) {
    segmentUrls.push(seg[1]);
  }

  if (segmentUrls.length === 0) return null;

  return {
    initUrl: decodeXmlEntities(initMatch[1]),
    segmentUrls: segmentUrls.map(decodeXmlEntities),
  };
}

/** Download a URL to a Buffer. */
async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Download segments from a DASH manifest and concatenate into a raw
 * segment file, then remux with ffmpeg into a proper MP4.
 */
async function downloadDashSegments(
  mpdXml: string,
  outputPath: string,
  timeoutMs: number,
): Promise<void> {
  const parsed = parseMpdSegments(mpdXml);
  if (!parsed) throw new Error('Could not parse MPD segments');

  const { initUrl, segmentUrls } = parsed;

  // Download init segment + all media segments and stream them to a temp file
  const rawPath = outputPath + '.raw';
  const ws = createWriteStream(rawPath);

  try {
    // Download and write init segment
    const initBuf = await fetchBuffer(initUrl);
    ws.write(initBuf);

    // Download media segments sequentially (they must stay in order)
    for (const url of segmentUrls) {
      const buf = await fetchBuffer(url);
      ws.write(buf);
    }

    // Close the write stream
    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.on('error', reject);
    });

    // Remux the concatenated segments into a proper MP4 with ffmpeg
    await runFfmpeg(
      ['-y', '-i', rawPath, '-c', 'copy', '-movflags', '+faststart', outputPath],
      timeoutMs,
    );
  } finally {
    try {
      unlinkSync(rawPath);
    } catch {
      /* already gone */
    }
  }
}

/** Run ffmpeg with given args and return a promise. */
function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = execFile('ffmpeg', args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg failed: ${error.message}\n${stderr}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`ffmpeg not found or failed to start: ${err.message}`));
    });
  });
}

/**
 * Download a video from a DASH manifest URL and produce a playable MP4.
 *
 * For standard DASH/HLS that ffmpeg can handle directly, passes the URL
 * straight to ffmpeg. For LinkedIn-style MPDs with SegmentList, parses
 * the manifest and downloads segments manually before remuxing.
 */
export async function downloadVideoWithFfmpeg(
  manifestUrl: string,
  outputPath: string,
  timeoutMs = 120_000,
): Promise<void> {
  // Fetch the manifest to inspect it
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching manifest`);
  const body = await res.text();

  // If it's an MPD with SegmentList (LinkedIn-style), handle manually
  if (body.includes('<SegmentList') || body.includes('<SegmentURL')) {
    return downloadDashSegments(body, outputPath, timeoutMs);
  }

  // Otherwise try passing the URL directly to ffmpeg (standard DASH/HLS)
  return runFfmpeg(
    ['-y', '-i', manifestUrl, '-c', 'copy', '-movflags', '+faststart', outputPath],
    timeoutMs,
  );
}
