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
  async sendMessage(message: string, from: string = "website-user") {
    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, from }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === "paused_for_manager") {
        return null; // Signal that the agent is paused
      }

      return data.response;
    } catch (error) {
      console.error("Agent API Error:", error);
      return "I'm sorry, I'm having trouble connecting right now. Please try again or contact us via WhatsApp: +971 52 343 5089.";
    }
  }
}

export const geminiService = new GeminiService();
