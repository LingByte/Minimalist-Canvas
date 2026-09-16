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
import { Avatar, Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { User, Wallet, LogOut, Settings, ExternalLink } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import useDialogState from '@/hooks/use-dialog'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useUserDisplay } from '@/hooks/use-user-display'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { openSitePage } from '@/lib/open-external'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const avatarFallbackClassName = 'font-semibold text-white'

export function ProfileDropdown() {
  const { t } = useTranslation()
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const { displayName, roleLabel } = useUserDisplay(user)
  const isSuperAdmin = user?.role === ROLE.SUPER_ADMIN
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')
  const avatarName = user?.username || displayName
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = useMemo(
    () => getUserAvatarStyle(avatarName),
    [avatarName]
  )

  const items: MenuProps['items'] = useMemo(() => {
    const menu: MenuProps['items'] = [
      {
        key: 'header',
        label: (
          <div className='flex items-center gap-2 py-1'>
            <Avatar
              size={32}
              style={avatarFallbackStyle}
              className={avatarFallbackClassName}
            >
              {avatarFallback}
            </Avatar>
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
            </div>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'profile',
        icon: <User className='size-4' />,
        label: t('Profile'),
        onClick: () => void openSitePage('/profile'),
      },
      {
        key: 'console',
        icon: <ExternalLink className='size-4' />,
        label: t('Console'),
        onClick: () => void openSitePage('/console'),
      },
    ]

    if (isWalletVisible) {
      menu.push({
        key: 'wallet',
        icon: <Wallet className='size-4' />,
        label: t('Wallet'),
        onClick: () => void openSitePage('/wallet'),
      })
    }

    if (isSuperAdmin) {
      menu.push({
        key: 'settings',
        icon: <Settings className='size-4' />,
        label: t('System Settings'),
        onClick: () => void openSitePage('/system-settings/site/system-info'),
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
    avatarFallback,
    avatarFallbackStyle,
    displayName,
    isSuperAdmin,
    isWalletVisible,
    roleLabel,
    setOpen,
    t,
    user,
  ])

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']} placement='bottomRight'>
        <Button
          type='text'
          className='relative inline-flex size-6 shrink-0 items-center justify-center overflow-visible p-0'
          style={{ width: 24, height: 24, minWidth: 24 }}
        >
          <Avatar
            size={24}
            style={{
              ...avatarFallbackStyle,
              flexShrink: 0,
              width: 24,
              height: 24,
              minWidth: 24,
              lineHeight: '24px',
            }}
            className={`${avatarFallbackClassName} shrink-0 text-[11px]`}
          >
            {avatarFallback}
          </Avatar>
        </Button>
      </Dropdown>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
