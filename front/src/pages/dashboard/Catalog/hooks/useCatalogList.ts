import { useState, useEffect } from 'react'
import { studioApi } from '../../../../api/studio/studio.api'
import type { BranchListItem, BranchDetail, BranchCreate } from '../../../../api/studio/studio.types'

export function useStudioList() {
  const [studios, setStudios] = useState<BranchListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = async () => {
    setIsLoading(true)
    try {
      // Вызываем твой метод из API
      const response = await studioApi.getBranches()
      
      setStudios(response)
    } catch (error) {
      console.error('Ошибка при загрузке списка студий:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Автоматически загружаем данные при монтировании (открытии страницы)
  useEffect(() => {
    refetch()
  }, [])

  const createBranch = async (data: BranchCreate): Promise<BranchListItem> => {
    const branch = await studioApi.createBranch(data)
    await refetch()
    return branch
  }

  return { studios, isLoading, refetch, createBranch }
}

export function useBranchDetail(branchId: number | null) {
  const [branch, setBranch] = useState<BranchDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refetch = async () => {
    if (!branchId) return
    setIsLoading(true)
    try {
      const response = await studioApi.getBranch(branchId)
      setBranch(response)
    } catch (error) {
      console.error('Ошибка при загрузке филиала:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refetch()
  }, [branchId])

  return { branch, isLoading, refetch }
}