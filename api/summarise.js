// ============================================
// SWIFTREADER - VERCEL API ENDPOINT
// Handles AI summarization requests
// ============================================

import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { text, sectionTitle } = req.body;

        // Validate input
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Invalid request: text is required' });
        }

        if (text.trim().length < 50) {
            return res.status(400).json({ error: 'Text too short to summarize' });
        }

        if (text.length > 100000) {
            return res.status(400).json({ error: 'Text too long (max 100k characters)' });
        }

        // Check API key
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('❌ ANTHROPIC_API_KEY not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        console.log(`[API] Generating summary for section: "${sectionTitle || 'Untitled'}"`);
        console.log(`[API] Text length: ${text.length} characters`);

        // Initialize Anthropic client
        const anthropic = new Anthropic({
            apiKey: apiKey,
        });

        // Generate summary
        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `Summarize this academic paper section for a student with ADHD.

Section Title: ${sectionTitle || 'Untitled Section'}

Section Content:
${text}

Return ONLY valid JSON with this exact structure. Start your response with { and end with }. No explanations, no markdown, no extra text:

{
  "overview": "2-3 sentence summary",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "importance": "Why this section matters (1 sentence)"
}`
            }]
        });

        // Extract response
        const responseText = message.content[0].text.trim();
        console.log('[API] Raw AI response:', responseText.substring(0, 200));
        
        // Remove markdown code blocks if present
        let cleanedText = responseText
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/g, '')
            .replace(/^json\n?/gi, ''); // Remove "json" prefix

        // Extract JSON object more robustly
        // Look for the first { and last } to extract just the JSON
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedText = cleanedText.substring(firstBrace, lastBrace + 1).trim();
        }

        console.log('[API] Cleaned text for parsing:', cleanedText.substring(0, 200));

        // Parse JSON
        let summary;
        try {
            summary = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('[API] ❌ JSON Parse Error:', parseError.message);
            console.error('[API] Cleaned text:', cleanedText);
            console.error('[API] Original text:', responseText);
            return res.status(500).json({ 
                error: 'JSON parse error: ' + parseError.message,
                rawResponse: responseText.substring(0, 300),
                cleanedResponse: cleanedText.substring(0, 300)
            });
        }

        // Validate summary structure
        if (!summary.overview) {
            console.error('[API] Missing overview in summary');
            return res.status(500).json({ error: 'Invalid summary structure: missing overview' });
        }

        if (!Array.isArray(summary.keyPoints)) {
            console.error('[API] keyPoints is not an array:', summary.keyPoints);
            summary.keyPoints = summary.keyPoints ? [summary.keyPoints] : [];
        }

        if (!summary.importance) {
            summary.importance = 'This is an important section';
        }

        console.log('[API] ✅ Summary generated successfully');
        console.log('[API] Summary:', JSON.stringify(summary, null, 2));

        // Return summary
        return res.status(200).json({
            success: true,
            summary: {
                sectionTitle: sectionTitle || 'Untitled Section',
                overview: String(summary.overview),
                keyPoints: Array.isArray(summary.keyPoints) ? summary.keyPoints.map(p => String(p)) : [],
                importance: String(summary.importance),
                timestamp: Date.now()
            },
            usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens
            }
        });

    } catch (error) {
        console.error('[API] Error:', error);

        // Handle specific Anthropic API errors
        if (error.status === 401) {
            return res.status(500).json({ error: 'API authentication failed' });
        } else if (error.status === 429) {
            return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
        } else if (error.status === 400) {
            return res.status(400).json({ error: 'Invalid request to AI service' });
        }

        // Generic error
        return res.status(500).json({ 
            error: 'Failed to generate summary',
            message: error.message 
        });
    }
}
