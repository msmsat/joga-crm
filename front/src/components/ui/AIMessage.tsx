import { Children, isValidElement, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIChart } from './AIChart';
import { parseChartSpec, type AIChartSpec } from './aiChartSpec';
import { stableMarkdown } from './stableMarkdown';

export interface AIMessageProps {
  /** Текст ответа модели как есть — тот же, что лежит в БД. */
  text: string;
  /** Дровер: график ужимается и теряет легенду — панель 320-420px. */
  compact?: boolean;
  /** Ответ ещё дописывается: незакрытые блоки держим текстом, чтобы не мигало. */
  streaming?: boolean;
}

// Огороженный блок ```velora-chart — единственный способ, которым модель
// «рисует»: она отдаёт данные, а не разметку (решение 1 эпика AI-6). Всё, что
// не разобралось, остаётся обычным блоком кода.
function chartSpecOf(children: ReactNode): AIChartSpec | null {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  if (!child.props.className?.includes('language-velora-chart')) return null;
  return parseChartSpec(String(child.props.children ?? ''));
}

// Рендер ответа ассистента (эпик AI-6, задача 1). Один компонент на обе
// поверхности ИИ — страницу AI и дровер: два одинаковых рендера разъехались бы
// в оформлении на первой же правке.
//
// rehype-raw намеренно НЕ подключён: без него HTML внутри ответа остаётся
// текстом и выполниться не может. Текст в пузырь приходит от внешней модели, а
// через неё — от клиента студии из директа (решение 2 эпика).
export function AIMessage({ text, compact = false, streaming = false }: AIMessageProps) {
  return (
    <div className="v-ai-md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Ссылка ведёт только наружу и только новой вкладкой: markdown-ссылка
          // внутрь приложения ушла бы мимо роутера и потеряла бы стейт.
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          ),
          // Таблица скроллится внутри собственной обёртки: пузырь в дровере
          // ~320px, и пять колонок иначе растянут панель и сломают раскладку.
          table: ({ children }) => (
            <div className="v-ai-md-table"><table>{children}</table></div>
          ),
          pre: ({ children }) => {
            const spec = chartSpecOf(children);
            return spec ? <AIChart spec={spec} compact={compact} /> : <pre>{children}</pre>;
          },
        }}
      >
        {stableMarkdown(text, streaming)}
      </Markdown>
    </div>
  );
}
