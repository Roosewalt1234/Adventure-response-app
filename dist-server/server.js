import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./src/services/agentConfig.js";
dotenv.config();
const notifyManagerDeclaration = {
    name: "notify_manager",
    parameters: {
        type: Type.OBJECT,
        description: "Notify the manager about a customer query that needs human intervention.",
        properties: {
            customerQuery: {
                type: Type.STRING,
                description: "The original question or request from the customer.",
            },
            context: {
                type: Type.STRING,
                description: "Any additional context like car preference or rental dates.",
            },
        },
        required: ["customerQuery"],
    },
};
// In-memory chat sessions keyed by sessionId (web) or sender_number (WhatsApp)
const chatSessions = new Map();
function createChatSession(ai) {
    return ai.chats.create({
        model: "gemini-2.0-flash",
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: [notifyManagerDeclaration] }],
        },
    });
}
async function startServer() {
    const app = express();
    const PORT = Number(process.env.PORT) || 3000;
    const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_PROJECT_ID);
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use((err, _req, res, next) => {
        if (err?.type === "entity.parse.failed" || err?.status === 400) {
            return res.status(400).json({ error: "Invalid request body. Send JSON or form-encoded data." });
        }
        next(err);
    });
    // Health check
    app.get("/api/health", (req, res) => {
        res.json({ status: "ok", message: "Natalia is ready!" });
    });
    /**
     * Main chat endpoint — used by:
     *   - Web chat:   { message, sessionId }
     *   - n8n/WAHA:  { message, sender_number, tenant_slug? }
     *
    * Response includes both `response` (web) and `data` (n8n Send Text Reply node)
     */
    app.post("/api/agent/chat", async (req, res) => {
        try {
            let payload = {};
            if (req.body && typeof req.body === "object") {
                payload = req.body;
            }
            else if (typeof req.body === "string") {
                try {
                    const parsed = JSON.parse(req.body);
                    if (parsed && typeof parsed === "object") {
                        payload = parsed;
                    }
                }
                catch {
                    payload = {};
                }
            }
            const message = typeof payload.message === "string" ? payload.message.trim() : "";
            const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
            const sender_number = typeof payload.sender_number === "string" ? payload.sender_number : "";
            // Support both calling conventions
            const effectiveSessionId = sessionId || sender_number;
            const channel = sender_number ? "whatsapp" : "web";
            if (!message || !effectiveSessionId) {
                return res.status(400).json({
                    error: "Provide either { message, sessionId } (web) or { message, sender_number } (WhatsApp).",
                });
            }
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.error("GEMINI_API_KEY is missing");
                return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
            }
            const ai = new GoogleGenAI({ apiKey });
            if (!chatSessions.has(effectiveSessionId)) {
                chatSessions.set(effectiveSessionId, createChatSession(ai));
                console.log(`[${channel}] New session: ${effectiveSessionId}`);
            }
            const chat = chatSessions.get(effectiveSessionId);
            const result = await chat.sendMessage({ message });
            // Handle notify_manager tool calls → forward to n8n escalation webhook
            const functionCalls = result.functionCalls;
            if (functionCalls?.length > 0) {
                for (const call of functionCalls) {
                    if (call.name === "notify_manager") {
                        console.log(`[${channel}] Escalating to manager:`, call.args);
                        const webhookUrl = process.env.N8N_ESCALATION_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
                        if (webhookUrl) {
                            try {
                                await fetch(webhookUrl, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        event: "escalation",
                                        channel,
                                        customer: sender_number || "Website User",
                                        ...call.args,
                                        timestamp: new Date().toISOString(),
                                    }),
                                });
                                console.log("Manager notified via n8n.");
                            }
                            catch (err) {
                                console.error("Failed to notify n8n:", err);
                            }
                        }
                        else {
                            console.warn("No escalation webhook configured.");
                        }
                    }
                }
            }
            const text = result.text ?? "I'm sorry, I'm having trouble right now. Please contact us on WhatsApp: +971 52 343 5089.";
            // `data` is what n8n's "Send Text Reply" node reads via $json.data
            res.json({ response: text, data: text, sender: "Natalia" });
        }
        catch (error) {
            console.error("Error in /api/agent/chat:", error);
            res.status(500).json({ error: "Failed to get response from agent." });
        }
    });
    // Vite middleware for development
    if (!isProduction) {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    }
    else {
        app.use(express.static("dist"));
    }
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
startServer().catch((err) => {
    console.error("Fatal: server failed to start:", err);
    process.exit(1);
});
