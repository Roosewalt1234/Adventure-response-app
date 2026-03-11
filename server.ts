import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./src/services/agentConfig";
import pg from "pg";

const { Pool } = pg;

console.log("🚀 Natalia Server is starting...");
console.log("Environment:", process.env.NODE_ENV || "development");
console.log("Port:", process.env.PORT || 3000);

dotenv.config();

// Database setup
const pool = process.env.DATABASE_URL 
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

if (pool) {
  console.log("🐘 Database connection configured.");
} else {
  console.warn("⚠️ DATABASE_URL not found. Falling back to in-memory storage.");
}

// Simple in-memory storage fallback
const chatHistoriesMemory = new Map<string, any[]>();

async function initDatabase() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        sender_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sender_id ON chat_history(sender_id);
    `);
    console.log("✅ Database table initialized.");
  } catch (err) {
    console.error("❌ Failed to initialize database:", err);
  }
}

async function getHistory(senderId: string) {
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT role, content FROM chat_history WHERE sender_id = $1 ORDER BY created_at ASC LIMIT 20",
        [senderId]
      );
      return result.rows.map(row => ({
        role: row.role,
        parts: [{ text: row.content }]
      }));
    } catch (err) {
      console.error("Error fetching history from DB:", err);
      return [];
    }
  }
  return chatHistoriesMemory.get(senderId) || [];
}

async function saveHistory(senderId: string, role: string, content: string) {
  if (pool) {
    try {
      await pool.query(
        "INSERT INTO chat_history (sender_id, role, content) VALUES ($1, $2, $3)",
        [senderId, role, content]
      );
    } catch (err) {
      console.error("Error saving history to DB:", err);
    }
  } else {
    if (!chatHistoriesMemory.has(senderId)) {
      chatHistoriesMemory.set(senderId, []);
    }
    const history = chatHistoriesMemory.get(senderId)!;
    history.push({ role, parts: [{ text: content }] });
    if (history.length > 20) history.splice(0, 1);
  }
}

async function startServer() {
  await initDatabase();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  console.log(`Attempting to start server on port ${PORT}...`);

  // Health check endpoint - very first thing
  app.get("/api/health", (req, res) => {
    console.log("Health check requested");
    res.status(200).json({ status: "ok", message: "Natalia is ready!" });
  });

  app.get("/", (req, res) => {
    res.send("Natalia Agent is Online");
  });

  app.use(express.json());

  // API endpoint for n8n to talk TO the agent
  app.post("/api/agent/chat", async (req, res) => {
    console.log("--- New Agent Chat Request ---");
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const { message, from } = req.body;
    
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
      console.log(`Sending to Gemini: "${message}" from "${from}"`);
      const ai = new GoogleGenAI({ apiKey });
      
      // Get history for this sender
      const senderId = from || "anonymous";
      const history = await getHistory(senderId);

      const notifyManagerTool = {
        functionDeclarations: [{
          name: "notify_manager",
          description: "Notifies the manager when a customer asks for a discount, negotiates price, or asks something not in the knowledge bank.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              customer_query: {
                type: Type.STRING,
                description: "The original question or request from the customer."
              },
              context: {
                type: Type.STRING,
                description: "Any additional relevant details about the conversation."
              }
            },
            required: ["customer_query"]
          }
        }]
      };

      // Construct the full conversation for Gemini
      const contents = [
        ...history,
        { role: "user", parts: [{ text: message }] }
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [notifyManagerTool]
        }
      });

      const responseText = response.text || "I'm sorry, I couldn't process that.";

      // Save this exchange to history
      await saveHistory(senderId, "user", message);
      await saveHistory(senderId, "model", responseText);

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        console.log("🛠️ Natalia is calling notify_manager tool...");
        const call = functionCalls[0];
        
        // Trigger the n8n webhook in the background
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        if (webhookUrl) {
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "manager_escalation",
              ...call.args
            })
          }).catch(err => console.error("Failed to notify n8n:", err));
        }
      }

      console.log("Gemini Response:", responseText);

      res.json({ 
        response: responseText,
        sender: "Natalia",
        from: from || null
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
    console.log("🛠️ Loading Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("📦 Serving static files from dist/");
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server is officially listening on 0.0.0.0:${PORT}`);
  });
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
