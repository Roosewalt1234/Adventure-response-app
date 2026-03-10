/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Car, 
  Send, 
  MessageCircle, 
  MapPin, 
  Phone, 
  Info, 
  CheckCircle2, 
  ChevronRight,
  Menu,
  X,
  User,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { geminiService } from './services/geminiService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const FLEET = [
  { name: 'Jetour T2', type: 'SUV', price: 'AED 99/day', image: 'https://picsum.photos/seed/jetour/400/300' },
  { name: 'Honda Civic', type: 'Sedan', price: 'AED 49/day', image: 'https://picsum.photos/seed/honda/400/300' },
  { name: 'Ford Mustang', type: 'Sports', price: 'AED 99/day', image: 'https://picsum.photos/seed/mustang/400/300' },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! This is Natalia from Adventure Car Rentals. How can I assist you today? 😊",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await geminiService.sendMessage(input, async (name, args) => {
        if (name === 'notify_manager') {
          console.log('Escalating to n8n:', args);
          try {
            await fetch('/api/n8n', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'escalation',
                customer: 'Website User',
                ...args,
                timestamp: new Date().toISOString()
              })
            });
          } catch (err) {
            console.error('Failed to notify n8n:', err);
          }
        }
      });
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-80 border-r border-white/10 bg-[#121212] overflow-y-auto">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Car className="w-6 h-6 text-black" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">ADVENTURE</h1>
          </div>
          <p className="text-xs text-white/50 uppercase tracking-widest font-medium">Car Rentals Dubai</p>
        </div>

        <div className="p-6 space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Car className="w-4 h-4" /> Our Fleet
            </h2>
            <div className="space-y-4">
              {FLEET.map((car) => (
                <div key={car.name} className="group relative overflow-hidden rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/50 transition-all">
                  <img 
                    src={car.image} 
                    alt={car.name} 
                    className="w-full h-24 object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                    referrerPolicy="no-referrer"
                  />
                  <div className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-sm">{car.name}</h3>
                        <p className="text-xs text-white/40">{car.type}</p>
                      </div>
                      <span className="text-emerald-400 text-xs font-bold">{car.price}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" /> Quick Info
            </h2>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3 text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>AED 3,000 Refundable Deposit</span>
              </li>
              <li className="flex items-start gap-3 text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>200km/day included</span>
              </li>
              <li className="flex items-start gap-3 text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>Min. Age: 21 Years</span>
              </li>
            </ul>
          </section>

          <section className="pt-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <MapPin className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Location</span>
              </div>
              <p className="text-sm text-white/80">Business Bay, Downtown Dubai</p>
            </div>
          </section>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 z-40 lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-72 bg-[#121212] z-50 lg:hidden overflow-y-auto"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Car className="w-6 h-6 text-emerald-500" />
                  <h1 className="text-lg font-bold">ADVENTURE</h1>
                </div>
                <button onClick={() => setIsSidebarOpen(false)}>
                  <X className="w-6 h-6" />
                </button>
              </div>
              {/* Same content as desktop sidebar */}
              <div className="p-6 space-y-8">
                <section>
                  <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Our Fleet</h2>
                  <div className="space-y-4">
                    {FLEET.map((car) => (
                      <div key={car.name} className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-medium text-sm">{car.name}</h3>
                            <p className="text-xs text-white/40">{car.type}</p>
                          </div>
                          <span className="text-emerald-400 text-xs font-bold">{car.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Contact</h2>
                  <div className="space-y-3 text-sm text-white/70">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-emerald-500" />
                      <span>+971 52 343 5089</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-500" />
                      <span>Business Bay, Dubai</span>
                    </div>
                  </div>
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/5 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <User className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0a0a0a] rounded-full"></div>
              </div>
              <div>
                <h2 className="font-semibold text-sm">Natalia</h2>
                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Online Assistant</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <a 
              href="https://wa.me/971523435089" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-full text-xs font-bold transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Us
            </a>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] sm:max-w-[70%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                  msg.role === 'user' 
                    ? 'bg-white/10 border-white/20' 
                    : 'bg-emerald-500/10 border-emerald-500/20'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <User className="w-4 h-4 text-emerald-500" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-emerald-500 text-black font-medium rounded-tr-none' 
                    : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'
                }`}>
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                  <div className={`text-[10px] mt-2 opacity-40 ${msg.role === 'user' ? 'text-black/60' : 'text-white/60'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none flex gap-1">
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-[#0a0a0a] to-transparent">
          <form 
            onSubmit={handleSend}
            className="max-w-4xl mx-auto relative group"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cars, prices, or documents..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all text-sm"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-white/10 disabled:text-white/20 text-black rounded-xl transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-[10px] text-white/30 mt-4 uppercase tracking-widest">
            Adventure Car Rentals Dubai • Customer Support
          </p>
        </div>
      </main>
    </div>
  );
}
