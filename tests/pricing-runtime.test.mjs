import test from 'node:test';
import assert from 'node:assert/strict';
import { priceFor } from '../src/index.js';

function fakeEnv({ offer = null, coupon = null } = {}) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('FROM offers')) return offer;
                if (sql.includes('FROM coupons')) return coupon;
                return null;
              }
            };
          }
        };
      }
    }
  };
}
const product = { product_id: 'book-1', price: 100, base_price: 499 };
const liveOffer = (extra = {}) => ({
  product_id: 'book-1', active: 1, sale_price: 50, mrp: 499,
  starts_at: '2020-01-01T00:00:00.000Z', ends_at: '2099-01-01T00:00:00.000Z',
  label: 'Offer', ...extra
});
const liveCoupon = (extra = {}) => ({
  code: 'SAVE10', active: 1, discount_type: 'PERCENT', discount_value: 10,
  product_ids: '*', min_amount: null, max_uses: null, used_count: 0,
  starts_at: null, expires_at: '2099-01-01T00:00:00.000Z', ...extra
});

test('live offer price is used before flat coupon discount', async () => {
  const result = await priceFor(fakeEnv({ offer: liveOffer(), coupon: liveCoupon({ discount_type: 'FLAT', discount_value: 10 }) }), product, 'SAVE10');
  assert.equal(result.base, 50);
  assert.equal(result.final, 40);
  assert.equal(result.discount, 10);
});

test('historical PERCENTAGE coupon applies as percentage, not flat rupees', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ discount_type: 'PERCENTAGE', discount_value: 10 }) }), product, 'SAVE10');
  assert.equal(result.base, 100);
  assert.equal(result.final, 90);
  assert.equal(result.discount, 10);
});

test('100 percent coupon produces exactly zero payable', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ discount_value: 100 }) }), product, 'SAVE10');
  assert.equal(result.final, 0);
  assert.equal(result.discount, 100);
});

test('malformed active offer schedule fails closed instead of silently using base price', async () => {
  const result = await priceFor(fakeEnv({ offer: liveOffer({ starts_at: 'not-a-date' }) }), product, '');
  assert.equal(result.pricingError, true);
  assert.equal(result.final, null);
});

test('valid expired offer is ignored and base price remains authoritative', async () => {
  const result = await priceFor(fakeEnv({ offer: liveOffer({ starts_at: '2020-01-01T00:00:00.000Z', ends_at: '2021-01-01T00:00:00.000Z' }) }), product, '');
  assert.equal(result.pricingError, undefined);
  assert.equal(result.base, 100);
  assert.equal(result.final, 100);
});

 test('JSON product restriction accepts matching product ID', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ product_ids: '["book-1","book-2"]', discount_value: 10 }) }), product, 'SAVE10');
  assert.equal(result.final, 90);
  assert.equal(result.couponError, null);
});

test('expired coupon is rejected rather than applied', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ expires_at: '2020-01-01T00:00:00.000Z' }) }), product, 'SAVE10');
  assert.match(result.couponError, /coupon/i);
  assert.equal(result.final, 100);
});

test('coupon at usage limit is rejected', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ max_uses: 5, used_count: 5 }) }), product, 'SAVE10');
  assert.match(result.couponError, /सीमा पूरी/);
  assert.equal(result.final, 100);
});

test('coupon for a different product is rejected', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ product_ids: 'book-2' }) }), product, 'SAVE10');
  assert.match(result.couponError, /इस किताब पर/);
  assert.equal(result.final, 100);
});

test('flat coupon cannot make payable amount negative', async () => {
  const result = await priceFor(fakeEnv({ coupon: liveCoupon({ discount_type: 'FLAT', discount_value: 250 }) }), product, 'SAVE10');
  assert.equal(result.final, 0);
  assert.equal(result.discount, 100);
});

test('invalid base product price fails closed', async () => {
  const result = await priceFor(fakeEnv(), { product_id: 'book-1', price: -1, base_price: 499 }, '');
  assert.equal(result.pricingError, true);
  assert.equal(result.final, null);
});
