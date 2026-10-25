# Vajra DPDPA Notice Delivery Setup Whitepaper

## 1. Executive Summary

Under the Digital Personal Data Protection Act (DPDPA), 2023, organizations are legally mandated to deliver clear, granular, and multi-lingual privacy notices to data principals when collecting personal data. The **Vajra Notice Delivery & Orchestration** module provides a secure, reliable, and compliant infrastructure to automatically dispatch these notices across digital and physical channels, track delivery statuses, and store cryptographic evidence of notice receipt in the Vajra compliance proof vault.

This document serves as an operational guide for DPOs, CISOs, and IT administrators to configure notice delivery adapters, set up verified external accounts, and establish secure API connections.

---

## 2. Security & Encryption of Credentials

To protect sensitive keys, tokens, and passwords, Vajra employs a multi-tiered security model:
1. **Encryption-at-Rest**: All configuration keys and secret values entered into the Vajra Notice Delivery console are symmetrically encrypted before being committed to the database.
2. **AES-128-CBC + HMAC (Fernet)**: Vajra uses standard, secure Fernet encryption. The cryptographic key is derived deterministically from the platform's root `SECRET_KEY` (or specifically configured `DATA_SOURCE_ENCRYPTION_KEY` in production).
3. **Decryption-on-Use**: Decryption only occurs in-memory at the time of API dispatch or connection testing. Secrets are never stored in plaintext log files or shared with unauthenticated clients.

---

## 3. Step-by-Step Provider Configuration

### 3.1. Email Channel (Amazon SES, SMTP, or Firebase)

#### Option A: Amazon SES (Recommended for scale)
Amazon Simple Email Service (SES) provides a high-reputation, cost-effective domain mailing service.
* **Credentials Required**:
  - `aws_access_key_id`: The IAM access key of a user with SES sending permissions.
  - `aws_secret_access_key`: The IAM secret key.
  - `aws_region`: The AWS region where SES is configured (e.g., `ap-south-1`).
  - `sender_email`: A verified email identity or domain configured in your SES console.
* **AWS Setup Steps**:
  1. Open the AWS Management Console and navigate to **Amazon SES**.
  2. Under **Verified Identities**, verify your domain name or specific email address by creating the requested DNS records (DKIM/SPF).
  3. Ensure your AWS SES account is moved out of the SES sandbox to permit sending to unverified recipients.
  4. Create an IAM user in AWS IAM with the `AmazonSESFullAccess` policy and download the Access Key ID and Secret Access Key.

#### Option B: SMTP (SendGrid, Resend, or Custom SMTP server)
A generic fallback SMTP connection for organizations using third-party email delivery services.
* **Credentials Required**:
  - `smtp_host`: The SMTP relay server (e.g., `smtp.sendgrid.net`).
  - `smtp_port`: Port for secure dispatch (typically `587` or `465`).
  - `smtp_user`: Auth username or API key token.
  - `smtp_password`: Password or secret key.
  - `smtp_use_tls`: Boolean checkbox to encrypt connection using TLS.
  - `sender_email`: Your registered verified sending email address.

#### Option C: Firebase Email
Routes transactional emails through your Firebase Firestore database instance via the Trigger Email extension.
* **Credentials Required**:
  - `firebase_project_id`: Your Firebase project ID (e.g., `vajra-compliance`).
  - `firebase_api_key`: The Firebase Web API Key of your project.
* **Firebase Setup Steps**:
  1. Go to the Firebase Console, select your project, and navigate to **Extensions**.
  2. Install the **Trigger Email from Firestore** extension and configure the SMTP/delivery service.
  3. The adapter will write documents to the `mail` collection containing the recipient email address, subject, and message html.

---

### 3.2. SMS Channel (Twilio, MSG91, or Firebase)

#### Option A: Twilio
Ideal for international notifications and developers.
* **Credentials Required**:
  - `twilio_account_sid`: Found on your Twilio console homepage.
  - `twilio_auth_token`: Found on your Twilio console homepage.
  - `twilio_from_number`: A purchased Twilio phone number or registered Sender ID.
* **Setup Steps**:
  1. Register for a Twilio Console account.
  2. Purchase a phone number configured with SMS capabilities.
  3. Navigate to **Phone Numbers** -> **Active Numbers** to copy the number.

