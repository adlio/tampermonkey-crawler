export interface CrawlerField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'url';
  placeholder?: string;
  default?: string | number;
}

export interface CrawlerDefinition {
  id: string;
  name: string;
  fields: CrawlerField[];
}

export const crawlerDefinitions: CrawlerDefinition[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn Activity Feed',
    fields: [
      {
        id: 'targetUrl',
        label: 'Feed URL',
        type: 'url',
        placeholder: 'https://www.linkedin.com/in/NAME/recent-activity/all/',
      },
      {
        id: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Simon Wardley Posts',
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
    ],
  },
];
