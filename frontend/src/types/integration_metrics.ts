export interface CoveragePage {
  id: string;
  scan_id: string;
  url: string;
  status: string;
  issues: string[];
  snippet_detected: boolean;
  load_time: number | null;
}

export interface PageCoverageScan {
  id: string;
  property_id: string;
  status: 'in_progress' | 'completed' | 'failed';
  total_pages_found: number;
  pages_with_cmp: number;
  pages_without_cmp: number;
  coverage_percentage: number;
  pages_missing_cmp_urls: string[];
  started_at: string;
  completed_at: string | null;
  pages?: CoveragePage[];
}

export interface IntegrationAnalyticsDaily {
  id: string;
  property_id: string;
  date: string; // YYYY-MM-DD
  total_visitors: number;
  consent_given: number;
  consent_denied: number;
  consent_partial: number;
  avg_load_time_ms: number;
  config_requests: number;
}
