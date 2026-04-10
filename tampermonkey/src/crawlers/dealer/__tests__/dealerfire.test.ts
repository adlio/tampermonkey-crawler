import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { dealerFireExtractor } from '../platforms/dealerfire.js';

const fixturesDir = resolve(__dirname, '__fixtures__');

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('dealerFireExtractor', () => {
  it('extracts listings from vehicle cards', () => {
    document.body.innerHTML = `
      <div class="vehicle-item js-vehicle-item" data-vuid="64552656">
        <h6 class="vehicle-item__title js-vehicle-item-title">2020 Porsche 911 Carrera S</h6>
        <a class="js-vehicle-item-link" href="https://dealer.com/vehicle-details/used-2020-porsche-911">View</a>
        <img class="vehicle-item__image js-vehicle-item-image" src="https://cdn-ds.com/stock/photo.jpg">
        <div class="mod-vehicle-price-theme1">
          <div class="price __final-price">
            <span class="price_value">$157,977</span>
          </div>
        </div>
        <span class="js-carfax" data-vin="WP0AB2A94LS234567"></span>
        <div class="vehicle-highlights__additional-item">
          <span class="vehicle-highlights__additional-label">Stock</span>
          <span class="vehicle-highlights__additional-value">7495</span>
        </div>
        <div class="vehicle-highlights__additional-item">
          <span class="vehicle-highlights__additional-label">Mileage</span>
          <span class="vehicle-highlights__additional-value">16,233</span>
        </div>
      </div>
    `;

    const { items, errors } = dealerFireExtractor.extractAllListings(document);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(1);

    // parseVehicleTitle splits: model = first word after make, trim = rest
    expect(items[0]).toMatchObject({
      id: 'WP0AB2A94LS234567',
      title: '2020 Porsche 911 Carrera S',
      year: 2020,
      make: 'Porsche',
      model: '911',
      price: 157977,
      mileage: 16233,
      vin: 'WP0AB2A94LS234567',
      stockNumber: '7495',
      imageUrl: 'https://cdn-ds.com/stock/photo.jpg',
      link: 'https://dealer.com/vehicle-details/used-2020-porsche-911',
    });
  });

  it('extracts VIN from image URL when no Carfax badge', () => {
    document.body.innerHTML = `
      <div class="vehicle-item js-vehicle-item" data-vuid="12345">
        <h6 class="vehicle-item__title js-vehicle-item-title">2023 BMW X5 xDrive40i</h6>
        <img class="vehicle-item__image js-vehicle-item-image"
             src="https://cdn-ds.com/stock/2023-BMW-X5/seo/VAMP99999-5UXCR6C05P9K12345/sz_640/img.jpg">
        <div class="mod-vehicle-price-theme1">
          <div class="price __final-price">
            <span class="price_value">$52,900</span>
          </div>
        </div>
      </div>
    `;

    const { items } = dealerFireExtractor.extractAllListings(document);
    expect(items).toHaveLength(1);
    expect(items[0].vin).toBe('5UXCR6C05P9K12345');
  });

  it('handles one-price profile and data-original-title highlights', () => {
    document.body.innerHTML = `
      <div class="vehicle-item js-vehicle-item" data-vuid="63177720">
        <h6 class="vehicle-item__title js-vehicle-item-title">2024 Ferrari 296 GTS</h6>
        <a class="js-vehicle-item-link" href="https://dealer.com/vehicle-details/2024-ferrari-296">View</a>
        <img class="vehicle-item__image js-vehicle-item-image"
             src="https://cdn-ds.com/stock/seo/VAMP11955-ZFF97NMA8R0654321/sz_640/img.jpg">
        <div class="mod-vehicle-price-theme1 profile-one-price-no-label">
          <span class="one-price">$379,990</span>
        </div>
        <div class="vehicle-highlights__additional-item" data-original-title="Mileage">
          <span class="vehicle-highlights__additional-value">535 mi</span>
        </div>
        <div class="vehicle-highlights__color" data-content="Exterior: Rosso Corsa"></div>
        <div class="vehicle-highlights__color" data-content="Interior: Nero"></div>
      </div>
    `;

    const { items } = dealerFireExtractor.extractAllListings(document);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      vin: 'ZFF97NMA8R0654321',
      price: 379990,
      mileage: 535,
      exteriorColor: 'Rosso Corsa',
      interiorColor: 'Nero',
    });
  });

  it('handles cards without VIN gracefully', () => {
    document.body.innerHTML = `
      <div class="vehicle-item js-vehicle-item" data-vuid="99999">
        <h6 class="vehicle-item__title js-vehicle-item-title">No Make No Model</h6>
        <img class="vehicle-item__image js-vehicle-item-image" src="https://cdn-ds.com/noimage.jpg">
        <div class="vehicle-highlights__additional-item">
          <span class="vehicle-highlights__additional-label">Stock</span>
          <span class="vehicle-highlights__additional-value">MISC1</span>
        </div>
      </div>
    `;

    const { items } = dealerFireExtractor.extractAllListings(document);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('MISC1'); // falls back to stock number
    expect(items[0].vin).toBeUndefined();
  });

  describe('live fixture', () => {
    it('extracts from realistic DealerFire card fixture', () => {
      const cardHtml = readFileSync(resolve(fixturesDir, 'dealerfire-card.html'), 'utf-8');
      document.body.innerHTML = cardHtml;

      const { items, errors } = dealerFireExtractor.extractAllListings(document);
      expect(errors).toHaveLength(0);
      expect(items).toHaveLength(1);

      expect(items[0]).toMatchObject({
        id: 'WP0AB2A94LS229362',
        title: '2020 Porsche 911 Carrera S',
        year: 2020,
        make: 'Porsche',
        model: '911',
        vin: 'WP0AB2A94LS229362',
        stockNumber: '7495',
        mileage: 16233,
        price: 157977,
        exteriorColor: 'Black',
      });
    });
  });
});
