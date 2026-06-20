// src/components/AiChat.tsx
import React, { useState, useRef, useEffect } from 'react';
import * as Icons from '../../../../components/Icons';

interface AiChatProps {
  setAiOpen: (v: boolean) => void;
}

export const AiChat: React.FC<AiChatProps> = ({ setAiOpen }) => {
  // Локальные стейты чата (теперь они живут только здесь!)
  const [aiMessages, setAiMessages] = useState([
    { role: 'ai', text: 'Привет! ✨ Я ваш умный ассистент Velora. Могу помочь с анализом расписания, поиском «окон» или статистикой тренеров. Что вас интересует?' }
  ]);
  const [aiInput, setAiInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Автоскролл
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // Обработка отправки
  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    
    setAiMessages(prev => [...prev, { role: 'user', text: aiInput }]);
    setAiInput('');
    
    // Имитация ответа
    setTimeout(() => {
      setAiMessages(prev => [...prev, { 
        role: 'ai', 
        text: 'Пока я работаю в демо-режиме 🤖 Скоро я научусь выполнять реальные команды, например: "перенеси Пилатес на час позже" или "кто самый загруженный тренер сегодня?".' 
      }]);
    }, 800);
  };

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(123,108,212,0.1)', color: '#7B6CD4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--onyx)' }}>AI Ассистент</div>
        </div>
        <button className="btn-icon" style={{ width: 32, height: 32 }} onClick={() => setAiOpen(false)}>
          <Icons.X />
        </button>
      </div>
      
      <div className="ai-chat-body">
        {aiMessages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="ai-chat-input-wrap">
        <form className="ai-input-box" onSubmit={handleAiSubmit}>
          <input 
            className="ai-input-field" 
            placeholder="Спросите что-нибудь..." 
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
          />
          <button type="submit" className="ai-send-btn" disabled={!aiInput.trim()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};