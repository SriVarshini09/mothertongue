# MotherTongue — Product Strategy

**Status:** working product, verified end-to-end.
**Date:** September 2026.
**Purpose:** where we started, what we built, the market, how we differ, and what comes next.

---

## 1. Where we started

A single painful observation: **students study in English but think in their mother tongue.**
In India the medium of instruction has shifted massively to English (Telangana ~74%
English-medium, Tamil Nadu ~58%, Delhi ~60%), yet comprehension never caught up —
Hindi-medium engineering students show a ~1.8 GPA deficit vs English-medium peers,
~35% first-year dropout in regional colleges, and ~72% report struggling with
technical vocabulary (AICTE/AISHE/IIT-Delhi studies, 2021–2023). NEP 2020 itself
mandates mother-tongue-first instruction. The gap between policy and reality is
the opportunity.

We started with one flow and refused to expand it:

**Give me something to read → translate it into my language → let me listen.**

No chatbot. No quizzes. No tutor. No study planner.

## 2. What we achieved (verified, not claimed)

- **Working app** (Next.js + TypeScript): text / live-camera / upload → extraction →
  editable review → translation across the curated 143-language catalog → expressive
  audio → history. Offline translation currently has one verified shared pack for the
  full 202-entry NLLB/FLORES catalog.
- **Translation that translates**: hardened prompt architecture — delimited source
  text, stateless calls, translate-never-answer, pronoun/role fidelity with a
  verifier (14/14 anti-answering, 24–26/26 pronoun suite; the reported
  `నీకు`→`నాకు` bug fixed and stable).
- **Live camera** (getUserMedia preview, capture, retake, cleanup) + **printed-text
  offline OCR** (Tesseract, verified: English perfect, Telugu near-perfect).
- **Two voice engines**: OpenAI TTS by default, Sarvam Bulbul voices optional.
- **Offline architecture**: engine router (Auto/Online/Offline), PWA shell,
  one downloadable NLLB pack for the 202-entry catalog (~912 MB shared base,
  checksummed),
  device TTS, zero-network Offline mode.
- **Measurement culture**: 160-case benchmark harness with blinded LLM judge
  (production composite **92.2**), 30/30 offline unit tests, headless-browser
  verification, full regression green on every change.

## 3. The market (researched September 2026)

| Player | Strength | Weakness we exploit |
|---|---|---|
| Google Translate | Free, ubiquitous | Literal translations; weak nuance; generic tool, not a study flow |
| DeepL ($2B, enterprise) | Quality reputation, camera/photo/TTS/files | Enterprise-first, paywalled features, recent Play Store complaints (offline bugs, unwanted autocorrect of input) |
| Speechify (50M+ users) | Best-in-class voices, education vertical, OCR+audio | Premium USD subscriptions; bloating into chat/assistant features; weak Indic-language depth |
| NaturalReader EDU | Schools, OCR scanner, MP3 export, offline lite voices | Dated product, quiz/chat add-ons dilute focus |
| ChatGPT/Gemini | Great translation quality | Chatbots that **answer instead of translate** — the exact failure mode students hit with homework |

Structural tailwinds: NEP 2020 three-language push, 500M+ Indian students, cheap
smartphones + expensive/variable data (offline matters), UPI micropayments work.

## 4. Problem categories we solve (ranked)

1. **Comprehension gap** — English-medium content, mother-tongue mind. Core job.
2. **Material locked in photos/PDFs** — notebook pages and textbook chapters have
   no clean path to readable/listenable form. Our camera→OCR→review flow is the
   unlock competitors bury in menus.
3. **Listening as study mode** — revision during commute/chores; dyslexia, ADHD,
   eye strain. Audio-first, not audio-as-afterthought.
4. **Low connectivity** — offline packs + PWA where DeepL users report offline bugs.
5. **Cost barrier** — our unit cost is cents per page vs $10+/month subscriptions.
6. **Trust** — students photograph personal notebooks; we retain nothing, process
   in-memory, and Offline mode makes zero external calls.
7. **Translation failures incumbents ignore** — answering homework instead of
   translating it; swapping speaker/listener (our benchmark proves the difference).

## 5. How we differ (positioning)

- **One flow, student-shaped.** Incumbents are enterprise platforms, voice
  marketplaces, or chatbots. We are "paste/photo → mother tongue → play."
- **Fidelity as a feature.** Nobody markets "translates, never answers, preserves
  who-did-what-to-whom" — we measure it publicly with our harness.
- **Indic-first, offline-first.** Telugu/Tamil/Hindi lead a 202-entry
  downloadable catalog — not checkbox languages. Translation is offline after
  the shared pack is installed; speech and OCR remain device/language-specific.
- **Honest product.** No fake offline, no invented sizes, friendly errors, privacy
  by architecture. Trust is the moat with students and parents.
- **Price.** Freemium/cents-per-page undercuts subscription TTS while our costs
  stay near-zero per user.

What we will NOT do: chatbots, tutors, quizzes, classrooms, enterprise sales.

## 6. Next steps (ordered)

1. **Real-device validation** (you, this week): phone camera flow, airplane-mode
   offline E2E with the shared multilingual pack + device voice, PWA install, Sarvam
   voice A/B (needs `SARVAM_API_KEY`). Nothing ships on claims — only on this.
2. **First users**: 10–20 Telugu/Tamil-medium students; watch them use it, record
   where they hesitate. Success = "understood a chapter without help."
3. **Close the flaky 2**: pronoun-suite stragglers (larger verified model or second
   checker) + multilingual pack field testing.
4. **Distribution**: PWA link sharing (no app-store wait), campus ambassadors,
   study-YouTuber demos in Telugu/Tamil.
5. **Monetization test**: free daily quota (e.g. 10 pages/day) + micropay packs via
   UPI; keep a genuinely free tier for students forever.
6. **Moat-building**: publish benchmark results; parent/teacher dashboard (read-only
   progress, privacy-preserving); school pilots.
