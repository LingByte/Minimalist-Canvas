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
export type GenerationAssetFile = {
  url?: string
  kind?: string
  mirror_stage?: string
  mirror_error?: string
  backup_url?: string
  upstream_url?: string
  storage_key?: string
  mime_type?: string
  width?: number
  height?: number
  bytes?: number
  duration_ms?: number
  bitrate_kbps?: number
  video_codec?: string
  frame_rate?: string
  media?: GenerationAssetMedia
  poster_url?: string
}

export type GenerationAssetMedia = {
  format?: GenerationAssetMediaFormat
  video?: GenerationAssetMediaStream
  audio?: GenerationAssetMediaStream
}

export type GenerationAssetMediaFormat = {
  name?: string
  long_name?: string
  duration?: number
  size?: number
  bit_rate?: number
  nb_streams?: number
  encoder?: string
}

export type GenerationAssetMediaStream = {
  codec_name?: string
  profile?: string
  width?: number
  height?: number
  coded_width?: number
  coded_height?: number
  display_aspect_ratio?: string
  pix_fmt?: string
  level?: number
  frame_rate?: string
  avg_frame_rate?: string
  duration?: number
  bit_rate?: number
  nb_frames?: number
  sample_rate?: number
  channels?: number
  channel_layout?: string
  sample_fmt?: string
  encoder?: string
  has_b_frames?: number
}

export type GenerationAssetAdminItem = {
  id: number
  user_id: number
  username?: string
  kind: string
  source: string
  title: string
  prompt: string
  model: string
  status: string
  task_id?: string
  error?: string
  config: Record<string, unknown>
  assets: GenerationAssetFile[]
  created_at: number
  updated_at: number
}

export type GenerationAssetAdminPage = {
  page: number
  page_size: number
  total: number
  items: GenerationAssetAdminItem[]
}
