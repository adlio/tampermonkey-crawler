import { describe, it, expect, beforeEach } from 'vitest';
import { teamVelocityExtractor } from '../platforms/team-velocity.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('teamVelocityExtractor', () => {
  it('extracts listings from DOM cards with JSON-LD merge', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">
      {
        "@type": "Car",
        "vehicleIdentificationNumber": "5XXG34J29NG158565",
        "model": "K5",
        "sku": "KD0477A",
        "brand": "Kia",
        "vehicleModelDate": "2022",
        "color": "Passion Red",
        "vehicleInteriorColor": "Black",
        "itemCondition": "https://schema.org/UsedCondition",
        "mileageFromOdometer": { "@type": "QuantitativeValue", "value": "51005" },
        "offers": { "price": "21965", "url": "https://dealer.com/viewdetails/used/5xxg34j29ng158565/2022-kia-k5" },
        "name": "Used 2022 Kia K5 EX",
        "image": { "contentUrl": "https://content.homenetiol.com/k5.jpg" }
      }
      </script>
    `;
    document.body.innerHTML = `
      <div class="clean-design-srp-card" data-itemid="Kia-K5-EX-5XXG34J29NG158565">
        <em class="primaryicon-options-btn-new" data-vin="5XXG34J29NG158565"></em>
        <h1 class="vehiclebox-title-main">2022 Kia K5 EX FWD</h1>
        <img class="srp-vehiclebox-image" src="https://content.homenetiol.com/k5.jpg">
        <div class="vehiclebox-msrp">$24,965</div>
        <div id="5xxg34j29ng158565-your-price">$21,965</div>
        <div id="copy_stock">KD0477A</div>
        <a href="https://dealer.com/viewdetails/used/5xxg34j29ng158565/2022-kia-k5">View</a>
        <span class="details-item-label">Mileage</span>
        <span class="details-item-value">51,005 Miles</span>
        <span class="details-item-label">Exterior</span>
        <span class="details-item-value">Passion Red</span>
        <span class="details-item-label">Interior</span>
        <span class="details-item-value">Black</span>
      </div>
    `;

    const { items, errors } = teamVelocityExtractor.extractAllListings(document);
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(1);

    expect(items[0]).toMatchObject({
      id: '5XXG34J29NG158565',
      vin: '5XXG34J29NG158565',
      title: '2022 Kia K5 EX FWD',
      year: 2022,
      make: 'Kia',
      model: 'K5',
      trim: 'EX FWD',
      price: 21965,
      mileage: 51005,
      stockNumber: 'KD0477A',
      exteriorColor: 'Passion Red',
      interiorColor: 'Black',
    });
  });

  it('extracts from JSON-LD when no matching card in DOM', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">
      {
        "@type": "Car",
        "vehicleIdentificationNumber": "KNAE35LC5N6123456",
        "model": "EV6",
        "brand": "Kia",
        "vehicleModelDate": "2025",
        "itemCondition": "https://schema.org/NewCondition",
        "offers": { "price": "48900" },
        "name": "New 2025 Kia EV6 Wind AWD"
      }
      </script>
    `;
    document.body.innerHTML = '<div></div>';

    const { items } = teamVelocityExtractor.extractAllListings(document);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      vin: 'KNAE35LC5N6123456',
      model: 'EV6',
      condition: 'new',
      price: 48900,
    });
  });

  it('extracts VIN from data-itemid when no data-vin element', () => {
    document.body.innerHTML = `
      <div class="clean-design-srp-card" data-itemid="Kia-Sportage-X-Line-KNDP63AF0S7999999">
        <h1 class="vehiclebox-title-main">2025 Kia Sportage X-Line</h1>
        <div class="vehiclebox-msrp">$38,290</div>
      </div>
    `;

    const { items } = teamVelocityExtractor.extractAllListings(document);
    expect(items).toHaveLength(1);
    expect(items[0].vin).toBe('KNDP63AF0S7999999');
  });

  it('skips non-Car JSON-LD blocks', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">
      { "@type": "AutoDealer", "name": "Weston Kia" }
      </script>
    `;
    document.body.innerHTML = '<div></div>';

    const { items } = teamVelocityExtractor.extractAllListings(document);
    expect(items).toHaveLength(0);
  });
});
