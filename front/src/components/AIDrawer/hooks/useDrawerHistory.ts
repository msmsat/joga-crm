import { useAIDrawer } from '../../../contexts/AIDrawerContext';

export function useDrawerHistory() {
  const { showHistory, enterHistory, exitHistory } = useAIDrawer();
  return { showHistory, enterHistory, exitHistory };
}
