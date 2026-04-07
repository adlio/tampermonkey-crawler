export interface CrawlerField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'url' | 'select';
  placeholder?: string;
  default?: string | number;
  options?: { value: string; label: string }[];
}

export interface CrawlerDefinition {
  id: string;
  name: string;
  fields: CrawlerField[];
  deriveTargetUrl?: (config: Record<string, any>) => string | null;
}

export const crawlerDefinitions: CrawlerDefinition[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn Activity Feed',
    deriveTargetUrl: (config) =>
      config.profileId
        ? `https://www.linkedin.com/in/${config.profileId}/recent-activity/all/`
        : null,
    fields: [
      {
        id: 'profileId',
        label: 'Profile ID',
        type: 'text',
        placeholder: 'simonwardley',
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Simon Wardley Posts',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'full',
        options: [
          { value: 'full', label: 'Full archive — get everything, then incremental' },
          { value: 'latest', label: 'Latest — first page only, then new posts' },
          { value: 'date-range', label: 'Date range — posts within a time window' },
        ],
      },
      {
        id: 'runMode',
        label: 'Run Mode',
        type: 'select',
        default: 'recurring',
        options: [
          { value: 'recurring', label: 'Recurring — re-crawl on a schedule' },
          { value: 'once', label: 'One-time — complete after first crawl' },
        ],
      },
      {
        id: 'recrawlIntervalHours',
        label: 'Re-crawl Interval (hours)',
        type: 'number',
        default: 168,
        placeholder: '168',
      },
    ],
  },
  {
    id: 'carmax',
    name: 'CarMax Vehicle Search',
    deriveTargetUrl: (config) => {
      const make = config.make?.trim().toLowerCase().replace(/\s+/g, '-');
      if (!make) return null;
      const model = config.model?.trim().toLowerCase().replace(/\s+/g, '-');
      let url = `https://www.carmax.com/cars/${make}`;
      if (model) url += `/${model}`;
      const yearMin = config.yearMin ? parseInt(config.yearMin, 10) : null;
      const yearMax = config.yearMax ? parseInt(config.yearMax, 10) : null;
      if (yearMin) url += `?year=${yearMin}-${yearMax || 0}`;
      return url;
    },
    fields: [
      {
        id: 'make',
        label: 'Make',
        type: 'text',
        placeholder: 'rivian',
      },
      {
        id: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'r1s',
      },
      {
        id: 'yearMin',
        label: 'Year From',
        type: 'number',
        placeholder: '2025',
      },
      {
        id: 'yearMax',
        label: 'Year To (blank = no upper limit)',
        type: 'number',
        placeholder: '2026',
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Rivian R1S 2025+',
      },
      {
        id: 'excludePatterns',
        label: 'Exclude Title Patterns (comma-separated)',
        type: 'text',
        placeholder: '1958, Standard',
      },
      {
        id: 'requirePatterns',
        label: 'Require Title Patterns (comma-separated)',
        type: 'text',
        placeholder: 'GT-Line',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'full',
        options: [
          { value: 'full', label: 'Full — load all pages via See More' },
          { value: 'latest', label: 'Latest — current visible listings only' },
        ],
      },
      {
        id: 'runMode',
        label: 'Run Mode',
        type: 'select',
        default: 'recurring',
        options: [
          { value: 'recurring', label: 'Recurring — re-crawl on a schedule' },
          { value: 'once', label: 'One-time — complete after first crawl' },
        ],
      },
      {
        id: 'recrawlIntervalHours',
        label: 'Re-crawl Interval (hours)',
        type: 'number',
        default: 24,
        placeholder: '24',
      },
    ],
  },
  {
    id: 'carvana',
    name: 'Carvana Vehicle Search',
    deriveTargetUrl: (config) => {
      const make = config.make?.trim().toLowerCase().replace(/\s+/g, '-');
      if (!make) return null;
      const model = config.model?.trim().toLowerCase().replace(/\s+/g, '-');
      let url = `https://www.carvana.com/cars/${make}`;
      if (model) url += `-${model}`;
      const params: string[] = [];
      const yearMin = config.yearMin ? parseInt(config.yearMin, 10) : null;
      const yearMax = config.yearMax ? parseInt(config.yearMax, 10) : null;
      if (yearMin) params.push(`year-min=${yearMin}`);
      if (yearMax) params.push(`year-max=${yearMax}`);
      if (params.length > 0) url += `?${params.join('&')}`;
      return url;
    },
    fields: [
      {
        id: 'make',
        label: 'Make',
        type: 'text',
        placeholder: 'rivian',
      },
      {
        id: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'r1s',
      },
      {
        id: 'yearMin',
        label: 'Year From',
        type: 'number',
        placeholder: '2025',
      },
      {
        id: 'yearMax',
        label: 'Year To (blank = no upper limit)',
        type: 'number',
        placeholder: '2026',
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Rivian R1S 2025+',
      },
      {
        id: 'excludePatterns',
        label: 'Exclude Title Patterns (comma-separated)',
        type: 'text',
        placeholder: 'Standard, Adventure',
      },
      {
        id: 'requirePatterns',
        label: 'Require Title Patterns (comma-separated)',
        type: 'text',
        placeholder: 'Quad-Motor',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'full',
        options: [
          { value: 'full', label: 'Full — paginate through all results' },
          { value: 'latest', label: 'Latest — current page only' },
        ],
      },
      {
        id: 'runMode',
        label: 'Run Mode',
        type: 'select',
        default: 'recurring',
        options: [
          { value: 'recurring', label: 'Recurring — re-crawl on a schedule' },
          { value: 'once', label: 'One-time — complete after first crawl' },
        ],
      },
      {
        id: 'recrawlIntervalHours',
        label: 'Re-crawl Interval (hours)',
        type: 'number',
        default: 24,
        placeholder: '24',
      },
    ],
  },
  {
    id: 'autotrader',
    name: 'AutoTrader Vehicle Search',
    deriveTargetUrl: (config) => {
      const make = config.make?.trim().toLowerCase().replace(/\s+/g, '-');
      if (!make) return null;
      const model = config.model?.trim().toLowerCase().replace(/\s+/g, '-');
      let url = `https://www.autotrader.com/cars-for-sale/all-cars/${make}`;
      if (model) url += `/${model}`;
      const params: string[] = [];
      const yearMin = config.yearMin ? parseInt(config.yearMin, 10) : null;
      const yearMax = config.yearMax ? parseInt(config.yearMax, 10) : null;
      if (yearMin) params.push(`startYear=${yearMin}`);
      if (yearMax) params.push(`endYear=${yearMax}`);
      if (config.zip) params.push(`zip=${config.zip}`);
      if (params.length > 0) url += `?${params.join('&')}`;
      return url;
    },
    fields: [
      {
        id: 'make',
        label: 'Make',
        type: 'text',
        placeholder: 'rivian',
      },
      {
        id: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'r1s',
      },
      {
        id: 'yearMin',
        label: 'Year From',
        type: 'number',
        placeholder: '2025',
      },
      {
        id: 'yearMax',
        label: 'Year To (blank = no upper limit)',
        type: 'number',
        placeholder: '2026',
      },
      {
        id: 'zip',
        label: 'ZIP Code',
        type: 'text',
        placeholder: '97201',
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Rivian R1S 2025+',
      },
      {
        id: 'excludePatterns',
        label: 'Exclude Title Patterns (comma-separated)',
        type: 'text',
        placeholder: 'Launch Edition, Standard',
      },
      {
        id: 'requirePatterns',
        label: 'Require Title Patterns (comma-separated)',
        type: 'text',
        placeholder: 'Adventure',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'full',
        options: [
          { value: 'full', label: 'Full — load all pages via See More' },
          { value: 'latest', label: 'Latest — current visible listings only' },
        ],
      },
      {
        id: 'runMode',
        label: 'Run Mode',
        type: 'select',
        default: 'recurring',
        options: [
          { value: 'recurring', label: 'Recurring — re-crawl on a schedule' },
          { value: 'once', label: 'One-time — complete after first crawl' },
        ],
      },
      {
        id: 'recrawlIntervalHours',
        label: 'Re-crawl Interval (hours)',
        type: 'number',
        default: 24,
        placeholder: '24',
      },
    ],
  },
  {
    id: 'lexus',
    name: 'Lexus Inventory',
    deriveTargetUrl: (config) => {
      const listingType = config.listingType || 'new';
      if (listingType === 'lcertified') {
        return 'https://www.lexus.com/lcertified/search-inventory';
      }
      const model = (config.model || '').toUpperCase().replace(/\s+/g, '-');
      if (!model) return null;
      const zip = config.zip || '97201';
      const distance = config.distance || 50;
      return `https://www.lexus.com/search-inventory/model/${model}/?zipcode=${zip}&distance=${distance}`;
    },
    fields: [
      {
        id: 'listingType',
        label: 'Listing Type',
        type: 'select',
        default: 'new',
        options: [
          { value: 'new', label: 'New Inventory' },
          { value: 'lcertified', label: 'L/Certified Pre-Owned' },
        ],
      },
      {
        id: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'e.g. RX',
      },
      {
        id: 'yearMin',
        label: 'Year Min',
        type: 'number',
      },
      {
        id: 'yearMax',
        label: 'Year Max',
        type: 'number',
      },
      {
        id: 'zip',
        label: 'ZIP Code',
        type: 'text',
        placeholder: '97201',
      },
      {
        id: 'distance',
        label: 'Distance (mi)',
        type: 'number',
        default: 50,
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Lexus RX 2026',
      },
      {
        id: 'excludePatterns',
        label: 'Exclude Patterns (comma-separated)',
        type: 'text',
        placeholder: 'F SPORT, Hybrid',
      },
      {
        id: 'requirePatterns',
        label: 'Require Patterns (comma-separated)',
        type: 'text',
        placeholder: 'Luxury',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'full',
        options: [
          { value: 'full', label: 'Full — load all via LOAD MORE' },
          { value: 'latest', label: 'Latest — current visible listings only' },
        ],
      },
      {
        id: 'runMode',
        label: 'Run Mode',
        type: 'select',
        default: 'recurring',
        options: [
          { value: 'recurring', label: 'Recurring — re-crawl on a schedule' },
          { value: 'once', label: 'One-time — complete after first crawl' },
        ],
      },
      {
        id: 'recrawlIntervalHours',
        label: 'Re-crawl Interval (hours)',
        type: 'number',
        default: 24,
        placeholder: '24',
      },
    ],
  },
  {
    id: 'toyota',
    name: 'Toyota Inventory',
    deriveTargetUrl: (config) => {
      const listingType = config.listingType || 'new';
      if (listingType === 'cpo') {
        const zip = config.zip || '97201';
        const distance = config.distance || 25;
        return `https://www.toyotacertified.com/inventory?zipCode=${zip}&radius=${distance}`;
      }
      const model = (config.model || '').toLowerCase().replace(/\s+/g, '-');
      if (!model) return null;
      const zip = config.zip || '97201';
      const distance = config.distance || 50;
      return `https://www.toyota.com/search-inventory/model/${model}/?zipcode=${zip}&distance=${distance}`;
    },
    fields: [
      {
        id: 'listingType',
        label: 'Listing Type',
        type: 'select',
        default: 'new',
        options: [
          { value: 'new', label: 'New Inventory' },
          { value: 'cpo', label: 'Certified Pre-Owned (TCUV)' },
        ],
      },
      {
        id: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'e.g. camry',
      },
      {
        id: 'yearMin',
        label: 'Year Min',
        type: 'number',
      },
      {
        id: 'yearMax',
        label: 'Year Max',
        type: 'number',
      },
      {
        id: 'zip',
        label: 'ZIP Code',
        type: 'text',
        placeholder: '97201',
      },
      {
        id: 'distance',
        label: 'Distance (mi)',
        type: 'number',
        default: 50,
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Toyota Camry 2026',
      },
      {
        id: 'excludePatterns',
        label: 'Exclude Patterns (comma-separated)',
        type: 'text',
        placeholder: 'XSE, TRD',
      },
      {
        id: 'requirePatterns',
        label: 'Require Patterns (comma-separated)',
        type: 'text',
        placeholder: 'LE',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'full',
        options: [
          { value: 'full', label: 'Full — load all via LOAD MORE' },
          { value: 'latest', label: 'Latest — current visible listings only' },
        ],
      },
      {
        id: 'runMode',
        label: 'Run Mode',
        type: 'select',
        default: 'recurring',
        options: [
          { value: 'recurring', label: 'Recurring — re-crawl on a schedule' },
          { value: 'once', label: 'One-time — complete after first crawl' },
        ],
      },
      {
        id: 'recrawlIntervalHours',
        label: 'Re-crawl Interval (hours)',
        type: 'number',
        default: 24,
        placeholder: '24',
      },
    ],
  },
];
