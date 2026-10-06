import { useOutletContext } from 'react-router-dom';
import type { Application } from '@/db/types';

export interface AppContext {
  app: Application;
}

export const useAppContext = () => useOutletContext<AppContext>();
