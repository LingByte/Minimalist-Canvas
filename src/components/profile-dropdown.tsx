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
import { Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { User, KeyRound, ListTodo, LogOut, RefreshCw, ScrollText, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { UserAvatar } from '@/components/user-avatar'
import useDialogState from '@/hooks/use-dialog'
import { useUserDisplay } from '@/hooks/use-user-display'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { appVersion, checkForAppUpdate } from '@canvas/services/app-updater'

export function ProfileDropdown() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const { displayName, roleLabel } = useUserDisplay(user)
  const avatarName = user?.username || displayName
  const avatarUrl = user?.avatar_url ?? null
  const [quota, setQuota] = useState<number | undefined>(user?.quota)
  const [version, setVersion] = useState<string | null>(null)
  const balance = formatQuota(quota ?? user?.quota ?? 0)

  useEffect(() => {
    void appVersion().then(setVersion)
  }, [])

  // Refresh the balance each time the dropdown opens.
  const refreshQuota = () => {
    getSelf()
      .then((res) => {
        if (res?.success && res.data?.quota !== undefined) {
          setQuota(res.data.quota as number)
        }
      })
      .catch(() => {})
  }

  const items: MenuProps['items'] = useMemo(() => {
    const menu: MenuProps['items'] = [
      {
        key: 'header',
        label: (
          <div className='flex items-center gap-2 py-1'>
            <UserAvatar size={32} src={avatarUrl} name={avatarName} />
            <div className='flex flex-1 flex-col gap-0.5 overflow-hidden'>
              <p className='text-foreground truncate text-sm font-medium'>
                {displayName}
              </p>
              <div className='flex items-center gap-1.5'>
                <span className='text-muted-foreground text-xs'>
                  {roleLabel}
                </span>
                {user?.group && (
                  <>
                    <span className='text-muted-foreground text-xs'>·</span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {String(user.group)}
                    </span>
                  </>
                )}
              </div>
              <div className='flex items-center gap-1 text-xs'>
                <Wallet className='size-3' />
                <span className='font-medium tabular-nums'>{balance}</span>
              </div>
            </div>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'wallet',
        icon: <Wallet className='size-4' />,
        label: (
          <span className='flex items-center justify-between gap-4'>
            <span>{t('Wallet')}</span>
            <span className='text-muted-foreground text-xs font-medium tabular-nums'>
              {balance}
            </span>
          </span>
        ),
        onClick: () => navigate('/profile'),
      },
      {
        key: 'profile',
        icon: <User className='size-4' />,
        label: t('Profile'),
        onClick: () => navigate('/profile'),
      },
      {
        key: 'keys',
        icon: <KeyRound className='size-4' />,
        label: t('API Keys'),
        onClick: () => navigate('/keys'),
      },
      {
        key: 'common-logs',
        icon: <ScrollText className='size-4' />,
        label: t('Common Logs'),
        onClick: () => navigate('/usage-logs/common'),
      },
      {
        key: 'task-logs',
        icon: <ListTodo className='size-4' />,
        label: t('Task Logs'),
        onClick: () => navigate('/usage-logs/task'),
      },
    ]

    if (version) {
      menu.push({
        key: 'check-update',
        icon: <RefreshCw className='size-4' />,
        label: (
          <span className='flex items-center justify-between gap-4'>
            <span>{t('Check for Updates')}</span>
            <span className='text-muted-foreground text-xs font-medium tabular-nums'>
              v{version}
            </span>
          </span>
        ),
        onClick: () => void checkForAppUpdate({ manual: true }),
      })
    }

    menu.push(
      { type: 'divider' },
      {
        key: 'sign-out',
        icon: <LogOut className='size-4' />,
        label: t('Sign out'),
        danger: true,
        onClick: () => setOpen(true),
      }
    )

    return menu
  }, [
    avatarName,
    avatarUrl,
    balance,
    displayName,
    navigate,
    roleLabel,
    setOpen,
    t,
    user,
    version,
  ])

  if (!user) {
    return null
  }

  return (
    <>
      <Dropdown
        menu={{ items }}
        trigger={['click']}
        placement='bottomRight'
        onOpenChange={(open) => {
          if (open) refreshQuota()
        }}
      >
        <Button
          type='text'
          className='relative inline-flex size-6 shrink-0 items-center justify-center overflow-visible p-0'
          style={{ width: 24, height: 24, minWidth: 24 }}
        >
          <UserAvatar
            size={24}
            src={avatarUrl}
            name={avatarName}
            className='text-[11px]'
          />
        </Button>
      </Dropdown>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
