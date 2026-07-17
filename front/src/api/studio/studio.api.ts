import { client } from '../client'
import type { StudioRead, StudioUpdate, UploadLogoResponse, BranchCreate, BranchUpdate, BranchListItem, BranchDetail, HallBrief, HallCreate, HallUpdate } from './studio.types'

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

  uploadStaffPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.postForm<UploadLogoResponse>('/studio/upload-staff-photo', form)
  },

  uploadHallPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.postForm<UploadLogoResponse>('/studio/upload-hall-photo', form)
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

  updateBranch: (branchId: number, data: BranchUpdate) =>
    client.patch<BranchListItem>(`/studio/branches/${branchId}`, data),

  deleteBranch: (branchId: number) =>
    client.delete<void>(`/studio/branches/${branchId}`),

  createHall: (branchId: number, data: HallCreate) =>
    client.post<HallBrief>(`/studio/branches/${branchId}/halls`, data),

  updateHall: (hallId: number, data: HallUpdate) =>
    client.patch<HallBrief>(`/studio/halls/${hallId}`, data),

  deleteHall: (hallId: number) =>
    client.delete<void>(`/studio/halls/${hallId}`),
}
