export interface PropertyVerification {
  id: string;
  property_id: string;
  snippet_detected: boolean;
  banner_rendered: boolean;
  loaded_before_trackers: boolean;
  ssl_valid: boolean;
  correct_property_id: boolean;
  all_passed: boolean;
  http_status_code: number | null;
  response_time_ms: number | null;
  detected_trackers: any[];
  errors: string[];
  check_type: 'manual' | 'scheduled';
  checked_at: string;
  checked_by: string | null;
}
