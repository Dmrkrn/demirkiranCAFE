/**
 * User Color Generator
 * ====================
 * 
 * Generates a deterministic color based on a string (e.g., username or ID).
 * The goal is to assign a unique, consistent color to each user.
 */

// Curated palette for dark theme (Vibrant but legible)
const AVATAR_COLORS = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Cyan
    '#FFA07A', // Light Salmon
    '#98FB98', // Pale Green
    '#DDA0DD', // Plum
    '#F0E68C', // Khaki
    '#87CEFA', // Light Sky Blue
    '#FF69B4', // Hot Pink
    '#CD5C5C', // Indian Red
    '#20B2AA', // Light Sea Green
    '#9370DB', // Medium Purple
    '#3CB371', // Medium Sea Green
    '#FFA500', // Orange
];

/**
 * Generates a color from a given seed string.
 * @param seed The string to hash (e.g., username)
 * @returns A hex color code
 */
export const getUserColor = (seed: string): string => {
    if (!seed) return AVATAR_COLORS[0];

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Index selection
    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
};
