import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { bumpixApi } from '../../../../api/clients/bumpix.api';
import type { BumpixFilter } from '../../../../api/clients/bumpix.types';
import { queryKeys } from '../../../../api/queryKeys';
import { getActiveContextKey } from '../../../../utils/auth';
import { nextOffset, validatePage } from './model';

export function useBumpixProfiles(clientId: number, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.bumpixProfile(clientId, getActiveContextKey()),
    queryFn: ({ signal }) => bumpixApi.profiles(clientId, signal), enabled, retry: false });
}

export function useBumpixEvents(clientId: number, filter: BumpixFilter) {
  return useInfiniteQuery({ queryKey: queryKeys.bumpixEvents(clientId, filter, getActiveContextKey()),
    queryFn: async ({ pageParam, signal }) => validatePage(await bumpixApi.events(clientId, filter, pageParam, signal), pageParam),
    initialPageParam: 0, getNextPageParam: nextOffset, retry: false });
}
