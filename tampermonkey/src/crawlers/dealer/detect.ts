export type DealerPlatform = 'dealeron' | 'dealerfire' | 'dealerinspire' | 'team-velocity';

export function detectPlatform(doc: Document): DealerPlatform | null {
  // DealerOn: dealeron.js script or tagging data block
  if (
    doc.querySelector('script[src*="dealeron.js"]') ||
    doc.getElementById('dealeron_tagging_data')
  )
    return 'dealeron';

  // DealerFire / DealerSocket: cdn-ds.com CDN domain
  if (doc.querySelector('[src*="cdn-ds.com"], [href*="cdn-ds.com"]')) return 'dealerfire';

  // DealerInspire (Cars.com): dealerinspire.com CDN subdomains
  if (doc.querySelector('[src*="dealerinspire.com"], [href*="dealerinspire.com"]'))
    return 'dealerinspire';

  // Team Velocity: teamvelocityportal.com API domains
  if (doc.querySelector('[src*="teamvelocityportal.com"]')) return 'team-velocity';

  return null;
}
