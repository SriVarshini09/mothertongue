/**
 * Product-facing subset of the official NLLB/FLORES language inventory.
 *
 * One downloaded NLLB model can translate between every entry here. The
 * catalog is intentionally curated instead of exposing every research
 * language variant in the settings drawer; quality and tokenizer coverage
 * still vary by language and direction.
 */
export type NllbLanguage = {
  name: string;
  native: string;
  code: string;
  popular?: boolean;
};

export const NLLB_LANGUAGE_CATALOG: NllbLanguage[] = [
  // India and nearby languages
  { name: 'Telugu', native: 'తెలుగు', code: 'tel_Telu', popular: true },
  { name: 'Tamil', native: 'தமிழ்', code: 'tam_Taml', popular: true },
  { name: 'Hindi', native: 'हिन्दी', code: 'hin_Deva', popular: true },
  { name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kan_Knda', popular: true },
  { name: 'Malayalam', native: 'മലയാളം', code: 'mal_Mlym' },
  { name: 'Bengali', native: 'বাংলা', code: 'ben_Beng' },
  { name: 'Marathi', native: 'मराठी', code: 'mar_Deva' },
  { name: 'Gujarati', native: 'ગુજરાતી', code: 'guj_Gujr' },
  { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'pan_Guru' },
  { name: 'Urdu', native: 'اردو', code: 'urd_Arab' },
  { name: 'Odia', native: 'ଓଡ଼ିଆ', code: 'ory_Orya' },
  { name: 'Assamese', native: 'অসমীয়া', code: 'asm_Beng' },
  { name: 'Sanskrit', native: 'संस्कृतम्', code: 'san_Deva' },
  { name: 'Nepali', native: 'नेपाली', code: 'npi_Deva' },
  { name: 'Maithili', native: 'मैथिली', code: 'mai_Deva' },
  { name: 'Bhojpuri', native: 'भोजपुरी', code: 'bho_Deva' },
  { name: 'Kashmiri', native: 'कॉशुर', code: 'kas_Arab' },
  { name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', code: 'sat_Beng' },
  { name: 'Sinhala', native: 'සිංහල', code: 'sin_Sinh' },

  // Europe
  { name: 'English', native: 'English', code: 'eng_Latn', popular: true },
  { name: 'Spanish', native: 'Español', code: 'spa_Latn', popular: true },
  { name: 'French', native: 'Français', code: 'fra_Latn' },
  { name: 'German', native: 'Deutsch', code: 'deu_Latn' },
  { name: 'Italian', native: 'Italiano', code: 'ita_Latn' },
  { name: 'Portuguese', native: 'Português', code: 'por_Latn' },
  { name: 'Dutch', native: 'Nederlands', code: 'nld_Latn' },
  { name: 'Greek', native: 'Ελληνικά', code: 'ell_Grek' },
  { name: 'Catalan', native: 'Català', code: 'cat_Latn' },
  { name: 'Basque', native: 'Euskara', code: 'eus_Latn' },
  { name: 'Welsh', native: 'Cymraeg', code: 'cym_Latn' },
  { name: 'Irish', native: 'Gaeilge', code: 'gle_Latn' },
  { name: 'Albanian', native: 'Shqip', code: 'als_Latn' },
  { name: 'Romanian', native: 'Română', code: 'ron_Latn' },
  { name: 'Polish', native: 'Polski', code: 'pol_Latn' },
  { name: 'Czech', native: 'Čeština', code: 'ces_Latn' },
  { name: 'Slovak', native: 'Slovenčina', code: 'slk_Latn' },
  { name: 'Hungarian', native: 'Magyar', code: 'hun_Latn' },
  { name: 'Bulgarian', native: 'Български', code: 'bul_Cyrl' },
  { name: 'Serbian', native: 'Српски', code: 'srp_Cyrl' },
  { name: 'Croatian', native: 'Hrvatski', code: 'hrv_Latn' },
  { name: 'Slovenian', native: 'Slovenščina', code: 'slv_Latn' },
  { name: 'Macedonian', native: 'Македонски', code: 'mkd_Cyrl' },
  { name: 'Russian', native: 'Русский', code: 'rus_Cyrl' },
  { name: 'Ukrainian', native: 'Українська', code: 'ukr_Cyrl' },
  { name: 'Lithuanian', native: 'Lietuvių', code: 'lit_Latn' },
  { name: 'Latvian', native: 'Latviešu', code: 'lvs_Latn' },
  { name: 'Estonian', native: 'Eesti', code: 'est_Latn' },
  { name: 'Finnish', native: 'Suomi', code: 'fin_Latn' },
  { name: 'Swedish', native: 'Svenska', code: 'swe_Latn' },
  { name: 'Norwegian', native: 'Norsk', code: 'nob_Latn' },
  { name: 'Danish', native: 'Dansk', code: 'dan_Latn' },

  // Middle East and Central Asia
  { name: 'Arabic', native: 'العربية', code: 'arb_Arab', popular: true },
  { name: 'Persian', native: 'فارسی', code: 'pes_Arab' },
  { name: 'Pashto', native: 'پښتو', code: 'pbt_Arab' },
  { name: 'Kurdish (Kurmanji)', native: 'Kurdî', code: 'kmr_Latn' },
  { name: 'Kazakh', native: 'Қазақша', code: 'kaz_Cyrl' },
  { name: 'Uzbek', native: "O'zbek", code: 'uzn_Latn' },
  { name: 'Kyrgyz', native: 'Кыргызча', code: 'kir_Cyrl' },
  { name: 'Tajik', native: 'Тоҷикӣ', code: 'tgk_Cyrl' },
  { name: 'Mongolian', native: 'Монгол', code: 'khk_Cyrl' },
  { name: 'Uyghur', native: 'ئۇيغۇر', code: 'uig_Arab' },
  { name: 'Turkish', native: 'Türkçe', code: 'tur_Latn' },
  { name: 'Azerbaijani', native: 'Azərbaycan', code: 'azj_Latn' },
  { name: 'Georgian', native: 'ქართული', code: 'kat_Geor' },
  { name: 'Armenian', native: 'Հայերեն', code: 'hye_Armn' },
  { name: 'Hebrew', native: 'עברית', code: 'heb_Hebr' },

  // East and Southeast Asia
  { name: 'Chinese (Simplified)', native: '简体中文', code: 'zho_Hans', popular: true },
  { name: 'Chinese (Traditional)', native: '繁體中文', code: 'zho_Hant' },
  { name: 'Chinese (Cantonese)', native: '粵語', code: 'yue_Hant' },
  { name: 'Japanese', native: '日本語', code: 'jpn_Jpan', popular: true },
  { name: 'Korean', native: '한국어', code: 'kor_Hang' },
  { name: 'Vietnamese', native: 'Tiếng Việt', code: 'vie_Latn' },
  { name: 'Thai', native: 'ไทย', code: 'tha_Thai' },
  { name: 'Lao', native: 'ລາວ', code: 'lao_Laoo' },
  { name: 'Khmer', native: 'ខ្មែរ', code: 'khm_Khmr' },
  { name: 'Burmese', native: 'မြန်မာ', code: 'mya_Mymr' },
  { name: 'Indonesian', native: 'Bahasa Indonesia', code: 'ind_Latn' },
  { name: 'Malay', native: 'Bahasa Melayu', code: 'zsm_Latn' },
  { name: 'Tagalog', native: 'Tagalog', code: 'tgl_Latn' },
  { name: 'Cebuano', native: 'Cebuano', code: 'ceb_Latn' },
  { name: 'Javanese', native: 'Basa Jawa', code: 'jav_Latn' },
  { name: 'Sundanese', native: 'Basa Sunda', code: 'sun_Latn' },

  // Africa and the Americas
  { name: 'Amharic', native: 'አማርኛ', code: 'amh_Ethi' },
  { name: 'Swahili', native: 'Kiswahili', code: 'swh_Latn' },
  { name: 'Hausa', native: 'Hausa', code: 'hau_Latn' },
  { name: 'Yoruba', native: 'Yorùbá', code: 'yor_Latn' },
  { name: 'Igbo', native: 'Igbo', code: 'ibo_Latn' },
  { name: 'Zulu', native: 'isiZulu', code: 'zul_Latn' },
  { name: 'Xhosa', native: 'isiXhosa', code: 'xho_Latn' },
  { name: 'Shona', native: 'chiShona', code: 'sna_Latn' },
  { name: 'Afrikaans', native: 'Afrikaans', code: 'afr_Latn' },
  { name: 'Somali', native: 'Soomaali', code: 'som_Latn' },
  { name: 'Oromo', native: 'Afaan Oromoo', code: 'gaz_Latn' },
  { name: 'Akan', native: 'Twi', code: 'aka_Latn' },
  { name: 'Ewe', native: 'Eʋegbe', code: 'ewe_Latn' },
  { name: 'Wolof', native: 'Wolof', code: 'wol_Latn' },
  { name: 'Haitian Creole', native: 'Kreyòl', code: 'hat_Latn' },
  { name: 'Quechua', native: 'Runasimi', code: 'quy_Latn' },
  { name: 'Guarani', native: "Avañe'ẽ", code: 'grn_Latn' },
  { name: 'Esperanto', native: 'Esperanto', code: 'epo_Latn' },
];

export const NLLB_FLORES: Record<string, string> = {
  ...Object.fromEntries(NLLB_LANGUAGE_CATALOG.map((language) => [language.name, language.code])),
  // Backwards-compatible alias for older saved selections/history entries.
  Chinese: 'zho_Hans',
};
