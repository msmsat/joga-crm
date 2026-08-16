import { useEffect, useRef } from 'react';
import { useAssistant, type AISurface } from '../../../hooks/useAssistant';

// Тонкая обёртка над useAssistant (эпик AI-1, задача 7): дровер добавляет
// только свой UI-скролл, вся история/отправка/сессии — из общего хука.
// surface прокидывается наружу: страница AI собрана из тех же компонентов,
// но открытый чат у неё свой.
export function useDrawerChat(surface: AISurface = 'drawer') {
  const assistant = useAssistant(surface);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Плавно — только на новом пузыре. Во время стрима текст дописывается по
  // токену десятки раз в секунду, и smooth-скролл перезапускался бы на каждом:
  // лента дёргалась вместо того, чтобы ехать.
  const count = assistant.messages.length;
  const lastText = assistant.messages[count - 1]?.text ?? '';
  const countRef = useRef(count);
  useEffect(() => {
    const grew = count !== countRef.current;
    countRef.current = count;
    messagesEndRef.current?.scrollIntoView({ behavior: grew ? 'smooth' : 'auto', block: 'end' });
  }, [count, lastText, assistant.isThinking]);

  return { ...assistant, messagesEndRef };
}
