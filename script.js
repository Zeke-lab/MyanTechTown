const VISA_RULES = { Visa4:[3,4,5], Visa5:[3] };

function multiplierForPrice(price) {
  if (price > 1_500_000) return 1.18; // example extra tier
  if (price > 1_000_000) return 1.15;
  return 1.10;
}
