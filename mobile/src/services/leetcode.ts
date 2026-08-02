/**
 * leetcode.ts
 * 
 * Fetches user statistics and recent submissions directly from LeetCode's public GraphQL API.
 * This is called from the client side without CORS issues in React Native.
 */

const LEETCODE_API = 'https://leetcode.com/graphql';

export interface LeetCodeStats {
  username: string;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
}

export interface LeetCodeSubmission {
  title: string;
  titleSlug: string;
  timestamp: string; // Unix string
  statusDisplay: string;
  lang: string;
}

/**
 * Fetches total solved counts (E/M/H).
 */
export async function fetchLeetCodeStats(username: string): Promise<LeetCodeStats | null> {
  const query = `
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        submitStats: submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(LEETCODE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { username } }),
    });

    const json = await res.json();
    const user = json?.data?.matchedUser;
    
    if (!user) return null;

    const stats = user.submitStats?.acSubmissionNum || [];
    const getCount = (diff: string) => stats.find((s: any) => s.difficulty === diff)?.count || 0;

    return {
      username: user.username,
      totalSolved: getCount('All'),
      easySolved: getCount('Easy'),
      mediumSolved: getCount('Medium'),
      hardSolved: getCount('Hard'),
    };
  } catch (error) {
    console.error('Error fetching LeetCode stats:', error);
    return null;
  }
}

/**
 * Fetches the 15 most recent accepted submissions.
 */
export async function fetchRecentSubmissions(username: string, limit: number = 15): Promise<LeetCodeSubmission[]> {
  const query = `
    query getRecentSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
        statusDisplay
        lang
      }
    }
  `;

  try {
    const res = await fetch(LEETCODE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { username, limit } }),
    });

    const json = await res.json();
    return json?.data?.recentAcSubmissionList || [];
  } catch (error) {
    console.error('Error fetching recent LC submissions:', error);
    return [];
  }
}
