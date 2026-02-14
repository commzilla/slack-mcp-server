import type Database from "better-sqlite3";

export interface StyleProfile {
  avg_message_length: number;
  emoji_frequency: number; // 0-1 scale
  uses_exclamation: boolean;
  uses_ellipsis: boolean;
  capitalization_style: "lowercase" | "normal" | "uppercase";
  greeting_patterns: string[];
  sign_off_patterns: string[];
  common_phrases: string[];
  formality_level: "casual" | "neutral" | "formal";
  typical_response_length: "short" | "medium" | "long";
  sample_messages: string[];
}

export function getStyleProfile(
  db: Database.Database,
  profileId: string
): StyleProfile | null {
  const stmt = db.prepare(`
    SELECT profile_json, sample_messages FROM style_profiles WHERE profile_id = ?
  `);

  const row = stmt.get(profileId) as
    | { profile_json: string; sample_messages: string }
    | undefined;

  if (!row) return null;

  const profile = JSON.parse(row.profile_json) as StyleProfile;
  profile.sample_messages = JSON.parse(row.sample_messages);
  return profile;
}

export function saveStyleProfile(
  db: Database.Database,
  profileId: string,
  profile: StyleProfile
): void {
  const { sample_messages, ...profileWithoutSamples } = profile;

  const stmt = db.prepare(`
    INSERT INTO style_profiles (profile_id, profile_json, sample_messages, updated_at)
    VALUES (@profile_id, @profile_json, @sample_messages, CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id) DO UPDATE SET
      profile_json = @profile_json,
      sample_messages = @sample_messages,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run({
    profile_id: profileId,
    profile_json: JSON.stringify(profileWithoutSamples),
    sample_messages: JSON.stringify(sample_messages),
  });
}

export function analyzeMessages(messages: string[]): Omit<StyleProfile, "sample_messages"> {
  if (messages.length === 0) {
    return defaultStyle();
  }

  const lengths = messages.map((m) => m.length);
  const avgLength =
    lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Emoji detection (no 'g' flag — avoids lastIndex statefulness bug with .test() in .filter())
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const messagesWithEmoji = messages.filter((m) => emojiRegex.test(m));
  const emojiFrequency = messagesWithEmoji.length / messages.length;

  // Exclamation marks
  const withExclamation = messages.filter((m) => m.includes("!"));
  const usesExclamation = withExclamation.length / messages.length > 0.2;

  // Ellipsis
  const withEllipsis = messages.filter(
    (m) => m.includes("...") || m.includes("…")
  );
  const usesEllipsis = withEllipsis.length / messages.length > 0.1;

  // Capitalization
  const startsLowercase = messages.filter(
    (m) => m.length > 0 && m[0] === m[0].toLowerCase() && m[0] !== m[0].toUpperCase()
  );
  const lowercaseRatio = startsLowercase.length / messages.length;

  let capitalizationStyle: "lowercase" | "normal" | "uppercase";
  if (lowercaseRatio > 0.7) {
    capitalizationStyle = "lowercase";
  } else if (lowercaseRatio < 0.2) {
    capitalizationStyle = "uppercase";
  } else {
    capitalizationStyle = "normal";
  }

  // Greeting patterns
  const greetingRegex =
    /^(hey|hi|hello|yo|sup|morning|afternoon|evening|howdy|hiya|what's up|whats up)/i;
  const greetings = messages
    .filter((m) => greetingRegex.test(m.trim()))
    .map((m) => {
      const match = m.trim().match(greetingRegex);
      return match ? match[0].toLowerCase() : "";
    })
    .filter(Boolean);
  const greetingPatterns = [...new Set(greetings)].slice(0, 5);

  // Sign-off patterns
  const signOffRegex =
    /(thanks|cheers|best|regards|thx|ty|thank you|lmk|let me know|talk soon|ttyl)[\s!.]*$/i;
  const signOffs = messages
    .filter((m) => signOffRegex.test(m.trim()))
    .map((m) => {
      const match = m.trim().match(signOffRegex);
      return match ? match[1].toLowerCase() : "";
    })
    .filter(Boolean);
  const signOffPatterns = [...new Set(signOffs)].slice(0, 5);

  // Common phrases (2-3 word ngrams that appear frequently)
  const commonPhrases = extractCommonPhrases(messages);

  // Formality
  const casualIndicators = [
    "lol",
    "haha",
    "yeah",
    "nah",
    "gonna",
    "wanna",
    "gotta",
    "tbh",
    "imo",
    "btw",
    "np",
    "nbd",
  ];
  const formalIndicators = [
    "please",
    "kindly",
    "would you",
    "could you",
    "appreciate",
    "regarding",
    "furthermore",
    "however",
  ];

  const lowerMessages = messages.map((m) => m.toLowerCase());
  const casualCount = lowerMessages.filter((m) =>
    casualIndicators.some((w) => m.includes(w))
  ).length;
  const formalCount = lowerMessages.filter((m) =>
    formalIndicators.some((w) => m.includes(w))
  ).length;

  let formalityLevel: "casual" | "neutral" | "formal";
  if (casualCount > formalCount * 2) {
    formalityLevel = "casual";
  } else if (formalCount > casualCount * 2) {
    formalityLevel = "formal";
  } else {
    formalityLevel = "neutral";
  }

  // Typical response length
  let typicalResponseLength: "short" | "medium" | "long";
  if (avgLength < 50) {
    typicalResponseLength = "short";
  } else if (avgLength < 200) {
    typicalResponseLength = "medium";
  } else {
    typicalResponseLength = "long";
  }

  return {
    avg_message_length: Math.round(avgLength),
    emoji_frequency: Math.round(emojiFrequency * 100) / 100,
    uses_exclamation: usesExclamation,
    uses_ellipsis: usesEllipsis,
    capitalization_style: capitalizationStyle,
    greeting_patterns: greetingPatterns,
    sign_off_patterns: signOffPatterns,
    common_phrases: commonPhrases,
    formality_level: formalityLevel,
    typical_response_length: typicalResponseLength,
  };
}

function extractCommonPhrases(messages: string[]): string[] {
  const phraseCount = new Map<string, number>();

  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1);

    // Extract 2-grams
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      phraseCount.set(phrase, (phraseCount.get(phrase) || 0) + 1);
    }

    // Extract 3-grams
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phraseCount.set(phrase, (phraseCount.get(phrase) || 0) + 1);
    }
  }

  // Filter out common stop-word phrases and return the most frequent
  const stopPhrases = new Set([
    "the",
    "is",
    "at",
    "which",
    "on",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "to",
    "for",
    "of",
    "it",
    "this",
    "that",
    "with",
  ]);

  return [...phraseCount.entries()]
    .filter(([phrase, count]) => {
      if (count < 3) return false;
      const words = phrase.split(" ");
      // Skip if all words are stop words
      return !words.every((w) => stopPhrases.has(w));
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

function defaultStyle(): Omit<StyleProfile, "sample_messages"> {
  return {
    avg_message_length: 100,
    emoji_frequency: 0,
    uses_exclamation: false,
    uses_ellipsis: false,
    capitalization_style: "normal",
    greeting_patterns: [],
    sign_off_patterns: [],
    common_phrases: [],
    formality_level: "neutral",
    typical_response_length: "medium",
  };
}
