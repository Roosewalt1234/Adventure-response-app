import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./agentConfig";

const notifyManagerDeclaration: FunctionDeclaration = {
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

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.chat = this.ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: [notifyManagerDeclaration] }],
      },
    });
  }

  async sendMessage(message: string, onFunctionCall?: (name: string, args: any) => Promise<void>) {
    try {
      const result = await this.chat.sendMessage({ message });
      
      const functionCalls = result.functionCalls;
      if (functionCalls && onFunctionCall) {
        for (const call of functionCalls) {
          await onFunctionCall(call.name, call.args);
        }
      }

      return result.text;
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "I'm sorry, I'm having trouble connecting right now. Please try again or contact us via WhatsApp: +971 52 343 5089.";
    }
  }
}

export const geminiService = new GeminiService();
