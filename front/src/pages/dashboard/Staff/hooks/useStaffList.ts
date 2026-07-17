import { useState, useEffect } from 'react'
import { staffApi } from '../../../../api/staff'
import type { StaffListResponse, StaffCreate, StaffUpdate } from '../../../../api/staff/staff.types'

export function useStaffList() {
  const [data, setData] = useState<StaffListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = async () => {
    setIsLoading(true)
    try { setData(await staffApi.getList()) }
    finally { setIsLoading(false) }
  }

  useEffect(() => { refetch() }, [])

  const create = async (payload: StaffCreate) => {
    const result = await staffApi.create(payload)
    await refetch()
    return result
  }

  const update = async (id: number, payload: StaffUpdate) => {
    await staffApi.update(id, payload)
    await refetch()
  }

  const deleteStaff = async (id: number) => {
    await staffApi.delete(id)
    await refetch()
  }

  return { summary: data?.summary, rawStaff: data?.staff.items ?? [], isLoading, create, update, deleteStaff }
}
