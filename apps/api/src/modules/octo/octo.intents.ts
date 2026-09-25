/**
 * Octo Intent Engine
 * Matches user questions to specific intents
 */

import type { OctoIntentMatch, OctoIntentType } from './octo.types.js';

interface IntentRule {
  intent: OctoIntentType;
  keywords: string[];
  synonyms: string[];
  minConfidence: number;
}

const INTENT_RULES: IntentRule[] = [
  // PROJECT INTENTS
  {
    intent: 'PROJECT_COUNT',
    keywords: ['many', 'projects', 'how'],
    synonyms: ['count', 'number', 'total', 'have'],
    minConfidence: 0.6,
  },
  {
    intent: 'PROJECT_LIST',
    keywords: ['show', 'projects'],
    synonyms: ['list', 'display', 'view', 'all', 'my', 'what'],
    minConfidence: 0.6,
  },
  {
    intent: 'PROJECT_DETAILS',
    keywords: ['tell', 'about', 'project', 'details'],
    synonyms: ['explain', 'describe', 'information', 'what'],
    minConfidence: 0.6,
  },
  {
    intent: 'PROJECT_DELETE_GUIDANCE',
    keywords: ['delete', 'project'],
    synonyms: ['remove', 'destroy', 'erase', 'how'],
    minConfidence: 0.6,
  },
  {
    intent: 'PROJECT_EDIT_GUIDANCE',
    keywords: ['edit', 'project'],
    synonyms: ['update', 'change', 'modify', 'how'],
    minConfidence: 0.6,
  },

  // SNAPSHOT INTENTS
  {
    intent: 'SNAPSHOT_COUNT',
    keywords: ['how', 'many', 'snapshots'],
    synonyms: ['count', 'number', 'total', 'have'],
    minConfidence: 0.6,
  },
  {
    intent: 'SNAPSHOT_COUNT_IN_PROJECT',
    keywords: ['snapshots', 'project'],
    synonyms: ['has', 'how', 'many', 'count'],
    minConfidence: 0.6,
  },
  {
    intent: 'LATEST_SNAPSHOT',
    keywords: ['latest', 'snapshot'],
    synonyms: ['newest', 'most', 'recent', 'last', 'what'],
    minConfidence: 0.6,
  },
  {
    intent: 'PROJECT_WITH_MOST_SNAPSHOTS',
    keywords: ['most', 'snapshots', 'project'],
    synonyms: ['highest', 'which'],
    minConfidence: 0.6,
  },
  {
    intent: 'SNAPSHOT_DELETE_BEHAVIOR',
    keywords: ['delete', 'snapshot'],
    synonyms: ['deletion', 'remove', 'happens', 'what', 'destroy'],
    minConfidence: 0.6,
  },
  {
    intent: 'RESTORE_GUIDANCE',
    keywords: ['restore', 'snapshot'],
    synonyms: ['how', 'recover', 'rollback', 'revert', 'go'],
    minConfidence: 0.6,
  },

  // BLUEPRINT INTENTS
  {
    intent: 'WHAT_IS_BLUEPRINT',
    keywords: ['blueprint', 'what'],
    synonyms: ['is', 'explain', 'define'],
    minConfidence: 0.65,
  },
  {
    intent: 'BLUEPRINT_ARCHITECTURE',
    keywords: ['blueprint', 'architecture'],
    synonyms: ['explain', 'framework', 'technology', 'stack', 'tech'],
    minConfidence: 0.6,
  },
  {
    intent: 'BLUEPRINT_METADATA',
    keywords: ['blueprint', 'info'],
    synonyms: ['details', 'metadata', 'project', 'information', 'specs'],
    minConfidence: 0.6,
  },

  // STRUCTURE INTENTS
  {
    intent: 'PROJECT_STRUCTURE',
    keywords: ['structure', 'project'],
    synonyms: ['folders', 'directory', 'files', 'how', 'layout', 'tree'],
    minConfidence: 0.6,
  },
  {
    intent: 'FRAMEWORK_DETECTION',
    keywords: ['framework', 'technology'],
    synonyms: ['stack', 'what', 'uses', 'built', 'tech', 'platform'],
    minConfidence: 0.6,
  },

  // OCTOPUS CONCEPT INTENTS
  {
    intent: 'WHAT_IS_OCTOPUS',
    keywords: ['octopus', 'what'],
    synonyms: ['is', 'explain', 'help', 'guide'],
    minConfidence: 0.65,
  },
  {
    intent: 'WHAT_IS_SNAPSHOT',
    keywords: ['snapshot', 'what'],
    synonyms: ['is', 'explain', 'define'],
    minConfidence: 0.65,
  },
  {
    intent: 'WHAT_IS_BLUEPRINT',
    keywords: ['blueprint', 'what'],
    synonyms: ['is', 'explain', 'define'],
    minConfidence: 0.65,
  },
  {
    intent: 'WHAT_IS_SECRET_VAULT',
    keywords: ['secret', 'vault', 'what'],
    synonyms: ['is', 'explain', 'define'],
    minConfidence: 0.65,
  },
  {
    intent: 'WHAT_IS_INSTANT_REBIRTH',
    keywords: ['instant', 'rebirth', 'what'],
    synonyms: ['is', 'explain', 'define'],
    minConfidence: 0.65,
  },
  {
    intent: 'WHAT_IS_PROJECT_COLOR',
    keywords: ['project', 'color', 'what'],
    synonyms: ['is', 'explain', 'define'],
    minConfidence: 0.65,
  },

  // NAVIGATION INTENTS
  {
    intent: 'NAVIGATE_TO_SNAPSHOTS',
    keywords: ['where', 'find', 'snapshots'],
    synonyms: ['location', 'navigate', 'go', 'how', 'see'],
    minConfidence: 0.6,
  },
  {
    intent: 'NAVIGATE_TO_BLUEPRINT',
    keywords: ['where', 'blueprint'],
    synonyms: ['find', 'see', 'location', 'navigate'],
    minConfidence: 0.6,
  },
  {
    intent: 'NAVIGATE_TO_SECRETS',
    keywords: ['where', 'secrets'],
    synonyms: ['secret', 'vault', 'find', 'manage', 'location'],
    minConfidence: 0.6,
  },
  {
    intent: 'WHERE_CAN_I_EDIT_PROJECT',
    keywords: ['edit', 'project'],
    synonyms: ['where', 'how', 'can', 'i', 'modify', 'update'],
    minConfidence: 0.6,
  },
];