#### Option B: MSG91 (Mandatory for Indian DLT Compliance)
Under TRAI regulations, notices sent via SMS to Indian citizens must be routed through a Distributed Ledger Technology (DLT) registered gateway.
* **Credentials Required**:
  - `msg91_authkey`: The API authorization key from your MSG91 dashboard.
  - `msg91_sender_id`: The approved 6-character alphabetic header registered on DLT.
  - `msg91_dlt_template_id`: The specific approved content template identifier.
* **DLT & MSG91 Steps**:
  1. Register your organization on an Indian DLT portal (e.g., Vilpower, Jio, BSNL).
  2. Register your transactional/service implicit headers (Sender IDs).
  3. Seed your DPDPA privacy notice template, including variables (e.g., `{#var#}`), and submit for TRAI approval.
  4. Obtain the MSG91 Authkey from MSG91 -> API credentials and input the template details.

#### Option C: Firebase SMS
Routes transactional notices via SMS events written to your Firebase Firestore database.
* **Credentials Required**:
  - `firebase_project_id`: Your Firebase project ID (e.g., `vajra-compliance`).
  - `firebase_api_key`: The Firebase Web API Key of your project.
* **Firebase Setup Steps**:
  1. Go to the Firebase Console, select your project, and navigate to **Extensions** or Cloud Functions.
  2. The SMS delivery adapter writes documents to the `sms` collection containing the target phone number and message body.

---

### 3.3. WhatsApp Channel (Meta WhatsApp Business API)

Enables rich media templates delivered directly to customers' messaging apps.
* **Credentials Required**:
  - `whatsapp_access_token`: A permanent System User Access Token generated via Facebook Business Manager.
  - `whatsapp_phone_number_id`: The ID of your registered WhatsApp business phone.
  - `whatsapp_business_account_id`: The Meta Business Manager account ID.
* **Meta Setup Steps**:
  1. Access the Meta Developers Portal and create a new **Business App**.
  2. Link your WhatsApp Business Account.
  3. Under WhatsApp Settings -> **Templates**, create templates (e.g., `privacy_notice_update`, `consent_renewal`) and select appropriate languages. Wait for Meta approval.
  4. Generate a permanent System User Token in Meta Business Settings with `whatsapp_business_messaging` permissions.

---

### 3.4. Physical Mail Channel (Shiprocket)

Used for legally required physical fallbacks under the DPDPA for recipients without internet access or who have requested physical notifications.
* **Credentials Required**:
  - `shiprocket_email`: The email address of your Shiprocket account.
  - `shiprocket_password`: Your account password.
  - `pickup_address`: The warehouse pickup identifier registered in Shiprocket.
  - `pickup_city`, `pickup_state`, `pickup_pincode`: Valid locations matching your registered pickup address.
* **Shiprocket Setup Steps**:
  1. Create an account on the **Shiprocket** shipping platform.
  2. Navigate to Settings -> **Pickup Address** and add your dispatch warehouse. Verify the address coordinates and pincode.
  3. Set up billing/recharging settings on Shiprocket to support automated order generation.

---

## 4. Connection Testing & Validation

Once credentials have been registered in the Vajra console, always test the channel before launching notice campaigns.
1. Go to the **Notice Delivery Channels** tab.
2. Under **Configured Provider Adapters**, locate your registered provider.
3. Click the **Test Connection** button.
4. The system will dispatch a secure, isolated test notification to a test recipient identity.
5. Review the test status card:
   - **Green Checkmark**: Credentials validated, response code received successfully.
   - **Red Cross**: API returned an error (e.g., authorization token invalid, DLT template not found). Read the error message carefully to adjust settings.

---

## 5. Webhook Status Callbacks

To receive real-time delivery statuses (such as Bounces, Delivery Confirmations, or Opened Events), you must configure callback URLs on your external provider consoles:
* **Amazon SES**: Map SNS topic notifications for bounces and deliveries to:
  `https://your-domain.com/api/v1/notice-delivery/webhooks/ses`
* **Twilio**: Set the Message Status Callback URL on your Twilio active phone number to:
  `https://your-domain.com/api/v1/notice-delivery/webhooks/twilio`
* **Shiprocket**: Configure tracking webhook push settings on Shiprocket console pointing to:
  `https://your-domain.com/api/v1/notice-delivery/webhooks/shiprocket`
