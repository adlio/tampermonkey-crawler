import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../detect.js';

function makeDoc(html: string): Document {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.innerHTML = html;
  return document;
}

describe('detectPlatform', () => {
  it('detects DealerOn via dealeron.js script', () => {
    const doc = makeDoc('<head><script src="/dealeron.js?v=23.13.0"></script></head><body></body>');
    expect(detectPlatform(doc)).toBe('dealeron');
  });

  it('detects DealerOn via dealeron_tagging_data', () => {
    const doc = makeDoc(
      '<head></head><body><script id="dealeron_tagging_data" type="application/json">{"dealerId":"32024"}</script></body>',
    );
    expect(detectPlatform(doc)).toBe('dealeron');
  });

  it('detects DealerFire via cdn-ds.com in link href', () => {
    const doc = makeDoc(
      '<head><link rel="stylesheet" href="https://cdn-ds.com/e6-static/stylesheets/main.css"></head><body></body>',
    );
    expect(detectPlatform(doc)).toBe('dealerfire');
  });

  it('detects DealerFire via cdn-ds.com in script src', () => {
    const doc = makeDoc(
      '<head><script src="https://cdn-ds.com/builder2/some-script.js"></script></head><body></body>',
    );
    expect(detectPlatform(doc)).toBe('dealerfire');
  });

  it('detects DealerInspire via dealerinspire.com in link href', () => {
    const doc = makeDoc(
      '<head><link rel="stylesheet" href="https://di-uploads-pod6.dealerinspire.com/styles.css"></head><body></body>',
    );
    expect(detectPlatform(doc)).toBe('dealerinspire');
  });

  it('detects DealerInspire via dealerinspire.com in script src', () => {
    const doc = makeDoc(
      '<head><script src="https://di-shared-assets.dealerinspire.com/tracker.js"></script></head><body></body>',
    );
    expect(detectPlatform(doc)).toBe('dealerinspire');
  });

  it('detects Team Velocity via teamvelocityportal.com in script src', () => {
    const doc = makeDoc(
      '<head><script src="https://websites.api.teamvelocityportal.com/widget.js"></script></head><body></body>',
    );
    expect(detectPlatform(doc)).toBe('team-velocity');
  });

  it('returns null for unknown platforms', () => {
    const doc = makeDoc('<head></head><body><p>Hello world</p></body>');
    expect(detectPlatform(doc)).toBeNull();
  });

  it('returns null for empty document', () => {
    const doc = makeDoc('<head></head><body></body>');
    expect(detectPlatform(doc)).toBeNull();
  });

  it('prioritizes DealerOn over other signals when both present', () => {
    const doc = makeDoc(
      '<head><script src="/dealeron.js"></script><link href="https://cdn-ds.com/style.css"></head><body></body>',
    );
    expect(detectPlatform(doc)).toBe('dealeron');
  });
});
