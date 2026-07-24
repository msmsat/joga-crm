import { useEffect, useRef } from 'react';
import { useAssistant } from '../../../hooks/useAssistant';

// Тонкая обёртка над useAssistant (эпик AI-1, задача 7): дровер добавляет
// только свой UI-скролл, вся история/отправка/сессии — из общего хука.
export function useDrawerChat() {
  const assistant = useAssistant();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistant.messages, assistant.isThinking]);

  return { ...assistant, messagesEndRef };
}
