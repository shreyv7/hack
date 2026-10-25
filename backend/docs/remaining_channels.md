# Remaining Integration Guide - Notice Delivery Providers

This document outlines the manual setup procedures, credentials, environment variables, and checklists required to transition from the integrated provider sandbox/mocks to actual production integrations.

---

## 1. Email Channel Setup

### Amazon SES (Simple Email Service)
- **Why Required**: Legally compliant mass notice distribution via high-reputation domains.
- **Environment Variables**:
  ```bash
  AWS_ACCESS_KEY_ID=your_aws_access_key
  AWS_SECRET_ACCESS_KEY=your_aws_secret_key
  AWS_REGION=ap-south-1
  SES_SENDER_EMAIL=privacy@yourdomain.com
  ```
- **Configuration Steps**:
  1. Navigate to the AWS Console → Amazon SES.
  2. Under **Verified Identities**, add your sender domain and verify the DNS records (DKIM and SPF).
  3. Request production access (to move out of the SES Sandbox).
  4. Create an IAM user with `AmazonSESFullAccess` permissions and assign keys to the env variables.

### SMTP / SendGrid / Resend
- **Environment Variables**:
  ```bash
  SMTP_HOST=smtp.sendgrid.net
  SMTP_PORT=587
  SMTP_USER=apikey
  SMTP_PASSWORD=your_sendgrid_api_key
  SMTP_USE_TLS=True
  ```

---

## 2. SMS Channel Setup

### Twilio
- **Why Required**: SMS delivery of consent updates and critical security/breach notices.
- **Environment Variables**:
  ```bash
  TWILIO_ACCOUNT_SID=your_account_sid
  TWILIO_AUTH_TOKEN=your_auth_token
  TWILIO_FROM_NUMBER=+1234567890
  ```
- **Configuration Steps**:
  1. Create a Twilio developer console account.
  2. Purchase a phone number or register an alphanumeric Sender ID (for Indian regulations).
  3. Configure Webhooks in Twilio Console to relay status callbacks to `/api/v1/notice-delivery/webhooks/twilio`.

### MSG91 / Gupshup
- **Configuration Steps**:
  1. Obtain DLT (Distributed Ledger Technology) registration in India (mandatory under TRAI regulations for sending SMS notices to Indian citizens).
  2. Seed SMS templates in DLT and get approval.
  3. Retrieve MSG91 Authkey and map it to database config.

---

## 3. WhatsApp Channel Setup

### Meta WhatsApp Business API
- **Why Required**: Rich text, template-guided DPDPA notice updates directly to consumer messaging apps.
- **Environment Variables**:
  ```bash
  WHATSAPP_ACCESS_TOKEN=your_meta_system_user_token
  WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
  WHATSAPP_BUSINESS_ACCOUNT_ID=your_whatsapp_business_id
  ```
- **Configuration Steps**:
  1. Go to the Meta Developers Portal and create a Business App.
  2. Add WhatsApp integration to your business.
  3. Register your templates (e.g. `consent_notice_renewal`, `privacy_policy_update`) in Meta Business Manager and wait for approval.
  4. Link your system token with appropriate `whatsapp_business_messaging` permissions.

---

## 4. Physical Mail Channel Setup (Shiprocket Only)

### Shiprocket API
- **Why Required**: Traditional fallback delivery for legally mandatory DPDPA notifications where digital access is unavailable. Shiprocket is used as the sole physical logistics provider.
- **Credentials Required**: Shiprocket account email, password, and registered pickup location address.
- **API Endpoint**: `https://apiv2.shiprocket.in/v1/external`
- **Configuration Steps**:
  1. Register for an enterprise account on the Shiprocket Portal.
  2. Define and verify a pickup warehouse location (pickup address, city, state, pincode) in the Shiprocket settings.
  3. Input your Shiprocket login credentials in the Vajra notice delivery settings.
  4. The system will automatically authenticate, create forward adhoc envelope orders, and capture waybills (AWB) and real-time tracking webhook callbacks.

---

## 5. Production Deployment Checklist

- [ ] Verify that SPF, DKIM, and DMARC records are configured for the sending domain.
- [ ] Confirm DLT template approval has completed for Indian SMS carriers.
- [ ] Ensure Meta WhatsApp templates are approved across all required Indian languages.
- [ ] Set up environment variables on the hosting environment (e.g. ECS, Kubernetes, or VPS).
- [ ] Test the fallback webhook endpoints to ensure delivery confirmations and retry logs process correctly.
