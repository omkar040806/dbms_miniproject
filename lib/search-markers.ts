// Tokens that PostgreSQL ts_headline puts around matched words.
// Kept in their own file so browser code can import them without pulling in the database driver.
export const HIGHLIGHT_START = "[[[";
export const HIGHLIGHT_STOP = "]]]";
