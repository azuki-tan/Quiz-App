/**
 * Cleans bloated HTML content from explanations (like inline styles, scripts, spans, and classes)
 * while preserving basic formatting tags (ul, li, strong, b, i, u, p, br, sub, sup).
 */
function fixMathBlocks(text: string): string {
  if (!text) return '';

  const isVietnameseText = (segment: string) => {
    const trimmed = segment.trim();
    if (trimmed.length < 2) return false;

    // Check if it contains at least one Vietnamese accented letter
    const hasAccent = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/i.test(trimmed);
    if (hasAccent) return true;

    // Check if it contains any common Vietnamese word
    const commonVietnamese = /\b(va|voi|thi|la|hoac|co|sau|khi|thi|cho|chon|dung|sai|thay|vao|tu|do|suy|ra|cua|loi|giai|ban|chat|meo|hack|phong|hoc|sinh|de|nham|lan)\b/i.test(trimmed);
    if (commonVietnamese) return true;

    // Split into words by spaces/punctuation
    const words = trimmed.split(/[^a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+/);
    const mathKeywords = new Set(['log', 'sin', 'cos', 'tan', 'lim', 'max', 'min', 'mod', 'ln', 'det', 'gcd', 'lcm', 'deg', 'dim', 'ker', 'var', 'cov']);

    for (const word of words) {
      if (word.length >= 3 && !mathKeywords.has(word.toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  const shouldProcessBlock = (content: string) => {
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/i.test(content)) {
      return true;
    }
    
    // Find all words and check if they are common text words or English words,
    // ignoring words preceded by a backslash
    const wordsWithIndices: { word: string; index: number }[] = [];
    const regex = /\b([a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+)\b/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      wordsWithIndices.push({ word: m[1], index: m.index });
    }
    
    const textWords = new Set(['va', 'voi', 'thi', 'la', 'hoac', 'co', 'sau', 'khi', 'thi', 'cho', 'chon', 'dung', 'sai', 'thay', 'vao', 'tu', 'do', 'suy', 'ra', 'cua', 'for', 'find', 'and', 'with', 'then', 'show', 'let', 'be', 'isomorphic', 'graph', 'matrices', 'identical', 'number', 'edges', 'same', 'vertices', 'is', 'are', 'the', 'statement', 'statements']);
    const mathKeywords = new Set(['log', 'sin', 'cos', 'tan', 'lim', 'max', 'min', 'mod', 'ln', 'det', 'gcd', 'lcm', 'deg', 'dim', 'ker', 'var', 'cov']);

    for (const item of wordsWithIndices) {
      // Check if preceded by a backslash
      const isPrecededByBackslash = item.index > 0 && content[item.index - 1] === '\\';
      if (isPrecededByBackslash) {
        continue; // skip LaTeX commands
      }
      
      const lowerWord = item.word.toLowerCase();
      if (textWords.has(lowerWord)) {
        return true;
      }
      if (item.word.length >= 4 && !mathKeywords.has(lowerWord)) {
        return true;
      }
    }
    
    return false;
  };

  // Protect display math blocks ($$...$$) first to prevent splitting them
  const displayMath: string[] = [];
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
    const placeholder = `FIXMATHBLOCKX${displayMath.length}X`;
    displayMath.push(match);
    return placeholder;
  });

  // Convert \( and \) inline math to $ for uniform processing
  processed = processed.replace(/\\\(|\\\)/g, '$');

  // Process math blocks wrapped in $...$
  processed = processed.replace(/\$([^$]+?)\$/g, (match, mathContent) => {
    if (shouldProcessBlock(mathContent)) {
      const regex = /((?:^|\s+)[a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s:,.()\-!?'"%]{2,}(?:\s+|$))/g;
      let parts: string[] = [];
      let lastIndex = 0;
      let m;
      
      regex.lastIndex = 0;
      while ((m = regex.exec(mathContent)) !== null) {
        const textPart = m[1];
        const index = m.index;
        
        // Skip LaTeX commands (words preceded by backslash)
        let isLaTeX = false;
        const firstLetterMatch = textPart.match(/[a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/);
        if (firstLetterMatch && firstLetterMatch.index !== undefined) {
          const firstLetterGlobalIndex = index + firstLetterMatch.index;
          if (firstLetterGlobalIndex > 0 && mathContent[firstLetterGlobalIndex - 1] === '\\') {
            isLaTeX = true;
          }
        }
        
        if (isLaTeX) {
          continue;
        }
        
        let adjustedPart = textPart;
        
        // 1. Avoid splitting bases of subscripts/superscripts
        let nextCharIndex = index + textPart.length;
        while (nextCharIndex < mathContent.length && /\s/.test(mathContent[nextCharIndex])) {
          nextCharIndex++;
        }
        if (nextCharIndex < mathContent.length && (mathContent[nextCharIndex] === '_' || mathContent[nextCharIndex] === '^')) {
          const lastWordMatch = adjustedPart.match(/\s+([a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+)\s*$/i);
          if (lastWordMatch) {
            adjustedPart = adjustedPart.substring(0, adjustedPart.length - lastWordMatch[0].length);
          }
        }
        
        // 2. Avoid splitting variables inside subscripts/superscripts
        let prevCharIndex = index - 1;
        while (prevCharIndex >= 0 && /\s/.test(mathContent[prevCharIndex])) {
          prevCharIndex--;
        }
        if (prevCharIndex >= 0 && (mathContent[prevCharIndex] === '_' || mathContent[prevCharIndex] === '^' || mathContent[prevCharIndex] === '{')) {
          const firstWordMatch = adjustedPart.match(/^\s*([a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+)\s+/i);
          if (firstWordMatch) {
            adjustedPart = adjustedPart.substring(firstWordMatch[0].length);
          }
        }

        if (isVietnameseText(adjustedPart)) {
          parts.push(mathContent.substring(lastIndex, index));
          parts.push(adjustedPart);
          lastIndex = index + textPart.length;
        }
      }
      parts.push(mathContent.substring(lastIndex));
      
      if (parts.length === 1) {
        return `$${mathContent}$`;
      }
      
      return parts.map((part, idx) => {
        if (idx % 2 === 0) {
          const trimmed = part.trim();
          return trimmed ? `$${trimmed}$` : '';
        } else {
          return part;
        }
      }).filter(Boolean).join(' ');
    }
    return match;
  });

  // Restore display math blocks
  for (let i = 0; i < displayMath.length; i++) {
    processed = processed.replace(`FIXMATHBLOCKX${i}X`, () => displayMath[i]);
  }

  return processed;
}

export function cleanHtmlExplanation(htmlStr: string | null | undefined): string {
  if (!htmlStr) return '';

  let cleaned = fixMathBlocks(htmlStr);

  // Extract math blocks to avoid applying plain-text replacements inside them
  const mathBlocks: string[] = [];
  // Extract display math blocks ($$...$$) first
  cleaned = cleaned.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
    const placeholder = `MATHBLOCKX${mathBlocks.length}X`;
    mathBlocks.push(match);
    return placeholder;
  });
  // Extract inline math blocks ($...$) second
  cleaned = cleaned.replace(/\$([^$]+?)\$/g, (match) => {
    const placeholder = `MATHBLOCKX${mathBlocks.length}X`;
    mathBlocks.push(match);
    return placeholder;
  });

  // 1. Process exponents and subscripts (superscripts/subscripts)
  // Handle LaTeX syntax: ^{xyz} and _{xyz}
  cleaned = cleaned.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
  cleaned = cleaned.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');

  // Handle parentheses syntax: ^(xyz) and _(xyz)
  cleaned = cleaned.replace(/\^\(([^)]+)\)/g, '<sup>$1</sup>');
  cleaned = cleaned.replace(/_\(([^)]+)\)/g, '<sub>$1</sub>');

  // Handle simple exponents/subscripts attached to characters: e.g., n^4, x_i, 2^n
  cleaned = cleaned.replace(/([a-zA-Z0-9)])\^([a-zA-Z0-9+\-*\/]+)/g, '$1<sup>$2</sup>');
  cleaned = cleaned.replace(/([a-zA-Z0-9)])_([a-zA-Z0-9+\-*\/]+)/g, '$1<sub>$2</sub>');

  // 2. Translate common math/LaTeX/Discrete Math notation to Unicode symbols
  const mathReplacements: { [key: string]: string } = {
    '\\\\times': '×',
    '\\\\div': '÷',
    '\\\\to': '→',
    '\\\\rightarrow': '→',
    '\\\\leftarrow': '←',
    '\\\\equiv': '≡',
    '\\\\approx': '≈',
    '\\\\leq': '≤',
    '\\\\geq': '≥',
    '\\\\neq': '≠',
    '\\\\pm': '±',
    '\\\\infty': '∞',
    '\\\\cdot': '·',
    '\\\\neg': '¬',
    '\\\\land': '∧',
    '\\\\lor': '∨',
    '\\\\oplus': '⊕',
    '\\\\cap': '∩',
    '\\\\cup': '∪',
    '\\\\subset': '⊂',
    '\\\\subseteq': '⊆',
    '\\\\in\\s': '∈ ',
    '\\\\notin': '∉',
    '\\\\forall': '∀',
    '\\\\exists': '∃',
    '\\\\varnothing': '∅',
    '\\\\emptyset': '∅',
    '\\\\sigma': 'σ',
    '\\\\alpha': 'α',
    '\\\\beta': 'β',
    '\\\\theta': 'θ',
    '\\\\lambda': 'λ',
    '\\\\pi': 'π',
    '\\\\delta': 'δ',
    '\\\\Delta': 'Δ',
    '\\\\sum': '∑',
    '\\\\prod': '∏',
    '\\\\int': '∫',
    '\\\\sqrt': '√',
  };

  for (const [pattern, replacement] of Object.entries(mathReplacements)) {
    cleaned = cleaned.replace(new RegExp(pattern, 'g'), replacement);
  }

  // Handle \pmod{n} -> mod n
  cleaned = cleaned.replace(/\\pmod\s*\{([^}]+)\}/g, 'mod $1');
  cleaned = cleaned.replace(/\\pmod\s+([a-zA-Z0-9]+)/g, 'mod $1');

  // Handle raw LaTeX wrappers \( and \) if they were not parsed by MathJax (fallback rendering)
  cleaned = cleaned.replace(/\\\(|\\\)/g, '');
  cleaned = cleaned.replace(/\\\[|\\\]/g, '');

  // 3. Remove style and script blocks completely
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // 4. Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 5. Remove div, section, header, footer tags entirely but keep their children/content
  cleaned = cleaned.replace(/<\/?(?:div|section|header|footer|font)(?:\s+[^>]*)?>/gi, '');

  // 6. Strip all attributes from tags except allowing necessary styling or standard structures
  // Preserve allowed tags: ul, ol, li, p, br, strong, b, em, i, u, sub, sup, table, tr, td, th, thead, tbody, span
  cleaned = cleaned.replace(/<([a-zA-Z1-6]+)(?:\s+[^>]*)?(\/?)>/g, (_match, tagName, isSelfClosing) => {
    const lowerTagName = tagName.toLowerCase();
    const allowedTags = ['ul', 'ol', 'li', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span'];
    if (allowedTags.includes(lowerTagName)) {
      return `<${lowerTagName}${isSelfClosing ? ' /' : ''}>`;
    }
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

  // 7. Clean up multiple consecutive line breaks or empty spaces
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Restore math blocks
  for (let i = 0; i < mathBlocks.length; i++) {
    cleaned = cleaned.replace(`MATHBLOCKX${i}X`, () => mathBlocks[i]);
  }

  return cleaned.trim();
}
