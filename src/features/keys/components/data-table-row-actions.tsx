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
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  LoadingOutlined,
  MoreOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import type { Row } from '@tanstack/react-table'
import { Button, Dropdown, Tooltip, type MenuProps } from 'antd'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { encodeChannelConnectionInfo } from '@/lib/channel-connection-info'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

import { updateApiKeyStatus } from '../api'
import { API_KEY_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import { apiKeySchema } from '../types'
import { useApiKeys } from './api-keys-provider'

function getServerAddress(): string {
  try {
    const raw = localStorage.getItem('status')
    if (raw) {
      const status = JSON.parse(raw)
      if (status.server_address) return status.server_address as string
    }
  } catch {
    /* empty */
  }
  return window.location.origin
}

type DataTableRowActionsProps<TData> = {
  row: Row<TData>
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const { t } = useTranslation()
  const apiKey = apiKeySchema.parse(row.original)
  const {
    setOpen,
    setCurrentRow,
    triggerRefresh,
    resolveRealKey,
    resolvedKeys,
    loadingKeys,
  } = useApiKeys()
  const isEnabled = apiKey.status === API_KEY_STATUS.ENABLED
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const resolvedRealKey = resolvedKeys[apiKey.id]
  const isRealKeyLoading = Boolean(loadingKeys[apiKey.id])

  const toggleLabel = isEnabled ? t('Disable') : t('Enable')

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open && !resolvedRealKey && !isRealKeyLoading) {
        void resolveRealKey(apiKey.id)
      }
    },
    [apiKey.id, isRealKeyLoading, resolvedRealKey, resolveRealKey]
  )

  const getCachedRealKey = useCallback(() => {
    if (resolvedRealKey) return resolvedRealKey
    void resolveRealKey(apiKey.id)
    toast.info(t('API key is loading, please try again in a moment'))
    return null
  }, [apiKey.id, resolvedRealKey, resolveRealKey, t])

  const handleToggleStatus = async () => {
    const newStatus = isEnabled
      ? API_KEY_STATUS.DISABLED
      : API_KEY_STATUS.ENABLED

    setIsTogglingStatus(true)
    try {
      const result = await updateApiKeyStatus(apiKey.id, newStatus)
      if (result.success) {
        const message = isEnabled
          ? t(SUCCESS_MESSAGES.API_KEY_DISABLED)
          : t(SUCCESS_MESSAGES.API_KEY_ENABLED)
        toast.success(message)
        triggerRefresh()
      } else {
        toast.error(result.message || t(ERROR_MESSAGES.STATUS_UPDATE_FAILED))
      }
    } catch {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsTogglingStatus(false)
    }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'copy-key',
      label: t('Copy Key'),
      icon: <CopyOutlined />,
      onClick: async () => {
        const realKey = getCachedRealKey()
        if (!realKey) return
        const ok = await copyToClipboard(realKey)
        if (ok) toast.success(t('Copied'))
      },
    },
    {
      key: 'copy-connection',
      label: t('Copy Connection Info'),
      icon: <LinkOutlined />,
      onClick: async () => {
        const realKey = getCachedRealKey()
        if (!realKey) return
        const connStr = encodeChannelConnectionInfo(
          realKey,
          getServerAddress()
        )
        const ok = await copyToClipboard(connStr)
        if (ok) toast.success(t('Copied'))
      },
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: t('Delete'),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {
        setCurrentRow(apiKey)
        setOpen('delete')
      },
    },
  ]

  return (
    <div className='-ml-1.5 flex items-center gap-1'>
      <Tooltip title={toggleLabel}>
        <Button
          type='text'
          size='small'
          icon={
            isTogglingStatus ? (
              <LoadingOutlined spin />
            ) : (
              <PoweroffOutlined />
            )
          }
          onClick={handleToggleStatus}
          disabled={isTogglingStatus}
          aria-label={toggleLabel}
          className={cn(
            isEnabled
              ? 'text-destructive hover:text-destructive'
              : 'text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400'
          )}
        />
      </Tooltip>

      <Tooltip title={t('Edit')}>
        <Button
          type='text'
          size='small'
          icon={<EditOutlined />}
          onClick={() => {
            setCurrentRow(apiKey)
            setOpen('update')
          }}
          aria-label={t('Edit')}
        />
      </Tooltip>

      <Dropdown
        menu={{ items: menuItems }}
        trigger={['click']}
        onOpenChange={handleMenuOpenChange}
      >
        <Button
          type='text'
          size='small'
          icon={<MoreOutlined />}
          aria-label={t('Open menu')}
        />
      </Dropdown>
    </div>
  )
}
