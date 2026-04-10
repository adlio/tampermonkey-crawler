import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { dealerOnExtractor } from '../platforms/dealeron.js';

const fixturesDir = resolve(__dirname, '__fixtures__');

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('dealerOnExtractor', () => {
  describe('extractAllListings — JSON-LD', () => {
    it('extracts vehicles from JSON-LD ItemList', () => {
      document.head.innerHTML = `
        <script type="application/ld+json">
        {
          "@type": "ItemList",
          "itemListElement": [
            {
              "name": "2025 Toyota Camry LE",
              "identifier": "4T1C11AK0SU123456",
              "url": "https://dealer.com/vehicle/4T1C11AK0SU123456",
              "image": "https://dealer.com/photos/camry.jpg",
              "offers": { "price": "29500" }
            },
            {
              "name": "2024 Honda Civic EX",
              "identifier": "2HGFE2F59RH567890",
              "url": "https://dealer.com/vehicle/2HGFE2F59RH567890",
              "image": "https://dealer.com/photos/civic.jpg"
            }
          ]
        }
        </script>
      `;

      const { items, errors } = dealerOnExtractor.extractAllListings(document);
      expect(errors).toHaveLength(0);
      expect(items).toHaveLength(2);

      // parseVehicleTitle splits: model = first word after make, trim = rest
      expect(items[0]).toMatchObject({
        id: '4T1C11AK0SU123456',
        title: '2025 Toyota Camry LE',
        year: 2025,
        make: 'Toyota',
        model: 'Camry',
        vin: '4T1C11AK0SU123456',
        imageUrl: 'https://dealer.com/photos/camry.jpg',
        link: 'https://dealer.com/vehicle/4T1C11AK0SU123456',
        price: 29500,
      });

      expect(items[1]).toMatchObject({
        vin: '2HGFE2F59RH567890',
        year: 2024,
        make: 'Honda',
        model: 'Civic',
        price: undefined,
      });
    });

    it('returns empty for pages without JSON-LD', () => {
      document.body.innerHTML = '<div>No vehicles here</div>';
      const { items } = dealerOnExtractor.extractAllListings(document);
      expect(items).toHaveLength(0);
    });
  });

  describe('extractAllListings — card enrichment', () => {
    it('enriches JSON-LD data with visible card data-* attributes', () => {
      document.head.innerHTML = `
        <script type="application/ld+json">
        {
          "@type": "ItemList",
          "itemListElement": [
            {
              "name": "2025 Kia Sportage LX",
              "identifier": "KNDP63AF0S7123456",
              "url": "https://dealer.com/vehicle/KNDP63AF0S7123456",
              "image": "https://dealer.com/photos/sportage.jpg"
            }
          ]
        }
        </script>
      `;
      document.body.innerHTML = `
        <div class="vehicle-card"
             data-vin="KNDP63AF0S7123456"
             data-year="2025"
             data-make="Kia"
             data-model="Sportage"
             data-trim="LX"
             data-name="2025 Kia Sportage LX"
             data-msrp="32500"
             data-price="31000"
             data-stocknum="K1234"
             data-extcolor="Snow White Pearl"
             data-intcolor="Black"
             data-vehicletype="new"
             data-mpgcity="26"
             data-mpghwy="32"
             data-engine="2.5L I-4 DGI DOHC 16V LEV3-ULEV70 187hp"
             data-fueltype="Gasoline"
             data-bodystyle="SUV"
             data-dotagging-item-odometer="15 mi">
          <a class="vehicle-title" href="https://dealer.com/vehicle/KNDP63AF0S7123456">
            2025 Kia Sportage LX
          </a>
        </div>
      `;

      const { items } = dealerOnExtractor.extractAllListings(document);
      expect(items).toHaveLength(1);

      // Card data should overwrite JSON-LD (richer)
      expect(items[0]).toMatchObject({
        vin: 'KNDP63AF0S7123456',
        year: 2025,
        make: 'Kia',
        model: 'Sportage',
        trim: 'LX',
        price: 31000,
        mileage: 15,
        stockNumber: 'K1234',
        condition: 'new',
        exteriorColor: 'Snow White Pearl',
        interiorColor: 'Black',
        mpgCity: 26,
        mpgHwy: 32,
        engine: '2.5L I-4 DGI DOHC 16V LEV3-ULEV70 187hp',
        fuelType: 'Gasoline',
        bodyStyle: 'SUV',
      });
    });
  });

  describe('extractAllListings — live fixture', () => {
    it('extracts from realistic DealerOn JSON-LD fixture', () => {
      const jsonLdHtml = readFileSync(resolve(fixturesDir, 'dealeron-jsonld.html'), 'utf-8');
      document.head.innerHTML = jsonLdHtml;

      const { items, errors } = dealerOnExtractor.extractAllListings(document);
      expect(errors).toHaveLength(0);
      expect(items).toHaveLength(2);

      expect(items[0]).toMatchObject({
        vin: 'WBA63DA0XSCU55184',
        title: '2025 BMW 4 Series 430i xDrive',
        year: 2025,
        make: 'BMW',
        // parseVehicleTitle: "4" is the model (first non-make word), "Series 430i xDrive" is trim
        model: '4',
        imageUrl: 'https://www.flemingtonbmw.com/inventoryphotos/23124/wba63da0xscu55184/ip/1.jpg',
      });

      expect(items[1]).toMatchObject({
        vin: '5UX53GP09T9142146',
        title: '2026 BMW X3 30 xDrive',
        year: 2026,
        make: 'BMW',
        model: 'X3',
      });
    });

    it('extracts from realistic DealerOn card fixture with data-* attributes', () => {
      const cardHtml = readFileSync(resolve(fixturesDir, 'dealeron-card.html'), 'utf-8');
      document.body.innerHTML = cardHtml;

      const { items, errors } = dealerOnExtractor.extractAllListings(document);
      expect(errors).toHaveLength(0);
      expect(items).toHaveLength(1);

      // Card uses data-model="4 Series" directly (not parseVehicleTitle)
      expect(items[0]).toMatchObject({
        vin: 'WBA63DA0XSCU55184',
        year: 2025,
        make: 'BMW',
        model: '4 Series',
        trim: '430i xDrive',
        price: 61480, // falls back to MSRP when data-price is 0
        mileage: 51,
        stockNumber: 'WM25239',
        condition: 'new',
        exteriorColor: 'Portimao Blue Metallic',
        interiorColor: 'Black Perforated Sensatec',
        mpgCity: 27,
        mpgHwy: 34,
        engine: 'Intercooled Turbo Gas/Electric I-4 2.0 L/122',
        fuelType: 'Gasoline',
        bodyStyle: 'Coupe',
      });
    });
  });
});
