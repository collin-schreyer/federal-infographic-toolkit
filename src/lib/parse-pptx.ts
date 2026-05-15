import JSZip from 'jszip';

export interface ParsedImage {
  dataUrl: string;
  sizeBytes: number;
  name: string;
}

export interface ParsedDeck {
  slideCount: number;
  totalText: string;
  estimatedTokens: number;
  truncated: boolean;
  images: ParsedImage[];
}

// Embedded-image extraction limits.
// - Skip files smaller than this (icons, bullets, decorative logos repeated on every slide).
const MIN_IMAGE_BYTES = 6_000;
// - Cap the number we send to GPT-5 vision. Each image at detail=low costs ~85 input
//   tokens, so 10 images is ~850 tokens — cheap. More than that adds latency without
//   much marginal info.
const MAX_IMAGES = 10;

// Map file extensions to MIME types OpenAI Vision accepts. JSZip's async('blob')
// returns blobs with an empty `type`, which makes FileReader.readAsDataURL emit
// `application/octet-stream` — and OpenAI rejects anything that isn't a real image MIME.
const VISION_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  // Chunked to avoid blowing the call stack on large images.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
};

// Generous cap — GPT-5 has 400K context and we cache, so we can afford a lot.
const MAX_CHARS = 80_000;

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

// Also scan slide notes (speaker notes contain a lot of useful context).
const noteText = (xml: string): string => extractSlideText(xml);

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

  console.log(`[parse-pptx] Found ${slideFiles.length} slide files`, slideFiles.slice(0, 3));

  if (slideFiles.length === 0) {
    throw new Error('No slides found. Is this a valid .pptx file? (Try Save As → PowerPoint .pptx if it came from another tool.)');
  }

  const slides: string[] = [];
  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName].async('string');
    const text = extractSlideText(xml);
    const idx = parseInt(fileName.match(/slide(\d+)\.xml/)?.[1] || '0', 10);

    // Also grab speaker notes if present
    const notesFile = `ppt/notesSlides/notesSlide${idx}.xml`;
    let notes = '';
    if (zip.files[notesFile]) {
      const notesXml = await zip.files[notesFile].async('string');
      notes = noteText(notesXml);
    }

    const combined = [text, notes && `(notes: ${notes})`].filter(Boolean).join(' ').trim();
    if (combined) {
      slides.push(`Slide ${idx}: ${combined}`);
    }
  }

  console.log(`[parse-pptx] Extracted text from ${slides.length}/${slideFiles.length} slides`);

  let totalText = slides.join('\n\n');

  // Fallback: if slides yielded nothing, scan slide layouts. Some decks put
  // all their content in layouts and use empty slides on top.
  if (!totalText.trim()) {
    console.warn('[parse-pptx] No text in slides — scanning slideLayouts as fallback');
    const layoutFiles = Object.keys(zip.files).filter(n => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n));
    const layoutTexts: string[] = [];
    for (const f of layoutFiles) {
      const xml = await zip.files[f].async('string');
      const t = extractSlideText(xml);
      if (t) layoutTexts.push(t);
    }
    totalText = layoutTexts.join('\n\n');
  }

  // Extract embedded images (architecture diagrams, screenshots, current-state
  // drawings, etc.) so GPT-5 vision can analyze the actual visuals on the slides.
  // PPTX dedups images at the file level: a logo repeated on every slide is one
  // file in ppt/media/, so unique-file iteration handles dedup for free.
  const imageFileNames = Object.keys(zip.files)
    .filter(name => /^ppt\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(name));

  console.log(`[parse-pptx] Found ${imageFileNames.length} embedded image file(s)`);

  const allImages: ParsedImage[] = [];
  for (const fileName of imageFileNames) {
    try {
      const ext = fileName.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() || '';
      const mime = VISION_MIME_BY_EXT[ext];
      if (!mime) continue;
      const bytes = await zip.files[fileName].async('uint8array');
      if (bytes.length < MIN_IMAGE_BYTES) continue;
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      allImages.push({
        dataUrl,
        sizeBytes: bytes.length,
        name: fileName.replace('ppt/media/', ''),
      });
    } catch (e) {
      console.warn(`[parse-pptx] Skipping ${fileName}:`, e);
    }
  }

  // Bigger files are usually the substantive diagrams / screenshots, not chrome.
  allImages.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const images = allImages.slice(0, MAX_IMAGES);
  console.log(`[parse-pptx] Selected ${images.length} image(s) for vision analysis`);

  // If we have zero text AND zero usable images, the deck is unusable.
  if (!totalText.trim() && images.length === 0) {
    throw new Error(`Found ${slideFiles.length} slide${slideFiles.length === 1 ? '' : 's'} but could not extract any text or substantive images. Try the "Paste Text" tab instead.`);
  }

  // Allow text-empty case if we have images — GPT-5 vision will read them.
  if (!totalText.trim()) {
    totalText = `(No extractable text. ${images.length} image${images.length === 1 ? '' : 's'} attached for visual analysis.)`;
  }

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
    images,
  };
}