/**
 * Normalize text for matching
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
}

/**
 * Calculate confidence based on keyword matching
 */
function calculateConfidence(normalizedQuestion: string, rule: IntentRule): number {
  const questionWords = normalizedQuestion.split(/\s+/).filter((w) => w.length > 0);

  // Check if any primary keywords match
  const primaryKeywordMatches = rule.keywords.filter((k) => questionWords.includes(k)).length;
  if (primaryKeywordMatches === 0) {
    return 0; // No primary keywords match, confidence is 0
  }

  // Calculate based on matched primary keywords
  const primaryKeywordScore = primaryKeywordMatches / rule.keywords.length;

  // Add bonus for synonym matches
  const synonymMatches = rule.synonyms.filter((s) => questionWords.includes(s)).length;
  const synonymScore = (synonymMatches / Math.max(rule.synonyms.length, 1)) * 0.3; // Bonus up to 30%

  return Math.min(1, primaryKeywordScore + synonymScore);
}

/**
 * Match question to intent
 */
export function matchIntent(question: string): OctoIntentMatch {
  const normalized = normalizeText(question);

  let bestMatch: OctoIntentMatch = {
    intent: 'UNKNOWN',
    confidence: 0,
  };

  for (const rule of INTENT_RULES) {
    const confidence = calculateConfidence(normalized, rule);

    if (confidence > bestMatch.confidence && confidence >= rule.minConfidence) {
      bestMatch = {
        intent: rule.intent,
        confidence,
      };
    }
  }

  return bestMatch;
}

/**
 * Extract project name from question (if any)
 */
export function extractProjectName(question: string): string | undefined {
  // Look for patterns like "project X", "project 'X'", "project \"X\"", "my X", etc.
  const patterns = [
    /(?:project|repo|repository)\s+(?:named\s+)?['"]*([a-zA-Z0-9_-]+)['"]*(?:\s|$|\.|\?)/i,
    /my\s+(?:project\s+)?['"]*([a-zA-Z0-9_-]+)['"]*(?:\s|$|\.|\?)/i,
    /(?:tell|show|explain)\s+(?:about\s+)?(?:my\s+)?(?:project\s+)?['"]*([a-zA-Z0-9_-]+)['"]*(?:\s|$|\.|\?)/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract project reference from question by looking at the page context
 */
export function getContextualProjectId(
  question: string,
  currentProjectId: string | undefined,
): string | undefined {
  // If question contains a specific project reference, use that
  const projectName = extractProjectName(question);
  if (projectName) {
    // This will be matched later by the service against actual projects
    return undefined; // Signal that we need to search by name
  }

  // If user refers to current context, use the current project
  if (
    currentProjectId &&
    (question.toLowerCase().includes('it') ||
      question.toLowerCase().includes('this') ||
      question.toLowerCase().includes('this project') ||
      question.toLowerCase().includes('my project') ||
      question.toLowerCase().includes('the project'))
  ) {
    return currentProjectId;
  }

  return undefined;
}
