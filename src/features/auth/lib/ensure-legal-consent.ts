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
import type { TFunction } from 'i18next'

/** Prompt for legal agreement when the checkbox is unchecked; auto-checks on confirm. */
export function ensureLegalConsent(options: {
  requires: boolean
  agreed: boolean
  setAgreed: (value: boolean) => void
  t: TFunction
}): Promise<boolean> {
  if (!options.requires || options.agreed) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    Modal.confirm({
      title: options.t('Agree to the legal terms?'),
      content: options.t(
        'Please confirm that you have read and agree to the User Agreement, Privacy Policy, and Acceptable Use Policy.'
      ),
      okText: options.t('I agree'),
      cancelText: options.t('Cancel'),
      centered: true,
      onOk: () => {
        options.setAgreed(true)
        resolve(true)
      },
      onCancel: () => resolve(false),
    })
  })
}
