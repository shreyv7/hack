export interface StaffMetadataInput {
  branch_code?: string;
  staff_id?: string;
  merchant_id?: string;
  terminal_id?: string;
}

export interface ConsentCaptureSessionCreate {
  client_session_id: string;
  journey_key: string;
  capture_channel?: string;
  capture_mode?: 'online' | 'offline';
  session_id: string;
  consented_purposes: Record<string, boolean>;
  language: string;
  bank_customer_ref?: string;
  principal_email?: string;
  principal_phone?: string;
  identifiers?: Array<{ type: string; token: string }>;
  staff_metadata?: StaffMetadataInput;
  client_captured_at?: string;
  auto_complete?: boolean;
}

export interface ConsentCaptureSessionRead {
  id: string;
  client_session_id: string;
  status: string;
  journey_key: string;
  capture_channel: string | null;
  capture_mode: string;
  otp_required: boolean;
  masked_mobile: string | null;
  receipt_id: string | null;
  proof_vault_record_id: string | null;
  principal_id: string | null;
  otp_verified_token: string | null;
}
