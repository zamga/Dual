// Real US tickers that a simulated company must never use. Two layers:
//   REAL_TICKERS     the recognisable names, ETFs, index symbols and famous symbols of the 2008-2014
//                    part of the simulated history (hand list, kept for readability and for the tests);
//   US_SYMBOL_SET    every root symbol listed on a US exchange since 2015 (engine/sim/us-symbols.txt,
//                    about 22,000 symbols from the exchange symbol directories).
// A generated ticker in either is rejected and another candidate is derived (engine/sim/names.js).
import { readFileSync } from 'node:fs';

export const REAL_TICKERS = [
  // mega and large caps
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'FB', 'TSLA', 'NVDA', 'BRK', 'BRKA', 'BRKB', 'JPM', 'JNJ',
  'PG', 'UNH', 'HD', 'XOM', 'CVX', 'BAC', 'WFC', 'GS', 'MS', 'KO', 'PEP', 'MCD', 'NKE', 'DIS', 'NFLX',
  'INTC', 'AMD', 'CSCO', 'ORCL', 'IBM', 'CRM', 'ADBE', 'PYPL', 'VZ', 'CMCSA', 'WMT', 'COST', 'TGT', 'LOW',
  'SBUX', 'BA', 'CAT', 'GE', 'MMM', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'NOC', 'GD', 'GM', 'PFE', 'MRK',
  'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'MDT', 'ABT', 'TMO', 'DHR', 'CVS', 'CI', 'HUM', 'ANTM', 'ELV',
  'MO', 'PM', 'KHC', 'GIS', 'HSY', 'MDLZ', 'CL', 'KMB', 'EL', 'DE', 'AVGO', 'QCOM', 'TXN', 'MU', 'AMAT',
  'LRCX', 'KLAC', 'ADI', 'NXPI', 'MRVL', 'ASML', 'TSM', 'SHOP', 'SQ', 'UBER', 'LYFT', 'ABNB', 'DASH', 'SNAP',
  'PINS', 'TWTR', 'ZM', 'DOCU', 'SNOW', 'PLTR', 'COIN', 'HOOD', 'RBLX', 'U', 'NOW', 'WDAY', 'INTU', 'ADSK',
  'PANW', 'CRWD', 'ZS', 'FTNT', 'OKTA', 'NET', 'DDOG', 'MDB', 'TEAM', 'SPOT', 'ROKU', 'EA', 'ATVI', 'TTWO',
  'SONY', 'NTDOY', 'BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'TM', 'HMC', 'F', 'RIVN', 'LCID', 'AXP', 'V', 'MA',
  'C', 'USB', 'PNC', 'TFC', 'SCHW', 'BLK', 'BX', 'KKR', 'CME', 'ICE', 'SPGI', 'MCO', 'MMC', 'AON', 'CB',
  'PGR', 'ALL', 'TRV', 'AIG', 'MET', 'PRU', 'AFL', 'COF', 'DFS', 'SYF', 'ALLY', 'T', 'TMUS', 'CHTR', 'DISH',
  'PARA', 'FOX', 'FOXA', 'WBD', 'NWSA', 'NYT', 'HAS', 'MAT', 'LULU', 'GPS', 'ROST', 'TJX', 'DG', 'DLTR',
  'KR', 'WBA', 'BBY', 'EBAY', 'ETSY', 'W', 'CHWY', 'YUM', 'CMG', 'DPZ', 'QSR', 'DRI', 'MAR', 'HLT', 'H',
  'BKNG', 'EXPE', 'CCL', 'RCL', 'NCLH', 'DAL', 'UAL', 'AAL', 'LUV', 'ALK', 'JBLU', 'SAVE', 'UNP', 'CSX',
  'NSC', 'WM', 'RSG', 'ETN', 'EMR', 'ITW', 'PH', 'ROK', 'JCI', 'CARR', 'OTIS', 'TT', 'LHX', 'TDG', 'HWM',
  'SLB', 'HAL', 'BKR', 'COP', 'EOG', 'OXY', 'PXD', 'DVN', 'MPC', 'VLO', 'PSX', 'KMI', 'WMB', 'OKE', 'ENB',
  'NEE', 'DUK', 'SO', 'D', 'EXC', 'AEP', 'SRE', 'XEL', 'PEG', 'ED', 'EIX', 'PCG', 'ETR', 'FE', 'PPL',
  'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'PSA', 'WELL', 'VTR', 'DLR', 'AVB', 'EQR', 'LIN', 'APD',
  'SHW', 'ECL', 'DD', 'DOW', 'NEM', 'FCX', 'NUE', 'AA', 'X', 'CLF', 'MOS', 'CF', 'IP', 'BALL', 'VMC',
  'MLM', 'ISRG', 'SYK', 'BSX', 'EW', 'ZBH', 'BDX', 'BAX', 'REGN', 'VRTX', 'BIIB', 'MRNA', 'BNTX', 'ILMN',
  'DXCM', 'IDXX', 'ZTS', 'HCA', 'CNC', 'MCK', 'ABC', 'CAH', 'CTVA', 'ADM', 'BG', 'TSN', 'HRL', 'CAG',
  'SJM', 'CPB', 'K', 'KDP', 'MNST', 'STZ', 'BF', 'TAP', 'CLX', 'CHD', 'ACN', 'IT', 'CTSH', 'DELL', 'HPQ',
  'HPE', 'WDC', 'STX', 'NTAP', 'ANET', 'JNPR', 'CDNS', 'SNPS', 'ANSS', 'ON', 'MCHP', 'SWKS', 'QRVO', 'TER',
  'GLW', 'APH', 'TEL', 'VRSN', 'AKAM', 'FIS', 'FISV', 'GPN', 'ADP', 'PAYX', 'CTAS', 'EFX', 'TRU', 'VRSK',
  'MSCI', 'NDAQ', 'CBOE', 'TROW', 'BEN', 'IVZ', 'STT', 'BK', 'NTRS', 'KEY', 'RF', 'HBAN', 'FITB', 'MTB',
  'CFG', 'ZION', 'CMA', 'SIVB', 'FRC', 'SBNY', 'CS', 'DB', 'HSBC', 'BCS', 'UBS', 'ING', 'SAN', 'BBVA',
  'GME', 'AMC', 'BB', 'NOK', 'BBBY', 'KOSS', 'EXPR', 'SPCE', 'NKLA', 'PTON', 'BYND', 'TLRY', 'CGC', 'ACB',
  // ETFs and index symbols
  'SPY', 'QQQ', 'DIA', 'IWM', 'VOO', 'VTI', 'IVV', 'VEA', 'VWO', 'EFA', 'EEM', 'AGG', 'BND', 'TLT', 'GLD',
  'SLV', 'USO', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'ARKK',
  'VIX', 'SPX', 'NDX', 'DJI', 'RUT', 'TQQQ', 'SQQQ', 'SOXX', 'SMH', 'HYG', 'LQD', 'SCHD', 'VIG', 'VYM',
  // famous symbols of 2008-2014 that were gone before the symbol snapshots begin
  'LEH', 'BSC', 'FNM', 'FRE', 'ENE', 'WCOM', 'KFT', 'PALM', 'RIMM', 'NOVL', 'EK', 'TOY', 'WAMU', 'NCC',
  'HNZ', 'MOT', 'KMP', 'MER', 'WB', 'CFC', 'YHOO', 'SUNW', 'JAVA', 'AOL', 'DTV', 'GENZ', 'EMC', 'TWX',
];

