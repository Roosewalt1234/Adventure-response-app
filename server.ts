import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./src/services/agentConfig";
import pg from "pg";
import path from "path";

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

      CREATE TABLE IF NOT EXISTS user_state (
        sender_id TEXT PRIMARY KEY,
        state JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS escalations (
        id SERIAL PRIMARY KEY,
        sender_id TEXT NOT NULL,
        customer_query TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_escalations_sender_id ON escalations(sender_id);
      CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
    `);
    console.log("✅ Database tables initialized.");
  } catch (err) {
    console.error("❌ Failed to initialize database:", err);
  }
}

async function getUserState(senderId: string) {
  if (pool) {
    try {
      const result = await pool.query("SELECT state FROM user_state WHERE sender_id = $1", [senderId]);
      return result.rows[0]?.state || {};
    } catch (err) {
      console.error("Error fetching user state:", err);
      return {};
    }
  }
  return {};
}

async function updateUserState(senderId: string, state: any) {
  if (pool) {
    try {
      await pool.query(
        "INSERT INTO user_state (sender_id, state, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (sender_id) DO UPDATE SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP",
        [senderId, state]
      );
    } catch (err) {
      console.error("Error updating user state:", err);
    }
  }
}

async function createEscalation(senderId: string, query: string, reason: string) {
  if (pool) {
    try {
      await pool.query(
        "INSERT INTO escalations (sender_id, customer_query, reason) VALUES ($1, $2, $3)",
        [senderId, query, reason]
      );
      console.log(`📝 Escalation recorded for ${senderId}`);
    } catch (err) {
      console.error("Error creating escalation record:", err);
    }
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

  app.use(express.json());

  // Endpoint to resume Natalia (unpause)
  app.post("/api/agent/resume", async (req, res) => {
    const { from } = req.body;
    if (!from) return res.status(400).json({ error: "from (senderId) is required" });
    
    const currentState = await getUserState(from);
    await updateUserState(from, { ...currentState, is_escalated: false });
    
    // Mark escalations as resolved
    if (pool) {
      try {
        await pool.query(
          "UPDATE escalations SET status = 'resolved' WHERE sender_id = $1 AND status = 'pending'",
          [from]
        );
      } catch (err) {
        console.error("Error resolving escalations:", err);
      }
    }
    
    console.log(`🔓 Natalia resumed for ${from}`);
    res.json({ status: "resumed", message: `Natalia is now listening to ${from} again.` });
  });

  // API endpoint for n8n talk TO the agent
  app.post("/api/agent/chat", async (req, res) => {
    console.log("--- New Agent Chat Request ---");
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const { message, from } = req.body;
    
    if (!message) {
      console.error("Error: No message provided in request body");
      return res.status(400).json({ error: "Message is required. Ensure you are sending {'message': 'your text'} in the JSON body." });
    }

    const senderId = from || "anonymous";
    const userState = await getUserState(senderId);

    // SILENCE LOGIC: If escalated, do not respond
    if (userState.is_escalated) {
      console.log(`🤫 Natalia is silent for ${senderId} (Escalated to Manager)`);
      return res.json({ 
        response: null, 
        status: "paused_for_manager",
        from: from || null,
        is_escalated: true
      });
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
      const history = await getHistory(senderId);

      // Add state context to system instruction if needed
      let dynamicInstruction = SYSTEM_INSTRUCTION;
      if (userState.offered_deposit_discount) {
        dynamicInstruction += "\n\nNote: You have already offered a 500 AED discount on the deposit. If they ask for more, escalate to the manager.";
      }
      if (userState.offered_rent_promo) {
        dynamicInstruction += "\n\nNote: You have already given the 'Ramadhan Promo' message for rent. If they ask for a rent discount again, escalate to the manager.";
      }

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
              reason: {
                type: Type.STRING,
                description: "The reason for escalation: 'negotiation' or 'unknown_question'."
              },
              context: {
                type: Type.STRING,
                description: "Any additional relevant details about the conversation."
              }
            },
            required: ["customer_query", "reason"]
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
          systemInstruction: dynamicInstruction,
          tools: [notifyManagerTool]
        }
      });

      let responseText = response.text || "";
      const functionCalls = response.functionCalls;

      // Track if we gave the rent promo
      if (responseText.includes("Ramadhan Promo offer")) {
        await updateUserState(senderId, { ...userState, offered_rent_promo: true });
      }

      // Track if we gave the deposit discount
      if (responseText.includes("500 AED discount on the deposit/advance")) {
        await updateUserState(senderId, { ...userState, offered_deposit_discount: true });
      }

      if (functionCalls && functionCalls.length > 0) {
        console.log("🛠️ Natalia is calling notify_manager tool...");
        const call = functionCalls[0];
        const args = call.args as any;
        
        // Mark as escalated in database
        await updateUserState(senderId, { ...userState, is_escalated: true });
        
        // Record the escalation in the new table
        await createEscalation(senderId, args.customer_query, args.reason);

        // If the model didn't provide text, give a default escalation message
        if (!responseText) {
          responseText = "I will check with my manager and get back to you shortly. 😊";
        }
      }

      if (!responseText) {
        responseText = "I'm sorry, I couldn't process that.";
      }

      // Save this exchange to history
      await saveHistory(senderId, "user", message);
      await saveHistory(senderId, "model", responseText);

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        const args = call.args as any;
        // Check if this is a deposit discount request
        const isDepositDiscount = args.reason === "negotiation" && /deposit|advance/i.test(args.customer_query || "");
      }

      // Trigger the n8n webhook for ALL responses if configured
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (webhookUrl) {
        const isEscalated = !!(functionCalls && functionCalls.length > 0);
        const args = isEscalated ? (functionCalls[0].args as any) : null;
        const isDepositDiscount = isEscalated && args.reason === "negotiation" && /deposit|advance/i.test(args.customer_query || "");

        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: isEscalated ? "manager_escalation" : "agent_reply",
            message: responseText,
            from: senderId,
            is_escalated: isEscalated,
            metadata: isEscalated ? {
              reason: args.reason,
              customer_query: args.customer_query,
              is_deposit_discount: isDepositDiscount
            } : null
          })
        }).catch(err => console.error("Failed to notify n8n:", err));

        // If it's a deposit discount, schedule the 3-minute follow-up
        if (isDepositDiscount && !userState.offered_deposit_discount) {
          console.log(`⏰ Scheduling 3-minute follow-up for ${senderId}`);
          setTimeout(async () => {
            const followUpMessage = "I've checked with the manager, and we can offer a reduction of 500.00 AED on the deposit/advance. 😊 Beyond this, I'm afraid we can't go lower. Shall I proceed with the booking?";
            
            await saveHistory(senderId, "model", followUpMessage);
            const currentState = await getUserState(senderId);
            await updateUserState(senderId, { ...currentState, offered_deposit_discount: true });

            fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "proactive_message",
                message: followUpMessage,
                from: senderId,
                is_escalated: false
              })
            }).catch(err => console.error("Failed to send proactive message to n8n:", err));
          }, 3 * 60 * 1000);
        }
      }

      console.log("Gemini Response:", responseText);

      res.json({ 
        response: responseText,
        sender: "Natalia",
        from: from || null,
        is_escalated: !!(functionCalls && functionCalls.length > 0)
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

  // Admin Stats Endpoint
  app.get("/api/admin/stats", async (req, res) => {
    const { range } = req.query; // today, week, month, all
    if (!pool) return res.json({ error: "Database not connected" });

    let timeFilter = "";
    if (range === "today") timeFilter = "AND created_at >= CURRENT_DATE";
    else if (range === "week") timeFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
    else if (range === "month") timeFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";

    try {
      const messages = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE role = 'user') as incoming,
          COUNT(*) FILTER (WHERE role = 'model') as outgoing
        FROM chat_history
        WHERE 1=1 ${timeFilter}
      `);

      const contacts = await pool.query(`
        SELECT COUNT(DISTINCT sender_id) as total FROM chat_history
        WHERE 1=1 ${timeFilter}
      `);

      const escalations = await pool.query(`
        SELECT COUNT(*) as total FROM escalations
        WHERE 1=1 ${timeFilter}
      `);

      // Mock conversion rate for now (e.g. 5% of contacts)
      const totalContacts = parseInt(contacts.rows[0].total || "0");
      const converted = Math.floor(totalContacts * 0.05);

      res.json({
        messages: {
          total: parseInt(messages.rows[0].total || "0"),
          incoming: parseInt(messages.rows[0].incoming || "0"),
          outgoing: parseInt(messages.rows[0].outgoing || "0"),
          ai_replies: parseInt(messages.rows[0].outgoing || "0")
        },
        contacts: {
          total: totalContacts,
          new: totalContacts, // simplified
          converted: converted,
          human_takeovers: parseInt(escalations.rows[0].total || "0")
        }
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Admin Escalations List
  app.get("/api/admin/escalations", async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const result = await pool.query(`
        SELECT e.*, u.state->>'is_escalated' as current_status
        FROM escalations e
        LEFT JOIN user_state u ON e.sender_id = u.sender_id
        ORDER BY e.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching escalations:", err);
      res.status(500).json({ error: "Failed to fetch escalations" });
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
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist", "index.html"));
    });
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
