import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./src/services/agentConfig";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Natalia is ready!" });
  });

  // API endpoint for n8n to talk TO the agent
  app.post("/api/agent/chat", async (req, res) => {
    console.log("--- New Agent Chat Request ---");
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const { message } = req.body;
    
    if (!message) {
      console.error("Error: No message provided in request body");
      return res.status(400).json({ error: "Message is required. Ensure you are sending {'message': 'your text'} in the JSON body." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: GEMINI_API_KEY is missing from environment variables");
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    try {
      console.log(`Sending to Gemini: "${message}"`);
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: message,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });

      console.log("Gemini Response:", response.text);

      res.json({ 
        response: response.text,
        sender: "Natalia"
      });
    } catch (error) {
      console.error("Error in agent chat endpoint:", error);
      res.status(500).json({ error: "Failed to get response from agent. Check server logs for details." });
    }
  });

  // API endpoint for n8n proxy (Agent talking TO n8n)
  app.post("/api/n8n", async (req, res) => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.warn("N8N_WEBHOOK_URL is not configured.");
      return res.status(501).json({ error: "n8n integration not configured" });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        throw new Error(`n8n responded with ${response.status}`);
      }

      const data = await response.json().catch(() => ({ status: "ok" }));
      res.json(data);
    } catch (error) {
      console.error("Error calling n8n:", error);
      res.status(500).json({ error: "Failed to notify n8n" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
