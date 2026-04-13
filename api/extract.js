export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { base64, filename } = req.body;
    if (!base64) return res.status(400).json({ error: 'No PDF data provided' });

    const prompt = `You are extracting data from a Municode building inspection/plan examination PDF for BHP Jansen Stage 1.

Extract the following and return ONLY valid JSON, no markdown, no explanation:

{
  "docType": "PLAN EXAMINATION REPORT" | "PERIODIC INSPECTION REPORT" | "UNKNOWN",
  "date": "YYYY-MM-DD or empty string",
  "fileNumber": "the File: number e.g. 3059422",
  "inspectionNumber": "inspection number if present, else empty string",
  "title": "the project title/name",
  "actions": [
    {
      "itemNum": "item number e.g. 1, 2, 3.a, etc.",
      "codeRef": "code reference e.g. 3.2.4.5 if present, else empty",
      "actionText": "the full action/condition text"
    }
  ]
}

For PLAN EXAMINATION REPORT: extract conditions from 'See Plan Examination Report Attachment for conditions of permit issuance' section.
For PERIODIC INSPECTION REPORT: extract items from 'The following items below are required to be completed' section.
If neither section exists or the document is a memo/email, return docType UNKNOWN and empty actions array.
Return only the raw JSON object.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      return res.status(200).json(parsed);
    } catch {
      return res.status(500).json({ error: 'Could not parse AI response', raw: clean });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
