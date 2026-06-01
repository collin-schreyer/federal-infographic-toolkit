import JSZip from 'jszip';

export interface ParsedImage {
  dataUrl: string;
  sizeBytes: number;
  name: string;
}

export interface ParsedSlide {
  index: number;            // 1-based slide number as it appears in PowerPoint
  text: string;             // body text extracted from <a:t> nodes
  notes: string;            // speaker notes if present
  images: ParsedImage[];    // images that appear on THIS slide, sorted largest-first
  thumbnailDataUrl: string | null; // largest image on the slide, or null if none
  estimatedTokens: number;  // rough token count of text + notes (chars / 4)
}

export interface ParsedDeck {
  slides: ParsedSlide[];
  totalText: string;        // concatenation of all slide texts (kept for fallback "use whole deck" callers)
  totalImages: number;      // total images across all slides
  totalTokens: number;
}

// Single deck-wide cap; per-slide content is already small.
const MAX_TOTAL_CHARS = 200_000;
// Skip files smaller than this (icons, bullets, decorative chrome).
const MIN_IMAGE_BYTES = 6_000;
// Per-slide image cap to keep state size reasonable.
const MAX_IMAGES_PER_SLIDE = 8;

const VISION_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
};

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
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    throw new Error(`Could not read this file as a PPTX. JSZip error: ${(e as Error).message}`);
  }

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      const bNum = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      return aNum - bNum;
    });

  console.log(`[parse-pptx] Found ${slideFiles.length} slide files`);

  if (slideFiles.length === 0) {
    throw new Error('No slides found. Is this a valid .pptx file? (Try Save As → PowerPoint .pptx if it came from another tool.)');
  }

  // Pre-load all media files once and cache by media filename. We'll match
  // against this from each slide's .rels later.
  const mediaCache = new Map<string, ParsedImage>(); // key = filename in ppt/media/
  for (const mediaPath of Object.keys(zip.files)) {
    if (!/^ppt\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(mediaPath)) continue;
    const mediaName = mediaPath.replace('ppt/media/', '');
    const ext = mediaName.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() || '';
    const mime = VISION_MIME_BY_EXT[ext];
    if (!mime) continue;
    try {
      const bytes = await zip.files[mediaPath].async('uint8array');
      if (bytes.length < MIN_IMAGE_BYTES) continue;
      mediaCache.set(mediaName, {
        dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
        sizeBytes: bytes.length,
        name: mediaName,
      });
    } catch (e) {
      console.warn(`[parse-pptx] failed to read ${mediaPath}:`, e);
    }
  }

  const slides: ParsedSlide[] = [];

  for (const slideFile of slideFiles) {
    const idx = parseInt(slideFile.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
    const slideXml = await zip.files[slideFile].async('string');
    const text = extractSlideText(slideXml);

    // Speaker notes if present
    const notesFile = `ppt/notesSlides/notesSlide${idx}.xml`;
    let notes = '';
    if (zip.files[notesFile]) {
      const notesXml = await zip.files[notesFile].async('string');
      notes = extractSlideText(notesXml);
    }

    // Resolve images on THIS slide via its .rels file. The rels file maps
    // relationship IDs (rIdN) to a Target path like "../media/imageK.png".
    // We extract every media reference; that's the set of images present on
    // this specific slide.
    const relsFile = `ppt/slides/_rels/slide${idx}.xml.rels`;
    const slideImageNames = new Set<string>();
    if (zip.files[relsFile]) {
      const relsXml = await zip.files[relsFile].async('string');
      const matches = relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g);
      for (const m of matches) slideImageNames.add(m[1]);
    }

    const slideImages: ParsedImage[] = [];
    for (const name of slideImageNames) {
      const cached = mediaCache.get(name);
      if (cached) slideImages.push(cached);
    }
    slideImages.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const cappedImages = slideImages.slice(0, MAX_IMAGES_PER_SLIDE);
    const thumbnailDataUrl = cappedImages[0]?.dataUrl ?? null;

    const slideTokens = Math.ceil((text.length + notes.length) / 4);
    slides.push({
      index: idx,
      text,
      notes,
      images: cappedImages,
      thumbnailDataUrl,
      estimatedTokens: slideTokens,
    });
  }

  // Stitch together the deck-wide text fallback (used when no specific slide
  // is selected, or as a metadata measure).
  let totalText = slides
    .map(s => {
      const body = s.text.trim();
      const notes = s.notes.trim();
      if (!body && !notes) return '';
      const parts: string[] = [`Slide ${s.index}: ${body}`];
      if (notes) parts.push(`(notes: ${notes})`);
      return parts.join(' ');
    })
    .filter(Boolean)
    .join('\n\n');

  if (totalText.length > MAX_TOTAL_CHARS) {
    totalText = totalText.slice(0, MAX_TOTAL_CHARS) + '\n\n[... truncated for prompt budget ...]';
  }

  const totalImages = slides.reduce((sum, s) => sum + s.images.length, 0);
  const totalTokens = Math.ceil(totalText.length / 4);

  // If we have zero usable content anywhere, treat as a hard error.
  if (!totalText.trim() && totalImages === 0) {
    throw new Error(`Found ${slideFiles.length} slide${slideFiles.length === 1 ? '' : 's'} but could not extract any text or substantive images. Try the "Paste Text" tab instead.`);
  }

  console.log(`[parse-pptx] Parsed ${slides.length} slide(s) · ${totalImages} image(s) total · ${totalTokens} tokens`);

  return { slides, totalText, totalImages, totalTokens };
}
