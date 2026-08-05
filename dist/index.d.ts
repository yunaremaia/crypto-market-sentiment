/**
 * Crypto Market Sentiment — Agent Service
 * Fear & Greed index + funding rates + market cap via free APIs.
 * Entry points: sentiment (paid), funding (paid), health (free).
 */
export declare function resetCaches(): void;
export declare function getFearGreed(fetchFn?: typeof fetch): Promise<{
    value: number;
    classification: string;
    timestamp: number;
} | null>;
export declare function getFundingRate(symbol: string, fetchFn?: typeof fetch): Promise<{
    symbol: string;
    fundingRate: number;
    markPrice: number;
    time: number;
} | null>;
export declare function getMarketMetrics(fetchFn?: typeof fetch): Promise<Record<string, any> | null>;
declare const app: any;
export default app;
