import { SiteCrawler } from './index.js';

export const carmaxCrawler: SiteCrawler = {
  match: (url) => url.includes('carmax.com/cars'),
  run: async (task) => {
    console.log('[CarMax] Starting crawl for task:', task.id);
    const config = task.config ? JSON.parse(task.config) : {};
    
    // Wait for results to load
    await new Promise(r => setTimeout(r, 3000));

    const carCards = document.querySelectorAll('.car-tile');
    const results = Array.from(carCards).map(card => {
        const title = card.querySelector('.car-tile--title')?.textContent?.trim();
        const price = card.querySelector('.car-tile--price')?.textContent?.trim();
        const mileage = card.querySelector('.car-tile--mileage')?.textContent?.trim();
        const link = (card.querySelector('.car-tile--link') as HTMLAnchorElement)?.href;
        const vin = card.getAttribute('data-vin');

        return { title, price, mileage, link, vin };
    });

    console.log(`[CarMax] Found ${results.length} cars.`);

    await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'http://localhost:4242/api/collect',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                site: 'carmax',
                taskId: task.id,
                payload: {
                    searchConfig: config,
                    results,
                    timestamp: new Date().toISOString()
                }
            }),
            onload: (response) => {
                if (response.status >= 200 && response.status < 300) resolve(response);
                else reject(new Error(`Server returned ${response.status}`));
            },
            onerror: (err) => reject(err)
        });
    });

    console.log(`[CarMax] Saved results for task: ${task.id}`);
  },
};
