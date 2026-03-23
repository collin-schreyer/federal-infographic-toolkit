import dotenv from 'dotenv';
dotenv.config();

async function testImageGen() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${apiKey}`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: "A sleek, Times New Roman, linear flow infographic for a government proposal." }
                ]
            }
        ]
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(response.status, await response.text());
            return;
        }

        const data = await response.json();
        const parts = data.candidates[0].content.parts;
        parts.forEach((p: any, i: number) => {
            console.log(`Part ${i}:`, Object.keys(p));
            if (p.inlineData) console.log("InlineData mimeType:", p.inlineData.mimeType);
            if (p.text) console.log("Text length:", p.text.length);
        });
    } catch (err) {
        console.error(err);
    }
}

testImageGen();
