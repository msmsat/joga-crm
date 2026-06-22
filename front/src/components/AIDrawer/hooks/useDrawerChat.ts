import { useState, useCallback, useRef } from 'react';
import type { DrawerMessage, DrawerSession } from '../types';
import { MOCK_DRAWER_RESPONSES, MOCK_DRAWER_SESSIONS } from '../constants';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useDrawerChat() {
  const [messages, setMessages] = useState<DrawerMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DrawerSession[]>(MOCK_DRAWER_SESSIONS);

  const thinkingRef = useRef<number | null>(null);
  const typingRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = () => {
    if (thinkingRef.current) window.clearTimeout(thinkingRef.current);
    if (typingRef.current) window.clearInterval(typingRef.current);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const typewrite = useCallback((msgId: string, fullText: string) => {
    let i = 0;
    typingRef.current = window.setInterval(() => {
      i += 4;
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, text: fullText.slice(0, i), status: 'typing' as const } : m)
      );
      if (i >= fullText.length) {
        window.clearInterval(typingRef.current!);
        setMessages(prev =>
          prev.map(m => m.id === msgId ? { ...m, text: fullText, status: 'done' as const } : m)
        );
        scrollToBottom();
      }
    }, 18);
  }, []);

  const sendMessage = useCallback((text: string) => {
    clearTimers();

    const userMsg: DrawerMessage = {
      id: genId(),
      role: 'user',
      text,
      timestamp: new Date(),
      status: 'done',
    };
    const aiId = genId();
    const aiMsg: DrawerMessage = {
      id: aiId,
      role: 'ai',
      text: '',
      timestamp: new Date(),
      status: 'thinking',
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setIsThinking(true);
    setTimeout(scrollToBottom, 50);

    if (!activeSessionId) {
      const newSession: DrawerSession = {
        id: genId(),
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
      const answer = MOCK_DRAWER_RESPONSES[Math.floor(Math.random() * MOCK_DRAWER_RESPONSES.length)];
      typewrite(aiId, answer);
    }, 1200 + Math.random() * 600);
  }, [activeSessionId, typewrite]);

  const newChat = useCallback(() => {
    clearTimers();
    setMessages([]);
    setActiveSessionId(null);
    setIsThinking(false);
  }, []);

  const loadSession = useCallback((sessionId: string) => {
    clearTimers();
    setActiveSessionId(sessionId);
    setIsThinking(false);
    const session = MOCK_DRAWER_SESSIONS.find(s => s.id === sessionId);
    setMessages([
      {
        id: genId(),
        role: 'user',
        text: session?.preview ?? '',
        timestamp: new Date(Date.now() - 1000 * 60 * 10),
        status: 'done',
      },
      {
        id: genId(),
        role: 'ai',
        text: 'Это загруженный чат из истории. В реальном сценарии здесь отобразятся все сообщения из базы данных.',
        timestamp: new Date(Date.now() - 1000 * 60 * 9),
        status: 'done',
      },
    ]);
  }, []);

  const cleanup = useCallback(() => {
    clearTimers();
  }, []);

  return {
    messages,
    isThinking,
    sessions,
    activeSessionId,
    messagesEndRef,
    sendMessage,
    newChat,
    loadSession,
    cleanup,
  };
}
