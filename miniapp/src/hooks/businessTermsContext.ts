import { createContext } from 'react';
import type { Terminology } from '../api/hybrid.types';

export const BusinessTermsContext = createContext<Terminology | null>(null);
