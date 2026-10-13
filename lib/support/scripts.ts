/**
 * Offline-first emotional support copy. These are grounding and encouragement
 * prompts, not diagnosis, treatment, or a substitute for human help.
 */

export const SUPPORT_INTENTS = ['pause', 'ground', 'encourage', 'listen'] as const;
export type SupportIntent = (typeof SUPPORT_INTENTS)[number];

export const SUPPORT_INTENT_LABELS: Record<SupportIntent, string> = {
  pause: 'Help me pause',
  ground: 'Ground me',
  encourage: 'Encourage me',
  listen: 'Give me space',
};

type SupportScript = Record<SupportIntent, string>;

const SUPPORT_SCRIPTS: Record<string, SupportScript> = {
  English: {
    pause: 'You do not have to solve everything right now. Take one slow breath, and give yourself a small moment of rest.',
    ground: 'Notice one thing you can see, one thing you can feel, and one sound you can hear. You are here, in this moment.',
    encourage: 'This is difficult, and you are still here. Choose one small next step; it is enough for now.',
    listen: 'You can take your time. Your feelings are worth noticing, and you do not have to explain everything perfectly.',
  },
  Telugu: {
    pause: 'ఇప్పుడే అన్నింటినీ పరిష్కరించాల్సిన అవసరం లేదు. నెమ్మదిగా ఒక శ్వాస తీసుకుని, మీకు కొద్దిసేపు విశ్రాంతి ఇవ్వండి.',
    ground: 'మీరు చూడగలిగే ఒక విషయం, అనుభవిస్తున్న ఒక స్పర్శ, వినిపించే ఒక శబ్దాన్ని గమనించండి. మీరు ఈ క్షణంలో ఉన్నారు.',
    encourage: 'ఇది కష్టంగా ఉంది, అయినా మీరు ఇక్కడే ఉన్నారు. ఇప్పుడు చేయగలిగే ఒక చిన్న అడుగును ఎంచుకోండి; ఈ క్షణానికి అంతే సరిపోతుంది.',
    listen: 'మీ సమయం తీసుకోండి. మీ భావాలను గమనించడం విలువైనది; అన్నింటినీ సరిగ్గా వివరించాల్సిన అవసరం లేదు.',
  },
  Hindi: {
    pause: 'अभी आपको सब कुछ हल करने की ज़रूरत नहीं है। धीरे-धीरे एक साँस लें और खुद को थोड़ा आराम दें।',
    ground: 'एक ऐसी चीज़ पर ध्यान दें जिसे आप देख सकते हैं, एक एहसास जिसे आप महसूस कर सकते हैं, और एक आवाज़ जिसे आप सुन सकते हैं। आप इस पल में मौजूद हैं।',
    encourage: 'यह कठिन है, फिर भी आप यहाँ हैं। अगला एक छोटा कदम चुनें; अभी के लिए इतना काफ़ी है।',
    listen: 'अपना समय लें। आपकी भावनाओं पर ध्यान देना महत्वपूर्ण है; आपको सब कुछ पूरी तरह समझाने की ज़रूरत नहीं है।',
  },
};

export const SUPPORT_SAFETY_NOTE =
  'This is a gentle self-care tool, not medical care. If you may be in immediate danger, contact local emergency services or someone you trust.';

export function supportScriptFor(language: string, intent: SupportIntent): {
  text: string;
  language: string;
  localized: boolean;
} {
  const localized = Boolean(SUPPORT_SCRIPTS[language]);
  const scriptLanguage = localized ? language : 'English';
  return {
    text: SUPPORT_SCRIPTS[scriptLanguage][intent],
    language: scriptLanguage,
    localized,
  };
}