export const REAL_TICKER_SET = new Set(REAL_TICKERS);

/** Every root symbol of engine/sim/us-symbols.txt (exchange-listed US securities since 2015). */
export const US_SYMBOL_SET = new Set(
  readFileSync(new URL('./us-symbols.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);

/** True when `t` is, or has been, a real US ticker: never usable for a simulated company. */
export function isRealTicker(t) {
  return REAL_TICKER_SET.has(t) || US_SYMBOL_SET.has(t);
}

// Words that are well-known company names or brands on their own; never used as a name stem.
export const REAL_NAME_WORDS = new Set(
  [
    'apple', 'amazon', 'alphabet', 'google', 'meta', 'tesla', 'nvidia', 'oracle', 'cisco', 'intel', 'micron',
    'adobe', 'salesforce', 'netflix', 'disney', 'visa', 'mastercard', 'target', 'walmart', 'costco', 'kroger',
    'delta', 'united', 'american', 'southwest', 'boeing', 'caterpillar', 'honeywell', 'raytheon', 'lockheed',
    'chevron', 'exxon', 'mobil', 'shell', 'marathon', 'valero', 'phillips', 'halliburton', 'pfizer', 'merck',
    'amgen', 'gilead', 'moderna', 'johnson', 'morgan', 'goldman', 'wells', 'citi', 'chase', 'progressive',
    'prudential', 'allstate', 'travelers', 'humana', 'cigna', 'anthem', 'aetna', 'centene', 'lumen', 'verizon',
    'comcast', 'charter', 'paramount', 'warner', 'fox', 'nike', 'starbucks', 'pepsi', 'coca', 'hershey',
    'kellogg', 'kraft', 'heinz', 'campbell', 'dow', 'dupont', 'ecolab', 'nucor', 'alcoa', 'newmont', 'freeport',
    'duke', 'dominion', 'southern', 'exelon', 'entergy', 'ameren', 'edison', 'sempra', 'prologis', 'equinix',
    'simon', 'realty', 'welltower', 'ventas', 'crown', 'palantir', 'snowflake', 'zoom', 'uber', 'lyft',
    'airbnb', 'shopify', 'spotify', 'roku', 'block', 'square', 'paypal', 'ebay', 'etsy', 'wayfair', 'peloton',
    'vertex', 'cadence', 'synopsys', 'corning', 'arista', 'cirrus', 'teradyne', 'broadcom', 'qualcomm',
    'texas', 'analog', 'marvell', 'dell', 'hp', 'ibm', 'accenture', 'deere', 'emerson', 'eaton', 'parker',
    'carrier', 'otis', 'trane', 'waste', 'republic', 'union', 'norfolk', 'fedex', 'ups', 'expedia', 'booking',
    'marriott', 'hilton', 'hyatt', 'carnival', 'royal', 'norwegian', 'chipotle', 'mcdonald', 'yum', 'domino',
    'darden', 'lowe', 'home', 'best', 'dollar', 'general', 'ford', 'rivian', 'lucid', 'stellantis', 'toyota',
    'honda', 'sony', 'nintendo', 'samsung', 'alibaba', 'tencent', 'baidu', 'atlas', 'apex', 'summit', 'pinnacle',
  ],
);
