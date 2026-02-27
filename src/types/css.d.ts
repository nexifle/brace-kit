// Type declarations for CSS imports

// Allow importing CSS files as strings (using Bun's text loader)
declare module '*.css' {
  const content: string;
  export default content;
}
