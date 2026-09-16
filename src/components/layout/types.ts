type BaseNavItem = {
  title: string
  badge?: string
  icon?: React.ElementType
  activeUrls?: string[]
  configUrls?: string[]
  permissions?: string[]
  adminOnly?: boolean
}

export type NavLink = BaseNavItem & {
  url: string
  items?: never
  type?: never
}

export type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: string })[]
  url?: never
  type?: never
}

export type NavItem = NavCollapsible | NavLink

export type NavGroup = {
  id?: string
  title: string
  items: NavItem[]
}

export type TopNavLink = {
  title: string
  href: string
  isActive?: boolean
  disabled?: boolean
  requiresAuth?: boolean
  external?: boolean
  /** Pill-style accent link, e.g. external Infinite Canvas entry */
  highlight?: boolean
}
