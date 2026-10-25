"""
Contract for the Banner Builder module.
This provides a stable interface for the Integrations module to read banner data.
"""

import re
from typing import Any
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.consent_banner import ConsentBanner


TRANSLATION_DICTS = {
    "hi": {
        "we value your privacy": "हम आपकी गोपनीयता का सम्मान करते हैं",
        "we value privacy": "हम आपकी गोपनीयता का सम्मान करते हैं",
        "your privacy": "आपकी गोपनीयता",
        "consent notice": "सहमति सूचना",
        "we use cookies to improve your experience": "हम आपके अनुभव को बेहतर बनाने के लिए कुकीज़ का उपयोग करते हैं",
        "we use cookies to enhance your experience": "हम आपके अनुभव को बेहतर बनाने के लिए कुकीज़ का उपयोग करते हैं",
        "we use cookies and similar technologies to enhance your experience": "हम आपके अनुभव को बेहतर बनाने के लिए कुकीज़ और समान तकनीकों का उपयोग करते हैं",
        "accept all": "सभी स्वीकार करें",
        "accept": "स्वीकार करें",
        "reject all": "सभी अस्वीकार करें",
        "reject": "अस्वीकार करें",
        "customize": "कस्टमाइज़ करें",
        "new": "नया"
    },
    "bn": {
        "we value your privacy": "আমরা আপনার গোপনীয়তাকে মূল্য দিই",
        "we value privacy": "আমরা আপনার গোপনীয়তাকে মূল্য দিই",
        "your privacy": "আপনার গোপনীয়তা",
        "consent notice": "সম্মতি বিজ্ঞপ্তি",
        "we use cookies to improve your experience": "আপনার অভিজ্ঞতা উন্নত করতে আমরা কুকিজ ব্যবহার করি",
        "we use cookies to enhance your experience": "আপনার অভিজ্ঞতা উন্নত করতে আমরা কুকিজ ব্যবহার করি",
        "we use cookies and similar technologies to enhance your experience": "আপনার অভিজ্ঞতা উন্নত করতে আমরা কুকিজ এবং অনুরূপ প্রযুক্তি ব্যবহার করি",
        "accept all": "সব গ্রহণ করুন",
        "accept": "গ্রহণ করুন",
        "reject all": "সব প্রত্যাখ্যান করুন",
        "reject": "প্রত্যাখ্যান করুন",
        "customize": "কাস্টমাইজ করুন",
        "new": "নতুন"
    },
    "ta": {
        "we value your privacy": "உங்கள் தனியுரிமையை நாங்கள் மதிக்கிறோம்",
        "we value privacy": "உங்கள் தனியுரிமையை நாங்கள் மதிக்கிறோம்",
        "your privacy": "உங்கள் தனியுரிமை",
        "consent notice": "சம்மத அறிவிப்பு",
        "we use cookies to improve your experience": "உங்கள் அனுபவத்தை மேம்படுத்த நாங்கள் குக்கீகளைப் பயன்படுத்துகிறோம்",
        "we use cookies to enhance your experience": "உங்கள் அனுபவத்தை மேம்படுத்த நாங்கள் குக்கீகளைப் பயன்படுத்துகிறோம்",
        "we use cookies and similar technologies to enhance your experience": "உங்கள் அனுபவத்தை மேம்படுத்த குக்கீகள் மற்றும் ஒத்த தொழில்நுட்பங்களைப் பயன்படுத்துகிறோம்",
        "accept all": "அனைத்தையும் ஏற்றுக்கொள்",
        "accept": "ஏற்றுக்கொள்",
        "reject all": "அனைத்தையும் நிராகரி",
        "reject": "நிராகரி",
        "customize": "தனிப்பயனாக்கு",
        "new": "புதிய"
    },
    "te": {
        "we value your privacy": "మేము మీ గోప్యతను గౌరవిస్తాము",
        "we value privacy": "మేము మీ గోప్యతను గౌరవిస్తాము",
        "your privacy": "మీ గోప్యత",
        "consent notice": "సమ్మతి నోటీసు",
        "we use cookies to improve your experience": "మీ అనుభవాన్ని మెరుగుపరచడానికి మేము కుకీలను ఉపయోగిస్తాము",
        "we use cookies to enhance your experience": "మీ అనుభవాన్ని మెరుగుపరచడానికి మేము కుకీలను ఉపయోగిస్తాము",
        "we use cookies and similar technologies to enhance your experience": "మీ అనుభవాన్ని మెరుగుపరచడానికి మేము కుకీలు మరియు ఇలాంటి సాంకేతికతలను ఉపయోగిస్తాము",
        "accept all": "అన్నీ అంగీకరించు",
        "accept": "అంగీకరించు",
        "reject all": "అన్నీ తిరస్కరించు",
        "reject": "తిరస్కరించు",
        "customize": "అనుకూలీకరించు",
        "new": "కొత్త"
    },
    "mr": {
        "we value your privacy": "आम्ही तुमच्या गोपनीयतेचा आदर करतो",
        "we value privacy": "आम्ही तुमच्या गोपनीयतेचा आदर करतो",
        "your privacy": "तुमची गोपनीयता",
        "consent notice": "सहमती सूचना",
        "we use cookies to improve your experience": "तुमचा अनुभव सुधारण्यासाठी आम्ही कुकीज वापरतो",
        "we use cookies to enhance your experience": "तुमचा अनुभव सुधारण्यासाठी आम्ही कुकीज वापरतो",
        "we use cookies and similar technologies to enhance your experience": "तुमचा अनुभव सुधारण्यासाठी आम्ही कुकीज आणि तत्सम तंत्रज्ञान वापरतो",
        "accept all": "सर्व स्वीकारा",
        "accept": "स्वीकारा",
        "reject all": "सर्व नाकारा",
        "reject": "नाकारा",
        "customize": "सानुकूलित करा",
        "new": "नवीन"
    },
    "kn": {
        "we value your privacy": "ನಿಮ್ಮ ಗೌಪ್ಯತೆಯನ್ನು ನಾವು ಗೌರವಿಸುತ್ತೇವೆ",
        "we value privacy": "ನಿಮ್ಮ ಗೌಪ್ಯತೆಯನ್ನು ನಾವು ಗೌರವಿಸುತ್ತೇವೆ",
        "your privacy": "ನಿಮ್ಮ ಗೌಪ್ಯತೆ",
        "consent notice": "ಸಮ್ಮತಿ ಸೂಚನೆ",
        "we use cookies to improve your experience": "ನಿಮ್ಮ ಅನುಭವವನ್ನು ಸುಧಾರಿಸಲು ನಾವು ಕುಕೀಗಳನ್ನು ಬಳಸುತ್ತೇವೆ",
        "we use cookies to enhance your experience": "ನಿಮ್ಮ ಅನುಭವವನ್ನು ಸುಧಾರಿಸಲು ನಾವು ಕುಕೀಗಳನ್ನು ಬಳಸುತ್ತೇವೆ",
        "we use cookies and similar technologies to enhance your experience": "ನಿಮ್ಮ ಅನುಭವವನ್ನು ಸುಧಾರಿಸಲು ನಾವು ಕುಕೀಗಳು ಮತ್ತು ಸಮಾನ ತಂತ್ರಜ್ಞಾನಗಳನ್ನು ಬಳಸುತ್ತೇವೆ",
        "accept all": "ಎಲ್ಲವನ್ನೂ ಒಪ್ಪಿಕೊಳ್ಳಿ",
        "accept": "ಒಪ್ಪಿಕೊಳ್ಳಿ",
        "reject all": "ಎಲ್ಲವನ್ನೂ ತಿರಸ್ಕರಿಸಿ",
        "reject": "ತಿರಸ್ಕರಿಸಿ",
        "customize": "ಕಸ್ಟಮೈಸ್ ಮಾಡಿ",
        "new": "ಹೊಸ"
    },
    "gu": {
        "we value your privacy": "અમે તમારી ગોપનીયતાનું સન્માન કરીએ છીએ",
        "we value privacy": "અમે તમારી ગોપનીયતાનું સન્માન કરીએ છીએ",
        "your privacy": "તમારી ગોપનીયતા",
        "consent notice": "સંમતિ સૂચના",
        "we use cookies to improve your experience": "તમારા અનુભવને બહેતર બનાવવા માટે અમે કૂકીઝનો ઉપયોગ કરીએ છીએ",
        "we use cookies to enhance your experience": "તમારા અનુભવને બહેતર બનાવવા માટે અમે કૂકીઝનો ઉપયોગ કરીએ છીએ",
        "we use cookies and similar technologies to enhance your experience": "તમારા અનુભવને બહેતર બનાવવા માટે અમે કૂકીઝ અને સમાન તકનીકોનો ઉપયોગ કરીએ છીએ",
        "accept all": "બધા સ્વીકારો",
        "accept": "સ્વીકારો",
        "reject all": "બધા નકારો",
        "reject": "નકારો",
        "customize": "કસ્ટમાઇઝ કરો",
        "new": "નવું"
    }
}

