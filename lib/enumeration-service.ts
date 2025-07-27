import { PrismaClient } from '@/lib/generated/prisma';

const prisma = new PrismaClient();

// Cache for enumeration values to avoid repeated database calls
const enumerationCache = new Map<string, number>();
const categoryCache = new Map<string, Record<string, number>>();

/**
 * Get enumeration ID by name and category
 */
export async function getEnumerationId(name: string, category: string): Promise<number | null> {
  const cacheKey = `${category}:${name}`;

  // Check cache first
  if (enumerationCache.has(cacheKey)) {
    return enumerationCache.get(cacheKey) || null;
  }

  try {
    const enumeration = await prisma.enumeration.findFirst({
      where: {
        name: name,
        category: category,
        is_active: true,
      },
      select: {
        id: true,
      },
    });

    const id = enumeration?.id || null;

    // Cache the result
    if (id !== null) {
      enumerationCache.set(cacheKey, id);
    }

    return id;
  } catch (error) {
    console.error(`Error fetching enumeration ID for ${name} in ${category}:`, error);
    return null;
  }
}

/**
 * Get multiple enumeration IDs by category
 */
export async function getEnumerationsByCategory(category: string): Promise<Record<string, number>> {
  // Check cache first
  if (categoryCache.has(category)) {
    return categoryCache.get(category) || {};
  }

  try {
    const enumerations = await prisma.enumeration.findMany({
      where: {
        category: category,
        is_active: true,
      },
      select: {
        name: true,
        id: true,
      },
    });

    const result: Record<string, number> = {};
    enumerations.forEach(enumeration => {
      result[enumeration.name] = enumeration.id;
      // Also cache individual entries
      enumerationCache.set(`${category}:${enumeration.name}`, enumeration.id);
    });

    // Cache the category result
    categoryCache.set(category, result);

    return result;
  } catch (error) {
    console.error(`Error fetching enumerations for category ${category}:`, error);
    return {};
  }
}

/**
 * Pre-defined enumeration categories for easy access
 */
export const ENUMERATION_CATEGORIES = {
  ROLE: 'ROLE',
  ASSIGNMENT_TYPE: 'ASSIGNMENT_TYPE',
  QUESTION_TYPE: 'QUESTION_TYPE',
  SUBMISSION_STATUS: 'SUBMISSION_STATUS',
} as const;

/**
 * Common submission status IDs - loaded dynamically
 */
export class SubmissionStatus {
  private static statusIds: Record<string, number> | null = null;

  static async getIds(): Promise<Record<string, number>> {
    if (this.statusIds === null) {
      this.statusIds = await getEnumerationsByCategory(ENUMERATION_CATEGORIES.SUBMISSION_STATUS);
    }
    return this.statusIds;
  }

  static async getSubmittedId(): Promise<number | null> {
    const ids = await this.getIds();
    return ids['SUBMITTED'] || null;
  }

  static async getInProgressId(): Promise<number | null> {
    const ids = await this.getIds();
    return ids['IN PROGRESS'] || null;
  }

  static async getGradedId(): Promise<number | null> {
    const ids = await this.getIds();
    return ids['GRADED'] || null;
  }

  static async getPartiallyGradedId(): Promise<number | null> {
    const ids = await this.getIds();
    return ids['PARTIALLY GRADED'] || null;
  }
}

/**
 * Clear the enumeration cache (useful for tests or when enumerations change)
 */
export function clearEnumerationCache(): void {
  enumerationCache.clear();
  categoryCache.clear();
  SubmissionStatus['statusIds'] = null;
}
