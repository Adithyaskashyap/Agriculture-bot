import { serve } from "https://deno.land/std@0.177.1/http/server.ts"; // Use a stable Deno std version


const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash"; 

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const MAX_OUTPUT_TOKENS = 7024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const systemInstruction = `You are a highly knowledgeable and professional **Agri Bot** AI assistant specializing in all aspects of agriculture and farming. 
You provide detailed, accurate, and practical information on: Crop Science, Pest and Disease Management, Soil Health, Irrigation, and Modern Farming Techniques.
Keep your responses clear, authoritative, and actionable. Your primary goal is to help farmers and gardeners succeed.`;


function mapMessagesToGeminiContents(messages: any[]): any[] {
  
  const contents = messages.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user", 
    parts: [{ text: msg.content }]
  }));

  
  const firstUserTurn = contents.find(item => item.role === 'user');
  if (firstUserTurn) {
      firstUserTurn.parts[0].text = `[SYSTEM INSTRUCTION] ${systemInstruction}\n\n[USER QUERY] ${firstUserTurn.parts[0].text}`;
  }

  return contents;
}



async function callGemini(messages: any[]) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");

  const contents = mapMessagesToGeminiContents(messages); 
  
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: contents, 
      generationConfig: {
        temperature: 0.4, 
        candidateCount: 1,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    }),
  });
  
  const textRaw = await response.text();
  
  
  console.log("Raw Gemini Response Body:", textRaw.slice(0, 500) + "...");

  if (!response.ok) {
    throw new Error(`Gemini API HTTP Error ${response.status}: ${textRaw.slice(0, 100)}...`);
  }
  

  if (!textRaw) throw new Error("Gemini API returned empty response");

  let result;
  try { result = JSON.parse(textRaw); } 
  catch { throw new Error("Gemini returned invalid JSON: " + textRaw.slice(0, 100) + "..."); }

  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;

  if (!text) {
    const finishReason = result?.candidates?.[0]?.finishReason;
    const safetyRatings = result?.candidates?.[0]?.safetyRatings;
    
    let diagnostic = `Gemini returned empty text (Finish Reason: ${finishReason})`;
    if (safetyRatings) {
        diagnostic += ` - Safety Block Detected: ${JSON.stringify(safetyRatings)}`;
    }
    throw new Error(diagnostic);
  }

  return text;
}



serve(async (req) => {
  
  if (req.method === "OPTIONS") {
    return new Response(null, { 
        status: 204,
        headers: CORS_HEADERS 
    });
  }

  try {
    const rawBody: any = await req.json();
    const messages = rawBody.messages; 

    if (!messages || messages.length === 0) throw new Error("Missing 'messages' array in request body.");

    
    const answer = await callGemini(messages);
    
    
    return new Response(JSON.stringify({ answer }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });

  } catch (err) {
    console.error("Function Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
});