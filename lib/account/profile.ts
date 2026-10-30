export type AccountProfile = {
  version: 1;
  displayName: string;
  interfaceLanguage: string;
  preferredLanguage: string;
  createdAt: number;
};

export type AccountLanguage = {
  name: string;
  native: string;
  tag: string;
  dir: 'ltr' | 'rtl';
};

export const ACCOUNT_PROFILE_KEY = 'mothertongue-local-profile-v1';

export const ACCOUNT_LANGUAGES: AccountLanguage[] = [
  { name: 'English', native: 'English', tag: 'en', dir: 'ltr' },
  { name: 'Telugu', native: 'తెలుగు', tag: 'te', dir: 'ltr' },
  { name: 'Hindi', native: 'हिन्दी', tag: 'hi', dir: 'ltr' },
  { name: 'Tamil', native: 'தமிழ்', tag: 'ta', dir: 'ltr' },
  { name: 'Spanish', native: 'Español', tag: 'es', dir: 'ltr' },
  { name: 'Arabic', native: 'العربية', tag: 'ar', dir: 'rtl' },
];

export type AccountCopy = {
  title: string;
  create: string;
  save: string;
  nameLabel: string;
  namePlaceholder: string;
  interfaceLabel: string;
  preferredLabel: string;
  privacy: string;
  localBadge: string;
  saved: string;
  remove: string;
  close: string;
};

const ACCOUNT_COPY: Record<string, AccountCopy> = {
  English: {
    title: 'Create your profile',
    create: 'Create account',
    save: 'Save profile',
    nameLabel: 'Your name',
    namePlaceholder: 'What should we call you?',
    interfaceLabel: 'Account language',
    preferredLabel: 'Your translation language',
    privacy: 'This local profile stays on this device. No email or password is collected yet.',
    localBadge: 'local profile',
    saved: 'Profile saved on this device.',
    remove: 'Remove local profile',
    close: 'Close account panel',
  },
  Telugu: {
    title: 'మీ ప్రొఫైల్ సృష్టించండి',
    create: 'ఖాతా సృష్టించండి',
    save: 'ప్రొఫైల్ భద్రపరచండి',
    nameLabel: 'మీ పేరు',
    namePlaceholder: 'మిమ్మల్ని ఏమని పిలవాలి?',
    interfaceLabel: 'ఖాతా భాష',
    preferredLabel: 'మీ అనువాద భాష',
    privacy: 'ఈ స్థానిక ప్రొఫైల్ ఈ పరికరంలోనే ఉంటుంది. ఇంకా ఇమెయిల్ లేదా పాస్‌వర్డ్ సేకరించము.',
    localBadge: 'స్థానిక ప్రొఫైల్',
    saved: 'ప్రొఫైల్ ఈ పరికరంలో భద్రపరచబడింది.',
    remove: 'స్థానిక ప్రొఫైల్ తొలగించండి',
    close: 'ఖాతా ప్యానెల్ మూసివేయండి',
  },
  Hindi: {
    title: 'अपना प्रोफ़ाइल बनाएँ',
    create: 'खाता बनाएँ',
    save: 'प्रोफ़ाइल सहेजें',
    nameLabel: 'आपका नाम',
    namePlaceholder: 'आपको किस नाम से बुलाएँ?',
    interfaceLabel: 'खाते की भाषा',
    preferredLabel: 'आपकी अनुवाद भाषा',
    privacy: 'यह स्थानीय प्रोफ़ाइल इसी डिवाइस पर रहती है। अभी ईमेल या पासवर्ड नहीं लिया जाता।',
    localBadge: 'स्थानीय प्रोफ़ाइल',
    saved: 'प्रोफ़ाइल इस डिवाइस पर सहेजी गई।',
    remove: 'स्थानीय प्रोफ़ाइल हटाएँ',
    close: 'खाता पैनल बंद करें',
  },
  Tamil: {
    title: 'உங்கள் சுயவிவரத்தை உருவாக்குங்கள்',
    create: 'கணக்கை உருவாக்குங்கள்',
    save: 'சுயவிவரத்தைச் சேமிக்கவும்',
    nameLabel: 'உங்கள் பெயர்',
    namePlaceholder: 'உங்களை எப்படிக் கூப்பிட வேண்டும்?',
    interfaceLabel: 'கணக்கு மொழி',
    preferredLabel: 'உங்கள் மொழிபெயர்ப்பு மொழி',
    privacy: 'இந்த உள்ளூர் சுயவிவரம் இந்தச் சாதனத்தில் மட்டுமே இருக்கும். இப்போது மின்னஞ்சல் அல்லது கடவுச்சொல் சேகரிக்கப்படாது.',
    localBadge: 'உள்ளூர் சுயவிவரம்',
    saved: 'சுயவிவரம் இந்தச் சாதனத்தில் சேமிக்கப்பட்டது.',
    remove: 'உள்ளூர் சுயவிவரத்தை நீக்கவும்',
    close: 'கணக்கு பேனலை மூடவும்',
  },
  Spanish: {
    title: 'Crea tu perfil',
    create: 'Crear cuenta',
    save: 'Guardar perfil',
    nameLabel: 'Tu nombre',
    namePlaceholder: '¿Cómo te llamamos?',
    interfaceLabel: 'Idioma de la cuenta',
    preferredLabel: 'Tu idioma de traducción',
    privacy: 'Este perfil local permanece en este dispositivo. Todavía no se recopilan correo ni contraseña.',
    localBadge: 'perfil local',
    saved: 'Perfil guardado en este dispositivo.',
    remove: 'Eliminar perfil local',
    close: 'Cerrar panel de cuenta',
  },
  Arabic: {
    title: 'أنشئ ملفك الشخصي',
    create: 'إنشاء حساب',
    save: 'حفظ الملف الشخصي',
    nameLabel: 'اسمك',
    namePlaceholder: 'بماذا نناديك؟',
    interfaceLabel: 'لغة الحساب',
    preferredLabel: 'لغة الترجمة المفضلة',
    privacy: 'يبقى هذا الملف المحلي على هذا الجهاز. لا نجمع البريد الإلكتروني أو كلمة المرور حالياً.',
    localBadge: 'ملف محلي',
    saved: 'تم حفظ الملف على هذا الجهاز.',
    remove: 'إزالة الملف المحلي',
    close: 'إغلاق لوحة الحساب',
  },
};

export function accountLanguageInfo(language: string): AccountLanguage {
  return ACCOUNT_LANGUAGES.find((item) => item.name === language) ?? ACCOUNT_LANGUAGES[0];
}

export function accountCopy(language: string): AccountCopy {
  return ACCOUNT_COPY[language] ?? ACCOUNT_COPY.English;
}

export function createLocalProfile(
  displayName: string,
  interfaceLanguage: string,
  preferredLanguage: string,
  createdAt = Date.now()
): AccountProfile {
  return {
    version: 1,
    displayName: displayName.trim(),
    interfaceLanguage,
    preferredLanguage,
    createdAt,
  };
}
