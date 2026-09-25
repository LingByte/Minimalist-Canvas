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
import { useCallback, useRef, useState } from 'react'

import { CaptchaVerifyModal } from '@/components/captcha'
import type { CaptchaProof } from '@/components/captcha'

/**
 * Opens a puzzle captcha modal before running a protected auth action.
 */
export function useCaptchaGate() {
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<
    ((proof: CaptchaProof) => void | Promise<void>) | null
  >(null)
  const formSubmitRef = useRef(false)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const openGate = useCallback(
    (
      action: (proof: CaptchaProof) => void | Promise<void>,
      opts?: { formSubmit?: boolean }
    ) => {
      pendingRef.current = action
      formSubmitRef.current = Boolean(opts?.formSubmit)
      setOpen(true)
    },
    []
  )

  const handleClose = useCallback(() => {
    setOpen(false)
    pendingRef.current = null
    formSubmitRef.current = false
  }, [])

  const handleVerified = useCallback((proof: CaptchaProof) => {
    setOpen(false)
    const action = pendingRef.current
    const showLoading = formSubmitRef.current
    pendingRef.current = null
    formSubmitRef.current = false
    if (!action) return
    if (showLoading) setFormSubmitting(true)
    Promise.resolve(action(proof)).finally(() => {
      if (showLoading) setFormSubmitting(false)
    })
  }, [])

  const captchaModal = (
    <CaptchaVerifyModal
      open={open}
      onClose={handleClose}
      onVerified={handleVerified}
    />
  )

  return { openGate, captchaModal, formSubmitting }
}
