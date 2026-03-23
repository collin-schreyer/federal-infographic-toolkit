import dotenv from 'dotenv';
dotenv.config();

async function testImageGen() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    // Trying models/nano-banana-pro-preview or models/gemini-3.1-flash-image-preview
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
        console.log("Fetching...");
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
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(err);
    }
}

testImageGen();
