// Canonical TASARA seller tiers. Buyers never have a tier.
export const SELLER_TIERS = Object.freeze({
  1: Object.freeze({ id: 1, name: 'Micro-Steward', label: 'Starter', stakeMinUsd: 50, stakeDisplay: '$50', omniIssued: 5, omniDisplay: '5', scope: 'Student ventures & individual contractors' }),
  2: Object.freeze({ id: 2, name: 'Essential Steward', label: 'Standard', stakeMinUsd: 200, stakeDisplay: '$200', omniIssued: 20, omniDisplay: '20', scope: 'Daily goods, food & primary commodities' }),
  3: Object.freeze({ id: 3, name: 'Strategic Steward', label: 'Professional', stakeMinUsd: 500, stakeDisplay: '$500', omniIssued: 50, omniDisplay: '50', scope: 'Consultancy, technology & specialist services' }),
  4: Object.freeze({ id: 4, name: 'Foundational Steward', label: 'Institutional', stakeMinUsd: 1000, stakeDisplay: '$1,000+', omniIssued: 100, omniDisplay: '100+', scope: 'Infrastructure, bulk supply & institutional partners' })
});

export function getSellerTier(tier) {
  const item = SELLER_TIERS[Number(tier)];
  if (!item) throw new Error('Please choose a valid seller tier.');
  return item;
}
