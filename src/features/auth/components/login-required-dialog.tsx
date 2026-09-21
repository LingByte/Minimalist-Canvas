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
import { Modal } from 'antd'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { UserAuthForm } from '@/features/auth/sign-in/components/user-auth-form'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'
import { useLoginRequiredStore } from '@/stores/login-required-store'

export function LoginRequiredDialog() {
  const { t } = useTranslation()
  const open = useLoginRequiredStore((state) => state.open)
  const reason = useLoginRequiredStore((state) => state.reason)
  const closeLogin = useLoginRequiredStore((state) => state.closeLogin)
  const user = useAuthStore((state) => state.auth.user)
  const { status } = useStatus()

  useEffect(() => {
    if (open && user) closeLogin()
  }, [closeLogin, open, user])

  return (
    <Modal
      open={open && !user}
      onCancel={closeLogin}
      footer={null}
      destroyOnHidden
      width={440}
      centered
      title={reason === 'expired' ? t('Session expired!') : t('Sign in required')}
      styles={{ body: { paddingTop: 8 } }}
    >
      <p className='text-muted-foreground mb-4 text-sm'>
        {reason === 'expired'
          ? t('Please sign in again to continue.')
          : t('Please sign in to use cloud features.')}
      </p>
      <UserAuthForm
        onAuthenticated={closeLogin}
        redirectTo={`${window.location.pathname}${window.location.search}`}
      />
      {!status?.self_use_mode_enabled && status?.register_enabled !== false ? (
        <p className='text-muted-foreground mt-4 text-center text-sm'>
          {t("Don't have an account?")}{' '}
          <Link
            to='/sign-up'
            className='hover:text-primary font-medium underline underline-offset-4'
            onClick={closeLogin}
          >
            {t('Sign up')}
          </Link>
        </p>
      ) : null}
    </Modal>
  )
}
