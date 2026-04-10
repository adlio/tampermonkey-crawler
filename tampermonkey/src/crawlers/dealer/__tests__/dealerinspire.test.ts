import { describe, it, expect, beforeEach } from 'vitest';
import { dealerInspireExtractor } from '../platforms/dealerinspire.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('dealerInspireExtractor', () => {
  it('extracts listings from data-vehicle JSON attribute', () => {
    document.body.innerHTML = `
      <div id="hits">
        <div class="result-wrap" data-vehicle='{"vin":"JTDB4MEE0T3044365","stock":"26781","type":"New","year":"2026","make":"Toyota","model":"Corolla","trim":"LE","exterior_color":"Classic Silver Metallic","price":24594,"msrp":24594,"bodystyle":"Sedan","fueltype":"Fuel"}'>
          <a class="hit-link" href="https://dealer.com/inventory/new-2026-toyota-corolla-le/">Detail</a>
          <div class="hit-image"><img src="https://images.example.com/corolla.jpg"></div>
          <h2 class="result-title">2026 Toyota Corolla LE</h2>
          <div class="price-block"><span class="price">$24,594</span></div>
          <li data-testid="exterior-color">Exterior: Classic Silver Metallic</li>
          <li data-testid="interior-color">Interior: Black Fabric</li>
        </div>
      </div>
    `;

    const { items, errors } = dealerInspireExtractor.extractAllListings(document);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(1);

    expect(items[0]).toMatchObject({
      id: 'JTDB4MEE0T3044365',
      title: '2026 Toyota Corolla LE',
      year: 2026,
      make: 'Toyota',
      model: 'Corolla',
      trim: 'LE',
      price: 24594,
      vin: 'JTDB4MEE0T3044365',
      stockNumber: '26781',
      condition: 'new',
      link: 'https://dealer.com/inventory/new-2026-toyota-corolla-le/',
      imageUrl: 'https://images.example.com/corolla.jpg',
      exteriorColor: 'Classic Silver Metallic',
      interiorColor: 'Black Fabric',
    });
  });

  it('extracts mileage from used vehicles', () => {
    document.body.innerHTML = `
      <div id="hits">
        <div class="result-wrap" data-vehicle='{"vin":"5YJ3E1EA7LF123456","stock":"U9999","type":"Used","year":"2020","make":"Tesla","model":"Model 3","trim":"Long Range","exterior_color":"White","price":28900,"msrp":0,"bodystyle":"","fueltype":"Electric"}'>
          <a class="hit-link" href="https://dealer.com/inventory/used-2020-tesla-model-3/">Detail</a>
          <div class="hit-image"><img src="https://images.example.com/tesla.jpg"></div>
          <li data-testid="mileage">Mileage: 42,150</li>
        </div>
      </div>
    `;

    const { items } = dealerInspireExtractor.extractAllListings(document);
    expect(items).toHaveLength(1);
    expect(items[0].mileage).toBe(42150);
    expect(items[0].condition).toBe('used');
  });

  it('skips cards without data-vehicle attribute', () => {
    document.body.innerHTML = `
      <div id="hits">
        <div class="result-wrap">
          <p>No data-vehicle here</p>
        </div>
      </div>
    `;

    const { items } = dealerInspireExtractor.extractAllListings(document);
    expect(items).toHaveLength(0);
  });
});
