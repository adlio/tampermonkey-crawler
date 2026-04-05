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
        id: 'schedule',
        label: 'Schedule',
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
    name: 'CarMax Search Results',
    fields: [
      {
        id: 'targetUrl',
        label: 'Search URL',
        type: 'url',
        placeholder: 'https://www.carmax.com/cars/toyota-sienna',
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Toyota Sienna Hunt',
      },
      {
        id: 'strategy',
        label: 'Crawl Strategy',
        type: 'select',
        default: 'latest',
        options: [
          { value: 'latest', label: 'Latest — current listings on the page' },
          { value: 'full', label: 'Full — paginate through all results' },
        ],
      },
      {
        id: 'schedule',
        label: 'Schedule',
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
