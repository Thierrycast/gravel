"use client";

import { useState } from "react";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { useVoiceSession, VoiceStage, setVoicePalette } from "voice-kit";

setVoicePalette({
  listening: [0.20, 0.58, 1.00], // azul
  speaking: [1.00, 0.84, 0.00],  // gold/yellow (brand fintech)
  thinking: [0.60, 0.38, 0.94],
});

export default function GravelChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const voice = useVoiceSession({
    endpoint: { baseUrl: "http://<servidor>:8010", apiKey: "" },
    streamingUrl: "ws://<servidor>:8010/stt/stream",
    models: { transcription: "whisper", speech: "tts-1" },
    voice: "piper:pt_BR-cadu-medium",
    onTranscript: (text) => {
      if (text.trim()) {
        void sendMessage(text);
      }
    }
  });

  const sendMessage = async (text: string) => {
    if (!text.trim() || pending) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      const content = data.message || "Erro de resposta.";
      setMessages((prev) => [...prev, { role: "assistant", content }]);
      voice.speak(content);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Erro de conexão." }]);
      voice.speak("Erro de conexão.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[600px] w-full max-w-4xl mx-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden relative shadow-sm">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <Sparkles className="text-yellow-500" size={20} />
        <h1 className="font-semibold">Gravel Assistant</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-none' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-bl-none'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-zinc-500 animate-pulse">
              Processando análise financeira...
            </div>
          </div>
        )}
      </div>

      <VoiceStage
        state={voice.state}
        metricsRef={voice.metricsRef}
        visual="particle-orb"
        focused={voice.open}
        transcript={voice.partial}
        muted={voice.muted}
        onToggleFocus={() => voice.open ? voice.stop() : voice.start()}
        onToggleMute={voice.toggleMute}
        onClose={voice.stop}
      />

      <form className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); sendMessage(draft); }}>
        <button
          type="button"
          onClick={() => voice.open ? voice.stop() : voice.start()}
          className={`shrink-0 h-11 w-11 flex items-center justify-center rounded-xl transition-colors ${voice.open ? "bg-red-500 text-white" : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Diga algo sobre suas finanças..."
          className="flex-1 max-h-32 min-h-[44px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/50 resize-none"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(draft);
            }
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || pending}
          className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
