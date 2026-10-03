/** Translation service contracts. */

export type TranslateRequest = {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
};

export type TranslateResponse = {
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
};
