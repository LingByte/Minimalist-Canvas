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
import imageCompression from 'browser-image-compression'

export const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024

export type CompressImageOptions = {
  quality?: number
  maxWidthOrHeight?: number
  maxSizeMB?: number
}

const defaults: Required<CompressImageOptions> = {
  quality: 0.82,
  maxWidthOrHeight: 512,
  maxSizeMB: 2,
}

/** Compress an image locally. Used when the source exceeds the upload cap. */
export async function compressImageFile(
  input: File | Blob,
  options?: CompressImageOptions
): Promise<File> {
  const quality = options?.quality ?? defaults.quality
  const maxWidthOrHeight = options?.maxWidthOrHeight ?? defaults.maxWidthOrHeight
  const maxSizeMB = options?.maxSizeMB ?? defaults.maxSizeMB
  const file =
    input instanceof File
      ? input
      : new File(
          [input],
          input.type.includes('png') ? 'image.png' : 'image.jpg',
          { type: input.type || 'image/jpeg' }
        )

  const compressed = await imageCompression(file, {
    maxSizeMB: Math.max(0.1, maxSizeMB),
    maxWidthOrHeight: Math.max(128, maxWidthOrHeight),
    useWebWorker: true,
    initialQuality: Math.min(1, Math.max(0.1, quality)),
    fileType: file.type.includes('png') ? 'image/png' : undefined,
  })

  if (compressed instanceof File) return compressed
  return new File([compressed as Blob], file.name || 'avatar.jpg', {
    type: (compressed as Blob).type || file.type || 'image/jpeg',
  })
}

/** Ensure avatar file is ≤ 2MB, compressing when needed. */
export async function prepareAvatarUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('INVALID_IMAGE_TYPE')
  }
  if (file.size <= MAX_AVATAR_UPLOAD_BYTES) return file
  const compressed = await compressImageFile(file, {
    maxSizeMB: 1.8,
    maxWidthOrHeight: 768,
    quality: 0.8,
  })
  if (compressed.size > MAX_AVATAR_UPLOAD_BYTES) {
    throw new Error('AVATAR_TOO_LARGE')
  }
  return compressed
}
