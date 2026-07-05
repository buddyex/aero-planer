import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { HttpDataApi } from '../../adapters/HttpDataApi';
import type { DataApi } from '../../shared/api/DataApi';

const ApiContext = createContext<DataApi | null>(null);

export function ApiProvider({
  children,
  api,
}: {
  children: ReactNode;
  api?: DataApi;
}) {
  const value = useMemo(() => (api ?? new HttpDataApi()) as DataApi, [api]);
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): DataApi {
  const ctx = useContext(ApiContext);
  if (!ctx) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return ctx;
}
