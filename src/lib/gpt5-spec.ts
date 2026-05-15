import type { InfographicSpec } from './spec';

const GPT5_MODEL = 'gpt-5';

// JSON Schema for OpenAI structured outputs. Strict mode requires every property
// to be marked required and additionalProperties:false on every object.
const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'narrative_summary',
    'target_audience',
    'structure_type',
    'tone',
    'nodes',
    'edges',
    'key_themes',
    'extracted_acronyms',
    'compliance_signals',
    'suggested_topic',
  ],
  properties: {
    title: { type: 'string', description: 'Short, executive-grade title for the infographic.' },
    narrative_summary: { type: 'string', description: '2-3 sentence summary of the visual story.' },
    target_audience: { type: 'string', description: 'Specific audience, e.g. "DLA sustainment leadership".' },
    structure_type: {
      type: 'string',
      enum: ['linear', 'hierarchical', 'matrix', 'cyclic', 'pillared'],
      description: 'The visual layout that best fits the content.',
    },
    tone: {
      type: 'string',
      enum: ['executive', 'technical', 'operational'],
    },
    nodes: {
      type: 'array',
      description: 'Ordered list of every primary node/stage/pillar that should appear in the graphic. 3-12 items.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'description', 'icon_hint'],
        properties: {
          id: { type: 'integer' },
          label: { type: 'string', description: 'Short label (<= 6 words).' },
          description: { type: 'string', description: 'One sentence explaining this node.' },
          icon_hint: { type: 'string', description: 'Short hint at icon to use, e.g. "shield", "stacked databases", "checklist". Empty string if none.' },
        },
      },
    },
    edges: {
      type: 'array',
      description: 'Optional connections between nodes (use empty array if structure_type does not need them).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'label'],
        properties: {
          from: { type: 'integer' },
          to: { type: 'integer' },
          label: { type: 'string', description: 'Optional edge label, empty string if none.' },
        },
      },
    },
    key_themes: {
      type: 'array',
      description: '3-6 themes to emphasize visually (e.g., "zero-trust", "FedRAMP-High posture").',
      items: { type: 'string' },
    },
    extracted_acronyms: {
      type: 'array',
      description: 'Every acronym present in the source material with its expansion. Empty if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'expansion'],
        properties: {
          term: { type: 'string' },
          expansion: { type: 'string' },
        },
      },
    },
    compliance_signals: {
      type: 'array',
      description: 'Standards/frameworks the graphic should reference if relevant (e.g. "NIST SP 800-207", "FedRAMP High", "Section 508"). Empty if none.',
      items: { type: 'string' },
    },
    suggested_topic: {
      type: 'string',
      description: 'A one-line "Proposal Subject" prompt the user can use as-is. Should be 1-3 sentences describing the infographic to render.',
    },
  },
} as const;

const SYSTEM_PROMPT = `You are an expert federal proposal infographic architect. Given source material (e.g., extracted text from a PowerPoint, RFP, or pasted notes) and an optional user topic, you produce a clean, structured brief that an image-generation model can use to render a high-quality infographic.

Guidelines:
- Be precise and concrete. Use the language of the source material wherever possible.
- Choose structure_type to match the content's natural shape. Linear for phased pipelines, hierarchical for org/chain structures, pillared for parallel domains (e.g., Zero Trust pillars), matrix for relational quadrants, cyclic for feedback loops.
- Render 3-12 nodes. Each node label must be <= 6 words.
- Extract EVERY acronym present in the source material so the image model renders them verbatim.
- Identify compliance_signals (NIST controls, FedRAMP levels, OMB memos, Section 508) so they can be baked in.
- The suggested_topic must be a complete, usable prompt that the user could paste into a Proposal Subject field and get a good render.
- Never include stock-photo people, faux-3D gears, clipart, or generic AI imagery in your guidance.`;

export interface GenerateSpecInput {
  apiKey: string;
  topic?: string;
  referenceText?: string;
  panelHints?: {
    orientation?: string;
    flow?: string;
    density?: string;
  };
}

export async function generateSpec(input: GenerateSpecInput): Promise<InfographicSpec> {
  const { apiKey, topic, referenceText, panelHints } = input;

  if (!apiKey) throw new Error('OpenAI API key is required for spec generation.');
  if (!topic?.trim() && !referenceText?.trim()) {
    throw new Error('Provide either a topic, reference material, or both.');
  }

  const userPartLines: string[] = [];
  if (topic?.trim()) {
    userPartLines.push(`USER TOPIC:\n${topic.trim()}`);
    userPartLines.push('');
  }
  if (referenceText?.trim()) {
    userPartLines.push(`REFERENCE MATERIAL (extracted from user-uploaded source):`);
    userPartLines.push(referenceText.trim());
    userPartLines.push('');
  }
  if (panelHints) {
    const hintParts: string[] = [];
    if (panelHints.orientation) hintParts.push(`target orientation: ${panelHints.orientation}`);
    if (panelHints.flow) hintParts.push(`user-preferred flow: ${panelHints.flow}`);
    if (panelHints.density) hintParts.push(`density preference: ${panelHints.density}`);
    if (hintParts.length > 0) {
      userPartLines.push(`PANEL HINTS: ${hintParts.join('; ')}.`);
      userPartLines.push('');
    }
  }
  userPartLines.push(`Produce the structured InfographicSpec now.`);

  const body = {
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPartLines.join('\n') },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'infographic_spec',
        strict: true,
        schema: SPEC_SCHEMA,
      },
    },
    reasoning_effort: 'medium',
  };

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
    console.error('GPT-5 Spec Error:', response.status, errText);
    throw new Error(`GPT-5 spec generation failed: ${response.status} ${errText.slice(0, 300)}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('GPT-5 returned no spec content.');
  }

  try {
    return JSON.parse(content) as InfographicSpec;
  } catch (e) {
    throw new Error(`GPT-5 returned malformed JSON: ${(e as Error).message}`);
  }
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
