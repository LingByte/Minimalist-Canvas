export type CaptchaType = 'slider' | 'click' | 'image'

export interface CaptchaCharMarker {
  char: string
  x: number
  y: number
}

export interface CaptchaGenerateResult {
  id: string
  type: CaptchaType
  data: {
    trackWidth?: number
    width?: number
    height?: number
    length?: number
    targets?: string[]
    chars?: CaptchaCharMarker[]
    tolerance?: number
    image?: string
    background?: string
  }
  expires: string
}

export interface CaptchaProof {
  captchaId: string
  captchaType: CaptchaType
  captchaValue: number | Array<{ x: number; y: number }> | string
}

export function captchaTypeLabel(
  type: CaptchaType,
  t: (key: string) => string
): string {
  switch (type) {
    case 'slider':
      return t('Slider verification')
    case 'click':
      return t('Click verification')
    case 'image':
      return t('Image captcha')
    default:
      return t('Security verification')
  }
}

/** Serialize captcha proof for GET query params. */
export function captchaQueryParams(proof: CaptchaProof) {
  return {
    captchaId: proof.captchaId,
    captchaType: proof.captchaType,
    captchaValue:
      typeof proof.captchaValue === 'object'
        ? JSON.stringify(proof.captchaValue)
        : proof.captchaValue,
  }
}
