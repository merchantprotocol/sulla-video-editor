const config = require('../utils/config');
const log = require('../utils/logger').create('analyze');

const SYSTEM_PROMPT = `You are Sulla, an AI video editing assistant. You analyze video transcripts and provide actionable editing suggestions.

Given a transcript with word-level timestamps, filler words, and silence gaps, produce a JSON array of suggestions. Each suggestion should have:
- "type": one of "fillers", "silence", "hook", "pacing", "content", "clip"
- "title": short summary (under 60 chars)
- "description": actionable advice (1-2 sentences)
- "severity": "info", "warning", or "critical"
- "count": (optional) number of instances found
- "time_ranges": (optional) array of { start_ms, end_ms } for relevant sections

Focus on:
1. Filler word density and where they cluster
2. Long silences that could be trimmed
3. Opening hook strength (first 30 seconds)
4. Pacing issues (rushed sections vs dead air)
5. Potential social clips (engaging 30-90 second segments)

Return ONLY valid JSON: { "suggestions": [...] }`;

const AnalyzeService = {
  async analyzeTranscript(transcript) {
    if (!config.sullaBearerToken) {
      log.warn('No SULLA_BEARER_TOKEN configured — skipping AI analysis');
      return { suggestions: [] };
    }

    const fillerCount = transcript.words ? transcript.words.filter(w => w.filler).length : 0;
    const silenceCount = transcript.silences ? transcript.silences.length : 0;
    const wordCount = transcript.words ? transcript.words.length : 0;
    const durationMs = transcript.duration_ms || 0;

    const userMessage = `Analyze this transcript and provide editing suggestions.

Summary:
- Total words: ${wordCount}
- Filler words: ${fillerCount}
- Silence gaps (>1.5s): ${silenceCount}
- Duration: ${Math.round(durationMs / 1000)}s

Transcript (first 500 words with timestamps):
${formatTranscriptExcerpt(transcript, 500)}

Silence gaps:
${formatSilences(transcript.silences || [])}`;

    try {
      log.info('Sending transcript to Sulla for analysis', { wordCount, fillerCount, silenceCount });

      const response = await fetch(config.sullaChatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.sullaBearerToken}`,
        },
        body: JSON.stringify({
          model: 'sulla',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        log.error('Sulla chat completions error', { status: response.status, body: text });
        return { suggestions: [] };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        log.warn('Empty response from Sulla');
        return { suggestions: [] };
      }

      // Parse JSON from response (handle markdown code blocks)
      const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(jsonStr);

      log.info('AI analysis complete', { suggestionCount: parsed.suggestions?.length || 0 });
      return parsed;
    } catch (err) {
      log.error('AI analysis failed', { error: err.message });
      return { suggestions: [] };
    }
  },
};

function formatTranscriptExcerpt(transcript, maxWords) {
  if (!transcript.words || transcript.words.length === 0) return '(empty transcript)';

  const words = transcript.words.slice(0, maxWords);
  return words.map(w => {
    const ts = `[${(w.start / 1000).toFixed(1)}s]`;
    const filler = w.filler ? ' (FILLER)' : '';
    return `${ts} ${w.word}${filler}`;
  }).join(' ');
}

function formatSilences(silences) {
  if (silences.length === 0) return '(none detected)';

  return silences.slice(0, 20).map(s => {
    const start = (s.start / 1000).toFixed(1);
    const end = (s.end / 1000).toFixed(1);
    const dur = ((s.end - s.start) / 1000).toFixed(1);
    return `  ${start}s - ${end}s (${dur}s gap)`;
  }).join('\n');
}

module.exports = AnalyzeService;
