/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQueryClient } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import { Button, Modal } from 'antd'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'

import { pullTaskLogsFromUpstream } from '../lib/pull-from-upstream'
import type { TaskLog } from '../types'

export function TaskLogsBulkActions<TData>({
  table,
}: {
  table: Table<TData>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pulling, setPulling] = useState(false)
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedLogs = selectedRows.map((row) => row.original as TaskLog)

  const handlePull = () => {
    if (selectedLogs.length === 0 || pulling) return
    Modal.confirm({
      title: t('Pull selected from upstream'),
      content: t(
        'Pull the selected non-settled tasks from upstream and create any missing generation assets. Success and failure tasks are skipped.'
      ),
      okText: t('Pull from upstream'),
      cancelText: t('Cancel'),
      onOk: async () => {
        setPulling(true)
        try {
          const result = await pullTaskLogsFromUpstream(selectedLogs)
          await queryClient.invalidateQueries({ queryKey: ['logs'] })
          if (result.queueSize === 0) {
            toast.message(
              result.skippedSettled > 0
                ? t('Skipped {{count}} settled tasks (success/failure)', {
                    count: result.skippedSettled,
                  })
                : t('No tasks to pull')
            )
            return
          }
          toast.success(
            t(
              'Pulled {{fetched}} tasks from upstream, created {{created}} generation assets',
              { fetched: result.fetched, created: result.created }
            )
          )
          if (result.skippedSettled > 0) {
            toast.message(
              t('Skipped {{count}} settled tasks (success/failure)', {
                count: result.skippedSettled,
              })
            )
          }
          if (result.failed > 0) {
            toast.error(t('{{failed}} tasks failed to pull', { failed: result.failed }))
          }
          table.resetRowSelection()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('Pull failed'))
        } finally {
          setPulling(false)
        }
      },
    })
  }

  return (
    <BulkActionsToolbar table={table} entityName='task'>
      <Button
        type='primary'
        size='small'
        loading={pulling}
        icon={pulling ? undefined : <RefreshCw className='size-3.5' />}
        onClick={handlePull}
      >
        {t('Pull from upstream')}
      </Button>
    </BulkActionsToolbar>
  )
}
