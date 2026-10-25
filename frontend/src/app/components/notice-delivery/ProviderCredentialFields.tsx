import type { ReactElement } from 'react';

export interface NewProviderForm {
  channel: string;
  provider_name: string;
  is_active: boolean;
  config: Record<string, string>;
}

interface ProviderCredentialFieldsProps {
  provider: NewProviderForm;
  onChange: (next: NewProviderForm) => void;
}

const inputClass =
  'w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none';
const labelClass = 'block text-[9px] uppercase font-bold text-[var(--text-secondary)] mb-1';

export function ProviderCredentialFields({
  provider,
  onChange,
}: ProviderCredentialFieldsProps): ReactElement | null {
  const { channel, provider_name } = provider;

  const patchConfig = (key: string, value: string) => {
    onChange({
      ...provider,
      config: { ...provider.config, [key]: value },
    });
  };

  if (channel === 'email') {
    if (provider_name === 'Amazon SES') {
      return (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>AWS Access Key ID</label>
            <input
              type="text"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.aws_access_key_id || ''}
              onChange={(e) => patchConfig('aws_access_key_id', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>AWS Secret Access Key</label>
            <input
              type="password"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.aws_secret_access_key || ''}
              onChange={(e) => patchConfig('aws_secret_access_key', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>AWS Region</label>
            <input
              type="text"
              required
              placeholder="e.g. ap-south-1"
              className={`${inputClass} font-mono`}
              value={provider.config.aws_region || ''}
              onChange={(e) => patchConfig('aws_region', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Sender Verified Email</label>
            <input
              type="email"
              required
              placeholder="privacy@yourdomain.com"
              className={inputClass}
              value={provider.config.sender_email || ''}
              onChange={(e) => patchConfig('sender_email', e.target.value)}
            />
          </div>
        </div>
      );
    }
    if (provider_name === 'SMTP') {
      return (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>SMTP Host</label>
            <input
              type="text"
              required
              placeholder="smtp.sendgrid.net"
              className={inputClass}
              value={provider.config.smtp_host || ''}
              onChange={(e) => patchConfig('smtp_host', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>SMTP Port</label>
            <input
              type="number"
              required
              placeholder="587"
              className={inputClass}
              value={provider.config.smtp_port || ''}
              onChange={(e) => patchConfig('smtp_port', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>SMTP Username</label>
            <input
              type="text"
              required
              className={inputClass}
              value={provider.config.smtp_user || ''}
              onChange={(e) => patchConfig('smtp_user', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>SMTP Password</label>
            <input
              type="password"
              required
              className={inputClass}
              value={provider.config.smtp_password || ''}
              onChange={(e) => patchConfig('smtp_password', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="smtp_use_tls"
              checked={
                provider.config.smtp_use_tls === 'true' || provider.config.smtp_use_tls === undefined
              }
              onChange={(e) => patchConfig('smtp_use_tls', e.target.checked ? 'true' : 'false')}
              className="rounded border-[var(--border-default)] bg-[var(--surface-base)]"
            />
            <label htmlFor="smtp_use_tls" className="text-xs text-[var(--text-secondary)] font-bold">
              Use TLS
            </label>
          </div>
          <div>
            <label className={labelClass}>Sender Email</label>
            <input
              type="email"
              required
              placeholder="privacy@yourdomain.com"
              className={inputClass}
              value={provider.config.sender_email || ''}
              onChange={(e) => patchConfig('sender_email', e.target.value)}
            />
          </div>
        </div>
      );
    }
    if (provider_name === 'Firebase') {
      return (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Firebase Project ID</label>
            <input
              type="text"
              required
              className={inputClass}
              value={provider.config.firebase_project_id || ''}
              onChange={(e) => patchConfig('firebase_project_id', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Firebase Web API Key</label>
            <input
              type="password"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.firebase_api_key || ''}
              onChange={(e) => patchConfig('firebase_api_key', e.target.value)}
            />
          </div>
        </div>
      );
    }
  }

  if (channel === 'sms') {
    if (provider_name === 'Twilio') {
      return (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Twilio Account SID</label>
            <input
              type="text"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.twilio_account_sid || ''}
              onChange={(e) => patchConfig('twilio_account_sid', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Twilio Auth Token</label>
            <input
              type="password"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.twilio_auth_token || ''}
              onChange={(e) => patchConfig('twilio_auth_token', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Twilio From Number</label>
            <input
              type="text"
              required
              placeholder="+1234567890"
              className={inputClass}
              value={provider.config.twilio_from_number || ''}
              onChange={(e) => patchConfig('twilio_from_number', e.target.value)}
            />
          </div>
        </div>
      );
    }
    if (provider_name === 'MSG91') {
      return (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>MSG91 Authkey</label>
            <input
              type="password"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.msg91_authkey || ''}
              onChange={(e) => patchConfig('msg91_authkey', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>MSG91 Sender ID</label>
            <input
              type="text"
              required
              placeholder="e.g. ZHSHLD"
              className={inputClass}
              value={provider.config.msg91_sender_id || ''}
              onChange={(e) => patchConfig('msg91_sender_id', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>MSG91 DLT Template ID</label>
            <input
              type="text"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.msg91_dlt_template_id || ''}
              onChange={(e) => patchConfig('msg91_dlt_template_id', e.target.value)}
            />
          </div>
        </div>
      );
    }
    if (provider_name === 'Firebase') {
      return (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Firebase Project ID</label>
            <input
              type="text"
              required
              className={inputClass}
              value={provider.config.firebase_project_id || ''}
              onChange={(e) => patchConfig('firebase_project_id', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Firebase Web API Key</label>
            <input
              type="password"
              required
              className={`${inputClass} font-mono`}
              value={provider.config.firebase_api_key || ''}
              onChange={(e) => patchConfig('firebase_api_key', e.target.value)}
            />
          </div>
        </div>
      );
    }
  }

  if (channel === 'whatsapp' && provider_name === 'Meta Business API') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Meta Access Token</label>
          <input
            type="password"
            required
            className={`${inputClass} font-mono`}
            value={provider.config.whatsapp_access_token || ''}
            onChange={(e) => patchConfig('whatsapp_access_token', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Phone Number ID</label>
          <input
            type="text"
            required
            className={`${inputClass} font-mono`}
            value={provider.config.whatsapp_phone_number_id || ''}
            onChange={(e) => patchConfig('whatsapp_phone_number_id', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>WhatsApp Business Account ID</label>
          <input
            type="text"
            required
            className={`${inputClass} font-mono`}
            value={provider.config.whatsapp_business_account_id || ''}
            onChange={(e) => patchConfig('whatsapp_business_account_id', e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (channel === 'physical' && provider_name === 'Shiprocket') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Shiprocket Account Email</label>
          <input
            type="email"
            required
            className={inputClass}
            value={provider.config.shiprocket_email || ''}
            onChange={(e) => patchConfig('shiprocket_email', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Shiprocket Password</label>
          <input
            type="password"
            required
            className={inputClass}
            value={provider.config.shiprocket_password || ''}
            onChange={(e) => patchConfig('shiprocket_password', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Pickup Location Name</label>
          <input
            type="text"
            placeholder="e.g. Primary Warehouse"
            className={inputClass}
            value={provider.config.pickup_address || ''}
            onChange={(e) => patchConfig('pickup_address', e.target.value)}
          />
        </div>
      </div>
    );
  }

  return null;
}

export const DEFAULT_NEW_PROVIDER: NewProviderForm = {
  channel: 'email',
  provider_name: 'Amazon SES',
  is_active: true,
  config: {},
};

export function defaultProviderNameForChannel(channel: string): string {
  if (channel === 'email') return 'Amazon SES';
  if (channel === 'sms') return 'Twilio';
  if (channel === 'whatsapp') return 'Meta Business API';
  if (channel === 'physical') return 'Shiprocket';
  return '';
}
