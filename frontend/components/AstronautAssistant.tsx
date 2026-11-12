'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Mic, Send, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../lib/api';

interface Msg { who: 'me' | 'ai'; text: string; src?: 'local' | 'llm' }

const QUICK = ['Slope here?', 'Hazard near me?', 'Oxygen?', 'How far to go?', 'Which data is real?'];

/** Ask while walking. Answers come from the live terrain values + route (short on purpose). Mic and voice are optional. */
export const AstronautAssistant: React.FC<{ context: Record<string, unknown>; onClick?: () => void }> = ({ context, onClick }) => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ who: 'ai', text: 'Ask me about slope, hazards, oxygen or the route.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const say = (t: string) => {
    if (!speak || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(t));
  };
  const ask = async (q: string) => {
    const msg = q.trim();
    if (!msg || busy) return;
    setText('');
    setMsgs((m) => [...m, { who: 'me', text: msg }]);
    setBusy(true);
    try {
      const r = await api.chat(msg, context);
      setMsgs((m) => [...m, { who: 'ai', text: r.reply, src: r.source }]);
      say(r.reply);
    } catch {
      setMsgs((m) => [...m, { who: 'ai', text: 'No link to the backend.' }]);
    } finally { setBusy(false); }
  };
  const mic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMsgs((m) => [...m, { who: 'ai', text: 'Voice input is not supported in this browser. Type instead.' }]); return; }
    const r = new SR();
    r.lang = 'en-US';
    r.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => { setListening(false); void ask(e.results[0][0].transcript); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  };

  return (
    <div className="absolute left-5 bottom-[224px] z-30 pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
      {open && (
        <div className="mb-2 flex h-80 w-80 flex-col rounded-xl border border-cyan-400/35 bg-slate-950/92 shadow-2xl backdrop-blur-xl" role="dialog" aria-label="Astronaut assistant">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-[10px] tracking-widest text-cyan-200">
            <span>RED·NAV ASSISTANT</span>
            <span className="flex items-center gap-1">
              <button onClick={() => setSpeak(!speak)} aria-label="Speak answers" aria-pressed={speak} className="rounded p-1 hover:bg-white/10">{speak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-white/50" />}</button>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-xs">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[88%] rounded-lg px-2.5 py-1.5 ${m.who === 'me' ? 'ml-auto bg-cyan-600/40' : 'bg-white/8 border border-white/10'}`}>{m.text}</div>
            ))}
            {busy && <div className="font-mono text-[10px] text-white/50">…</div>}
            <div ref={end} />
          </div>
          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {QUICK.map((q) => <button key={q} onClick={() => ask(q)} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] hover:border-cyan-400/60">{q}</button>)}
          </div>
          <form className="flex items-center gap-1.5 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
            <button type="button" onClick={mic} aria-label="Speak a question" className={`rounded p-1.5 ${listening ? 'animate-pulse bg-red-500/60' : 'bg-white/10 hover:bg-white/20'}`}><Mic className="h-3.5 w-3.5" /></button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask…" className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1.5 text-xs outline-none placeholder:text-white/40" />
            <button type="submit" aria-label="Send" disabled={busy} className="rounded bg-cyan-600/70 p-1.5 hover:bg-cyan-500 disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
          </form>
        </div>
      )}
      <button onClick={() => { onClick?.(); setOpen(!open); }} aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-cyan-500/35 bg-slate-950/75 px-3 py-2 text-white backdrop-blur-xl transition-all hover:border-cyan-400/70 active:scale-95">
        <Bot className="h-3.5 w-3.5 text-cyan-300" /><span className="font-mono text-[11px] font-bold tracking-wider text-cyan-200">ASK</span>
      </button>
    </div>
  );
};
