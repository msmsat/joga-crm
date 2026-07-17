import { useState, useEffect } from 'react'
import { studioApi } from '../../../../api/studio/studio.api'
import type { BranchListItem, BranchDetail, BranchCreate, BranchUpdate, HallCreate, HallUpdate } from '../../../../api/studio/studio.types'
import { servicesApi } from '../../../../api/studio/services.api'
import type { ServiceRead, ServiceCreate, ServiceUpdate } from '../../../../api/studio/services.api'
import type { Service } from '../types'

// Бэкенд диктует структуру (ServiceRead); UI-поля вычисляем здесь на лету.
function toUiService(s: ServiceRead): Service {
  return {
    id: s.id,
    name: s.name,
    category: s.category ?? '—',
    type: s.service_type === 'individual' ? 'individual' : 'group',
    duration_min: s.duration_min,
    price: s.price,
    color: s.color ?? '#FCAE91',
    description: s.description ?? '',
    max_clients: s.max_clients ?? undefined,
    bookings_total: s.bookings_count,
    revenue_total: s.revenue_total,
    schedule: [], // бэкенд не хранит слоты расписания услуги (вне Эпика 1)
  }
}

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

  const updateBranch = async (branchId: number, data: BranchUpdate) => {
    await studioApi.updateBranch(branchId, data)
    await refetch()
  }

  const deleteBranch = async (branchId: number) => {
    await studioApi.deleteBranch(branchId)
    await refetch()
  }

  return { studios, isLoading, refetch, createBranch, updateBranch, deleteBranch }
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

  const createHall = async (data: HallCreate) => {
    if (!branchId) return
    await studioApi.createHall(branchId, data)
    await refetch()
  }

  const updateHall = async (hallId: number, data: HallUpdate) => {
    await studioApi.updateHall(hallId, data)
    await refetch()
  }

  const deleteHall = async (hallId: number) => {
    await studioApi.deleteHall(hallId)
    await refetch()
  }

  return { branch, isLoading, refetch, createHall, updateHall, deleteHall }
}

export function useServiceList() {
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = async () => {
    setIsLoading(true)
    try {
      const response = await servicesApi.list()
      setServices(response.map(toUiService))
    } catch (error) {
      console.error('Ошибка при загрузке услуг:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refetch()
  }, [])

  const createService = async (data: ServiceCreate) => {
    await servicesApi.create(data)
    await refetch()
  }

  const updateService = async (serviceId: number, data: ServiceUpdate) => {
    await servicesApi.update(serviceId, data)
    await refetch()
  }

  const deleteService = async (serviceId: number) => {
    await servicesApi.delete(serviceId)
    await refetch()
  }

  return { services, isLoading, refetch, createService, updateService, deleteService }
}