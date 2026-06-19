/**
 * Cleans bloated HTML content from explanations (like inline styles, scripts, spans, and classes)
 * while preserving basic formatting tags (ul, li, strong, b, i, u, p, br, sub, sup).
 */
export function cleanHtmlExplanation(htmlStr: string | null | undefined): string {
  if (!htmlStr) return '';

  // If it doesn't contain HTML tags, return as is
  if (!htmlStr.includes('<') && !htmlStr.includes('>')) {
    return htmlStr.trim();
  }

  let cleaned = htmlStr;

  // 1. Remove style and script blocks completely
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // 2. Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Remove span, div, section, header, footer tags entirely but keep their children/content
  cleaned = cleaned.replace(/<\/?(?:span|div|section|header|footer|font)(?:\s+[^>]*)?>/gi, '');

  // 4. Strip all attributes (like class, style, jsaction, data-*) from all remaining tags
  // but keep self-closing status (e.g. <br />) and tag names
  cleaned = cleaned.replace(/<([a-zA-Z1-6]+)(?:\s+[^>]*)?(\/?)>/g, (_match, tagName, isSelfClosing) => {
    const lowerTagName = tagName.toLowerCase();
    // Allow standard educational markup tags
    const allowedTags = ['ul', 'ol', 'li', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span'];
    // Wait, we just stripped span and div tags above, but in case any remain, or if they are allowed, let's keep it safe.
    if (allowedTags.includes(lowerTagName)) {
      return `<${lowerTagName}${isSelfClosing ? ' /' : ''}>`;
    }
    // For other tags, strip them but keep content
    return '';
  });

  // Strip closing tags of disallowed tags
  cleaned = cleaned.replace(/<\/([a-zA-Z1-6]+)>/g, (_match, tagName) => {
    const lowerTagName = tagName.toLowerCase();
    const allowedTags = ['ul', 'ol', 'li', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span'];
    if (allowedTags.includes(lowerTagName)) {
      return `</${lowerTagName}>`;
    }
    return '';
  });

  // 5. Clean up multiple consecutive line breaks or empty spaces
  cleaned = cleaned.replace(/\s*\n\s*/g, '\n');
  cleaned = cleaned.replace(/(\n){2,}/g, '\n');

  return cleaned.trim();
}
