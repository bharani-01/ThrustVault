// public/ai_copilot.js
// Dyno - ThrustVault AI Propulsion Copilot Widget
(function() {
    'use strict';

    // Inject custom CSS styling for Dyno widget animations and scrollbar
    const style = document.createElement('style');
    style.id = 'dyno-copilot-styles';
    style.innerHTML = `
        @keyframes dyno-slide-in {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dyno-pulse-glow {
            0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
            50% { box-shadow: 0 0 15px 4px rgba(37, 99, 235, 0.2); }
        }
        @keyframes dyno-typing-bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
        }
        .dyno-window-animate {
            animation: dyno-slide-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .dyno-pulse-animate {
            animation: dyno-pulse-glow 2.5s infinite ease-in-out;
        }
        .dyno-typing-dot {
            width: 6px;
            height: 6px;
            background-color: #94a3b8;
            border-radius: 50%;
            display: inline-block;
            animation: dyno-typing-bounce 1s infinite ease-in-out;
        }
        .dyno-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .dyno-typing-dot:nth-child(3) { animation-delay: 0.4s; }
        
        /* Custom scrollbar for message body */
        .dyno-scrollbar::-webkit-scrollbar {
            width: 5px;
        }
        .dyno-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .dyno-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.3);
            border-radius: 999px;
        }
        .dyno-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(148, 163, 184, 0.5);
        }
    `;
    document.head.appendChild(style);

    // Initial state setup
    const defaultWelcome = {
        role: 'assistant',
        content: "Hi! I am **Dyno**, your ThrustVault propulsion and drone engineering copilot. 🤖🛫\n\nAsk me anything about motor specifications, stator sizing, KV ratings, propeller matchups, ESC telemetry, or battery safety!"
    };

    let chatHistory = [];
    try {
        const cached = sessionStorage.getItem('dyno_chat_history');
        if (cached) {
            chatHistory = JSON.parse(cached);
        } else {
            chatHistory = [defaultWelcome];
        }
    } catch(e) {
        chatHistory = [defaultWelcome];
    }

    // Default suggestion questions for UAV engineering
    const suggestions = [
        "Suggest a motor for 6S payload",
        "Explain stator class sizes",
        "How do I match prop and KV?",
        "ESC safety calculations"
    ];

    // Build trigger button UI
    const trigger = document.createElement('button');
    trigger.id = 'dyno-trigger';
    trigger.className = 'fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-tr from-[#003366] to-blue-600 hover:from-[#001e40] hover:to-blue-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/20 dyno-pulse-animate';
    trigger.title = 'Chat with Dyno';
    trigger.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot">
            <path d="M12 8V4H8"/>
            <rect width="16" height="12" x="4" y="8" rx="2"/>
            <path d="M2 14h2"/>
            <path d="M20 14h2"/>
            <path d="M15 13v2"/>
            <path d="M9 13v2"/>
        </svg>
    `;

    // Build chat panel container
    const panel = document.createElement('div');
    panel.id = 'dyno-panel';
    panel.className = 'fixed bottom-24 right-6 z-50 w-[420px] max-w-[95vw] md:w-[520px] h-[680px] bg-white/95 dark:bg-[#0c101a]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden hidden dyno-window-animate';

    // Panel Header
    const header = document.createElement('div');
    header.className = 'px-5 py-4 bg-gradient-to-r from-[#003366] to-[#001e40] text-white flex justify-between items-center border-b border-blue-900/20';
    header.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-200">
                    <path d="M12 8V4H8"/>
                    <rect width="16" height="12" x="4" y="8" rx="2"/>
                    <path d="M2 14h2"/>
                    <path d="M20 14h2"/>
                    <path d="M15 13v2"/>
                    <path d="M9 13v2"/>
                </svg>
            </div>
            <div>
                <div class="font-bold text-sm leading-tight flex items-center gap-1.5 font-display tracking-wide">
                    Dyno <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                </div>
                <span class="text-[10px] text-slate-300 font-medium uppercase tracking-wider font-label-mono">Propulsion Copilot</span>
            </div>
        </div>
        <div class="flex items-center gap-1.5">
            <button id="dyno-clear-btn" class="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors" title="Clear chat history">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
                </svg>
            </button>
            <button id="dyno-close-btn" class="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors" title="Close Panel">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `;
    panel.appendChild(header);

    // Messages Viewport
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'flex-1 p-5 overflow-y-auto space-y-4 dyno-scrollbar dark:bg-[#070b13]/40';
    panel.appendChild(messagesContainer);

    // Suggestion chips row
    const suggestionsRow = document.createElement('div');
    suggestionsRow.className = 'px-5 py-2.5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/40 flex flex-wrap gap-2 overflow-x-auto whitespace-nowrap scrollbar-none';
    suggestions.forEach(text => {
        const chip = document.createElement('button');
        chip.className = 'text-[11px] font-semibold text-[#003366] dark:text-blue-400 bg-blue-50/70 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-900/30 border border-blue-100/50 dark:border-blue-900/30 px-3 py-1.5 rounded-full transition-all duration-200 whitespace-normal text-left max-w-full';
        chip.textContent = text;
        chip.onclick = () => {
            sendUserMessage(text);
        };
        suggestionsRow.appendChild(chip);
    });
    panel.appendChild(suggestionsRow);

    // Chat Input Form
    const inputArea = document.createElement('form');
    inputArea.className = 'p-4 bg-white dark:bg-[#0c101a] border-t border-slate-200/80 dark:border-slate-800/80 flex gap-2 items-center';
    inputArea.innerHTML = `
        <input type="text" id="dyno-input-field" placeholder="Ask Dyno about UAV motors, ESCs, KV..." class="flex-1 bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20" autocomplete="off" required>
        <button type="submit" class="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-102 active:scale-98">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="transform rotate-45 -translate-x-0.5 translate-y-0.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
        </button>
    `;
    panel.appendChild(inputArea);

    document.body.appendChild(trigger);
    document.body.appendChild(panel);

    // Bind event handlers for trigger toggle
    trigger.onclick = () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            scrollToBottom();
            const inputField = panel.querySelector('#dyno-input-field');
            if (inputField) inputField.focus();
        }
    };

    panel.querySelector('#dyno-close-btn').onclick = (e) => {
        e.preventDefault();
        panel.classList.add('hidden');
    };

    panel.querySelector('#dyno-clear-btn').onclick = (e) => {
        e.preventDefault();
        if (confirm('Clear Dyno conversation history?')) {
            chatHistory = [defaultWelcome];
            sessionStorage.setItem('dyno_chat_history', JSON.stringify(chatHistory));
            renderChatHistory();
        }
    };

    inputArea.onsubmit = (e) => {
        e.preventDefault();
        const inputField = panel.querySelector('#dyno-input-field');
        const text = inputField.value.trim();
        if (text) {
            sendUserMessage(text);
            inputField.value = '';
        }
    };

    // Render logic helper
    function renderChatHistory() {
        messagesContainer.innerHTML = '';
        chatHistory.forEach(msg => {
            const bubble = createBubble(msg.role, msg.content);
            messagesContainer.appendChild(bubble);
        });
        scrollToBottom();
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function createBubble(role, content) {
        const isUser = role === 'user';
        const wrapper = document.createElement('div');
        wrapper.className = `flex ${isUser ? 'justify-end' : 'justify-start'} w-full items-start gap-2.5`;

        // Render markdown-like lists, bold texts, and links safely
        let formattedText = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`\n]+)`/g, '<code class="bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-1 py-0.5 rounded text-xs">$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                if (url.startsWith('thrustvault://')) {
                    return `<a href="#" data-action="open-motor" data-url="${url}" class="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"><i data-lucide="external-link" class="w-3.5 h-3.5 inline-block"></i>${text}</a>`;
                }
                return `<a href="${url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline font-semibold">${text}</a>`;
            })
            .replace(/\n\n/g, '<br/><br/>')
            .replace(/\n/g, '<br/>');

        const bubble = document.createElement('div');
        bubble.className = isUser
            ? 'max-w-[85%] bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-none text-sm font-medium leading-relaxed shadow-sm'
            : 'max-w-[85%] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-4 py-3 rounded-2xl rounded-tl-none text-sm leading-relaxed border border-slate-200/50 dark:border-slate-700/50 shadow-sm';
        
        bubble.innerHTML = formattedText;
        wrapper.appendChild(bubble);

        // Bind clicks on open-motor actions
        bubble.querySelectorAll('a[data-action="open-motor"]').forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = link.dataset.url;
                const match = url.match(/id=([^&]+)/);
                if (match && match[1]) {
                    const motorId = match[1];
                    if (window.openMotorDetails) {
                        window.openMotorDetails(motorId);
                    } else {
                        console.warn('[Dyno Copilot] window.openMotorDetails is not defined.');
                    }
                }
            };
        });

        return wrapper;
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // AI message dispatcher
    async function sendUserMessage(text) {
        // Render user question
        chatHistory.push({ role: 'user', content: text });
        sessionStorage.setItem('dyno_chat_history', JSON.stringify(chatHistory));
        renderChatHistory();

        // Render typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.id = 'dyno-typing-indicator';
        typingIndicator.className = 'flex justify-start w-full items-center gap-2.5';
        typingIndicator.innerHTML = `
            <div class="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1 border border-slate-200/50 dark:border-slate-700/50">
                <span class="dyno-typing-dot"></span>
                <span class="dyno-typing-dot"></span>
                <span class="dyno-typing-dot"></span>
            </div>
        `;
        messagesContainer.appendChild(typingIndicator);
        scrollToBottom();

        // Send payload to backend secure proxy API
        try {
            // Package the context without welcome message or server system prompt
            const cleanContext = chatHistory.filter(msg => msg !== defaultWelcome);

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: cleanContext })
            });

            // Remove typing indicator
            const indicator = messagesContainer.querySelector('#dyno-typing-indicator');
            if (indicator) indicator.remove();

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const reply = data.reply || 'Sorry, I encountered an empty reply. Please try again.';

            // Render and cache response
            chatHistory.push({ role: 'assistant', content: reply });
            sessionStorage.setItem('dyno_chat_history', JSON.stringify(chatHistory));
            renderChatHistory();

        } catch (err) {
            console.error('[Dyno Chat Error]', err);
            const indicator = messagesContainer.querySelector('#dyno-typing-indicator');
            if (indicator) indicator.remove();

            chatHistory.push({
                role: 'assistant',
                content: `⚠️ **Connection Error:** Failed to consult Dyno core database. (${err.message}). Ensure your Groq keys are configured correctly.`
            });
            sessionStorage.setItem('dyno_chat_history', JSON.stringify(chatHistory));
            renderChatHistory();
        }
    }

    // Perform initial render
    renderChatHistory();

})();
