import { generateInfographicData } from './src/lib/gemini.js';
import dotenv from 'dotenv';
dotenv.config();

const topic = `Create an infographic detailing our 4-stage technical approach for migrating the agency's legacy onsite infrastructure into a FedRAMP-High AWS GovCloud environment. Ensure the tone is highly formal. Stage 1 is Discovery, Auditing, and Dependency Mapping. Stage 2 covers Containerization and Microservice Refactoring using Kubernetes. Stage 3 maps to the Secure Data Migration and Parallel Testing Phase. Stage 4 culminates in the final Cut-Over, Knowledge Transfer, and Authority to Operate (ATO) certification.`;

async function test() {
    try {
        const data = await generateInfographicData(topic, process.env.VITE_GOOGLE_GEMINI_API_KEY!);
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("FAILED:", err);
    }
}
test();
