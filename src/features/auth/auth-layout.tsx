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
import { Link } from 'react-router-dom'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandIdentity } from '@/components/layout/components/brand-identity'
import { ThemeSwitch } from '@/components/theme-switch'
import { useSystemConfig } from '@/hooks/use-system-config'

import { AuthCarousel } from './components/auth-carousel'

export type AuthPageMode = 'sign-in' | 'sign-up'

type AuthLayoutProps = {
  children: React.ReactNode
  mode?: AuthPageMode
}

export function AuthLayout({ children, mode }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  const year = new Date().getFullYear()

  return (
    <div className='bg-background text-foreground flex h-svh overflow-hidden'>
      <div className='flex h-svh w-full shrink-0 flex-col overflow-hidden lg:w-[44%] xl:w-[42%]'>
        <header className='flex shrink-0 items-center justify-between gap-4 px-6 py-4 sm:px-10 lg:px-12'>
          <Link
            to='/'
            className='flex min-w-0 items-center transition-opacity hover:opacity-85'
          >
            <BrandIdentity
              logo={logo}
              name={systemName}
              size='md'
              loading={loading}
              showTagline={false}
            />
          </Link>

          <div className='flex shrink-0 items-center gap-2 sm:gap-3'>
            <Link
              to='/docs'
              className='text-muted-foreground hidden text-sm transition-colors hover:text-foreground sm:inline'
            >
              {t('Docs')}
            </Link>
            <LanguageSwitcher />
            <ThemeSwitch />
            {mode === 'sign-up' ? (
              <>
                <span className='text-muted-foreground hidden text-sm md:inline'>
                  {t('Already have an account?')}
                </span>
                <Link to='/sign-in'>
                  <Button size='small' className='h-8 rounded-lg'>
                    {t('Sign in')}
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        </header>

        <main className='flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain px-6 py-2 sm:px-10 lg:px-12 xl:px-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          <div className='mx-auto w-full max-w-[420px] py-2'>{children}</div>
        </main>

        <footer className='text-muted-foreground shrink-0 px-6 pb-4 text-xs sm:px-10 lg:px-12'>
          {t('auth.copyright', { name: systemName, year })}
        </footer>
      </div>

      <aside className='hidden h-svh min-w-0 shrink-0 flex-1 overflow-hidden lg:flex'>
        <AuthCarousel />
      </aside>
    </div>
  )
}
