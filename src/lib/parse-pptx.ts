import JSZip from 'jszip';

export interface ParsedDeck {
  slideCount: number;
  totalText: string;
  estimatedTokens: number;
  truncated: boolean;
}

// Hard cap so a 200-slide deck doesn't blow the prompt budget. We're aiming for
// ~conceptual context, not a verbatim copy of the deck.
const MAX_CHARS = 18_000;

const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const extractSlideText = (xml: string): string => {
  const matches = xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
  return Array.from(matches)
    .map(m => decodeXmlEntities(m[1]).trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export async function parsePptx(file: File): Promise<ParsedDeck> {
  const zip = await JSZip.loadAsync(file);

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      const bNum = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      return aNum - bNum;
    });

  if (slideFiles.length === 0) {
    throw new Error('No slides found. Is this a valid .pptx file?');
  }

  const slides: string[] = [];
  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName].async('string');
    const text = extractSlideText(xml);
    const idx = parseInt(fileName.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
    if (text) {
      slides.push(`Slide ${idx}: ${text}`);
    }
  }

  let totalText = slides.join('\n\n');
  let truncated = false;
  if (totalText.length > MAX_CHARS) {
    totalText = totalText.slice(0, MAX_CHARS) + '\n\n[... truncated for prompt budget ...]';
    truncated = true;
  }

  return {
    slideCount: slideFiles.length,
    totalText,
    estimatedTokens: Math.ceil(totalText.length / 4),
    truncated,
  };
}
