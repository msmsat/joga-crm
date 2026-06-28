import { useState, useCallback, useRef } from 'react';
import type { Message, ChatSession } from '../types';
import { MOCK_AI_RESPONSES, MOCK_SESSIONS } from '../constants';

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 10000);
}

export function useAIChat() {
  const [sessions, setSessions] = useState<ChatSession[]>(MOCK_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const thinkingRef = useRef<number | null>(null);
  const typingRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (thinkingRef.current) window.clearTimeout(thinkingRef.current);
    if (typingRef.current) window.clearInterval(typingRef.current);
  };

  const typewriteMessage = useCallback((msgId: number, fullText: string, onDone: () => void) => {
    let i = 0;
    typingRef.current = window.setInterval(() => {
      i += 4;
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId ? { ...m, text: fullText.slice(0, i), status: 'typing' as const } : m
        )
      );
      if (i >= fullText.length) {
        window.clearInterval(typingRef.current!);
        setMessages(prev =>
          prev.map(m =>
            m.id === msgId ? { ...m, text: fullText, status: 'done' as const } : m
          )
        );
        onDone();
      }
    }, 18);
  }, []);

  const sendMessage = useCallback((text: string) => {
    clearTimers();

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      text,
      timestamp: new Date(),
      status: 'done',
    };

    const aiMsgId = generateId();
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      status: 'thinking',
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setIsThinking(true);

    if (!activeSessionId) {
      const newSession: ChatSession = {
        id: generateId(),
        title: text.slice(0, 40),
        preview: text,
        timestamp: new Date(),
        messageCount: 1,
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    }

    thinkingRef.current = window.setTimeout(() => {
      setIsThinking(false);
      const answer = MOCK_AI_RESPONSES[Math.floor(Math.random() * MOCK_AI_RESPONSES.length)];
      typewriteMessage(aiMsgId, answer, () => {});
    }, 1200 + Math.random() * 600);
  }, [activeSessionId, typewriteMessage]);

  const newChat = useCallback(() => {
    clearTimers();
    setMessages([]);
    setActiveSessionId(null);
    setIsThinking(false);
  }, []);

  const loadSession = useCallback((sessionId: number) => {
    clearTimers();
    setActiveSessionId(sessionId);
    setIsThinking(false);
    setMessages([
      {
        id: generateId(),
        role: 'user',
        text: MOCK_SESSIONS.find(s => s.id === sessionId)?.preview ?? '',
        timestamp: new Date(Date.now() - 1000 * 60 * 10),
        status: 'done',
      },
      {
        id: generateId(),
        role: 'assistant',
        text: 'Это загруженная сессия из истории. В реальном сценарии здесь будут все сообщения из базы данных.',
        timestamp: new Date(Date.now() - 1000 * 60 * 9),
        status: 'done',
      },
    ]);
  }, []);

  return { sessions, activeSessionId, messages, isThinking, sendMessage, newChat, loadSession };
}
