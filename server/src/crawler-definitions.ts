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
      { id: 'targetUrl', label: 'Feed URL', type: 'url', placeholder: 'https://www.linkedin.com/in/NAME/recent-activity/all/' },
      { id: 'obsidianPath', label: 'Obsidian Vault Path', type: 'text', placeholder: 'Resources/AIThinkers/SimonWardley/linkedin-posts' },
      { id: 'tags', label: 'Tags (comma-separated)', type: 'text', placeholder: 'ai-thinkers, simon-wardley' },
      { id: 'missionName', label: 'Mission Name', type: 'text', placeholder: 'Simon Wardley Posts' }
    ]
  },
  {
    id: 'carmax',
    name: 'CarMax Search Results',
    fields: [
      { id: 'targetUrl', label: 'Search URL', type: 'url', placeholder: 'https://www.carmax.com/cars/toyota-sienna' },
      { id: 'make', label: 'Make', type: 'text', placeholder: 'Toyota' },
      { id: 'model', label: 'Model', type: 'text', placeholder: 'Sienna' },
      { id: 'zip', label: 'ZIP Code', type: 'number', placeholder: '90210' },
      { id: 'tableName', label: 'SQLite Table Name', type: 'text', placeholder: 'carmax_results' },
      { id: 'missionName', label: 'Mission Name', type: 'text', placeholder: 'Toyota Sienna Hunt' }
    ]
  }
];
