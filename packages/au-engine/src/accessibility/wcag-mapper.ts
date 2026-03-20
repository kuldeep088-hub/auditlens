/**
 * WCAG 2.1 criterion mapper.
 * Maps internal check IDs to their corresponding WCAG success criteria,
 * conformance level, and human-readable principle name.
 */

export interface WcagMapping {
  criterion: string;
  level: 'A' | 'AA' | 'AAA';
  principle: string;
  guideline: string;
  name: string;
}

const wcagMap: Record<string, WcagMapping> = {
  // Perceivable
  'AXE-IMG-ALT': {
    criterion: '1.1.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.1 Text Alternatives',
    name: 'Non-text Content',
  },
  'AXE-INPUT-IMG-ALT': {
    criterion: '1.1.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.1 Text Alternatives',
    name: 'Non-text Content',
  },
  'AXE-COLOR-CONTRAST': {
    criterion: '1.4.3',
    level: 'AA',
    principle: 'Perceivable',
    guideline: '1.4 Distinguishable',
    name: 'Contrast (Minimum)',
  },
  'AXE-COLOR-CONTRAST-ENHANCED': {
    criterion: '1.4.6',
    level: 'AAA',
    principle: 'Perceivable',
    guideline: '1.4 Distinguishable',
    name: 'Contrast (Enhanced)',
  },
  'AXE-TABLE-HEADER': {
    criterion: '1.3.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.3 Adaptable',
    name: 'Info and Relationships',
  },

  // Operable
  'AXE-HEADING-ORDER': {
    criterion: '1.3.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.3 Adaptable',
    name: 'Info and Relationships',
  },
  'AXE-LINK-NAME': {
    criterion: '2.4.4',
    level: 'A',
    principle: 'Operable',
    guideline: '2.4 Navigable',
    name: 'Link Purpose (In Context)',
  },
  'AXE-BUTTON-NAME': {
    criterion: '4.1.2',
    level: 'A',
    principle: 'Robust',
    guideline: '4.1 Compatible',
    name: 'Name, Role, Value',
  },

  // Understandable
  'AXE-HTML-LANG': {
    criterion: '3.1.1',
    level: 'A',
    principle: 'Understandable',
    guideline: '3.1 Readable',
    name: 'Language of Page',
  },
  'AXE-VALID-LANG': {
    criterion: '3.1.2',
    level: 'AA',
    principle: 'Understandable',
    guideline: '3.1 Readable',
    name: 'Language of Parts',
  },
  'AXE-FORM-LABEL': {
    criterion: '1.3.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.3 Adaptable',
    name: 'Info and Relationships',
  },
  'AXE-LABEL': {
    criterion: '3.3.2',
    level: 'A',
    principle: 'Understandable',
    guideline: '3.3 Input Assistance',
    name: 'Labels or Instructions',
  },

  // Robust
  'AXE-ARIA-ROLES': {
    criterion: '4.1.2',
    level: 'A',
    principle: 'Robust',
    guideline: '4.1 Compatible',
    name: 'Name, Role, Value',
  },
  'AXE-ARIA-VALID-ATTR': {
    criterion: '4.1.2',
    level: 'A',
    principle: 'Robust',
    guideline: '4.1 Compatible',
    name: 'Name, Role, Value',
  },
  'AXE-DUPLICATE-ID': {
    criterion: '4.1.1',
    level: 'A',
    principle: 'Robust',
    guideline: '4.1 Compatible',
    name: 'Parsing',
  },
  'AXE-LANDMARK': {
    criterion: '1.3.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.3 Adaptable',
    name: 'Info and Relationships',
  },
  'AXE-LANDMARK-MAIN': {
    criterion: '1.3.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.3 Adaptable',
    name: 'Info and Relationships',
  },
  'AXE-LANDMARK-NAV': {
    criterion: '1.3.1',
    level: 'A',
    principle: 'Perceivable',
    guideline: '1.3 Adaptable',
    name: 'Info and Relationships',
  },
};

/**
 * Retrieve the WCAG mapping for a given check ID.
 * Returns undefined if no mapping exists.
 */
export function getWcagMapping(checkId: string): WcagMapping | undefined {
  return wcagMap[checkId];
}

/**
 * Retrieve the WCAG criterion string (e.g., "1.1.1") for a given check ID.
 * Returns null if no mapping exists.
 */
export function getWcagCriterion(checkId: string): string | null {
  return wcagMap[checkId]?.criterion ?? null;
}

/**
 * Retrieve the WCAG level (A, AA, AAA) for a given check ID.
 * Returns null if no mapping exists.
 */
export function getWcagLevel(checkId: string): string | null {
  return wcagMap[checkId]?.level ?? null;
}

/**
 * Get all registered check IDs and their mappings.
 */
export function getAllMappings(): Record<string, WcagMapping> {
  return { ...wcagMap };
}
