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

export type HomeCampaign = {
  id: string
  title: string
  description: string
  cta_text: string
  image_url: string
  /** The image already carries its own title and copy, so no overlay is drawn. */
  poster: boolean
  link: string
  enabled: boolean
  start_at: string
  end_at: string
  sort: number
}

/** A campaign page. `start_at` / `end_at` are unix seconds; 0 means unbounded. */
export type Campaign = {
  id: number
  slug: string
  title: string
  summary: string
  cover_url: string
  /** HTML body; empty in list responses. */
  content: string
  enabled: boolean
  start_at: number
  end_at: number
  sort: number
  created_time: number
  updated_time: number
}

export type CampaignInput = Omit<
  Campaign,
  'id' | 'created_time' | 'updated_time'
>