def translate_text(text: str | None, lang_code: str) -> str:
    if not text:
        return ""
    
    clean_text = text.strip()
    lookup_key = clean_text.lower().rstrip('. ')
    if lookup_key.endswith('...'):
        lookup_key = lookup_key[:-3]
        
    lang_dict = TRANSLATION_DICTS.get(lang_code, {})
    if lookup_key in lang_dict:
        translated = lang_dict[lookup_key]
        if clean_text.endswith('...'):
            translated += '...'
        elif clean_text.endswith('.'):
            translated += '।' if lang_code == "hi" else '.'
        return translated
        
    return clean_text

def clean_and_translate(text: str | None, lang: str, fallback_base: str | None = None) -> str:
    active_text = text or fallback_base or ""
    cleaned_text = re.sub(r'^\[[^\]]+\]\s*', '', active_text)
    return translate_text(cleaned_text, lang)


class BannerConfigContract:
    @staticmethod
    def get_banner_config(db: Session, banner_id: UUID) -> dict[str, Any] | None:
        """
        Queries the database for the real banner configuration.
        """
        banner = db.query(ConsentBanner).filter(ConsentBanner.id == banner_id).first()
        if not banner:
            return None
        
        return {
            "id": str(banner.id),
            "version": banner.version,
            "name": banner.name,
            "theme": banner.theme,
            "template": banner.template,
            "display_style": banner.display_style,
            "position": banner.position,
            "heading": banner.heading,
            "body_text": banner.body_text,
            "cta_accept": banner.cta_accept,
            "cta_reject": banner.cta_reject,
            "cta_customize": banner.cta_customize,
            "cta_withdraw": banner.cta_withdraw,
            "show_withdraw_action": banner.show_withdraw_action,
            "manage_preferences_text": banner.cta_customize,
            "withdraw_text": banner.cta_withdraw if banner.show_withdraw_action else None,
            "privacy_policy_url": banner.privacy_policy_url,
            "cookie_policy_url": banner.cookie_policy_url,
            "dpo_email": banner.dpo_email,
            "custom_css": banner.custom_css,
            "show_language_switcher": banner.show_language_switcher,
            "ab_test_enabled": banner.ab_test_enabled,
            "ab_variant_theme": banner.ab_variant_theme,
            "ab_variant_display_style": banner.ab_variant_display_style,
            "ab_variant_position": banner.ab_variant_position,
            "ab_variant_template": banner.ab_variant_template,
            "ab_variant_custom_css": banner.ab_variant_custom_css,
            "ab_traffic_split": banner.ab_traffic_split,
            "ab_test_duration_days": banner.ab_test_duration_days,
            "ab_test_started_at": banner.ab_test_started_at.isoformat() if banner.ab_test_started_at else None,
            "developer_mode": banner.developer_mode,
            "consent_webhook_url": banner.consent_webhook_url,
            "consent_valid_days": banner.consent_valid_days,
        }

    @staticmethod
    def get_banner_purposes(db: Session, banner_id: UUID) -> list[dict[str, Any]]:
        # In a real app we'd fetch the actual purposes mapped to the banner.
        # For compatibility we return the standard purposes
        return [
            {"id": "necessary", "name": "Strictly Necessary", "required": True},
            {"id": "functional", "name": "Functional", "required": False},
            {"id": "analytics", "name": "Analytics", "required": False},
            {"id": "marketing", "name": "Marketing", "required": False},
            {"id": "social", "name": "Social Media", "required": False},
        ]

    @staticmethod
    def get_banner_translations(db: Session, banner_id: UUID, lang: str) -> dict[str, str]:
        banner = db.query(ConsentBanner).filter(ConsentBanner.id == banner_id).first()
        if not banner:
            return {}
        
        translations = banner.translations or {}
        lang_data = {}
        if isinstance(translations, dict):
            lang_data = translations.get(lang, {})
        elif isinstance(translations, str):
            try:
                import json
                translations = json.loads(translations)
                lang_data = translations.get(lang, {})
            except Exception:
                pass

        return {
            "title": lang_data.get("heading"),
            "description": lang_data.get("body_text"),
            "accept_text": lang_data.get("cta_accept"),
            "reject_text": lang_data.get("cta_reject"),
            "customize_text": lang_data.get("cta_customize"),
        }

    @staticmethod
    def validate_banner_exists(db: Session, banner_id: UUID) -> bool:
        """Checks if a banner actually exists."""
        banner = db.query(ConsentBanner).filter(ConsentBanner.id == banner_id).first()
        return banner is not None
