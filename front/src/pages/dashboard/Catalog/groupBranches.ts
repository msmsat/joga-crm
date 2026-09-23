import type { BranchListItem } from '../../../api/studio/studio.types';

export function groupBranches(studios: BranchListItem[]) {
  const countries = [...new Set(studios.map(s => s.country).filter((c): c is string => Boolean(c)))];
  const field = countries.length > 1 ? 'country' : 'city';
  // Onboarding collects a free-form address, so its first branch may have no
  // separate city/country. Keep it visible in an unlabelled group.
  const labels = [...new Set(studios.map(s => s[field] || ''))];
  return labels.map(label => ({ label, items: studios.filter(s => (s[field] || '') === label) }));
}
