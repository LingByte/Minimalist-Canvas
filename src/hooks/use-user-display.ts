import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/** Local-first canvas: no authenticated user profile. */
export function useUserDisplay(_user?: unknown) {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      displayName: t('User'),
      secondaryText: '',
      initials: 'U',
      roleLabel: '',
    }),
    [t]
  )
}
