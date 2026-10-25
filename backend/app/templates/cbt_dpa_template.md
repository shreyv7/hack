# DATA PROCESSING AGREEMENT & CROSS-BORDER TRANSFER CONTRACT

This Data Processing Agreement ("DPA") is entered into by and between:
1. **{{ organization_name }}** (the "Data Fiduciary")
2. **{{ destination_entity }}** (the "Offshore Data Processor")

## 1. Scope and Purpose of Transfer
The Data Fiduciary is transferring personal data of Indian Data Principals to the Offshore Data Processor in **{{ destination_country }}** (ISO: **{{ country_code }}**).
- **Purpose of processing:** {{ transfer_purpose }}
- **Legal Basis under DPDPA:** {{ legal_basis }}
- **Safeguard Mechanisms:** {{ safeguard_mechanism }}

## 2. DPDPA 2023 Section 8 Compliance Obligations
The Offshore Data Processor agrees to:
- Process the personal data only on documented instructions from the Data Fiduciary.
- Implement technical and organizational security measures to prevent unauthorized data breaches.
- Promptly notify the Data Fiduciary of any security incident or breach.
- Ensure that sub-processors are bound by equivalent data protection obligations.
- Erase personal data upon target fulfillment or termination of agreement (Section 8(7)).

{% if is_sdf %}
## 3. Significant Data Fiduciary (SDF) Enhanced Auditing Clause
As the Data Fiduciary is registered as a Significant Data Fiduciary (SDF), the Offshore Data Processor agrees to submit to periodic independent compliance audits.
- The Offshore Data Processor shall facilitate independent data audits conducted by certified Indian auditors upon request.
- The Offshore Data Processor shall cooperate with DPO investigations and supply necessary compliance documentation.
{% endif %}
