// Thin client — all AI logic runs server-side, API key stays secret

export class GeminiService {
  private sessionId: string;

  constructor() {
    // Unique ID per browser session so the server maintains per-user chat history
    this.sessionId = crypto.randomUUID();
  }

  async sendMessage(message: string): Promise<string> {
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId: this.sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.response ?? "I'm sorry, I couldn't get a response. Please try again or contact us via WhatsApp: +971 52 343 5089.";
  }
}

export const geminiService = new GeminiService();
