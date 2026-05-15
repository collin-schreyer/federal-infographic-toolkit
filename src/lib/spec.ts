export type StructureType = 'linear' | 'hierarchical' | 'matrix' | 'cyclic' | 'pillared';
export type Tone = 'executive' | 'technical' | 'operational';

export interface SpecNode {
  id: number;
  label: string;
  description: string;
  icon_hint: string;
}

export interface SpecEdge {
  from: number;
  to: number;
  label: string;
}

export interface SpecAcronym {
  term: string;
  expansion: string;
}

export interface InfographicSpec {
  title: string;
  narrative_summary: string;
  target_audience: string;
  structure_type: StructureType;
  tone: Tone;
  nodes: SpecNode[];
  edges: SpecEdge[];
  key_themes: string[];
  extracted_acronyms: SpecAcronym[];
  compliance_signals: string[];
  suggested_topic: string;
}

// Serialize a spec into a deterministic, instruction-style prompt block.
// This is what gets prepended to the image-model prompt so it has a structured
// understanding of what to draw.
export function specToPromptBlock(spec: InfographicSpec): string {
  const lines: string[] = [];
  lines.push(`STRUCTURED CONTEXT — a reasoning model already analyzed the source material and produced this brief. Build the infographic to match it precisely.`);
  lines.push('');
  lines.push(`TITLE: ${spec.title}`);
  lines.push(`AUDIENCE: ${spec.target_audience}`);
  lines.push(`TONE: ${spec.tone}`);
  lines.push(`STRUCTURE: ${spec.structure_type}`);
  lines.push('');
  lines.push(`NARRATIVE SUMMARY:`);
  lines.push(spec.narrative_summary);
  lines.push('');
  lines.push(`NODES (render exactly these, in order; do not invent additional nodes):`);
  for (const n of spec.nodes) {
    lines.push(`  ${n.id}. ${n.label} — ${n.description}` + (n.icon_hint ? ` [icon: ${n.icon_hint}]` : ''));
  }
  if (spec.edges.length > 0) {
    lines.push('');
    lines.push(`CONNECTIONS:`);
    for (const e of spec.edges) {
      lines.push(`  ${e.from} → ${e.to}` + (e.label ? `: ${e.label}` : ''));
    }
  }
  if (spec.key_themes.length > 0) {
    lines.push('');
    lines.push(`THEMES TO EMPHASIZE VISUALLY: ${spec.key_themes.join(', ')}`);
  }
  if (spec.extracted_acronyms.length > 0) {
    lines.push('');
    lines.push(`ACRONYMS (render exactly as written, do not expand or invent):`);
    for (const a of spec.extracted_acronyms) {
      lines.push(`  ${a.term} — ${a.expansion}`);
    }
  }
  if (spec.compliance_signals.length > 0) {
    lines.push('');
    lines.push(`COMPLIANCE BADGES TO INCLUDE (if visually appropriate): ${spec.compliance_signals.join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}
