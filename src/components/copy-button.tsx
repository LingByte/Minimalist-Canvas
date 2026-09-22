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
import { Button, Tooltip } from 'antd'
import { Check, Copy } from 'lucide-react'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  value: string
  children?: ReactNode
  className?: string
  iconClassName?: string
  variant?: 'ghost' | 'outline' | 'default' | 'secondary' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  tooltip?: string
  successTooltip?: string
  'aria-label'?: string
}

function mapButtonType(
  variant: CopyButtonProps['variant']
): 'primary' | 'default' | 'text' | 'dashed' | 'link' {
  if (variant === 'default') return 'primary'
  if (variant === 'ghost' || variant === 'secondary') return 'text'
  if (variant === 'outline') return 'default'
  if (variant === 'destructive') return 'primary'
  return 'text'
}

export function CopyButton({
  value,
  children,
  className,
  iconClassName,
  variant = 'ghost',
  size = 'icon',
  tooltip,
  successTooltip,
  'aria-label': ariaLabel,
}: CopyButtonProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const isCopied = copiedText === value
  const resolvedTooltip = tooltip ?? t('Copy to clipboard')
  const resolvedSuccessTooltip = successTooltip ?? t('Copied!')
  const resolvedAriaLabel = ariaLabel ?? resolvedTooltip
  const copiedAriaLabel = t('Copied')

  const button = (
    <Button
      type={mapButtonType(variant)}
      danger={variant === 'destructive'}
      size={size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'middle'}
      className={cn(
        'shrink-0',
        size === 'icon' && 'inline-flex h-8 w-8 items-center justify-center p-0',
        className
      )}
      onClick={() => copyToClipboard(value)}
      aria-label={isCopied ? copiedAriaLabel : resolvedAriaLabel}
      icon={
        isCopied ? (
          <Check className={cn('text-success size-4', iconClassName)} />
        ) : (
          <Copy className={cn('size-4', iconClassName)} />
        )
      }
    >
      {children}
    </Button>
  )

  if (tooltip || successTooltip) {
    return (
      <Tooltip title={isCopied ? resolvedSuccessTooltip : resolvedTooltip}>
        {button}
      </Tooltip>
    )
  }

  return button
}
