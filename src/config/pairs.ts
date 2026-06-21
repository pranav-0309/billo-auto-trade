const PAIRS: Readonly<Record<string, string>> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  GBPJPY: 'GBP/JPY',
  AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD',
  USDCHF: 'USD/CHF',
  NZDUSD: 'NZD/USD',
  EURJPY: 'EUR/JPY',
  EURGBP: 'EUR/GBP',
  EURCHF: 'EUR/CHF',
  AUDJPY: 'AUD/JPY',
  EURAUD: 'EUR/AUD',
  EURCAD: 'EUR/CAD',
  GBPCHF: 'GBP/CHF',
  CADJPY: 'CAD/JPY',
  CHFJPY: 'CHF/JPY',
};

export function normalize(rawPair: string): string | null {
  return PAIRS[rawPair] ?? null;
}

export { PAIRS };
