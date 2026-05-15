const GPT5_MODEL = 'gpt-5';

async function callChat(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error('GPT-5 error:', response.status, errText);
    throw new Error(`GPT-5 call failed: ${response.status} ${errText.slice(0, 300)}`);
  }
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('GPT-5 returned no content.');
  return content.trim();
}

// Short, human-readable summary of what the user uploaded. Shown as a
// "context captured" note so the user can confirm we understood the material.
export interface SummarizeInput {
  apiKey: string;
  referenceText?: string;
  referenceImages?: string[]; // data URLs
}

export async function summarizeReference(input: SummarizeInput): Promise<string> {
  const { apiKey, referenceText, referenceImages } = input;
  if (!apiKey) throw new Error('OpenAI API key is required.');

  const SYSTEM = `You are a federal proposal assistant. The user has attached source material (text from a deck or document, plus possibly extracted images of diagrams or screenshots). Write a brief, plain-English summary in 2-3 sentences describing what the material covers: subject, audience, and any obvious structural or visual patterns you see. Mention key acronyms or stakeholders by name if present. Do not produce a structured plan or bullet list — just plain prose.`;

  const userText = [
    referenceText?.trim() ? `TEXT EXTRACTED FROM SOURCE:\n${referenceText.trim()}` : '',
    referenceImages?.length ? `\n\n${referenceImages.length} image${referenceImages.length === 1 ? '' : 's'} attached below for visual context.` : '',
  ].filter(Boolean).join('\n');

  const userContent: any[] = [{ type: 'text', text: userText || 'No text was extracted; please analyze the attached images.' }];
  if (referenceImages?.length) {
    for (const dataUrl of referenceImages) {
      userContent.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'low' } });
    }
  }

  return callChat(apiKey, {
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: referenceImages?.length ? userContent : userText || 'No content provided.' },
    ],
    reasoning_effort: 'minimal',
  });
}

// Style-reference: user uploads an existing infographic and we return a prompt
// they can paste into the Proposal Subject box to render something in a similar
// visual style.
export interface SuggestPromptInput {
  apiKey: string;
  imageDataUrl: string;
}

export async function suggestPromptFromImage(input: SuggestPromptInput): Promise<string> {
  const { apiKey, imageDataUrl } = input;
  if (!apiKey) throw new Error('OpenAI API key is required.');
  if (!imageDataUrl) throw new Error('Image data URL is required.');

  const SYSTEM = `You are a federal-proposal infographic prompt writer. The user has uploaded an existing infographic image they want to recreate or evolve in a similar visual style. Output a single prompt — 3 to 6 sentences, descriptive prose — that the user can paste into a "Proposal Subject" box. The prompt should describe: the subject if you can infer it, the structural pattern (linear pipeline, hierarchical, pillared, matrix, cyclic), the layout direction, the color scheme in plain language (e.g. "deep navy with muted orange accents"), the typography feel (serif/sans, weight), the iconography style (USWDS-style flat, wireframe, monochrome), and the information density. Write it as the user describing what they want, not as instructions to an AI. Do not include preambles like "Create an infographic that..." — just describe the graphic directly. Do not name specific agencies unless they appear in the image. Output the prompt and nothing else.`;

  return callChat(apiKey, {
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this infographic and output a prompt for our generator that would produce something in the same visual style.' },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
    reasoning_effort: 'low',
  });
}

// Stable hash of a string for caching keys. Not crypto, just dedupe.
export async function hashString(s: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
