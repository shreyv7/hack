from sqlalchemy.orm import Session


class TranslationContract:
    @staticmethod
    def get_template_translation(db: Session, template_key: str, language: str) -> dict[str, str]:
        # Pre-seed translation dictionary for standard notifications across Indian languages
        translations = {
            "privacy_notice": {
                "English": {
                    "subject": "Important: Notice of updates to our Privacy Policy",
                    "body": "Dear {{recipient_name}},\n\nWe have updated our Privacy Policy under Section 5 of DPDPA 2023. Please review the changes detailing our updated data processing purposes."
                },
                "Hindi": {
                    "subject": "महत्वपूर्ण: हमारी गोपनीयता नीति में अपडेट की सूचना",
                    "body": "प्रिय {{recipient_name}},\n\nहमने DPDPA 2023 की धारा 5 के तहत अपनी गोपनीयता नीति को अपडेट किया है। कृपया हमारे डेटा प्रोसेसिंग उद्देश्यों को विस्तार से देखने के लिए इन बदलावों की समीक्षा करें।"
                },
                "Tamil": {
                    "subject": "முக்கியமானது: எங்களது தனியுரிமைக் கொள்கை புதுப்பிப்பு அறிவிப்பு",
                    "body": "அன்புள்ள {{recipient_name}},\n\nDPDPA 2023 பிரிவு 5 இன் கீழ் எங்களது தனியுரிமைக் கொள்கையை நாங்கள் புதுப்பித்துள்ளோம். எங்களது தரவு செயலாக்க நோக்கங்களின் மாற்றங்களைச் சரிபார்க்கவும்."
                }
            },
            "consent_renewal": {
                "English": {
                    "subject": "Action Required: Consent Renewal Request",
                    "body": "Dear {{recipient_name}},\n\nYour consent is required to continue processing your personal data. Please acknowledge to maintain active status."
                },
                "Hindi": {
                    "subject": "कार्रवाई आवश्यक: सहमति नवीनीकरण अनुरोध",
                    "body": "प्रिय {{recipient_name}},\n\nआपके व्यक्तिगत डेटा का प्रसंस्करण जारी रखने के लिए आपकी सहमति आवश्यक है। सक्रिय बने रहने के लिए कृपया सहमति दें।"
                }
            },
            "breach_notification": {
                "English": {
                    "subject": "Alert: Personal Data Breach Notification",
                    "body": "Dear {{recipient_name}},\n\nWe are notifying you under Section 8(6) of DPDPA 2023 regarding a personal data security incident. We have implemented necessary safeguards to secure your account."
                },
                "Hindi": {
                    "subject": "चेतावनी: व्यक्तिगत डेटा उल्लंघन की सूचना",
                    "body": "प्रिय {{recipient_name}},\n\nहम आपको DPDPA 2023 की धारा 8(6) के तहत एक डेटा सुरक्षा घटना के संबंध में सूचित कर रहे हैं। आपके खाते को सुरक्षित रखने के लिए हमने आवश्यक सुरक्षा कदम उठाए हैं।"
                }
            }
        }
        
        # Resolve language translation
        lang_dict = translations.get(template_key, {})
        selected = lang_dict.get(language) or lang_dict.get("English") or {
            "subject": "DPDPA Notice Disclosure",
            "body": "This is a legally required notice under the Digital Personal Data Protection Act (DPDPA) 2023. Please review."
        }
        return selected
