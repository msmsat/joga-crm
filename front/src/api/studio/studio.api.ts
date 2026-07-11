import { client } from '../client'
import type { StudioRead, StudioUpdate, UploadLogoResponse, BranchCreate, BranchListItem, BranchDetail } from './studio.types'

export const studioApi = {
  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.postForm<UploadLogoResponse>('/studio/upload-logo', form)
  },

  uploadBranchPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.postForm<UploadLogoResponse>('/studio/upload-branch-photo', form)
  },

  get: () =>
    client.get<StudioRead>('/studio'),

  update: (payload: StudioUpdate) =>
    client.patch<StudioRead>('/studio', payload),

  getBranches: () =>
    client.get<BranchListItem[]>('/studio/branches'),

  getBranch: (branchId: number) =>
    client.get<BranchDetail>(`/studio/branches/${branchId}`),

  createBranch: (data: BranchCreate) =>
    client.post<BranchListItem>('/studio/branches', data),
}
