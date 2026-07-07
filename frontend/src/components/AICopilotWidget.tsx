import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Bot, X, Trash2, Send, Sun, Moon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AICopilotWidget: React.FC = () => {
  const { session } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const defaultWelcome: Message = {
    role: 'assistant',
    content: "Hi! I am **Dyno**, your ThrustVault propulsion and drone engineering copilot. 🤖🛫\n\nAsk me anything about motor specifications, stator sizing, KV ratings, propeller matchups, ESC telemetry, or battery safety!"
  };

  // Load chat history from sessionStorage
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dyno_chat_history');
      if (cached) {
        setMessages(JSON.parse(cached));
      } else {
        setMessages([defaultWelcome]);
      }
    } catch (e) {
      setMessages([defaultWelcome]);
    }
  }, []);

  // Save chat history to sessionStorage
  const saveAndSetMessages = (newMessages: Message[]) => {
    setMessages(newMessages);
    try {
      sessionStorage.setItem('dyno_chat_history', JSON.stringify(newMessages));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    saveAndSetMessages(updatedMessages);
    setInputValue('');
    setIsTyping(true);

    try {
      // Clean context for api request
      const cleanContext = updatedMessages.filter(m => m.content !== defaultWelcome.content);

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: cleanContext })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = data.reply || 'Sorry, I encountered an empty reply. Please try again.';

      saveAndSetMessages([...updatedMessages, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      console.error(err);
      saveAndSetMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: `⚠️ **Connection Error:** Failed to consult Dyno core database. (${err.message}). Ensure your Groq keys are configured correctly.`
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear Dyno conversation history?')) {
      saveAndSetMessages([defaultWelcome]);
    }
  };

  // Helper to open details from links
  const handleLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const linkAction = target.closest('a[data-action]');
    if (linkAction) {
      e.preventDefault();
      const action = linkAction.getAttribute('data-action');
      const url = linkAction.getAttribute('data-url') || '';
      const matchId = url.match(/id=([^&]+)/);
      if (matchId && matchId[1]) {
        const id = matchId[1];
        if (action === 'open-motor') {
          if (location.pathname === '/dashboard') {
            const ev = new CustomEvent('open-motor-details', { detail: id });
            window.dispatchEvent(ev);
          } else {
            navigate(`/dashboard?motorId=${id}`);
          }
        } else if (action === 'open-esc') {
          navigate(`/escs?escId=${id}`);
        } else if (action === 'open-propeller') {
          navigate(`/propellers?propId=${id}`);
        }
        setIsOpen(false); // Close AI panel on navigation
      }
    }
  };

  const suggestions = [
    "Suggest a motor for 6S payload",
    "Is there a 40A Hobbywing ESC?",
    "Show APC 15 inch props",
    "How do I match prop and KV?"
  ];

  const formatMessageContent = (content: string) => {
    return content
      .split('\n\n')
      .map((paragraph, pIdx) => {
        const formatted = paragraph
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`([^`\n]+)`/g, '<code class="bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            if (url.startsWith('thrustvault://')) {
              const action = url.includes('open-motor') ? 'open-motor' : url.includes('open-esc') ? 'open-esc' : 'open-propeller';
              return `<a href="#" data-action="${action}" data-url="${url}" class="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-0.5">${text}</a>`;
            }
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline font-semibold">${text}</a>`;
          });
        return <p key={pIdx} className="mb-2 last:mb-0" dangerouslySetInnerHTML={{ __html: formatted }} />;
      });
  };

  if (!session) return null; // Only show for logged in users

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-tr from-[#003366] to-blue-600 hover:from-[#001e40] hover:to-blue-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/20 cursor-pointer"
        title="Chat with Dyno Copilot"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6 animate-pulse" />}
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div 
          onClick={handleLinkClick}
          className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[95vw] md:w-[500px] h-[640px] max-h-[80vh] bg-white/95 dark:bg-[#0c101a]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-250 z-[9999]"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#003366] to-[#001e40] text-white flex justify-between items-center border-b border-blue-900/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                <Bot className="w-5 h-5 text-blue-200" />
              </div>
              <div>
                <div className="font-bold text-sm leading-tight flex items-center gap-1.5 font-display tracking-wide">
                  Dyno <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                </div>
                <span className="text-[10px] text-slate-300 font-medium uppercase tracking-wider font-mono">Propulsion Copilot</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={handleClearHistory} 
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-350 hover:text-white transition-colors cursor-pointer"
                title="Clear chat history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-350 hover:text-white transition-colors cursor-pointer"
                title="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Viewport */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 dark:bg-[#070b13]/40 dyno-scrollbar">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full items-start gap-2.5`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-none font-medium'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/50 dark:border-slate-700/50'
                  }`}>
                    {formatMessageContent(msg.content)}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex justify-start w-full items-center gap-2.5">
                <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1 border border-slate-200/50 dark:border-slate-700/50">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className="px-5 py-2 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/40 flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-none">
            {suggestions.map((text, idx) => (
              <button 
                key={idx}
                onClick={() => handleSendMessage(text)}
                className="text-[10px] font-semibold text-[#003366] dark:text-blue-400 bg-blue-50/70 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-900/30 border border-blue-100/50 dark:border-blue-900/30 px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer"
              >
                {text}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }} 
            className="p-4 bg-white dark:bg-[#0c101a] border-t border-slate-200/80 dark:border-slate-800/80 flex gap-2 items-center"
          >
            <input 
              type="text" 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Ask Dyno about UAV motors, ESCs, props..." 
              className="flex-1 bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20"
              autoComplete="off"
              required
            />
            <button 
              type="submit" 
              className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center shadow-md transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
