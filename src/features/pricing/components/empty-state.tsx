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
import { SearchOutlined } from '@ant-design/icons'
import { Button, Empty } from 'antd'
import { useTranslation } from 'react-i18next'

export interface EmptyStateProps {
  searchQuery?: string
  hasActiveFilters: boolean
  onClearFilters: () => void
}

export function EmptyState(props: EmptyStateProps) {
  const { t } = useTranslation()
  const hasSearch = Boolean(props.searchQuery?.trim())

  return (
    <div
      style={{
        minHeight: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed var(--pricing-border)',
        borderRadius: 12,
        background: 'var(--pricing-panel)',
        padding: 24,
      }}
    >
      <Empty
        image={<SearchOutlined style={{ fontSize: 40, color: 'var(--pricing-faint)' }} />}
        description={
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {t('No models found')}
            </div>
            <div style={{ color: 'var(--pricing-muted)', fontSize: 14 }}>
              {hasSearch
                ? t(
                    'No results for "{{query}}". Try adjusting your search or filters.',
                    { query: props.searchQuery }
                  )
                : t('No models match your current filters.')}
            </div>
          </div>
        }
      >
        {(props.hasActiveFilters || hasSearch) && (
          <Button onClick={props.onClearFilters}>{t('Clear all filters')}</Button>
        )}
      </Empty>
    </div>
  )
}
